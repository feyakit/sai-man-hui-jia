#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const options = {
  baseUrl: 'http://127.0.0.1:8770/',
  outDir: '/workspace/play-check/match3-v5',
  api: null,
  province: '广东',
};
const positional = [];
for (let index = 2; index < process.argv.length; index++) {
  const arg = process.argv[index];
  if (arg === '--api') options.api = process.argv[++index] ?? '';
  else if (arg.startsWith('--api=')) options.api = arg.slice('--api='.length);
  else if (arg === '--province') options.province = process.argv[++index] ?? options.province;
  else if (arg.startsWith('--province=')) options.province = arg.slice('--province='.length);
  else positional.push(arg);
}
if (positional[0]) options.baseUrl = positional[0];
if (positional[1]) options.outDir = positional[1];

const base = new URL(options.baseUrl);
if (!base.pathname.endsWith('/')) base.pathname += '/';
const root = base.href;
const screenshots = [];
const pageErrors = [];

await mkdir(options.outDir, { recursive: true });
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

function pageUrl(query, { forceOffline = false } = {}) {
  const url = new URL(query, root);
  for (const [key, value] of base.searchParams) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  if (forceOffline) url.searchParams.set('api', 'off');
  else if (options.api !== null) url.searchParams.set('api', options.api);
  return url.href;
}

async function newPage(query, settings = {}) {
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(`${pageUrl(query)}: ${error.message}`));
  await page.goto(pageUrl(query, settings), { waitUntil: 'domcontentloaded' });
  return page;
}

async function openHome(query = '', settings = {}) {
  const page = await newPage(query, settings);
  await page.waitForFunction(() => !!window.__home, undefined, { timeout: 20_000 });
  await page.waitForTimeout(500);
  return page;
}

async function homeButton(page, key) {
  const buttons = await page.evaluate(() => window.__home?.getButtons() ?? []);
  const button = buttons.find(candidate => candidate.key === key);
  if (!button) throw new Error(`home button ${key} is missing: ${JSON.stringify(buttons)}`);
  if (button.screenLeft < 0 || button.screenRight > 390
    || button.screenTop < 0 || button.screenBottom > 844) {
    throw new Error(`home button ${key} is outside 390x844: ${JSON.stringify(button)}`);
  }
  return button;
}

async function tapHome(page, key) {
  const button = await homeButton(page, key);
  await page.touchscreen.tap(button.screenX, button.screenY);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(options.outDir, name), animations: 'allow' });
  screenshots.push(name);
}

async function waitRankSettled(page) {
  await page.waitForFunction(() => {
    const status = window.__rank?.getState().status;
    return status === 'ready' || status === 'error';
  }, undefined, { timeout: 20_000 });
  await page.waitForTimeout(250);
}

try {
  const home = await openHome('');
  await tapHome(home, 'province');
  await home.waitForFunction(() => !!window.__provincePicker, undefined, { timeout: 5_000 });
  await home.waitForTimeout(250);
  const picker = await home.evaluate(() => window.__provincePicker.getState());
  if (picker.provinceCount !== 34) throw new Error(`province picker rendered ${picker.provinceCount} cells`);
  const target = picker.points.find(point => point.province === options.province);
  if (!target) throw new Error(`province ${options.province} is not in the picker`);
  if (target.screenLeft < 0 || target.screenRight > 390
    || target.screenTop < 0 || target.screenBottom > 844) {
    throw new Error(`province ${options.province} is outside the viewport: ${JSON.stringify(target)}`);
  }
  await screenshot(home, '01-province-picker.png');
  await home.touchscreen.tap(target.screenX, target.screenY);
  await home.waitForFunction(province => {
    const state = window.__home?.getState();
    return state?.province === province && state?.overlay === null;
  }, options.province, { timeout: 5_000 });
  await home.waitForTimeout(300);
  await screenshot(home, '02-home-with-province.png');

  await tapHome(home, 'rank');
  await home.waitForFunction(() => !!window.__rank, undefined, { timeout: 5_000 });
  await waitRankSettled(home);
  await screenshot(home, '03-rank.png');
  const back = await home.evaluate(() => window.__rank.getState().buttons.back);
  await home.touchscreen.tap(back.screenX, back.screenY);
  await home.waitForFunction(() => !window.__rank, undefined, { timeout: 5_000 });
  await home.close();

  const win = await newPage('?mode=stack&stage=2&debug=win');
  await win.waitForFunction(() => !!window.__stack, undefined, { timeout: 20_000 });
  await win.waitForFunction(() => {
    const state = window.__stack.getState();
    return state.finishing && typeof window.__stack.getFinishRank() === 'string';
  }, undefined, { timeout: 15_000 });
  await win.waitForTimeout(500);
  const rankLine = await win.evaluate(() => window.__stack.getFinishRank());
  if (!rankLine) throw new Error('stage-2 settlement rank line is empty');
  if (rankLine.includes('正在为')) {
    await win.waitForFunction(() => {
      const line = window.__stack.getFinishRank();
      return typeof line === 'string' && !line.includes('正在为');
    }, undefined, { timeout: 20_000 }).catch(() => undefined);
  }
  await screenshot(win, '04-stage2-win-reported.png');
  const finishButtons = await win.evaluate(() => window.__stack.getFinishButtons());
  const rankButton = finishButtons.find(button => button.action === 'rank');
  if (!rankButton) throw new Error('settlement page did not expose 看省份排行');
  await win.touchscreen.tap(rankButton.screenX, rankButton.screenY);
  await win.waitForFunction(() => !!window.__rank, undefined, { timeout: 5_000 });
  await waitRankSettled(win);
  await screenshot(win, '05-rank-after-clear.png');
  await win.close();

  const offline = await openHome('?api=off', { forceOffline: true });
  await tapHome(offline, 'rank');
  await offline.waitForFunction(() => !!window.__rank, undefined, { timeout: 5_000 });
  await waitRankSettled(offline);
  const offlineState = await offline.evaluate(() => window.__rank.getState());
  if (offlineState.status !== 'error' || offlineState.errorText !== '排行暂时连不上') {
    throw new Error(`offline rank state is unexpected: ${JSON.stringify(offlineState)}`);
  }
  await screenshot(offline, '06-rank-offline.png');
  await offline.close();

  if (pageErrors.length) throw new Error(pageErrors.join('\n'));
  console.log(JSON.stringify({
    ok: true,
    api: options.api,
    province: options.province,
    screenshots: screenshots.map(name => path.join(options.outDir, name)),
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
