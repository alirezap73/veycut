"""GitHub-only decoded fixed frame grid, mixed picture, captions and separate tone."""
import array
import json
import math
import subprocess
from pathlib import Path

root=Path('output/playwright');video=root/'offline-video.mp4';report=json.loads((root/'offline-report.json').read_text())
def run(args):
    try:
        return subprocess.run(args,check=True,timeout=120,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout
    except subprocess.CalledProcessError as error:
        raise RuntimeError(error.stderr.decode(errors='replace')) from error
meta=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
assert 'mp4' in meta['format']['format_name']
assert any(s['codec_type']=='video' and s['codec_name']=='h264' and (s['width'],s['height'])==(360,640) for s in meta['streams'])
assert any(s['codec_type']=='audio' and s['codec_name']==report['encoding']['audioCodec'] for s in meta['streams'])
run(['ffmpeg','-v','error','-xerror','-i',str(video),'-f','null','-'])
frames=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(video)]))['frames']
times=[float(frame['best_effort_timestamp_time']) for frame in frames];assert len(times)==216,len(times)
error=max(abs(at-index/24) for index,at in enumerate(times));assert error<.000002,error
def frame(at):
    data=run(['ffmpeg','-v','error','-ss',str(at),'-i',str(video),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);assert len(data)==360*640*3;return data
picture=frame(4);centre=(320*360+180)*3;assert picture[centre]>220 and max(picture[centre+1:centre+3])<30
caption=frame(.4);bright=sum(min(caption[(y*360+x)*3:(y*360+x)*3+3])>180 for y in range(460,620) for x in range(15,345));assert bright>30,bright
pcm=array.array('h');pcm.frombytes(run(['ffmpeg','-v','error','-ss','8','-i',str(video),'-t','0.5','-vn','-ac','1','-ar','8000','-f','s16le','-']));assert len(pcm)>=3900
samples=[v/32768 for v in pcm];rms=math.sqrt(sum(v*v for v in samples)/len(samples));amplitude=2*abs(sum(v*complex(math.cos(2*math.pi*880*i/8000),math.sin(2*math.pi*880*i/8000)) for i,v in enumerate(samples)))/len(samples)
assert .04<rms<.14 and amplitude>.05,(rms,amplitude)
result={'status':'passed','fullDecode':True,'seconds':9,'videoFrames':216,'fps':24,'maxFrameTimestampError':error,'audioRms':rms,'audio880HzAmplitude':amplitude,'captionBrightPixels':bright,'cancelledDownloaded':report['cancellationDownloaded'],'scope':'Short mixed SDR fixed-frame output; not native pixel equivalence or long-session proof.'}
(root/'offline-decoder-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
