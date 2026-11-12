#!/usr/bin/env node
// Endless road + daily board check on 390x844: level titles, ride, slot count, carton backs from
// level 4, "继续回家路" from stage 2 into level 3, the farthest level on the home screen and the daily entry.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8772/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3-v8/endless';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const report = {};
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const fail = msg => errors.push(msg);

async function open(query, wait = 2600, ctx = context) {
  const page = await ctx.newPage();
  page.on('pageerror', error => errors.push(`${query}: ${error.message}`));
  const url = new URL(query, base);
  url.searchParams.set('api', 'off');
  const started = Date.now();
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stack?.getState().clickable?.length > 0, undefined, { timeout: 30_000 });
  const readyMs = Date.now() - started;
  await page.waitForTimeout(wait);
  return { page, readyMs };
}

try {
  for (const level of [3, 4, 5]) {
    const { page, readyMs } = await open(`?mode=stack&stage=${level}`);
    const state = await page.evaluate(() => window.__stack.getState());
    const layout = await page.evaluate(() => window.__stack.getLayout());
    report[`level${level}`] = {
      readyMs, headline: state.headline, capacity: state.capacity, hideCovered: state.hideCovered,
      cartonBacks: state.cartonBacks, cards: state.totalRemaining, clickable: state.clickable.length,
      vehicle: layout.vehicle, cardPx: +layout.cardSize.width.toFixed(1), slots: layout.slotCells.length,
    };
    if (state.headline.stage !== `第 ${level} 关` || !state.headline.subtitle) fail(`level ${level} headline ${JSON.stringify(state.headline)}`);
    if (layout.slotCells.length !== state.capacity) fail(`level ${level}: ${layout.slotCells.length} cells for capacity ${state.capacity}`);
    if (level === 3 && (state.hideCovered || state.cartonBacks)) fail('level 3 must show item faces');
    if (level === 4 && (!state.hideCovered || state.cartonBacks < 20)) fail(`level 4 carton backs ${state.cartonBacks}`);
    if (layout.cardBounds.bottom > layout.lidTop + .5) fail(`level ${level} cards overlap the ride`);
    await page.screenshot({ path: path.join(outDir, `390x844-level${level}-start.png`) });
    await page.close();
  }
  // Short phone: the sedan (level 3) shrinks so cards stay at least 44px wide.
  const small = await browser.newContext({ viewport: { width: 375, height: 667 }, screen: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  {
    const { page } = await open('?mode=stack&stage=3', 2600, small);
    const layout = await page.evaluate(() => window.__stack.getLayout());
    report.level3Short = { vehicle: layout.vehicle, cardPx: +layout.cardSize.width.toFixed(1) };
    if (layout.cardSize.width < 44) fail(`375x667 level 3 cards ${layout.cardSize.width.toFixed(1)}px < 44px`);
    if (layout.cardBounds.bottom > layout.lidTop + .5) fail('375x667 level 3 cards overlap the sedan lid');
    await page.screenshot({ path: path.join(outDir, '375x667-level3-start.png') });
    await page.close();
  }
  await small.close();

  // Stage 2 win → "继续回家路 · 第 3 关" → level 3.
  const { page: win } = await open('?mode=stack&stage=2&debug=win', 1200);
  const buttons = await win.evaluate(() => window.__stack.getFinishButtons());
  const next = buttons.find(button => button.action === 'next');
  report.stage2Next = next?.title;
  if (next?.title !== '继续回家路 · 第 3 关') fail(`stage 2 next button ${JSON.stringify(buttons.map(b => b.title))}`);
  if (next) {
    await win.touchscreen.tap(next.screenX, next.screenY);
    await win.waitForFunction(() => window.__stack?.getState().route === 3, undefined, { timeout: 20_000 }).catch(() => fail('next did not open level 3'));
  }
  await win.close();

  // Home: farthest level and daily entry.
  const home = await context.newPage();
  home.on('pageerror', error => errors.push(`home: ${error.message}`));
  await home.goto(new URL('?api=off', base).href, { waitUntil: 'domcontentloaded' });
  await home.waitForFunction(() => !!window.__home, undefined, { timeout: 20_000 });
  await home.waitForTimeout(800);
  const homeButtons = await home.evaluate(() => window.__home.getButtons());
  const best = await home.evaluate(() => localStorage.getItem('smhj.bestLevel'));
  report.home = { best, buttons: homeButtons.map(b => b.key) };
  if (best !== '4') fail(`best level stored ${best}`);
  const daily = homeButtons.find(b => b.key === 'daily');
  if (!daily) fail('no daily button');
  await home.screenshot({ path: path.join(outDir, '390x844-home.png') });
  if (daily) {
    await home.touchscreen.tap(daily.screenX, daily.screenY);
    await home.waitForFunction(() => window.__stack?.getState().route === 'daily', undefined, { timeout: 20_000 }).catch(() => fail('daily button did not open the daily board'));
    await home.waitForTimeout(2600);
    const dailyState = await home.evaluate(() => window.__stack?.getState());
    report.daily = { headline: dailyState?.headline, cards: dailyState?.totalRemaining, capacity: dailyState?.capacity };
    await home.screenshot({ path: path.join(outDir, '390x844-daily-start.png') });
  }
  await home.close();

  // Daily win → "今日已塞满" on the button and on the home screen.
  const { page: dailyWin } = await open('?mode=stack&stage=daily&debug=win', 1200);
  const dailyButtons = await dailyWin.evaluate(() => window.__stack.getFinishButtons());
  report.dailyFinish = dailyButtons.map(b => b.title);
  if (!dailyButtons.some(b => b.title.includes('今日已塞满'))) fail('daily finish lacks 今日已塞满');
  await dailyWin.close();
  const home2 = await context.newPage();
  await home2.goto(new URL('?api=off', base).href, { waitUntil: 'domcontentloaded' });
  await home2.waitForFunction(() => !!window.__home, undefined, { timeout: 20_000 });
  await home2.waitForTimeout(800);
  await home2.screenshot({ path: path.join(outDir, '390x844-home-daily-done.png') });
  await home2.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: errors.length === 0, report, errors }, null, 1));
if (errors.length) process.exitCode = 1;
