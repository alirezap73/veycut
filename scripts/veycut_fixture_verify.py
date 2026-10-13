"""GitHub-only verification of unchanged camera input -> real application output."""
import array, hashlib, json, math, os, struct, subprocess
from pathlib import Path

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Media decoding is restricted to GitHub Actions.')
root=Path('output/fixtures')
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

def picture(path,time):
    # FFmpeg's default autorotation uses the source display matrix. Application output is already composed.
    return run(['ffmpeg','-v','error','-threads','1','-ss',str(time),'-i',str(path),'-frames:v','1','-vf','scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2','-f','rawvideo','-pix_fmt','rgb24','-'])

results=[]
for fixture in manifest['fixtures']:
    id=fixture['id']; source=root/fixture['file']; output=root/(id+'-output.mp4')
    ui=next(x for x in browser if x['id']==id)
    probe=next(x for x in probes['fixtures'] if x['id']==id)
    with source.open('rb') as f: assert hashlib.file_digest(f,'sha256').hexdigest()==fixture['sha256']
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
    assert len(times)==math.ceil(total*24-1e-7),(len(times),total)
    assert max(abs(t-i/24) for i,t in enumerate(times))<.000002
    pixels=[]; correlations=[]
    actual=pcm(output,0,total)
    for c in clips:
        original=pcm(source,c['in'],duration(c))
        # Sample-aligned 25ms speech envelopes across each cut, excluding codec boundary priming.
        size=min(len(original),len(actual)-round(c['start']*16000))
        a=[];b=[];offset=round(c['start']*16000)
        for begin in range(1600,size-1600,400):
            a.append(math.sqrt(sum(v*v for v in original[begin:begin+400])/400))
            b.append(math.sqrt(sum(v*v for v in actual[offset+begin:offset+begin+400])/400))
        assert len(a)>20
        ma,mb=sum(a)/len(a),sum(b)/len(b)
        denom=math.sqrt(sum((v-ma)**2 for v in a)*sum((v-mb)**2 for v in b));assert denom>1e-10,'Speech excerpt must carry non-silent audio'
        correlation=sum((x-ma)*(y-mb) for x,y in zip(a,b))/denom;assert correlation>.9,(id,correlation)
        correlations.append(correlation)
        for relative in [.5,1.5,2.5]:
            if relative>=duration(c):continue
            x=picture(source,c['in']+relative);y=picture(output,c['start']+relative)
            assert len(x)==len(y)==43200
            error=sum(abs(a-b) for a,b in zip(x,y))/len(x);assert error<25,(id,relative,error)
            pixels.append(error)
    gap_start=clips[0]['start']+duration(clips[0]);gap_end=clips[1]['start'];assert gap_end-gap_start>.45
    gap=actual[round((gap_start+.1)*16000):round((gap_end-.1)*16000)]
    assert gap and math.sqrt(sum(v*v for v in gap)/len(gap))<.002,'Interior gap remains silent'
    blank=picture(output,(gap_start+gap_end)/2);assert sum(blank)/len(blank)<4,'Interior gap remains black'
    results.append({'id':id,'build':ui['build'],'inputSHA256':fixture['sha256'],'inputTranscoded':False,'originalBundleSHA256Verified':True,'measuredVariableTiming':probe['packetTiming']['measuredVariableTiming'],'sourceRotationSideData':next(s for s in probe['metadata']['streams'] if s['codec_type']=='video').get('side_data_list',[]),'sourceEditListCount':len(probe['editLists']),'freshPageReopen':ui['freshPageReopen'],'fullOutputDecode':True,'frames':len(times),'seconds':total,'pictureErrors':pixels,'speechEnvelopeCorrelations':correlations,'gapSilenceAndBlack':True})
report={'status':'passed','fixtures':results,'cameraVFRVerified':probes['cameraVFRVerified'],'scope':'Two owner-published unchanged camera originals; actual Web trim/split/gap/bundle/reopen/H264AAC output. Speech envelope timing and pictures checked, not perceptual pitch quality or released Mac equivalence.'}
(root/'fixture-output-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
