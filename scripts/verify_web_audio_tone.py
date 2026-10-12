"""Verify the browser filter changes actual decoded audio, not just project JSON."""
import array
import math
import subprocess
from pathlib import Path

folder = Path('output/playwright')

def rms(name):
    output = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(folder / name), '-vn', '-ac', '1',
         '-ar', '8000', '-f', 's16le', '-'], check=True, timeout=60,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
    samples = array.array('h')
    samples.frombytes(output)
    window = samples[round(.6 * 8000):round(1.4 * 8000)]
    assert len(window) == 6400, (name, len(window))
    return math.sqrt(sum((sample / 32768) ** 2 for sample in window) / len(window))

plain, bass = rms('tone-baseline.webm'), rms('tone-bass.webm')
assert plain > .01, plain
assert bass > plain * 1.5, (plain, bass)
print({'baselineRms': plain, 'bassRms': bass, 'ratio': bass / plain})
