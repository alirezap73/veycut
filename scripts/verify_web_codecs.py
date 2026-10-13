"""Decode every available codec and reject silent codec substitution."""
import json,platform,subprocess
from pathlib import Path
root=Path('output/playwright');report=json.loads((root/'codec-report.json').read_text());results=[]
def run(args):
    value=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
    if value.returncode:raise RuntimeError(value.stderr.decode(errors='replace'))
    return value.stdout
names={'avc':'h264','hevc':'hevc','av1':'av1'}
for entry in report['results']:
    if not entry['supported']:
        assert entry['refused'] and entry['downloads']==0;results.append(entry);continue
    path=root/('codec-'+entry['codec']+'.mp4')
    meta=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
    assert {s['codec_type']:s['codec_name'] for s in meta['streams']}=={'video':names[entry['codec']],'audio':'aac'}
    assert abs(float(meta['format']['duration'])-2)<.1
    run(['ffmpeg','-v','error','-xerror','-i',str(path),'-f','null','-'])
    frames=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(path)]))['frames'];assert len(frames)==48
    error=max(abs(float(frame['best_effort_timestamp_time'])-i/24) for i,frame in enumerate(frames));assert error<.000002,error
    results.append({'codec':entry['codec'],'supported':True,'fullDecode':True,'frames':len(frames),'maxFrameTimestampError':error,'audioBackend':entry['encoding']['audioEncoderBackend']})
result={'status':'passed','platform':platform.system(),'arch':platform.machine(),'publicPage':report.get('publicPage',False),'build':report.get('build'),'seconds':2,'results':results,'scope':report['scope']}
(root/'codec-decoder-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
