'use strict';
// Shared browser preview/export compositor. SDR Canvas output is not the
// native half-float HDR renderer. Unsupported native treatments fail export.
window.VeyCutCompositor = (() => {
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const number = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const start = clip => number(clip.timelineStart, number(clip.start, 0));
  const duration = clip => number(clip.duration,
    (number(clip.out, 0) - number(clip.in, 0)) / number(clip.speed, 1));
  const fraction = (clip, time) => clamp((time - start(clip)) / duration(clip), 0, 1);
  const blend = {normal:'source-over', '':'source-over', multiply:'multiply',
    screen:'screen', add:'lighter', lighten:'lighten', darken:'darken'};
  const effects = new Set(['concat.exposure', 'concat.contrast', 'concat.saturation']);
  const cache = new WeakMap();

  function ease(progress, control) {
    const named = {linear:[0,0,1,1], in:[.42,0,1,1], out:[0,0,.58,1], inOut:[.42,0,.58,1]};
    const values = typeof control === 'string' ? named[control] : control;
    if (!Array.isArray(values) || values.length !== 4 || !values.every(Number.isFinite)) return progress;
    const [x1,y1,x2,y2] = values;
    const cubic = (t,a,b) => 3*(1-t)*(1-t)*t*a + 3*(1-t)*t*t*b + t*t*t;
    let low=0, high=1;
    for (let i=0;i<24;i++) {
      const middle=(low+high)/2;
      if (cubic(middle,clamp(x1,0,1),clamp(x2,0,1)) < progress) low=middle; else high=middle;
    }
    return cubic((low+high)/2,y1,y2);
  }
  function sample(keys, at, base) {
    const run=(keys || []).filter(key => Number.isFinite(key.at) && Number.isFinite(key.value))
      .slice().sort((a,b)=>a.at-b.at);
    if (!run.length) return base;
    if (at <= run[0].at) return run[0].value;
    for (let i=1;i<run.length;i++) {
      if (at <= run[i].at) {
        const a=run[i-1], b=run[i];
        const progress=b.at===a.at ? 1 : (at-a.at)/(b.at-a.at);
        return a.value+(b.value-a.value)*ease(progress,b.ease);
      }
    }
    return run[run.length-1].value;
  }
  function valueAt(clip, property, time) {
    const fallback=['scale','opacity','volume','stretchX','stretchY'].includes(property)?1:0;
    return sample((clip.keys || []).filter(key=>key.property===property),fraction(clip,time),
      number(clip[property],fallback));
  }
  function audioGain(clip, time, track={}) {
    const elapsed=time-start(clip), length=duration(clip);
    if (clip.muted || track.muted || elapsed<0 || elapsed>=length) return 0;
    const rampIn=clip.fadeIn>0?clamp(elapsed/clip.fadeIn,0,1):1;
    const rampOut=clip.fadeOut>0?clamp((length-elapsed)/clip.fadeOut,0,1):1;
    return Math.max(0,valueAt(clip,'volume',time))*Math.min(rampIn,rampOut);
  }
  function validateClip(clip) {
    if (!['video','audio','image','text'].includes(clip.kind || 'video'))
      throw new Error('This clip kind is not rendered in the browser: '+clip.kind);
    if (clip.cutout || clip.speedCurve?.length || clip.reversed || clip.reverse || clip.shape)
      throw new Error('This clip requires a native treatment that is not yet available in browser export.');
    if (clip.audioStream != null) throw new Error('Selecting a native audio stream is not yet available in browser export.');
    if (Number(clip.text?.tracking || 0) !== 0) throw new Error('Native letter spacing is not yet available in browser export.');
    if (clip.transitionIn) throw new Error('Native transitions are not yet available in browser export.');
    if (!(clip.speed===undefined || Number.isFinite(clip.speed) && clip.speed>0 && clip.speed<=16))
      throw new Error('Unsupported playback speed.');
    if ((clip.filters || []).some(filter=>filter.enabled!==false))
      throw new Error('Native audio filters are not yet available in browser export.');
    if (!Object.hasOwn(blend,clip.blend || '')) throw new Error('Unsupported blend mode.');
    for (const effect of clip.videoEffects || []) {
      if (effect.enabled!==false && !effects.has(effect.id))
        throw new Error('This effect is not yet rendered in the browser: '+effect.id);
    }
    return true;
  }
  function filterPixels(pixels, treatments, at) {
    const enabled=treatments.filter(effect=>effect.enabled!==false);
    if (!enabled.length) return pixels;
    for (let i=0;i<pixels.length;i+=4) {
      let rgb=[pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255].map(v=>Math.pow(v,2.4));
      for (const effect of enabled) {
        const parameter = name => sample(effect.keys?.[name],at,number(effect.params?.[name],0));
        if (effect.id==='concat.exposure') rgb=rgb.map(v=>v*Math.pow(2,parameter('stops')));
        else if (effect.id==='concat.contrast') {
          const amount=1+parameter('amount')/100;
          rgb=rgb.map(v=>v>0?Math.min(65504,.18*Math.pow(Math.max(v,1e-10)/.18,amount)):v);
        } else if (effect.id==='concat.saturation') {
          const display=rgb.map(v=>Math.pow(Math.max(0,v),1/2.4));
          const grey=.2126*display[0]+.7152*display[1]+.0722*display[2];
          const s=parameter('amount')/100, amount=s>0?1+2*s:(1+s)*(1+s);
          rgb=display.map(v=>Math.pow(Math.max(0,grey+(v-grey)*amount),2.4));
        } else throw new Error('Unsupported effect: '+effect.id);
      }
      for (let channel=0;channel<3;channel++) pixels[i+channel]=Math.round(255*Math.pow(clamp(rgb[channel],0,1),1/2.4));
    }
    return pixels;
  }
  function layerCanvas(ctx, clip, source, spec, time) {
    const width=source.videoWidth || source.naturalWidth || source.width;
    const height=source.videoHeight || source.naturalHeight || source.height;
    if (!(width>0 && height>0)) throw new Error('No decoded picture for '+clip.id);
    const crop=clip.crop || {}, left=clamp(number(crop.left,0),0,.99), right=clamp(number(crop.right,0),0,.99);
    const top=clamp(number(crop.top,0),0,.99), bottom=clamp(number(crop.bottom,0),0,.99);
    const sw=width*(1-left-right), sh=height*(1-top-bottom);
    if (!(sw>0 && sh>0)) throw new Error('Crop removes the whole source picture.');
    const fit=Math.min(spec.width/sw,spec.height/sh);
    const w=Math.max(1,Math.round(sw*fit)), h=Math.max(1,Math.round(sh*fit));
    let canvas=cache.get(ctx);
    if (!canvas) {canvas=document.createElement('canvas');cache.set(ctx,canvas);}
    canvas.width=w;canvas.height=h;
    const paint=canvas.getContext('2d',{willReadFrequently:true});
    paint.drawImage(source,width*left,height*top,sw,sh,0,0,w,h);
    if ((clip.videoEffects || []).some(effect=>effect.enabled!==false)) {
      const image=paint.getImageData(0,0,w,h);
      filterPixels(image.data,clip.videoEffects,fraction(clip,time));
      paint.putImageData(image,0,0);
    }
    return canvas;
  }
  function text(ctx, clip, spec, time) {
    const style=clip.text || clip.textStyle;
    if (!style || !style.content) return;
    const font=Math.max(1,number(style.fontSize,.055)*spec.height);
    ctx.font=`${style.italic?'italic ':''}${number(style.fontWeight,600)} ${font}px ${style.fontFamily || 'system-ui, sans-serif'}`;
    const align=style.align || 'center';ctx.textAlign=align;ctx.textBaseline='middle';
    ctx.direction=/[\u0590-\u08ff]/.test(style.content)?'rtl':'ltr';
    const max=number(style.maxWidth,0)>0?style.maxWidth*spec.width:spec.width*.9;
    const rows=[];
    for (const paragraph of style.content.split('\n')) {
      let row='';
      for (const word of paragraph.split(' ')) {
        const next=row?row+' '+word:word;
        if (row && ctx.measureText(next).width>max) {rows.push(row);row=word;} else row=next;
      }
      rows.push(row);
    }
    const spacing=font*Math.max(.5,number(style.lineHeight,1.3));
    const x=spec.width*.5, y=spec.height*.5;
    const width=style.maxWidth>0?max:Math.min(max,Math.max(...rows.map(row=>ctx.measureText(row).width)));
    const left=align==='left'?x:align==='right'?x-width:x-width/2;
    const padX=number(style.backgroundPaddingX,.015)*spec.height;
    const padY=number(style.backgroundPaddingY,.01)*spec.height;
    const height=Math.max(rows.length*spacing,number(style.maxHeight,0)*spec.height);
    ctx.globalAlpha*=clamp(number(style.opacity,1),0,1);
    if (style.background) {
      ctx.fillStyle=style.background;ctx.beginPath();
      ctx.roundRect(left-padX,y-height/2-padY,width+2*padX,height+2*padY,
        Math.max(0,number(style.backgroundRadius,.01)*spec.height));ctx.fill();
    }
    ctx.lineJoin='round';ctx.fillStyle=style.color || '#fff';
    ctx.shadowColor=style.shadow?'#000':'transparent';ctx.shadowBlur=style.shadow?font*.08:0;
    rows.forEach((row,index)=>{
      const at=y+(index-(rows.length-1)/2)*spacing;
      if (style.strokeWidth>0) {ctx.strokeStyle=style.strokeColor || '#000';ctx.lineWidth=style.strokeWidth*spec.height;ctx.strokeText(row,x,at,max);}
      ctx.fillText(row,x,at,max);
    });
  }
  function legacyCaptions(ctx,spec,time) {
    const native=new Set(spec.clips.filter(clip=>clip.kind==='text').map(clip=>clip.id));
    const active=(spec.cues || []).filter(cue=>!native.has(cue.nativeId) && time>=cue.start && time<cue.end);
    if (!active.length) return;
    const content=active.map(cue=>cue.text).join('\n');
    ctx.save();ctx.translate(0,spec.height*.39);
    text(ctx,{text:{content,fontSize:.037,fontWeight:600,color:'#fff',strokeWidth:.005,strokeColor:'#000',maxWidth:.86}},spec,time);
    ctx.restore();
  }
  function render(ctx,spec,time,sources) {
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#000';ctx.fillRect(0,0,spec.width,spec.height);
    try {
    const tracks=spec.tracks || [];
    const clips=spec.clips.filter(clip=>clip.kind!=='audio' && time>=start(clip) && time<start(clip)+duration(clip))
      .slice().sort((a,b)=>tracks.findIndex(track=>track.id===a.trackId)-tracks.findIndex(track=>track.id===b.trackId));
    for (const clip of clips) {
      const track=tracks.find(track=>track.id===clip.trackId);
      if (track?.visible===false || clip.hidden) continue;
      ctx.save();
      try {
        ctx.globalAlpha=clamp(valueAt(clip,'opacity',time),0,1);
        ctx.globalCompositeOperation=blend[clip.blend || ''] || 'source-over';
        const x=spec.width*(.5+valueAt(clip,'offsetX',time));
        const y=spec.height*(.5+valueAt(clip,'offsetY',time));
        ctx.translate(x,y);ctx.rotate(valueAt(clip,'rotation',time)*Math.PI/180);
        const scale=Math.max(.001,valueAt(clip,'scale',time));
        ctx.scale(scale*valueAt(clip,'stretchX',time)*(clip.flipH?-1:1),scale*valueAt(clip,'stretchY',time)*(clip.flipV?-1:1));
        if (clip.kind==='text') {ctx.translate(-spec.width/2,-spec.height/2);text(ctx,clip,spec,time);}
        else {
          const source=sources.get(clip.id);
          if (!source) throw new Error('No prepared visual source for '+clip.id);
          const canvas=layerCanvas(ctx,clip,source,spec,time);
          ctx.drawImage(canvas,-canvas.width/2,-canvas.height/2);
        }
      } finally {ctx.restore();}
    }
    legacyCaptions(ctx,spec,time);
    } finally {ctx.restore();}
  }
  return Object.freeze({render,validateClip,audioGain,valueAt,start,duration,ease,filterPixels,
    supportedEffects:Object.freeze([...effects]),supportedBlends:Object.freeze(Object.keys(blend))});
})();
