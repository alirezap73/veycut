"""Server-only five-minute full decode, clock coverage, audio markers and late text checks."""
import array
import json
import math
import subprocess
from pathlib import Path

root=Path('output/playwright')
report=json.loads((root/'long-report.json').read_text())
assert report['status']=='passed' and report['seconds']==300 and not report['cancellationDownloaded']
assert json.loads((root/'long-project.json').read_text())==json.loads((root/'long-project-after.json').read_text())
video=root/'long-video.webm'
def run(args):
    return subprocess.run(args,check=True,timeout=240,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout
probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
assert (probe['streams'][0]['width'],probe['streams'][0]['height'])==(360,640)
assert abs(float(probe['format']['duration'])-300)<.5
assert any(s['codec_type']=='audio' for s in probe['streams'])
run(['ffmpeg','-v','error','-xerror','-i',str(video),'-f','null','-'])
frames=json.loads(run(['ffprobe','-v','error','-show_frames','-show_entries','frame=media_type,best_effort_timestamp_time','-of','json',str(video)]))['frames']
times=[float(f['best_effort_timestamp_time']) for f in frames if f['media_type']=='video']
assert times==sorted(times) and len(times)>300*24*.8,(len(times),times[-3:])
assert 299.7<times[-1]<300.5,times[-1]
gap=max(b-a for a,b in zip(times,times[1:]));assert gap<=.35,gap
pcm=array.array('h');pcm.frombytes(run(['ffmpeg','-v','error','-i',str(video),'-vn','-ac','1','-ar','8000','-f','s16le','-']))
def rms(start,end):
    samples=pcm[round(start*8000):round(end*8000)]
    assert len(samples)==round((end-start)*8000),len(samples)
    return math.sqrt(sum((n/32768)**2 for n in samples)/len(samples))
audio={str(at):rms(at+.5,at+1.5) for at in [0,60,120,180,240]}
assert all(.04<value<.14 for value in audio.values()),audio
assert rms(29,30)<.003 and rms(269,270)<.003
assert .04<rms(298.3,299.3)<.14
def frame(at):
    pixels=run(['ffmpeg','-v','error','-ss',str(at),'-i',str(video),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
    assert len(pixels)==360*640*3
    centre=(320*360+180)*3
    return pixels,list(pixels[centre:centre+3])
colours=[]
for at,expected in [(30,[255,0,0]),(90,[0,128,0]),(150,[0,0,255]),(210,[255,255,0]),(270,[255,0,255])]:
    _,colour=frame(at);assert all(abs(a-b)<35 for a,b in zip(colour,expected)),(at,colour)
    colours.append({'seconds':at,'rgb':colour})
late,_=frame(296)
bright=sum(min(late[(y*360+x)*3:(y*360+x)*3+3])>180 for y in range(480,620) for x in range(15,345))
assert bright>40,('Late Persian caption missing',bright)
result={'status':'passed','seconds':300,'fullDecode':True,'videoFrames':len(times),'lastVideoPts':times[-1],'maxVideoGap':gap,'declaredDuration':float(probe['format']['duration']),'audioMarkersRms':audio,'lateAudioRms':rms(298.3,299.3),'colourMarkers':colours,'lateCaptionBrightPixels':bright,'scope':'Five-minute synthetic Chromium recording; not frame-exact native rendering or a camera-file stress test.'}
(root/'long-decoder-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
