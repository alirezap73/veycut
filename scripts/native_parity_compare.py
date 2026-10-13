"""Decode both actual exports and fail on material visual/geometry differences.

FFmpeg is a measurement decoder only. Native reference pixels originate in the
pinned app exporter on Mac/Metal, not an FFmpeg reconstruction of the edit.
"""
import json
import os
import subprocess
from pathlib import Path

import numpy as np

root = Path('output/native-parity')
cases = json.loads((root / 'cases.json').read_text())
native = json.loads((root / 'native-report.json').read_text())
assert native['nativeSource'] == '9082f2686b7896e49561d2c531fd3ec105e456eb'
browser = json.loads((root / 'browser-report.json').read_text())
assert [row['name'] for row in browser['results']] == [row['name'] for row in cases]


def decode(path):
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'], check=True, timeout=60)
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-of', 'json', str(path)], timeout=30))
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    assert (video['width'], video['height'], int(video['nb_read_frames'])) == (640, 360, 24), str(path)
    data = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', '0.5', '-i', str(path), '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], timeout=30)
    assert len(data) == 640 * 360 * 3
    return np.frombuffer(data, np.uint8).reshape(360, 640, 3).astype(np.float32)


images = {(kind, case['name']): decode(root / f"{kind}-{case['name']}.mp4") for case in cases for kind in ['native', 'web']}
results = []
for case in cases:
    name = case['name']
    a, b = images['native', name], images['web', name]
    delta = np.abs(a-b)
    row = dict(name=name, meanAbsoluteRGB=float(delta.mean()), p99RGB=float(np.quantile(delta, .99)))
    if case['text'] is None:
        # Fixed a priori tolerance for encoding/matrix/8-bit rounding; never
        # increased in response to a failing effect.
        row['criteria'] = dict(meanAbsoluteRGB=8, p99RGB=24)
        row['passed'] = row['meanAbsoluteRGB'] <= 8 and row['p99RGB'] <= 24
    else:
        masks = [np.max(np.abs(images[kind, name]-images[kind, 'identity']), axis=2)>24 for kind in ['native', 'web']]
        boxes = []
        for mask in masks:
            y, x = np.where(mask)
            assert len(x)>100, name + ': missing visible text/background'
            boxes.append([int(x.min()), int(y.min()), int(x.max()), int(y.max())])
        overlap = int(np.logical_and(*masks).sum()) / max(1, int(np.logical_or(*masks).sum()))
        edge = max(abs(x-y) for x, y in zip(*boxes))
        row.update(nativeBounds=boxes[0], webBounds=boxes[1], changedPixelMaskIoU=overlap, largestBoundErrorPixels=edge)
        row['criteria'] = dict(changedPixelMaskIoU=.8, largestBoundErrorPixels=8, meanAbsoluteRGB=8)
        row['passed'] = overlap >= .8 and edge <= 8 and row['meanAbsoluteRGB'] <= 8
    results.append(row)
report = dict(nativeSource=native['nativeSource'], webSource=os.environ.get('GITHUB_SHA'),
              fixture='One second at 640x360/24, shared original PNG and bundled Vazirmatn',
              scope='Mac Metal native export rebuilt from released source versus actual browser exporter; not installed package UI, all effects, animations, HDR or platform breadth',
              results=results, passed=all(r['passed'] for r in results))
(root / 'comparison.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
assert report['passed'], 'Material native/browser visual differences: ' + ', '.join(r['name'] for r in results if not r['passed'])
