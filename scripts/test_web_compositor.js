'use strict';
// Arithmetic/contract regressions run on CI. Real pixels/audio are checked in
// the browser workflow and decoded by FFmpeg, not inferred from these tests.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const scope={window:{},console};
vm.runInNewContext(fs.readFileSync('web/compositor.js','utf8'),scope);
const c=scope.window.VeyCutCompositor;
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.00001,`${actual} != ${expected}`);
const clip={kind:'video',start:10,duration:2,speed:1,volume:2,fadeIn:.5,fadeOut:.5};
close(c.audioGain(clip,10),0);close(c.audioGain(clip,10.25),1);
close(c.audioGain(clip,11),2);close(c.audioGain(clip,11.75),1);
close(c.audioGain(clip,12),0);close(c.audioGain(clip,11,{muted:true}),0);
close(c.audioGain({...clip,muted:true},11),0);
const keyed={...clip,scale:8,keys:[{property:'scale',at:0,value:1},{property:'scale',at:1,value:3,ease:[0,0,1,1]}]};
close(c.valueAt(keyed,'scale',11),2);
assert.ok(c.ease(.5,[.42,0,1,1])<.5);
assert.ok(c.ease(.5,[0,0,.58,1])>.5);
close(c.duration({in:1,out:5,speed:2}),2);
const grey=new Uint8ClampedArray([200,100,40,83]);
c.filterPixels(grey,[{id:'concat.saturation',params:{amount:-100}}],0);
assert.deepEqual([...grey],[117,117,117,83]);
const exposure=new Uint8ClampedArray([64,64,64,99]);
c.filterPixels(exposure,[{id:'concat.exposure',params:{stops:2.4}}],0);
assert.deepEqual([...exposure],[128,128,128,99]);
const contrast=new Uint8ClampedArray([80,140,220,45]);
c.filterPixels(contrast,[{id:'concat.contrast',params:{amount:-100}}],0);
assert.deepEqual([...contrast],[125,125,125,45]);
assert.throws(()=>c.validateClip({...clip,videoEffects:[{id:'unported-native-effect'}]}),/not yet rendered/);
assert.throws(()=>c.validateClip({...clip,blend:'unknown'}),/blend/);
assert.throws(()=>c.validateClip({...clip,speedCurve:[{at:0,speed:2}]}),/native treatment/);
assert.throws(()=>c.validateClip({...clip,audioStream:1}),/audio stream/);
assert.throws(()=>c.validateClip({...clip,kind:'text',text:{tracking:.1}}),/letter spacing/);
let depth=0;
const ctx={save(){depth++;},restore(){depth--;},setTransform(){},fillRect(){},translate(){},rotate(){},scale(){}};
assert.throws(()=>c.render(ctx,{width:100,height:100,clips:[clip],tracks:[]},11,new Map()),/No prepared visual source/);
assert.equal(depth,0,'Rejected render restores every canvas state frame');
const painted=[];
Object.assign(ctx,{measureText:()=>({width:20}),fillText:value=>painted.push(value)});
c.render(ctx,{width:100,height:100,tracks:[{id:'bottom'},{id:'top'}],clips:[
 {...clip,id:'title-top',trackId:'top',kind:'text',text:{content:'top'}},
 {...clip,id:'title-bottom',trackId:'bottom',kind:'text',text:{content:'bottom'}}
]},11,new Map());
assert.deepEqual(painted,['bottom','top'],'Native tracks composite bottom-first');
assert.equal(depth,0);
console.log('Browser compositor arithmetic and refusal regressions passed.');
