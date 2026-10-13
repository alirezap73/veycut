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
  const param=(key,label,min,max,value,step=1)=>Object.freeze({key,label,min,max,default:value,step});
  const effectCatalog=Object.freeze([
    {id:'concat.exposure',name:'Exposure',params:[param('stops','Exposure',-4,4,0,.05)]},
    {id:'concat.contrast',name:'Contrast',params:[param('amount','Contrast',-100,100,0)]},
    {id:'concat.saturation',name:'Saturation',params:[param('amount','Saturation',-100,100,0)]},
    {id:'concat.warm',name:'Warm',params:[param('temperature','Temperature (K)',3000,6000,4600,50)]},
    {id:'concat.cool',name:'Cool',params:[param('temperature','Temperature (K)',7000,11000,8500,50)]},
    {id:'concat.vibrance',name:'Vibrance',params:[param('amount','Vibrance',.1,2,.7,.05)]},
    {id:'concat.posterize',name:'Posterize',params:[param('levels','Levels',2,8,4)]},
    {id:'concat.pixelate',name:'Pixelate',params:[param('size','Size (px)',2,64,16)]},
    {id:'concat.sharpen',name:'Sharpen',params:[param('amount','Amount',.2,3,1,.05)]},
    {id:'concat.gaussian-blur',name:'Gaussian blur',params:[param('radius','Radius (px)',1,50,10)]},
    {id:'concat.chroma-key',name:'Chroma key',params:[
      Object.freeze({...param('color','Screen colour',0,4294967295,11616511),type:'color'}),
      param('similarity','Similarity (%)',1,60,30),param('softness','Softness (%)',0,50,10),
      param('spill','Spill cleanup (%)',0,100,50)]},
    {id:'concat.mono',name:'Mono (no grain)',params:[param('colour','Colour filter',-100,100,40),param('contrast','Contrast',0,100,40),param('grain','Grain (not supported)',0,0,0)]},
    {id:'concat.vignette',name:'Vignette',params:[param('strength','Strength',10,100,50)]}
  ].map(entry=>Object.freeze({...entry,params:Object.freeze(entry.params)})));
  const effectDefaults=new Map(effectCatalog.map(entry=>[entry.id,Object.fromEntries(entry.params.map(p=>[p.key,p.default]))]));
  const effects=new Set(effectDefaults.keys());
  const transitionCatalog=Object.freeze([
    {id:'cross-fade',name:'Cross fade'}, {id:'concat.dissolve',name:'Dissolve'},
    {id:'fade-black',name:'Dip to black'}, {id:'fade-white',name:'Dip to white'}
  ].map(Object.freeze));
  const transitionIDs=new Set(transitionCatalog.map(entry=>entry.id));
  const shapeKinds=Object.freeze(['square','circle','triangle','parallelogram','trapezoid','line','arrow']);
  // These non-JSON symbols are renderer state, never project properties.
  const resolved=Symbol('resolvedTransitions'),lane=Symbol('renderLane'),hold=Symbol('transitionHold'),fade=Symbol('visualFade'),shades=Symbol('colourFades');

  const cache = new WeakMap();
  const shapeCache = new WeakMap();
  const stillCache = new WeakMap();
  let blurScratch=null;

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
  function isHold(clip){return clip[hold]===true;}
  function speedPoints(clip){
    const points=clip.speedCurve;
    if(!Array.isArray(points)||!points.length)return null;
    const sorted=points.map(p=>({at:p.at,speed:p.speed})).sort((a,b)=>a.at-b.at);
    if(sorted[0].at>0)sorted.unshift({at:0,speed:sorted[0].speed});
    if(sorted[sorted.length-1].at<1)sorted.push({at:1,speed:sorted[sorted.length-1].speed});
    return sorted;
  }
  function speedAt(clip,time){
    const points=speedPoints(clip);
    if(!points)return number(clip.speed,1);
    const x=fraction(clip,time);
    for(let i=1;i<points.length;i++)if(x<=points[i].at){
      const a=points[i-1],b=points[i];
      return b.at<=a.at?b.speed:a.speed+(b.speed-a.speed)*(x-a.at)/(b.at-a.at);
    }
    return points[points.length-1].speed;
  }
  function sourceTime(clip,time){
    const source=number(clip.in,number(clip.sourceStart,0));
    if(isHold(clip))return source;
    const points=speedPoints(clip);
    if(!points)return source+(time-start(clip))*number(clip.speed,1);
    const x=fraction(clip,time);let consumed=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];if(x<=a.at)break;
      const end=Math.min(x,b.at),rate=b.at<=a.at?b.speed:a.speed+(b.speed-a.speed)*(end-a.at)/(b.at-a.at);
      consumed+=(end-a.at)*(a.speed+rate)/2;if(x<=b.at)break;
    }
    return source+duration(clip)*consumed;
  }
  function timelineTime(clip,source){
    let low=start(clip),high=low+duration(clip);
    for(let i=0;i<40;i++){const mid=(low+high)/2;if(sourceTime(clip,mid)<source)low=mid;else high=mid;}
    return (low+high)/2;
  }
  function resolveTransitions(spec){
    if(spec[resolved])return spec;
    const fps=number(spec.fps,30);if(!(fps>0&&fps<=1000))throw new Error('Invalid transition frame rate.');
    const frame=1/fps,tracks=spec.tracks||[];
    const clips=spec.clips.map(c=>({...c,[lane]:tracks.findIndex(t=>t.id===c.trackId)*2}));
    const original=clips.slice(),cuts=[],ids=new Set(clips.map(c=>c.id));
    const visual=c=>c.kind!=='audio'&&!c.hidden&&tracks.find(t=>t.id===c.trackId)?.visible!==false;
    for(const incoming of original){if(!incoming.transitionIn||!visual(incoming))continue;
      if(!Number.isFinite(incoming.transitionIn.duration)||incoming.transitionIn.duration<0)throw new Error('Invalid transition duration.');
      if(!transitionIDs.has(incoming.transitionIn.id))throw new Error('Native transition is not available in browser export: '+incoming.transitionIn.id);
      const outgoing=original.find(other=>visual(other)&&other.trackId===incoming.trackId&&Math.abs(start(other)+duration(other)-start(incoming))<frame/2);
      if(outgoing&&outgoing!==incoming)cuts.push({incoming,outgoing,id:incoming.transitionIn.id,seconds:incoming.transitionIn.duration});
    }
    for(const cut of cuts){const a=cut.outgoing,b=cut.incoming,d=number(cut.seconds,NaN);if(!Number.isFinite(d)||d<0)throw new Error('Invalid transition duration.');
      if(cut.id==='fade-black'||cut.id==='fade-white'){
        const colour=cut.id==='fade-white'?1:0,half=d/2;
        const outgoingFrames=Math.max(1,Math.round(Math.min(half,duration(a))*fps)),incomingFrames=Math.max(1,Math.round(Math.min(half,duration(b))*fps));
        a[shades]=[...(a[shades]||[]),{kind:'out',colour,first:Math.max(0,Math.round(duration(a)*fps)-outgoingFrames),frames:outgoingFrames,fps}];
        b[shades]=[...(b[shades]||[]),{kind:'in',colour,frames:incomingFrames,fps}];continue;
      }
      const seconds=Math.min(d,duration(a),duration(b));if(seconds<frame)continue;
      const speed=number(b.speed,1),handle=b.kind==='image'?seconds:number(b.in,number(b.sourceStart,0))/speed;
      if(handle+frame/2>=seconds){
        // Match export::pre_roll: keys keep their normalized fractions;
        // extending the clip therefore changes their timeline positions.
        const extended=duration(b)+seconds;
        b.start=start(b)-seconds;b.timelineStart=b.start;b.duration=extended;b.in=number(b.in,number(b.sourceStart,0));
        if(b.kind!=='image'){b.in=Math.max(0,number(b.in,number(b.sourceStart,0))-seconds*speed);b.sourceStart=b.in;}
        b.out=b.in+b.duration*(b.kind==='video'||b.kind==='audio'?speed:1);b.fadeIn=Math.max(number(b.fadeIn,0),seconds);b[lane]=a[lane]+1;b[fade]=seconds;
      }else{
        const overlay={...b,start:start(b)-seconds,timelineStart:start(b)-seconds,duration:seconds,speed:1,muted:true,volume:0,fadeIn:0,fadeOut:0,transitionIn:null,[hold]:true,[lane]:a[lane]+1,[fade]:seconds};
        overlay.in=number(b.in,number(b.sourceStart,0));overlay.out=overlay.in+seconds;overlay.keys=[];
        // Native holds freeze decoded pixels and transform animation only.
        // Effect keys still sample the hold's own normalized duration.
        for(const property of ['scale','offsetX','offsetY','rotation','opacity']){const head=(b.keys||[]).filter(k=>k.property===property).sort((x,y)=>x.at-y.at)[0];if(head)overlay[property]=head.value;}
        let suffix=0;overlay.id=b.id+':transition-hold';while(ids.has(overlay.id))overlay.id=b.id+':transition-hold-'+(++suffix);ids.add(overlay.id);clips.push(overlay);
      }
    }
    return {...spec,clips,fps,[resolved]:true};
  }
  function transitionShading(clip,time){let scale=1,offset=0;for(const shape of clip[shades]||[]){const local=Math.round((time-start(clip))*shape.fps),amount=shape.kind==='out'?local>=shape.first?clamp((local-shape.first)/shape.frames,0,1):0:local<shape.frames?1-Math.max(local,0)/shape.frames:0;scale*=1-amount;offset=offset*(1-amount)+shape.colour*amount;}return{scale,offset};}
  function opacityAt(clip,time){return clamp(valueAt(clip,'opacity',time),0,1)*(clip[fade]?clamp((time-start(clip))/clip[fade],0,1):1);}
  function audioGain(clip, time, track={}) {
    const elapsed=time-start(clip), length=duration(clip);
    if (isHold(clip) || clip.muted || track.muted || elapsed<0 || elapsed>=length) return 0;
    const rampIn=clip.fadeIn>0?clamp(elapsed/clip.fadeIn,0,1):1;
    const rampOut=clip.fadeOut>0?clamp((length-elapsed)/clip.fadeOut,0,1):1;
    return Math.max(0,valueAt(clip,'volume',time))*Math.min(rampIn,rampOut);
  }
  function validateClip(clip) {
    if (!['video','audio','image','text','shape'].includes(clip.kind || 'video'))
      throw new Error('This clip kind is not rendered in the browser: '+clip.kind);
    if (clip.cutout || clip.reversed || clip.reverse)
      throw new Error('This clip requires a native treatment that is not yet available in browser export.');
    if(clip.kind==='shape'){
      const style=clip.shape||{};
      if(!shapeKinds.includes(style.kind||'square')||!Number.isFinite(style.size??.35)||(style.size??.35)<.01||(style.size??.35)>2||
        !Number.isFinite(style.strokeWidth??.012)||(style.strokeWidth??.012)<0||(style.strokeWidth??.012)>.5||
        [style.fill??'#ffffff',style.stroke??''].some(colour=>typeof colour!=='string'||colour!==''&&!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(colour)))
        throw new Error('Invalid shape style.');
    }else if(clip.shape)throw new Error('Shape styling requires a shape clip.');
    if(clip.speedCurve!=null){
      if(!Array.isArray(clip.speedCurve)||!clip.speedCurve.length||clip.speedCurve.length>1024||
        clip.speedCurve.some(p=>!p||!Number.isFinite(p.at)||p.at<0||p.at>1||!Number.isFinite(p.speed)||p.speed<.0625||p.speed>16))
        throw new Error('Invalid speed curve.');
      const covered=sourceTime(clip,start(clip)+duration(clip))-sourceTime(clip,start(clip));
      if(clip.out!=null&&Math.abs(covered-(clip.out-sourceTime(clip,start(clip))))>.05)
        throw new Error('Speed curve does not cover the saved source range.');
    }
    if (clip.audioStream != null) throw new Error('Selecting a native audio stream is not yet available in browser export.');
    if (Number(clip.text?.tracking || 0) !== 0) throw new Error('Native letter spacing is not yet available in browser export.');
    if (clip.transitionIn && (!transitionIDs.has(clip.transitionIn.id)||!Number.isFinite(clip.transitionIn.duration)||clip.transitionIn.duration<0)) throw new Error('Native transition is not available in browser export.');
    if (!(clip.speed===undefined || Number.isFinite(clip.speed) && clip.speed>0 && clip.speed<=16))
      throw new Error('Unsupported playback speed.');
    window.VeyCutAudioFilters.active(clip.filters);
    if (!Object.hasOwn(blend,clip.blend || '')) throw new Error('Unsupported blend mode.');
    for (const effect of clip.videoEffects || []) {
      if (effect.enabled!==false) {if(!effects.has(effect.id))throw new Error('This effect is not yet rendered in the browser: '+effect.id);parameters(effect,0);}
    }
    return true;
  }
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const luma=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  function kelvin(k){const t=clamp(k,1000,40000)/100;return t<=66?[1,clamp((99.4708*Math.log(t)-161.1196)/255,0,1),t<=19?0:clamp((138.5177*Math.log(t-10)-305.0448)/255,0,1)]:[clamp(329.6987*Math.pow(t-60,-.1332)/255,0,1),clamp(288.1222*Math.pow(t-60,-.0755)/255,0,1),1];}
  function parameters(effect,at){
    if(!effects.has(effect.id))throw new Error('Unsupported effect: '+effect.id);
    const defaults=effectDefaults.get(effect.id),result={};
    if(Object.values(effect.params||{}).some(value=>!Number.isFinite(value))||Object.values(effect.keys||{}).some(keys=>!Array.isArray(keys)||keys.some(key=>!Number.isFinite(key.at)||!Number.isFinite(key.value))))throw new Error('Invalid effect parameter or key.');
    for(const name of new Set([...Object.keys(effect.params||{}),...Object.keys(effect.keys||{})]))if(!Object.hasOwn(defaults,name))throw new Error('Unsupported effect parameter: '+name);
    for(const [name,base] of Object.entries(defaults))result[name]=sample(effect.keys?.[name],at,number(effect.params?.[name],base));
    if(effect.id==='concat.mono'&&(result.grain!==0||(effect.keys?.grain||[]).some(key=>key.value!==0)))throw new Error('Native animated grain is not available in the browser.');
    return result;
  }
  function spatialPixels(pixels,effect,geometry){
    const width=geometry.width,height=geometry.height;
    if(!(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width*height*4===pixels.length))
      throw new Error('Spatial effect requires exact image dimensions.');
    if(effect.id==='concat.pixelate'||effect.id==='concat.gaussian-blur'){
      // Native spatial packages filter scene-linear, premultiplied light.
      // Premultiply before bilinear interpolation: transparent RGB is not light.
      const light=new Float32Array(pixels.length);
      for(let i=0;i<pixels.length;i+=4){const alpha=pixels[i+3]/255;light[i+3]=alpha;for(let c=0;c<3;c++)light[i+c]=Math.pow(pixels[i+c]/255,2.4)*alpha;}
      const read=(data,w,h,x,y,result)=>{
        const xx=x-.5,yy=y-.5,firstX=Math.floor(xx),firstY=Math.floor(yy),fx=xx-firstX,fy=yy-firstY;
        const x0=clamp(firstX,0,w-1),x1=clamp(firstX+1,0,w-1),y0=clamp(firstY,0,h-1),y1=clamp(firstY+1,0,h-1);
        const a=(y0*w+x0)*4,b=(y0*w+x1)*4,c=(y1*w+x0)*4,d=(y1*w+x1)*4;
        for(let channel=0;channel<4;channel++)result[channel]=(data[a+channel]*(1-fx)+data[b+channel]*fx)*(1-fy)+(data[c+channel]*(1-fx)+data[d+channel]*fx)*fy;
        return result;
      };
      const write=(at,rgba)=>{const alpha=clamp(rgba[3],0,1);for(let c=0;c<3;c++)pixels[at+c]=255*Math.pow(clamp(rgba[c]/Math.max(alpha,1e-6),0,1),1/2.4);pixels[at+3]=alpha*255;};
      const tap=new Float64Array(4),sum=new Float64Array(4);
      if(effect.id==='concat.pixelate'){
        const size=clamp(Math.round(effect.p.size),2,64);
        for(let y=0;y<height;y+=size)for(let x=0;x<width;x+=size){
          sum.fill(0);
          // Sixteen bilinear taps at the native square's quarter-cell centres,
          // including clamped taps beyond a partial block at the frame edge.
          for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++){
            read(light,width,height,x+(xx+.5)*size/4,y+(yy+.5)*size/4,tap);
            for(let c=0;c<4;c++)sum[c]+=tap[c]/16;
          }
          for(let yy=y;yy<Math.min(y+size,height);yy++)for(let xx=x;xx<Math.min(x+size,width);xx++)write((yy*width+xx)*4,sum);
        }
      }else{
        const sigma=clamp(effect.p.radius,1,50),reach=3*sigma,pairs=Math.ceil(reach)+1;
        const shrink=Math.pow(2,Math.floor(Math.log2(Math.max(1,sigma/3))));
        const acrossWidth=Math.ceil(width/shrink),across=new Float32Array(acrossWidth*height*4);
        // Native across() reads source pixel centres through a +/-three-sigma
        // Gaussian. Pair weighting equals these individual premultiplied taps.
        const weights=centre=>{
          const first=Math.floor(centre-reach-.5)+.5,result=[];let total=0;
          for(let k=0;k<2*pairs;k++){const at=first+k,w=Math.exp(-(at-centre)*(at-centre)/(2*sigma*sigma));result.push([at,w]);total+=w;}
          return result.map(([at,w])=>[at,w/total]);
        };
        for(let x=0;x<acrossWidth;x++){
          const taps=weights((x+.5)*width/acrossWidth);
          for(let y=0;y<height;y++){
            sum.fill(0);for(const [at,w] of taps){read(light,width,height,at,y+.5,tap);for(let c=0;c<4;c++)sum[c]+=tap[c]*w;}
            across.set(sum,(y*acrossWidth+x)*4);
          }
        }
        const full=width/acrossWidth<1.5,downHeight=full?height:Math.ceil(height/shrink);
        const down=new Float32Array(acrossWidth*downHeight*4);
        for(let y=0;y<downHeight;y++){
          const taps=weights((y+.5)*height/downHeight);
          for(let x=0;x<acrossWidth;x++){
            sum.fill(0);for(const [at,w] of taps){read(across,acrossWidth,height,x+.5,at,tap);for(let c=0;c<4;c++)sum[c]+=tap[c]*w;}
            down.set(sum,(y*acrossWidth+x)*4);
          }
        }
        const backX=new Float64Array(4),backY=new Float64Array(4),backXY=new Float64Array(4);
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          const atX=(x+.5)*acrossWidth/width-.5,atY=(y+.5)*downHeight/height-.5;
          const insideX=clamp(atX,0,acrossWidth-1),insideY=clamp(atY,0,downHeight-1);
          read(down,acrossWidth,downHeight,insideX+.5,insideY+.5,sum);
          // The native final spread() continues the downsampled edge's slope
          // rather than flattening the outer half-pixel with clamp-to-edge.
          const overX=atX-insideX,overY=atY-insideY;
          if(overX||overY){
            const dx=Math.abs(overX),dy=Math.abs(overY),bx=-Math.sign(overX),by=-Math.sign(overY);
            read(down,acrossWidth,downHeight,insideX+bx+.5,insideY+.5,backX);
            read(down,acrossWidth,downHeight,insideX+.5,insideY+by+.5,backY);
            read(down,acrossWidth,downHeight,insideX+bx+.5,insideY+by+.5,backXY);
            for(let c=0;c<4;c++)sum[c]+=(sum[c]-backX[c])*dx+(sum[c]-backY[c])*dy+(sum[c]-backX[c]-backY[c]+backXY[c])*dx*dy;
          }
          write((y*width+x)*4,sum);
        }
      }
    }else if(effect.id==='concat.sharpen'){
      // A separable five-tap Gaussian gives the same 5x5 unsharp-mask
      // footprint as the native effect without 25 reads per output pixel.
      const kernel=[Math.exp(-2),Math.exp(-.5),1,Math.exp(-.5),Math.exp(-2)];
      const divisor=kernel.reduce((a,b)=>a+b,0),horizontal=new Float32Array(width*height*3);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){
        let sum=0;for(let k=-2;k<=2;k++)sum+=pixels[(y*width+clamp(x+k,0,width-1))*4+c]*kernel[k+2];
        horizontal[(y*width+x)*3+c]=sum/divisor;
      }
      const amount=clamp(effect.p.amount,.2,3);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){
        let sum=0;for(let k=-2;k<=2;k++)sum+=horizontal[(clamp(y+k,0,height-1)*width+x)*3+c]*kernel[k+2];
        const index=(y*width+x)*4+c,original=pixels[index];
        pixels[index]=original+(original-sum/divisor)*amount;
      }
    }
  }
  function filterPixels(pixels,treatments,at,geometry={},shading={scale:1,offset:0}) {
    const enabled=treatments.filter(effect=>effect.enabled!==false).map(effect=>({id:effect.id,p:parameters(effect,at)}));
    if(enabled.some(e=>e.id==='concat.pixelate'||e.id==='concat.sharpen'||e.id==='concat.gaussian-blur')){
      let segment=[];
      for(const effect of treatments.filter(e=>e.enabled!==false)){
        if(effect.id==='concat.pixelate'||effect.id==='concat.sharpen'||effect.id==='concat.gaussian-blur'){
          if(segment.length)filterPixels(pixels,segment,at,geometry);
          spatialPixels(pixels,{id:effect.id,p:parameters(effect,at)},geometry);
          segment=[];
        }else segment.push(effect);
      }
      return filterPixels(pixels,segment,at,geometry,shading);
    }
    if(enabled.some(e=>e.id==='concat.vignette')&&(!(geometry.width>0&&geometry.height>0)||geometry.width*geometry.height*4!==pixels.length))throw new Error('Vignette requires exact image dimensions.');
    const daylight=kelvin(6500);
    for(const e of enabled)if(e.id==='concat.warm'||e.id==='concat.cool'){const tint=kelvin(e.p.temperature).map((v,i)=>v/daylight[i]);e.gain=tint.map(v=>v/Math.max(luma(tint),.001));}
    for(let i=0;i<pixels.length;i+=4){
      let rgb=[pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255].map(v=>Math.pow(v,2.4));
      let alpha=pixels[i+3]/255;
      for(const e of enabled){const p=e.p;
        if(e.id==='concat.exposure')rgb=rgb.map(v=>v*Math.pow(2,p.stops));
        else if(e.id==='concat.contrast')rgb=rgb.map(v=>v>0?Math.min(65504,.18*Math.pow(Math.max(v,1e-10)/.18,1+p.amount/100)):v);
        else if(e.id==='concat.vignette'){
          const pixel=i/4,x=(pixel%geometry.width+.5)/geometry.width,y=(Math.floor(pixel/geometry.width)+.5)/geometry.height,s=p.strength/100;
          const fall=smooth(1.4-s*.9,1.6-s*.3,Math.hypot((x-.5)*2,(y-.5)*2));rgb=rgb.map(v=>v*Math.pow(1-fall*(.4+.6*s),2.4));
        }else{
          let display=rgb.map(v=>Math.pow(Math.max(0,v),1/2.4));
          if(e.id==='concat.saturation'){const grey=luma(display),s=p.amount/100,amount=s>0?1+2*s:(1+s)*(1+s);display=display.map(v=>grey+(v-grey)*amount);}
          else if(e.id==='concat.warm'||e.id==='concat.cool')display=display.map((v,j)=>v*e.gain[j]);
          else if(e.id==='concat.posterize'){const steps=clamp(Math.round(p.levels),2,8)-1;display=display.map(v=>Math.round(v*steps)/steps);}
          else if(e.id==='concat.chroma-key'){
            const color=clamp(Math.round(p.color),0,4294967295)>>>0;
            const key=[(color>>>24)/255,((color>>>16)&255)/255,((color>>>8)&255)/255];
            const chroma=c=>[-.1146*c[0]-.3854*c[1]+.5*c[2],.5*c[0]-.4542*c[1]-.0458*c[2]];
            const here=chroma(display),target=chroma(key);
            const distance=Math.hypot(here[0]-target[0],here[1]-target[1])/.7071;
            alpha*=smooth(clamp(p.similarity,1,60)/100,
              clamp(p.similarity,1,60)/100+Math.max(clamp(p.softness,0,50)/100,.001),distance);
            const reach=Math.hypot(...target);
            if(reach>1e-4){
              const direction=target.map(v=>v/reach),amount=Math.max(here[0]*direction[0]+here[1]*direction[1],0)*clamp(p.spill,0,100)/100;
              const cb=here[0]-direction[0]*amount,cr=here[1]-direction[1]*amount,y=luma(display);
              display=[y+1.5748*cr,y-.1873*cb-.4681*cr,y+1.8556*cb];
            }
          }
          else if(e.id==='concat.mono'){const f=p.colour/100,r=.3+.35*f,b=.11-.05*f,grey=display[0]*r+display[1]*(1-r-b)+display[2]*b,c=clamp(grey,0,1),out=c+(c*c*(3-2*c)-c)*(p.contrast/100*.8)+(grey-c);display=[out,out,out];}
          else if(e.id==='concat.vibrance'){
            const mx=Math.max(...display),mn=Math.min(...display),chroma=mx-mn,grey=luma(display),amount=1+p.amount*Math.max(1-chroma,0);
            let h=chroma<.0001?0:mx===display[0]?(display[1]-display[2])/chroma:mx===display[1]?2+(display[2]-display[0])/chroma:4+(display[0]-display[1])/chroma;
            h=((h/6)%1+1)%1*360;const d=Math.abs((((h-25)/360+.5)%1+1)%1*360-180),skin=(1-smooth(20,40,d))*smooth(0,.25,chroma)*.6;
            display=display.map(v=>{const boosted=grey+(v-grey)*amount;return boosted+(v-boosted)*skin;});
          }
          rgb=display.map(v=>Math.pow(Math.max(0,v),2.4));
        }
      }
      for(let channel=0;channel<3;channel++)pixels[i+channel]=Math.round(255*Math.pow(clamp(rgb[channel]*shading.scale+shading.offset,0,1),1/2.4));
      pixels[i+3]=Math.round(alpha*255);
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
    // A still with constant color treatments has identical source pixels on
    // every frame. Transform/opacity keys remain applied outside this buffer.
    const constant=clip.kind==='image' && !(clip[shades]||[]).length && !(clip.videoEffects || []).some(effect=>
      Object.values(effect.keys || {}).some(keys=>Array.isArray(keys)&&keys.length));
    const signature=constant?JSON.stringify([w,h,crop,clip.videoEffects || [],source.currentSrc || source.src]):null;
    let stored=stillCache.get(ctx);
    if (!stored) {stored=new Map();stillCache.set(ctx,stored);}
    const previous=stored.get(clip.id);
    if (constant && previous?.source===source && previous.signature===signature) return previous.canvas;
    let canvas=constant?document.createElement('canvas'):cache.get(ctx);
    if (!canvas) {canvas=document.createElement('canvas');cache.set(ctx,canvas);}
    canvas.width=w;canvas.height=h;
    const paint=canvas.getContext('2d',{willReadFrequently:true});
    paint.drawImage(source,width*left,height*top,sw,sh,0,0,w,h);
    if ((clip.videoEffects || []).some(effect=>effect.enabled!==false)||(clip[shades]||[]).length) {
      const image=paint.getImageData(0,0,w,h);
      filterPixels(image.data,clip.videoEffects||[],fraction(clip,time),{width:w,height:h},transitionShading(clip,time));
      paint.putImageData(image,0,0);
    }
    if (constant) stored.set(clip.id,{canvas,source,signature});
    return canvas;
  }
  function shape(ctx,clip,spec){
    const style=clip.shape||{},kind=style.kind||'square';
    if(!shapeKinds.includes(kind))throw new Error('Unsupported shape: '+kind);
    const size=clamp(number(style.size,.35),.01,2)*spec.height;
    const asked=Math.max(0,number(style.strokeWidth,.012))*spec.height,rule=asked>0?Math.max(1,asked):0;
    const width=size,height=kind==='triangle'?size*.866:['parallelogram','trapezoid'].includes(kind)?size*.6:kind==='line'?rule:kind==='arrow'?Math.max(rule*4,size*.18):size;
    const cx=spec.width/2,cy=spec.height/2,left=cx-width/2,right=cx+width/2,top=cy-height/2,bottom=cy+height/2;
    ctx.beginPath();let closed=true;
    if(kind==='square')ctx.rect(left,top,width,height);
    else if(kind==='circle')ctx.arc(cx,cy,size/2,0,Math.PI*2);
    else if(kind==='triangle'){ctx.moveTo(cx,top);ctx.lineTo(right,bottom);ctx.lineTo(left,bottom);ctx.closePath();}
    else if(kind==='parallelogram'){ctx.moveTo(left+width*.2,top);ctx.lineTo(right,top);ctx.lineTo(right-width*.2,bottom);ctx.lineTo(left,bottom);ctx.closePath();}
    else if(kind==='trapezoid'){ctx.moveTo(left+width*.2,top);ctx.lineTo(right-width*.2,top);ctx.lineTo(right,bottom);ctx.lineTo(left,bottom);ctx.closePath();}
    else {closed=false;const tip=right-rule/2;ctx.moveTo(left+rule/2,cy);ctx.lineTo(tip,cy);
      if(kind==='arrow'){const arm=height/2;ctx.moveTo(tip-arm,cy-arm);ctx.lineTo(tip,cy);ctx.lineTo(tip-arm,cy+arm);}}
    const colour=value=>typeof value==='string'&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)?value:null;
    const fill=colour(style.fill??'#ffffff'),edge=colour(style.stroke??'');
    ctx.lineWidth=rule;ctx.lineCap='round';ctx.lineJoin='round';
    if(closed){if(fill){ctx.fillStyle=fill;ctx.fill();}if(rule>0&&edge){ctx.strokeStyle=edge;ctx.stroke();}}
    else if(rule>0&&(edge||fill)){ctx.strokeStyle=edge||fill;ctx.stroke();}
  }
  function text(ctx, clip, spec, time) {
    const style=clip.text || clip.textStyle;
    if (!style || !style.content) return;
    const font=Math.max(1,number(style.fontSize,.09)*spec.height);
    ctx.font=`${style.italic?'italic ':''}${number(style.fontWeight,700)} ${font}px ${style.fontFamily || '"Cabinet Grotesk", sans-serif'}`;
    const align=style.align || 'center';ctx.textAlign='left';ctx.textBaseline='alphabetic';
    // Native paragraphs choose their base direction from the first strong
    // character. Digits and punctuation do not turn mixed English into RTL.
    const direction=paragraph=>{
      const strong=[...paragraph].find(character=>/[\p{Letter}\u200e\u200f]/u.test(character));
      return strong && (strong==='\u200f' || /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}\p{Script=Samaritan}\p{Script=Mandaic}]/u.test(strong))?'rtl':'ltr';
    };
    const maxWidth=Math.max(0,number(style.maxWidth,0))*spec.width;
    const maxHeight=Math.max(0,number(style.maxHeight,0))*spec.height;
    // Sized native boxes already include their plate's padding on that axis.
    const padX=style.background && maxWidth<=0?Math.max(0,number(style.backgroundPaddingX,.0315))*spec.height:0;
    const padY=style.background && maxHeight<=0?Math.max(0,number(style.backgroundPaddingY,.018))*spec.height:0;
    const wrap=maxWidth>0?maxWidth:Math.max(font,spec.width*(align==='center'?1:.5)-2*padX);
    const rows=[];
    const paragraphs=style.content.replace(/\r\n/g,'\n').split('\n');
    if(paragraphs.at(-1)==='' && style.content.endsWith('\n'))paragraphs.pop();
    for (const paragraph of paragraphs) {
      const dir=direction(paragraph);ctx.direction=dir;
      let row='';
      for (const word of paragraph.trim().split(' ')) {
        const next=row?row+' '+word:word;
        if (row && ctx.measureText(next).width>wrap) {rows.push({content:row,direction:dir,width:ctx.measureText(row).width});row=word;} else row=next;
      }
      rows.push({content:row,direction:dir,width:ctx.measureText(row).width});
    }
    const wordsWidth=Math.max(0,...rows.map(row=>row.width));if(wordsWidth<=0)return;
    // Shared font's em metrics, rather than the height of a particular glyph
    // or one extra line pitch, determine native title and background height.
    const metrics=ctx.measureText('Hg');
    const ascent=number(metrics.fontBoundingBoxAscent,font*.8),descent=number(metrics.fontBoundingBoxDescent,font*.2);
    const pitch=font*Math.max(.5,number(style.lineHeight,1.2));
    const wordsHeight=(rows.length-1)*pitch+ascent+descent;
    const boxWidth=Math.max(maxWidth,wordsWidth),boxHeight=Math.max(maxHeight,wordsHeight);
    const outerWidth=boxWidth+2*padX,outerHeight=boxHeight+2*padY;
    const x=spec.width*.5,y=spec.height*.5;
    const outerLeft=align==='left'?x:align==='right'?x-outerWidth:x-outerWidth/2;
    const left=outerLeft+padX,top=y-outerHeight/2+padY+(boxHeight-wordsHeight)/2;
    ctx.globalAlpha*=clamp(number(style.opacity,1),0,1);
    if (style.background) {
      ctx.fillStyle=style.background;ctx.beginPath();
      ctx.roundRect(outerLeft,y-outerHeight/2,outerWidth,outerHeight,
        Math.max(0,number(style.backgroundRadius,.0135)*spec.height));ctx.fill();
    }
    ctx.lineJoin='round';ctx.fillStyle=style.color || '#fff';
    // Native shadow offset/alpha/radius; Canvas and tiny-skia blur kernels
    // still require an actual output comparison, rather than assumed equality.
    ctx.shadowColor=style.shadow?'rgba(0,0,0,0.5882352941176471)':'transparent';
    ctx.shadowOffsetX=style.shadow?font*.05:0;ctx.shadowOffsetY=style.shadow?font*.07:0;
    ctx.shadowBlur=style.shadow?Math.max(1,Math.round(font*.04)):0;
    rows.forEach((row,index)=>{
      ctx.direction=row.direction;
      const indent=align==='left'?0:align==='right'?boxWidth-row.width:(boxWidth-row.width)/2;
      const baseline=top+ascent+index*pitch;
      if (style.strokeWidth>0) {ctx.strokeStyle=style.strokeColor || '#000';ctx.lineWidth=2*style.strokeWidth*spec.height;ctx.strokeText(row.content,left+indent,baseline);}
      // A word wider than its box remains intact and clips at the frame edge;
      // Canvas maxWidth would squeeze it, changing the native glyph geometry.
      ctx.fillText(row.content,left+indent,baseline);
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
  const linearFrames=new WeakMap();
  const encodedLight=Float32Array.from({length:256},(_,level)=>Math.pow(level/255,2.4));
  function blendPixels(under,source,mode='normal',opacity=1){
    if(under.length*4!==source.length*3||!Object.hasOwn(blend,mode)||!Number.isFinite(opacity))throw Error('Invalid linear blend buffer or mode.');
    opacity=clamp(opacity,0,1);
    for(let pixel=0,at=0;at<source.length;pixel+=3,at+=4){
      const alpha=source[at+3]/255*opacity;if(alpha<=0)continue;
      for(let channel=0;channel<3;channel++){
        const colour=encodedLight[source[at+channel]],ground=under[pixel+channel],over=colour*alpha;
        if(mode==='multiply')under[pixel+channel]=over*ground+ground*(1-alpha);
        else if(mode==='screen')under[pixel+channel]=over*(1-ground)+ground;
        else if(mode==='add')under[pixel+channel]=over+ground;
        else if(mode==='lighten')under[pixel+channel]=Math.max(colour,ground)*alpha+ground*(1-alpha);
        else if(mode==='darken')under[pixel+channel]=Math.min(colour,ground)*alpha+ground*(1-alpha);
        else under[pixel+channel]=over+ground*(1-alpha);
      }
    }
    return under;
  }
  function render(ctx,spec,time,sources) {
    spec=resolveTransitions(spec);
    const destination=ctx,linear=typeof ctx.getImageData==='function'&&typeof ctx.putImageData==='function';
    // Text-only arithmetic mocks have no actual canvas. A real renderer must
    // have pixel access; it cannot silently use display-space blending.
    if(ctx.canvas&&!linear)throw Error('SDR composition requires readable Canvas pixels.');
    let scratch=null,paint=ctx;
    if(linear){
      scratch=linearFrames.get(ctx);
      if(!scratch||scratch.width!==spec.width||scratch.height!==spec.height){
        const canvas=scratch?.canvas||document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
        const layer=canvas.getContext('2d',{willReadFrequently:true});if(!layer)throw Error('Layer composition canvas is unavailable.');
        scratch={canvas,paint:layer,width:spec.width,height:spec.height,light:new Float32Array(spec.width*spec.height*3),result:ctx.createImageData?ctx.createImageData(spec.width,spec.height):ctx.getImageData(0,0,spec.width,spec.height)};
        linearFrames.set(ctx,scratch);
      }
      scratch.light.fill(0);paint=scratch.paint;
    }
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#000';ctx.fillRect(0,0,spec.width,spec.height);
    try {
    const tracks=spec.tracks || [];
    const clips=spec.clips.filter(clip=>clip.kind!=='audio' && time>=start(clip) && time<start(clip)+duration(clip))
      .slice().sort((a,b)=>(a[lane]??tracks.findIndex(track=>track.id===a.trackId)*2)-(b[lane]??tracks.findIndex(track=>track.id===b.trackId)*2));
    const retained=stillCache.get(paint), active=new Set(clips.map(clip=>clip.id));
    if(retained)for(const id of retained.keys())if(!active.has(id))retained.delete(id);
    for (const original of clips) {
      const track=tracks.find(track=>track.id===original.trackId);
      if (track?.visible===false || original.hidden) continue;
      // Native title opacity multiplies the finished title image once, not
      // each overlapping background/outline/glyph drawing operation.
      const style=original.text||original.textStyle;
      const ownOpacity=original.kind==='text'?clamp(number(style?.opacity,1),0,1):1;
      const clip=linear&&original.kind==='text'?{...original,text:{...style,opacity:1}}:original;
      const ctx=paint;
      if(linear){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,spec.width,spec.height);}
      ctx.save();
      try {
        ctx.globalAlpha=linear?1:opacityAt(clip,time);
        ctx.globalCompositeOperation=linear?'source-over':blend[clip.blend || ''] || 'source-over';
        const x=spec.width*(.5+valueAt(clip,'offsetX',time));
        const y=spec.height*(.5+valueAt(clip,'offsetY',time));
        ctx.translate(x,y);ctx.rotate(valueAt(clip,'rotation',time)*Math.PI/180);
        const scale=Math.max(.001,valueAt(clip,'scale',time));
        ctx.scale(scale*valueAt(clip,'stretchX',time)*(clip.flipH?-1:1),scale*valueAt(clip,'stretchY',time)*(clip.flipV?-1:1));
        if(clip.kind==='shape'){
          let picture=shapeCache.get(ctx);if(!picture){picture=document.createElement('canvas');shapeCache.set(ctx,picture);}
          picture.width=spec.width;picture.height=spec.height;shape(picture.getContext('2d'),clip,spec);
          const canvas=layerCanvas(ctx,clip,picture,spec,time);ctx.drawImage(canvas,-canvas.width/2,-canvas.height/2);
        }else if (clip.kind==='text') {
          if((clip.videoEffects||[]).some(e=>e.enabled!==false)||(clip[shades]||[]).length){
            let canvas=cache.get(ctx);if(!canvas){canvas=document.createElement('canvas');cache.set(ctx,canvas);}canvas.width=spec.width;canvas.height=spec.height;
            const paint=canvas.getContext('2d',{willReadFrequently:true});text(paint,clip,spec,time);
            const image=paint.getImageData(0,0,canvas.width,canvas.height);filterPixels(image.data,clip.videoEffects||[],fraction(clip,time),{width:canvas.width,height:canvas.height},transitionShading(clip,time));paint.putImageData(image,0,0);ctx.drawImage(canvas,-spec.width/2,-spec.height/2);
          }else{ctx.translate(-spec.width/2,-spec.height/2);text(ctx,clip,spec,time);}
        }
        else {
          const source=sources.get(clip.id);
          if (!source) throw Error('No prepared visual source for '+clip.id);
          const canvas=layerCanvas(ctx,clip,source,spec,time);ctx.drawImage(canvas,-canvas.width/2,-canvas.height/2);
        }
      } finally {ctx.restore();}
      if(linear)blendPixels(scratch.light,ctx.getImageData(0,0,spec.width,spec.height).data,original.blend||'normal',opacityAt(original,time)*ownOpacity);
    }
    if(linear){
      paint.setTransform(1,0,0,1,0,0);paint.clearRect(0,0,spec.width,spec.height);paint.globalAlpha=1;paint.globalCompositeOperation='source-over';
      legacyCaptions(paint,spec,time);blendPixels(scratch.light,paint.getImageData(0,0,spec.width,spec.height).data);
      const pixels=scratch.result.data;
      for(let pixel=0,at=0;at<pixels.length;pixel+=3,at+=4){for(let c=0;c<3;c++)pixels[at+c]=255*Math.pow(clamp(scratch.light[pixel+c],0,1),1/2.4);pixels[at+3]=255;}
      destination.putImageData(scratch.result,0,0);
    }else legacyCaptions(ctx,spec,time);
    } finally {ctx.restore();}
  }
  return Object.freeze({render,blendPixels,validateClip,audioGain,valueAt,start,duration,ease,filterPixels,resolveTransitions,sourceTime,speedAt,timelineTime,isHold,transitionShading,opacityAt,effectCatalog,transitionCatalog,
    supportedEffects:Object.freeze([...effects]),supportedBlends:Object.freeze(Object.keys(blend)),shapeKinds});
})();
