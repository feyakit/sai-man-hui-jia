#!/usr/bin/env node
// City licence plates: the province → city picker from the home seal (河南 → 洛阳 gives 豫C·春节,
// 北京 skips the city step, “只选河南” keeps 豫A), home car for saved regions, level 3 and 6 rides
// (bottom close-ups), level-9 finale tractor and the ending share card. 390x844 touch.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8773/';
const outDir = process.argv[3] ?? '/workspace/play-check/v13/plate';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const report = {};
const fail = msg => errors.push(msg);
const W = 390, H = 844;

async function ctxFor(province, city) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, screen: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  if (province) await context.addInitScript(([p, c]) => {
    if (sessionStorage.getItem('seeded')) return; // only seed the first load
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('smhj.province', p);
    if (c) localStorage.setItem('smhj.city', c);
  }, [province, city ?? null]);
  return context;
}

const picker = page => page.evaluate(() => window.__provincePicker?.getState() ?? null);
const homeState = page => page.evaluate(() => window.__home.getState());
async function tapPick(page, key, tag) {
  const state = await picker(page);
  const point = state?.points.find(item => item.key === key);
  if (!point) { fail(`${tag}: ${key} not on the ${state?.step} step`); return; }
  if (point.screenTop < (state.viewport?.screenTop ?? 0) - 1 || point.screenBottom > (state.viewport?.screenBottom ?? H) + 1) fail(`${tag}: ${key} outside the visible grid`);
  if (point.screenBottom - point.screenTop < 26) fail(`${tag}: ${key} cell too small to tap (${point.screenBottom - point.screenTop}px)`);
  await page.touchscreen.tap(point.screenX, point.screenY);
  await page.waitForTimeout(500);
}
async function openPicker(page, tag) {
  const seal = (await page.evaluate(() => window.__home.getButtons())).find(button => button.key === 'province');
  await page.touchscreen.tap(seal.screenX, seal.screenY);
  await page.waitForFunction(() => window.__provincePicker?.getState().visible, undefined, { timeout: 5_000 }).catch(() => fail(`${tag}: seal did not open the picker`));
}

try {
  {
    // Picker flow from a fresh home: 河南 → city step → 洛阳.
    const context = await ctxFor(null);
    const page = await context.newPage();
    page.on('pageerror', error => fail(`picker: ${error.message}`));
    await page.goto(new URL('?api=off', base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__home?.getState().plate, undefined, { timeout: 30_000 });
    await page.waitForTimeout(1200);
    await openPicker(page, 'picker');
    let state = await picker(page);
    if (state?.step !== 'province' || state.points.length !== 34) fail(`picker: province step ${JSON.stringify(state && { step: state.step, n: state.points.length })}`);
    await page.screenshot({ path: path.join(outDir, '390x844-picker-province.png') });
    await tapPick(page, '河南', 'picker');
    state = await picker(page);
    if (state?.step !== 'city' || state.cityCount !== 18) fail(`picker: 河南 city step ${JSON.stringify(state && { step: state.step, n: state.cityCount })}`);
    for (const key of ['郑州', '开封', '洛阳', '信阳', '济源']) if (!state?.points.some(p => p.key === key)) fail(`picker: 河南 is missing ${key}`);
    // Cells must not overlap each other or the buttons.
    const rects = [...(state?.points ?? []), state?.back, state?.skip].filter(Boolean);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.screenLeft < b.screenRight && b.screenLeft < a.screenRight && a.screenTop < b.screenBottom && b.screenTop < a.screenBottom) fail(`picker: ${a.key ?? 'button'} overlaps ${b.key ?? 'button'}`);
    }
    await page.screenshot({ path: path.join(outDir, '390x844-picker-city-henan.png') });
    await tapPick(page, '洛阳', 'picker');
    const home = await homeState(page);
    const stored = await page.evaluate(() => [localStorage.getItem('smhj.province'), localStorage.getItem('smhj.city')]);
    report.pickLuoyang = { plate: home.plate, seal: home.seal, stored };
    if (home.overlay !== null) fail(`picker: still open after 洛阳 (${home.overlay})`);
    if (home.plate !== '豫C·春节') fail(`picker: plate after 洛阳 ${home.plate}`);
    if (home.seal !== '洛阳') fail(`picker: seal after 洛阳 ${home.seal}`);
    if (stored[0] !== '河南' || stored[1] !== '洛阳') fail(`picker: stored ${JSON.stringify(stored)}`);
    await page.screenshot({ path: path.join(outDir, '390x844-home-luoyang.png') });
    // Back on the city step, then 换省份 → 广东 → scroll-free 21-city grid → 深圳.
    await openPicker(page, 'picker2');
    await tapPick(page, '广东', 'picker2');
    state = await picker(page);
    if (state?.cityCount !== 21) fail(`picker2: 广东 has ${state?.cityCount} cities`);
    await page.screenshot({ path: path.join(outDir, '390x844-picker-city-guangdong.png') });
    await page.touchscreen.tap(state.back.screenX, state.back.screenY);
    await page.waitForTimeout(400);
    if ((await picker(page))?.step !== 'province') fail('picker2: 换省份 did not go back');
    // 北京: municipality, no city step.
    await tapPick(page, '北京', 'picker2');
    let h = await homeState(page);
    if (h.overlay !== null || h.plate !== '京A·春节' || h.seal !== '北京') fail(`picker2: 北京 ${JSON.stringify(h)}`);
    if (await page.evaluate(() => localStorage.getItem('smhj.city'))) fail('picker2: 北京 left an old city behind');
    // “只选河南” keeps the province's capital letter.
    await openPicker(page, 'picker3');
    await tapPick(page, '河南', 'picker3');
    state = await picker(page);
    await page.touchscreen.tap(state.skip.screenX, state.skip.screenY);
    await page.waitForTimeout(500);
    h = await homeState(page);
    if (h.plate !== '豫A·春节' || h.seal !== '河南') fail(`picker3: 只选河南 ${JSON.stringify({ plate: h.plate, seal: h.seal })}`);
    await context.close();
  }
  for (const [province, city, expected, file] of [['河南', null, '豫A·春节', 'home-henan'], ['河南', '洛阳', '豫C·春节', 'home-luoyang-saved'], ['广东', '深圳', '粤B·春节', 'home-shenzhen'], [null, null, '回家·春节', 'home-no-province']]) {
    const context = await ctxFor(province, city);
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
    const context = await ctxFor('河南', '洛阳');
    const page = await context.newPage();
    page.on('pageerror', error => fail(`stage ${stage}: ${error.message}`));
    await page.goto(new URL(`?mode=stack&stage=${stage}&api=off`, base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__stack?.getState().plate, undefined, { timeout: 30_000 }).catch(() => fail(`stage ${stage}: no plate`));
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => window.__stack.getState());
    report[`stage${stage}`] = { plate: state.plate, ride: state.vehicle?.name };
    if (state.plate !== '豫C·春节') fail(`stage ${stage}: plate ${state.plate}`);
    await page.screenshot({ path: path.join(outDir, `390x844-level${stage}-plate.png`), clip: { x: 0, y: H * .5, width: W, height: H * .5 } });
    await page.screenshot({ path: path.join(outDir, `390x844-level${stage}-full.png`) });
    await context.close();
  }
  {
    const context = await ctxFor('河南', '洛阳');
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
