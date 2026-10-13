'use strict';
// Geometry contracts from the released native title painter. This uses a
// deterministic font metric stub; actual font rasterisation is tested on Mac.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope={window:{},console};vm.runInNewContext(fs.readFileSync('web/compositor.js','utf8'),scope);
const compositor=scope.window.VeyCutCompositor;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
function paint(style){
  const plates=[],rows=[],strokes=[];let depth=0;
  const ctx={globalAlpha:1,save(){depth++;},restore(){depth--;},setTransform(){},fillRect(){},translate(){},rotate(){},scale(){},beginPath(){},fill(){},
    measureText(content){return{width:content.length*10,fontBoundingBoxAscent:24,fontBoundingBoxDescent:8};},
    roundRect(...args){plates.push(args);},
    fillText(...args){rows.push({args,direction:this.direction,align:this.textAlign,baseline:this.textBaseline});},
    strokeText(...args){strokes.push({args,width:this.lineWidth});}};
  compositor.render(ctx,{width:640,height:360,tracks:[{id:'T1'}],clips:[{id:'title',kind:'text',trackId:'T1',start:0,duration:1,text:{content:'AB',fontFamily:'Vazirmatn',fontSize:32/360,lineHeight:1.25,background:'#000000',backgroundPaddingX:10/360,backgroundPaddingY:5/360,...style}}]},.5,new Map());
  assert.equal(depth,0);return{plates,rows,strokes};
}
let p=paint({});
assert.deepEqual(p.plates[0].slice(0,4),[300,159,40,42]);
assert.deepEqual(p.rows[0].args,['AB',310,188]);assert.equal(p.rows[0].baseline,'alphabetic');
p=paint({content:'AB\nCD'});
assert.deepEqual(p.plates[0].slice(0,4),[300,139,40,82]);
near(p.rows[1].args[2]-p.rows[0].args[2],40);
// Sized axes contain padding; they are exact, not expanded by plate air.
p=paint({maxWidth:200/640,maxHeight:100/360});
assert.deepEqual(p.plates[0].slice(0,4),[220,130,200,100]);
assert.deepEqual(p.rows[0].args,['AB',310,188]);
p=paint({align:'left'});near(p.plates[0][0],320);near(p.rows[0].args[1],330);
p=paint({align:'right'});near(p.plates[0][0]+p.plates[0][2],320);near(p.rows[0].args[1],290);
// Wide words are not Canvas-compressed into a narrower fixed box.
p=paint({content:'ABCDEFGHIJ',maxWidth:30/640});near(p.plates[0][2],100);assert.equal(p.rows[0].args.length,3);
p=paint({content:'2026: Hello سلام\n2026: سلام Hello'});
assert.deepEqual(p.rows.map(row=>row.direction),['ltr','rtl']);
p=paint({content:'שלום Hello'});assert.equal(p.rows[0].direction,'rtl');
p=paint({content:'AB\n'});assert.equal(p.rows.length,1,'Trailing newline does not add an extra native row');
p=paint({strokeWidth:2/360});near(p.strokes[0].width,4,'Native outline draws twice the outward thickness under fill');
console.log('Native text layout geometry contracts passed; actual font/pixel comparison remains separate.');
