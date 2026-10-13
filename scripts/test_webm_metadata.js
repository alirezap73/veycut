'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope={window:{},Blob,Uint8Array,DataView,Number,BigInt,Error};
vm.runInNewContext(fs.readFileSync('web/webm-metadata.js','utf8'),scope);
const fix=scope.window.VeyCutWebmMetadata.withDuration;
const header=[0x1a,0x45,0xdf,0xa3,0x80],segment=[0x18,0x53,0x80,0x67];
const unknown=[1,255,255,255,255,255,255,255],info=[0x15,0x49,0xa9,0x66],scale=[0x2a,0xd7,0xb1,0x83,0x0f,0x42,0x40];
const tracks=[0x16,0x54,0xae,0x6b,0x80],cluster=[0x1f,0x43,0xb6,0x75,...unknown,0xe7,0x81,0];
const size=n=>n<127?[128+n]:[0x40|(n>>8),n&255];
const duration=n=>{const field=new Uint8Array(11);field.set([0x44,0x89,0x88]);new DataView(field.buffer).setFloat64(3,n);return [...field];};
function file(body,{finite=false,indexed=false,payload=new Uint8Array(200000).fill(0xa5)}={}){
  const metadata=[...info,...size(body.length),...body],seek=indexed?[0x11,0x4d,0x9b,0x74,0x80]:[];
  const total=seek.length+metadata.length+tracks.length+cluster.length+payload.length;
  return new Blob([new Uint8Array([...header,...segment,...(finite?size(total):unknown),...seek,...metadata,...tracks,...cluster]),payload],{type:'video/webm;codecs=vp8,opus'});
}
async function inspect(blob){
  const bytes=new Uint8Array(await blob.slice(0,512).arrayBuffer());
  const at=bytes.findIndex((b,i)=>b===0x44&&bytes[i+1]===0x89&&bytes[i+2]===0x88);
  assert.ok(at>0,'Output has a float64 duration');
  return {bytes,duration:new DataView(bytes.buffer).getFloat64(at+3)};
}
(async()=>{
  const original=file(scale),fixed=await fix(original,3.2),read=await inspect(fixed);
  assert.equal(read.duration,3200);assert.equal(fixed.size,original.size+11);assert.equal(fixed.type,original.type);
  assert.deepEqual([...read.bytes.slice(header.length+segment.length,header.length+segment.length+8)],unknown);
  assert.ok([...new Uint8Array(await fixed.slice(-128).arrayBuffer())].every(n=>n===0xa5),'Opaque cluster bytes stay unchanged');
  const declared=file([...scale,...duration(999)]);assert.equal(await fix(declared,3),declared,'Existing positive metadata is preserved');
  const zero=await fix(file([...scale,...duration(0)]),3);assert.equal((await inspect(zero)).duration,3000);
  const padding=[0xec,0xef,...new Uint8Array(111)]; // 120-byte Info grows from a one-byte to two-byte size.
  const known=file([...scale,...padding],{finite:true,payload:new Uint8Array(20)});
  const grown=await fix(known,3);assert.equal(grown.size,known.size+12);
  const finite=await inspect(grown);const offset=header.length+segment.length;
  const length=((finite.bytes[offset]&63)<<8)+finite.bytes[offset+1];
  assert.equal(length,grown.size-offset-2,'Finite Segment size follows inserted metadata');
  await assert.rejects(fix(file(scale,{indexed:true}),3),/indexed/);
  await assert.rejects(fix(new Blob([new Uint8Array([0])]),3),/header/);
  await assert.rejects(fix(original,NaN),/duration/);
  assert.equal(scope.window.VeyCutWebmMetadata.PREFIX_BYTES,65536);
  console.log('Bounded WebM metadata insertion, finite sizes, preserved payload and malformed/indexed refusal passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
