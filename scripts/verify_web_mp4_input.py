"""Check an unchanged distributed MP4 sample, separately from converted long footage."""
import array, hashlib, json, math, subprocess
from pathlib import Path
root=Path('output/playwright');source=root/'mp4-input.mp4';output=root/'mp4-input-output.mp4'
def run(args):
    process=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
    if process.returncode:raise RuntimeError(process.stderr.decode(errors='replace'))
    return process.stdout
def streams(path):return json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',str(path)]))['streams']
for path in [source,output]:
    types={s['codec_type']:s['codec_name'] for s in streams(path)}
    assert types.get('video')=='h264' and types.get('audio')=='aac',types
run(['ffmpeg','-v','error','-xerror','-i',str(output),'-f','null','-'])
frames=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(output)]))['frames']
times=[float(f['best_effort_timestamp_time']) for f in frames];assert len(times)==96
assert max(abs(at-i/24) for i,at in enumerate(times))<.000002
def pcm(path,at):
    values=array.array('h');values.frombytes(run(['ffmpeg','-v','error','-ss',str(at),'-i',str(path),'-t','4','-vn','-ac','1','-ar','8000','-f','s16le','-']));assert len(values)>=32000;return values
a,b=pcm(source,10),pcm(output,0)
def envelope(values):return [math.sqrt(sum((v/32768)**2 for v in values[i:i+2000])/2000) for i in range(0,32000,2000)]
a,b=envelope(a),envelope(b);ma,mb=sum(a)/len(a),sum(b)/len(b)
corr=sum((x-ma)*(y-mb) for x,y in zip(a,b))/math.sqrt(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b));assert corr>.9,corr
errors=[]
for at in [1,2,3]:
    def picture(path,time):return run(['ffmpeg','-v','error','-ss',str(time),'-i',str(path),'-frames:v','1','-vf','scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2','-f','rawvideo','-pix_fmt','rgb24','-'])
    x,y=picture(source,at+10),picture(output,at);assert len(x)==len(y)==43200
    error=sum(abs(p-q) for p,q in zip(x,y))/len(x);assert error<25,(at,error);errors.append(error)
result={'status':'passed','inputTranscoded':False,'inputCodec':'H.264/AAC','outputCodec':'H.264/AAC','fullOutputDecode':True,'frames':96,'seconds':4,'audioEnvelopeCorrelation':corr,'pictureErrors':errors,'sourceSHA256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'fixture':'Sintel trailer, copyright Blender Foundation | durian.blender.org, CC BY 3.0; unchanged W3C distributed MP4 https://media.w3.org/2010/05/sintel/trailer.mp4','scope':'One short animated MP4 sample on Chromium; not camera files, all profiles or long AAC-input proof.'}
(root/'mp4-input-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
