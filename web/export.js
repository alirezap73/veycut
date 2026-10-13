'use strict';
// Real-time browser export. No uploads, remote codecs, or simulated output.
window.VeyCutExporter = (() => {
  const LIMITS = Object.freeze({seconds:600,longEdge:1920,fps:30,bytes:256*1024*1024,simultaneous:16});
  const PROFILES=Object.freeze({compact:Object.freeze({videoBitsPerSecond:2000000}),balanced:Object.freeze({videoBitsPerSecond:5000000}),detailed:Object.freeze({videoBitsPerSecond:8000000})});
  function budget(seconds,quality='compact'){
    const profile=PROFILES[quality];if(!profile)throw Error('Choose a supported export quality.');
    if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid export duration.');
    const estimatedBytes=Math.ceil(seconds*(profile.videoBitsPerSecond+128000)/8*1.05);
    return {quality,videoBitsPerSecond:profile.videoBitsPerSecond,audioBitsPerSecond:128000,estimatedBytes,maxSeconds:Math.min(LIMITS.seconds,Math.floor(LIMITS.bytes*8/(profile.videoBitsPerSecond+128000)/1.05)),fits:estimatedBytes<=LIMITS.bytes};
  }
  function capability(format='webm') {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio || !window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    if(!['webm','mp4'].includes(format))return null;
    const types = format==='mp4' ? ['video/mp4;codecs=avc1.42001f,mp4a.40.2','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc3.42001f,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4;codecs=avc1.420028,mp4a.40.2','video/mp4;codecs=avc1.42001f,opus','video/mp4;codecs=avc1,opus'] : ['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'];
    const mime = types
      .find(type => MediaRecorder.isTypeSupported(type));
    return mime ? {Audio,mime,audioCodec:mime.includes('mp4a')?'AAC':'Opus',videoCodec:format==='mp4'?'H.264':mime.includes('vp9')?'VP9':'VP8'} : null;
  }
  const cancelled = () => new DOMException('Export cancelled','AbortError');
  function check(signal) {if(signal.aborted)throw signal.reason instanceof Error?signal.reason:cancelled();if(document.hidden)throw new Error('Keep this tab visible during real-time export.');}
  function event(target,name,signal,trigger,timeout=15000) {
    return new Promise((resolve,reject) => {
      const diagnostics=()=>target instanceof HTMLMediaElement?`readyState=${target.readyState}, networkState=${target.networkState}, currentTime=${target.currentTime.toFixed(3)}, paused=${target.paused}, seeking=${target.seeking}, mediaError=${target.error?target.error.code+': '+target.error.message:'none'}, hidden=${document.hidden}`:`state=${target.state||'unknown'}, hidden=${document.hidden}`;
      const timer=setTimeout(()=>finish(new Error(`Media preparation timed out waiting for ${name} (${diagnostics()}).`)),timeout);
      function finish(error){clearTimeout(timer);target.removeEventListener(name,ready);target.removeEventListener('error',fail);signal.removeEventListener('abort',abort);error?reject(error):resolve();}
      const ready=()=>finish(), fail=()=>finish(new Error(`Media failed waiting for ${name} (${diagnostics()}).`)), abort=()=>finish(signal.reason instanceof Error?signal.reason:cancelled());
      target.addEventListener(name,ready,{once:true});target.addEventListener('error',fail,{once:true});signal.addEventListener('abort',abort,{once:true});
      try{check(signal);const result=trigger();if(result&&typeof result.catch==='function')result.catch(error=>finish(new Error(`Media ${name}: ${error.message} (${diagnostics()}).`)));}catch(error){finish(error);}
    });
  }
  function validate(spec) {
    const {width,height,clips}=spec;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width%2||height%2||Math.max(width,height)>LIMITS.longEdge)throw new Error('Export dimensions exceed the 1920-pixel limit or are not even.');
    if(!clips.length)throw new Error('Import and arrange media before exporting.');
    if(spec.fps!==undefined && ![24,25,30,60].includes(spec.fps))throw new Error('Choose an export frame rate of 24, 25, 30 or 60.');
    const compositor=window.VeyCutCompositor;
    if(!compositor)throw new Error('The shared browser compositor did not load.');
    let end=0;
    const ids=new Set();
    for(const c of clips){
      compositor.validateClip(c);
      if(ids.has(c.id))throw new Error('Duplicate clip identity in export.');ids.add(c.id);
      const begin=compositor.start(c), seconds=compositor.duration(c);
      if(!Number.isFinite(begin)||!Number.isFinite(seconds)||begin<0||seconds<1/60)throw new Error('Invalid timeline range.');
      if(!['text','shape'].includes(c.kind) && (!c.url||!c.url.startsWith('blob:')))throw new Error('Reconnect every original media file before exporting.');
      if(['video','audio'].includes(c.kind||'video') && !compositor.isHold(c) && (!Number.isFinite(c.in)||!Number.isFinite(c.out)||c.in<0||c.out-c.in<.05))throw new Error('Invalid source range.');
      end=Math.max(end,begin+seconds);
    }
    if(end<=0||end>LIMITS.seconds)throw new Error('Export supports timelines up to 600 seconds.');
    if(!budget(end,spec.quality).fits)throw Error('This quality would exceed the output budget. Choose Compact or shorten the timeline.');
    const times=clips.flatMap(c=>[compositor.start(c),compositor.start(c)+compositor.duration(c)]);
    for(const time of times){
      const count=clips.filter(c=>!['text','shape'].includes(c.kind)&&time>=compositor.start(c)&&time<compositor.start(c)+compositor.duration(c)).length;
      if(count>LIMITS.simultaneous)throw new Error('Export supports at most 16 simultaneous media layers.');
    }
    return end;
  }
  async function exportTimeline(spec,{signal:userSignal,onProgress=()=>{},onState=()=>{}}) {
    const controller=new AbortController(),signal=controller.signal;const userAbort=()=>controller.abort(cancelled());
    if(userSignal.aborted)throw cancelled();
    spec=window.VeyCutCompositor.resolveTransitions(spec);const duration=validate(spec),supported=capability(spec.format);if(!supported)throw new Error('This browser cannot record the selected format with canvas and source audio.');check(signal);
    // Resume starts synchronously in the export button's gesture. Audio is routed
    // only to the recording destination, never to speakers (no echo/monitoring).
    const audio=new supported.Audio({sampleRate:48000});const resumeAudio=audio.resume();
    const canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
    const ctx=canvas.getContext('2d',{alpha:false});
    const compositor=window.VeyCutCompositor;
    const prepared=new Map(),sources=new Map(),clipsById=new Map(spec.clips.map(c=>[c.id,c])),tracksById=new Map((spec.tracks||[]).map(t=>[t.id,t]));
    let stream=null,captureTrack=null,recorder=null,destination=null,silence=null,animation=0,watchdog=0,bytes=0,chunks=[],failure=null;
    let recordingComplete=false,recordedFrom=null,recordedSeconds=0,maxSourceDrift=0,maxRenderGap=0,drawnFrames=0;
    const fail=error=>{failure=error;controller.abort(error);};
    userSignal.addEventListener('abort',userAbort,{once:true});
    const hide=()=>{if(document.hidden)fail(new Error('Export stopped because this tab became hidden.'));};document.addEventListener('visibilitychange',hide);
    const abort=()=>{for(const item of prepared.values())item.element.pause?.();};signal.addEventListener('abort',abort,{once:true});
    const checkRun=()=>{check(signal);if(failure)throw failure;if(!recordingComplete&&audio.state!=='running')throw Error('The audio clock stopped; export was cancelled to protect timing.');if(!recordingComplete&&stream?.getTracks().some(track=>track.readyState!=='live'))throw Error('An output media track ended before export completed.');};
    function gains(time){
      for(const [id,item] of prepared){
        if(item.gain){
          const clip=clipsById.get(id),track=tracksById.get(clip.trackId)||{};
          item.gain.gain.setValueAtTime(compositor.audioGain(clip,time,track),audio.currentTime);
        }
      }
    }
    function draw(time){
      compositor.render(ctx,spec,time,sources);drawnFrames++;gains(time);
      captureTrack?.requestFrame();
    }
    async function recording(active){
      checkRun();
      if(active&&recorder.state==='paused'){await event(recorder,'resume',signal,()=>recorder.resume(),3000);recordedFrom=audio.currentTime;}
      else if(!active&&recorder.state==='recording'){
        await event(recorder,'pause',signal,()=>recorder.pause(),3000);
        if(recordedFrom!==null)recordedSeconds+=audio.currentTime-recordedFrom;recordedFrom=null;
      }
    }
    function dispose(id){
      const item=prepared.get(id);if(!item)return;
      item.element.pause?.();item.node?.disconnect();for(const filter of item.filterNodes||[])filter.disconnect();item.gain?.disconnect();
      item.element.removeAttribute('src');item.element.load?.();item.element.remove();
      prepared.delete(id);sources.delete(id);
    }
    async function prepare(time){
      onState('preparing');
      const active=spec.clips.filter(c=>time>=compositor.start(c)&&time<compositor.start(c)+compositor.duration(c));
      const wanted=new Set(active.map(c=>c.id));
      for(const id of [...prepared.keys()])if(!wanted.has(id))dispose(id);
      for(const clip of active){
        if(['text','shape'].includes(clip.kind))continue;
        let item=prepared.get(clip.id);
        if(!item){
          const element=document.createElement(clip.kind==='image'?'img':clip.kind==='audio'?'audio':'video');
          element.setAttribute('aria-hidden','true');element.style.cssText='position:fixed;left:-10000px;top:0;width:2px;height:2px;';document.body.append(element);
          item={element};prepared.set(clip.id,item);sources.set(clip.id,element);
          if(clip.kind==='image')await event(element,'load',signal,()=>{element.src=clip.url;});
          else {
            element.preload='auto';element.playsInline=true;element.playbackRate=compositor.speedAt(clip,time);
            element.preservesPitch=clip.preservePitch!==false;
            await event(element,'loadedmetadata',signal,()=>{element.src=clip.url;element.load();});
            item.node=audio.createMediaElementSource(element);item.gain=audio.createGain();item.gain.gain.value=0;
            item.gain.connect(destination);item.source=item.node;window.VeyCutAudioFilters.rewire(audio,item,clip.filters);
            await event(element,'playing',signal,()=>element.play());element.pause();
          }
        }
        if(clip.kind==='video'||clip.kind==='audio'||!clip.kind){
          item.element.playbackRate=compositor.speedAt(clip,time);
          const at=compositor.sourceTime(clip,time);
          if((!compositor.isHold(clip)&&clip.out>item.element.duration+.01)||at>item.element.duration-.001)throw new Error('The selected source does not cover the saved clip range.');
          if(Math.abs(item.element.currentTime-at)>.001)await event(item.element,'seeked',signal,()=>{item.element.currentTime=at;});
          if(item.element.readyState<HTMLMediaElement.HAVE_CURRENT_DATA)throw new Error('No decoded source after preparation.');
        }
        checkRun();
      }
      return active;
    }
    async function play(active){await Promise.all(active.map(clip=>{const item=prepared.get(clip.id);return item?.element.play&&!compositor.isHold(clip)?item.element.play():undefined;}));}
    function segment(begin,seconds,begun){return new Promise((resolve,reject)=>{
      let lastTick=begun,lastPaint=Math.floor(begin*(spec.fps||LIMITS.fps));
      function stop(error){signal.removeEventListener('abort',abortSegment);cancelAnimationFrame(animation);error?reject(error):resolve();}
      const abortSegment=()=>stop(signal.reason instanceof Error?signal.reason:cancelled());signal.addEventListener('abort',abortSegment,{once:true});
      function tick(){try{
        checkRun();const now=audio.currentTime,gap=now-lastTick;lastTick=now;maxRenderGap=Math.max(maxRenderGap,gap);
        if(gap>.35)throw Error('Rendering stalled; export was cancelled to protect timing.');
        const elapsed=now-begun,at=begin+Math.min(seconds,elapsed);
        for(const [id,item] of prepared){
          const clip=clipsById.get(id);
          if(item.element.play && item.element.error)throw new Error('Source decoding failed: '+clip.id);
          if(item.element.play){
            const expected=compositor.sourceTime(clip,at);
            item.element.playbackRate=compositor.speedAt(clip,at);
            if(item.element.ended && expected<clip.out-.06)
              throw new Error('Source ended before the saved clip range; export was cancelled.');
            if(item.element.seeking || item.element.readyState<HTMLMediaElement.HAVE_CURRENT_DATA){
              item.unreadySince ??= audio.currentTime;
              if(audio.currentTime-item.unreadySince>.35)
                throw new Error('Source decoding stalled; export was cancelled to protect timing.');
            }else{
              item.unreadySince=null;
              const drift=Math.abs(item.element.currentTime-expected);maxSourceDrift=Math.max(maxSourceDrift,drift);
              if(!item.element.ended && drift>.35)
                throw new Error('Source playback drifted; output was cancelled to protect timing.');
            }
          }
        }
        const paintTime=Math.min(begin+seconds-.000001,at),frame=Math.floor(at*(spec.fps||LIMITS.fps));
        if(frame>lastPaint||elapsed>=seconds-.004){draw(paintTime);lastPaint=frame;}else gains(paintTime);
        onProgress(.98*Math.min(1,at/duration));
        if(elapsed>=seconds-.004){stop();return;}animation=requestAnimationFrame(tick);
      }catch(error){stop(error);}}animation=requestAnimationFrame(tick);
    });}
    try {
      if(!ctx)throw new Error('Canvas rendering unavailable.');await resumeAudio;checkRun();
      destination=audio.createMediaStreamDestination();
      // Keep the audio recording track clocked before any source is prepared,
      // and across empty timeline gaps. Some recorders wait for both their
      // first video frame and first audio packet before emitting `start`.
      silence=audio.createConstantSource();silence.offset.value=0;
      silence.connect(destination);silence.start();
      if(document.fonts){
        const fonts=[...new Set(spec.clips.filter(c=>c.kind==='text').map(c=>{
          const style=c.text||c.textStyle||{};
          return `${style.italic?'italic ':''}${style.fontWeight||600} ${Math.max(1,(style.fontSize||.055)*spec.height)}px ${style.fontFamily||'system-ui'}`;
        }))];
        let fontTimer;
        try{await Promise.race([Promise.all(fonts.map(font=>document.fonts.load(font,'سلام VeyCut'))),
          new Promise((_,reject)=>{fontTimer=setTimeout(()=>reject(new Error('Text fonts did not load within the export budget.')),8000);})]);}
        finally{clearTimeout(fontTimer);}checkRun();
      }
      // Prepare the real first frame before recording, so source preparation
      // cannot become a fake black frame at the head of the downloaded file.
      await prepare(.0000001);draw(0);
      let canvasStream=canvas.captureStream(0);captureTrack=canvasStream.getVideoTracks()[0];
      if(typeof captureTrack?.requestFrame!=='function'){
        canvasStream.getTracks().forEach(track=>track.stop());captureTrack=null;
        canvasStream=canvas.captureStream(spec.fps||LIMITS.fps);
      }
      stream=new MediaStream([...canvasStream.getVideoTracks(),...destination.stream.getAudioTracks()]);
      recorder=new MediaRecorder(stream,{mimeType:supported.mime,videoBitsPerSecond:budget(duration,spec.quality).videoBitsPerSecond,audioBitsPerSecond:128000});
      recorder.addEventListener('error',()=>fail(new Error('Browser recording failed.')));
      recorder.addEventListener('dataavailable',e=>{if(!e.data.size)return;bytes+=e.data.size;if(bytes>LIMITS.bytes){fail(new Error('Export exceeded the 256 MiB output limit.'));return;}chunks.push(e.data);});
      watchdog=setTimeout(()=>fail(new Error('Export exceeded its bounded wall-clock budget.')),duration*3000+30000);
      // A drawing made before captureStream cannot provide its first captured
      // frame. Feed the real initial black/gap frame after recording starts;
      // keep feeding only until the bounded start event completes.
      let startupFrame=0;
      try {
        await event(recorder,'start',signal,()=>{
          recorder.start(500);
          const firstFrames=()=>{
            draw(0);
            startupFrame=requestAnimationFrame(firstFrames);
          };
          firstFrames();
        },3000);
      } finally {cancelAnimationFrame(startupFrame);}recordedFrom=audio.currentTime;
      await recording(false);
      // Generated text/shape changes need no decoder preparation. Keeping
      // their cue boundaries inside one recording segment avoids hundreds of
      // pause/resume cycles in a long captioned video.
      const boundaries=[...new Set([0,duration,...spec.clips.filter(c=>!['text','shape'].includes(c.kind)).flatMap(c=>[compositor.start(c),compositor.start(c)+compositor.duration(c)])])].sort((a,b)=>a-b);
      for(let index=0;index<boundaries.length-1;index++){
        const begin=boundaries[index],seconds=boundaries[index+1]-begin;
        if(seconds<=0)continue;
        const active=await prepare(begin+.0000001);draw(begin);checkRun();
        await recording(true);const begun=audio.currentTime;draw(begin);onState('recording');await play(active);await segment(begin,seconds,begun);await recording(false);
        for(const item of prepared.values())item.element.pause?.();
      }
      checkRun();await event(recorder,'stop',signal,()=>recorder.stop(),5000);checkRun();
      let blob=new Blob(chunks,{type:recorder.mimeType||supported.mime});if(!blob.size)throw new Error('The browser returned an empty recording.');
      if(spec.format==='mp4'&&!blob.type.startsWith('video/mp4'))throw Error('The browser did not produce the selected MP4 format.');
      if(blob.type.startsWith('video/mp4')){const header=new Uint8Array(await blob.slice(0,12).arrayBuffer());if(header.length<12||String.fromCharCode(...header.slice(4,8))!=='ftyp')throw Error('The browser returned an invalid MP4 container.');}
      if(Math.abs(recordedSeconds-duration)>.5)throw Error('Recording accumulated too much timing error; no output was downloaded.');
      recordingComplete=true;clearTimeout(watchdog);
      for(const id of [...prepared.keys()])dispose(id);
      if(silence){silence.stop();silence.disconnect();silence=null;}
      if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
      if(destination){destination.stream.getTracks().forEach(track=>track.stop());destination=null;}
      await audio.close();chunks=[];checkRun();onState('verifying');
      if(blob.type.startsWith('video/webm'))blob=await window.VeyCutWebmMetadata.withDuration(blob,recordedSeconds);
      if(blob.size>LIMITS.bytes)throw Error('Final output exceeded the 256 MiB output limit.');
      const verification=await window.VeyCutOutputCheck.verify(blob,{width:spec.width,height:spec.height,seconds:duration,fps:spec.fps||LIMITS.fps,signal});checkRun();
      onProgress(1);return {encoding:budget(duration,spec.quality),blob,mimeType:blob.type,width:spec.width,height:spec.height,requestedFps:spec.fps||LIMITS.fps,timelineSeconds:duration,audioSampleRate:audio.sampleRate,precision:'realtime',verification,timing:{recordedSeconds,maxSourceDrift,maxRenderGap,drawnFrames,captureMode:captureTrack?'manual':'automatic'}};
    } finally {
      clearTimeout(watchdog);cancelAnimationFrame(animation);document.removeEventListener('visibilitychange',hide);signal.removeEventListener('abort',abort);userSignal.removeEventListener('abort',userAbort);for(const item of prepared.values())item.element.pause?.();if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch{}}
      if(silence){silence.stop();silence.disconnect();}if(stream)stream.getTracks().forEach(track=>track.stop());if(destination)destination.stream.getTracks().forEach(track=>track.stop());for(const id of [...prepared.keys()])dispose(id);if(audio.state!=='closed')await audio.close().catch(()=>{});chunks=[];
    }
  }
  return Object.freeze({capability,exportTimeline,validate,LIMITS,PROFILES,budget,formats:()=>['webm','mp4'].filter(format=>capability(format))});
})();
