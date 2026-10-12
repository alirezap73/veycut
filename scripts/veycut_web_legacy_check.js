// Real legacy-project migration and preservation checks; GitHub runner only.
async (page) => {
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const snapshot=()=>page.evaluate(()=>window.VeyCutWeb.snapshot());
  const pending=await page.locator('body').getAttribute('data-legacy-stage');
  if(!pending){
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(()=>document.querySelector('.badge').dataset.engine==='wasm');
    await page.locator('#project-input').setInputFiles('output/playwright/legacy-project.json');
    await page.waitForFunction(()=>document.querySelector('.badge').dataset.engine==='javascript'&&window.VeyCutWeb.snapshot().clips.length===2);
    const before=await snapshot();
    assert(before.clips.every(c=>c.kind==='video'&&Number.isFinite(c.duration)&&Number.isFinite(c.start)),'Legacy clips normalized before rendering');
    await page.locator('#project-input').setInputFiles('output/playwright/legacy-invalid.json');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Invalid'));
    assert(JSON.stringify(await snapshot())===JSON.stringify(before),'Malformed legacy project preserves current session');
    await page.locator('#reselect').waitFor({state:'visible'});
    await page.locator('body').evaluate(el=>el.dataset.legacyStage='reconnect');
    return;
  }
  await page.waitForFunction(()=>!document.querySelector('#play').disabled);
  await page.locator('#trim-in').fill('.3');await page.locator('#trim-out').fill('.9');await page.locator('#trim').click();
  let state=await snapshot();assert(Math.abs(state.clips[0].duration-.6)<.002,'Legacy fallback trim has finite duration');
  await page.locator('#playhead').evaluate(el=>{el.value='.5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>{const el=document.querySelector('#video');return Math.abs(el.currentTime-.6)<.02&&!el.seeking&&el.readyState>=2;});
  await page.locator('#split').click();await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===3);
  await page.locator('#undo').click();await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===2);
  await page.locator('#redo').click();await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===3);
  state=await snapshot();assert(state.clips.filter(c=>c.id!==state.clips[1].id).every(c=>Math.abs(c.duration-.3)<.002),'Fallback split stores each actual source duration');
  const download=page.waitForEvent('download');
  await page.evaluate(()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({status:'passed',checks:['legacy-normalization','invalid-legacy-preservation','legacy-reconnection','fallback-trim-split-undo-redo']})],{type:'application/json'}));a.href=url;a.download='legacy-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  await(await download).saveAs('output/playwright/legacy-report.json');
}
