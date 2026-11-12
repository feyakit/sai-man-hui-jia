#!/usr/bin/env node
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const options = {
  baseUrl: 'http://127.0.0.1:8772/',
  outDir: null,
  api: null,
  province: '广东',
  viewport: { width: 390, height: 844 },
  test: false,
};
const RANK_API = 'https://smhj-api.feyakit.workers.dev';
const TEST_HEADER = 'x-smhj-test';
const TEST_KEY_FILE = path.join(os.homedir(), '.secrets', 'smhj-test.env');
const positional = [];
for (let index = 2; index < process.argv.length; index++) {
  const arg = process.argv[index];
  if (arg === '--api') options.api = process.argv[++index] ?? '';
  else if (arg.startsWith('--api=')) options.api = arg.slice('--api='.length);
  else if (arg === '--province') options.province = process.argv[++index] ?? options.province;
  else if (arg.startsWith('--province=')) options.province = arg.slice('--province='.length);
  else if (arg === '--viewport') options.viewport = parseViewport(process.argv[++index] ?? '');
  else if (arg.startsWith('--viewport=')) options.viewport = parseViewport(arg.slice('--viewport='.length));
  else if (arg === '--test') options.test = true;
  else positional.push(arg);
}
if (positional[0]) options.baseUrl = positional[0];
if (positional[1]) options.outDir = positional[1];

const { width: viewportWidth, height: viewportHeight } = options.viewport;
const mockMode = options.api === 'mock' ? 'data' : options.api === 'mock-empty' ? 'empty' : null;
const defaultRoot = mockMode === 'data'
  ? '/workspace/play-check/match3-v7-mock'
  : '/workspace/play-check/match3-v7-local';
options.outDir ??= path.join(defaultRoot, `${viewportWidth}x${viewportHeight}`);
if (mockMode === 'data' && /(^|\/)match3-v[67](\/|$)/.test(options.outDir)) {
  throw new Error('populated mock screenshots must not be written to the live match3-v6/v7 folders');
}

const liveTarget = !mockMode && options.api === null && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(options.baseUrl);
if (liveTarget && !options.test) {
  throw new Error('refusing to play against the public leaderboard: pass --test (test-key tables) or --api off|mock');
}
if (options.test && (mockMode || options.api !== null)) throw new Error('--test only works with the real rank API');
// The test key never appears on the command line or in output: env first, then ~/.secrets.
const testKey = options.test ? await loadTestKey() : null;

