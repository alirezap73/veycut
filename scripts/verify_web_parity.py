"""Decode runner-produced videos; fail on missing mixed layers or source audio."""
import array
import json
import math
import subprocess
from pathlib import Path

folder = Path('output/playwright')
report = json.loads((folder / 'parity-report.json').read_text())
assert report['status'] == 'passed', report
assert report['engine'] == 'wasm' and report['clipCount'] == 9
project = json.loads((folder / 'parity-project.json').read_text())
assert project == json.loads((folder / 'parity-after-export.json').read_text())
assert 'blob:' not in json.dumps(project)
assert 'WEBVTT' in (folder / 'parity-subtitles.vtt').read_text()
assert 'Parity subtitle سلام' in (folder / 'parity-subtitles.srt').read_text()

def run(args):
    return subprocess.run(args, check=True, timeout=90, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout

results = []
for item in [report['webm'], report['mp4']]:
    if not item['downloaded']:
        assert item['format'] == 'mp4' and item['status'] == 'unsupported'
        results.append(item)
        continue
    path = Path(item['path'])
    assert 0 < path.stat().st_size <= 256 * 1024 * 1024
    probe = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))
    videos = [s for s in probe['streams'] if s['codec_type'] == 'video']
    audios = [s for s in probe['streams'] if s['codec_type'] == 'audio']
    assert len(videos) == len(audios) == 1, probe
    print(json.dumps({'format':item['format'],'videoCodec':videos[0]['codec_name'],'audioCodec':audios[0]['codec_name']}),flush=True)
    assert (videos[0]['width'], videos[0]['height']) == (360, 640)
    if item['format'] == 'webm':
        assert videos[0]['codec_name'] in ['vp8', 'vp9'] and audios[0]['codec_name'] == 'opus'
    else:
        expected_audio = 'opus' if 'opus' in item['mime'].lower() else 'aac'
        assert videos[0]['codec_name'] == 'h264' and audios[0]['codec_name'] == expected_audio
        assert 'mp4' in probe['format']['format_name']
    run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'])
    frames = json.loads(run(['ffprobe', '-v', 'error', '-show_frames', '-show_entries', 'frame=media_type,best_effort_timestamp_time,pkt_duration_time', '-of', 'json', str(path)]))['frames']
    times = [float(f['best_effort_timestamp_time']) for f in frames if f['media_type'] == 'video']
    metrics={"format":item["format"],"frameCount":len(times),"firstPts":times[:3],"lastPts":times[-3:],"ordered":times==sorted(times)}
    print(json.dumps(metrics),flush=True)
    assert times == sorted(times) and len(times) >= 35, metrics
    assert 1.75 <= max(times) <= 2.4, max(times)
    pcm = array.array('h')
    pcm.frombytes(run(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-']))
    samples = [n / 32768 for n in pcm[round(1.5 * 8000):round(1.7 * 8000)]]
    assert len(samples) == 1600
    rms = math.sqrt(sum(n*n for n in samples) / len(samples))
    amplitude = 2 * abs(complex(sum(n*math.cos(2*math.pi*880*i/8000) for i,n in enumerate(samples)), sum(n*math.sin(2*math.pi*880*i/8000) for i,n in enumerate(samples)))) / len(samples)
    assert .005 < rms < .08, ('Separate audio clip gain or mixing failed', rms)
    assert amplitude > .005, ('880 Hz imported audio missing', amplitude)
    pixels = run(['ffmpeg', '-v', 'error', '-ss', '1.5', '-i', str(path), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    assert len(pixels) == 360 * 640 * 3
    # The separate transformed/cropped, animated still layer must remain
    # visible above the lower video track and beneath native text.
    red = sum(pixels[(y*360+x)*3] >= 80 and pixels[(y*360+x)*3] > 2*max(pixels[(y*360+x)*3+1:(y*360+x)*3+3])+10
              for y in range(90,390) for x in range(30,345))
    assert red > 15000, ('Transformed still layer absent from recorded pixels', red)
    title_pixels = sum(min(pixels[(y*360+x)*3:(y*360+x)*3+3]) >= 160
                       for y in range(410,490) for x in range(15,345))
    assert title_pixels > 60, ('Native title absent above image layer', title_pixels)
    results.append({'format': item['format'], 'fullDecode': True, 'dimensions': [360,640], 'videoFrames': len(times), 'lastVideoPts': max(times), 'audioRms': rms, 'audio880HzAmplitude': amplitude, 'transformedImageRedPixels': red, 'nativeTitleBrightPixels': title_pixels, 'source': item['path']})
(folder / 'parity-decoder-report.json').write_text(json.dumps({'status':'passed','results':results,'scope':'Short synthetic SDR fixture; not frame-accurate or full native parity.'}, indent=2))
print(json.dumps(results))
