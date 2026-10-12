// Executed by playwright-cli on the GitHub runner.
async page => {
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#media-input').setInputFiles('output/playwright/tone-bass.wav');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1);
  assert((await page.evaluate(()=>window.VeyCutWeb.snapshot().clips[0].kind))==='audio','Audio source imported');
  await page.locator('#export-size').selectOption('360x640');
  const exportAudio=async name=>{
    const pending=page.waitForEvent('download',{timeout:45000});
    await page.locator('#video-export').click();
    await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:40000});
    assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
    await (await pending).saveAs('output/playwright/'+name);
  };
  await exportAudio('tone-baseline.webm');
  await page.locator('details:has(#audio-tone-select) summary').click();
  await page.locator('#audio-tone-select').selectOption('concat.bass');
  await page.locator('#audio-tone-gain').fill('12');
  await page.locator('#audio-tone-apply').click();
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips[0].filters?.some(f=>f.id==='concat.bass'&&f.params.gain===12));
  await page.locator('#play').click();
  await page.waitForTimeout(200);
  assert(!(await page.locator('#status').textContent()).includes('not yet available'),'Live filtered preview');
  await page.locator('#play').click();
  await exportAudio('tone-bass.webm');
  await page.locator('#audio-tone-remove').click();
  await page.waitForFunction(()=>!window.VeyCutWeb.snapshot().clips[0].filters?.length);
  await page.locator('#undo').click();
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips[0].filters?.some(f=>f.id==='concat.bass'));
}
