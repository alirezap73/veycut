// Executed by playwright-cli run-code on a GitHub runner, never by the app.
async (page) => {
  let phase = 'initial';
  const recentErrors = [];
  const pageError = error => { recentErrors.push(String(error.message || error).slice(0, 1000)); if (recentErrors.length > 20) recentErrors.shift(); };
  page.on('pageerror', pageError);
  try {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const count = async expected => {
    phase += ':count-' + expected;
    await page.waitForFunction(n => document.querySelectorAll('#timeline .timeline-clip[data-clip-id]').length === n, expected);
  };
  const seek = async seconds => {
    phase = 'seek-' + seconds;
    const timelineTime = await page.evaluate(value => {
      const state = window.VeyCutWeb.snapshot();
      const selected = state.clips.find(clip => clip.id === state.selected);
      if (!selected || !['video', 'audio'].includes(selected.kind)) throw new Error('Select source media before seeking');
      return (selected.timelineStart ?? selected.start) + (value - selected.in) / (selected.speed || 1);
    }, seconds);
    await page.locator('#playhead').evaluate((input, value) => {
      input.value = String(value); input.dispatchEvent(new Event('input', {bubbles: true}));
    }, timelineTime);
    await page.waitForFunction(n => { const video = document.querySelector('#video'); return Math.abs(video.currentTime - n) < .02 && !video.seeking && video.readyState >= 2; }, seconds);
  };
  const download = async (button, path) => {
    phase = 'download-' + path;
    const pending = page.waitForEvent('download');
    await page.locator(button).click();
    await (await pending).saveAs(path);
  };
  const rejectExport = async expected => {
    phase = 'export-refusal-' + expected;
    const downloads = [];
    const observed = item => downloads.push(item.suggestedFilename());
    page.on('download', observed);
    try {
      await page.locator('#video-export').click();
      await page.waitForFunction(() => document.querySelector('#export-status').dataset.state === 'error');
      assert((await page.locator('#export-status').textContent()).includes(expected), 'Correct export refusal: ' + expected);
      await page.waitForTimeout(300);
      assert(downloads.length === 0, 'Rejected export must not download a file');
    } finally { page.off('download', observed); }
  };
  const emitReport = async report => {
    const pending = page.waitForEvent('download');
    await page.evaluate(value => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
      const link = document.createElement('a'); link.href = url; link.download = 'browser-report.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, report);
    await (await pending).saveAs('output/playwright/browser-report.json');
  };
  if (await page.locator('body').getAttribute('data-check-stage') === 'limit') {
    phase = 'limit-media-reconnect';
    await page.waitForFunction(() => !document.querySelector('#play').disabled);
    await count(376);
    await rejectExport('300 seconds');
    await count(376);
    const report = JSON.parse(await page.locator('body').getAttribute('data-check-report'));
    report.checks.push('duration-limit-refusal');
    report.durationLimit = {timelineSeconds: 301, limitSeconds: 300, downloaded: false};
    await page.screenshot({path: 'output/playwright/export-limit.png', fullPage: true});
    await emitReport(report);
    return;
  }
  if (await page.locator('#timeline .timeline-clip[data-clip-id]').count() === 0) {
  await page.setViewportSize({width: 1440, height: 1100});
  phase = 'shared-engine-ready';
  await page.waitForFunction(() => document.querySelector('.badge').dataset.engine === 'wasm');
  phase = 'initial-media-import';
  await page.locator('#media-input').setInputFiles('docs/beta-samples/portrait-2s.mp4');
  await count(1);
  phase = 'media-library-reuse';
  assert(await page.locator('#media-library .library-card').count() === 1, 'Imported source appears in the media library');
  await page.locator('#media-library [data-action="append"]').click();
  await count(2);
  assert(Math.abs((await page.evaluate(() => window.VeyCutWeb.snapshot())).clips[1].start - 2) < .01, 'Library append uses timeline end');
  await page.locator('#undo').click();
  await count(1);
  await page.locator('#playhead').evaluate(input => { input.value = '0.4'; input.dispatchEvent(new Event('input', {bubbles: true})); });
  await page.locator('#media-library [data-action="place"]').click();
  await count(2);
  assert((await page.evaluate(() => window.VeyCutWeb.snapshot())).clips.some(clip => Math.abs(clip.start - .4) < .01), 'Library places source at playhead');
  await page.locator('#undo').click();
  await count(1);
  await page.locator('#trim-in').fill('0.2');
  await page.locator('#trim-out').fill('1.8');
  phase = 'trim';
  await page.locator('#trim').click();
  await seek(1);
  phase = 'split';
  await page.locator('#split').click();
  await count(2);
  assert(Math.abs(Number(await page.locator('#trim-in').inputValue()) - 1) < .002, 'Split source point');
  phase = 'undo';
  await page.locator('#undo').click();
  await count(1);
  assert(Math.abs(Number(await page.locator('#trim-in').inputValue()) - .2) < .002, 'Undo preserves trim');
  phase = 'redo';
  await page.locator('#redo').click();
  await count(2);
  phase = 'caption-import';
  await page.locator('#srt-input').setInputFiles('output/playwright/captions.srt');
  await page.waitForFunction(() => document.querySelector('#cue-select').options.length === 2);
  await page.locator('#cue-text').fill('Web check سلام');
  await page.locator('#cue-update').click();
  await count(4);
  await page.waitForFunction(() => {
    const state = window.VeyCutWeb.snapshot();
    return state.clips.filter(c => c.kind === 'video').length === 2 &&
      state.clips.filter(c => c.kind === 'text').length === 2 &&
      state.cues.every(c => c.nativeId && state.clips.some(clip => clip.id === c.nativeId && clip.kind === 'text' && clip.text.content === c.text));
  });
  await download('#srt-save', 'output/playwright/subtitles.srt');
  await download('#save', 'output/playwright/project.json');
  phase = 'project-reopen';
  await page.locator('#project-input').setInputFiles('output/playwright/project.json');
  await count(4);
  await page.locator('#reselect').waitFor({state: 'visible'});
  assert(await page.locator('#play').isDisabled(), 'Reopened project must request media');
  assert(await page.locator('#media-library [data-action="place"]').isDisabled(), 'Offline library media cannot be placed');
  await rejectExport('Reconnect every original media file');
  await count(4);
  return; // The CLI handles the native file chooser before stage two.
  }
  phase = 'media-reconnect';
  await page.waitForFunction(() => !document.querySelector('#play').disabled);
  assert(await page.locator('#media-library [data-action="place"]').isEnabled(), 'Reconnected source is reusable');
  await seek(.4);
  phase = 'caption-preview';
  await page.waitForFunction(() => {
    const state = window.VeyCutWeb.snapshot();
    const active = state.cues.find(c => c.text.includes('Web check سلام') && c.start <= .4 && c.end > .4);
    return active && state.clips.some(c => c.id === active.nativeId && c.kind === 'text') &&
      document.querySelector('#preview-canvas').dataset.pending === 'false' &&
      Math.abs(Number(document.querySelector('#playhead').value) - .4) < .02;
  });
  await page.screenshot({path: 'output/playwright/desktop.png', fullPage: true});
  phase = 'invalid-project-preservation';
  await page.locator('#project-input').setInputFiles('output/playwright/invalid.json');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Invalid'));
  await count(4);
  assert(!await page.locator('#play').isDisabled(), 'Invalid project preserves connected media');
  await page.locator('#export-size').selectOption('360x640');
  await page.locator('#export-format').selectOption('webm');
  await page.locator('#export-fps').selectOption('30');
  const offeredSizes = await page.locator('#export-size option').evaluateAll(options => options.map(option => option.value.split('x').map(Number)));
  assert(offeredSizes.every(pair => pair.length === 2 && pair.every(value => value > 0 && value <= 1920)), 'Offered export dimensions stay bounded');
  const cancelledDownloads = [];
  const cancellationObserver = item => cancelledDownloads.push(item.suggestedFilename());
  page.on('download', cancellationObserver);
  try {
    phase = 'cancel-export-start';
    await page.locator('#video-export').click();
    phase = 'cancel-export-active-source';
    await page.waitForFunction(() => ['error', 'done', 'cancelled'].includes(document.querySelector('#export-status').dataset.state) ||
      (document.querySelector('#export-status').dataset.state === 'recording' && Number(document.querySelector('#export-progress').value) > 25));
    assert(await page.locator('#export-status').getAttribute('data-state') === 'recording', 'Cancellation requires active source recording: ' + await page.locator('#export-status').textContent());
    phase = 'cancel-export-request';
    await page.locator('#export-cancel').click();
    await page.waitForFunction(() => ['cancelled', 'error', 'done'].includes(document.querySelector('#export-status').dataset.state));
    assert(await page.locator('#export-status').getAttribute('data-state') === 'cancelled', 'Cancellation terminal state: ' + await page.locator('#export-status').textContent());
    phase = 'cancel-export-controls-restored';
    await page.waitForFunction(() => !document.querySelector('#save').disabled);
    await page.waitForTimeout(300);
    assert(cancelledDownloads.length === 0, 'Cancelled export must not publish a complete file');
  } finally { page.off('download', cancellationObserver); }
  await count(4);
  await download('#save', 'output/playwright/cancel-after.json');
  phase = 'successful-export-start';
  const output = page.waitForEvent('download', {timeout: 30000});
  output.catch(() => {}); // Preserve immediate exporter diagnostics without an unhandled download timeout.
  await page.locator('#video-export').click();
  phase = 'successful-export-terminal-state';
  await page.waitForFunction(() => ['done', 'error', 'cancelled'].includes(document.querySelector('#export-status').dataset.state));
  assert(await page.locator('#export-status').getAttribute('data-state') === 'done', 'Video export failed: ' + await page.locator('#export-status').textContent());
  phase = 'successful-export-download';
  const videoDownload = await output;
  assert(videoDownload.suggestedFilename() === 'VeyCut-video.webm', 'Actual WebM output filename');
  await videoDownload.saveAs('output/playwright/browser-video.webm');
  await page.waitForFunction(() => document.querySelector('#export-status').dataset.state === 'done');
  assert(Number(await page.locator('#export-progress').getAttribute('value')) === 100 ||
    await page.locator('#export-progress').evaluate(element => element.value === 100), 'Completed export progress');
  const mime = await page.locator('#export-status').getAttribute('data-mime');
  assert(mime && mime.startsWith('video/webm'), 'Actual supported WebM MIME');
  await download('#save', 'output/playwright/export-after.json');
  await page.screenshot({path: 'output/playwright/export-done.png', fullPage: true});
  assert(await page.locator('#language').count() === 0, 'English-only UI has no language selector');
  assert(await page.locator('html').getAttribute('lang') === 'en', 'English UI language');
  assert((await page.locator('html').getAttribute('dir') || 'ltr') === 'ltr', 'English UI direction');
  await page.locator('#cue-text').fill('سلام؛ متن فارسی در رابط انگلیسی');
  assert(await page.locator('#cue-text').getAttribute('dir') === 'auto' && await page.locator('#cue-text').evaluate(el => el.matches(':dir(rtl)')), 'Persian input keeps RTL content direction');
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: 'output/playwright/mobile-en-persian-content.png', fullPage: true});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal overflow');
  const report = {status: 'passed', engine: await page.locator('.badge').getAttribute('data-engine'),
    clips: 4, videoClips: 2, textClips: 2, captions: 2, persianContentRTL: true, language: await page.locator('html').getAttribute('lang'),
    export: {filename: 'VeyCut-video.webm', mime, width: 360, height: 640, expectedTimelineSeconds: 1.8, precision: 'realtime', cancellationDownloaded: false, disconnectedMediaDownloaded: false},
    checks: ['import', 'trim', 'split', 'undo-redo', 'project-reopen', 'media-reconnect', 'bilingual-srt', 'native-caption-clips', 'invalid-project-preservation', 'english-ui-persian-content-mobile', 'disconnected-export-refusal', 'export-cancellation', 'export-edit-preservation', 'webm-download', 'offered-size-limit']};
  await page.locator('body').evaluate((body, value) => { body.dataset.checkReport = JSON.stringify(value); body.dataset.checkStage = 'limit'; }, report);
  await page.setViewportSize({width: 1440, height: 1100});
  phase = 'duration-limit-project-open';
  await page.locator('#project-input').setInputFiles('output/playwright/limit-project.json');
  await count(376);
  await page.locator('#reselect').waitFor({state: 'visible'});
  } catch (error) {
    let diagnostic = {phase, recentErrors};
    try {
      diagnostic = {...diagnostic, ...await page.evaluate(() => {
        const text = selector => document.querySelector(selector)?.textContent?.slice(0, 1500);
        const video = document.querySelector('#video');
        return {status: text('#status'), exportStatus: text('#export-status'),
          exportState: document.querySelector('#export-status')?.dataset.state,
          progress: document.querySelector('#export-progress')?.value,
          stage: document.body.dataset.checkStage || 'editing',
          clips: document.querySelectorAll('#timeline .timeline-clip[data-clip-id]').length,
          hidden: document.hidden, video: {time: video?.currentTime, readyState: video?.readyState,
            paused: video?.paused, seeking: video?.seeking, error: video?.error?.message}};
      })};
    } catch (snapshotError) { diagnostic.snapshotError = String(snapshotError).slice(0, 500); }
    try { await page.screenshot({path: 'output/playwright/browser-failure.png', fullPage: true, timeout: 5000}); }
    catch (screenshotError) { diagnostic.screenshotError = String(screenshotError).slice(0, 500); }
    throw new Error('Browser workflow failed: ' + JSON.stringify(diagnostic) + '; cause=' + String(error.message || error).slice(0, 2000));
  } finally { page.off('pageerror', pageError); }
}
