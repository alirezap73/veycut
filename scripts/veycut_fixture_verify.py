"""GitHub-only verification of unchanged camera input -> real application output."""
import argparse, array, hashlib, json, math, os, struct, subprocess
from pathlib import Path

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Media decoding is restricted to GitHub Actions.')
root=Path('output/fixtures')
parser=argparse.ArgumentParser()
parser.add_argument('--diagnostic-reuse',action='store_true',help='Analyse retained previous outputs; cannot prove latest runtime or bundle identity.')
args=parser.parse_args()
manifest=json.loads(Path('docs/evidence/fixture-sources.json').read_text())
probes=json.loads((root/'probe-report.json').read_text())
browser=json.loads((root/'fixture-ui.json').read_text())

def run(args):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
    if p.returncode: raise RuntimeError(p.stderr.decode(errors='replace')[-6000:])
    return p.stdout

def pcm(path,start,duration):
    values=array.array('f')
    values.frombytes(run(['ffmpeg','-v','error','-threads','1','-ss',str(start),'-i',str(path),'-t',str(duration),'-vn','-ac','1','-ar','16000','-f','f32le','-']))
    return values

def correlation(a,b):
    if len(a)!=len(b) or not a:return None
    ma,mb=sum(a)/len(a),sum(b)/len(b)
    denom=math.sqrt(sum((v-ma)**2 for v in a)*sum((v-mb)**2 for v in b))
    return sum((x-ma)*(y-mb) for x,y in zip(a,b))/denom if denom>1e-10 else None

def envelope(values,start,stop,step=400,window=400):
    return [math.sqrt(sum(v*v for v in values[i:i+window])/window) for i in range(start,stop-window+1,step)]

def lag_diagnostic(original,actual,offset,size):
    # Prefix sums make a fine +/-150ms search cheap on the server, with no resampling/time-warp.
    a=envelope(original,3200,size-3200,step=80)
    prefix=[0.0]
    for v in actual:prefix.append(prefix[-1]+v*v)
    def shifted(lag):
        b=[]
        for i in range(3200,size-3200-400+1,80):
            at=offset+i+lag
            if at<0 or at+400>=len(prefix):return None
            b.append(math.sqrt(max(0,prefix[at+400]-prefix[at])/400))
        return correlation(a,b)
    candidates=[(shifted(lag),lag) for lag in range(-2400,2401,16)]
    candidates=[(c,lag) for c,lag in candidates if c is not None]
    if not candidates:return {'bestLagSeconds':None,'bestCorrelation':None}
    best,lag=max(candidates)
    return {'bestLagSeconds':lag/16000,'bestCorrelation':best,'zeroLagCorrelation':shifted(0),'lagMeaning':'Positive means output content occurs later than source; diagnostic only, never used to align acceptance criteria.'}

def picture(path,time):
    # FFmpeg's default autorotation uses the source display matrix. Application output is already composed.
    return run(['ffmpeg','-v','error','-threads','1','-ss',str(time),'-i',str(path),'-frames:v','1','-vf','scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2','-f','rawvideo','-pix_fmt','rgb24','-'])

results=[]
failures=[]
def check(ok,message):
    if not ok:failures.append(message)
