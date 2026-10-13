'use strict';
// Bounded index plus original Blob slices. No transcoding, ZIP expansion or remote storage.
const VeyCutProjectBundle=(()=>{
  const MAGIC='VEYCUTB1',MAX_INDEX=4*1024*1024,MAX_BYTES=1024*1024*1024,MAX_MEDIA=128;
  const encoder=new TextEncoder();
  function index(value){
    if(value?.format!=='veycut-bundle'||value.schema!==1||value.project?.format!=='veycut-web'||!Array.isArray(value.entries)||!Array.isArray(value.project.media)||value.entries.length>MAX_MEDIA||value.entries.length!==value.project.media.length)throw Error('Invalid portable project index.');
    let cursor=0;const ids=new Set();
    for(const entry of value.entries){
      const media=value.project.media.find(m=>m.id===entry.id);
      if(!media||ids.has(entry.id)||!Number.isSafeInteger(entry.offset)||entry.offset!==cursor||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size!==media.size||media.sizeKnown===false||typeof media.name!=='string'||media.name.length>1000||typeof media.type!=='string')throw Error('Portable project media index does not match its manifest.');
      ids.add(entry.id);cursor+=entry.size;if(!Number.isSafeInteger(cursor)||cursor>MAX_BYTES)throw Error('Portable project exceeds the 1 GiB limit.');
    }
    return cursor;
  }
  function create(project,files){
    let offset=0;const parts=[],entries=[];
    for(const media of project.media){const file=files.get(media.id);if(!(file instanceof Blob)||file.size!==media.size)throw Error('Reconnect every original file before saving a portable project.');entries.push({id:media.id,offset,size:file.size});parts.push(file);offset+=file.size;}
    const manifest={format:'veycut-bundle',schema:1,project,entries};index(manifest);
    const json=encoder.encode(JSON.stringify(manifest));if(json.length>MAX_INDEX)throw Error('Portable project index exceeds 4 MiB.');
    if(12+json.length+offset>MAX_BYTES)throw Error('Portable project exceeds the 1 GiB limit.');
    const header=new Uint8Array(12);header.set(encoder.encode(MAGIC));new DataView(header.buffer).setUint32(8,json.length,true);
    return new Blob([header,json,...parts],{type:'application/vnd.veycut.project'});
  }
  async function read(blob){
    if(blob.size<12||blob.size>MAX_BYTES)throw Error('Invalid or oversized portable project.');
    const header=new Uint8Array(await blob.slice(0,12).arrayBuffer());
    if(new TextDecoder().decode(header.slice(0,8))!==MAGIC)throw Error('Invalid portable project header.');
    const size=new DataView(header.buffer).getUint32(8,true);if(size<2||size>MAX_INDEX||12+size>blob.size)throw Error('Invalid portable project index size.');
    const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await blob.slice(12,12+size).arrayBuffer()));
    const bytes=index(manifest);if(12+size+bytes!==blob.size)throw Error('Portable project contains missing or unexpected media bytes.');
    const files=new Map();for(const entry of manifest.entries){const media=manifest.project.media.find(m=>m.id===entry.id);files.set(entry.id,new File([blob.slice(12+size+entry.offset,12+size+entry.offset+entry.size)],media.name,{type:media.type}));}
    return {project:manifest.project,files};
  }
  return Object.freeze({create,read,MAX_BYTES});
})();
if(typeof window!=='undefined')window.VeyCutProjectBundle=VeyCutProjectBundle;
if(typeof module!=='undefined')module.exports=VeyCutProjectBundle;
