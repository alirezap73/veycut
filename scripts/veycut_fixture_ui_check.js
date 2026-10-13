// GitHub-only original camera files. No source remux/transcode, no private media.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const cases=[['camera-mov-narration','mov'],['camera-vfr-candidate','mp4']];
  const reports=[];
  for(const [id,extension] of cases){
    await page.goto('https://alirezap73.github.io/veycut/');
    await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
    const build=await page.evaluate(async()=>await(await fetch('build-info.json',{cache:'no-store'})).json());
    await page.locator('#project-format').selectOption('1280x720');await page.locator('#apply-project-format').click();
    await page.locator('#media-input').setInputFiles(`output/fixtures/${id}.${extension}`);
    await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled,null,{timeout:90000});
    await page.locator('#trim-in').fill('10.137931');await page.locator('#trim-out').fill('16.137931');await page.locator('#trim').click();
    await page.locator('#clip-start').fill('0');await page.locator('#move-clips').click();
    await page.locator('#playhead').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForFunction(()=>Math.abs(document.querySelector('#video').currentTime-13.137931)<.02);
    await page.locator('#split').click();
    assert((await page.evaluate(()=>window.VeyCutWeb.snapshot().clips.length))===2,'Original camera split creates two clips');
    await page.locator('#clip-start').fill('3.5');await page.locator('#move-clips').click();
    const clips=await page.evaluate(()=>window.VeyCutWeb.snapshot().clips);
    const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
    const bundle=page.waitForEvent('download',{timeout:180000});bundle.catch(()=>{});
    await page.locator('#save-bundle').click();await(await bundle).saveAs(`output/fixtures/${id}.veycut`);
    await page.reload();await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
    await page.locator('#project-input').setInputFiles(`output/fixtures/${id}.veycut`);
    await page.waitForFunction(()=>window.VeyCutWeb.media().size===1&&!document.querySelector('#save').disabled,null,{timeout:180000});
    assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Split/gap survives fresh-page reopen');
    assert(await page.locator('#reselect').isHidden(),'Original camera media reconnects');
    await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('640x360');await page.locator('#export-fps').selectOption('24');
    const download=page.waitForEvent('download',{timeout:180000});download.catch(()=>{});await page.locator('#video-export').click();
    await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:175000});
    assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
    await(await download).saveAs(`output/fixtures/${id}-output.mp4`);
    assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Camera output preserves project');
    reports.push({id,build,clips,freshPageReopen:true,encoding:JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'))});
  }
  const download=page.waitForEvent('download');await page.evaluate(reports=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(reports)],{type:'application/json'}));a.download='fixture-ui.json';a.click();},reports);
  await(await download).saveAs('output/fixtures/fixture-ui.json');
}
