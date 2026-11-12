#!/usr/bin/env node
// Province licence plates: home car for 河南/广东/none, level 3 and 6 rides (bottom close-ups),
// level-9 finale tractor and the ending share card. 390x844 touch.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8772/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3-v11';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const report = {};
const fail = msg => errors.push(msg);
const W = 390, H = 844;

async function ctxFor(province) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, screen: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  if (province) await context.addInitScript(p => localStorage.setItem('smhj.province', p), province);
  return context;
}

try {
  for (const [province, expected, file] of [['河南', '豫A·春节', 'home-henan'], ['广东', '粤A·春节', 'home-guangdong'], [null, '回家·春节', 'home-no-province']]) {
    const context = await ctxFor(province);
    const page = await context.newPage();
    page.on('pageerror', error => fail(`${file}: ${error.message}`));
    await page.goto(new URL('?api=off', base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__home?.getState().plate, undefined, { timeout: 30_000 }).catch(() => fail(`${file}: no plate`));
    await page.waitForTimeout(1200);
    const plate = await page.evaluate(() => window.__home.getState().plate);
    report[file] = plate;
    if (plate !== expected) fail(`${file}: plate ${plate} != ${expected}`);
    await page.screenshot({ path: path.join(outDir, `390x844-${file}.png`) });
    await context.close();
  }
  for (const stage of [3, 6]) {
    const context = await ctxFor('河南');
    const page = await context.newPage();
    page.on('pageerror', error => fail(`stage ${stage}: ${error.message}`));
    await page.goto(new URL(`?mode=stack&stage=${stage}&api=off`, base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__stack?.getState().plate, undefined, { timeout: 30_000 }).catch(() => fail(`stage ${stage}: no plate`));
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => window.__stack.getState());
    report[`stage${stage}`] = { plate: state.plate, ride: state.vehicle?.name };
    if (state.plate !== '豫A·春节') fail(`stage ${stage}: plate ${state.plate}`);
    await page.screenshot({ path: path.join(outDir, `390x844-level${stage}-plate.png`), clip: { x: 0, y: H * .5, width: W, height: H * .5 } });
    await page.screenshot({ path: path.join(outDir, `390x844-level${stage}-full.png`) });
    await context.close();
  }
  {
    const context = await ctxFor('河南');
    const page = await context.newPage();
    page.on('pageerror', error => fail(`finale: ${error.message}`));
    await page.goto(new URL('?mode=stack&stage=9&api=off&debug=win', base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__stack?.getState().finale === true, undefined, { timeout: 30_000 }).catch(() => fail('finale not shown'));
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(outDir, '390x844-finale-plate.png') });
    const share = (await page.evaluate(() => window.__stack.getFinishButtons())).find(b => b.action === 'share');
    if (share) {
      await page.touchscreen.tap(share.screenX, share.screenY);
      await page.waitForFunction(() => document.querySelector('#stack-share-image')?.naturalWidth > 0, undefined, { timeout: 25_000 }).catch(() => fail('finale share missing'));
      const src = await page.evaluate(() => document.querySelector('#stack-share-image')?.src ?? '');
      if (src.startsWith('data:image/png;base64,')) await writeFile(path.join(outDir, 'share-finale-plate.png'), Buffer.from(src.split(',')[1], 'base64'));
    } else fail('finale share button missing');
    await context.close();
  }
} catch (error) {
  fail(String(error?.stack ?? error));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: errors.length === 0, errors, report }, null, 1));
process.exit(errors.length ? 1 : 0);
