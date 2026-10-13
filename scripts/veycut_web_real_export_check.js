// Two stages: native chooser reconnects the same real footage after project reopening.
async page=>{
  const {seconds,mode}=await page.evaluate(async()=>{const response=await fetch('/real-export-config.json');if(!response.ok)throw Error('Missing real-footage test configuration');return response.json();});
  if(![360,600].includes(seconds))throw Error('Unsupported real-footage test length');
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const save=async(button,path)=>{const next=page.waitForEvent('download');await page.locator(button).click();await(await next).saveAs(path);};
  if(await page.locator('body').getAttribute('data-real-stage')!=='reconnect'){
    await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
    await page.locator('#media-input').setInputFiles('output/playwright/real-source.webm');
    await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
    assert(await page.evaluate(()=>window.VeyCutWeb.snapshot().clips[0].out)>600,'Import real source longer than ten minutes');
    await page.locator('#trim-in').fill('30');await page.locator('#trim-out').fill(String(30+seconds));await page.locator('#trim').click();
    await page.locator('#clip-start').fill('0');await page.locator('#move-clips').click();
    await page.locator('#srt-input').setInputFiles('output/playwright/real-captions.srt');
    await page.waitForFunction(()=>window.VeyCutWeb.snapshot().cues.length===1);
    await save('#save','output/playwright/real-project.json');
    const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
    await page.locator('#project-input').setInputFiles('output/playwright/real-project.json');await page.locator('#reselect').waitFor({state:'visible'});
    await page.evaluate(value=>{document.body.dataset.realStage='reconnect';document.body.dataset.realExpected=value;},expected);return;
  }
  await page.waitForFunction(()=>!document.querySelector('#play').disabled);
  const expected=await page.locator('body').getAttribute('data-real-expected');
  assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Real-footage project survives reconnect');
  await page.locator('#export-size').selectOption('640x360');await page.locator('#export-fps').selectOption('24');if(mode==='frames')await page.locator('#export-mode').selectOption('frames');await page.locator('#export-format').selectOption('mp4');
  let profile=await page.evaluate(()=>{const p=window.VeyCutExporter.capability('mp4');return {mime:p.mime,audioCodec:p.audioCodec};});
  const maximum=mode==='frames'?seconds*2:seconds+90;
  const download=page.waitForEvent('download',{predicate:item=>item.suggestedFilename()==='VeyCut-video.mp4',timeout:(maximum+10)*1000});download.catch(()=>{});await page.locator('#video-export').click();
  let lastProgress=-1,stalled=0;
  for(let elapsed=0;elapsed<maximum;elapsed+=20){
    try{await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:20000});break;}
    catch(error){if(!String(error).includes('Timeout'))throw error;}
    const diagnostic=await page.evaluate(()=>({state:document.querySelector('#export-status').dataset.state,progress:Number(document.querySelector('#export-progress').value),message:document.querySelector('#export-status').textContent,memoryBytes:performance.memory?.usedJSHeapSize}));
    diagnostic.elapsedSeconds=elapsed+20;
    const saved=page.waitForEvent('download',{predicate:item=>item.suggestedFilename()==='real-progress.json'});await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='real-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},diagnostic);await(await saved).saveAs('output/playwright/real-progress.json');
    stalled=diagnostic.progress===lastProgress?stalled+20:0;lastProgress=diagnostic.progress;
    if(stalled>=60)throw Error('Long export stopped progressing: '+JSON.stringify(diagnostic));
  }
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
  await(await download).saveAs('output/playwright/real-video.mp4');
  const verification=JSON.parse(await page.locator('#export-status').getAttribute('data-verification')),timing=JSON.parse(await page.locator('#export-status').getAttribute('data-timing'));
  assert(verification.frameCallbacks&&verification.decodedEnd>seconds-.5&&Math.abs(verification.duration-seconds)<.5,'Full requested decoded coverage');
  await save('#save','output/playwright/real-project-after.json');assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Recording preserves edits');
  const precision=await page.locator('#export-status').getAttribute('data-precision'),encoding=JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'));if(mode==='frames'){assert(precision==='fixed-frame-timestamps'&&encoding.frames===seconds*24&&encoding.audioCodec==='aac','Full frame grid and AAC audio');profile={mime:await page.locator('#export-status').getAttribute('data-mime'),audioCodec:encoding.audioCodec};}
  const report={status:'passed',seconds,mode,precision,encoding,sourceIn:30,profile,verification,timing,fixture:'Tears of Steel, Blender Foundation / Mango project, CC BY 3.0; live-action and CGI, original 1080p source; licensed excerpt for testing only; https://mango.blender.org/about/'+(mode==='frames'?'; picture stream copied, audio converted to Opus on GitHub for input-decoder compatibility':'')};
  const saved=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='real-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);
  await(await saved).saveAs('output/playwright/real-report.json');await page.screenshot({path:'output/playwright/real-export.png',fullPage:true});
}
