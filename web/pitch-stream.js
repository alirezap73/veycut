'use strict';
// Bounded constant-tempo stereo PCM; source data is never read past the declared trim.
export async function createPitchStream({sampleRate=48000,tempo,sourceFrames,outputFrames,feed,check=()=>{}}){
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000||!Number.isFinite(tempo)||tempo<.25||tempo>4||!Number.isSafeInteger(sourceFrames)||sourceFrames<1||typeof feed!=='function')throw Error('Invalid pitch stream parameters.');
  const naturalFrames=Math.round(sourceFrames/tempo),targetFrames=outputFrames??naturalFrames;if(!Number.isInteger(targetFrames)||Math.abs(targetFrames-naturalFrames)>Math.ceil(1/tempo)+1)throw Error('Pitch output length does not match the requested tempo.');if(targetFrames<1)throw Error('Pitch output is too short.');if(targetFrames>sampleRate*600)throw Error('Pitch output exceeds ten minutes.');
  check();const {Stretch}=await import('./vendor/soundtouch-core/index.js');check();
  const processor=new Stretch({sampleRate,createBuffers:true});processor.tempo=tempo;processor.quickSeek=false;
  let input=0,output=0,blocks=[],closed=false,busy=false,oldest=0,peakBufferedFrames=0,peakCachedBytes=0;
  const checkOpen=()=>{check();if(closed)throw Error('Pitch stream is closed.');};
  async function read(begin,end){
    checkOpen();if(busy)throw Error('Pitch windows must be rendered sequentially.');
    const first=Math.round(begin*sampleRate),last=Math.round(end*sampleRate);
    if(!Number.isFinite(begin)||!Number.isFinite(end)||first<oldest||last<=first||last>targetFrames||last-first>sampleRate*3)throw Error('Pitch window is outside its bounded range.');
    busy=true;
    try{
      blocks=blocks.filter(block=>block.end>first);oldest=blocks[0]?.start??output;
      let batches=0;
      while(output<last){
        checkOpen();if(input>sourceFrames+sampleRate*2)throw Error('Pitch processor did not produce the requested frames.');
        const count=2048,wanted=Math.max(0,Math.min(count,sourceFrames-input)),data=new Float32Array(count*2);
        if(wanted){const original=await feed(input,wanted);checkOpen();if(!(original instanceof Float32Array)||original.length!==wanted*2)throw Error('Pitch input must contain the requested stereo frames.');data.set(original);}checkOpen();
        for(const sample of data)if(!Number.isFinite(sample))throw Error('Pitch input contains non-finite samples.');
        input+=count;processor.inputBuffer.putSamples(data);processor.process();
        peakBufferedFrames=Math.max(peakBufferedFrames,processor.inputBuffer.frameCount+processor.outputBuffer.frameCount);
        const ready=processor.outputBuffer.frameCount;
        if(ready){const samples=new Float32Array(ready*2);processor.outputBuffer.extract(samples,0,ready);processor.outputBuffer.receive(ready);blocks.push({start:output,end:output+ready,samples});output+=ready;}
        const bytes=blocks.reduce((sum,block)=>sum+block.samples.byteLength,0);peakCachedBytes=Math.max(peakCachedBytes,bytes);if(bytes>8*1024*1024)throw Error('Pitch history exceeded its memory limit.');
        if(++batches%8===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      const result=new Float32Array((last-first)*2);let copied=0;
      for(const block of blocks){const from=Math.max(first,block.start),to=Math.min(last,block.end);if(to<=from)continue;result.set(block.samples.subarray((from-block.start)*2,(to-block.start)*2),(from-first)*2);copied+=to-from;}
      if(copied!==last-first)throw Error('Pitch output contains a missing window.');checkOpen();return result;
    }finally{busy=false;}
  }
  return Object.freeze({read,dispose(){closed=true;processor.clear();blocks=[];},stats(){return {inputFrames:input,processedFrames:output,targetFrames,peakBufferedFrames,peakCachedBytes,tempo};}});
}
