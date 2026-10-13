// Actual saved native document -> file reconnection -> UI MP4 frame export.
async page => {
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  const cases=await page.evaluate(async()=>{const response=await fetch('./parity-fixtures/cases.json');if(!response.ok)throw Error('Missing comparison fixtures');return response.json();});
  const results=[];
  for(const fixture of cases){
    const name=fixture.name;
    await page.locator('#project-input').setInputFiles('output/native-parity/'+name+'.json');
    await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length>0&&!document.querySelector('#import').disabled);
    const state=await page.evaluate(()=>window.VeyCutWeb.snapshot());
    const image=state.clips.find(c=>c.kind==='image');assert(image,'Native image must survive browser open');
    await page.locator(`#timeline .timeline-clip[data-clip-id="${image.id}"]`).click();
    const chosen=page.waitForEvent('filechooser');await page.locator('#reselect').click();await(await chosen).setFiles('output/native-parity/source.png');
    await page.waitForFunction(id=>window.VeyCutWeb.media().get(id)?.url?.startsWith('blob:')&&!document.querySelector('#import').disabled,image.mediaId);
    await page.evaluate(async()=>{await document.fonts.load('600 32px Vazirmatn');await document.fonts.ready;if(!document.fonts.check('600 32px Vazirmatn'))throw Error('Shared font did not load');});
    const before=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
    await page.locator('#export-size').selectOption('640x360');await page.locator('#export-fps').selectOption('24');
    await page.locator('#export-mode').selectOption('frames');await page.locator('#export-video-codec').selectOption('avc');await page.locator('#export-quality').selectOption('detailed');
    const pending=page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.mp4'),timeout:60000});pending.catch(()=>{});
    await page.locator('#video-export').click();await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:55000});
    assert(await page.locator('#export-status').getAttribute('data-state')==='done',name+': '+await page.locator('#export-status').textContent());
    await(await pending).saveAs('output/native-parity/web-'+name+'.mp4');
    const encoding=JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'));
    assert(encoding.frames===24&&encoding.videoCodec==='avc',name+': scheduled frame grid');
    assert(before===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),name+': export changed document');
    results.push({name,encoding});
  }
  const pending=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='browser-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},{results,scope:'Exact native saved edit, original PNG, same font, actual browser frame MP4'});await(await pending).saveAs('output/native-parity/browser-report.json');
}
