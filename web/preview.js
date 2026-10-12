'use strict';
// Browser resources stay outside project documents. One media element per clip
// allows overlapping video/audio to follow one canonical timeline clock.
window.VeyCutPreview = class {
  constructor(canvas,primary,{onTime=()=>{},onError=()=>{}}={}) {
    Object.assign(this,{canvas,primary,onTime,onError,sources:new Map(),nodes:new Map(),spec:null,media:null,selected:null,time:0,playing:false,frame:0,audio:null,syncUntil:0});
    this.fontListener=()=>this.draw();document.fonts?.addEventListener('loadingdone',this.fontListener);
  }
  update(spec,media,selected) {
    this.pause();this.spec=spec;this.media=media;this.selected=selected;
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
  attachAudio(node){const source=this.audio.createMediaElementSource(node),gain=this.audio.createGain();gain.gain.value=0;source.connect(gain).connect(this.audio.destination);this.nodes.set(node,{source,gain});}
  release(node){if(node instanceof HTMLMediaElement){node.pause();const pair=this.nodes.get(node);if(pair&&node!==this.primary){pair.source.disconnect();pair.gain.disconnect();this.nodes.delete(node);}else if(pair)pair.gain.gain.value=0;if(node!==this.primary){node.removeAttribute('src');node.load();node.remove();}}else{node.onload=null;node.onerror=null;node.removeAttribute('src');}}
  ensureAudio(){if(!this.audio)this.audio=new (window.AudioContext||window.webkitAudioContext)();for(const node of this.sources.values()){if(!(node instanceof HTMLMediaElement)||this.nodes.has(node))continue;this.attachAudio(node);}return this.audio.resume();}
  seek(time){this.time=Math.max(0,Math.min(time,this.duration()));this.syncUntil=performance.now()+150;this.sync();this.draw();this.onTime(this.time);}
  duration(){return this.spec?Math.max(0,...this.spec.clips.map(c=>c.start+c.duration)):0;}
  async play(){if(this.playing)return;if(this.time>=this.duration())this.seek(0);await this.ensureAudio();this.playing=true;this.epoch=performance.now();this.origin=this.time;this.tick();}
  pause(){this.playing=false;cancelAnimationFrame(this.frame);for(const node of this.sources.values())if(node instanceof HTMLMediaElement)node.pause();for(const pair of this.nodes.values())pair.gain.gain.value=0;}
  sync(){if(!this.spec)return;this.ensureSources();const tracks=new Map(this.spec.tracks.map(t=>[t.id,t]));for(const c of this.spec.clips){const node=this.sources.get(c.id);if(!(node instanceof HTMLMediaElement))continue;const live=this.time>=c.start&&this.time<c.start+c.duration,track=tracks.get(c.trackId);if(!live){node.pause();this.nodes.get(node)?.gain.gain.setValueAtTime(0,this.audio.currentTime);continue;}
      const speed=c.speed||1,target=c.in+(this.time-c.start)*speed;node.playbackRate=speed;node.preservesPitch=c.preservePitch!==false;
      if(node.readyState>=1&&Math.abs(node.currentTime-target)>(this.playing?.15:.015)){this.syncUntil=performance.now()+150;try{node.currentTime=target;}catch{}}
      const gain=window.VeyCutCompositor?window.VeyCutCompositor.audioGain(c,this.time,track):c.muted||track?.muted?0:c.volume??1;
      const pair=this.nodes.get(node);if(pair)pair.gain.gain.value=gain;else node.volume=Math.min(1,gain);
      if(this.playing&&node.paused&&!node.dataset.playPending){node.dataset.playPending='true';node.play().catch(e=>this.onError(e)).finally(()=>delete node.dataset.playPending);}
    }}
  draw(){if(!this.spec)return;const pending=this.spec.clips.some(c=>['video','image'].includes(c.kind)&&this.time>=c.start&&this.time<c.start+c.duration&&this.spec.tracks.find(t=>t.id===c.trackId)?.visible!==false&&(!this.sources.get(c.id)||c.kind==='video'&&this.sources.get(c.id).readyState<2||c.kind==='image'&&!this.sources.get(c.id).complete));if(pending){const paint=this.canvas.getContext('2d');paint.fillStyle='#000';paint.fillRect(0,0,this.canvas.width,this.canvas.height);this.canvas.dataset.pending='true';return;}this.canvas.dataset.pending='false';const ctx=this.canvas.getContext('2d');if(window.VeyCutCompositor){try{window.VeyCutCompositor.render(ctx,{...this.spec,width:this.canvas.width,height:this.canvas.height},this.time,this.sources);}catch(error){this.pause();this.onError(error);}}else{ctx.fillStyle='#000';ctx.fillRect(0,0,this.canvas.width,this.canvas.height);const c=this.spec.clips.find(c=>c.id===this.selected),node=c&&this.sources.get(c.id);if(node instanceof HTMLVideoElement&&node.readyState>=2){const scale=Math.min(this.canvas.width/node.videoWidth,this.canvas.height/node.videoHeight);ctx.drawImage(node,0,0,node.videoWidth*scale,node.videoHeight*scale);}}}
  tick(){if(!this.playing)return;this.time=Math.min(this.duration(),this.origin+(performance.now()-this.epoch)/1000);try{this.sync();this.draw();}catch(error){this.pause();this.onError(error);return;}this.onTime(this.time);if(this.time>=this.duration()){this.pause();return;}this.frame=requestAnimationFrame(()=>this.tick());}
  reset(){this.pause();for(const node of this.sources.values())this.release(node);this.sources.clear();this.primary.removeAttribute('src');delete this.primary.dataset.sourceUrl;this.primary.load();this.time=0;}
  dispose(){document.fonts?.removeEventListener('loadingdone',this.fontListener);this.pause();for(const node of this.sources.values())this.release(node);this.sources.clear();if(this.audio)this.audio.close();}
};
