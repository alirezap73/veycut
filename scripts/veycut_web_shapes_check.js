// GitHub runner: use real controls for generated shapes, project reopen and video export.
async page => {
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(()=>document.querySelector('.badge')?.dataset.engine==='wasm');
  await page.locator('#show-shapes').click();
  await page.locator('#shape-size').fill('.4');
  await page.locator('#shape-duration').fill('2');
  await page.locator('#shape-fill').fill('#ff0000');
  await page.locator('#shape-stroke-width').fill('.02');
  for(const kind of ['square','circle','triangle','parallelogram','trapezoid','line','arrow']){
    await page.locator('#shape-kind').selectOption(kind);
    await page.locator('#add-shape').click();
    await page.waitForFunction(kind=>window.VeyCutWeb.snapshot().clips.some(c=>c.kind==='shape'&&c.shape.kind===kind),kind);
    await page.waitForFunction(()=>document.querySelector('#preview-canvas').dataset.pending==='false');
    const pixels=await page.locator('#preview-canvas').evaluate(canvas=>{
      const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let red=0;for(let i=0;i<data.length;i+=4)if(data[i]>200&&data[i+1]<50&&data[i+2]<50)red++;
      const at=(Math.floor(canvas.height/2)*canvas.width+Math.floor(canvas.width/2))*4;
      return {red,center:Array.from(data.slice(at,at+3)),width:canvas.width,height:canvas.height,error:canvas.dataset.error};
    });
    assert(!pixels.error&&pixels.center[0]>200&&pixels.center[1]<50,'Visible '+kind+' at the frame centre: '+JSON.stringify(pixels));
    if(!['line','arrow'].includes(kind)){
      const area={square:1,circle:Math.PI/4,triangle:.866/2,parallelogram:.48,trapezoid:.48}[kind]*Math.pow(pixels.height*.4,2);
      assert(Math.abs(pixels.red-area)<area*.08,'Rasterized '+kind+' silhouette area: '+JSON.stringify(pixels));
    }
    await page.locator('#remove').click();
    await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===0);
  }
  await page.locator('#shape-kind').selectOption('square');await page.locator('#add-shape').click();
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1);
  await page.locator('#undo').click();await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===0);
  await page.locator('#redo').click();await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips.length===1);
  const saved=page.waitForEvent('download');await page.locator('#save').click();await(await saved).saveAs('output/playwright/shapes-project.json');
  await page.locator('#project-input').setInputFiles('output/playwright/shapes-project.json');
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips[0]?.shape?.fill==='#ff0000'&&!document.querySelector('#play').disabled);
  const center=()=>page.locator('#preview-canvas').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data));
  await page.locator('details:has(#key-property) summary').click();
  await page.locator('#key-property').selectOption('opacity');await page.locator('#key-at').fill('0');await page.locator('#key-value').fill('.5');await page.locator('#add-key').click();
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips[0].keys?.length===1);
  const half=await center();assert(half[0]>110&&half[0]<145&&half[1]<10,'Shape property keyframe changes actual pixels: '+half);
  await page.locator('#undo').click();
  await page.locator('details:has(#effect-select) summary').click();await page.locator('#effect-select').selectOption('concat.saturation');await page.locator('#effect-amount').fill('-100');await page.locator('#apply-effect').click();
  await page.waitForFunction(()=>window.VeyCutWeb.snapshot().clips[0].videoEffects?.length===1);
  const grey=await center();assert(Math.abs(grey[0]-grey[1])<2&&Math.abs(grey[1]-grey[2])<2&&grey[0]>30,'Shape effect runs through the compositor: '+grey);
  await page.locator('#undo').click();
  await page.locator('#export-size').selectOption('360x640');
  const output=page.waitForEvent('download',{timeout:45000});output.catch(()=>{});
  await page.locator('#video-export').click();
  await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#export-status').dataset.state),null,{timeout:40000});
  assert(await page.locator('#export-status').getAttribute('data-state')==='done',await page.locator('#export-status').textContent());
  await(await output).saveAs('output/playwright/shapes-video.webm');
  await page.locator('#show-shapes').click();await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Shape panel fits a narrow viewport');
  await page.screenshot({path:'output/playwright/shapes-mobile.png',fullPage:true});
}
