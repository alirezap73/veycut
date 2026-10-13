// GitHub only: original video/image/audio payloads survive a fresh page and complete export.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const save=async(button,path)=>{const event=page.waitForEvent('download');await page.locator(button).click();await(await event).saveAs(path);};
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  for(const [i,path] of ['docs/beta-samples/portrait-2s.mp4','output/playwright/layer.png','output/playwright/tone.wav'].entries()){
    await page.locator('#media-input').setInputFiles(path);await page.waitForFunction(count=>window.VeyCutWeb.media().size===count&&!document.querySelector('#save').disabled,i+1);
  }
  await page.locator('#srt-input').setInputFiles('output/playwright/captions.srt');await page.waitForFunction(()=>window.VeyCutWeb.snapshot().cues.length===2);
  const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
  await page.evaluate(()=>{const native=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type==='application/vnd.veycut.project')window.__savedPortableBlob=blob;return native.call(this,blob);};});
  await save('#save-bundle','output/playwright/portable-project.veycut');await save('#save','output/playwright/bundle-before.json');
  const broken=page.waitForEvent('download');await page.evaluate(()=>{const original=window.__savedPortableBlob,url=URL.createObjectURL(original.slice(0,original.size-1)),a=document.createElement('a');a.href=url;a.download='broken-portable.veycut';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});await(await broken).saveAs('output/playwright/broken-portable.veycut');
  await page.reload();await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#project-input').setInputFiles('output/playwright/portable-project.veycut');
  await page.waitForFunction(()=>window.VeyCutWeb.media().size===3&&!document.querySelector('#save').disabled);
  assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'All native edits survive portable reopen');
  assert(await page.evaluate(()=>[...window.VeyCutWeb.media().values()].every(m=>m.url?.startsWith('blob:')&&m.file instanceof File)),'Every source reconnected without a chooser');
  assert(await page.locator('#reselect').isHidden(),'No reconnect needed');
  await save('#save','output/playwright/bundle-after.json');
  // A truncated bundle must leave the current engine, sources and playback intact.
  await page.locator('#project-input').setInputFiles('output/playwright/broken-portable.veycut');
  await page.waitForFunction(()=>!document.querySelector('#save').disabled&&document.querySelector('#status').textContent.includes('missing'));
  assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Failed bundle import preserves edits');
  await page.locator('#export-format').selectOption('mp4');await page.locator('#export-size').selectOption('360x640');
  const event=page.waitForEvent('download',{timeout:50000});event.catch(()=>{});await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:45000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());await(await event).saveAs('output/playwright/bundle-video.mp4');
  console.log(JSON.stringify({status:'passed',media:3,originalMediaEmbedded:true,freshPageReopen:true,reconnectChoosers:0,failedImportPreserved:true,exportFormat:'mp4'}));
}
