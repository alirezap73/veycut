"""Extract documented human speech ONLY on GitHub, with bounded streaming I/O.

Read the complete compressed archive to verify the pinned publisher MD5; retain
only two small original FLAC members, their transcripts and PCM derivatives.
Never download the archive, speech, models, or decode media on the laptop.
"""
import argparse, hashlib, json, os, struct, subprocess, tarfile, time, urllib.error, urllib.request
from pathlib import Path, PurePosixPath


class BoundedHashReader:
    def __init__(self, response, limit):
        self.response=response
        self.limit=limit
        self.bytes=0
        self.md5=hashlib.md5()
        self.sha256=hashlib.sha256()
        self.started=time.monotonic()
    def read(self,size=-1):
        if time.monotonic()-self.started>900:
            raise RuntimeError('Archive streaming exceeded 15 minute bound')
        if size<0:size=1024*1024
        data=self.response.read(size)
        self.bytes+=len(data)
        if self.bytes>self.limit:raise RuntimeError('Archive exceeded its download budget')
        self.md5.update(data);self.sha256.update(data)
        return data


def flac_info(header):
    if len(header)<42 or header[:4]!=b'fLaC' or header[4]&127!=0 or int.from_bytes(header[5:8],'big')!=34:
        raise RuntimeError('Missing original FLAC STREAMINFO')
    packed=int.from_bytes(header[18:26],'big')
    rate=packed>>44
    channels=((packed>>41)&7)+1
    bits=((packed>>36)&31)+1
    samples=packed&((1<<36)-1)
    return {'sampleRate':rate,'channels':channels,'bitsPerSample':bits,'samples':samples,'seconds':samples/rate}


def command(args):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
    if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace')[-6000:])
    return p.stdout


def extract(config,root,url):
    selected=[];speakers=set();transcripts={};notices={}
    request=urllib.request.Request(url,headers={'User-Agent':'VeyCut-fixture-check/0.3.1'})
    with urllib.request.urlopen(request,timeout=90) as response:
        stream=BoundedHashReader(response,config['maxArchiveBytes'])
        with tarfile.open(fileobj=stream,mode='r|gz') as archive:
            for member in archive:
                if not member.isfile():continue
                name=PurePosixPath(member.name)
                if name.is_absolute() or '..' in name.parts:raise RuntimeError('Unsafe archive member path')
                if member.size>config['maxMemberBytes']:
                    # Skip unrelated large members; do not extract or decode them.
                    continue
                if name.name.endswith('.trans.txt'):
                    raw=archive.extractfile(member).read()
                    for line in raw.decode('utf-8').splitlines():
                        if ' ' in line:
                            key,text=line.split(' ',1);transcripts[key]=text
                    continue
                if name.name in ('LICENSE.TXT','README.TXT','SPEAKERS.TXT','CHAPTERS.TXT'):
                    notices[name.name]=archive.extractfile(member).read()
                    continue
                if len(selected)>=2 or name.suffix!='.flac':continue
                identifier=name.stem
                speaker=identifier.split('-')[0]
                if not speaker.isdigit() or speaker in speakers:continue
                if len(name.parts)<3 or name.parts[0]!='LibriSpeech' or name.parts[1]!='test-clean':continue
                f=archive.extractfile(member);header=f.read(42);info=flac_info(header)
                if not (20.137931<=info['seconds']<=25 and info['sampleRate']>=16000 and info['channels']==1):continue
                original=header+f.read()
                if len(original)!=member.size:raise RuntimeError('Incomplete original archive member')
                target=root/name.name
                target.write_bytes(original)
                selected.append({'id':f'human-speech-{len(selected)+1}','speakerId':speaker,'archiveMember':member.name,'file':target.name,'bytes':len(original),'sha256':hashlib.sha256(original).hexdigest(),'originalFormat':info})
                speakers.add(speaker)
        # tar EOF can precede gzip/compressed EOF. Hash all remaining response bytes.
        while stream.read(1024*1024):pass
        if stream.md5.hexdigest()!=config['archiveMD5']:
            raise RuntimeError('Complete publisher archive MD5 mismatch')
        if len(selected)!=2:raise RuntimeError('Archive did not contain two qualifying distinct-speaker recordings')
        for item in selected:
            identifier=Path(item['file']).stem
            if identifier not in transcripts:raise RuntimeError('Publisher transcript missing for selected recording')
            item['publisherTranscript']=transcripts[identifier]
            (root/(item['id']+'-transcript.txt')).write_text(transcripts[identifier]+'\n')
        for filename,data in notices.items():(root/('SOURCE-'+filename)).write_bytes(data)
        return selected,{'url':url,'bytes':stream.bytes,'md5':stream.md5.hexdigest(),'sha256':stream.sha256.hexdigest(),'fullCompressedArchiveHashed':True,'archiveStoredLocally':False}


def main():
    if os.environ.get('GITHUB_ACTIONS')!='true':
        raise SystemExit('Speech media extraction/decoding is restricted to GitHub Actions.')
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',default='docs/evidence/human-speech-source.json')
    parser.add_argument('--output',default='output/human-speech')
    args=parser.parse_args()
    config=json.loads(Path(args.source).read_text())
    root=Path(args.output);root.mkdir(parents=True,exist_ok=True)
    failures=[]
    for url in [config['archiveURL'],*config['archiveMirrors']]:
        try:
            selected,archive=extract(config,root,url)
            break
        except (urllib.error.URLError,TimeoutError) as error:
            failures.append({'url':url,'error':str(error)[:300]})
    else:raise RuntimeError('All authoritative speech archive mirrors unavailable: '+json.dumps(failures))
    derivative=config['derivative']
    for item in selected:
        source=root/item['file'];wav=root/(item['id']+'-derived.wav')
        command(['ffmpeg','-v','error','-xerror','-threads','1','-i',str(source),'-f','null','-'])
        command(['ffmpeg','-v','error','-threads','1','-ss',str(derivative['sourceStartSeconds']),'-i',str(source),'-t',str(derivative['durationSeconds']),'-ac','2','-ar','48000','-c:a','pcm_s16le','-y',str(wav)])
        decoded=json.loads(command(['ffprobe','-v','error','-show_streams','-of','json',str(wav)]))['streams'][0]
        assert decoded['sample_rate']=='48000' and decoded['channels']==2 and decoded['codec_name']=='pcm_s16le'
        assert abs(float(decoded['duration'])-20)<.0001
        item['derivative']={**derivative,'file':wav.name,'bytes':wav.stat().st_size,'sha256':hashlib.file_digest(wav.open('rb'),'sha256').hexdigest(),'fullyDecodedOriginal':True}
    report={'schema':1,'status':'human-source-fixtures-extracted','license':config['license'],'licenseURL':config['licenseURL'],'attribution':config['attribution'],'sourcePage':config['sourcePage'],'archive':archive,'mirrorFailures':failures,'fixtures':selected,'scope':'Documented human-source corpus members and publisher transcripts; no application export, native comparison, ASR retention, or perceptual quality pass is implied.'}
    (root/'human-speech-fixture-report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report),flush=True)


if __name__=='__main__':main()
