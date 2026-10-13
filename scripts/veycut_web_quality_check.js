// Server-only quality selection, actual encoder options, recordings and early budget refusal.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const fresh=async()=>{
    await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
    await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');
    await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
    await page.evaluate(()=>{const Native=window.MediaRecorder;window.__qualityOptions=[];window.MediaRecorder=class extends Native{constructor(stream,options){super(stream,options);window.__qualityOptions.push(options);}};});
  };
  const profiles=[];
  for(const [quality,bitrate] of [['compact',2000000],['balanced',5000000],['detailed',8000000]]){
    await fresh();await page.locator('#export-format').selectOption('mp4');await page.locator('#export-quality').selectOption(quality);
    assert((await page.locator('#export-quality-note').textContent()).includes('256 MiB'),'Visible output budget');
    const output=page.waitForEvent('download',{timeout:35000});output.catch(()=>{});await page.locator('#video-export').click();
    await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:30000});
    assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
    await(await output).saveAs(`output/playwright/quality-${quality}.mp4`);
    const options=await page.evaluate(()=>window.__qualityOptions),encoding=JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'));
    assert(options.length===1&&options[0].videoBitsPerSecond===bitrate&&encoding.quality===quality,'Selected bitrate reaches the real encoder');
    profiles.push({quality,options:options[0],encoding});
  }
  await fresh();await page.locator('#shape-panel').evaluate(node=>node.open=true);
  await page.locator('#shape-duration').fill('600');await page.locator('#add-shape').click();
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.some(c=>c.kind==='shape'));
  await page.locator('#export-quality').selectOption('detailed');
  const downloads=[];const observe=item=>downloads.push(item.suggestedFilename());page.on('download',observe);
  try{
    await page.locator('#video-export').click();await page.waitForFunction(()=>document.querySelector('#export-status').dataset.state==='error');
    assert((await page.locator('#export-status').textContent()).includes('Choose Compact'),'Actionable capacity refusal');
    assert(await page.evaluate(()=>window.__qualityOptions.length)===0&&!downloads.length,'Budget refusal happens before encoder creation or download');
  }finally{page.off('download',observe);}
  const report={status:'passed',profiles,overBudget:{seconds:600,quality:'detailed',encoderCreated:false,downloaded:false}};
  const saved=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='quality-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);
  await(await saved).saveAs('output/playwright/quality-report.json');
}
