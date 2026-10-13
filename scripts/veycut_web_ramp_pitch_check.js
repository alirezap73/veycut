// GitHub-only fixed-frame ramp export, stereo pitch, source timing and project preservation.
async page=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message);},results=[];
 for(const speeds of [[.5,1,1.5],[1.5,1,.5],[.25,2,4]]){
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#media-input').setInputFiles('output/playwright/ramp-tone.wav');await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
  await page.locator('details:has(#apply-curve) summary').click();for(const [id,v] of [['curve-start',speeds[0]],['curve-middle',speeds[1]],['curve-end',speeds[2]]])await page.locator('#'+id).fill(String(v));await page.locator('#apply-curve').click();await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips[0].speedCurve?.length===3);
  await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('640x360');await page.locator('#export-fps').selectOption('24');
  const before=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),clip=await page.evaluate(()=>window.VeyCutWeb.snapshot().clips[0]);
  const event=page.waitForEvent('download',{timeout:90000});event.catch(()=>{});await page.locator('#video-export').click();await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:85000});assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
  const file='ramp-'+results.length+'.mp4';await(await event).saveAs('output/playwright/'+file);assert(before===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Ramp output preserves project');
  const markers=await page.evaluate(()=>{const clip=window.VeyCutWeb.snapshot().clips[0];return [1,3,5,7].map(source=>window.VeyCutCompositor.timelineTime(clip,source));});results.push({speeds,clip,file,markers,encoding:JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'))});
 }
 const pure=await page.evaluate(async()=>{
  const {createPitchStream}=await import('./pitch-stream.js'),rate=48000,total=8*rate,map=f=>{const x=f/(8*rate);return 8*rate*(.5*x+.5*x*x);};
  const stream=await createPitchStream({sampleRate:rate,tempo:.5,sourceFrames:total,outputFrames:total,sourceAtFrame:map,feed:async(first,count)=>{const data=new Float32Array(count*2);for(let i=0;i<count;i++){data[i*2]=.4*Math.sin(2*Math.PI*880*(first+i)/rate);data[i*2+1]=.25*Math.sin(2*Math.PI*660*(first+i)/rate);}return data;}});
  try{for(let t=0;t<8;t++)await stream.read(Math.max(0,t-1.25),t+1);return stream.stats();}finally{stream.dispose();}
 });assert(pure.peakMappingErrorFrames<1200,'Bounded curve source timing');
 const report={results,pure,scope:'Synthetic ramps on Chromium; real speech and Mac comparison are separate.'};const next=page.waitForEvent('download');await page.evaluate(report=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report)]));a.download='ramp-pitch-report.json';a.click();},report);await(await next).saveAs('output/playwright/ramp-pitch-report.json');
}
