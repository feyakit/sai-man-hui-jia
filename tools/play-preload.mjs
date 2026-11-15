#!/usr/bin/env node
// First-entry art check on simulated 4G (1.6 Mbps down / 750 kbps up / 150 ms RTT), cold cache.
// From the home page into a level, a per-frame sampler records how many face-up cards still show the
// text placeholder; the pile must never show one (and the ride art must be there) from its very
// first frame. Dense screenshots of each entry go to <outDir>/<scenario>/.
// Scenarios: tap 开始装车 the moment home is tappable (no prefetch), wait on home until the idle
// prefetch is done (saved level 6), tap 继续回家 immediately with a saved level 6, tap 每日一关, and a
// cold deep link to level 2.
// Usage: node tools/play-preload.mjs [url] [outDir]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8774/';
const outDir = process.argv[3] ?? '/workspace/play-check/v14/preload';
const FOUR_G = { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const report = [];
const errors = [];

// Runs in the page from the first script: one sample per animation frame once a level page exists.
function sampler() {
  const trace = { samples: [], tapAt: null };
  window.__preloadTrace = trace;
  const step = () => {
    const stack = window.__stack;
    const loading = window.__stackLoading;
    if (stack?.getArtStatus) {
      const s = stack.getArtStatus();
      const last = trace.samples[trace.samples.length - 1];
      const row = { t: Math.round(performance.now()), text: s.textCards, image: s.imageCards, back: s.backCards, vehicle: s.vehicleArt, slotText: s.slotTextCards };
      if (!last || last.text !== row.text || last.image !== row.image || last.vehicle !== row.vehicle || trace.samples.length < 3) trace.samples.push(row);
      trace.frames = (trace.frames ?? 0) + 1;
    }
    if (loading?.visible && trace.loadingShownAt == null) trace.loadingShownAt = Math.round(performance.now());
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

async function scenario(name, { url = `${base}?api=off`, bestLevel = null, waitPrefetch = false, button = 'start', expectNoLoading = false }) {
  if (only && !only.has(name)) return;
  const dir = path.join(outDir, name);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 664 }, screen: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  if (bestLevel) await context.addInitScript(level => { try { localStorage.setItem('smhj.bestLevel', String(level)); } catch {} }, bestLevel);
  await context.addInitScript(sampler);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', FOUR_G);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
  const fail = msg => errors.push(`${name}: ${msg}`);
  let tapMs = null;
  if (button) {
    await page.waitForFunction(() => (window.__home?.getButtons()?.length ?? 0) > 0, undefined, { timeout: 180_000, polling: 50 });
    if (waitPrefetch) await page.waitForFunction(() => window.__home?.getState().prefetch === 'done', undefined, { timeout: 240_000, polling: 100 });
    const target = await page.evaluate(key => window.__home.getButtons().find(b => b.key === key), button);
    if (!target) { fail(`no ${button} button`); await context.close(); return; }
    tapMs = Date.now() - t0;
    await page.evaluate(() => { window.__preloadTrace.tapAt = Math.round(performance.now()); });
    await page.touchscreen.tap(target.screenX, target.screenY);
  }
  // Dense screenshots until the pile has been up for a moment.
  let shot = 0, pileSince = null;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const status = await page.evaluate(() => window.__stack?.getArtStatus?.() ?? null).catch(error => { if (process.env.DEBUG) console.error(error.message); return null; });
    const up = status && status.text + status.image + status.back > 0;
    await page.screenshot({ path: path.join(dir, `${String(shot++).padStart(3, '0')}-${Date.now() - t0}ms${up ? '-pile' : ''}.png`) });
    if (up && pileSince == null) pileSince = Date.now();
    if (pileSince != null && Date.now() - pileSince > 1200) break;
  }
  const trace = await page.evaluate(() => window.__preloadTrace);
  const samples = trace.samples ?? [];
  const first = samples[0];
  const maxText = Math.max(0, ...samples.map(s => s.text));
  const maxSlotText = Math.max(0, ...samples.map(s => s.slotText));
  const pileMs = first ? first.t - (trace.tapAt ?? 0) : null;
  const row = {
    scenario: name, tapAtMs: tapMs, tapToPileMs: pileMs, frames: trace.frames ?? 0,
    loadingShown: trace.loadingShownAt != null, firstFrame: first ?? null, maxTextCards: maxText, screenshots: shot,
  };
  report.push(row);
  if (!first) fail('pile never appeared');
  else {
    if (maxText > 0) fail(`${maxText} card(s) showed the text placeholder: ${JSON.stringify(samples.filter(s => s.text > 0).slice(0, 3))}`);
    if (maxSlotText > 0) fail('slot showed a text placeholder');
    if (!first.vehicle) fail('ride art missing in the first pile frame');
    if (first.image + first.back === 0) fail('first pile frame had no cards');
  }
  if (expectNoLoading && row.loadingShown) fail('loading card shown although the level was prefetched');
  await writeFile(path.join(dir, 'trace.json'), JSON.stringify({ row, samples }, null, 1));
  await context.close();
}

try {
  await scenario('cold-start-tap', {});
  await scenario('idle-prefetch-continue', { bestLevel: 6, waitPrefetch: true, expectNoLoading: true });
  await scenario('cold-continue-tap', { bestLevel: 6 });
  await scenario('cold-daily-tap', { button: 'daily' });
  await scenario('cold-deeplink-stage2', { url: `${base}?mode=stack&stage=2&api=off`, button: null });
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: errors.length === 0, report, errors }, null, 1));
if (errors.length) process.exitCode = 1;
