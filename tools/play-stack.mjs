#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8767/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3-v2';
const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
const browserErrors = [];
const screenshots = [];

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
  await page.waitForFunction(() => !!window.__stack, undefined, { timeout: 20_000 });
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
  screenshots.push(name);
}

async function state(page) {
  return page.evaluate(() => window.__stack.getState());
}

async function board(page) {
  return page.evaluate(() => window.__stack.getBoard());
}

async function actions(page) {
  return page.evaluate(() => window.__stack.getActions());
}

async function tapAction(page, key) {
  const action = (await actions(page)).find(candidate => candidate.key === key);
  if (!action) throw new Error(`action ${key} is not exposed`);
  await page.touchscreen.tap(action.screenX, action.screenY);
  await page.waitForTimeout(260);
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
    await page.waitForTimeout(240);
    after = await state(page);
    if (after.totalRemaining < before.totalRemaining
      || after.status !== 'playing'
      || after.slot.some(card => card.id === id)) break;
    await page.waitForTimeout(300);
  }
  const accepted = after.totalRemaining < before.totalRemaining
    || after.status !== 'playing'
    || after.slot.some(card => card.id === id);
  if (!accepted) {
    throw new Error(`tap on solution card ${id} was not accepted: ${JSON.stringify(after)}`);
  }
  await page.waitForFunction(() => {
    const current = window.__stack.getState();
    return !current.busy || current.status !== 'playing' || current.finishing;
  }, undefined, { timeout: 4_000 });
  await page.waitForTimeout(80);
  return state(page);
}

