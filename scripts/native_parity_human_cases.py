"""Replace exploratory camera speech windows with documented human readers.

Visual reference outputs remain unchanged. All current audio cases are exported
again by the actual native engine; no old native audio is relabelled as new speech.
"""
import hashlib
import json
import shutil
from pathlib import Path

root = Path('output/native-parity')
source_root = Path('output/human-speech')
report = json.loads((source_root/'human-speech-fixture-report.json').read_text())
config = json.loads(Path('docs/evidence/human-speech-source.json').read_text())
assert report['archive']['fullCompressedArchiveHashed']
assert report['archive']['md5'] == config['archiveMD5']
assert len(report['fixtures']) == 2
assert len({row['speakerId'] for row in report['fixtures']}) == 2
cases = [row for row in json.loads((root/'audio-cases.json').read_text()) if row['name'].startswith('ramp-')]
assert len(cases) == 3
for fixture in report['fixtures']:
    source = source_root/fixture['derivative']['file']
    original = source_root/fixture['file']
    for path, digest in [(source, fixture['derivative']['sha256']), (original, fixture['sha256'])]:
        with path.open('rb') as handle:
            assert hashlib.file_digest(handle, 'sha256').hexdigest() == digest
    assert fixture['derivative']['durationSeconds'] == 20
    for index, speeds in enumerate([[.5, 1, 1.5], [1.5, 1, .5]]):
        cases.append(dict(name='speech-'+fixture['id']+f'-ramp-{index}', source=str(source),
                          sourceIn=0, sourceOut=20, fixtureId=fixture['id'],
                          curve=[dict(at=at, speed=speed) for at, speed in zip([0, .5, 1], speeds)],
                          fixture='Documented LibriSpeech human reader; fractional 20-second PCM derivative, unchanged original FLAC retained'))
shutil.copy(source_root/'human-speech-fixture-report.json', root/'human-speech-source-report.json')
(root/'audio-cases.json').write_text(json.dumps(cases, indent=2))
