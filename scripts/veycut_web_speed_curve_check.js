// GitHub runner: apply a native speed curve, preview its source map and decode an exported video.
async page => {
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1);
  await page.locator('details:has(#apply-curve) summary').click();
  await page.locator('#curve-start').fill('0.5');
  await page.locator('#curve-middle').fill('1');
  await page.locator('#curve-end').fill('1.5');
  await page.locator('#apply-curve').click();
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips[0].speedCurve?.length===3);
  const map=await page.evaluate(()=>{
    const clip=window.VeyCutWeb.snapshot().clips[0],c=window.VeyCutCompositor;
    return {duration:clip.duration,source:c.sourceTime(clip,clip.start+clip.duration/2),end:c.sourceTime(clip,clip.start+clip.duration),curve:clip.speedCurve};
  });
  assert(Math.abs(map.duration-2)<.03,'Curve preserves two-second timeline: '+JSON.stringify(map));
  assert(Math.abs(map.source-.75)<.03,'Preview uses integrated source mapping: '+JSON.stringify(map));
  assert(Math.abs(map.end-2)<.03,'Curve reaches source end: '+JSON.stringify(map));
  await page.locator('#playhead').fill('1');
  await page.waitForFunction(()=>document.querySelector('#preview-canvas').dataset.pending==='false');
  assert(!await page.locator('#preview-canvas').getAttribute('data-error'),'Curved preview decoded');
  await page.locator('#playhead').fill('0');
  await page.locator('#export-size').selectOption('360x640');
  const download=page.waitForEvent('download',{timeout:45000});
  await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:40000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
  await (await download).saveAs('output/playwright/speed-curve.webm');
  await page.locator('#undo').click();
  await page.waitForFunction(()=>!window.VeyCutWeb.snapshot().clips[0].speedCurve);
  await page.locator('#redo').click();
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips[0].speedCurve?.length===3);
}
