// GitHub-only unchanged published H.264/AAC sample; no input transcoding.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#media-input').setInputFiles('output/playwright/mp4-input.mp4');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
  await page.locator('#trim-in').fill('10');await page.locator('#trim-out').fill('14');await page.locator('#trim').click();
  await page.locator('#clip-start').fill('0');await page.locator('#move-clips').click();
  await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('640x360');await page.locator('#export-fps').selectOption('24');
  const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
  const download=page.waitForEvent('download',{timeout:60000});download.catch(()=>{});await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:55000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
  await(await download).saveAs('output/playwright/mp4-input-output.mp4');
  const encoding=JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'));
  assert(encoding.frames===96&&encoding.audioCodec==='aac','Four-second fixed-grid AAC output');
  assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Input test preserves project');
}
