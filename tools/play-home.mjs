#!/usr/bin/env node
// Poster title-screen check: plaque, seal, couplets, car, road progress, ribbon start button,
// three coin entries and help button must all stay inside their own boxes on phone viewports.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8772/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3-v12';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const rows = [];
const viewports = [[375, 667], [360, 676], [390, 844], [412, 915]];
const states = [
  ['fresh', {}, '回家进度 0/9', '开始装车'],
  ['best6', { 'smhj.bestLevel': '6' }, '回家进度 6/9', '继续回家 · 第6关'],
  ['arrived', { 'smhj.bestLevel': '9', 'smhj.homeDone': '1' }, '已到家', '继续回家 · 第9关'],
  ['henan', { 'smhj.province': '河南' }, '回家进度 0/9', '开始装车'],
];
const expectedPlate = { henan: ['豫A·春节', '河南'] };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const required = ['help', 'plaque', 'seal', 'coupletLeft', 'coupletRight', 'car', 'road', 'house', 'progress', 'start', 'rank', 'daily', 'classic'];
try {
  for (const [width, height] of viewports) {
    for (const [name, storage, expected, expectedStart] of states) {
      if (name !== 'fresh' && !(width === 390 || width === 360 && height === 676)) continue;
      if (name === 'henan' && width !== 390) continue;
      const context = await browser.newContext({ viewport: { width, height }, screen: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await context.addInitScript(items => { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }, storage);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`${width}x${height} ${name}: ${error.message}`));
      await page.goto(new URL('?api=off', base).href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__home, undefined, { timeout: 30_000 });
      await page.waitForTimeout(1600);
      const { boxes, height: designH } = await page.evaluate(() => window.__home.getLayout());
      const state = await page.evaluate(() => window.__home.getState());
      const tag = `${width}x${height} ${name}`;
      if (state.progress !== expected) errors.push(`${tag}: progress "${state.progress}" != "${expected}"`);
      if (state.start !== expectedStart) errors.push(`${tag}: start "${state.start}" != "${expectedStart}"`);
      const [plate, seal] = expectedPlate[name] ?? ['回家·春节', '选省份'];
      if (state.plate !== plate) errors.push(`${tag}: plate "${state.plate}" != "${plate}"`);
      if (state.seal !== seal) errors.push(`${tag}: seal "${state.seal}" != "${seal}"`);
      const keys = Object.keys(boxes ?? {});
      for (const key of required) if (!boxes?.[key]) errors.push(`${tag}: missing ${key} box`);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        if (overlap(boxes[keys[i]], boxes[keys[j]])) errors.push(`${tag}: ${keys[i]} overlaps ${keys[j]}`);
      }
      const controls = keys.filter(key => !key.startsWith('couplet'));
      const bottom = Math.max(...controls.map(k => boxes[k].y + boxes[k].h));
      if (bottom > designH - 16) errors.push(`${tag}: controls reach the bottom edge (${bottom}/${designH})`);
      for (const key of controls) {
        const box = boxes[key];
        if (box.x < -.5 || box.x + box.w > 750.5) errors.push(`${tag}: ${key} leaves the screen horizontally`);
        if (box.y < -.5) errors.push(`${tag}: ${key} leaves the screen at the top`);
      }
      const carScale = boxes.car ? +(boxes.car.h / 452).toFixed(2) : 0;
      rows.push(`${tag} h=${Math.round(designH)} car×${carScale} "${state.progress}" "${state.start}"`);
      await page.screenshot({ path: path.join(outDir, `${width}x${height}-home-${name}.png`) });

      if (width === 390 && name === 'fresh') {
        const buttons = await page.evaluate(() => window.__home.getButtons());
        const help = buttons.find(button => button.key === 'help');
        if (!help) errors.push(`${tag}: help button not exposed`);
        else {
          await page.touchscreen.tap(help.screenX, help.screenY);
          await page.waitForFunction(() => window.__home?.getState().overlay === 'rules', undefined, { timeout: 5_000 }).catch(() => errors.push(`${tag}: help did not open rules`));
          const rules = await page.evaluate(() => window.__home.getState().rules);
          if (rules !== '点没被压住的年货，凑齐 3 件同款就打包装车；后备箱塞满就失败') errors.push(`${tag}: rules text ${JSON.stringify(rules)}`);
          await page.screenshot({ path: path.join(outDir, '390x844-home-rules.png') });
          await page.touchscreen.tap(195, 500);
          await page.waitForFunction(() => window.__home?.getState().overlay === null, undefined, { timeout: 5_000 }).catch(() => errors.push(`${tag}: rules did not close`));
        }
      }
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
