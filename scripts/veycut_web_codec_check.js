// Actual frame encoders, with explicit unavailable-codec refusal and no substitution.
async page=>{
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1&&!document.querySelector('#video-export').disabled);
  await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('360x640');await page.locator('#export-fps').selectOption('24');
  const expected=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),results=[];
  for(const codec of ['avc','hevc','av1']){
    const supported=await page.evaluate(async codec=>{const MB=await import('./vendor/mediabunny.min.mjs');return MB.canEncodeVideo(codec,{width:360,height:640,frameRate:24,quality:new MB.Quality({bitrate:2000000})});},codec);
    await page.locator('#export-video-codec').selectOption(codec);
    const downloads=[];const observe=item=>downloads.push(item);page.on('download',observe);
    const next=supported?page.waitForEvent('download',{timeout:60000}):null;next?.catch(()=>{});
    try{
      await page.locator('#video-export').click();await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:55000});
      const state=await page.locator('#export-status').getAttribute('data-state'),message=await page.locator('#export-status').textContent();
      if(supported){assert(state==='done',message);await(await next).saveAs('output/playwright/codec-'+codec+'.mp4');const encoding=JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'));assert(encoding.videoCodec===codec&&encoding.frames===48&&encoding.audioCodec==='aac','Requested codec and exact frame count');results.push({codec,supported:true,encoding});}
      else{assert(state==='error'&&message.includes('unavailable on this device'),message);assert(!downloads.length,'Unavailable codec must not download another format');results.push({codec,supported:false,refused:true,downloads:0});}
      assert(expected===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Every codec attempt preserves project edits');
    }finally{page.off('download',observe);}
  }
  const report={status:'passed',seconds:2,fps:24,results,scope:'Actual encoders on this runner; unavailable codecs are refused. SDR only, not universal codec/device support.'};
  const saved=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='codec-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);await(await saved).saveAs('output/playwright/codec-report.json');
}
