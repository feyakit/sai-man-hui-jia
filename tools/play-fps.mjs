#!/usr/bin/env node
// Frame-rate probe: rAF frame intervals on the home page (idle) and in level 1 while tapping a card every
// 120 ms. Reports median fps, p95 frame time and frames over 50 ms. Software-rendered headless Chromium
// is much slower than a phone GPU, so compare builds against each other rather than reading absolutes.
// usage: node tools/play-fps.mjs [url...]
import { chromium } from 'playwright';

const urls = process.argv.slice(2).length ? process.argv.slice(2) : ['http://127.0.0.1:8773/'];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sample = (page, ms) => page.evaluate(ms => new Promise(resolve => {
  const times = []; let last = performance.now(); const end = last + ms;
  const step = now => { times.push(now - last); last = now; if (now < end) requestAnimationFrame(step); else resolve(times); };
  requestAnimationFrame(step);
}), ms);
const stats = times => {
  const sorted = [...times].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  return { fps: +(1000 / med).toFixed(1), p95ms: +sorted[Math.floor(sorted.length * .95)].toFixed(1), over50: times.filter(t => t > 50).length, frames: times.length };
};
const out = {};
try {
  for (const url of urls) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(new URL('?api=off', url).href);
    await page.waitForFunction(() => window.__home, undefined, { timeout: 60_000 });
    await page.waitForTimeout(2500);
    const home = stats(await sample(page, 4000));
    await page.goto(new URL('?mode=stack&stage=1&api=off', url).href);
    await page.waitForFunction(() => window.__stack?.getState().clickable?.length > 0, undefined, { timeout: 60_000 });
    await page.waitForTimeout(2500);
    const idle = stats(await sample(page, 3000));
    // Tap in-page (no round trips) while sampling.
    const [taps] = await Promise.all([
      page.evaluate(() => new Promise(resolve => {
        let n = 0; const canvas = document.querySelector('canvas');
        const timer = setInterval(() => {
          const s = window.__stack.getState(); const c = s.clickable.find(card => s.slot.filter(x => x.kind === card.kind).length > 0) ?? s.clickable[0];
          if (!c || n >= 18 || s.status !== 'playing') { clearInterval(timer); resolve(n); return; }
          const t = new Touch({ identifier: n, target: canvas, clientX: c.screenX, clientY: c.screenY });
          canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
          canvas.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t], bubbles: true, cancelable: true }));
          n++;
        }, 120);
      })),
      sample(page, 2600).then(times => { out[`${url} level1-tapping`] = stats(times); }),
    ]);
    out[`${url} home`] = home; out[`${url} level1-idle`] = idle; out[`${url} taps`] = taps;
    await context.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(out, null, 1));
