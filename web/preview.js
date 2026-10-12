'use strict';
// Browser resources stay outside project documents. One media element per clip
// allows overlapping video/audio to follow one canonical timeline clock.
window.VeyCutPreview = class {
  constructor(canvas,primary,{onTime=()=>{},onError=()=>{}}={}) {
    Object.assign(this,{canvas,primary,onTime,onError,sources:new Map(),nodes:new Map(),spec:null,media:null,selected:null,time:0,playing:false,frame:0,audio:null,syncUntil:0});
    this.meterTime=0;this.meterPeak=0;this.mix=null;this.meters=[];
    this.transport=event=>{
      if(event.type==='keydown'&&(/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)||event.target.isContentEditable||event.ctrlKey||event.metaKey||event.altKey))return;
      const action=event.type==='click'?event.currentTarget.id:({ArrowLeft:'transport-back',ArrowRight:'transport-forward',Home:'transport-start',End:'transport-end'})[event.key];
      if(!action||document.querySelector('#play')?.disabled)return;
      event.preventDefault();this.pause();const fps=this.spec?.fps||Number(document.querySelector('#project-fps')?.value)||30;
      const target=action==='transport-start'?0:action==='transport-end'?this.duration():this.time+(action==='transport-back'?-1:1)*(event.shiftKey?10:1)/fps;
      this.seek(target);
    };
    for(const id of ['transport-start','transport-back','transport-forward','transport-end'])document.getElementById(id)?.addEventListener('click',this.transport);
    document.addEventListener('keydown',this.transport);
    this.fontListener=()=>this.draw();document.fonts?.addEventListener('loadingdone',this.fontListener);
  }
  update(spec,media,selected) {
    this.pause();this.spec=window.VeyCutCompositor?.resolveTransitions(spec)||spec;this.media=media;this.selected=selected;
    this.seek(this.time);
  }
  ensureSources() {
    if(!this.spec)return;
    const tracks=new Map(this.spec.tracks.map(t=>[t.id,t]));
    const needed=this.spec.clips.filter(c=>['video','audio','image'].includes(c.kind)&&
      (c.id===this.selected||this.time>=c.start&&this.time<c.start+c.duration&&
       (c.kind==='audio'?!c.muted&&!tracks.get(c.trackId)?.muted:
        c.kind==='image'?tracks.get(c.trackId)?.visible!==false:
        tracks.get(c.trackId)?.visible!==false||!c.muted&&!tracks.get(c.trackId)?.muted)));
    if(needed.length>16)throw new Error('Preview supports at most 16 active/selected media layers.');
    const ids=new Set(needed.map(c=>c.id));const selectedSource=needed.find(c=>c.id===this.selected&&c.kind!=='image'&&this.media.get(c.mediaId)?.url);if(!selectedSource&&this.primary.hasAttribute('src')){this.primary.pause();this.primary.removeAttribute('src');delete this.primary.dataset.sourceUrl;this.primary.load();}
    for(const [cid,node]of this.sources)if(!ids.has(cid)){this.release(node);this.sources.delete(cid);}
    for(const c of needed){const m=this.media.get(c.mediaId);if(!m?.url)continue;
      let node=this.sources.get(c.id);const wantsPrimary=c.id===this.selected&&c.kind!=='image';
      if(node&&((node===this.primary)!==wantsPrimary||node.dataset.sourceUrl!==m.url)){this.release(node);this.sources.delete(c.id);node=null;}
      if(!node){node=c.kind==='image'?new Image():wantsPrimary?this.primary:document.createElement(c.kind==='audio'?'audio':'video');node.dataset.sourceUrl=m.url;
        if(c.kind==='image'){node.onload=()=>this.draw();node.onerror=()=>this.onError(new Error('Image decoding failed.'));}
        else {node.preload='auto';node.playsInline=true;
          if(!node.dataset.previewBound){node.addEventListener('loadeddata',()=>this.seek(this.time));node.addEventListener('seeked',()=>this.draw());node.addEventListener('error',()=>this.onError(new Error('Media decoding failed.')));node.dataset.previewBound='true';}
          if(node!==this.primary){node.style.display='none';document.body.append(node);}}
        node.src=m.url;if(node instanceof HTMLMediaElement)node.load();this.sources.set(c.id,node);
        if(this.audio&&node instanceof HTMLMediaElement&&!this.nodes.has(node))this.attachAudio(node);
      }
    }
  }
  attachAudio(node){const source=this.audio.createMediaElementSource(node),gain=this.audio.createGain();gain.gain.value=0;source.connect(gain).connect(this.mix);this.nodes.set(node,{source,gain});}
  release(node){if(node instanceof HTMLMediaElement){node.pause();const pair=this.nodes.get(node);if(pair&&node!==this.primary){pair.source.disconnect();pair.gain.disconnect();this.nodes.delete(node);}else if(pair)pair.gain.gain.value=0;if(node!==this.primary){node.removeAttribute('src');node.load();node.remove();}}else{node.onload=null;node.onerror=null;node.removeAttribute('src');}}
  ensureAudio(){if(!this.audio){
      this.audio=new (window.AudioContext||window.webkitAudioContext)();
      this.mix=this.audio.createGain();this.mix.channelCount=2;this.mix.channelCountMode='explicit';this.mix.connect(this.audio.destination);
      const split=this.audio.createChannelSplitter(2),silent=this.audio.createGain();silent.gain.value=0;silent.connect(this.audio.destination);this.mix.connect(split);
      this.meters=[0,1].map(channel=>{const analyser=this.audio.createAnalyser();analyser.fftSize=256;split.connect(analyser,channel);analyser.connect(silent);return{analyser,samples:new Float32Array(256)};});
    }for(const node of this.sources.values()){if(!(node instanceof HTMLMediaElement)||this.nodes.has(node))continue;this.attachAudio(node);}return this.audio.resume();}
  seek(time){this.time=Math.max(0,Math.min(time,this.duration()));this.syncUntil=performance.now()+150;this.sync();this.draw();this.onTime(this.time);}
  duration(){return this.spec?Math.max(0,...this.spec.clips.map(c=>c.start+c.duration)):0;}
  async play(){if(this.playing)return;if(this.time>=this.duration())this.seek(0);await this.ensureAudio();this.playing=true;this.epoch=performance.now();this.origin=this.time;this.tick();}
  pause(){this.playing=false;cancelAnimationFrame(this.frame);for(const node of this.sources.values())if(node instanceof HTMLMediaElement)node.pause();for(const pair of this.nodes.values())pair.gain.gain.value=0;this.measure(true);if(this.audio?.state==='running')this.audio.suspend().catch(()=>{});}
  measure(silent=false){
    if(!silent&&performance.now()-this.meterTime<100)return;this.meterTime=performance.now();
    const readings=this.meters.map(({analyser,samples})=>{if(silent)return{rms:0,peak:0};analyser.getFloatTimeDomainData(samples);let sum=0,peak=0;for(const sample of samples){sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}return{rms:Math.sqrt(sum/samples.length),peak};});
    for(const [channel,id]of ['audio-meter-left','audio-meter-right'].entries()){const meter=document.getElementById(id);if(meter){const rms=readings[channel]?.rms||0;meter.value=rms?Math.max(-60,Math.min(0,20*Math.log10(rms))):-60;}}
    const peak=Math.max(0,...readings.map(value=>value.peak));this.meterPeak=Math.max(this.meterPeak,peak);const status=document.getElementById('audio-peak-status');
    if(status){status.textContent=this.meterPeak?`${(20*Math.log10(this.meterPeak)).toFixed(1)} dBFS`:'−∞ dBFS';status.dataset.clipped=String(this.meterPeak>=1);status.dataset.livePeak=String(peak);}
  }
  sync(){if(!this.spec)return;this.ensureSources();const tracks=new Map(this.spec.tracks.map(t=>[t.id,t]));for(const c of this.spec.clips){const node=this.sources.get(c.id);if(!(node instanceof HTMLMediaElement))continue;const live=this.time>=c.start&&this.time<c.start+c.duration,track=tracks.get(c.trackId);if(!live){node.pause();this.nodes.get(node)?.gain.gain.setValueAtTime(0,this.audio.currentTime);continue;}
      const speed=c.speed||1,target=window.VeyCutCompositor?.sourceTime(c,this.time)??c.in+(this.time-c.start)*speed;node.playbackRate=speed;node.preservesPitch=c.preservePitch!==false;
      if(node.readyState>=1&&Math.abs(node.currentTime-target)>(this.playing?.15:.015)){this.syncUntil=performance.now()+150;try{node.currentTime=target;}catch{}}
      const gain=window.VeyCutCompositor?window.VeyCutCompositor.audioGain(c,this.time,track):c.muted||track?.muted?0:c.volume??1;
      const pair=this.nodes.get(node);if(pair)pair.gain.gain.value=gain;else node.volume=Math.min(1,gain);
      if(this.playing&&!window.VeyCutCompositor?.isHold(c)&&node.paused&&!node.dataset.playPending){node.dataset.playPending='true';node.play().catch(e=>this.onError(e)).finally(()=>delete node.dataset.playPending);}
    }}
  draw(){if(!this.spec)return;const pending=this.spec.clips.some(c=>['video','image'].includes(c.kind)&&this.time>=c.start&&this.time<c.start+c.duration&&this.spec.tracks.find(t=>t.id===c.trackId)?.visible!==false&&(!this.sources.get(c.id)||c.kind==='video'&&this.sources.get(c.id).readyState<2||c.kind==='image'&&!this.sources.get(c.id).complete));if(pending){const paint=this.canvas.getContext('2d');paint.fillStyle='#000';paint.fillRect(0,0,this.canvas.width,this.canvas.height);this.canvas.dataset.pending='true';return;}this.canvas.dataset.pending='false';const ctx=this.canvas.getContext('2d');if(window.VeyCutCompositor){try{window.VeyCutCompositor.render(ctx,{...this.spec,width:this.canvas.width,height:this.canvas.height},this.time,this.sources);}catch(error){this.pause();this.onError(error);}}else{ctx.fillStyle='#000';ctx.fillRect(0,0,this.canvas.width,this.canvas.height);const c=this.spec.clips.find(c=>c.id===this.selected),node=c&&this.sources.get(c.id);if(node instanceof HTMLVideoElement&&node.readyState>=2){const scale=Math.min(this.canvas.width/node.videoWidth,this.canvas.height/node.videoHeight);ctx.drawImage(node,0,0,node.videoWidth*scale,node.videoHeight*scale);}}}
  tick(){if(!this.playing)return;this.time=Math.min(this.duration(),this.origin+(performance.now()-this.epoch)/1000);try{this.sync();this.draw();}catch(error){this.pause();this.onError(error);return;}this.measure();this.onTime(this.time);if(this.time>=this.duration()){this.pause();return;}this.frame=requestAnimationFrame(()=>this.tick());}
  reset(){this.pause();for(const node of this.sources.values())this.release(node);this.sources.clear();this.primary.removeAttribute('src');delete this.primary.dataset.sourceUrl;this.primary.load();this.time=0;this.meterPeak=0;this.measure(true);}
  dispose(){document.removeEventListener('keydown',this.transport);for(const id of ['transport-start','transport-back','transport-forward','transport-end'])document.getElementById(id)?.removeEventListener('click',this.transport);document.fonts?.removeEventListener('loadingdone',this.fontListener);this.pause();for(const node of this.sources.values())this.release(node);this.sources.clear();if(this.audio)this.audio.close();}
};
