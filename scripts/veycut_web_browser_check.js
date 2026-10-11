// Executed by playwright-cli run-code on a GitHub runner, never by the app.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const count = async expected => {
    await page.waitForFunction(n => document.querySelectorAll('#timeline button').length === n, expected);
  };
  const seek = async seconds => {
    await page.locator('#video').evaluate((video, value) => { video.currentTime = value; }, seconds);
    await page.waitForFunction(n => { const video = document.querySelector('#video'); return Math.abs(video.currentTime - n) < .02 && !video.seeking && video.readyState >= 2; }, seconds);
  };
  const download = async (button, path) => {
    const pending = page.waitForEvent('download');
    await page.locator(button).click();
    await (await pending).saveAs(path);
  };
  if (await page.locator('#timeline button').count() === 0) {
  await page.setViewportSize({width: 1440, height: 1100});
  await page.waitForFunction(() => document.querySelector('.badge').dataset.engine === 'wasm');
  await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');
  await count(1);
  await page.locator('#trim-in').fill('0.2');
  await page.locator('#trim-out').fill('1.8');
  await page.locator('#trim').click();
  await seek(1);
  await page.locator('#split').click();
  await count(2);
  assert(Math.abs(Number(await page.locator('#trim-in').inputValue()) - 1) < .002, 'Split source point');
  await page.locator('#undo').click();
  await count(1);
  assert(Math.abs(Number(await page.locator('#trim-in').inputValue()) - .2) < .002, 'Undo preserves trim');
  await page.locator('#redo').click();
  await count(2);
  await page.locator('#srt-input').setInputFiles('output/playwright/captions.srt');
  await page.waitForFunction(() => document.querySelector('#cue-select').options.length === 2);
  await page.locator('#cue-text').fill('Web check سلام');
  await page.locator('#cue-update').click();
  await download('#srt-save', 'output/playwright/subtitles.srt');
  await download('#save', 'output/playwright/project.json');
  await page.locator('#project-input').setInputFiles('output/playwright/project.json');
  await count(2);
  await page.locator('#reselect').waitFor({state: 'visible'});
  assert(await page.locator('#play').isDisabled(), 'Reopened project must request media');
  return; // The CLI handles the native file chooser before stage two.
  }
  await page.waitForFunction(() => !document.querySelector('#play').disabled);
  await seek(.4);
  await page.waitForFunction(() => document.querySelector('#caption-overlay').textContent.includes('Web check سلام'));
  await page.screenshot({path: 'output/playwright/desktop.png', fullPage: true});
  await page.locator('#project-input').setInputFiles('output/playwright/invalid.json');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Invalid'));
  await count(2);
  assert(!await page.locator('#play').isDisabled(), 'Invalid project preserves connected media');
  await page.locator('#language').selectOption('fa');
  assert(await page.locator('html').getAttribute('dir') === 'rtl', 'Persian direction');
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: 'output/playwright/mobile-fa.png', fullPage: true});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal overflow');
  const reportDownload = page.waitForEvent('download');
  await page.evaluate(() => {
    const report = {status: 'passed', engine: document.querySelector('.badge').dataset.engine, clips: document.querySelectorAll('#timeline button').length, captions: document.querySelector('#cue-select').options.length, language: document.documentElement.lang, checks: ['import', 'trim', 'split', 'undo-redo', 'project-reopen', 'media-reconnect', 'bilingual-srt', 'invalid-project-preservation', 'mobile-rtl']};
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'browser-report.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  await (await reportDownload).saveAs('output/playwright/browser-report.json');
}
