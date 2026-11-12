#!/usr/bin/env node
// Frame-sampling check for the trunk slot: while cards fly in and triples pack, every slot card
// that is not being packed must keep its node (same uuid), stay active, fully opaque, keep its
// sprite enabled and keep the same spriteFrame. A card id that left the slot must never come back.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8772/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3-v8/slot';
const base = new URL(baseUrl);
if (!base.pathname.endsWith('/')) base.pathname += '/';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const errors = [];

async function open(query) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  const url = new URL(query, base.href);
  for (const [key, value] of base.searchParams) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stack?.getState().clickable.length > 0, undefined, { timeout: 20_000 });
  await page.waitForTimeout(600);
  return page;
}

const state = page => page.evaluate(() => window.__stack.getState());

function count(slot) {
  const map = new Map();
  for (const card of slot) map.set(card.kind, (map.get(card.kind) ?? 0) + 1);
  return map;
}

/** Picks the next card to steer the slot into "pack with bystanders" and "insert in the middle". */
function choose(current) {
  const counts = count(current.slot);
  const clickable = current.clickable;
  const byKind = kind => clickable.find(card => card.kind === kind);
  const kindsInSlot = current.slot.map(card => card.kind);
  // 1. finish a pair when another kind is sitting in the slot (pack with bystanders)
  for (const [kind, n] of counts) {
    if (n === 2 && counts.size > 1 && byKind(kind)) return byKind(kind);
  }
  // 2. a single that is not last in the slot: inserting next to it shifts later cards right
  for (let i = 0; i < kindsInSlot.length - 1; i++) {
    const kind = kindsInSlot[i];
    if (counts.get(kind) === 1 && byKind(kind)) return byKind(kind);
  }
  // 3. bring in a new kind while there is room
  if (current.slot.length < 3) {
    const fresh = clickable.find(card => !counts.has(card.kind));
    if (fresh) return fresh;
  }
  return clickable.find(card => counts.has(card.kind)) ?? clickable[0];
}

async function startSampler(page) {
  await page.evaluate(() => {
    const samples = [];
    window.__slotSamples = samples;
    window.__slotSampling = true;
    const step = () => {
      if (!window.__slotSampling) return;
      samples.push({ t: performance.now(), slot: window.__stack.getState().slot.map(c => c.id), views: window.__stack.getSlotViews() });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

async function stopSampler(page) {
  return page.evaluate(() => { window.__slotSampling = false; return window.__slotSamples; });
}

function analyse(samples, packs, label) {
  const problems = [];
  const seen = new Map(); // id -> {uuid, frame, gone}
  const packedIds = new Set(packs.flatMap(pack => pack.ids));
  let rightShifts = 0;
  let lastX = new Map();
  for (const sample of samples) {
    const present = new Set();
    for (const view of sample.views) {
      present.add(view.id);
      const prev = seen.get(view.id);
      if (prev?.gone) problems.push(`${label}: card ${view.id} reappeared after leaving the slot`);
      if (prev && prev.uuid !== view.uuid) problems.push(`${label}: card ${view.id} node rebuilt (${prev.uuid} -> ${view.uuid})`);
      if (prev && prev.frame !== view.frame) problems.push(`${label}: card ${view.id} spriteFrame changed (${prev.frame} -> ${view.frame})`);
      if (!view.active) problems.push(`${label}: card ${view.id} inactive at t=${sample.t.toFixed(0)}`);
      if (view.opacity < 255) problems.push(`${label}: card ${view.id} opacity ${view.opacity}`);
      if (!view.spriteEnabled) problems.push(`${label}: card ${view.id} sprite disabled`);
      if (!packedIds.has(view.id) && Math.abs(view.scale - 1) > 1e-3) problems.push(`${label}: bystander ${view.id} scaled to ${view.scale}`);
      const x0 = lastX.get(view.id);
      if (x0 !== undefined && view.x > x0 + 0.5) rightShifts++;
      lastX.set(view.id, view.x);
      seen.set(view.id, { uuid: view.uuid, frame: view.frame, gone: false });
    }
    for (const [id, info] of seen) {
      if (!present.has(id) && !info.gone) {
        info.gone = true;
        if (!packedIds.has(id)) problems.push(`${label}: non-packed card ${id} vanished`);
      }
    }
  }
  return { problems: [...new Set(problems)].slice(0, 20), rightShifts };
}

const report = [];
let packsWithBystanders = 0;
let totalRightShifts = 0;
let totalSamples = 0;
try {
  for (const [query, taps] of [['?mode=stack&stage=1&api=off', 18], ['?mode=stack&stage=2&api=off', 15]]) {
    const page = await open(query);
    await startSampler(page);
    const packs = [];
    let shot = false;
    for (let step = 0; step < taps; step++) {
      const before = await state(page);
      if (before.status !== 'playing' || before.clickable.length === 0) break;
      const card = choose(before);
      const sameKind = before.slot.filter(item => item.kind === card.kind);
      await page.touchscreen.tap(card.screenX, card.screenY);
      if (sameKind.length === 2) {
        const bystanders = before.slot.filter(item => item.kind !== card.kind).map(item => item.id);
        packs.push({ ids: [...sameKind.map(item => item.id), card.id], bystanders });
        if (bystanders.length) packsWithBystanders++;
        if (bystanders.length && !shot) {
          await page.waitForTimeout(330);
          await page.screenshot({ path: path.join(outDir, `${query.includes('stage=1') ? 'stage1' : 'stage2'}-mid-pack.png`) });
          shot = true;
        }
      }
      await page.waitForFunction(() => !window.__stack.getState().busy, undefined, { timeout: 5_000 });
      await page.waitForTimeout(260);
    }
    const samples = await stopSampler(page);
    const result = analyse(samples, packs, query);
    totalRightShifts += result.rightShifts;
    totalSamples += samples.length;
    report.push({ query, samples: samples.length, packs, rightShifts: result.rightShifts, problems: result.problems });
    await page.close();
  }
  const problems = report.flatMap(entry => entry.problems);
  if (packsWithBystanders === 0) problems.push('no pack happened with bystander cards in the slot');
  if (totalRightShifts === 0) problems.push('no insertion shifted a slot card right');
  if (errors.length) problems.push(...errors);
  console.log(JSON.stringify({ totalSamples, packsWithBystanders, totalRightShifts, report }, null, 1));
  if (problems.length) {
    console.error(`slot check failed:\n${problems.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`slot check ok: ${totalSamples} frames sampled, ${packsWithBystanders} packs with bystanders, ${totalRightShifts} right-shift frames`);
  }
} finally {
  await browser.close();
}
