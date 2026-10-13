'use strict';
// Native reference.rs blend equations with independent analytical cases.
// This test does not draw/decode media; actual Mac/Web layers run on GitHub.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let allocations=0;
function context(canvas){
 let pixels=new Uint8ClampedArray(4),depth=0;
 return{canvas,globalAlpha:1,save(){depth++;},restore(){depth--;},get depth(){return depth;},setTransform(){},translate(){},rotate(){},scale(){},clearRect(){pixels.fill(0);},
   fillRect(){pixels.set([0,0,0,255]);},
   measureText(){return{width:1,fontBoundingBoxAscent:.8,fontBoundingBoxDescent:.2};},
   fillText(){pixels.set([255,255,255,255]);},
   createImageData(){return{data:new Uint8ClampedArray(4)};},
   getImageData(){return{data:pixels.slice()};},
   putImageData(value){pixels.set(value.data);}};
}
const scope={window:{},console,document:{createElement(type){assert.equal(type,'canvas');allocations++;const canvas={width:1,height:1};canvas.getContext=()=>canvas.ctx||(canvas.ctx=context(canvas));return canvas;}}};
vm.runInNewContext(fs.readFileSync('web/compositor.js','utf8'),scope);
const c=scope.window.VeyCutCompositor,close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} differs from ${b}`);
const source=new Uint8ClampedArray([255,0,0,255]);
const expected={normal:[.625,.2,.3],multiply:[.25,.2,.3],screen:[.625,.4,.6],add:[.75,.4,.6],lighten:[.625,.4,.6],darken:[.25,.2,.3]};
for(const [mode,want] of Object.entries(expected)){
 const frame=new Float32Array([.25,.4,.6]);c.blendPixels(frame,source,mode,.5);frame.forEach((value,index)=>close(value,want[index]));
}
let frame=new Float32Array([0,0,0]);c.blendPixels(frame,new Uint8ClampedArray([255,255,255,255]),'normal',.5);
assert.equal(Math.round(255*Math.pow(frame[0],1/2.4)),191,'Half white on black retains native linear light, not Canvas128');
frame=new Float32Array([.2,.3,.4]);c.blendPixels(frame,new Uint8ClampedArray([255,255,255,0]),'add',1);
frame.forEach((value,index)=>close(value,[.2,.3,.4][index]));
frame=new Float32Array([1,1,1]);c.blendPixels(frame,new Uint8ClampedArray([255,255,255,255]),'add',1);
assert.deepEqual([...frame],[2,2,2],'Add preserves working-light highlights until final resolve');
c.blendPixels(frame,new Uint8ClampedArray([128,128,128,255]),'multiply',1);
close(frame[0],2*Math.pow(128/255,2.4));
assert.throws(()=>c.blendPixels(new Float32Array(2),source),/buffer/);
assert.throws(()=>c.blendPixels(new Float32Array(3),source,'unknown'),/mode/);
assert.throws(()=>c.render({canvas:{},save(){},restore(){}},{clips:[],tracks:[],width:1,height:1},0,new Map()),/readable Canvas/);
// A one-pixel mock exercises buffer reuse and the title's final own opacity;
// it deliberately supplies pixel access, so it uses the actual linear path.
const destination=context({width:1,height:1});
const spec={width:1,height:1,tracks:[{id:'T1'}],clips:[{id:'title',kind:'text',trackId:'T1',start:0,duration:1,opacity:.5,text:{content:'A',opacity:.5,fontSize:.1}}]};
c.render(destination,spec,.5,new Map());assert.equal(destination.getImageData().data[0],Math.round(255*Math.pow(.25,1/2.4)));
const firstAllocations=allocations;c.render(destination,spec,.5,new Map());assert.equal(allocations,firstAllocations,'Same-sized frame reuses one isolated layer canvas');assert.equal(destination.depth,0,'Outer canvas state is restored');
console.log('Native SDR blend, alpha, highlight, title-opacity and bounded-canvas contracts passed.');
