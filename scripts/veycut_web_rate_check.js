// GitHub-only rational native timeline and explicit 50 fps output.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#project-input').setInputFiles('output/playwright/portable-project.veycut');
  await page.waitForFunction(()=>window.VeyCutWeb.media().size===3&&!document.querySelector('#save').disabled);
  await page.evaluate(()=>{const original=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type==='application/vnd.veycut.project')window.__rateBundle=blob;return original.call(this,blob);};});
  const original=page.waitForEvent('download');await page.locator('#save-bundle').click();await original;
  const changed=page.waitForEvent('download',{predicate:item=>item.suggestedFilename()==='rational.veycut'});
  await page.evaluate(async()=>{
    const {project,files}=await window.VeyCutProjectBundle.read(window.__rateBundle),rate={rateNum:30000,rateDen:1001};
    Object.assign(project.video,rate);Object.assign(project.engineDocument.video,rate);for(const timeline of project.engineDocument.timelines)Object.assign(timeline.video,rate);
    const blob=window.VeyCutProjectBundle.create(project,files),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rational.veycut';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });await(await changed).saveAs('output/playwright/rational.veycut');
  await page.locator('#project-input').setInputFiles('output/playwright/rational.veycut');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().video.rateDen===1001&&!document.querySelector('#save').disabled);
  assert(await page.locator('#export-fps').inputValue()==='timeline','Export defaults to the active timeline rate');
  assert((await page.locator('#export-fps option[value=timeline]').textContent()).includes('29.970'),'Rational rate visible in English');
  await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('360x640');
  const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
  for(const [rate,name,frames] of [['timeline','rate-rational.mp4',270],['50','rate-50.mp4',450]]){
    await page.locator('#export-fps').selectOption(rate);const next=page.waitForEvent('download',{timeout:60000});next.catch(()=>{});await page.locator('#video-export').click();
    await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:55000});
    assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());await(await next).saveAs('output/playwright/'+name);
    const encoding=JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'));assert(encoding.frames===frames,'Selected frame grid');
    assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Output rate does not change project edits or its rational timeline rate');
  }
}
