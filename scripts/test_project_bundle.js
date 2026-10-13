'use strict';
const assert=require('node:assert/strict'),bundle=require('../web/project-bundle.js');
(async()=>{
  const file=new File([new Uint8Array([1,2,3,4])],'فیلم.mp4',{type:'video/mp4'}),project={format:'veycut-web',schema:1,media:[{id:'M1',name:file.name,type:file.type,size:file.size}],clips:[],cues:[]};
  const blob=bundle.create(project,new Map([['M1',file]])),restored=await bundle.read(blob);
  assert.deepEqual(restored.project,project);assert.deepEqual(new Uint8Array(await restored.files.get('M1').arrayBuffer()),new Uint8Array([1,2,3,4]));assert.equal(restored.files.get('M1').name,file.name);
  assert.throws(()=>bundle.create(project,new Map()),/Reconnect/);
  await assert.rejects(bundle.read(blob.slice(0,blob.size-1)),/missing/);
  await assert.rejects(bundle.read(new Blob([blob,new Uint8Array([9])])),/unexpected/);
  await assert.rejects(bundle.read(new Blob(['BADHEADER1234'])),/header/);
  const header=new Uint8Array(await blob.slice(0,12).arrayBuffer());new DataView(header.buffer).setUint32(8,0xffffffff,true);await assert.rejects(bundle.read(new Blob([header,blob.slice(12)])),/index size/);
  const broken={format:'veycut-bundle',schema:1,project,entries:[{id:'M1',offset:1,size:4}]},json=new TextEncoder().encode(JSON.stringify(broken));new DataView(header.buffer).setUint32(8,json.length,true);await assert.rejects(bundle.read(new Blob([header,json,file])),/index/);
  console.log('Portable project boundaries, payload preservation and Unicode names passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
