// GitHub runner: real recordings, readback, truncated encoder output and clock/render faults.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  async function fresh(){
    await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
    await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');
    await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
    await page.locator('#export-size').selectOption('360x640');
  }
  await fresh();const before=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
  const output=page.waitForEvent('download',{timeout:45000});output.catch(()=>{});await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:40000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
  await(await output).saveAs('output/playwright/reliable-video.webm');
  const verification=JSON.parse(await page.locator('#export-status').getAttribute('data-verification'));
  const timing=JSON.parse(await page.locator('#export-status').getAttribute('data-timing'));
  assert(verification.checkpoints===3&&verification.frameCallbacks&&verification.decodedEnd>1.6,'Three actual decoded checkpoints: '+JSON.stringify(verification));
  assert(Math.abs(verification.duration-2)<.5&&timing.maxRenderGap<=.35&&timing.maxSourceDrift<=.35,'Bounded recorded timing: '+JSON.stringify(timing));
  assert(before===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Export/readback preserve all native edits');
  await fresh();await page.locator('#trim-out').fill('0.05');await page.locator('#trim').click();
  const minimumOutput=page.waitForEvent('download',{timeout:30000});minimumOutput.catch(()=>{});
  await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:25000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done','Minimum clip remains exportable: '+await page.locator('#export-status').textContent());
  await(await minimumOutput).saveAs('output/playwright/minimum-video.webm');
  const minimumClip=JSON.parse(await page.locator('#export-status').getAttribute('data-verification'));
  assert(minimumClip.frameCallbacks&&minimumClip.duration>0,'Minimum clip has a decoded verification frame');
  await fresh();await page.evaluate(()=>{
    const native=HTMLCanvasElement.prototype.captureStream;
    HTMLCanvasElement.prototype.captureStream=function(...args){const stream=native.apply(this,args);Object.defineProperty(stream.getVideoTracks()[0],'requestFrame',{value:undefined});return stream;};
  });
  const fallbackOutput=page.waitForEvent('download',{timeout:30000});fallbackOutput.catch(()=>{});await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:25000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done','Automatic capture fallback: '+await page.locator('#export-status').textContent());
  await(await fallbackOutput).saveAs('output/playwright/fallback-video.webm');
  const fallback=JSON.parse(await page.locator('#export-status').getAttribute('data-timing'));assert(fallback.captureMode==='automatic','Missing requestFrame uses automatic capture');
  await fresh();await page.locator('#srt-input').setInputFiles('output/playwright/dense-captions.srt');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().cues.length===20);
  const denseOutput=page.waitForEvent('download',{timeout:30000});denseOutput.catch(()=>{});await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:25000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done','Dense captions remain exportable: '+await page.locator('#export-status').textContent());
  await(await denseOutput).saveAs('output/playwright/dense-video.webm');
  const denseCaptions=JSON.parse(await page.locator('#export-status').getAttribute('data-timing'));
  assert(Math.abs(denseCaptions.recordedSeconds-2)<.2,'Caption switches must not accumulate recording pauses: '+JSON.stringify(denseCaptions));
  const failures=[];
  async function reject(kind,setup,disrupt){
    await fresh();await setup();const downloads=[];const observe=item=>downloads.push(item.suggestedFilename());page.on('download',observe);
    try{
      await page.locator('#video-export').click();
      if(disrupt){await page.waitForFunction(()=>document.querySelector('#export-status').dataset.state==='recording');await disrupt();}
      await page.waitForFunction(()=>document.querySelector('#export-status').dataset.state==='error',null,{timeout:30000});
      const message=await page.locator('#export-status').textContent();assert(!downloads.length,kind+' must not download a damaged file');
      await page.waitForFunction(()=>!document.querySelector('#save').disabled);
      failures.push({kind,message,downloaded:false});
    }finally{page.off('download',observe);}
  }
  await reject('truncated-encoder',()=>page.evaluate(()=>{
    const Native=window.MediaRecorder;
    window.MediaRecorder=class extends Native{
      addEventListener(type,listener,options){
        if(type!=='dataavailable')return super.addEventListener(type,listener,options);
        let seen=0;return super.addEventListener(type,event=>{if(++seen===1)listener.call(this,event);},options);
      }
    };
  }));
  assert(/verification|decode|missing frames|present/.test(failures[0].message),'Truncated output rejected during readback: '+failures[0].message);
  await reject('audio-clock-interruption',()=>page.evaluate(()=>{
    const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(...args){super(...args);window.__testExportAudio=this;}};
  }),()=>page.evaluate(()=>window.__testExportAudio.suspend()));
  assert(failures[1].message.includes('audio clock stopped'),'Interrupted clock is a terminal timing failure');
  await reject('blocked-renderer',()=>Promise.resolve(),()=>page.evaluate(()=>{const until=performance.now()+500;while(performance.now()<until){}}));
  assert(failures[2].message.includes('Rendering stalled'),'A half-second rendering freeze must not be hidden');
  await reject('ended-capture-track',()=>page.evaluate(()=>{
    const native=HTMLCanvasElement.prototype.captureStream;
    HTMLCanvasElement.prototype.captureStream=function(...args){const stream=native.apply(this,args);window.__testCaptureStream=stream;return stream;};
  }),()=>page.evaluate(()=>window.__testCaptureStream.getVideoTracks()[0].stop()));
  assert(/media track ended|recording failed/i.test(failures[3].message),'An ended capture track must not offer a partial video');
  const report={status:'passed',verification,timing,minimumClip,fallback,denseCaptions,failures};
  const saved=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='reliability-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);
  await(await saved).saveAs('output/playwright/reliability-report.json');
}
