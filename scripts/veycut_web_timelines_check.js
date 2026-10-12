// Server-only Playwright CLI scenario. Mutations go through visible controls.
async page => {
  let phase='start';const checks=[];
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const snapshot=()=>page.evaluate(()=>window.VeyCutWeb.snapshot());
  const native=()=>page.evaluate(()=>window.VeyCutWeb.engineDocument());
  const active=id=>page.waitForFunction(value=>window.VeyCutWeb.engineDocument().activeTimelineId===value,id);
  const download=async(button,path)=>{const event=page.waitForEvent('download');await page.locator(button).click();await(await event).saveAs(path);};
  const addCue=async(text)=>{await page.locator('#cue-text').fill(text);await page.locator('#cue-start').fill('0');await page.locator('#cue-end').fill('0.5');await page.locator('#cue-add').click();await page.waitForFunction(text=>window.VeyCutWeb.snapshot().cues.some(c=>c.text===text),text);};
  try{
    await page.reload();await page.setViewportSize({width:1440,height:1100});
    await page.waitForFunction(()=>document.querySelector('.badge').dataset.engine==='wasm');
    const first=(await native()).activeTimelineId;
    phase='first-timeline-caption';await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');
    await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1);
    await addCue('First timeline caption');const firstScope=(await snapshot()).cueIds;
    phase='add-second-timeline';await page.locator('#add-timeline').click();
    await page.waitForFunction(()=>window.VeyCutWeb.engineDocument().timelines.length===2);
    const second=(await native()).activeTimelineId;assert(second!==first,'Newtimeline becomes active');
    assert((await snapshot()).cues.length===0,'Newtimeline has independent empty caption scope');
    await addCue('زیرنویس دوم');const secondScope=(await snapshot()).cueIds;
    await page.locator('#cue-text').fill('Second timeline title');await page.locator('#add-title').click();
    await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===2);
    assert((await snapshot()).cueIds.length===1,'Titleaddition is not silently classified as caption');
    phase='rename-second';await page.locator('#timeline-name').fill('Second cut');await page.locator('#rename-timeline').click();
    await page.waitForFunction(id=>window.VeyCutWeb.engineDocument().timelines.find(t=>t.id===id).name==='Second cut',second);
    checks.push('add-rename-and-independent-caption-roles');
    phase='switch-first';await page.locator('#timeline-select').selectOption(first);await active(first);
    assert(JSON.stringify((await snapshot()).cueIds)===JSON.stringify(firstScope),'Firstcaption role restored');
    assert(await page.locator('#playhead').inputValue()==='0','Switchreset playhead');
    phase='undo-after-selection';await page.locator('#undo').click();
    await page.waitForFunction(id=>window.VeyCutWeb.engineDocument().timelines.find(t=>t.id===id).name==='Timeline 2',second);
    assert((await native()).activeTimelineId===second,'Undo applies rename edit, selection added no history entry');
    assert(JSON.stringify((await snapshot()).cueIds)===JSON.stringify(secondScope),'Undorestores correct second caption roles');
    await page.locator('#redo').click();
    await page.waitForFunction(id=>window.VeyCutWeb.engineDocument().timelines.find(t=>t.id===id).name==='Second cut',second);
    checks.push('timeline-selection-does-not-consume-undo');
    phase='remove-second';await page.locator('#timeline-select').selectOption(second);await active(second);await page.locator('#remove-timeline').click();
    await page.waitForFunction(()=>window.VeyCutWeb.engineDocument().timelines.length===1);
    assert((await snapshot()).timelineCueIds[second]===undefined,'Removedtimeline role map pruned');
    await page.locator('#undo').click();await page.waitForFunction(()=>window.VeyCutWeb.engineDocument().timelines.length===2);
    assert(JSON.stringify((await snapshot()).timelineCueIds[second])===JSON.stringify(secondScope),'Undo restores deletedtimeline caption map');
    checks.push('remove-timeline-and-role-map-undo');
    phase='save-two-timelines';await page.locator('#timeline-select').selectOption(first);await active(first);
    const document=await native(),savedState=await snapshot();
    await download('#save','output/playwright/timelines-project.json');
    const envelope={format:'veycut-web',schema:1,engine:'wasm',engineDocument:document,
      media:await page.evaluate(()=>[...window.VeyCutWeb.media().values()].map(({url,...m})=>m)),
      clips:savedState.clips,tracks:savedState.tracks,cues:savedState.cues,cueIds:savedState.cueIds,
      timelineCueIds:savedState.timelineCueIds,video:savedState.video};
    phase='reject-cross-timeline-map';const bad=JSON.parse(JSON.stringify(envelope));bad.timelineCueIds[second]=firstScope;
    await page.locator('#project-input').setInputFiles({name:'invalid-scope.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Caption scope references'));
    assert(JSON.stringify(await native())===JSON.stringify(document),'Rejectedscope leaves complete native project unchanged');
    checks.push('cross-timeline-caption-map-refusal');
    phase='reopen-two-timelines';await page.locator('#project-input').setInputFiles({name:'two-timelines.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(envelope))});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Project opened'));
    assert(JSON.stringify(await native())===JSON.stringify(document),'Alltimelines preserved through reopen');
    assert(JSON.stringify((await snapshot()).timelineCueIds)===JSON.stringify(savedState.timelineCueIds),'Captionrole map preserved through reopen');
    await page.locator('#timeline-select').selectOption(second);await active(second);
    assert(JSON.stringify((await snapshot()).cueIds)===JSON.stringify(secondScope),'Reopenedsecond timeline restores its own caption role');
    checks.push('two-timeline-save-reopen');
    await page.screenshot({path:'output/playwright/timelines-editor.png',fullPage:true});
    const report={status:'passed',checks,timelineIds:[first,second],captionScopes:savedState.timelineCueIds,
      timelineCount:2,selectionCreatesUndoEntry:false,sourceMediaShared:true};
    const event=page.waitForEvent('download');await page.evaluate(value=>{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.href=url;a.download='timelines-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);await(await event).saveAs('output/playwright/timelines-report.json');
  }catch(error){await page.screenshot({path:'output/playwright/timelines-failure.png',fullPage:true}).catch(()=>{});throw Error('TimelineUI phase='+phase+': '+error.message);}
}
