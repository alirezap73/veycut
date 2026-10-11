'use strict';
// Real-time browser export. No uploads, remote codecs, or simulated output.
window.VeyCutExporter = (() => {
  const LIMITS = Object.freeze({seconds:120,longEdge:960,fps:30,bytes:64*1024*1024});
  function capability() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio || !window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    const mime = ['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm']
      .find(type => MediaRecorder.isTypeSupported(type));
    return mime ? {Audio,mime} : null;
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
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||Math.max(width,height)>LIMITS.longEdge)throw new Error('Export dimensions exceed the 960-pixel limit.');
    if(!clips.length)throw new Error('Import and arrange a video before exporting.');
    let end=0;
    for(const c of clips){if(!c.url||!c.url.startsWith('blob:'))throw new Error('Reconnect every original media file before exporting.');
      if(![c.start,c.in,c.out].every(Number.isFinite)||c.start<end-.00001||c.in<0||c.out-c.in<.05)throw new Error('Export requires non-overlapping video clips with valid source ranges.');end=c.start+c.out-c.in;}
    if(end<=0||end>LIMITS.seconds)throw new Error('Export supports timelines up to 120 seconds.');
    return end;
  }
  function captions(ctx,cues,time,width,height) {
    const active=cues.filter(c=>time>=c.start&&time<c.end);
    if(!active.length)return;
    const font=Math.max(14,Math.round(height*.037));ctx.font=`600 ${font}px system-ui, sans-serif`;ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineJoin='round';
    const rows=[];
    for(const cue of active){for(const line of cue.text.split('\n')){let row='';for(const word of line.split(' ')){const next=row?row+' '+word:word;if(row&&ctx.measureText(next).width>width*.86){rows.push(row);row=word;}else row=next;}rows.push(row);}}
    const visible=rows.slice(-8),bottom=height*.91;
    visible.forEach((text,index)=>{ctx.direction=/[\u0590-\u08ff]/.test(text)?'rtl':'ltr';const y=bottom-(visible.length-index-1)*font*1.3;ctx.lineWidth=Math.max(2,font*.13);ctx.strokeStyle='#000';ctx.strokeText(text,width/2,y,width*.9);ctx.fillStyle='#fff';ctx.fillText(text,width/2,y,width*.9);});
  }
  async function exportTimeline(spec,{signal:userSignal,onProgress=()=>{},onState=()=>{}}) {
    const controller=new AbortController(),signal=controller.signal;const userAbort=()=>controller.abort(cancelled());
    if(userSignal.aborted)throw cancelled();
    const duration=validate(spec),supported=capability();if(!supported)throw new Error('This browser cannot record WebM with canvas and source audio.');check(signal);
    // Resume starts synchronously in the export button's gesture. Audio is routed
    // only to the recording destination, never to speakers (no echo/monitoring).
    const audio=new supported.Audio({sampleRate:48000});const resumeAudio=audio.resume();
    const canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
    const ctx=canvas.getContext('2d',{alpha:false});
    const video=document.createElement('video');video.playsInline=true;video.preload='auto';video.setAttribute('aria-hidden','true');video.style.cssText='position:fixed;left:-10000px;top:0;width:2px;height:2px;';document.body.append(video);
    let stream=null,recorder=null,source=null,destination=null,animation=0,watchdog=0,bytes=0,chunks=[],failure=null,currentURL=null;
    const fail=error=>{failure=error;controller.abort(error);};
    userSignal.addEventListener('abort',userAbort,{once:true});
    const hide=()=>{if(document.hidden)fail(new Error('Export stopped because this tab became hidden.'));};document.addEventListener('visibilitychange',hide);
    const abort=()=>{video.pause();};signal.addEventListener('abort',abort,{once:true});
    const checkRun=()=>{check(signal);if(failure)throw failure;};
    function draw(time,showVideo){ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);if(showVideo&&video.readyState>=2){const scale=Math.min(canvas.width/video.videoWidth,canvas.height/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale;ctx.drawImage(video,(canvas.width-w)/2,(canvas.height-h)/2,w,h);}captions(ctx,spec.cues,time,canvas.width,canvas.height);}
    async function recording(active){checkRun();if(active&&recorder.state==='paused')await event(recorder,'resume',signal,()=>recorder.resume(),3000);else if(!active&&recorder.state==='recording')await event(recorder,'pause',signal,()=>recorder.pause(),3000);}
    async function prepare(clip){
      onState('preparing');video.pause();
      if(currentURL!==clip.url){
        currentURL=clip.url;
        await event(video,'loadedmetadata',signal,()=>{video.src=clip.url;video.load();});
        // Metadata is not a decoded frame. Prime actual playback while the
        // recorder is paused, then rewind to the exact requested source in.
        // Audio remains routed only into the paused recording destination.
        await event(video,'playing',signal,()=>video.play());
        video.pause();
      }
      if(clip.out>video.duration+.01)throw new Error('The selected source does not cover the saved clip range.');
      if(Math.abs(video.currentTime-clip.in)>.001)await event(video,'seeked',signal,()=>{video.currentTime=clip.in;});
      if(video.readyState<HTMLMediaElement.HAVE_CURRENT_DATA||video.videoWidth<=0||video.videoHeight<=0){
        throw new Error(`No decoded source frame after preparation (readyState=${video.readyState}, networkState=${video.networkState}, currentTime=${video.currentTime.toFixed(3)}, mediaError=${video.error?.code||'none'}).`);
      }
      checkRun();
    }
    function segment(begin,seconds,clip){return new Promise((resolve,reject)=>{let begun=performance.now(),lastMediaTime=video.currentTime,lastAdvance=begun;
      function stop(error){signal.removeEventListener('abort',abortSegment);cancelAnimationFrame(animation);error?reject(error):resolve();}
      const abortSegment=()=>stop(signal.reason instanceof Error?signal.reason:cancelled());signal.addEventListener('abort',abortSegment,{once:true});
      function tick(){try{checkRun();const now=performance.now(),elapsed=(now-begun)/1000;const position=clip?Math.max(0,video.currentTime-clip.in):elapsed;
        if(clip&&video.currentTime>lastMediaTime+.001){lastMediaTime=video.currentTime;lastAdvance=now;}
        if(clip&&(video.ended&&position<seconds-.06||now-lastAdvance>3000))throw new Error('Source playback stalled before the clip ended.');
        // Media time drives clip boundaries; gap time is a monotonic wall clock.
        // Real-time recording can still drift under load and is not frame exact.
        const at=begin+Math.min(seconds,position);draw(at,!!clip);onProgress(Math.min(1,at/duration));
        if(position>=seconds-.008){video.pause();stop();return;}animation=requestAnimationFrame(tick);
      }catch(error){stop(error);}}animation=requestAnimationFrame(tick);
    });}
    try {
      if(!ctx)throw new Error('Canvas rendering unavailable.');await resumeAudio;checkRun();
      destination=audio.createMediaStreamDestination();source=audio.createMediaElementSource(video);source.connect(destination);
      draw(0,false);const canvasStream=canvas.captureStream(LIMITS.fps);stream=new MediaStream([...canvasStream.getVideoTracks(),...destination.stream.getAudioTracks()]);
      recorder=new MediaRecorder(stream,{mimeType:supported.mime,videoBitsPerSecond:2000000,audioBitsPerSecond:128000});
      recorder.addEventListener('error',()=>fail(new Error('Browser recording failed.')));
      recorder.addEventListener('dataavailable',e=>{if(!e.data.size)return;bytes+=e.data.size;if(bytes>LIMITS.bytes){fail(new Error('Export exceeded the 64 MiB output limit.'));return;}chunks.push(e.data);});
      watchdog=setTimeout(()=>fail(new Error('Export exceeded its bounded wall-clock budget.')),duration*3000+30000);
      await event(recorder,'start',signal,()=>recorder.start(500),3000);await recording(false);
      let cursor=0;
      for(const clip of spec.clips){await prepare(clip);if(clip.start>cursor+.00001){onState('recording');draw(cursor,false);await recording(true);await segment(cursor,clip.start-cursor,null);await recording(false);}await prepare(clip);draw(clip.start,true);await video.play();checkRun();onState('recording');await recording(true);await segment(clip.start,clip.out-clip.in,clip);await recording(false);cursor=clip.start+clip.out-clip.in;}
      checkRun();await event(recorder,'stop',signal,()=>recorder.stop(),5000);checkRun();
      const blob=new Blob(chunks,{type:recorder.mimeType||supported.mime});if(!blob.size)throw new Error('The browser returned an empty recording.');
      onProgress(1);return {blob,mimeType:blob.type,width:spec.width,height:spec.height,requestedFps:LIMITS.fps,timelineSeconds:duration,audioSampleRate:audio.sampleRate,precision:'realtime'};
    } finally {
      clearTimeout(watchdog);cancelAnimationFrame(animation);document.removeEventListener('visibilitychange',hide);signal.removeEventListener('abort',abort);userSignal.removeEventListener('abort',userAbort);video.pause();if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch{}}
      if(stream)stream.getTracks().forEach(track=>track.stop());if(destination)destination.stream.getTracks().forEach(track=>track.stop());if(source)source.disconnect();video.removeAttribute('src');video.load();video.remove();await audio.close().catch(()=>{});chunks=[];
    }
  }
  return Object.freeze({capability,exportTimeline,LIMITS});
})();
