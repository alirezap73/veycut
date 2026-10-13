// GitHub-only real UI export: compressed ten-minute AAC input -> five-minute 2x MP4.
async page=>{
 await page.goto('https://alirezap73.github.io/veycut/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
 await page.locator('#media-input').setInputFiles('output/playwright/pitch-long.m4a');await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
 await page.locator('details:has(#clip-speed) summary').click();await page.locator('#clip-speed').fill('2');await page.locator('#apply-speed').click();await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips[0].speed===2);
 // AAC container duration can include the final padding packet; use exact authored trim.
 await page.locator('#trim-in').fill('0');await page.locator('#trim-out').fill('600');await page.locator('#trim').click();
 await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('640x360');await page.locator('#export-fps').selectOption('24');
 const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),download=page.waitForEvent('download',{timeout:480000});download.catch(()=>{});await page.locator('#video-export').click();
 await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:470000});
 if(await page.locator('#export-status').getAttribute('data-state')!=='done')throw Error(await page.locator('#export-status').textContent());await(await download).saveAs('output/playwright/pitch-long-output.mp4');
 if(expected!==await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())))throw Error('Long output changed project');
 const report=await page.evaluate(async()=>({build:await(await fetch('build-info.json',{cache:'no-store'})).json(),encoding:JSON.parse(document.querySelector('#export-status').dataset.encoding),clip:window.VeyCutWeb.snapshot().clips[0]}));
 const saved=page.waitForEvent('download');await page.evaluate(report=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report)]));a.download='pitch-long-export.json';a.click();},report);await(await saved).saveAs('output/playwright/pitch-long-export.json');
}
