'use strict';
// Small arithmetic fixtures for native scene-linear spatial contracts.
// Actual Mac/Web visual tolerance checks remain the GitHub export comparison.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope={window:{},console};vm.runInNewContext(fs.readFileSync('web/compositor.js','utf8'),scope);
const c=scope.window.VeyCutCompositor;
function apply(id,params,width,height,fill){
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set(fill(x,y),(y*width+x)*4);
 c.filterPixels(pixels,[{id:'concat.'+id,params}],0,{width,height});return pixels;
}
const close=(got,want)=>assert.ok(Math.abs(got-want)<=1,`${got} differs from ${want}`);
const grey=light=>255*Math.pow(light,1/2.4);
let p=apply('pixelate',{size:4},4,4,(x,y)=>((x+y)%2)?[255,255,255,255]:[0,0,0,255]);
for(let i=0;i<p.length;i+=4){close(p[i],grey(.5));assert.equal(p[i+3],255);}
// A quarter contribution to one of sixteen taps; a whole-box average
// would dilute this sparse highlight by 256 and is a different algorithm.
p=apply('pixelate',{size:16},16,16,(x,y)=>x===2&&y===2?[255,255,255,255]:[0,0,0,255]);
close(p[0],grey(.25/16));
p=apply('pixelate',{size:4},3,1,x=>x===2?[255,255,255,255]:[0,0,0,255]);
close(p[0],grey(.5));close(p[8],p[0]);
for(const id of ['pixelate','gaussian-blur']){
 const params=id==='pixelate'?{size:4}:{radius:5};
 p=apply(id,params,5,3,()=>[80,130,190,153]);
 for(let i=0;i<p.length;i+=4){for(const [channel,want] of [[0,80],[1,130],[2,190],[3,153]])close(p[i+channel],want);}
 const hiddenGreen=apply(id,params,5,3,x=>x===2?[255,0,0,255]:[0,255,0,0]);
 const hiddenBlack=apply(id,params,5,3,x=>x===2?[255,0,0,255]:[0,0,0,0]);
 assert.deepEqual(hiddenGreen,hiddenBlack,'Transparent RGB never bleeds into filtered light');
}
// Native radius1 uses pixel centres −3..4 (paired three-sigma footprint).
const weights=Array.from({length:8},(_,i)=>Math.exp(-((i-3)**2)/2)),total=weights.reduce((a,b)=>a+b,0);
p=apply('gaussian-blur',{radius:1},3,1,x=>x===1?[255,255,255,255]:[0,0,0,255]);
close(p[0],grey(Math.exp(-.5)/total));close(p[4],grey(1/total));
// Reduced native passes must preserve constant light, including odd frame
// dimensions and extrapolated reconstruction at the last half-pixel edge.
p=apply('gaussian-blur',{radius:10},7,5,()=>[160,80,20,255]);
for(let i=0;i<p.length;i+=4){close(p[i],160);close(p[i+1],80);close(p[i+2],20);assert.equal(p[i+3],255);}
console.log('Native spatial light, taps, alpha, Gaussian support and reduced-pass invariants passed.');
