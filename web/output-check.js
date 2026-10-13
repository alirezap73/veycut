'use strict';
// Decode checkpoints before offering a recording for download. This is a
// browser readback, not a proof that every output frame is correct.
window.VeyCutOutputCheck=(()=>{
  async function verify(blob,{width,height,seconds,fps,signal}){
    const video=document.createElement('video'),url=URL.createObjectURL(blob);
    video.muted=true;video.playsInline=true;video.preload='auto';video.setAttribute('aria-hidden','true');
    video.style.cssText='position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:2147483647';
    document.body.append(video);
    const check=()=>{if(signal.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');};
    function wait(name,trigger){return new Promise((resolve,reject)=>{
      let timer;
      const finish=error=>{clearTimeout(timer);video.removeEventListener(name,ready);video.removeEventListener('error',failed);signal.removeEventListener('abort',aborted);error?reject(error):resolve();};
      const ready=()=>finish(),failed=()=>finish(Error('The recorded video could not be decoded.')),aborted=()=>finish(signal.reason||new DOMException('Cancelled','AbortError'));
      video.addEventListener(name,ready,{once:true});video.addEventListener('error',failed,{once:true});signal.addEventListener('abort',aborted,{once:true});
      timer=setTimeout(()=>finish(Error('Output verification timed out waiting for '+name+'.')),10000);
      try{check();trigger();}catch(error){finish(error);}
    });}
    async function frame(at){
      let callback=0,timer=0,abortFrame;
      const presented=typeof video.requestVideoFrameCallback==='function';
      let decoded=Promise.resolve(null);
      if(presented)decoded=new Promise((resolve,reject)=>{
        const finish=(error,metadata)=>{clearTimeout(timer);video.cancelVideoFrameCallback(callback);signal.removeEventListener('abort',abortFrame);error?reject(error):resolve(metadata.mediaTime);};
        abortFrame=()=>finish(signal.reason||new DOMException('Cancelled','AbortError'));
        signal.addEventListener('abort',abortFrame,{once:true});
        timer=setTimeout(()=>finish(Error('The recorded video did not present its verification frame.')),10000);
        callback=video.requestVideoFrameCallback((_,metadata)=>finish(null,metadata));
      });
      // Catch both waits immediately so a decoding error cannot leave an unhandled rejection.
      try{
        const [,mediaTime]=await Promise.all([wait('seeked',()=>{video.currentTime=at;}),decoded]);
        check();if(video.readyState<HTMLMediaElement.HAVE_CURRENT_DATA)throw Error('The recorded video has no decoded verification frame.');
        if(presented&&Math.abs(mediaTime-at)>.3)throw Error('The recorded video is missing frames near '+at.toFixed(2)+' seconds.');
        return mediaTime;
      }finally{clearTimeout(timer);if(callback)video.cancelVideoFrameCallback(callback);if(abortFrame)signal.removeEventListener('abort',abortFrame);}
    }
    try{
      await wait('loadedmetadata',()=>{video.src=url;video.load();});check();
      if(video.videoWidth!==width||video.videoHeight!==height)throw Error('Recorded dimensions do not match the export settings.');
      if(!Number.isFinite(video.duration)||Math.abs(video.duration-seconds)>.5)throw Error('Recorded duration does not match the timeline.');
      if(seconds>120&&typeof video.requestVideoFrameCallback!=='function')throw Error('This browser cannot verify long exports. Try a current Chromium browser.');
      const margin=Math.min(seconds/4,Math.max(.1,3/fps));
      await frame(margin);await frame(seconds/2);const decodedEnd=await frame(seconds-margin);
      return {duration:video.duration,decodedEnd,frameCallbacks:decodedEnd!==null,checkpoints:3};
    }finally{video.pause();video.removeAttribute('src');video.load();video.remove();URL.revokeObjectURL(url);}
  }
  return Object.freeze({verify});
})();
