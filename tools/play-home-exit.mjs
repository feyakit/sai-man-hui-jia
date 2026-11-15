#!/usr/bin/env node
// "← 主页" check on a real build: every game page shows the pill clear of the HUD; mid-round it asks
// "回主页会放弃本局，确定吗？" (cancel keeps the round, confirm lands on the home page); before the first
// move, on the fail modal and on the finish screen it goes straight home.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8773/';
const outDir = process.argv[3] ?? '/workspace/play-check/v13';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };

async function open(query, hook) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${query}: pageerror ${error.message}`));
  await page.goto(new URL(query, base).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(name => !!window[name], hook, { timeout: 30_000 });
  await page.waitForTimeout(2600);
  return page;
}
const exitOf = (page, hook) => page.evaluate(name => window[name].getHomeExit(), hook);
const tap = (page, r) => page.touchscreen.tap(r.screenX, r.screenY);
async function atHome(page, tag) {
  try { await page.waitForFunction(() => !!window.__home && !window.__stack && !window.__stage, undefined, { timeout: 8_000 }); }
  catch { errors.push(`${tag}: did not land on the home page`); }
}

async function stackRound(query, tag, shots) {
  const page = await open(query, '__stack');
  const ex = await exitOf(page, '__stack');
  const layout = await page.evaluate(() => window.__stack.getLayout());
  const hudBottom = layout?.hudBottom ?? null;
  // Pill sits on the top-left, inside the screen, and above the play area (slot / pile start below the HUD).
  check(ex.button.screenLeft >= 0 && ex.button.screenTop >= 0 && ex.button.screenRight < 195, `${tag}: pill outside top-left ${JSON.stringify(ex.button)}`);
  if (hudBottom != null) check(ex.button.screenBottom <= hudBottom + 1, `${tag}: pill below HUD ${ex.button.screenBottom} > ${hudBottom}`);
  const s0 = await page.evaluate(() => window.__stack.getState());
  const card = s0.clickable[0];
  check(!s0.clickable.some(c => c.screenX >= ex.button.screenLeft && c.screenX <= ex.button.screenRight && c.screenY >= ex.button.screenTop && c.screenY <= ex.button.screenBottom), `${tag}: a card is under the pill`);
  await page.touchscreen.tap(card.screenX, card.screenY);
  await page.waitForTimeout(900);
  if (shots) await page.screenshot({ path: path.join(outDir, 'home-button-in-level.png') });
  await tap(page, ex.button);
  await page.waitForTimeout(500);
  let now = await exitOf(page, '__stack');
  check(now.open && now.text === '回主页会放弃本局，确定吗？', `${tag}: confirm did not open mid-round`);
  if (shots) await page.screenshot({ path: path.join(outDir, 'home-confirm-dialog.png') });
  // Taps behind the dialog must not reach the cards.
  const before = (await page.evaluate(() => window.__stack.getState())).slot.length;
  const c2 = (await page.evaluate(() => window.__stack.getState())).clickable[0];
  if (c2) { await page.touchscreen.tap(c2.screenX, c2.screenY); await page.waitForTimeout(500); }
  check((await page.evaluate(() => window.__stack.getState())).slot.length === before, `${tag}: tap went through the dialog`);
  await tap(page, now.cancel);
  await page.waitForTimeout(400);
  now = await exitOf(page, '__stack');
  check(!now.open && !!(await page.evaluate(() => window.__stack)), `${tag}: cancel did not keep the round`);
  await tap(page, now.button);
  await page.waitForTimeout(400);
  now = await exitOf(page, '__stack');
  await tap(page, now.confirm);
  await atHome(page, tag);
  await page.context().close();
}

async function stackDirect(query, tag) {
  const page = await open(query, '__stack');
  await page.waitForTimeout(1500);
  const ex = await exitOf(page, '__stack');
  await tap(page, ex.button);
  await page.waitForTimeout(300);
  check(!(await page.evaluate(() => window.__stack?.getHomeExit().open)), `${tag}: asked to confirm though the round is not under way`);
  await atHome(page, tag);
  await page.context().close();
}

try {
  await stackRound('?mode=stack&stage=1&api=off', 'stage1', true);
  for (const stage of [5, 9]) await stackRound(`?mode=stack&stage=${stage}&api=off`, `stage${stage}`, false);
  await stackRound('?mode=stack&stage=daily&api=off', 'daily', false);
  await stackDirect('?mode=stack&stage=2&api=off', 'stage2-no-move');
  await stackDirect('?mode=stack&stage=3&debug=fail&api=off', 'fail-modal');
  await stackDirect('?mode=stack&stage=2&debug=win&api=off', 'finish');
  // Classic packing: pill in the title row, clear of the title, straight home before any piece is placed.
  const page = await open('?mode=pack&api=off', '__stage');
  const ex = await exitOf(page, '__stage');
  check(ex.button.screenLeft >= 0 && ex.button.screenRight < 120 && ex.button.screenTop >= 0 && ex.button.screenBottom < 60, `classic: pill misplaced ${JSON.stringify(ex.button)}`);
  await page.screenshot({ path: path.join(outDir, 'home-button-classic.png') });
  await tap(page, ex.button);
  await atHome(page, 'classic');
  await page.context().close();
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
if (errors.length) process.exit(1);
