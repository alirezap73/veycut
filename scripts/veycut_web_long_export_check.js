// GitHub runner only. Two CLI stages let the native media chooser reconnect a saved project.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};let phase='start';
  const source='output/playwright/long-source.mp4';
  const download=async(button,path)=>{const pending=page.waitForEvent('download',{timeout:30000});await page.locator(button).click();await(await pending).saveAs(path);};
  try{
    if(await page.locator('body').getAttribute('data-long-stage')!=='reconnect'){
      await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
      phase='import-300-second-source';await page.locator('#media-input').setInputFiles(source);
      await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#import').disabled);
      phase='late-persian-caption';await page.locator('#srt-input').setInputFiles('output/playwright/long-captions.srt');
      await page.waitForFunction(()=>window.VeyCutWeb.snapshot().cues.length===1);
      await download('#save','output/playwright/long-project.json');
      const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
      phase='reopen';await page.locator('#project-input').setInputFiles('output/playwright/long-project.json');
      await page.locator('#reselect').waitFor({state:'visible'});
      await page.evaluate(value=>{document.body.dataset.longStage='reconnect';document.body.dataset.longExpected=value;},expected);
      return;
    }
    phase='reconnected';await page.waitForFunction(()=>!document.querySelector('#play').disabled);
    const expected=await page.locator('body').getAttribute('data-long-expected');
    assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Long project reconnect preserves native edits');
    await page.locator('#export-size').selectOption('360x640');await page.locator('#export-fps').selectOption('24');
    phase='cancel-long-export';const cancelled=[];const observe=item=>cancelled.push(item.suggestedFilename());page.on('download',observe);
    try{
      await page.locator('#video-export').click();
      await page.waitForFunction(()=>document.querySelector('#export-status').dataset.state==='recording'&&Number(document.querySelector('#export-progress').value)>1,null,{timeout:30000});
      await page.locator('#export-cancel').click();await page.waitForFunction(()=>document.querySelector('#export-status').dataset.state==='cancelled');
      assert(cancelled.length===0,'Cancelled long recording offers no download');
      await page.waitForFunction(()=>!document.querySelector('#save').disabled);
      assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Long cancellation preserves edits');
    }finally{page.off('download',observe);}
    phase='record-five-minutes';const output=page.waitForEvent('download',{timeout:390000});output.catch(()=>{});
    await page.locator('#video-export').click();
    await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:380000});
    assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
    phase='save-long-output';await(await output).saveAs('output/playwright/long-video.webm');
    const verification=JSON.parse(await page.locator('#export-status').getAttribute('data-verification'));
    const timing=JSON.parse(await page.locator('#export-status').getAttribute('data-timing'));
    assert(verification.frameCallbacks&&verification.decodedEnd>299.5&&Math.abs(verification.duration-300)<.5,'Final decoded video coverage: '+JSON.stringify(verification));
    assert(timing.maxSourceDrift<=.35&&timing.maxRenderGap<=.35,'Bounded long-recording drift: '+JSON.stringify(timing));
    await download('#save','output/playwright/long-project-after.json');
    assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Five-minute export preserves project');
    const report={status:'passed',seconds:300,requestedFps:24,verification,timing,cancellationDownloaded:false,source:'Synthetic five-minute colour/audio markers and a late Persian caption; not a real-camera or cross-browser test.'};
    const saved=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='long-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);
    await(await saved).saveAs('output/playwright/long-report.json');
    await page.screenshot({path:'output/playwright/long-export-done.png',fullPage:true});
  }catch(error){
    const state=await page.locator('#export-status').textContent().catch(()=>null);
    await page.screenshot({path:'output/playwright/long-export-failure.png',fullPage:true}).catch(()=>{});
    throw Error('Long export phase='+phase+': '+error.message+'; status='+state);
  }
}