const screenshots = [];
const clearPosts = [];
const testReport = {};
const pageErrors = [];
let mockServer;
try {
  let apiBase = options.api;
  if (mockMode) {
    const mock = await startMockApi(mockMode);
    mockServer = mock.server;
    apiBase = mock.base;
  }

  const base = new URL(options.baseUrl);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const root = base.href;

  await mkdir(options.outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    screen: { width: viewportWidth, height: viewportHeight },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  let currentLabel = 'home';
  context.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/clear') clearPosts.push({label: currentLabel});
  });
  if (testKey) {
    // Every rank request from the game carries the test key, so it lands in test_clears only.
    await context.route(`${RANK_API}/**`, route => route.continue({
      headers: {...route.request().headers(), [TEST_HEADER]: testKey},
    }));
    testReport.publicBefore = await publicTotals();
    testReport.resetBefore = await testApi('/api/test/reset', {method: 'POST'});
  }

  function pageUrl(query, { forceOffline = false } = {}) {
    const url = new URL(query, root);
    for (const [key, value] of base.searchParams) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    if (forceOffline) url.searchParams.set('api', 'off');
    else if (apiBase !== null) url.searchParams.set('api', apiBase);
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
    assertInside(button, `home button ${key}`);
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

  async function rankState(page) {
    return page.evaluate(() => window.__rank.getState());
  }

  function assertRankButtons(state) {
    for (const [key, button] of Object.entries(state.buttons)) {
      if (button) assertInside(button, `rank ${key}`);
    }
  }

  function assertRankRows(state, mode) {
    if (state.allRows.length !== 34) {
      throw new Error(`rank page listed ${state.allRows.length} provinces instead of 34`);
    }
    if (new Set(state.allRows.map(row => row.province)).size !== 34) {
      throw new Error('rank page contains duplicate provinces');
    }
    for (const row of state.allRows) {
      if (row.waiting && (row.total !== 0 || row.today !== 0)) {
        throw new Error(`waiting province has fake counts: ${JSON.stringify(row)}`);
      }
    }
    if (mode === 'empty') {
      if (state.provinces.length !== 0) throw new Error(`empty mock returned ${state.provinces.length} rows`);
      if (!state.allRows.every(row => row.waiting)) throw new Error('empty rank page has a non-waiting row');
      if (!state.allRows[0].own || state.allRows[0].province !== options.province) {
        throw new Error(`empty rank page did not put own province first: ${JSON.stringify(state.allRows[0])}`);
      }
    }
    if (mode === 'data') {
      const populated = state.allRows.filter(row => !row.waiting);
      if (populated.length < 3) throw new Error(`data rank page has only ${populated.length} ranked rows`);
      if (state.allRows.slice(0,3).map(row => row.badge).join(',') !== '1,2,3') {
        throw new Error(`top-three medals are wrong: ${JSON.stringify(state.allRows.slice(0,3))}`);
      }
    }
    if (mode === 'offline' && state.errorText !== '排行暂时连不上') {
      throw new Error(`offline rank state is unexpected: ${JSON.stringify(state)}`);
    }
  }

  async function collectRankPages(page, firstState) {
    const seen = new Set();
    let current = firstState;
    for (;;) {
      for (const province of current.rows) seen.add(province);
      if (current.page >= current.pages) break;
      const next = current.buttons.next;
      if (!next) throw new Error(`rank page ${current.page}/${current.pages} has no next button`);
      await page.touchscreen.tap(next.screenX, next.screenY);
      const previousPage = current.page;
      await page.waitForFunction(value => window.__rank?.getState().page > value, previousPage, { timeout: 3_000 });
      current = await rankState(page);
    }
    if (seen.size !== 34) throw new Error(`paginated rank list exposed ${seen.size} distinct provinces`);
    return current;
  }

  async function tapSolutionCard(page, id) {
    const before = await page.evaluate(() => window.__stack.getState());
    if (before.status !== 'playing') return before;
    let after = before;
    for (let attempt = 0; attempt < 3; attempt++) {
      const point = await page.evaluate(cardId => (
        window.__stack.getClickable().find(card => card.id === cardId)
      ), id);
      if (!point) throw new Error(`solution card ${id} is not clickable`);
      assertInside(point, `solution card ${id}`);
      await page.touchscreen.tap(point.screenX, point.screenY);
      await page.waitForTimeout(220);
      after = await page.evaluate(() => window.__stack.getState());
      if (after.totalRemaining < before.totalRemaining
        || after.status !== 'playing'
        || after.slot.some(card => card.id === id)) break;
      await page.waitForTimeout(260);
    }
    if (!(after.totalRemaining < before.totalRemaining
      || after.status !== 'playing'
      || after.slot.some(card => card.id === id))) {
      throw new Error(`tap on solution card ${id} was not accepted`);
    }
    await page.waitForFunction(() => {
      const current = window.__stack.getState();
      return !current.busy || current.status !== 'playing' || current.finishing;
    }, undefined, { timeout: 4_000 });
    return after;
  }

  async function waitFinishSettled(page) {
    await page.waitForFunction(() => {
      const state = window.__stack?.getState();
      const line = window.__stack?.getFinishRank();
      return state?.finishing && typeof line === 'string' && !line.includes('正在为');
    }, undefined, { timeout: 25_000 });
    await page.waitForTimeout(350);
  }

  try {
    const home = await openHome('');
    for (const key of ['start','classic','province','rank']) await homeButton(home,key);
    await screenshot(home, '01-home.png');

    await tapHome(home, 'province');
    await home.waitForFunction(() => !!window.__provincePicker, undefined, { timeout: 5_000 });
    await home.waitForTimeout(200);
    const picker = await home.evaluate(() => window.__provincePicker.getState());
    if (picker.provinceCount !== 34) throw new Error(`province picker rendered ${picker.provinceCount} cells`);
    const target = picker.points.find(point => point.province === options.province);
    if (!target) throw new Error(`province ${options.province} is not in the picker`);
    assertInside(target, `province ${options.province}`);
    await screenshot(home, '02-province-picker.png');
    await home.touchscreen.tap(target.screenX, target.screenY);
    await home.waitForFunction(province => {
      const state = window.__home?.getState();
      return state?.province === province && state?.overlay === null;
    }, options.province, { timeout: 5_000 });
    await screenshot(home, '03-home-with-province.png');

    await tapHome(home, 'rank');
    await home.waitForFunction(() => !!window.__rank, undefined, { timeout: 5_000 });
    await waitRankSettled(home);
    let state = await rankState(home);
    assertRankButtons(state);
    const mode = state.status === 'error' ? 'offline' : mockMode ?? (testKey ? 'empty' : 'live');
    if (testKey && mode !== 'empty') throw new Error(`fresh test board should be empty, got ${JSON.stringify(state)}`);
    if (mode === 'offline') {
      if (state.status !== 'error') throw new Error(`expected offline rank, got ${state.status}`);
      if (!state.buttons.retry) throw new Error('offline rank page has no retry button');
      await screenshot(home, '04-rank-offline.png');
    } else if (mode === 'empty' || mode === 'data' || mode === 'live') {
      if (state.status !== 'ready') throw new Error(`expected ready rank, got ${state.status}`);
      assertRankRows(state, mode);
      const label = testKey ? 'test-empty' : mode;
      await screenshot(home, `04-rank-${label}.png`);
      const last = await collectRankPages(home, state);
      await screenshot(home, `05-rank-${label}-last-page.png`);
      if (last.page !== last.pages) throw new Error(`last page marker is inconsistent: ${last.page}/${last.pages}`);
    } else {
      throw new Error(`rank page settled without a recognized API mode: ${JSON.stringify(state)}`);
    }

    const start = await rankState(home);
    if (!start.buttons.start) throw new Error('rank page has no 去塞满 button');
    await home.touchscreen.tap(start.buttons.start.screenX, start.buttons.start.screenY);
    await home.waitForFunction(() => !!window.__stack, undefined, { timeout: 8_000 });
    await home.waitForFunction(() => window.__stack?.getState().stage === 1, undefined, { timeout: 5_000 });
    currentLabel = 'stage1-normal';
    const stageOnePost = testKey ? home.waitForResponse(response => (
      response.request().method() === 'POST' && response.url().endsWith('/api/clear')
    ), { timeout: 30_000 }) : null;
    const solution = await home.evaluate(() => window.__stack.getSolution());
    if (solution.length !== 18) throw new Error(`unexpected stage 1 solution length ${solution.length}`);
    for (let index = 0; index < solution.length; index++) {
      const current = await home.evaluate(() => window.__stack.getState());
      if (current.status !== 'playing') break;
      await tapSolutionCard(home, solution[index]);
    }
    await home.waitForFunction(() => {
      const current = window.__stack.getState();
      return current.status === 'won' && current.finishing;
    }, undefined, { timeout: 8_000 });
    await home.waitForTimeout(3_200);
    const normalStats = await home.evaluate(() => window.__stack.getFinishStats());
    if (!normalStats || normalStats.boxes !== 6 || !normalStats.text.includes('打包 6 箱')) {
      throw new Error(`normal stage-1 settlement did not show 打包 6 箱: ${JSON.stringify(normalStats)}`);
    }
    await screenshot(home, '06-stage1-normal-win.png');
    if (stageOnePost) {
      const response = await stageOnePost;
      testReport.stage1Post = {status: response.status(), body: await response.json()};
      if (response.status() !== 200 || testReport.stage1Post.body.test !== true) {
        throw new Error(`stage-1 test-key report failed: ${JSON.stringify(testReport.stage1Post)}`);
      }
    }
    await home.close();

    currentLabel = 'debug-win';
    const win = await newPage('?mode=stack&stage=2&debug=win');
    await win.waitForFunction(() => !!window.__stack, undefined, { timeout: 20_000 });
    await waitFinishSettled(win);
    const debugStats = await win.evaluate(() => window.__stack.getFinishStats());
    if (!debugStats || debugStats.boxes !== 50 || !debugStats.text.includes('打包 50 箱')) {
      throw new Error(`debug stage-2 settlement did not show 打包 50 箱: ${JSON.stringify(debugStats)}`);
    }
    const finishButtons = await win.evaluate(() => window.__stack.getFinishButtons());
    if (finishButtons.length !== 4) throw new Error(`stage-2 settlement has ${finishButtons.length} buttons instead of 4`);
    for (const button of finishButtons) assertInside(button, `settlement ${button.action}`);
    for (let a = 0; a < finishButtons.length; a++) {
      for (let b = a + 1; b < finishButtons.length; b++) assertNoOverlap(finishButtons[a], finishButtons[b]);
    }
    await screenshot(win, '07-stage2-settlement.png');
    const rankLine = await win.evaluate(() => window.__stack.getFinishRank());
    if (rankLine !== '调试模式不计入排行') throw new Error(`debug settlement should not report: ${rankLine}`);
    if (testKey) {
      // debug=win wrote nothing, so seed one stage-2 clear through the test path to show it on the page.
      testReport.seed = await testApi('/api/clear', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({province: options.province, stage: 2, ms: 60_000, sessionId: `play-rank-seed-${Date.now()}`, boxes: 50, momBoxes: 0}),
      });
      if (testReport.seed.test !== true || testReport.seed.duplicate !== false) throw new Error(`test seed failed: ${JSON.stringify(testReport.seed)}`);
    }
    const rankButton = finishButtons.find(button => button.action === 'rank');
    if (!rankButton) throw new Error('settlement page did not expose 看省份排行');
    await win.touchscreen.tap(rankButton.screenX, rankButton.screenY);
    await win.waitForFunction(() => !!window.__rank, undefined, { timeout: 5_000 });
    await waitRankSettled(win);
    await screenshot(win, testKey ? '08-rank-test-seeded.png' : '08-rank-from-settlement.png');
    const fromSettlement = await rankState(win);
    if (testKey) {
      const own = fromSettlement.allRows.find(row => row.province === options.province);
      if (!own || own.waiting || own.total !== 1 || own.rank !== 1) {
        throw new Error(`test-key rank page did not show the seeded clear: ${JSON.stringify(own)}`);
      }
    }
    assertRankButtons(fromSettlement);
    await win.touchscreen.tap(fromSettlement.buttons.start.screenX, fromSettlement.buttons.start.screenY);
    await win.waitForFunction(() => window.__stack?.getState().stage === 1, undefined, { timeout: 8_000 });
    await win.close();

    currentLabel = 'debug-fail';
    const fail = await newPage('?mode=stack&stage=2&debug=fail');
    await fail.waitForFunction(() => window.__stack?.getState().modal === 'fail', undefined, { timeout: 8_000 });
    await fail.waitForTimeout(250);
    const modalButtons = await fail.evaluate(() => window.__stack.getModalButtons());
    if (modalButtons.length !== 3) throw new Error(`failure popup has ${modalButtons.length} buttons instead of 3`);
    for (const button of modalButtons) assertInside(button, `failure ${button.action}`);
    for (let a = 0; a < modalButtons.length; a++) {
      for (let b = a + 1; b < modalButtons.length; b++) assertNoOverlap(modalButtons[a], modalButtons[b]);
    }
    await screenshot(fail, '09-fail-popup.png');
    await fail.close();

    if (pageErrors.length) throw new Error(pageErrors.join('\n'));
    const debugPosts = clearPosts.filter(post => post.label.startsWith('debug'));
    if (debugPosts.length) throw new Error(`debug runs posted ${debugPosts.length} clear(s)`);
    if (testKey) {
      testReport.publicAfter = await publicTotals();
      if (testReport.publicAfter.totalClears !== testReport.publicBefore.totalClears) {
        throw new Error(`public leaderboard changed during the test run: ${JSON.stringify(testReport)}`);
      }
    }
    console.log(JSON.stringify({
      ok: true,
      api: options.api,
      test: options.test,
      clearPosts,
      testReport,
      mockMode,
      province: options.province,
      viewport: options.viewport,
      screenshots: screenshots.map(name => path.join(options.outDir, name)),
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
} finally {
  if (testKey) {
    // Always leave the test tables empty, even when a check above failed.
    try { testReport.resetAfter = await testApi('/api/test/reset', {method: 'POST'}); console.error(`test tables reset: ${JSON.stringify(testReport.resetAfter.deleted)}`); }
    catch (error) { console.error(`TEST TABLE RESET FAILED: ${error.message}`); process.exitCode = 1; }
  }
  await new Promise(resolve => mockServer ? mockServer.close(resolve) : resolve());
}

async function loadTestKey() {
  let key = process.env.SMHJ_TEST_KEY;
  if (!key) {
    const text = await readFile(TEST_KEY_FILE, 'utf8').catch(() => '');
    key = /^SMHJ_TEST_KEY=(.+)$/m.exec(text)?.[1]?.trim();
  }
  if (!key) throw new Error(`--test needs SMHJ_TEST_KEY (env or ${TEST_KEY_FILE})`);
  return key;
}

async function testApi(pathname, init = {}) {
  const response = await fetch(`${RANK_API}${pathname}`, {...init, headers: {...init.headers, [TEST_HEADER]: testKey}});
  const body = await response.json();
  if (!response.ok) throw new Error(`test API ${pathname} -> ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function publicTotals() {
  const body = await (await fetch(`${RANK_API}/api/rank`)).json();
  return {totalClears: body.totalClears, provinces: body.provinces.length, test: body.test === true};
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) throw new Error(`invalid --viewport ${value}; expected WIDTHxHEIGHT`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 320 || height < 568) throw new Error(`viewport is too small: ${value}`);
  return { width, height };
}

function assertInside(rect, label) {
  const tolerance = .6;
  if (rect.screenLeft < -tolerance || rect.screenRight > viewportWidth + tolerance
    || rect.screenTop < -tolerance || rect.screenBottom > viewportHeight + tolerance) {
    throw new Error(`${label} is outside ${viewportWidth}x${viewportHeight}: ${JSON.stringify(rect)}`);
  }
}

function assertNoOverlap(a, b) {
  const left = Math.max(a.screenLeft, b.screenLeft);
  const right = Math.min(a.screenRight, b.screenRight);
  const top = Math.max(a.screenTop, b.screenTop);
  const bottom = Math.min(a.screenBottom, b.screenBottom);
  if (right - left > .5 && bottom - top > .5) {
    throw new Error(`buttons overlap: ${JSON.stringify({a,b})}`);
  }
}

async function startMockApi(mode) {
  const rows = mode === 'data' ? [
    { province: '广东', total: 128, today: 11 },
    { province: '江苏', total: 86, today: 7 },
    { province: '浙江', total: 53, today: 5 },
    { province: '北京', total: 21, today: 2 },
    { province: '上海', total: 13, today: 1 },
    { province: '山东', total: 7, today: 0 },
  ] : [];
  const reports = new Set();
  const server = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/api/rank') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        ok:true,
        provinces:rows,
        totalClears:rows.reduce((sum,row) => sum + row.total,0),
        todayClears:rows.reduce((sum,row) => sum + row.today,0),
        updatedAt:Date.now(),
      }));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/clear') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        let report = {};
        try { report = JSON.parse(body); } catch { /* Validated below. */ }
        const province = typeof report.province === 'string' ? report.province : '广东';
        const key = `${province}:${report.stage ?? ''}:${report.sessionId ?? ''}`;
        const duplicate = reports.has(key);
        reports.add(key);
        const row = rows.find(item => item.province === province);
        if (row && !duplicate) row.total += 1;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          ok:true,
          duplicate,
          province,
          rank:row ? rows.indexOf(row) + 1 : null,
          total:row?.total ?? 0,
        }));
      });
      return;
    }
    response.writeHead(404, { 'content-type':'application/json' }).end('{"ok":false}');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('mock server did not bind a TCP port');
  return { server, base:`http://127.0.0.1:${address.port}` };
}
