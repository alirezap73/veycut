// Runs exclusively on GitHub's Chromium runner with the real local fixture.
async page => {
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(()=>document.querySelector('.badge').dataset.engine==='wasm');
  await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#import').disabled);
  const time=()=>page.locator('#playhead').evaluate(el=>Number(el.value));
  await page.locator('#transport-start').click();await page.locator('#transport-forward').click();
  assert(Math.abs(await time()-1/30)<.001,'Next frame advances by actual project rate');
  await page.locator('#transport-back').click();assert(await time()<.001,'Previous frame returns to zero');
  await page.locator('#transport-end').click();assert(Math.abs(await time()-2)<.02,'End reaches timeline duration');
  await page.locator('#transport-start').click();await page.locator('h1').click();
  await page.keyboard.press('Shift+ArrowRight');assert(Math.abs(await time()-10/30)<.001,'Shift step advances ten frames');
  await page.keyboard.press('Home');assert(await time()<.001,'Home returns to beginning');
  await page.locator('#trim-in').focus();await page.keyboard.press('ArrowRight');assert(await time()<.001,'Transport does not intercept numeric field editing');
  await page.locator('#play').click();
  await page.waitForFunction(()=>Number(document.querySelector('#audio-peak-status').dataset.livePeak)>0.001,null,{timeout:10000});
  const levels=await page.evaluate(()=>({left:document.querySelector('#audio-meter-left').value,right:document.querySelector('#audio-meter-right').value,peak:document.querySelector('#audio-peak-status').dataset.livePeak}));
  assert(levels.left>-60&&levels.right>-60,'Real decoded source audio drives both meter channels');
  await page.locator('#play').click();const stopped=await time();await page.waitForTimeout(200);
  assert(Math.abs(await time()-stopped)<.02,'Pause stops the shared timeline clock');
  assert(await page.locator('#audio-meter-left').evaluate(el=>el.value)===-60,'Paused meters report silence');
  // No project mutation is used to exercise transport or stereo monitoring.
  console.log(JSON.stringify({status:'passed',checks:['frame-controls','ten-frame-keyboard-step','keyboard-field-focus','real-stereo-meters','pause-clock-and-meters'],levels}));
}
