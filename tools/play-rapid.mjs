#!/usr/bin/env node
// Rapid-tap check on a real build: taps cards every 80ms (next tap while the previous card is still
// flying / packing) and requires every tap to take effect, the slot drawing to match the logic once
// things settle, a full clear to reach the finish, and an overfill to open the fail modal.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8773/';
const outDir = process.argv[3] ?? '/workspace/play-check/v13/rapid';
const GAP = 80;
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const report = {};
const state = page => page.evaluate(() => window.__stack.getState());

async function open(query) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${query}: pageerror ${error.message}`));
  await page.goto(new URL(query, base).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stack?.getState().clickable?.length > 0, undefined, { timeout: 30_000 });
  await page.waitForTimeout(2600);
  return page;
}

// Greedy: finish a pair, then start one, never a third different kind when the slot is tight.
function choose(s, mode) {
  const counts = new Map();
  for (const card of s.slot) counts.set(card.kind, (counts.get(card.kind) ?? 0) + 1);
  if (mode === 'overfill') return s.clickable.find(card => !counts.has(card.kind)) ?? s.clickable.find(card => (counts.get(card.kind) ?? 0) < 2);
  return s.clickable.find(card => counts.get(card.kind) === 2)
    ?? s.clickable.find(card => counts.get(card.kind) === 1)
    ?? s.clickable[0];
}

async function settle(page) {
  await page.waitForFunction(() => { const s = window.__stack.getState(); return !s.busy || s.finishing || s.modal; }, undefined, { timeout: 8_000 });
  await page.waitForTimeout(700); // let the 0.16s slide tweens finish even on a slow software renderer
}

async function slotMatches(page, tag) {
  const { s, views } = await page.evaluate(() => ({ s: window.__stack.getState(), views: window.__stack.getSlotViews() }));
  // Each drawn card must sit in the cell of its logical index (cells may wrap onto rows/regions).
  const drawn = views.slice().sort((a, b) => a.cell - b.cell).map(view => view.id);
  const cellsOk = views.slice().sort((a, b) => a.cell - b.cell).every((view, index) => view.cell === index);
  if (!cellsOk) errors.push(`${tag}: slot cells ${JSON.stringify(views.map(v => v.cell))}`);
  const logic = s.slot.map(card => card.id);
  if (JSON.stringify(drawn) !== JSON.stringify(logic)) errors.push(`${tag}: slot drawn ${JSON.stringify(drawn)} != logic ${JSON.stringify(logic)}`);
}

try {
  // 1) 14 taps at 80ms on stage 3 (carton backs + side stacks), every tap must register.
  for (const stage of [1, 3, 6]) {
    const tag = `stage${stage}`;
    const page = await open(`?mode=stack&stage=${stage}&api=off`);
    let registered = 0, attempted = 0, packs = 0, shot = false;
    let s = await state(page);
    const start = Date.now();
    for (let i = 0; i < 14 && s.status === 'playing'; i++) {
      const card = choose(s);
      if (!card) break;
      const pairs = s.slot.filter(item => item.kind === card.kind).length === 2;
      await page.touchscreen.tap(card.screenX, card.screenY);
      attempted++;
      const t0 = Date.now();
      const after = await state(page);
      const took = !after.clickable.some(item => item.id === card.id) && (after.slot.some(item => item.id === card.id) || pairs);
      if (took) registered++; else errors.push(`${tag}: tap ${i} on ${card.kind}#${card.id} was dropped (busy=${after.busy})`);
      if (pairs) packs++;
      if (!shot && i === 4) { await page.screenshot({ path: path.join(outDir, `${tag}-mid-rapid.png`) }); shot = true; }
      s = after;
      await page.waitForTimeout(Math.max(0, GAP - (Date.now() - t0)));
    }
    const tapMs = Date.now() - start;
    await settle(page);
    await slotMatches(page, tag);
    const end = await state(page);
    report[tag] = { attempted, registered, packs, tapMs, endStatus: end.status, slot: end.slot.length };
    if (registered < 12 && end.status === 'playing') errors.push(`${tag}: only ${registered}/${attempted} taps registered`);
    await page.screenshot({ path: path.join(outDir, `${tag}-settled.png`) });
    await page.context().close();
  }

  // 1b) True 80ms burst driven inside the page (no round-trips): 12 touch taps on the canvas.
  for (const stage of [2, 4]) {
    const tag = `burst-stage${stage}`;
    const page = await open(`?mode=stack&stage=${stage}&api=off`);
    const result = await page.evaluate(async gap => {
      const canvas = document.querySelector('canvas');
      const touchAt = (type, x, y) => {
        const touch = new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y });
        canvas.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch] }));
      };
      const log = [];
      const t0 = performance.now();
      for (let i = 0; i < 12; i++) {
        const s = window.__stack.getState();
        if (s.status !== 'playing') break;
        const counts = new Map();
        for (const card of s.slot) counts.set(card.kind, (counts.get(card.kind) ?? 0) + 1);
        const card = s.clickable.find(c => counts.get(c.kind) === 2) ?? s.clickable.find(c => counts.get(c.kind) === 1) ?? s.clickable[0];
        const before = s.clickable.length + s.slot.length;
        touchAt('touchstart', card.screenX, card.screenY);
        touchAt('touchend', card.screenX, card.screenY);
        const after = window.__stack.getState();
        log.push({ id: card.id, at: Math.round(performance.now() - t0), took: !after.clickable.some(c => c.id === card.id), busy: after.busy });
        await new Promise(resolve => setTimeout(resolve, gap));
      }
      return log;
    }, GAP);
    const dropped = result.filter(item => !item.took);
    if (dropped.length) errors.push(`${tag}: ${dropped.length}/${result.length} taps dropped ${JSON.stringify(dropped)}`);
    if (result.length < 10) errors.push(`${tag}: only ${result.length} taps made`);
    const busyTaps = result.filter(item => item.busy).length;
    await settle(page);
    await slotMatches(page, tag);
    report[tag] = { taps: result.length, registered: result.length - dropped.length, tappedWhileAnimating: busyTaps, spanMs: result.at(-1)?.at };
    await page.screenshot({ path: path.join(outDir, `${tag}-settled.png`) });
    await page.context().close();
  }

  // 2) Clear stage 1 completely at 80ms per tap: must reach the finish exactly once.
  {
    const page = await open('?mode=stack&stage=1&api=off');
    let s = await state(page), taps = 0;
    while (s.status === 'playing' && taps < 120) {
      const card = choose(s);
      if (!card) { await page.waitForTimeout(GAP); s = await state(page); continue; }
      await page.touchscreen.tap(card.screenX, card.screenY);
      taps++;
      await page.waitForTimeout(GAP);
      s = await state(page);
    }
    await page.waitForFunction(() => window.__stack.getState().finishing, undefined, { timeout: 8_000 }).catch(() => errors.push('clear: finish never started'));
    report.clear = { taps, status: (await state(page)).status };
    if (report.clear.status !== 'won') errors.push(`clear: status ${report.clear.status}`);
    await page.context().close();
  }

  // 3) Overfill stage 2 with different kinds at 80ms: must open the fail modal once, then revive works.
  {
    const page = await open('?mode=stack&stage=2&api=off');
    let s = await state(page), taps = 0;
    while (s.status === 'playing' && taps < 20) {
      const card = choose(s, 'overfill');
      if (!card) break;
      await page.touchscreen.tap(card.screenX, card.screenY);
      taps++;
      await page.waitForTimeout(GAP);
      s = await state(page);
    }
    await page.waitForFunction(() => window.__stack.getState().modal === 'fail', undefined, { timeout: 8_000 }).catch(() => errors.push('overfill: fail modal never opened'));
    await page.screenshot({ path: path.join(outDir, 'overfill-fail.png') });
    const buttons = await page.evaluate(() => window.__stack.getModalButtons?.() ?? []);
    const revive = buttons.find(button => button.action === 'revive');
    if (revive) {
      await page.touchscreen.tap(revive.screenX, revive.screenY);
      await page.waitForFunction(() => window.__stack.getState().status === 'playing' && !window.__stack.getState().modal, undefined, { timeout: 5_000 }).catch(() => errors.push('overfill: revive did not resume'));
      await settle(page);
      await slotMatches(page, 'revive');
    } else errors.push('overfill: no revive button');
    report.overfill = { taps, status: (await state(page)).status };
    await page.context().close();
  }
} catch (error) {
  errors.push(String(error?.stack ?? error));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: errors.length === 0, report, errors }, null, 1));
process.exit(errors.length ? 1 : 0);
