// Server-only diagnosis of the public page and its actual shared engine.
async page=>{
  const errors=[],responses=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('response',response=>{if(response.status()>=400)responses.push({url:response.url(),status:response.status()});});
  await page.reload();await page.waitForTimeout(5000);
  const report=await page.evaluate(async()=>{
    const value={url:location.href,engine:document.querySelector('.badge')?.dataset.engine,hasExportMode:!!document.querySelector('#export-mode'),hasBundleSave:!!document.querySelector('#save-bundle'),offlineExporter:!!window.VeyCutOfflineExporter};
    for(const bypass of [false,true])try{const suffix=bypass?'?diagnostic='+Date.now():'';const module=await import('./pkg/veycut_web.js'+suffix);await module.default(bypass?{module_or_path:new URL('./pkg/veycut_web_bg.wasm'+suffix,location.href)}:undefined);const engine=new module.WebEditor();const result=JSON.parse(engine.create_project(JSON.stringify({name:'Hosted diagnostic',width:720,height:1280,rateNum:30,rateDen:1})));engine.free();value[bypass?'uncachedEngine':'normalEngine']={ok:result.ok};}catch(error){value[bypass?'uncachedEngine':'normalEngine']={error:error.name+': '+error.message};}
    return value;
  });report.errors=errors;report.failedResponses=responses;
  const next=page.waitForEvent('download');await page.evaluate(value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)])),a=document.createElement('a');a.href=url;a.download='hosted-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);await(await next).saveAs('hosted-diagnostic.json');
}
