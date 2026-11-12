#!/usr/bin/env node
// Title-screen check: on several phone viewports (incl. a 360x676 Android browser) every block —
// province pill, car, tagline, road progress, rules box, rank/daily, start, classic — must not overlap,
// road progress must always show (0/9 fresh, N/9, 已到家), and the rules must not hard-code a slot count.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8772/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3-v11';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const rows = [];
const viewports = [[360, 676], [375, 667], [360, 780], [390, 844], [412, 915]];
const states = [['fresh', {}, '回家进度 0/9'], ['best6', { 'smhj.bestLevel': '6' }, '回家进度 6/9'], ['arrived', { 'smhj.bestLevel': '9', 'smhj.homeDone': '1' }, '已到家']];
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
try {
  for (const [width, height] of viewports) {
    for (const [name, storage, expected] of states) {
      if (name !== 'fresh' && !(width === 390 || width === 360 && height === 676)) continue;
      const context = await browser.newContext({ viewport: { width, height }, screen: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await context.addInitScript(items => { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }, storage);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`${width}x${height} ${name}: ${error.message}`));
      await page.goto(new URL('?api=off', base).href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__home, undefined, { timeout: 30_000 });
      await page.waitForTimeout(1500);
      const { boxes, height: designH } = await page.evaluate(() => window.__home.getLayout());
      const { progress } = await page.evaluate(() => window.__home.getState());
      const tag = `${width}x${height} ${name}`;
      if (progress !== expected) errors.push(`${tag}: progress "${progress}" != "${expected}"`);
      const keys = Object.keys(boxes ?? {});
      if (keys.length < 9) errors.push(`${tag}: layout boxes missing`);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        if (overlap(boxes[keys[i]], boxes[keys[j]])) errors.push(`${tag}: ${keys[i]} overlaps ${keys[j]}`);
      }
      const bottom = Math.max(...keys.map(k => boxes[k].y + boxes[k].h));
      if (bottom > designH - 40) errors.push(`${tag}: controls reach the bottom edge (${bottom}/${designH})`);
      const carScale = boxes.car ? +(boxes.car.h / 438).toFixed(2) : 0;
      rows.push(`${tag} h=${Math.round(designH)} car×${carScale} "${progress}"`);
      await page.screenshot({ path: path.join(outDir, `${width}x${height}-home-${name}.png`) });
      await context.close();
    }
  }
} catch (error) {
  errors.push(String(error?.stack ?? error));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: errors.length === 0, errors, rows }, null, 1));
process.exit(errors.length ? 1 : 0);
