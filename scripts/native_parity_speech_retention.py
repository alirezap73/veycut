"""Prepare/analyse optional GitHub-only ASR retention measurements.

Native/Web MP4s and source PCM are decoded only on GitHub. Author VTT cues
fully inside the selected original window form a conservative partial reference;
boundary cues are reported separately, never asserted to be verbatim ground truth.
"""
import argparse
import array
import hashlib
import html
import json
import math
import re
import subprocess
from pathlib import Path

ROOT = Path('output/native-parity')
DIGEST = '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f'


def tokens(text):
    return re.findall(r'[^\W_]+', text.casefold(), re.UNICODE)


def lcs(reference, recognized):
    row = [0] * (len(recognized) + 1)
    for expected in reference:
        previous = 0
        for index, actual in enumerate(recognized, 1):
            old = row[index]
            row[index] = previous + 1 if expected == actual else max(row[index], row[index-1])
            previous = old
    return row[-1]


def stamp(value):
    parts = value.replace(',', '.').split(':')
    assert len(parts) in (2, 3)
    return sum(float(part) * 60**index for index, part in enumerate(reversed(parts)))


def author_reference(path, first, seconds):
    text = path.read_text(encoding='utf-8-sig')
    assert text.startswith('WEBVTT') and len(text) <= 100000
    included, boundary = [], []
    for block in re.split(r'\n\s*\n', text.replace('\r\n', '\n')):
        lines = block.strip().splitlines()
        line = next((index for index, item in enumerate(lines) if ' --> ' in item), None)
        if line is None:
            continue
        a, b = lines[line].split(' --> ')
        start, end = stamp(a), stamp(b.split()[0])
        words = html.unescape(re.sub(r'<[^>]*>', '', ' '.join(lines[line+1:])))
        cue = dict(start=start, end=end, text=words)
        if start >= first and end <= first+seconds:
            included.append(cue)
        elif end > first and start < first+seconds:
            boundary.append(cue)
    return dict(completeCues=included, boundaryCuesExcluded=boundary,
                text=' '.join(cue['text'] for cue in included),
                scope='Author supplied captions, complete cues inside source window only; not independent human transcription')


def voiced(path, seconds):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-t', str(seconds), '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], timeout=90)
    pcm = array.array('f'); pcm.frombytes(raw)
    assert len(pcm) >= math.floor(seconds*8000)-480
    assert all(math.isfinite(v) for v in pcm)
    energy = [math.sqrt(sum(v*v for v in pcm[index:index+800])/800) for index in range(0, len(pcm)-799, 800)]
    active = sum(value > .005 for value in energy)*.1
    # This is an energy proxy, not a model VAD or proof of human speech.
    return dict(nonSilentSeconds100msRMS=active, rmsThreshold=.005,
                seconds=len(pcm)/8000, sufficient=active >= 1,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest())


