// Actual browser controls on GitHub; no local browser/video work.
async page=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 await page.goto('http://127.0.0.1:4173/');
 await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
 await page.locator('#project-format').selectOption('1280x720');await page.locator('#apply-project-format').click();
 await page.locator('#cue-text').fill('Original سلام title');await page.locator('#add-title').click();
 const imported=await page.evaluate(()=>window.VeyCutWeb.engineDocument());
 const title=imported.clips.find(c=>c.kind==='text');assert(title,'UI created title');
 title.text.fontFamily='Vazirmatn';title.text.tracking=.007;
 // Import a known native property with no editor control. Applying edited fields must preserve it.
 await page.locator('#project-input').setInputFiles({name:'title-control-import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
 await page.waitForFunction(()=>!document.querySelector('#import').disabled&&window.VeyCutWeb.snapshot().clips.length===1);
 await page.locator('#selected-title-panel > summary').click();
 const before=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
 const content='2026: Hello سلام\n2026: سلام VeyCut';
 await page.locator('#title-text').fill(content);
 for(const [id,value] of Object.entries({'title-size':'.11','title-weight':'400','title-opacity':'.75','title-stroke-width':'.003','title-line-height':'1.4','title-max-width':'.7','title-max-height':'.35','title-background-opacity':'.55','title-background-padding-x':'.045','title-background-padding-y':'.025','title-background-radius':'.02'}))await page.locator('#'+id).fill(value);
 await page.locator('#title-color').fill('#f1e2d3');await page.locator('#title-stroke-color').fill('#102030');await page.locator('#title-background-color').fill('#112233');
 await page.locator('#title-align').selectOption('right');await page.locator('#title-italic').check();await page.locator('#title-shadow').check();await page.locator('#title-background-enabled').check();
 await page.locator('#apply-title').click();
 const after=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
 const style=JSON.parse(after).clips[0].text;
 const expected={content,fontSize:.11,fontWeight:400,italic:true,color:'#f1e2d3',align:'right',opacity:.75,strokeWidth:.003,strokeColor:'#102030',shadow:true,lineHeight:1.4,maxWidth:.7,maxHeight:.35,background:'#1122338c',backgroundPaddingX:.045,backgroundPaddingY:.025,backgroundRadius:.02};
 for(const [key,value]of Object.entries(expected))assert(style[key]===value,`Title control ${key}: ${style[key]} !== ${value}`);
 assert(style.fontFamily==='Vazirmatn'&&style.tracking===.007,'Unedited imported font family and tracking preserved');
 await page.locator('#undo').click();assert(before===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'All title fields undo together');
 await page.locator('#redo').click();assert(after===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'All title fields redo together');
 // Invalid values must not partially apply other prepared fields or add a history entry.
 await page.locator('#title-opacity').fill('1.2');await page.locator('#title-text').fill('Must not apply');await page.locator('#apply-title').click();
 assert(after===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Invalid title edit is atomic');
 await page.locator('#undo').click();assert(before===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Invalid title edit adds no undo step');await page.locator('#redo').click();
 const save=page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.json')});await page.locator('#save').click();await(await save).saveAs('output/native-parity/title-controls-project.json');
 await page.reload();await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
 await page.locator('#project-input').setInputFiles('output/native-parity/title-controls-project.json');
 await page.waitForFunction(()=>!document.querySelector('#import').disabled&&window.VeyCutWeb.snapshot().clips.length===1);
 assert(after===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'All title fields and mixed content survive JSON reopen');
 // Alpha is stored by native as #rrggbbaa, without inventing an extra background-opacity field.
 assert(Math.abs(Number(await page.locator('#title-background-opacity').inputValue())-140/255)<1e-12,'Native background alpha correctly restored');
 await page.locator('#selected-title-panel > summary').click();
 for(const weight of [100,900]){await page.locator('#title-weight').fill(String(weight));await page.locator('#apply-title').click();assert(weight===await page.evaluate(()=>window.VeyCutWeb.engineDocument().clips[0].text.fontWeight),'Full supported weight range applies');await page.locator('#undo').click();assert(after===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Weight range edit preserves all other style fields');}
 // The renderer still refuses unsupported tracking. Do not silently drop the imported value.
 await page.locator('#export-mode').selectOption('frames');await page.locator('#export-size').selectOption('640x360');await page.locator('#export-fps').selectOption('24');
 await page.locator('#video-export').click();await page.waitForFunction(()=>document.querySelector('#export-status').dataset.state==='error');
 assert(.007===await page.evaluate(()=>window.VeyCutWeb.engineDocument().clips[0].text.tracking),'Refused export preserves uneditable tracking');
 // Separate supported fixture: reset only tracking through documented JSON import, not a hidden UI edit.
 const supported=await page.evaluate(()=>window.VeyCutWeb.engineDocument());supported.clips[0].text.tracking=0;
 await page.locator('#project-input').setInputFiles({name:'title-control-render.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(supported))});
 await page.waitForFunction(()=>!document.querySelector('#import').disabled&&window.VeyCutWeb.engineDocument().clips[0].text.tracking===0);
 await page.evaluate(async()=>{await document.fonts.load('italic 400 32px Vazirmatn');await document.fonts.ready;if(!document.fonts.check('italic 400 32px Vazirmatn'))throw Error('Shared title font missing');});
 const unchanged=await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument()));
 const video=page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.mp4'),timeout:60000});video.catch(()=>{});await page.locator('#video-export').click();
 await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:55000});
 assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());await(await video).saveAs('output/native-parity/title-controls-output.mp4');
 const encoding=JSON.parse(await page.locator('#export-status').getAttribute('data-encoding'));assert(encoding.frames===72,'Three-second title MP4 contains 72 scheduled frames');
 assert(unchanged===await page.evaluate(()=>JSON.stringify(window.VeyCutWeb.engineDocument())),'Title export preserves styled project');
 const report={status:'passed',expectedStyle:expected,weightRangeChecked:[100,900],importedPropertiesPreserved:['fontFamily','tracking'],atomicUndoRedo:true,invalidInputAtomic:true,jsonReopen:true,unsupportedTrackingRefused:true,renderedSupportedTitle:true,encoding,scope:'Actual title editor controls and Web MP4 encode; original nonzero tracking is preserved/refused. Pixel/native parity and human visual review are separate tests.'};
 const downloaded=page.waitForEvent('download');await page.evaluate(report=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report)],{type:'application/json'}));a.download='title-controls-report.json';a.click();},report);await(await downloaded).saveAs('output/native-parity/title-controls-report.json');
}