for fixture in manifest['fixtures']:
    id=fixture['id']; source=root/fixture['file']; output=root/(id+'-output.mp4')
    ui=next(x for x in browser if x['id']==id)
    probe=next(x for x in probes['fixtures'] if x['id']==id)
    with source.open('rb') as f: assert hashlib.file_digest(f,'sha256').hexdigest()==fixture['sha256']
    if not args.diagnostic_reuse:
        with (root/(id+'.veycut')).open('rb') as f:
            assert f.read(8)==b'VEYCUTB1'; length=struct.unpack('<I',f.read(4))[0]; assert length<=4194304
            index=json.loads(f.read(length)); assert len(index['entries'])==1
            entry=index['entries'][0]; assert entry['offset']==0 and entry['size']==fixture['bytes']
            assert hashlib.file_digest(f,'sha256').hexdigest()==fixture['sha256'],'Reopened bundle preserves original bytes'
    info=json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',str(output)]))
    assert {s['codec_type']:s['codec_name'] for s in info['streams']}=={'video':'h264','audio':'aac'}
    run(['ffmpeg','-v','error','-xerror','-threads','1','-i',str(output),'-f','null','-'])
    clips=sorted(ui['clips'],key=lambda c:c['start']); assert len(clips)==2
    def duration(c): return c['duration']
    total=max(c['start']+duration(c) for c in clips)
    frames=json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(output)]))['frames']
    times=[float(f['best_effort_timestamp_time']) for f in frames]
    check(len(times)==math.ceil(total*24-1e-7),f'{id}: frame count {len(times)} for duration {total}')
    check(max(abs(t-i/24) for i,t in enumerate(times))<.000002,f'{id}: frame timestamps')
    pixels=[]; correlations=[];diagnostics=[]
    actual=pcm(output,0,total)
    # Decode from zero, THEN slice, as an independent check on ffmpeg's seek/edit-list reference.
    full_reference=pcm(source,0,max(c['in']+duration(c) for c in clips)+.2)
    for c in clips:
        original=pcm(source,c['in'],duration(c))
        # Sample-aligned 25ms speech envelopes across each cut, excluding codec boundary priming.
        size=min(len(original),len(actual)-round(c['start']*16000))
        a=[];b=[];offset=round(c['start']*16000)
        for begin in range(1600,size-1600,400):
            a.append(math.sqrt(sum(v*v for v in original[begin:begin+400])/400))
            b.append(math.sqrt(sum(v*v for v in actual[offset+begin:offset+begin+400])/400))
        assert len(a)>20
        corr=correlation(a,b)
        check(corr is not None and corr>.9,f'{id}: original zero-lag 25ms speech correlation {corr} must exceed 0.9')
        correlations.append(corr)
        start=round(c['in']*16000)
        independently_sliced=full_reference[start:start+size]
        independent_env=envelope(independently_sliced,1600,size-1600-400+1)
        seek_env=envelope(original,1600,size-1600-400+1)
        output_env=envelope(actual,offset+1600,offset+size-1600-400+1)
        diagnostics.append({'clip':c,'decodedSampleCount':size,'sourceSeekVsFullDecodeSliceCorrelation':correlation(seek_env,independent_env),'outputVsFullDecodeSliceZeroLagCorrelation':correlation(independent_env,output_env),'seekReferenceLag':lag_diagnostic(original,actual,offset,size),'fullDecodeSliceLag':lag_diagnostic(independently_sliced,actual,offset,size)})
        # Include first/last actual output frame of each cut in addition to interior checkpoints.
        first_grid=math.ceil(c['start']*24-1e-7)/24
        last_grid=(math.ceil((c['start']+duration(c))*24-1e-7)-1)/24
        relative_times=sorted(set([first_grid-c['start'],.5,1.5,2.5,last_grid-c['start']]))
        for relative in relative_times:
            if relative>=duration(c):continue
            x=picture(source,c['in']+relative);y=picture(output,c['start']+relative)
            assert len(x)==len(y)==43200
            error=sum(abs(a-b) for a,b in zip(x,y))/len(x);check(error<25,f'{id}: picture {relative} mean error {error} must be below 25')
            pixels.append(error)
    gap_start=clips[0]['start']+duration(clips[0]);gap_end=clips[1]['start'];assert gap_end-gap_start>.45
    gap=actual[round((gap_start+.1)*16000):round((gap_end-.1)*16000)]
    gap_rms=math.sqrt(sum(v*v for v in gap)/len(gap)) if gap else None
    check(gap_rms is not None and gap_rms<.002,f'{id}: interior gap audio RMS {gap_rms} must be below 0.002')
    blank=picture(output,(gap_start+gap_end)/2);black=sum(blank)/len(blank)
    check(black<4,f'{id}: interior gap picture mean {black} must be below 4')
    results.append({'id':id,'build':ui['build'],'inputSHA256':fixture['sha256'],'inputTranscoded':False,'originalBundleSHA256Verified':not args.diagnostic_reuse,'measuredVariableTiming':probe['packetTiming']['measuredVariableTiming'],'sourceRotationSideData':next(s for s in probe['metadata']['streams'] if s['codec_type']=='video').get('side_data_list',[]),'sourceEditListCount':len(probe['editLists']),'freshPageReopen':ui['freshPageReopen'],'fullOutputDecode':True,'frames':len(times),'seconds':total,'pictureErrors':pixels,'speechEnvelopeCorrelations':correlations,'audioTimingDiagnostics':diagnostics,'gapAudioRMS':gap_rms,'gapPictureMean':black})
    (root/'fixture-output-report.json').write_text(json.dumps({'status':'incomplete','fixtures':results,'failures':failures},indent=2))
    print(json.dumps(results[-1]),flush=True)
report={'status':'failed' if failures else ('diagnostic-only' if args.diagnostic_reuse else 'passed'),'diagnosticReuse':args.diagnostic_reuse,'failures':failures,'fixtures':results,'cameraVFRVerified':probes['cameraVFRVerified'],'scope':'Two owner-published unchanged camera originals; actual Web trim/split/gap/bundle/reopen/H264AAC output. Speech envelope timing and pictures checked, not perceptual pitch quality or released Mac equivalence. Best-lag correlations are diagnostics, not criteria-aligned acceptance.'}
(root/'fixture-output-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
if failures:raise SystemExit('Original camera verification failed; complete per-fixture diagnostics saved.')
