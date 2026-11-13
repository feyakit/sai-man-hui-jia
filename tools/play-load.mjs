#!/usr/bin/env node
// Cold-cache load measurement: time until the home page is tappable (window.__home with buttons), time
// until the poster art is drawn, network-idle time, total transferred bytes and the 20 largest files.
// Runs unthrottled and with simulated 4G (1.6 Mbps down / 750 kbps up / 150 ms RTT).
// firstPaintMs = first contentful paint (the loading splash once optimised; nothing before).
// Usage: node tools/play-load.mjs [url] [out.json]
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'https://feyakit.github.io/smhj-play/';
const out = process.argv[3];
const runs = Number(process.env.RUNS ?? 2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const profiles = {
  unthrottled: null,
  '4g': { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 },
};

async function measure(name, conditions) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  // A fresh context is a cold cache; the HTTP cache stays on so in-page warm-ups count like on a phone.
  if (conditions) await cdp.send('Network.emulateNetworkConditions', conditions);
  const requests = new Map();
  let lastFinish = 0;
  const t0 = Date.now();
  cdp.on('Network.requestWillBeSent', e => requests.set(e.requestId, { url: e.request.url, bytes: 0, start: Date.now() - t0 }));
  cdp.on('Network.responseReceived', e => { const r = requests.get(e.requestId); if (r) { r.status = e.response.status; r.type = e.type; } });
  cdp.on('Network.loadingFinished', e => { const r = requests.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.end = Date.now() - t0; lastFinish = r.end; } });
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}api=off`, { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForFunction(() => (window.__home?.getButtons()?.length ?? 0) > 0, undefined, { timeout: 180_000, polling: 50 });
  const tappable = Date.now() - t0;
  await page.waitForFunction(() => { const s = window.__home?.getState(); return s && ('artReady' in s ? s.artReady === true : !!s.plate); }, undefined, { timeout: 180_000, polling: 50 });
  const artReady = Date.now() - t0;
  const firstPaintMs = await page.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1));
  // Network idle: nothing finished for 2.5s.
  let idleAt = Date.now();
  for (;;) { await page.waitForTimeout(500); if (Date.now() - t0 - lastFinish > 2500) break; if (Date.now() - idleAt > 120_000) break; }
  const list = [...requests.values()].filter(r => r.bytes > 0);
  const total = list.reduce((s, r) => s + r.bytes, 0);
  const top = list.sort((a, b) => b.bytes - a.bytes).slice(0, 20).map(r => ({ kb: +(r.bytes / 1024).toFixed(1), url: r.url.replace(/^https?:\/\/[^/]+/, '') }));
  const beforeTappable = list.filter(r => (r.end ?? 1e9) <= tappable).reduce((s, r) => s + r.bytes, 0);
  if (process.env.DUMP) console.error(JSON.stringify([...requests.values()].sort((a, b) => a.start - b.start).map(r => [r.start, r.end, Math.round(r.bytes / 1024), r.url.replace(/^https?:\/\/[^/]+/, '')])));
  await context.close();
  return { name, firstPaintMs, tappableMs: tappable, artReadyMs: artReady, networkIdleMs: lastFinish, requests: list.length, totalKB: +(total / 1024).toFixed(1), beforeTappableKB: +(beforeTappable / 1024).toFixed(1), top };
}

const results = [];
try {
  for (const [name, conditions] of Object.entries(profiles)) for (let i = 0; i < runs; i++) results.push(await measure(name, conditions));
} finally { await browser.close(); }
const summary = Object.keys(profiles).map(name => {
  const rs = results.filter(r => r.name === name);
  const med = key => rs.map(r => r[key]).sort((a, b) => a - b)[Math.floor(rs.length / 2)];
  return { name, firstPaintMs: med('firstPaintMs'), tappableMs: med('tappableMs'), artReadyMs: med('artReadyMs'), networkIdleMs: med('networkIdleMs'), totalKB: med('totalKB'), beforeTappableKB: med('beforeTappableKB'), requests: med('requests') };
});
const report = { url, summary, top20: results[0].top, runs: results.map(({ top, ...r }) => r) };
if (out) await writeFile(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