def prepare():
    cases = json.loads((ROOT/'audio-cases.json').read_text())
    selected = [case for case in cases if case['name'].startswith('speech-')]
    assert len(selected) >= 2, 'Real narration cases are required for optional speech retention'
    probe = json.loads((ROOT/'speech-source-probe.json').read_text())
    metadata = {fixture['id']: fixture for fixture in probe['fixtures']}
    requests, sources, measurements = [], {}, {}
    for case in selected:
        source = Path(case['source'])
        fixture = source.name.removesuffix('-speech-derived.wav')
        derivative = metadata[fixture]['speechDerivative']
        assert derivative['seconds']==20 and derivative['sourceStart']==10.137931
        assert hashlib.sha256(source.read_bytes()).hexdigest()==derivative['sha256']
        if fixture not in sources:
            reference = author_reference(Path('output/fixtures')/(fixture+'.vtt'), derivative['sourceStart'], 20)
            sources[fixture] = dict(source=str(source), reference=reference)
            requests.append(dict(id=fixture, kind='source', path=str(source), seconds=20))
            measurements[fixture] = voiced(source, 20)
        duration = json.loads((ROOT/(case['name']+'.json')).read_text())['clips'][0]['duration']
        for kind in ['native', 'web']:
            path = ROOT/f"{kind}-{case['name']}.mp4"
            request_id = kind+'-'+case['name']
            requests.append(dict(id=request_id, kind=kind, path=str(path), seconds=duration))
            measurements[request_id] = voiced(path, duration)
        case['fixtureId'] = fixture
    manifest = dict(cases=selected, sources=sources, requests=requests,
                    measurements=measurements, model='tiny.en', modelSHA256=DIGEST)
    (ROOT/'speech-retention-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))


def analyse():
    manifest = json.loads((ROOT/'speech-retention-manifest.json').read_text())
    transcript = json.loads((ROOT/'speech-transcripts.json').read_text())
    assert transcript['modelSHA256']==DIGEST and transcript['model']=='tiny.en'
    assert transcript['nativeSource']=='9082f2686b7896e49561d2c531fd3ec105e456eb'
    recognized = {entry['id']: tokens(' '.join(segment['text'] for segment in entry['segments'])) for entry in transcript['results']}
    assert set(recognized)=={entry['id'] for entry in manifest['requests']}
    sources, results, invalid = {}, [], []
    for fixture, source in manifest['sources'].items():
        words = recognized[fixture]; author = tokens(source['reference']['text'])
        author_retention = lcs(author, words)/len(author) if author else None
        valid = (manifest['measurements'][fixture]['sufficient'] and len(words)>=10
                 and len(set(words))>=6 and len(author)>=6 and author_retention>=.4)
        sources[fixture] = dict(recognizedWordCount=len(words), uniqueRecognizedWords=len(set(words)),
                                authorCompleteCueWordCount=len(author), sourceAuthorWordRetention=author_retention,
                                valid=valid, criteria=dict(minimumRecognizedWords=10, minimumUniqueWords=6,
                                                          minimumAuthorWords=6, minimumAuthorRetention=.4,
                                                          minimumNonSilentSeconds=1))
        if not valid: invalid.append(fixture)
    for case in manifest['cases']:
        fixture = case['fixtureId']; source = recognized[fixture]
        reference = tokens(manifest['sources'][fixture]['reference']['text'])
        row = dict(name=case['name'], fixtureId=fixture, sourceValid=sources[fixture]['valid'], outputs={})
        for kind in ['native', 'web']:
            request_id = kind+'-'+case['name']; words = recognized[request_id]
            row['outputs'][kind] = dict(recognizedWordCount=len(words),
                sourceWordRetention=lcs(source, words)/max(1,len(source)),
                authorWordRetention=lcs(reference, words)/max(1,len(reference)),
                nonSilent=manifest['measurements'][request_id]['sufficient'])
        native, web = row['outputs']['native'], row['outputs']['web']
        row['criteria'] = dict(minimumSourceWordRetention=.65, minimumOutputWords=6,
                               maximumWebRetentionLossAgainstNative=.15)
        row['passed'] = bool(row['sourceValid'] and all(out['nonSilent'] and out['recognizedWordCount']>=6
                            and out['sourceWordRetention']>=.65 for out in [native,web])
                            and web['sourceWordRetention']>=native['sourceWordRetention']-.15)
        results.append(row)
    report = dict(nativeSource=transcript['nativeSource'], model='tiny.en', modelSHA256=DIGEST, sources=sources, results=results,
                  status='invalid source/reference evidence' if invalid else 'passed' if all(row['passed'] for row in results) else 'retention check failed',
                  passed=not invalid and all(row['passed'] for row in results),
                  scope='Local existing native ASR measures recognized word sequence retention only; not human listening, full intelligibility, semantic fidelity or native/Web quality equivalence')
    (ROOT/'speech-retention-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    assert report['passed'], report['status']


if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('mode', choices=['prepare','analyse'])
    mode=parser.parse_args().mode
    prepare() if mode=='prepare' else analyse()
