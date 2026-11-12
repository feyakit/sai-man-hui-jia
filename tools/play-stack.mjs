#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8765/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3';
const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
const browserErrors = [];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

async function open(query) {
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  await page.goto(new URL(query, root).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!window.__stack,
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(700);
  return page;
}

async function waitForPlayable(page) {
  await page.waitForFunction(
    () => window.__stack.getState().clickable.length > 0,
    undefined,
    { timeout: 10_000 },
  );
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outDir, name), animations: 'allow' });
}

async function state(page) {
  return page.evaluate(() => window.__stack.getState());
}

async function tapSolutionCard(page, id) {
  const before = await state(page);
  if (before.status !== 'playing') return before;
  let after = before;
  for (let attempt = 0; attempt < 3; attempt++) {
    const point = await page.evaluate(cardId => (
      window.__stack.getClickable().find(card => card.id === cardId)
    ), id);
    if (!point) throw new Error(`solution card ${id} is not clickable (remaining ${before.remaining})`);
    if (point.screenX < 0 || point.screenX > 390 || point.screenY < 0 || point.screenY > 844) {
      throw new Error(`solution card ${id} is outside the viewport: ${point.screenX},${point.screenY}`);
    }
    await page.touchscreen.tap(point.screenX, point.screenY);
    await page.waitForTimeout(220);
    after = await state(page);
    if (after.remaining <= before.remaining - 3
      || after.status !== 'playing'
      || after.slot.some(card => card.id === id)) break;
    await page.waitForTimeout(350);
  }
  const accepted = after.remaining <= before.remaining - 3
    || after.status !== 'playing'
    || after.slot.some(card => card.id === id);
  if (!accepted) {
    throw new Error(`tap on solution card ${id} was not accepted: ${JSON.stringify(after)}`);
  }
  await page.waitForTimeout(1_500);
  return state(page);
}

try {
  const stage1 = await open('?mode=stack');
  await waitForPlayable(stage1);
  const initial = await state(stage1);
  if (initial.stage !== 1 || initial.remaining !== 18) {
    throw new Error(`unexpected stage 1 start: ${JSON.stringify(initial)}`);
  }
  await screenshot(stage1, '01-stage1-start.png');

  const solution = await stage1.evaluate(() => window.__stack.getSolution());
  if (solution.length !== 18) throw new Error(`unexpected stage 1 solution length ${solution.length}`);
  for (let index = 0; index < 2; index++) await tapSolutionCard(stage1, solution[index]);
  const partial = await state(stage1);
  if (partial.slot.length < 2) throw new Error(`stage 1 slot did not receive taps: ${JSON.stringify(partial)}`);
  await screenshot(stage1, '02-stage1-tapped.png');

  for (let index = 2; index < solution.length; index++) {
    const current = await state(stage1);
    if (current.status !== 'playing') break;
    await tapSolutionCard(stage1, solution[index]);
  }
  await stage1.waitForFunction(
    () => {
      const current = window.__stack.getState();
      return current.status === 'won' && current.finishing;
    },
    undefined,
    { timeout: 8_000 },
  );
  await stage1.waitForTimeout(2_800);
  await screenshot(stage1, '03-stage1-win.png');
  await stage1.close();

  const stage2 = await open('?mode=stack&stage=2');
  await waitForPlayable(stage2);
  const hard = await state(stage2);
  if (hard.stage !== 2 || hard.remaining !== 150) {
    throw new Error(`unexpected stage 2 start: ${JSON.stringify(hard)}`);
  }
  await screenshot(stage2, '04-stage2-start.png');
  await stage2.close();

  const fail = await open('?mode=stack&stage=2&debug=fail');
  await fail.waitForFunction(
    () => window.__stack.getState().modal === 'fail',
    undefined,
    { timeout: 5_000 },
  );
  await fail.waitForTimeout(250);
  await screenshot(fail, '05-fail-popup.png');
  const failed = await state(fail);
  if (failed.slot.length !== 7) throw new Error(`fail preview has ${failed.slot.length} slots`);
  await fail.touchscreen.tap(195, 419);
  await fail.waitForFunction(
    () => {
      const current = window.__stack.getState();
      return current.status === 'playing' && current.modal === null && current.slot.length === 4;
    },
    undefined,
    { timeout: 4_000 },
  );
  await fail.close();

  if (browserErrors.length) throw new Error(browserErrors.join('\n'));
  console.log(JSON.stringify({
    ok: true,
    screenshots: [
      '01-stage1-start.png',
      '02-stage1-tapped.png',
      '03-stage1-win.png',
      '04-stage2-start.png',
      '05-fail-popup.png',
    ].map(name => path.join(outDir, name)),
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
