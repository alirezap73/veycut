"""Confirm a recorded browser frame actually contains spatial and colour effects."""
import json
import subprocess
from pathlib import Path

folder = Path('output/playwright')
video = folder / 'effects-video.webm'
probe = json.loads(subprocess.check_output([
    'ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(video)
]))
stream = next(s for s in probe['streams'] if s['codec_type'] == 'video')
assert (stream['width'], stream['height']) == (360, 640), stream
rgb = subprocess.check_output([
    'ffmpeg', '-v', 'error', '-ss', '.6', '-i', str(video), '-frames:v', '1',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
])
assert len(rgb) == 360 * 640 * 3
samples = []
for y in range(210, 420, 35):
    for x in range(65, 310, 35):
        offset = (y * 360 + x) * 3
        samples.extend(rgb[offset:offset + 3])
assert any(value > 200 for value in samples) and any(value < 50 for value in samples)
near_posterized = sum(min(value, 255 - value) < 40 for value in samples)
assert near_posterized >= len(samples) * .75, (near_posterized, len(samples))
(folder / 'effects-decoder-report.json').write_text(json.dumps({
    'status': 'passed', 'fullDecode': True, 'dimensions': [360, 640],
    'sampleCount': len(samples), 'nearPosterizedSamples': near_posterized,
    'precision': 'Short synthetic source; spatial/colour behaviour and export checked, not long-footage performance.'
}, indent=2))
