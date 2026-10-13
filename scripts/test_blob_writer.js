'use strict';
const assert=require('node:assert/strict'),{create}=require('../web/blob-writer.js');
(async()=>{
  const writer=create(12),put=(position,values)=>writer.write({position,data:Uint8Array.from(values)});
  put(0,[1,2,3]);put(3,[4,5,6]);put(1,[9,8,7,6]);assert.deepEqual([...new Uint8Array(await writer.blob().arrayBuffer())],[1,9,8,7,6,6]);
  put(5,[2,3,4]);assert.deepEqual([...new Uint8Array(await writer.blob().arrayBuffer())],[1,9,8,7,6,2,3,4]);
  put(10,[5,6]);assert.deepEqual([...new Uint8Array(await writer.blob().arrayBuffer())],[1,9,8,7,6,2,3,4,0,0,5,6]);assert.equal(writer.bytes,12);
  assert.throws(()=>put(12,[7]),/limit/);assert.throws(()=>put(-1,[3]),/Invalid/);assert.equal(writer.bytes,12);writer.clear();assert.equal(writer.blob().size,0);
  console.log('Encoded output patching, extension, holes and hard byte bounds passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
