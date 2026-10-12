// Run with playwright-cli run-code on the GitHub runner; UI actions only.
async page => {
  let phase='start';const checks=[];
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const snapshot=()=>page.evaluate(()=>window.VeyCutWeb.snapshot());
  const native=()=>page.evaluate(()=>window.VeyCutWeb.engineDocument());
  const exact=x=>JSON.stringify(x);
  const uploadJSON=async(value,name='desktop-project.json')=>page.locator('#project-input').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  const download=async(button,path)=>{const pending=page.waitForEvent('download');await page.locator(button).click();await(await pending).saveAs(path);};
  const waitClips=n=>page.waitForFunction(count=>window.VeyCutWeb.snapshot().clips.length===count,n);
  try {
    await page.reload();await page.setViewportSize({width:1440,height:1100});
    await page.waitForFunction(()=>document.querySelector('.badge').dataset.engine==='wasm');
    phase='seed-media';await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');await waitClips(1);
    const fixture=await native();fixture.name='Native interchange UI check';
    fixture.media[0].path='/desktop/original/portrait-2s.mp4';
    fixture.media[0].futureMediaField={preserve:'metadata'};
    fixture.clips[0].futureClipField={preserve:['one',2]};
    fixture.timelines[0].clips[0].futureClipField={preserve:['one',2]};
    fixture.futureProjectField={preserve:true};
    phase='desktop-manifest-open';await uploadJSON(fixture);
    await page.waitForFunction(()=>window.VeyCutWeb.engineDocument()?.name==='Native interchange UI check');
    const loaded=await native();assert(loaded.futureProjectField?.preserve===true,'Preserve native project extension');
    assert(loaded.clips[0].futureClipField.preserve[0]==='one','Preserve native clip extension');
    assert(loaded.media[0].path===fixture.media[0].path,'Preserve original desktop path');
    checks.push('native-open-preserves-properties');
    phase='desktop-reconnect';await page.locator('#reselect').click();
    await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');
    await page.waitForFunction(()=>document.querySelector('#reselect').hidden);
    await download('#save-native','output/playwright/native-roundtrip.json');
    await download('#save','output/playwright/native-web-envelope.json');
    assert(exact(await native())===exact(loaded),'Reconnection leaves complete native project unchanged');
    checks.push('native-reconnect-and-desktop-download');
    phase='invalid-native-preservation';const before=await snapshot(),beforeNative=await native();
    await uploadJSON({...fixture,version:2},'future-project.json');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Unsupported desktop project'));
    assert(exact(await snapshot())===exact(before)&&exact(await native())===exact(beforeNative),'Rejected native project preserves live state');
    checks.push('invalid-native-preserves-live-project');
    phase='bulk-caption-import';
    const clock=value=>{const ms=Math.round(value*1000);return '00:00:'+String(Math.floor(ms/1000)).padStart(2,'0')+','+String(ms%1000).padStart(3,'0');};
    const cues=Array.from({length:55},(_,i)=>String(i+1)+'\n'+clock(i*.1)+' --> '+clock(i*.1+.08)+'\n'+(i%2?'سلام ':'English ')+i).join('\n\n');
    await page.locator('#srt-input').setInputFiles({name:'large-bilingual.srt',mimeType:'application/x-subrip',buffer:Buffer.from(cues)});
    await waitClips(56);const imported=await snapshot(),importedNative=await native();
    assert(imported.cues.length===55&&imported.clips.filter(c=>c.kind==='text').length===55,'All55native captions imported');
    await page.locator('#undo').click();await waitClips(1);
    assert(exact(await native())===exact(beforeNative),'OneUndo restores entire pre-import native document');
    await page.locator('#redo').click();await waitClips(56);
    assert(exact(await native())===exact(importedNative),'OneRedo restores entire imported native document');
    checks.push('55-cue-single-undo-redo');
    phase='bulk-caption-replacement';const two='1\n00:00:00,000 --> 00:00:00,100\nReplacement\n\n2\n00:00:00,200 --> 00:00:00,300\nجایگزین';
    await page.locator('#srt-input').setInputFiles({name:'replace.srt',mimeType:'application/x-subrip',buffer:Buffer.from(two)});await waitClips(3);
    await page.locator('#undo').click();await waitClips(56);
    assert(exact(await native())===exact(importedNative),'Captionreplacement undoes in one operation');
    checks.push('large-caption-replacement-single-undo');
    phase='over-limit-caption-preservation';const over=Array.from({length:513},(_,i)=>String(i+1)+'\n00:00:00,000 --> 00:00:00,100\nOver').join('\n\n');
    await page.locator('#srt-input').setInputFiles({name:'over.srt',mimeType:'application/x-subrip',buffer:Buffer.from(over)});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('512 cues'));
    assert(exact(await native())===exact(importedNative),'Rejectedoversized captions preserve native project');
    checks.push('over-cap-caption-preservation');
    await download('#save-native','output/playwright/native-bulk-captions.json');
    phase='browser-path-export-refusal';await page.locator('#import').click();
    await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');await waitClips(57);
    const downloads=[];const received=item=>downloads.push(item);page.on('download',received);
    try{await page.locator('#save-native').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('original desktop media paths'));await page.waitForTimeout(300);assert(!downloads.length,'Browser-added paths must refuse native download');}finally{page.off('download',received);}
    checks.push('browser-path-native-export-refusal');
    await page.screenshot({path:'output/playwright/native-interchange.png',fullPage:true});
    const report={status:'passed',checks,bulkCueCount:55,atomicUndo:true,
      desktopExportScope:'JSON manifest only; original paths preserved. Media/font files and folder bundles are not packaged; browser-added paths refused.',
      reconnectScope:'Native source has unknown original byte size; filename/kind/dimensions/ranges checked and selected size pinned, not a cryptographic match.'};
    const pending=page.waitForEvent('download');await page.evaluate(value=>{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.href=url;a.download='native-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);await(await pending).saveAs('output/playwright/native-report.json');
  } catch(error) {
    await page.screenshot({path:'output/playwright/native-failure.png',fullPage:true}).catch(()=>{});
    throw Error('Native UI check phase='+phase+': '+error.message);
  }
}
