"""Server-only verification; distributed photographic fixture is not raw camera provenance."""
import hashlib,json,subprocess
from pathlib import Path
root=Path('output/playwright');source=root/'footage.mp4';output=root/'footage-output.mp4'
def run(args):
 p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace'))
 return p.stdout
data=source.read_bytes();assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()=='bd91051dc5b10dc351ea06e5430dd335fb1ffb14'
def probe(path):return json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',str(path)]))['streams']
src,dst=probe(source),probe(output);assert next(s for s in dst if s['codec_type']=='video')['codec_name']=='h264'
run(['ffmpeg','-v','error','-xerror','-i',str(output),'-f','null','-'])
frames=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(output)]))['frames']
times=[float(f['best_effort_timestamp_time']) for f in frames];assert len(times)==60,len(times)
assert max(abs(at-i/24) for i,at in enumerate(times))<.000002
errors=[]
for at in [0,1/24,.5,1.25,2.4]:
 def picture(path,time):return run(['ffmpeg','-v','error','-ss',str(time),'-i',str(path),'-frames:v','1','-vf','scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2','-f','rawvideo','-pix_fmt','rgb24','-'])
 x,y=picture(source,at+.37),picture(output,at);assert len(x)==len(y)==43200
 error=sum(abs(p-q) for p,q in zip(x,y))/len(x);assert error<25,(at,error);errors.append(error)
report=json.loads((root/'footage-browser.json').read_text());report.update(status='passed',inputTranscoded=False,sourceSHA256=hashlib.sha256(data).hexdigest(),sourceStreams=[{k:s.get(k) for k in ['codec_type','codec_name','width','height','r_frame_rate','avg_frame_rate','duration']} for s in src],frames=60,seconds=2.5,fullOutputDecode=True,pictureErrors=errors,fixture='MDN interactive-examples/cc0-videos/flower.mp4; CC0 1.0; distributed bytes unchanged',scope='Short photographic sample, fractional trim, fresh-page portable reopen and output. Not raw camera MOV, VFR, long input or native Mac equivalence.')
(root/'footage-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
