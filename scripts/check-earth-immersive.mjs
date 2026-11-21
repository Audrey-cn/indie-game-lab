import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { installCampaignClock } from './lunar-campaign-qa.mjs';
import { applyRouteKeys } from './lunar-survey-qa.mjs';

const folder = new URL('earth-immersive-followup-qa/', import.meta.url);
const bundle = process.argv[2] ? pathToFileURL(resolve(process.argv[2])) : new URL('lunar-qa.html', import.meta.url);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  headless: true,
  args: ['--enable-webgl', '--use-angle=metal'],
});
const station = { x: 2.75, z: -8.35 };

function steer(state, target) {
  const distance = Math.hypot(state.x - target.x, state.z - target.z);
  const heading = Math.atan2(state.x - target.x, state.z - target.z) - state.yaw;
  const offset = Math.atan2(Math.sin(heading), Math.cos(heading));
  const stop = Math.abs(offset) > 0.32 || state.speed > (distance < 2.6 ? 1.3 : 2.9);
  const keys = [stop ? 'Space' : 'w'];
  if (Math.abs(offset) > 0.095) keys.push(offset > 0 ? 'a' : 'd');
  return keys;
}

async function driveToStation(page, advance) {
  let state = await advance();
  const keys = new Set();
  for (const target of [{ x: 2.55, z: -1.45, range: 0.65 }, { x: 2.70, z: -6.90, range: 0.45 }]) {
    const before = state.motionTime;
    while (Math.hypot(state.x - target.x, state.z - target.z) > target.range) {
      assert.ok(state.motionTime - before < 22, `Stalled before ${JSON.stringify(target)} at ${state.x}, ${state.z}`);
      await applyRouteKeys(page, keys, { keys: steer(state, target) });
      state = await advance();
    }
  }
  await applyRouteKeys(page, keys, { keys: ['Space'] });
  await advance(20);
  await applyRouteKeys(page, keys, { keys: [] });
  state = await advance(2);
  assert.equal(state.guideTarget, 'earth-observatory');
  return state;
}

async function pinch(session, x, y, radii = [37, 47, 60, 74], readZoom) {
  const pair = radius => [
    { x: x - radius, y, id: 31, radiusX: 2, radiusY: 2 },
    { x: x + radius, y, id: 32, radiusX: 2, radiusY: 2 },
  ];
  const readings = [];
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pair(28) });
    for (const radius of radii) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pair(radius) });
      if (readZoom) readings.push(await readZoom());
    }
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  return readings;
}

async function compareOpticsFrames(page, frames) {
  return page.evaluate(frames => {
    const optic = document.querySelector('#earth-viewfinder');
    const probe = document.createElement('canvas');
    probe.width = probe.height = 64;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    const edge = Math.min(optic.width, optic.height) * 0.62;
    const sample = () => {
      ctx.drawImage(optic, (optic.width - edge) / 2, (optic.height - edge) / 2, edge, edge, 0, 0, 64, 64);
      return ctx.getImageData(0, 0, 64, 64).data;
    };
    const first = sample();
    window.__lunarCampaignAdvance(frames);
    const second = sample();
    let changed = 0, difference = 0;
    for (let i = 0; i < first.length; i += 4) {
      const delta = Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1])
        + Math.abs(first[i + 2] - second[i + 2]);
      if (delta > 0) changed++;
      difference += delta;
    }
    return { changed, meanRgbDifference: difference / (64 * 64 * 3) };
  }, frames);
}

