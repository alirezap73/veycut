// Reconnect actual native ramp media through CLI-managed picker stages.
async page=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message);};let task=await page.evaluate(()=>window.__nativeAudioTask||null);
 if(!task){await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');const cases=await page.evaluate(async()=>await(await fetch('./parity-fixtures/audio-cases.json')).json());task={cases,index:0,phase:'prepare',results:[]};}
 const item=task.cases[task.index];
 if(task.phase==='prepare'){
  await page.locator('#project-input').setInputFiles('output/native-parity/'+item.name+'.json');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#import').disabled);
  const clip=await page.evaluate(()=>window.VeyCutWeb.snapshot().clips[0]);assert(clip.kind==='audio'&&clip.preservePitch!==false&&clip.speedCurve?.length===3,item.name+': canonical native ramp');
  await page.locator(`#timeline .timeline-clip[data-clip-id="${clip.id}"]`).click();
 task.clip=clip;task.phase='export';await page.evaluate(task=>window.__nativeAudioTask=task,task);return;
 }
 const clip=task.clip;
  await page.waitForFunction(id=>window.VeyCutWeb.media().get(id)?.url?.startsWith('blob:')&&!document.querySelector('#import').disabled,clip.mediaId);
  const before=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
  await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('640x360');await page.locator('#export-fps').selectOption('24');
  const event=page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.mp4'),timeout:120000});event.catch(()=>{});await page.locator('#video-export').click();await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:115000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',item.name+': '+await page.locator('#export-status').textContent());await(await event).saveAs('output/native-parity/web-'+item.name+'.mp4');
  assert(before===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Audio comparison preserves native edit');
  const markers=await page.evaluate(()=>{const c=window.VeyCutWeb.snapshot().clips[0];return [1,3,5,7].map(t=>window.VeyCutCompositor.timelineTime(c,t));});task.results.push({name:item.name,clip,markers,encoding:JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'))});
 task.index++;task.phase='prepare';await page.evaluate(task=>window.__nativeAudioTask=task,task);
 if(task.index===task.cases.length){const event=page.waitForEvent('download');await page.evaluate(report=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report)]));a.download='browser-audio-report.json';a.click();},{results:task.results});await(await event).saveAs('output/native-parity/browser-audio-report.json');}
}
