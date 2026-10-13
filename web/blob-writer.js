'use strict';
// Retain encoded Blob segments and small header patches without a full-file JS buffer.
const VeyCutBlobWriter=(()=>{
  function create(limit){
    let parts=[],bytes=0;
    function write({position,data}){
      if(!Number.isSafeInteger(position)||position<0||!(data instanceof Uint8Array))throw Error('Invalid output write.');
      const end=position+data.byteLength;if(!Number.isSafeInteger(end)||end>limit)throw Error('Frame output exceeded the output byte limit.');
      if(position>bytes){if(position-bytes>65536)throw Error('Unexpected output hole.');parts.push({start:bytes,end:position,blob:new Blob([new Uint8Array(position-bytes)])});bytes=position;}
      if(position===bytes){parts.push({start:position,end,blob:new Blob([data])});bytes=end;return;}
      const next=[];
      for(const part of parts){
        if(part.end<=position||part.start>=end){next.push(part);continue;}
        if(part.start<position)next.push({start:part.start,end:position,blob:part.blob.slice(0,position-part.start)});
        if(part.end>end)next.push({start:end,end:part.end,blob:part.blob.slice(end-part.start)});
      }
      next.push({start:position,end,blob:new Blob([data])});next.sort((a,b)=>a.start-b.start);parts=next;bytes=Math.max(bytes,end);
    }
    return {write,blob(type){return new Blob(parts.map(p=>p.blob),{type});},clear(){parts=[];bytes=0;},get bytes(){return bytes;}};
  }
  return Object.freeze({create});
})();
if(typeof window!=='undefined')window.VeyCutBlobWriter=VeyCutBlobWriter;
if(typeof module!=='undefined')module.exports=VeyCutBlobWriter;
