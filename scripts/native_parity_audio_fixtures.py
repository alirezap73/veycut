"""Manifest for the same PCM consumed by the native and browser exporters."""
import hashlib
import json
import shutil
from pathlib import Path

root = Path('output/native-parity')
curves = [[.5, 1, 1.5], [1.5, 1, .5], [.25, 2, 4]]
cases = []
for index, speeds in enumerate(curves):
    cases.append(dict(name=f'ramp-{index}', source=str(root / 'ramp-tone.wav'),
                      sourceIn=0, sourceOut=8,
                      curve=[dict(at=at, speed=speed) for at, speed in zip([0, .5, 1], speeds)],
                      fixture='Synthetic stereo tone plus source-time pulses'))
speech_sources = sorted(Path('output/fixtures').glob('*-speech-derived.wav'))
if Path('output/fixtures/probe-report.json').exists():
    report = json.loads(Path('output/fixtures/probe-report.json').read_text())
    sources = json.loads(Path('docs/evidence/fixture-sources.json').read_text())
    assert len(speech_sources)==2, 'Both licensed derived narration fixtures required'
    expected = {entry['id']:entry for entry in sources['fixtures']}
    assert len(report['fixtures'])==len(expected)
    assert {entry['id'] for entry in report['fixtures']}==set(expected)
    assert report['sourceRevision']==sources['revision']
    assert report['license']==sources['license']
    for entry in report['fixtures']:
        assert entry['integrity']['sha256']==expected[entry['id']]['sha256']
        derived = entry['speechDerivative']
        assert derived['sourceStart']==10.137931 and derived['seconds']==20
        source = Path('output/fixtures') / derived['file']
        assert source.name==entry['id']+'-speech-derived.wav'
        with source.open('rb') as handle:
            assert hashlib.file_digest(handle,'sha256').hexdigest()==derived['sha256']
    shutil.copy('output/fixtures/probe-report.json',root/'speech-source-probe.json')
    shutil.copy('output/fixtures/SOURCE-README.md',root/'speech-SOURCE-README.md')
for source in speech_sources:
    assert source.name in ['camera-mov-narration-speech-derived.wav', 'camera-vfr-candidate-speech-derived.wav']
    for index, speeds in enumerate(curves[:2]):
        cases.append(dict(name='speech-' + source.name.split('-speech')[0] + f'-ramp-{index}',
                          source=str(source), sourceIn=0, sourceOut=20,
                          curve=[dict(at=at, speed=speed) for at, speed in zip([0, .5, 1], speeds)],
                          fixture='Derived real wearer narration PCM; original source window10.137931..30.137931, not untouched camera input'))
(root / 'audio-cases.json').write_text(json.dumps(cases, indent=2))
