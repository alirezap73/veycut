"""Validate complete immutable native output before server-only Web replay."""
import hashlib,json,os
from pathlib import Path
root=Path('output/native-parity');baseline='9082f2686b7896e49561d2c531fd3ec105e456eb';hashes={}
for report_file,cases_file in [('native-report.json','cases.json'),('native-audio-report.json','audio-cases.json')]:
 report=json.loads((root/report_file).read_text());cases=json.loads((root/cases_file).read_text())
 assert report['nativeSource']==baseline
 assert [r['name'] for r in report['results']]==[c['name'] for c in cases]
 for case,row in zip(cases,report['results']):
  assert 'Metal' in row['adapter'];name=case['name'];assert name.replace('-','').isalnum()
  for file in [root/f'native-{name}.mp4',root/f'{name}.json']:
   assert file.stat().st_size>0;hashes[file.name]=hashlib.file_digest(file.open('rb'),'sha256').hexdigest()
 assert len(cases)>=7 if 'audio' in report_file else len(cases)==20
for name in ['source.png','ramp-tone.wav']:
 file=root/name;assert file.stat().st_size>0;hashes[name]=hashlib.file_digest(file.open('rb'),'sha256').hexdigest()
for case in json.loads((root/'audio-cases.json').read_text()):
 assert Path(case['source']).is_file()
(root/'native-reference-reuse.json').write_text(json.dumps({'referenceRun':os.environ['REFERENCE_RUN'],'baseline':baseline,'nativeOutputSHA256':hashes,'scope':'Complete actual Mac Metal export files reused; source driver/fixture git diff checked before replay. Prior browser-stage failure does not become a native/Web parity pass.'},indent=2))
print(json.dumps({'nativeReference':os.environ['REFERENCE_RUN'],'nativeSource':baseline,'completeOutputs':len(hashes)}))
