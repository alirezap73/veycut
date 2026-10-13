'use strict';
// Explicit frame timestamps and bounded audio windows; no playback clock or screen recording.
window.VeyCutOfflineExporter=(()=>{
  let localAacRegistered=false;
  const available=()=>!!(window.VideoEncoder&&window.VideoDecoder&&window.OfflineAudioContext&&window.Worker&&window.WebAssembly);
  async function exportTimeline(original,{signal,onProgress=()=>{},onState=()=>{}}){
    let stopped=false;
    const check=()=>{if(stopped)throw Error('Export has stopped.');if(signal.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');if(document.hidden)throw Error('Keep this tab visible during export.');};
    function wait(promise,label,timeout=30000,lateDispose){
      check();return new Promise((resolve,reject)=>{
        let timer,settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',aborted);error?reject(error):resolve(value);};
        const aborted=()=>finish(signal.reason||new DOMException('Cancelled','AbortError'));
        signal.addEventListener('abort',aborted,{once:true});timer=setTimeout(()=>finish(Error('Timed out waiting for '+label+'.')),timeout);
        Promise.resolve(promise).then(value=>{if(settled){try{lateDispose?.(value);}catch{}return;}finish(null,value);},error=>finish(error));if(signal.aborted)aborted();
      });
    }
    async function closeResource(operation){let timer;try{await Promise.race([Promise.resolve().then(operation),new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);}catch{}finally{clearTimeout(timer);}}
    check();if(!available())throw Error('Frame export requires supported WebCodecs and offline audio.');
    const compositor=window.VeyCutCompositor,spec=compositor.resolveTransitions(original),duration=window.VeyCutExporter.validate(spec),encoding=window.VeyCutExporter.budget(duration,spec.quality),fps=spec.fps||30;
    onState('preparing');const MB=await wait(import('./vendor/mediabunny.min.mjs'),'video codec module');check();
    const quality=new MB.Quality({bitrate:encoding.videoBitsPerSecond}),videoCodec=spec.videoCodec||'avc',codecNames={avc:'H.264',hevc:'HEVC',av1:'AV1'};
    if(!codecNames[videoCodec])throw Error('Choose H.264, HEVC or AV1 for frame export.');
    if(!await wait(MB.canEncodeVideo(videoCodec,{width:spec.width,height:spec.height,quality,frameRate:fps}),'video encoder capability'))throw Error(codecNames[videoCodec]+' frame encoding is unavailable on this device. Choose H.264 or real-time export.');
    // Use the bundled encoder on every platform: its actual packet PTS
    // carries priming into the MP4 edit list, with no guessed browser delay.
    if(!localAacRegistered){const fallback=await wait(import('./vendor/mediabunny-aac-encoder.min.mjs'),'AAC codec module');fallback.registerAacEncoder();localAacRegistered=true;}
    const audioCodec=await wait(MB.canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48000}),'AAC encoder capability')?'aac':null;
    if(!audioCodec)throw Error('No supported frame-export audio encoder. Use real-time export.');
    const canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('Canvas rendering is unavailable.');
    const inputs=new Map(),items=new Map(),sources=new Map(),tracks=new Map((spec.tracks||[]).map(t=>[t.id,t]));
    let output=null,complete=false;const writer=window.VeyCutBlobWriter.create(window.VeyCutExporter.LIMITS.bytes);const started=performance.now(),frames=Math.ceil(duration*fps-1e-8);
    const bounds=c=>[Math.ceil(compositor.start(c)*fps-1e-8),Math.ceil((compositor.start(c)+compositor.duration(c))*fps-1e-8)];
    async function input(clip){
      if(inputs.has(clip.mediaId))return inputs.get(clip.mediaId);
      if(!(clip.file instanceof Blob))throw Error('Reconnect original media before frame export.');
      const value=new MB.Input({source:new MB.BlobSource(clip.file),formats:MB.ALL_FORMATS});inputs.set(clip.mediaId,value);return value;
    }
    async function item(clip){
      if(items.has(clip.id))return items.get(clip.id);
      const value={clip};items.set(clip.id,value);
      if(clip.kind==='image'){if(!(clip.file instanceof Blob))throw Error('Reconnect the image before frame export.');value.image=await wait(createImageBitmap(clip.file),'source image',30000,bitmap=>bitmap.close());return value;}
      if(!['video','audio'].includes(clip.kind))return value;
      const media=await input(clip),track=tracks.get(clip.trackId)||{};
      if(clip.kind==='video'&&!clip.hidden&&track.visible!==false){
        const video=await wait(media.getPrimaryVideoTrack(),'video track');if(!video||!await wait(video.canDecode(),'video decoder capability'))throw Error('Video codec is unavailable for frame export. Use real-time export.');
        const sink=new MB.CanvasSink(video,{poolSize:2});
        const times=function*(){const [first,last]=bounds(clip);for(let frame=Math.max(0,first);frame<last;frame++)yield compositor.sourceTime(clip,frame/fps);};
        value.video=sink.canvasesAtTimestamps(times());
      }
      if(!clip.muted&&!track.muted&&!compositor.isHold(clip)){
        const audio=await wait(media.getPrimaryAudioTrack(),'audio track');
        if(audio){
          if(!await wait(audio.canDecode(),'audio decoder capability')||await audio.getNumberOfChannels()>2)throw Error('This audio codec or channel layout needs real-time export.');
          const curved=Array.isArray(clip.speedCurve)&&clip.speedCurve.length>0;if(clip.preservePitch!==false&&curved&&clip.speedCurve.some(p=>!Number.isFinite(p.speed)||p.speed<.25||p.speed>4))throw Error('Pitch-preserved frame export supports ramp speeds from 0.25 to 4.');
          if(clip.preservePitch!==false&&!curved&&(clip.speed||1)!==1&&((clip.speed||1)<.25||(clip.speed||1)>4))throw Error('Pitch-preserved frame export supports constant speeds from 0.25 to 4. Use real-time export for this speed.');
          value.audio=new MB.AudioBufferSink(audio);value.audioBuffers=[];value.audioIndex=0;
          if(clip.preservePitch!==false&&(curved||(clip.speed||1)!==1)){
            const {createPitchStream}=await wait(import('./pitch-stream.js'),'pitch module'),rate=48000,sourceFrames=Math.round((clip.out-clip.in)*rate),outputFrames=Math.round((compositor.start(clip)+compositor.duration(clip))*rate)-Math.round(compositor.start(clip)*rate);
            const sourceAtFrame=curved?frame=>frame>outputFrames?sourceFrames+(frame-outputFrames)*compositor.speedAt(clip,compositor.start(clip)+compositor.duration(clip)):(compositor.sourceTime(clip,compositor.start(clip)+compositor.duration(clip)*frame/outputFrames)-clip.in)*sourceFrames/(clip.out-clip.in):undefined;
            value.pitch=await createPitchStream({sampleRate:rate,tempo:curved?compositor.speedAt(clip,compositor.start(clip)):clip.speed,sourceFrames,outputFrames,sourceAtFrame,check,feed:async(first,count)=>{
              const origin=clip.in+first/rate;await prepareAudio(value,origin,origin+(count-1)/rate);const data=new Float32Array(count*2);
              for(let index=0;index<count;index++){if(index%2048===0)check();const pair=sample(value,origin+index/rate);data[index*2]=pair[0];data[index*2+1]=pair[1];}return data;
            }});
          }
        }
      }
      return value;
    }
    async function prepareAudio(value,first,last){
      // Decode sequentially once. Random getBuffer calls create a decoder per compressed packet.
      if(!value.audioIterator)value.audioIterator=value.audio.buffers(first);
      value.audioBuffers=value.audioBuffers.filter(w=>w.timestamp+w.buffer.duration>first);
      let tail=value.audioBuffers.at(-1);
      while(!value.audioEnded&&(!tail||tail.timestamp+tail.buffer.duration<=last)){
        check();const next=await wait(value.audioIterator.next(),'source audio');check();
        if(next.done){value.audioEnded=true;break;}
        value.audioBuffers.push(next.value);tail=next.value;
      }
      value.audioIndex=0;
    }
    function sample(value,at){
      const list=value.audioBuffers,pair=value.pair||(value.pair=[0,0]);
      while(value.audioIndex+1<list.length&&list[value.audioIndex+1].timestamp<=at)value.audioIndex++;
      const wrapped=list[value.audioIndex];
      if(!wrapped||at<wrapped.timestamp||at>=wrapped.timestamp+wrapped.buffer.duration){pair[0]=pair[1]=0;return pair;}
      const buffer=wrapped.buffer,index=Math.max(0,Math.min(buffer.length-1,(at-wrapped.timestamp)*buffer.sampleRate)),first=Math.floor(index),next=Math.min(buffer.length-1,first+1),mix=index-first;
      for(let channel=0;channel<2;channel++){const data=buffer.getChannelData(Math.min(channel,buffer.numberOfChannels-1));pair[channel]=data[first]*(1-mix)+data[next]*mix;}return pair;
    }
    async function audioWindow(begin,end){
      // Feed-forward echo is bounded to 1 s; extra history lets filters/compression settle.
      const origin=Math.max(0,begin-1.25),rate=48000,count=Math.round((end-origin)*rate),offline=new OfflineAudioContext(2,count,rate);
      for(const clip of spec.clips){
        if(!['video','audio'].includes(clip.kind))continue;
        const first=Math.max(origin,compositor.start(clip)),last=Math.min(end,compositor.start(clip)+compositor.duration(clip));if(last<=first)continue;
        const value=await item(clip);if(!value.audio)continue;
        const firstFrame=Math.round(first*rate),lastFrame=Math.round(last*rate),length=lastFrame-firstFrame;if(length<=0)continue;const buffer=offline.createBuffer(2,length,rate),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
        if(value.pitch){const clipFrame=Math.round(compositor.start(clip)*rate),samples=await wait(value.pitch.read((firstFrame-clipFrame)/rate,(lastFrame-clipFrame)/rate),'pitch audio');if(samples.length!==length*2)throw Error('Pitch window length does not match the timeline.');for(let index=0;index<length;index++){left[index]=samples[index*2];right[index]=samples[index*2+1];}}
        else{await prepareAudio(value,compositor.sourceTime(clip,Math.max(compositor.start(clip),firstFrame/rate)),compositor.sourceTime(clip,(lastFrame-1)/rate));
          for(let index=0;index<length;index++){if(index%2048===0)check();const pair=sample(value,compositor.sourceTime(clip,Math.max(compositor.start(clip),(firstFrame+index)/rate)));left[index]=pair[0];right[index]=pair[1];}}

        const source=offline.createBufferSource(),gain=offline.createGain();source.buffer=buffer;gain.connect(offline.destination);
        const pair={source,gain};window.VeyCutAudioFilters.rewire(offline,pair,clip.filters);
        const curve=new Float32Array(Math.max(2,Math.ceil((end-origin)*1000)+1)),track=tracks.get(clip.trackId)||{};
        for(let i=0;i<curve.length;i++)curve[i]=compositor.audioGain(clip,origin+(end-origin)*i/(curve.length-1),track);
        gain.gain.setValueCurveAtTime(curve,0,end-origin);source.start((firstFrame-Math.round(origin*rate))/rate);
      }
      const rendered=await wait(offline.startRendering(),'offline audio rendering');check();const length=Math.round((end-begin)*rate),result=new AudioBuffer({length,numberOfChannels:2,sampleRate:rate}),offset=Math.round((begin-origin)*rate);
      for(let channel=0;channel<2;channel++)result.copyToChannel(rendered.getChannelData(channel).subarray(offset,offset+length),channel);
      return result;
    }
    function stopInputs(){for(const media of inputs.values()){try{media.dispose();}catch{}}inputs.clear();}
    async function dispose(id){const value=items.get(id);if(!value)return;items.delete(id);sources.delete(id);try{value.pitch?.dispose();}catch{}try{value.image?.close();}catch{}await Promise.all([closeResource(()=>value.video?.return()),closeResource(()=>value.audioIterator?.return())]);}

    const abort=()=>{output?.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
    try{
      const fonts=spec.clips.filter(c=>c.kind==='text').map(c=>{const style=c.text||c.textStyle||{};return document.fonts.load(`${style.fontWeight||600} ${Math.max(1,(style.fontSize||.055)*spec.height)}px ${style.fontFamily||'system-ui'}`,'سلام VeyCut');});
      let fontTimer;try{await Promise.race([Promise.all(fonts),new Promise((_,reject)=>{fontTimer=setTimeout(()=>reject(Error('Fonts did not load for frame export.')),8000);})]);}finally{clearTimeout(fontTimer);}check();
      const target=new MB.StreamTarget(new WritableStream({write(value){check();writer.write(value);}}),{chunked:true,chunkSize:1024*1024});
      output=new MB.Output({format:new MB.Mp4OutputFormat({fastStart:false}),target});
      const video=new MB.CanvasSource(canvas,{codec:videoCodec,quality,frameRate:fps}),audio=new MB.AudioBufferSource({codec:audioCodec,quality:new MB.Quality({bitrate:128000})});
      output.addVideoTrack(video,{frameRate:fps});output.addAudioTrack(audio);await wait(output.start(),'encoder start');check();onState('rendering');
      let audioEnd=0;
      for(let frame=0;frame<frames;frame++){
        check();const time=frame/fps;
        const wanted=new Set();
        for(const clip of spec.clips){const [first,last]=bounds(clip);if(frame<first||frame>=last||['text','shape','audio'].includes(clip.kind))continue;wanted.add(clip.id);const value=await item(clip);if(value.image)sources.set(clip.id,value.image);else if(value.video){const next=await wait(value.video.next(),'source video frame');if(next.done||!next.value)throw Error('A source frame is missing at '+time.toFixed(3)+' seconds.');sources.set(clip.id,next.value.canvas);}}
        compositor.render(context,spec,time,sources);await wait(video.add(time,Math.min(1/fps,duration-time)),'encoded video frame');if(time>=audioEnd-1e-8){const end=Math.min(duration,audioEnd+1);await wait(audio.add(await audioWindow(audioEnd,end)),'encoded audio window');audioEnd=end;}check();onProgress(.98*(frame+1)/frames);
        for(const [id,value] of items)if(!wanted.has(id)&&time>compositor.start(value.clip)+compositor.duration(value.clip)+1.25)await dispose(id);
      }
      video.close();audio.close();await wait(output.finalize(),'MP4 finalization');check();complete=true;
      const mime=await output.getMimeType(),blob=writer.blob(mime);onState('verifying');
      stopInputs();for(const id of [...items.keys()])await dispose(id);
      const verification=await window.VeyCutOutputCheck.verify(blob,{width:spec.width,height:spec.height,seconds:duration,fps,signal});check();onProgress(1);
      return {blob,mimeType:mime,encoding:{...encoding,videoCodec,audioCodec,audioEncoderBackend:localAacRegistered?'local-wasm':'browser',frames},precision:'fixed-frame-timestamps',verification,timing:{renderedFrames:frames,wallSeconds:(performance.now()-started)/1000,timelineSeconds:duration}};
    }catch(error){if(signal.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');throw error;}
    finally{signal.removeEventListener('abort',abort);stopped=true;stopInputs();if(output&&!complete)await closeResource(()=>output.cancel());await Promise.all([...items.keys()].map(id=>dispose(id)));writer.clear();}
  }
  return Object.freeze({available,exportTimeline});
})();
