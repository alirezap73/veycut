"""Verify the browser filter changes actual decoded audio, not just project JSON."""
import array
import math
import subprocess
from pathlib import Path

folder = Path('output/playwright')
mode = 'realtime'
def filename(name):
    return mode+'-'+name.replace('.webm', '.mp4' if mode=='frames' else '.webm')

def rms(name):
    output = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(folder / filename(name)), '-vn', '-ac', '1',
         '-ar', '8000', '-f', 's16le', '-'], check=True, timeout=60,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
    samples = array.array('h')
    samples.frombytes(output)
    window = samples[round(.6 * 8000):round(1.4 * 8000)]
    assert len(window) == 6400, (name, len(window))
    return math.sqrt(sum((sample / 32768) ** 2 for sample in window) / len(window))

def pulse_rms(name, start, end):
    output = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(folder / filename(name)), '-vn', '-ac', '1',
         '-ar', '8000', '-f', 's16le', '-'], check=True, timeout=60,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
    samples = array.array('h');samples.frombytes(output)
    window = samples[round(start * 8000):round(end * 8000)]
    assert len(window) >= round((end-start)*8000*.8)
    return math.sqrt(sum((sample / 32768) ** 2 for sample in window) / len(window))

for mode in ['realtime','frames']:
    plain, bass = rms('tone-baseline.webm'), rms('tone-bass.webm')
    assert plain > .01, plain
    assert bass > plain * 1.5, (plain, bass)
    telephone = rms('tone-telephone.webm')
    assert telephone < plain * .5, (plain, telephone)
    
    echo_plain = pulse_rms('echo-baseline.webm', .28, .58)
    echo_filtered = pulse_rms('echo-filtered.webm', .28, .58)
    assert echo_filtered > .005 and echo_filtered > echo_plain * 4, (echo_plain, echo_filtered)
    print({'baselineRms': plain, 'bassRms': bass, 'ratio': bass / plain})
    boundary_plain = pulse_rms('echo-baseline.webm', 1.15, 1.4)
    boundary_echo = pulse_rms('echo-filtered.webm', 1.15, 1.4)
    assert boundary_echo > .005 and boundary_echo > boundary_plain * 4, (mode, boundary_plain, boundary_echo)
    print({'mode':mode,'echoAcrossWindowBoundary':True,'echoRms':boundary_echo})
