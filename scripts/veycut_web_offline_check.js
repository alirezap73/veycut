// Server: frame timestamps survive artificial encoder delays without screen recording.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  async function fresh(){
    await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
    await page.locator('#project-input').setInputFiles('output/playwright/portable-project.veycut');
    await page.waitForFunction(()=>window.VeyCutWeb.media().size===3&&!document.querySelector('#save').disabled);
    await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('360x640');await page.locator('#export-fps').selectOption('24');
    await page.evaluate(()=>{const Native=window.MediaRecorder;window.__recorderCalls=0;window.MediaRecorder=class extends Native{constructor(...args){super(...args);window.__recorderCalls++;throw Error('Frame export must not record playback');}};HTMLCanvasElement.prototype.captureStream=()=>{throw Error('Frame export must not capture the screen');};});
  }
  await fresh();const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
  await page.evaluate(async()=>{const MB=await import('./vendor/mediabunny.min.mjs'),native=MB.CanvasSource.prototype.add;let frames=0;MB.CanvasSource.prototype.add=async function(...args){if(++frames%10===0)await new Promise(resolve=>setTimeout(resolve,60));return native.apply(this,args);};});
  const next=page.waitForEvent('download',{timeout:90000});next.catch(()=>{});await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:85000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());await(await next).saveAs('output/playwright/offline-video.mp4');
  const precision=await page.locator('#export-status').getAttribute('data-precision'),encoding=JSON.parse(await page.locator('#export-status').getAttribute('data-encoding')),timing=JSON.parse(await page.locator('#export-status').getAttribute('data-timing'));
  assert(precision==='fixed-frame-timestamps'&&encoding.frames===216&&timing.timelineSeconds===9,'Nine seconds must contain exactly 216 scheduled frames');
  assert(await page.evaluate(()=>window.__recorderCalls)===0,'No playback recorder used');assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Frame rendering preserves edits');
  await fresh();await page.evaluate(async()=>{const MB=await import('./vendor/mediabunny.min.mjs'),native=MB.CanvasSource.prototype.add;MB.CanvasSource.prototype.add=async function(...args){await new Promise(resolve=>setTimeout(resolve,50));return native.apply(this,args);};});
  const downloads=[];const observe=item=>downloads.push(item.suggestedFilename());page.on('download',observe);
  try{
    await page.locator('#video-export').click();await page.waitForFunction(()=>document.querySelector('#export-status').dataset.state==='rendering'&&Number(document.querySelector('#export-progress').value)>5,null,{timeout:20000});
    await page.locator('#export-cancel').click();await page.waitForFunction(()=>document.querySelector('#export-status').dataset.state==='cancelled',null,{timeout:15000});
    assert(!downloads.length,'Cancelled frame rendering offers no file');assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Cancellation preserves edits');
  }finally{page.off('download',observe);}
  const report={status:'passed',precision,encoding,timing,artificialEncoderDelay:true,recorderCalls:0,cancellationDownloaded:false,scope:'Short mixed video/image/audio and Persian caption fixture; not native pixel equivalence or a long frame-export proof.'};
  const saved=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='offline-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);await(await saved).saveAs('output/playwright/offline-report.json');console.log(JSON.stringify(report));
}
