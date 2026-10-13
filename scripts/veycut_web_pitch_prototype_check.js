// Prototype DSP checks only; this does not enable production speed/pitch output.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  const results=[];
  for(const tempo of [.5,1.5,2,4]){
    const next=page.waitForEvent('download');
    const stats=await page.evaluate(async tempo=>{
      const {createPitchStream}=await import('./experimental/pitch-stream.js'),sampleRate=48000,sourceFrames=sampleRate*8;
      const stream=await createPitchStream({sampleRate,tempo,sourceFrames,feed:async(first,count)=>{const values=new Float32Array(count*2);for(let i=0;i<count;i++){values[i*2]=.4*Math.sin(2*Math.PI*880*(first+i)/sampleRate);values[i*2+1]=.25*Math.sin(2*Math.PI*660*(first+i)/sampleRate);}return values;}});
      const parts=[],length=Math.round(sourceFrames/tempo),seconds=length/sampleRate;
      let firstWindow=null;
      for(let begin=0;begin<seconds;begin++){const end=Math.min(seconds,begin+1),samples=await stream.read(Math.max(0,begin-1.25),end),offset=Math.round((begin-Math.max(0,begin-1.25))*sampleRate)*2;parts.push(samples.slice(offset).buffer);if(begin===0)firstWindow=samples;}
      const stats=stream.stats();stream.dispose();
      if(stats.peakCachedBytes>8*1024*1024)throw Error('Pitch cache limit');
      const url=URL.createObjectURL(new Blob(parts)),a=document.createElement('a');a.href=url;a.download='pitch-'+tempo+'.f32';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      return {tempo,seconds,frames:length,...stats};
    },tempo);await(await next).saveAs('output/playwright/pitch-'+tempo+'.f32');results.push(stats);
  }
  const checks=await page.evaluate(async()=>{
    const {createPitchStream}=await import('./experimental/pitch-stream.js'),sampleRate=48000,sourceFrames=sampleRate*4,feed=async(first,count)=>new Float32Array(count*2).fill(.1);
    const stream=await createPitchStream({sampleRate,tempo:2,sourceFrames,feed});
    const first=await stream.read(0,1),again=await stream.read(0,2);if(first.some((value,i)=>value!==again[i]))throw Error('Pitch overlap changed previously rendered samples');
    let refused=false;try{await stream.read(0,4);}catch{refused=true;}if(!refused)throw Error('Unbounded pitch window accepted');stream.dispose();
    const controller=new AbortController(),cancelled=await createPitchStream({sampleRate,tempo:2,sourceFrames,check:()=>{if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');},feed:async(first,count)=>{controller.abort();return new Float32Array(count*2);}});
    try{await cancelled.read(0,1);throw Error('Pitch cancellation ignored');}catch(error){if(error.name!=='AbortError')throw error;}finally{cancelled.dispose();}
    return {overlapStable:true,rangeRefused:true,cancelled:true};
  });assert(checks.cancelled,'Prototype abort');
  const report={status:'passed',prototype:true,results,checks,scope:'Synthetic pure DSP only. Not production export, native Mac package comparison, real speech, speed curves or a long-session proof.'};
  const saved=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='pitch-prototype-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);await(await saved).saveAs('output/playwright/pitch-prototype-report.json');
}
