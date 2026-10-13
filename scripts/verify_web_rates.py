"""Verify rational and 50 fps encoded frame grids, not just selector text."""
import json,subprocess
from pathlib import Path
root=Path('output/playwright');results=[]
def run(args):
    value=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
    if value.returncode:raise RuntimeError(value.stderr.decode(errors='replace'))
    return value.stdout
for name,rate,count in [('rate-rational.mp4',30000/1001,270),('rate-50.mp4',50,450)]:
    video=root/name
    run(['ffmpeg','-v','error','-xerror','-i',str(video),'-f','null','-'])
    frames=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(video)]))['frames']
    times=[float(f['best_effort_timestamp_time']) for f in frames];assert len(times)==count,len(times)
    error=max(abs(at-index/rate) for index,at in enumerate(times));assert error<.000002,(name,error)
    results.append({'file':name,'fps':rate,'frames':count,'maxFrameTimestampError':error,'fullDecode':True})
report={'status':'passed','seconds':9,'projectRatePreserved':'30000/1001','outputs':results,'scope':'Short mixed-media Chromium frame output; not all rates/browsers or native pixel equivalence.'}
(root/'rate-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