async function exercise(name, width, height, isMobile) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile, hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1, offline: true });
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  const advance = (frames = 4) => page.evaluate(frames => window.__lunarCampaignAdvance(frames), frames);
  const element = selector => page.locator(selector);
  const click = async selector => isMobile ? element(selector).tap() : element(selector).click();
  const capture = part => page.screenshot({ scale: 'css', path: fileURLToPath(new URL(`${name}-${part}.png`, folder)) });
  const dialog = element('#earth-observatory');
  const channel = () => dialog.getAttribute('data-channel');
  const zoom = async () => Number(await dialog.getAttribute('data-zoom'));
  const readBacking = () => canvas.evaluate(node => [node.width, node.height]);
  const open = async () => {
    if (isMobile) await click('#interact');
    else await page.keyboard.press('e');
    await dialog.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#earth-align').disabled
      || !document.querySelector('#earth-capture').disabled, null, { polling: 40 });
  };
  const readDownloads = () => element('#earth-downloads a').evaluateAll(links => links.map(link => ({
    href: link.getAttribute('href'), filename: link.download,
  })));
  const review = element('#earth-review');
  const shutter = element('#earth-capture');
  const canvas = element('#earth-viewfinder');
  const settleReview = () => review.evaluate(node => Promise.all(
    node.getAnimations().map(animation => animation.finished.catch(() => {})),
  ));

  try {
    await installCampaignClock(page, 1000 / 24);
    await page.goto(bundle.href);
    await page.waitForFunction(() => !!window.__lunarQA && Number(document.querySelector('#boot-meter')?.value) >= 94);
    await advance(5);
    await click('#start-campaign');
    await advance();
    assert.equal(await dialog.isVisible(), false);
    await page.keyboard.press('e');
    assert.equal(await dialog.isVisible(), false, 'Observatory opened from landing');
    const state = await driveToStation(page, advance);
    if (isMobile) {
      await page.touchscreen.tap(width * 0.63, height * 0.78);
      await advance(10);
      assert.equal(await element('#interact').innerText(), '观测地球');
    }
    await open();
    const frozen = await page.evaluate(() => window.__lunarQA.motionTime);
    await page.waitForFunction(() => !document.pointerLockElement, null, { polling: 40 });
    assert.equal(await page.evaluate(() => document.pointerLockElement), null);
    assert.equal(await channel(), 'visible');
    const dimensions = await canvas.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        backing: [node.width, node.height], viewport: [innerWidth, innerHeight], dpr: devicePixelRatio };
    });
    assert.ok(Math.abs(dimensions.x) <= 2 && Math.abs(dimensions.y) <= 2, JSON.stringify(dimensions));
    assert.ok(Math.abs(dimensions.width - dimensions.viewport[0]) <= 2 && Math.abs(dimensions.height - dimensions.viewport[1]) <= 2,
      `Canvas does not fill viewport: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.backing[0] * dimensions.backing[1] <= 2_200_000, `Oversized canvas backing: ${dimensions.backing}`);
    assert.equal(await review.isVisible(), false);
    assert.equal(await element('#earth-reading').isVisible(), false);
    assert.equal(await element('#earth-explanation').isVisible(), false);
    assert.equal(await element('#earth-review-open').isVisible(), false);
    assert.equal(await element('#earth-history-toggle').isVisible(), false);
    await advance(5);
    await capture('visible');

    await click('#earth-mode-next');
    assert.equal(await channel(), 'ultraviolet');
    await advance(5);
    await capture('ultraviolet');
    await click('#earth-mode-next');
    assert.equal(await channel(), 'overview');
    await advance(32);
    await capture('overview');
    await advance(102);
    assert.equal(await dialog.getAttribute('data-quiet'), 'true');
    await capture('overview-quiet');
    const baseZoom = await zoom();
    assert.equal(baseZoom, 1);
    const midpoint = await canvas.boundingBox();
    const x = midpoint.x + midpoint.width * 0.5;
    const y = midpoint.y + midpoint.height * 0.48;
    let gradualZoom;
    if (isMobile) {
      const session = await page.context().newCDPSession(page);
      let previous = baseZoom;
      try {
        gradualZoom = await pinch(session, x, y, [31, 33], async () => {
          await page.waitForFunction(last => Number(document.querySelector('#earth-observatory').dataset.zoom) > last,
            previous, { polling: 40 });
          previous = await zoom();
          return previous;
        });
      }
      finally { await session.detach(); }
    } else {
      await page.mouse.move(x, y);
      gradualZoom = [];
      for (const ticks of [-19, -31]) {
        const before = await zoom();
        await page.mouse.wheel(0, ticks);
        await page.waitForFunction(last => Number(document.querySelector('#earth-observatory').dataset.zoom) > last,
          before, { polling: 40 });
        gradualZoom.push(await zoom());
      }
    }
    assert.ok(gradualZoom[0] > 1 && gradualZoom[0] < gradualZoom[1] && gradualZoom[1] < 1.22,
      `Small real inputs should land at different factors between 1× and the first zoom button step: ${gradualZoom}`);
    await click('#earth-zoom-value');
    assert.equal(await zoom(), 1);
    if (isMobile) {
      const session = await page.context().newCDPSession(page);
      try { await pinch(session, x, y); }
      finally { await session.detach(); }
    } else {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, -720);
    }
    await page.waitForFunction(base => Number(document.querySelector('#earth-observatory').dataset.zoom) > base + 0.1,
      baseZoom, { polling: 40 });
    await advance(32);
    const zoomed = await zoom();
    assert.ok(zoomed <= 8 && zoomed > baseZoom + 0.1, `Unbounded or unchanged zoom: ${zoomed}`);
    assert.match(await element('#earth-zoom-value').innerText(), /[0-9].*[×x]/);
    await capture('overview-zoom');
    let opticalMotion;
    if (!isMobile) {
      await advance(30);
      const live = await compareOpticsFrames(page, 216);
      assert.ok(live.changed > 5 && live.meanRgbDifference < 16, JSON.stringify(live));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await advance(30);
      const reduced = await compareOpticsFrames(page, 216);
      assert.deepEqual(reduced, { changed: 0, meanRgbDifference: 0 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      opticalMotion = { live, reduced };
    }
    const zoomWithGesture = zoomed;
    await click('#earth-zoom-out');
    assert.ok(await zoom() < zoomWithGesture, 'Accessible zoom-out control did not reduce magnification');
    for (let attempt = 0; attempt < 12 && await zoom() < 8; attempt++) {
      const before = await zoom();
      if (isMobile) await click('#earth-zoom-in');
      else {
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, -360);
      }
      await page.waitForFunction(last => Number(document.querySelector('#earth-observatory').dataset.zoom) > last,
        before, { polling: 40 });
    }
    assert.equal(await zoom(), 8);
    assert.ok(await element('#earth-zoom-in').isDisabled());
    assert.deepEqual(await readBacking(), dimensions.backing);
    await advance(28);
    await capture('overview-8x');
    await click('#earth-zoom-value');
    assert.equal(await zoom(), 1);
    assert.ok(await element('#earth-zoom-in').isEnabled());
    await click('#earth-mode-next');
    assert.equal(await channel(), 'visible');
    await click('#earth-mode-prev');
    assert.equal(await channel(), 'overview');
    await click('#earth-mode-next');
    assert.equal(await channel(), 'visible');

    if (await element('#earth-align').isVisible() && await element('#earth-align').isEnabled()) await click('#earth-align');
    await advance(25);
    assert.ok(await shutter.isEnabled());
    if (!isMobile) {
      const panStart = { x: midpoint.width * 0.62, y: midpoint.height * 0.30 };
      await page.mouse.move(panStart.x, panStart.y);
      await page.mouse.down();
      await page.mouse.move(panStart.x + 95, panStart.y + 25, { steps: 6 });
      await page.mouse.up();
      assert.ok(await shutter.isDisabled(), 'Panning did not alter target alignment');
      await click('#earth-zoom-in');
      await click('#earth-zoom-value');
      assert.equal(await zoom(), 1);
      await advance(25);
      assert.equal(await dialog.getAttribute('data-aligned'), 'true', 'Reset did not recenter the panned view');
    }
    assert.ok(await shutter.isEnabled());
    if (isMobile) await click('#earth-capture');
    else await page.keyboard.press('e');
    assert.equal(await element('#earth-exposure').isVisible(), true,
      `Shutter did not start exposure; focus: ${await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 180))}`);
    await advance(12);
    assert.equal(await review.isVisible(), false, 'Analysis shown before exposure completed');
    await advance(35);
    await review.waitFor({ state: 'visible' });
    assert.ok(await element('#earth-reading').isVisible());
    assert.ok(await element('#earth-explanation').isVisible());
    await page.waitForFunction(() => !!document.querySelector('#earth-photo-preview')?.naturalWidth, null, { polling: 40 });
    assert.equal(await element('#earth-downloads a').count(), 1);
    await settleReview();
    await capture('visible-review');
    await click('#earth-review-close');
    assert.equal(await review.isVisible(), false);
    assert.equal(await element('#earth-review-open').isVisible(), true);
    await click('#earth-review-open');
    assert.equal(await review.isVisible(), true);
    await click('#earth-review-close');
    await click('#earth-mode-next');
    assert.equal(await channel(), 'ultraviolet');
    if (await element('#earth-align').isVisible() && await element('#earth-align').isEnabled()) await click('#earth-align');
    await advance(25);
    await click('#earth-capture');
    await advance(50);
    await review.waitFor({ state: 'visible' });
    const files = await readDownloads();
    assert.equal(files.length, 2);
    assert.ok(files.some(file => /uv|ultraviolet/.test(file.filename)));
    if (!isMobile) {
      for (const link of await element('#earth-downloads a').all()) {
        const pending = page.waitForEvent('download');
        await link.click();
        const downloaded = await pending;
        const path = fileURLToPath(new URL(downloaded.suggestedFilename(), folder));
        await downloaded.saveAs(path);
        const png = await readFile(path);
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [640, 480]);
      }
    }
    await settleReview();
    await capture('ultraviolet-review');
    await click('#earth-history-toggle');
    await page.waitForFunction(() => {
      const historic = document.querySelector('#earth-history-image');
      return !!historic?.naturalWidth && !historic.hidden;
    }, null, { polling: 40 });
    await capture('history');
    assert.equal((await advance(6)).motionTime, frozen);
    await click('#earth-review-close');
    await click('#earth-close');
    await advance(4);
    assert.equal(await dialog.isVisible(), false);
    await page.waitForFunction(() => {
      const view = document.querySelector('#earth-viewfinder');
      return view.width === 1 && view.height === 1;
    }, null, { polling: 40 });
    const releasedBacking = await readBacking();
    assert.ok(await page.evaluate(() => window.__lunarQA.motionTime) > frozen);
    assert.match(await element('#mission-notice').innerText(), /地球观测图像已归档/);
    if (!isMobile) await page.waitForFunction(() => document.pointerLockElement?.localName === 'canvas', null, { polling: 40 });
    assert.equal(await page.evaluate(() => window.__lunarQA.collected), 0);
    assert.equal(await page.evaluate(() => window.__lunarQA.buildStage), null);
    await open();
    await advance(16);
    assert.deepEqual(await readBacking(), dimensions.backing);
    const repainted = await canvas.evaluate(node => {
      const samples = node.getContext('2d').getImageData(0, Math.floor(node.height * 0.60), node.width, 1).data;
      return samples.some((value, index) => index % 4 !== 3 && value > 60);
    });
    assert.equal(repainted, true, 'Reopened view has no rendered Earth');
    assert.ok(await element('#earth-review-open').isVisible());
    await click('#earth-review-open');
    await review.waitFor({state: 'visible'});
    assert.deepEqual(await readDownloads(), files);
    await click('#earth-review-close');
    await click('#earth-close');
    await advance(4);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    const result = { name, viewport: [width, height], dimensions, stationDistance: Math.hypot(state.x - station.x, state.z - station.z),
      baseZoom, gradualZoom, zoomWithGesture, maxZoom: 8, releasedBacking, archiveRetained: true,
      opticalMotion, clockFrozen: true, downloads: files.map(file => file.filename), errors, requests };
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    await capture('failure').catch(() => {});
    console.error(JSON.stringify({ name, errors, requests }));
    throw error;
  } finally { await page.close(); }
}

try {
  const cases = [['desktop', 1280, 720, false], ['portrait', 400, 869, true], ['landscape', 869, 400, true]];
  const selected = process.env.EARTH_QA_LAYOUT;
  const results = [];
  for (const params of cases) if (!selected || selected === params[0]) results.push(await exercise(...params));
  assert.ok(results.length, 'Unknown test layout');
  await writeFile(new URL(selected ? `checks-${selected}.json` : 'checks.json', folder), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
