"""GitHub-only complete MP4 decoding and correspondence to original live-action footage."""
import array
import hashlib
import json
import math
import subprocess
from pathlib import Path

root=Path('output/playwright')
def run(args):
    return subprocess.run(args,check=True,timeout=240,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout
def probe(path):
    return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
report=json.loads((root/'real-report.json').read_text());duration=report['seconds'];assert duration in [360,600]
for name,seconds in [('browser-video.mp4',2),('real-video.mp4',duration)]:
    video=root/name;meta=probe(video)
    assert 'mp4' in meta['format']['format_name'],meta['format']
    assert any(s['codec_type']=='video' and s['codec_name']=='h264' for s in meta['streams'])
    assert any(s['codec_type']=='audio' and s['codec_name'] in ['aac','opus'] for s in meta['streams'])
    assert abs(float(meta['format']['duration'])-seconds)<.5
    run(['ffmpeg','-v','error','-xerror','-i',str(video),'-f','null','-'])
video=root/'real-video.mp4';source=root/'real-source.webm'
assert json.loads((root/'real-project.json').read_text())==json.loads((root/'real-project-after.json').read_text())
frames=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(video)]))['frames']
times=[float(f['best_effort_timestamp_time']) for f in frames]
assert times==sorted(times) and len(times)>duration*24*.8 and duration-.3<times[-1]<duration+.5
gap=max(b-a for a,b in zip(times,times[1:]));assert gap<.35,gap
def pcm(path,offset):
    data=array.array('h');data.frombytes(run(['ffmpeg','-v','error','-ss',str(offset),'-i',str(path),'-t',str(duration),'-vn','-ac','1','-ar','8000','-f','s16le','-']));return data
original,recorded=pcm(source,30),pcm(video,0)
def rms(data,at):
    values=data[at*8000:(at+1)*8000];assert len(values)==8000
    return math.sqrt(sum((v/32768)**2 for v in values)/len(values))
# One-second envelopes tolerate codec delay but detect silence, repeats and clock drift.
reference=[rms(original,at) for at in range(5,duration-5,5)];actual=[rms(recorded,at) for at in range(5,duration-5,5)]
mean_a=sum(reference)/len(reference);mean_b=sum(actual)/len(actual)
correlation=sum((a-mean_a)*(b-mean_b) for a,b in zip(reference,actual))/math.sqrt(sum((a-mean_a)**2 for a in reference)*sum((b-mean_b)**2 for b in actual))
assert correlation>.9,correlation
def frame(path,at):
    return run(['ffmpeg','-v','error','-ss',str(at),'-i',str(path),'-frames:v','1','-vf','scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2','-f','rawvideo','-pix_fmt','rgb24','-'])
errors=[]
for at in [15,90,180,270,duration-30]:
    a,b=frame(source,at+30),frame(video,at);assert len(a)==len(b)==160*90*3
    mae=sum(abs(x-y) for x,y in zip(a,b))/len(a);assert mae<25,(at,mae);errors.append({'seconds':at,'meanPixelError':mae})
result={'status':'passed','seconds':duration,'fullDecode':True,'videoFrames':len(times),'lastVideoPts':times[-1],'maxVideoGap':gap,'audioEnvelopeCorrelation':correlation,'pictureCheckpoints':errors,'streams':[{'type':s['codec_type'],'codec':s['codec_name']} for s in probe(video)['streams']],'sourceSHA256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'fixture':report['fixture'],'scope':'One live-action/CGI film on Linux Chromium; not all camera codecs or other browsers.'}
(root/'real-decoder-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
