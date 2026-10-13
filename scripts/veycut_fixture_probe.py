"""Download and probe byte-identical owner-published fixtures ONLY on GitHub.

No remux, transcode, synthetic frame timing, or filename-based VFR classification.
The derived narration WAV is explicitly a test derivative, never a camera input.
"""
import argparse, hashlib, json, os, struct, subprocess, urllib.request
from collections import Counter
from fractions import Fraction
from pathlib import Path


def run(args, timeout=180):
    p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if p.returncode:
        raise RuntimeError(p.stderr.decode(errors='replace')[-6000:])
    return p.stdout


def fetch(url, target, max_bytes, expected_sha=None, expected_size=None):
    sha = hashlib.sha256()
    total = 0
    with urllib.request.urlopen(url, timeout=90) as response, target.open('wb') as f:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > max_bytes:
                raise RuntimeError('Fixture exceeded its declared download budget')
            sha.update(chunk)
            f.write(chunk)
    digest = sha.hexdigest()
    if expected_size is not None and total != expected_size:
        raise RuntimeError(f'Fixture size mismatch: {total} != {expected_size}')
    if expected_sha and digest != expected_sha:
        raise RuntimeError(f'Fixture SHA-256 mismatch: {digest}')
    return {'bytes': total, 'sha256': digest, 'url': url}