try {
  const stage1 = await open('?mode=stack');
  await waitForPlayable(stage1);
  const initial = await state(stage1);
  if (initial.stage !== 1 || initial.remaining !== 18 || initial.totalRemaining !== 18) {
    throw new Error(`unexpected stage 1 start: ${JSON.stringify(initial)}`);
  }
  await screenshot(stage1, '01-stage1-start.png');

  const solution = await stage1.evaluate(() => window.__stack.getSolution());
  if (solution.length !== 18) throw new Error(`unexpected stage 1 solution length ${solution.length}`);

  const tapped = await tapSolutionCard(stage1, solution[0]);
  if (tapped.slot.length !== 1 || tapped.remaining !== 17 || tapped.totalRemaining !== 18) {
    throw new Error(`stage 1 pile count did not exclude the slot: ${JSON.stringify(tapped)}`);
  }
  await screenshot(stage1, '02-stage1-tapped.png');

  const beforeUndoBoard = await board(stage1);
  await tapAction(stage1, 'undo');
  await stage1.waitForFunction(() => {
    const current = window.__stack.getState();
    return current.props.undo && current.slot.length === 0 && !current.busy;
  }, undefined, { timeout: 3_000 });
  const undone = await state(stage1);
  const afterUndoBoard = await board(stage1);
  if (!undone.props.undo || undone.remaining !== 18 || undone.totalRemaining !== 18) {
    throw new Error(`undo did not restore the pile count: ${JSON.stringify(undone)}`);
  }
  if (beforeUndoBoard.some(card => card.id === solution[0])
    || !afterUndoBoard.some(card => card.id === solution[0])
    || afterUndoBoard.length !== 18) {
    throw new Error('undo did not restore the tapped card to the pile');
  }
  if (!undone.clickable.some(card => card.id === solution[0])) {
    throw new Error('restored card is not clickable again');
  }
  await screenshot(stage1, '06-undo.png');

  for (let index = 0; index < solution.length; index++) {
    const current = await state(stage1);
    if (current.status !== 'playing') break;
    await tapSolutionCard(stage1, solution[index]);
  }
  await stage1.waitForFunction(() => {
    const current = window.__stack.getState();
    return current.status === 'won' && current.finishing;
  }, undefined, { timeout: 8_000 });
  await stage1.waitForTimeout(3_200);
  await screenshot(stage1, '03-stage1-win.png');
  await stage1.close();

  const stage2 = await open('?mode=stack&stage=2');
  await waitForPlayable(stage2);
  const hard = await state(stage2);
  if (hard.stage !== 2 || hard.remaining !== 150 || hard.totalRemaining !== 150) {
    throw new Error(`unexpected stage 2 start: ${JSON.stringify(hard)}`);
  }
  const layout = await stage2.evaluate(() => window.__stack.getLayout());
  if (layout.cardBounds.left < 0 || layout.cardBounds.right > 390) {
    throw new Error(`stage 2 cards exceed the 390px viewport: ${JSON.stringify(layout.cardBounds)}`);
  }
  if (layout.sideCounts.left < 12 || layout.sideCounts.right < 12) {
    throw new Error(`stage 2 side piles are missing cards: ${JSON.stringify(layout.sideCounts)}`);
  }
  for (const card of hard.clickable) {
    if (card.screenLeft < 0 || card.screenRight > 390) {
      throw new Error(`clickable card ${card.id} exceeds viewport width: ${JSON.stringify(card)}`);
    }
    if (card.screenTop < layout.hudBottom || card.screenBottom > layout.trunkTop) {
      throw new Error(`clickable card ${card.id} overlaps HUD/trunk: ${JSON.stringify({card, layout})}`);
    }
  }
  await screenshot(stage2, '04-stage2-start.png');

  const shuffleBeforeBoard = await board(stage2);
  const shuffleBeforeState = await state(stage2);
  const shuffleBeforeSignature = shuffleBeforeBoard.map(card => `${card.id}:${card.kind}`).sort().join('|');
  await tapAction(stage2, 'shuffle');
  await stage2.waitForFunction(() => window.__stack.getState().props.shuffle, undefined, { timeout: 3_000 });
  const shuffleAfterBoard = await board(stage2);
  const shuffleAfterState = await state(stage2);
  const shuffleAfterSignature = shuffleAfterBoard.map(card => `${card.id}:${card.kind}`).sort().join('|');
  if (shuffleBeforeBoard.length !== shuffleAfterBoard.length
    || shuffleBeforeState.remaining !== shuffleAfterState.remaining) {
    throw new Error('shuffle changed the number of pile cards');
  }
  if (shuffleBeforeSignature === shuffleAfterSignature) {
    throw new Error('shuffle did not change the kind distribution across the pile');
  }
  const sortedCounts = counts => Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(sortedCounts(shuffleBeforeState.kindCounts)) !== JSON.stringify(sortedCounts(shuffleAfterState.kindCounts))) {
    throw new Error('shuffle changed the total kind counts instead of only their positions');
  }
  await screenshot(stage2, '07-shuffle.png');
  await stage2.close();

  const fail = await open('?mode=stack&stage=2&debug=fail');
  await fail.waitForFunction(() => window.__stack.getState().modal === 'fail', undefined, { timeout: 5_000 });
  await fail.waitForTimeout(250);
  await screenshot(fail, '05-fail-popup.png');
  const failed = await state(fail);
  if (failed.slot.length !== 7) throw new Error(`fail preview has ${failed.slot.length} slots`);
  const revive = await fail.evaluate(() => window.__stack.getModalButtons().find(button => button.action === 'revive'));
  if (!revive) throw new Error('fail preview did not expose a revive button');
  await fail.touchscreen.tap(revive.screenX, revive.screenY);
  await fail.waitForFunction(() => {
    const current = window.__stack.getState();
    return current.status === 'playing' && current.modal === null && current.slot.length === 4;
  }, undefined, { timeout: 4_000 });
  await fail.close();

  const mom = await open('?mode=stack&stage=2&debug=mom');
  await mom.waitForFunction(() => {
    const current = window.__stack.getState();
    return current.momEvents >= 1 && current.momVisible && current.remaining === 153;
  }, undefined, { timeout: 5_000 });
  const momState = await state(mom);
  const momCards = await mom.evaluate(() => window.__stack.getBoard().filter(card => card.source === 'mom'));
  if (momCards.length !== 3) throw new Error(`mom event added ${momCards.length} cards`);
  if (!momCards.every(card => momState.clickable.some(clickable => clickable.id === card.id))) {
    throw new Error('mom cards are not all clickable/visible');
  }
  await screenshot(mom, '08-mom-event.png');
  await mom.close();

  if (browserErrors.length) throw new Error(browserErrors.join('\n'));
  const ordered = [
    '01-stage1-start.png',
    '02-stage1-tapped.png',
    '03-stage1-win.png',
    '04-stage2-start.png',
    '05-fail-popup.png',
    '06-undo.png',
    '07-shuffle.png',
    '08-mom-event.png',
  ];
  console.log(JSON.stringify({
    ok: true,
    screenshots: ordered.map(name => path.join(outDir, name)),
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
