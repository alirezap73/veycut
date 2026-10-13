// GitHub only: exercise the deployed page's own codec assets, not a localhost copy.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const diagnostics=[];page.on('console',message=>{if(message.type()==='error')diagnostics.push(message.text());});
  try{await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');}catch(error){throw Error('Hosted engine did not initialize: '+JSON.stringify(diagnostics)+'; '+error.message);}
  assert(await page.title()==='VeyCut Web','Hosted title');
  const build=await page.evaluate(async()=>{const response=await fetch('./build-info.json',{cache:'no-store'});if(!response.ok)throw Error('Missing hosted build identity');return response.json();});
  await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
  await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('360x640');await page.locator('#export-fps').selectOption('30');
  const next=page.waitForEvent('download',{timeout:60000});next.catch(()=>{});await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:55000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());await(await next).saveAs('hosted-frame.mp4');
  const encoding=JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'));
  assert(encoding.frames===60&&encoding.audioCodec==='aac','Hosted fixed-grid H.264/AAC');
  const report={status:'passed',build,encoding,precision:await page.locator('#export-status').getAttribute('data-precision'),scope:'Actual public page, two-second generated source on GitHub Chromium; not every browser or device.'};
  const saved=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='hosted-frame-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);await(await saved).saveAs('hosted-frame-report.json');
}
