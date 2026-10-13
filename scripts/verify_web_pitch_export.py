"""Actual AAC decoding and constant-speed pitch retention, separate from raw DSP checks."""
import array,json,math,subprocess
from pathlib import Path
root=Path('output/playwright');report=json.loads((root/'pitch-export-report.json').read_text());results=[]
def run(args):
    value=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
    if value.returncode:raise RuntimeError(value.stderr.decode(errors='replace'))
    return value.stdout
for entry in report['results']:
    video=root/entry.get('file','pitch-export-'+str(entry['speed']).removesuffix('.0')+'.mp4');seconds=entry['seconds']
    run(['ffmpeg','-v','error','-xerror','-i',str(video),'-f','null','-'])
    meta=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]));assert abs(float(meta['format']['duration'])-seconds)<.1
    assert {s['codec_type']:s['codec_name'] for s in meta['streams']}=={'video':'h264','audio':'aac'}
    frames=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(video)]))['frames'];assert len(frames)==math.ceil(seconds*24-1e-8)
    assert max(abs(float(frame['best_effort_timestamp_time'])-i/24) for i,frame in enumerate(frames))<.000002
    pcm=array.array('f');pcm.frombytes(run(['ffmpeg','-v','error','-i',str(video),'-vn','-ac','2','-ar','8000','-f','f32le','-']))
    assert all(math.isfinite(value) for value in pcm)
    # AAC tails must retain sound, and no one-second chunk boundary may jump sharply.
    for channel in [0,1]:
        values=pcm[channel::2];tail=values[max(0,round((seconds-.35)*8000)):round((seconds-.05)*8000)];assert tail and math.sqrt(sum(value*value for value in tail)/len(tail))>.015
        for second in range(1,math.floor(seconds)):
            at=second*8000;window=values[at-16:at+16];assert max(abs(b-a) for a,b in zip(window,window[1:]))<.2,(entry,second)
    found=[]
    for channel,wanted in [(0,880),(1,660)]:
        values=pcm[4000*2+channel:12000*2:2];assert len(values)==8000
        rms=math.sqrt(sum(value*value for value in values)/len(values));assert rms>.02,rms
        peak=max((abs(sum(value*complex(math.cos(2*math.pi*hz*i/8000),math.sin(2*math.pi*hz*i/8000)) for i,value in enumerate(values))),hz) for hz in range(wanted-8,wanted+9))[1];assert abs(peak-wanted)<=2,(entry['speed'],channel,peak);found.append(peak)
    results.append({'speed':entry['speed'],'seconds':seconds,'frames':len(frames),'leftPitch':found[0],'rightPitch':found[1],'fullDecode':True})
result={'status':'passed','publicPage':report.get('publicPage',False),'build':report.get('build'),'results':results,'unsupportedRangeRefused':report['unsupportedRangeRefused'],'cancellationDownloaded':report['cancellationDownloaded'],'decodeAbortCleanup':report['decodeAbortCleanup'],'retrySucceeded':report['retrySucceeded'],'lateBitmapClosed':report['lateBitmapClosed'],'scope':report['scope']}
(root/'pitch-export-decoder-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
