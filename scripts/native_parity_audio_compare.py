"""Native/Web audio timing, pitch and broad envelope comparison on GitHub.
Numerical checks do not establish human speech intelligibility or sample identity.
"""
import json
import math
import subprocess
from pathlib import Path
import numpy as np

root = Path('output/native-parity')
cases = json.loads((root / 'audio-cases.json').read_text())
browser = json.loads((root / 'browser-audio-report.json').read_text())
native = json.loads((root / 'native-audio-report.json').read_text())
assert native['nativeSource'] == '9082f2686b7896e49561d2c531fd3ec105e456eb'
assert [r['name'] for r in native['results']] == [r['name'] for r in cases]
results = []
for case, entry in zip(cases, browser['results']):
    assert case['name'] == entry['name']
    seconds = entry['clip']['duration']
    audio = {}
    row = dict(name=case['name'], fixture=case['fixture'], seconds=seconds, measurements={})
    for kind in ['native', 'web']:
        path = root / f"{kind}-{case['name']}.mp4"
        subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'], check=True, timeout=90)
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-of', 'json', str(path)]))
        video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
        expected_frames = (math.floor(seconds*24+.5) if kind=='native' else math.ceil(seconds*24-1e-8))
        assert int(video['nb_read_frames']) == expected_frames
        frames = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', str(path)]))['frames']
        assert max(abs(float(f['best_effort_timestamp_time'])-index/24) for index,f in enumerate(frames)) < .000002
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ac', '2', '-ar', '8000', '-f', 'f32le', '-'], timeout=90)
        pcm = np.frombuffer(raw, '<f4').reshape(-1, 2)
        assert abs(len(pcm)/8000-seconds) < .06
        assert np.isfinite(pcm).all() and np.max(np.abs(pcm)) <= 1.05
        assert np.sqrt(np.mean(pcm**2)) > .003, case['name'] + ': unexpectedly silent'
        audio[kind] = pcm
        failures = []
        measurement = dict(fullDecode=True, audioSeconds=len(pcm)/8000, frames=expected_frames,
                           frameQuantization='nearest' if kind=='native' else 'ceiling')
        if case['name'].startswith('ramp-'):
            frequencies = []
            for fraction in [.15, .5, .85]:
                at = max(.1, min(seconds-.55, seconds*fraction))
                span = pcm[round(at*8000):round((at+.5)*8000)]
                for channel, expected in [(0, 880), (1, 660)]:
                    scores = []
                    for hz in range(expected-8, expected+9):
                        phase = np.arange(len(span)) * (2*math.pi*hz/8000)
                        scores.append((abs(np.dot(span[:,channel], np.exp(1j*phase))), hz))
                    found = max(scores)[1]
                    if abs(found-expected) > 4:
                        failures.append(dict(check='pitch', at=at, channel=channel, expectedHz=expected, measuredHz=found, toleranceHz=4))
                    frequencies.append(dict(at=at, channel=channel, hz=found))
            left = pcm[:,0]; size=len(left)//80
            env=np.sqrt(np.mean(left[:size*80].reshape(size,80)**2, axis=1))
            onsets=np.where((env>.12)&np.r_[True,env[:-1]<=.12])[0]*.01
            errors=[]
            for marker in entry['markers']:
                error=float(np.min(abs(onsets-marker))) if len(onsets) else None
                if error is None or error >= .12:
                    failures.append(dict(check='source-marker', markerSeconds=marker, errorSeconds=error, toleranceSeconds=.12))
                errors.append(error)
            measurement.update(pitch=frequencies, sourceMarkerErrorsSeconds=errors)
        measurement.update(passed=not failures, failures=failures)
        row['measurements'][kind]=measurement
    count=min(len(audio['native']),len(audio['web']))//800
    envelopes=[np.sqrt(np.mean(pcm[:count*800].reshape(count,800,2)**2,axis=(1,2))) for pcm in audio.values()]
    correlation=float(np.corrcoef(envelopes)[0,1])
    row['rmsEnvelopeCorrelation100ms']=correlation
    # Textbook tones can have near-constant broad energy; speech has meaningful
    # silence/phrase dynamics, so require broad native timing agreement there.
    if case['name'].startswith('speech-'):
        row['envelopePassed']=math.isfinite(correlation) and correlation >= .8
    row['webPassed']=row['measurements']['web']['passed'] and row.get('envelopePassed', True)
    row['nativeQualityPassed']=row['measurements']['native']['passed']
    results.append(row)
report=dict(nativeSource=native['nativeSource'],passed=all(row['webPassed'] for row in results),
            nativeBaselineMeetsSameQualityChecks=all(row['nativeQualityPassed'] for row in results),
            thresholds=dict(pitchHz=4, sourceMarkerSeconds=.12, speechEnvelopeCorrelation=.8), results=results,
            scope='Actual native and browser output from same PCM/edit. Numerical pitch/timing/envelope checks; real speech needs human listening for intelligibility, not proven by correlation. Native and Web quality failures are recorded independently; a defective native pitch baseline does not excuse a Web pitch failure or require emulating that defect.')
(root/'audio-comparison.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))

assert report['passed'], 'Browser quality/native timing comparison failed; inspect independent measurements'
