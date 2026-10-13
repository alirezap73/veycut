"""GitHub-only full decoded long AAC -> pitch-preserving MP4 output."""
import array,json,math,subprocess
from pathlib import Path
r=Path('output/playwright');p=r/'pitch-long-output.mp4'
def run(args):
 s=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
 if s.returncode:raise RuntimeError(s.stderr.decode(errors='replace'))
 return s.stdout
report=json.loads((r/'pitch-long-export.json').read_text());assert report['encoding']['frames']==7200;assert abs(report['clip']['duration']-300)<.00001
streams=json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',str(p)]))['streams'];types={s['codec_type']:s['codec_name'] for s in streams};assert types=={'video':'h264','audio':'aac'},types
run(['ffmpeg','-v','error','-xerror','-i',str(p),'-f','null','-'])
frames=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(p)]))['frames'];times=[float(f['best_effort_timestamp_time']) for f in frames];assert len(times)==7200;assert max(abs(t-i/24) for i,t in enumerate(times))<.000002
checks=[]
for at in [1,59,149,298.5]:
 pcm=array.array('f');pcm.frombytes(run(['ffmpeg','-v','error','-ss',str(at),'-i',str(p),'-t','1','-vn','-ac','2','-ar','8000','-f','f32le','-']));assert len(pcm)==16000
 pitches=[]
 for channel,hz in [(0,880),(1,660)]:
  values=pcm[channel::2];assert all(math.isfinite(v) for v in values);assert math.sqrt(sum(v*v for v in values)/len(values))>.03
  scores=[(abs(sum(v*complex(math.cos(2*math.pi*f*i/8000),math.sin(2*math.pi*f*i/8000)) for i,v in enumerate(values))),f) for f in range(hz-8,hz+9)];found=max(scores)[1];assert abs(found-hz)<=2,(at,channel,found);pitches.append(found)
 checks.append({'second':at,'leftPitch':pitches[0],'rightPitch':pitches[1]})
report.update(status='passed',seconds=300,frames=7200,fullDecode=True,pitchCheckpoints=checks,scope='Synthetic compressed ten-minute AAC input through actual public UI to five-minute 2x H.264/AAC output. Not real speech, camera footage, ramps or native Mac equivalence.')
(r/'pitch-long-export-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
