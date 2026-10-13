// GitHub only: ten-minute PCM stream, retaining bounded windows rather than whole audio.
async page=>{
  await page.goto('https://alirezap73.github.io/veycut/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  const report=await page.evaluate(async()=>{
    const {createPitchStream}=await import('./pitch-stream.js'),sampleRate=48000,tempo=2,seconds=600;
    let feedEnd=0,windows=0;const started=performance.now();
    const stream=await createPitchStream({sampleRate,tempo,sourceFrames:sampleRate*seconds*tempo,feed:async(first,count)=>{
      if(first!==feedEnd)throw Error('Nonsequential pitch input');feedEnd=first+count;
      const data=new Float32Array(count*2);for(let i=0;i<count;i++){data[i*2]=.4*Math.sin(2*Math.PI*880*(first+i)/sampleRate);data[i*2+1]=.25*Math.sin(2*Math.PI*660*(first+i)/sampleRate);}return data;
    }});
    const checkpoints=[];let previousTail=null;
    try{
      for(let begin=0;begin<seconds;begin++){
        const origin=Math.max(0,begin-1.25),samples=await stream.read(origin,begin+1),offset=Math.round((begin-origin)*sampleRate)*2;
        if(previousTail&&begin>1){const overlap=samples.subarray(offset-previousTail.length,offset);if(overlap.some((value,i)=>value!==previousTail[i]))throw Error('Long-session overlap changed');}
        previousTail=samples.slice(-4800);windows++;
        if([1,59,299,599].includes(begin)){
          const data=samples.subarray(offset+24000*2),measure=channel=>{let crossings=0,power=0,n=0;for(let i=channel;i<data.length;i+=2){power+=data[i]*data[i];n++;if(i>=2&&data[i]>0&&data[i-2]<=0)crossings++;}return {frequency:crossings*sampleRate/n,rms:Math.sqrt(power/n)};};
          const left=measure(0),right=measure(1);if(Math.abs(left.frequency-880)>4||Math.abs(right.frequency-660)>4||left.rms<.05||right.rms<.05)throw Error('Long-session pitch or tail mismatch: '+JSON.stringify({begin,left,right}));checkpoints.push({second:begin,left,right});
        }
      }
      const stats=stream.stats();if(stats.peakCachedBytes>8*1024*1024||stats.peakBufferedFrames>sampleRate||windows!==600)throw Error('Long-session resource budget');
      const build=await(await fetch('build-info.json',{cache:'no-store'})).json();return {status:'passed',build,tempo,seconds,windows,checkpoints,stats,wallSeconds:(performance.now()-started)/1000,scope:'Synthetic ten-minute PCM DSP stream; not a ten-minute encoded pitch export, real speech, speed ramps or native package equivalence.'};
    }finally{stream.dispose();}
  });
  const saved=page.waitForEvent('download');await page.evaluate(report=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report)]));a.download='pitch-long-stream.json';a.click();},report);await(await saved).saveAs('output/playwright/pitch-long-stream.json');console.log(JSON.stringify(report));
}
