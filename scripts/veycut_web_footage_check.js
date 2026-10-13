// GitHub-only unchanged MDN photographic sample: fractional trim, portable reopen, MP4.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const url='https://alirezap73.github.io/veycut/';
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  const build=await page.evaluate(async()=>await(await fetch('build-info.json',{cache:'no-store'})).json());
  await page.locator('#media-input').setInputFiles('output/playwright/footage.mp4');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
  await page.locator('#trim-in').fill('0.37');await page.locator('#trim-out').fill('2.87');await page.locator('#trim').click();
  await page.locator('#clip-start').fill('0');await page.locator('#move-clips').click();
  const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
  const bundle=page.waitForEvent('download');await page.locator('#save-bundle').click();await(await bundle).saveAs('output/playwright/footage.veycut');
  await page.reload();await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#project-input').setInputFiles('output/playwright/footage.veycut');
  await page.waitForFunction(()=>window.VeyCutWeb.media().size===1&&!document.querySelector('#save').disabled);
  assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Fractional trim survives fresh-page reopen');
  assert(await page.locator('#reselect').isHidden(),'Original footage reconnected');
  await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('640x360');await page.locator('#export-fps').selectOption('24');
  const download=page.waitForEvent('download',{timeout:90000});download.catch(()=>{});await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:85000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
  await(await download).saveAs('output/playwright/footage-output.mp4');
  assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Export preserves edits');
  const report={build,freshPageReopen:true,originalMediaEmbedded:true,trim:[.37,2.87],encoding:JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'))};
  const event=page.waitForEvent('download');await page.evaluate(report=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report)],{type:'application/json'}));a.download='footage-browser.json';a.click();},report);await(await event).saveAs('output/playwright/footage-browser.json');
}
