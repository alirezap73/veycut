// Real controls, still-image decode and recording on the GitHub runner only.
async page => {
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const state=()=>page.evaluate(()=>window.VeyCutWeb.snapshot());
  const native=()=>page.evaluate(()=>window.VeyCutWeb.engineDocument());
  const open=async id=>{const detail=page.locator('#'+id).locator('xpath=ancestor::details');if(await detail.count()&&!await detail.evaluate(el=>el.open))await detail.locator('summary').click();};
  const trim=async()=>{await page.locator('#trim-in').fill('0');await page.locator('#trim-out').fill('1');await page.locator('#trim').click();};
  const colour=async time=>{await page.locator('#playhead').fill(String(time));await page.locator('#playhead').dispatchEvent('input');await page.waitForFunction(()=>document.querySelector('#preview-canvas').dataset.pending==='false');return page.locator('#preview-canvas').evaluate(canvas=>{const pixel=canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data;return Array.from(pixel);});};
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge').dataset.engine==='wasm');
  await page.locator('#media-input').setInputFiles('output/playwright/layer.png');await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#import').disabled);await trim();
  await page.locator('#media-input').setInputFiles('output/playwright/blue.png');await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===2&&!document.querySelector('#import').disabled);await trim();
  const before=await native();await open('transition-select');await page.locator('#transition-select').selectOption('cross-fade');await page.locator('#transition-duration').fill('.5');await page.locator('#apply-transition').click();
  assert((await state()).clips[1].transitionIn.id==='cross-fade','Native dissolve stored in document');
  const middle=await colour(.75);assert(middle[0]>90&&middle[0]<170&&middle[2]>90&&middle[2]<170,'Dissolve preview actually mixes red and blue pixels');
  const configured=await native();await page.locator('#undo').click();assert(JSON.stringify(await native())===JSON.stringify(before),'Transition oneUndo preserves complete document');await page.locator('#redo').click();assert(JSON.stringify(await native())===JSON.stringify(configured),'TransitionRedo preserves full document');
  await page.locator('#export-size').selectOption('360x640');await page.locator('#export-format').selectOption('webm');const pending=page.waitForEvent('download',{timeout:45000});pending.catch(()=>{});await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:40000});assert(await page.locator('#export-status').getAttribute('data-state')==='done','Transition real WebM export: '+await page.locator('#export-status').textContent());await(await pending).saveAs('output/playwright/transition-video.webm');
  assert(JSON.stringify(await native())===JSON.stringify(configured),'Transition output leaves original timing unchanged');
  await page.locator('#transition-select').selectOption('fade-black');await page.locator('#transition-duration').fill('.5');await page.locator('#apply-transition').click();const black=await colour(1);assert(Math.max(...black.slice(0,3))<10,'Dip reaches black at incoming cut');
  await page.locator('#transition-select').selectOption('fade-white');await page.locator('#apply-transition').click();const white=await colour(1);assert(Math.min(...white.slice(0,3))>245,'Dip reaches white at incoming cut');
  await page.locator('#transition-select').selectOption('');await page.locator('#apply-transition').click();
  await open('effect-select');await page.locator('#effect-select').selectOption('concat.mono');await page.locator('#effect-amount').fill('0');await page.locator('#effect-secondary').fill('0');await page.locator('#apply-effect').click();const mono=await colour(1.5);assert(Math.abs(mono[0]-mono[1])<2&&Math.abs(mono[1]-mono[2])<2,'Mono effect produces actual grayscale pixels');
  const errors=await page.locator('#status').textContent();assert(!errors.includes('not yet rendered'),'No unsupported-treatment errors');
  console.log(JSON.stringify({status:'passed',checks:['native-transition-single-undo-redo','dissolve-preview-mixed-pixels','actual-transition-webm','black-white-dip-preview','native-mono-preview'],middle,black,white,mono}));
}
