'use strict';
// MediaRecorder WebM headers only. Compressed clusters stay as Blob slices;
// fixing duration never copies the whole recording into a JavaScript buffer.
// Duration units: https://www.matroska.org/technical/elements.html
window.VeyCutWebmMetadata=(()=>{
  const PREFIX_BYTES=65536;
  function vint(bytes,at,id=false){
    const first=bytes[at];if(!first)throw Error('Invalid recorded WebM header.');
    let width=1,marker=128;while(!(first&marker)&&width<8){width++;marker>>=1;}
    if((id&&width>4)||at+width>bytes.length)throw Error('Incomplete recorded WebM header.');
    let value=BigInt(id?first:first&(marker-1));
    for(let i=1;i<width;i++)value=value*256n+BigInt(bytes[at+i]);
    return {width,value,unknown:!id&&value===(1n<<BigInt(7*width))-1n};
  }
  function element(bytes,at){
    const id=vint(bytes,at,true),sizeAt=at+id.width,size=vint(bytes,sizeAt),dataAt=sizeAt+size.width;
    if(!size.unknown&&size.value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Oversized recorded WebM element.');
    return {at,id:Number(id.value),idWidth:id.width,sizeAt,sizeWidth:size.width,dataAt,unknown:size.unknown,
      size:size.unknown?null:Number(size.value),end:size.unknown?null:dataAt+Number(size.value)};
  }
  function encodeSize(value,minWidth=1){
    const n=BigInt(value);let width=minWidth;
    while(width<=8&&n>=(1n<<BigInt(7*width))-1n)width++;
    if(width>8||n<0)throw Error('Invalid recorded WebM size.');
    const out=new Uint8Array(width);let held=n;
    for(let i=width-1;i>=0;i--){out[i]=Number(held&255n);held>>=8n;}
    out[0]|=1<<(8-width);return out;
  }
  function uint(bytes,from,to){let value=0;for(let i=from;i<to;i++)value=value*256+bytes[i];return value;}
  async function withDuration(blob,seconds){
    if(!Number.isFinite(seconds)||seconds<=0||seconds>360000)throw Error('Invalid recorded duration.');
    const bytes=new Uint8Array(await blob.slice(0,PREFIX_BYTES).arrayBuffer());
    const header=element(bytes,0);
    if(header.id!==0x1a45dfa3||header.unknown||header.end>=bytes.length)throw Error('Invalid recorded WebM file.');
    const segment=element(bytes,header.end);
    if(segment.id!==0x18538067||!segment.unknown&&segment.end>blob.size)throw Error('Incomplete recorded WebM segment.');
    let info=null,indexed=false,at=segment.dataAt;
    // Inspect all pre-cluster headers so an index cannot be invalidated by an insertion.
    for(let count=0;at<bytes.length&&count<256;count++){
      const next=element(bytes,at);if(next.id===0x1f43b675)break;
      if(next.unknown||next.end>bytes.length)throw Error('Recorded WebM metadata exceeds the header budget.');
      if(next.id===0x114d9b74||next.id===0x1c53bb6b)indexed=true;
      if(next.id===0x1549a966){if(info)throw Error('Duplicate recorded WebM metadata.');info=next;}
      at=next.end;
    }
    if(!info)throw Error('Recorded WebM is missing segment metadata.');
    let scale=1000000,duration=null;const parts=[];
    for(at=info.dataAt;at<info.end;){
      const next=element(bytes,at);if(next.unknown||next.end>info.end)throw Error('Invalid recorded WebM metadata.');
      if(next.id===0x2ad7b1)scale=uint(bytes,next.dataAt,next.end);
      if(next.id===0x4489){
        if(duration!==null||![4,8].includes(next.size))throw Error('Invalid recorded WebM duration field.');
        const view=new DataView(bytes.buffer,bytes.byteOffset+next.dataAt,next.size);
        duration=next.size===8?view.getFloat64(0):view.getFloat32(0);
      }else parts.push(bytes.slice(next.at,next.end));
      at=next.end;
    }
    if(!(Number.isSafeInteger(scale)&&scale>0))throw Error('Invalid recorded WebM timestamp scale.');
    if(duration>0&&Number.isFinite(duration))return blob;
    if(indexed)throw Error('Cannot add duration to an indexed recorded WebM.');
    const field=new Uint8Array(11);field.set([0x44,0x89,0x88]);
    new DataView(field.buffer).setFloat64(3,seconds*1e9/scale);parts.push(field);
    const size=parts.reduce((sum,p)=>sum+p.length,0),infoSize=encodeSize(size,info.sizeWidth);
    const delta=info.idWidth+infoSize.length+size-(info.end-info.at);
    const segmentSize=segment.unknown?bytes.slice(segment.sizeAt,segment.dataAt):encodeSize(segment.size+delta,segment.sizeWidth);
    return new Blob([blob.slice(0,segment.sizeAt),segmentSize,blob.slice(segment.dataAt,info.at),
      bytes.slice(info.at,info.sizeAt),infoSize,...parts,blob.slice(info.end)],{type:blob.type});
  }
  return Object.freeze({withDuration,PREFIX_BYTES});
})();
