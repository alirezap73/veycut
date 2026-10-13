// Server-only browser recording; no mocked encoder or renamed WebM.
async page=>{
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
  const profile=await page.evaluate(()=>{const p=window.VeyCutExporter.capability('mp4');return p&&{mime:p.mime,audioCodec:p.audioCodec};});
  if(!profile)throw Error('This server browser cannot exercise an actual H.264 MP4 recording');
  await page.locator('#export-format').selectOption('mp4');
  const pending=page.waitForEvent('download',{timeout:40000});pending.catch(()=>{});
  await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:35000});
  if(await page.locator('#export-status').getAttribute('data-state')!=='done')throw Error(await page.locator('#export-status').textContent());
  const output=await pending;if(!output.suggestedFilename().endsWith('.mp4'))throw Error('Incorrect MP4 download extension');
  await output.saveAs('output/playwright/browser-video.mp4');
  const verification=JSON.parse(await page.locator('#export-status').getAttribute('data-verification'));
  const report={status:'passed',profile,verification};
  const saved=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='mp4-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);
  await(await saved).saveAs('output/playwright/mp4-report.json');
}