def mov_atoms(path):
    """Read atom headers/edit lists without loading mdat or changing input bytes."""
    lists = []
    with path.open('rb') as f:
        def walk(begin, end, prefix='', depth=0):
            if depth > 8:
                raise RuntimeError('Excessive MOV atom nesting')
            at = begin
            while at + 8 <= end:
                f.seek(at)
                size, kind = struct.unpack('>I4s', f.read(8))
                header = 8
                if size == 1:
                    size = struct.unpack('>Q', f.read(8))[0]
                    header = 16
                if size == 0:
                    size = end - at
                if size < header or at + size > end:
                    raise RuntimeError('Invalid MOV atom bounds')
                label = prefix + '/' + kind.decode('ascii', errors='replace')
                if kind in (b'moov', b'trak', b'edts', b'mdia', b'minf', b'stbl'):
                    walk(at + header, at + size, label, depth + 1)
                elif kind == b'elst':
                    f.seek(at + header)
                    data = f.read(min(size - header, 65536))
                    version = data[0]
                    count = struct.unpack('>I', data[4:8])[0]
                    width = 20 if version == 1 else 12
                    if version not in (0, 1) or count > 1000 or 8 + width * count > len(data):
                        raise RuntimeError('Invalid or oversized edit list')
                    entries = []
                    for i in range(count):
                        start = 8 + i * width
                        segment, media, integer, fraction = struct.unpack('>Qqhh' if version else '>Iihh', data[start:start + width])
                        entries.append({'segmentDurationTicks': segment, 'mediaTimeTicks': media, 'mediaRateInteger': integer, 'mediaRateFraction': fraction})
                    lists.append({'atom': label, 'version': version, 'entries': entries})
                at += size
        walk(0, path.stat().st_size)
    return lists


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('Media download/probing is restricted to GitHub Actions for this task.')
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', default='docs/evidence/fixture-sources.json')
    parser.add_argument('--output', default='output/fixtures')
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    root = Path(args.output)
    root.mkdir(parents=True, exist_ok=True)
    base = manifest['sourcePage'] + '/resolve/' + manifest['revision'] + '/'
    fetch(base + 'README.md', root / 'SOURCE-README.md', 100000)
    fetch(base + 'metadata.csv', root / 'SOURCE-metadata.csv', 100000)
    result = {'schema': 1, 'sourceRevision': manifest['revision'], 'license': manifest['license'], 'attribution': manifest['attribution'], 'inputsTranscoded': False, 'fixtures': []}
    for fixture in manifest['fixtures']:
        source = root / fixture['file']
        integrity = fetch(base + fixture['path'], source, fixture['bytes'], fixture['sha256'], fixture['bytes'])
        fetch(base + fixture['captionPath'], root / (fixture['id'] + '.vtt'), 100000)
        metadata = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(source)]))
        streams = metadata['streams']
        video = next(s for s in streams if s['codec_type'] == 'video')
        audio = next(s for s in streams if s['codec_type'] == 'audio')
        assert video['codec_name'] == fixture['requiredVideoCodec'], video['codec_name']
        assert audio['codec_name'] == fixture['requiredAudioCodec'], audio['codec_name']
        # Packet timestamps cover the ENTIRE unchanged original; no image decode is needed here.
        packets = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts,dts,duration,flags', '-of', 'json', str(source)]))['packets']
        pts = sorted(int(p['pts']) for p in packets if 'pts' in p)
        assert len(pts) >= 100 and len(set(pts)) == len(pts)
        delta = [b - a for a, b in zip(pts, pts[1:])]
        counts = Counter(delta)
        dominant = counts.most_common(1)[0][0]
        # 1-tick rounding of rational CFR is NOT counted as VFR. Require material >1% interval variation.
        tolerance = max(1, abs(dominant) * .01)
        material = {d: n for d, n in counts.items() if abs(d - dominant) > tolerance}
        material_frames = sum(material.values())
        vfr = material_frames >= max(3, len(delta) * .001)
        timebase = Fraction(video['time_base'])
        key_times = [float(int(p['pts']) * timebase) for p in packets if 'pts' in p and 'K' in p.get('flags', '')]
        trim = fixture['testTrim']['in']
        nearest = min(abs(t - trim) for t in key_times)
        assert nearest > .001, 'Trim accidentally landed on a keyframe'
        # Full decode of the bounded selected region; originals themselves remain untouched.
        run(['ffmpeg', '-v', 'error', '-xerror', '-threads', '1', '-ss', '0', '-i', str(source), '-t', '25', '-f', 'null', '-'])
        # Clearly named/recorded derivative for real-human speech DSP tests, not camera-format proof.
        speech = root / (fixture['id'] + '-speech-derived.wav')
        run(['ffmpeg', '-v', 'error', '-threads', '1', '-ss', '10.137931', '-i', str(source), '-t', '20', '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', '-y', str(speech)])
        entry = {'id': fixture['id'], 'integrity': integrity, 'metadata': metadata, 'editLists': mov_atoms(source), 'packetTiming': {'packetCount': len(pts), 'timeBase': video['time_base'], 'deltaTickCounts': dict(counts), 'materialDeltaTickCounts': material, 'materialIntervalCount': material_frames, 'measuredVariableTiming': vfr, 'criterion': 'At least max(3,0.1% intervals) differ from dominant PTS interval by more than max(1 tick,1%); rational CFR rounding excluded', 'firstPTSSeconds': float(pts[0] * timebase), 'lastPTSSeconds': float(pts[-1] * timebase)}, 'trimDistanceToNearestKeyframeSeconds': nearest, 'decodedInputRegionSeconds': 25, 'speechDerivative': {'file': speech.name, 'sourceStart': 10.137931, 'seconds': 20, 'sha256': hashlib.file_digest(speech.open('rb'), 'sha256').hexdigest(), 'modifications': 'Audio-only decoded PCM, stereo 48kHz; no model, no synthesized speech'}, 'scope': 'Source integrity, timing and bounded decode only; not application output, speech quality, or native/Web equivalence.'}
        result['fixtures'].append(entry)
        (root / 'probe-report.json').write_text(json.dumps(result, indent=2))
        print(json.dumps({'id': fixture['id'], 'sha256': integrity['sha256'], 'measuredVariableTiming': vfr, 'materialIntervalCount': material_frames, 'editListCount': len(entry['editLists'])}), flush=True)
    result['cameraVFRVerified'] = any(f['packetTiming']['measuredVariableTiming'] for f in result['fixtures'])
    (root / 'probe-report.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'status': 'probe complete', 'cameraVFRVerified': result['cameraVFRVerified'], 'totalInputBytes': sum(f['integrity']['bytes'] for f in result['fixtures'])}))


if __name__ == '__main__':
    main()
