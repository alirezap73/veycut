'use strict';
// Explicit frame timestamps and bounded audio windows; no playback clock or screen recording.
window.VeyCutOfflineExporter=(()=>{
  let localAacRegistered=false;
  const available=()=>!!(window.VideoEncoder&&window.VideoDecoder&&window.OfflineAudioContext&&window.Worker&&window.WebAssembly);
  async function exportTimeline(original,{signal,onProgress=()=>{},onState=()=>{}}){
    const check=()=>{if(signal.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');if(document.hidden)throw Error('Keep this tab visible during export.');};
    check();if(!available())throw Error('Frame export requires supported WebCodecs and offline audio.');
    const compositor=window.VeyCutCompositor,spec=compositor.resolveTransitions(original),duration=window.VeyCutExporter.validate(spec),encoding=window.VeyCutExporter.budget(duration,spec.quality),fps=spec.fps||30;
    onState('preparing');const MB=await import('./vendor/mediabunny.min.mjs');check();
    const quality=new MB.Quality({bitrate:encoding.videoBitsPerSecond}),videoCodec=spec.videoCodec||'avc',codecNames={avc:'H.264',hevc:'HEVC',av1:'AV1'};
    if(!codecNames[videoCodec])throw Error('Choose H.264, HEVC or AV1 for frame export.');
    if(!await MB.canEncodeVideo(videoCodec,{width:spec.width,height:spec.height,quality,frameRate:fps}))throw Error(codecNames[videoCodec]+' frame encoding is unavailable on this device. Choose H.264 or real-time export.');
    const nativeAac=await MB.canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48000});
    if(!nativeAac&&!localAacRegistered){const fallback=await import('./vendor/mediabunny-aac-encoder.min.mjs');fallback.registerAacEncoder();localAacRegistered=true;}
    const audioCodec=await MB.canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48000})?'aac':null;
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
      if(clip.kind==='image'){if(!(clip.file instanceof Blob))throw Error('Reconnect the image before frame export.');value.image=await createImageBitmap(clip.file);return value;}
      if(!['video','audio'].includes(clip.kind))return value;
      const media=await input(clip),track=tracks.get(clip.trackId)||{};
      if(clip.kind==='video'&&!clip.hidden&&track.visible!==false){
        const video=await media.getPrimaryVideoTrack();if(!video||!await video.canDecode())throw Error('Video codec is unavailable for frame export. Use real-time export.');
        const sink=new MB.CanvasSink(video,{poolSize:2});
        const times=function*(){const [first,last]=bounds(clip);for(let frame=Math.max(0,first);frame<last;frame++)yield compositor.sourceTime(clip,frame/fps);};
        value.video=sink.canvasesAtTimestamps(times());
      }
      if(!clip.muted&&!track.muted&&!compositor.isHold(clip)){
        const audio=await media.getPrimaryAudioTrack();
        if(audio){
          if(!await audio.canDecode()||await audio.getNumberOfChannels()>2)throw Error('This audio codec or channel layout needs real-time export.');
          if(clip.preservePitch!==false&&((clip.speed||1)!==1||clip.speedCurve?.length))throw Error('Pitch-preserved speed changes need real-time export.');
          value.audio=new MB.AudioBufferSink(audio);value.audioBuffers=[];value.audioIndex=0;
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
        check();const next=await value.audioIterator.next();check();
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
        const length=Math.max(1,Math.round((last-first)*rate)),buffer=offline.createBuffer(2,length,rate),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
        await prepareAudio(value,compositor.sourceTime(clip,first),compositor.sourceTime(clip,first+(length-1)/rate));
        for(let index=0;index<length;index++){if(index%2048===0)check();const pair=sample(value,compositor.sourceTime(clip,first+index/rate));left[index]=pair[0];right[index]=pair[1];}
        const source=offline.createBufferSource(),gain=offline.createGain();source.buffer=buffer;gain.connect(offline.destination);
        const pair={source,gain};window.VeyCutAudioFilters.rewire(offline,pair,clip.filters);
        const curve=new Float32Array(Math.max(2,Math.ceil((end-origin)*1000)+1)),track=tracks.get(clip.trackId)||{};
        for(let i=0;i<curve.length;i++)curve[i]=compositor.audioGain(clip,origin+(end-origin)*i/(curve.length-1),track);
        gain.gain.setValueCurveAtTime(curve,0,end-origin);source.start(first-origin);
      }
      const rendered=await offline.startRendering();check();const length=Math.round((end-begin)*rate),result=new AudioBuffer({length,numberOfChannels:2,sampleRate:rate}),offset=Math.round((begin-origin)*rate);
      for(let channel=0;channel<2;channel++)result.copyToChannel(rendered.getChannelData(channel).subarray(offset,offset+length),channel);
      return result;
    }
    async function dispose(id){const value=items.get(id);if(!value)return;await value.video?.return();await value.audioIterator?.return();value.image?.close();items.delete(id);sources.delete(id);}
    const abort=()=>{output?.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
    try{
      const fonts=spec.clips.filter(c=>c.kind==='text').map(c=>{const style=c.text||c.textStyle||{};return document.fonts.load(`${style.fontWeight||600} ${Math.max(1,(style.fontSize||.055)*spec.height)}px ${style.fontFamily||'system-ui'}`,'سلام VeyCut');});
      let fontTimer;try{await Promise.race([Promise.all(fonts),new Promise((_,reject)=>{fontTimer=setTimeout(()=>reject(Error('Fonts did not load for frame export.')),8000);})]);}finally{clearTimeout(fontTimer);}check();
      const target=new MB.StreamTarget(new WritableStream({write(value){check();writer.write(value);}}),{chunked:true,chunkSize:1024*1024});
      output=new MB.Output({format:new MB.Mp4OutputFormat({fastStart:false}),target});
      const video=new MB.CanvasSource(canvas,{codec:videoCodec,quality,frameRate:fps}),audio=new MB.AudioBufferSource({codec:audioCodec,quality:new MB.Quality({bitrate:128000})});
      output.addVideoTrack(video,{frameRate:fps});output.addAudioTrack(audio);await output.start();check();onState('rendering');
      let audioEnd=0;
      for(let frame=0;frame<frames;frame++){
        check();const time=frame/fps;
        const wanted=new Set();
        for(const clip of spec.clips){const [first,last]=bounds(clip);if(frame<first||frame>=last||['text','shape','audio'].includes(clip.kind))continue;wanted.add(clip.id);const value=await item(clip);if(value.image)sources.set(clip.id,value.image);else if(value.video){const next=await value.video.next();if(next.done||!next.value)throw Error('A source frame is missing at '+time.toFixed(3)+' seconds.');sources.set(clip.id,next.value.canvas);}}
        compositor.render(context,spec,time,sources);await video.add(time,Math.min(1/fps,duration-time));if(time>=audioEnd-1e-8){const end=Math.min(duration,audioEnd+1);await audio.add(await audioWindow(audioEnd,end));audioEnd=end;}check();onProgress(.98*(frame+1)/frames);
        for(const [id,value] of items)if(!wanted.has(id)&&time>compositor.start(value.clip)+compositor.duration(value.clip)+1.25)await dispose(id);
      }
      video.close();audio.close();await output.finalize();check();complete=true;
      const mime=await output.getMimeType(),blob=writer.blob(mime);onState('verifying');
      for(const id of [...items.keys()])await dispose(id);for(const media of inputs.values())media.dispose();inputs.clear();
      const verification=await window.VeyCutOutputCheck.verify(blob,{width:spec.width,height:spec.height,seconds:duration,fps,signal});check();onProgress(1);
      return {blob,mimeType:mime,encoding:{...encoding,videoCodec,audioCodec,audioEncoderBackend:localAacRegistered?'local-wasm':'browser',frames},precision:'fixed-frame-timestamps',verification,timing:{renderedFrames:frames,wallSeconds:(performance.now()-started)/1000,timelineSeconds:duration}};
    }catch(error){if(signal.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');throw error;}
    finally{signal.removeEventListener('abort',abort);if(output&&!complete)await output.cancel().catch(()=>{});for(const id of [...items.keys()])await dispose(id).catch(()=>{});for(const media of inputs.values())media.dispose();writer.clear();}
  }
  return Object.freeze({available,exportTimeline});
})();
