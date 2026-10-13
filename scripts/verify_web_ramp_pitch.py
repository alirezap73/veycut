"""Full decoded stereo pitch and mapped source markers, not just saved curve metadata."""
import array,json,math,subprocess
from pathlib import Path
root=Path('output/playwright');report=json.loads((root/'ramp-pitch-report.json').read_text());results=[]
def run(args):
 p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace'))
 return p.stdout
for entry in report['results']:
 path=root/entry['file'];seconds=entry['clip']['duration'];count=math.ceil(seconds*24-1e-8)
 run(['ffmpeg','-v','error','-xerror','-i',str(path),'-f','null','-'])
 frames=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(path)]))['frames'];assert len(frames)==count
 assert max(abs(float(f['best_effort_timestamp_time'])-i/24) for i,f in enumerate(frames))<.000002
 data=array.array('f');data.frombytes(run(['ffmpeg','-v','error','-i',str(path),'-vn','-ac','2','-ar','8000','-f','f32le','-']));assert len(data)>=math.floor(seconds*8000)*2-2
 checks=[]
 for fraction in [.15,.5,.85]:
  at=max(.1,min(seconds-.55,seconds*fraction));values=data[round(at*8000)*2:round((at+.5)*8000)*2];assert len(values)==8000
  for channel,hz in [(0,880),(1,660)]:
   samples=values[channel::2];power=math.sqrt(sum(v*v for v in samples)/len(samples));assert power>.01
   scores=[(abs(sum(v*complex(math.cos(2*math.pi*f*i/8000),math.sin(2*math.pi*f*i/8000)) for i,v in enumerate(samples))),f) for f in range(hz-8,hz+9)];found=max(scores)[1];assert abs(found-hz)<=4,(entry['speeds'],at,channel,found);checks.append({'at':at,'channel':channel,'pitch':found})
 # Pulses have a .05 floor and .4 top. Locate their decoded onset on 10 ms RMS bins.
 left=data[::2];env=[math.sqrt(sum(v*v for v in left[i:i+80])/80) for i in range(0,len(left)-79,80)];onsets=[i*.01 for i,v in enumerate(env) if v>.12 and (i==0 or env[i-1]<=.12)]
 errors=[]
 for expected in entry['markers']:
  assert onsets,(entry['speeds'],expected);found=min(onsets,key=lambda at:abs(at-expected));error=abs(found-expected);assert error<.10,(entry['speeds'],expected,found,onsets);errors.append(error)
 derivative=max(abs(left[i+1]-left[i]) for i in range(len(left)-1));assert derivative<.45,(entry['speeds'],derivative)
 results.append({'speeds':entry['speeds'],'seconds':seconds,'frames':count,'fullDecode':True,'pitchChecks':checks,'sourceMarkerErrorsSeconds':errors,'maxAdjacentSampleDifference':derivative})
result={'status':'passed','results':results,'pure':report['pure'],'scope':report['scope']};(root/'ramp-pitch-decoded-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
