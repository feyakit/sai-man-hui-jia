#!/usr/bin/env node
// Opening-board layout check: on each phone size (including iPhone Safari with its bottom toolbar,
// 390x664), every in-level block keeps its own rectangle: top bar (主页 | banner | 声音), subtitle,
// pile (≥12px from the screen edges), the ride with its plate fully visible, and the prop buttons.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8772/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3-v8/layout';
const VIEWPORTS = [[390, 844], [390, 664], [360, 676], [375, 667], [412, 915], [360, 780]];
const STAGES = [1, 2, 3, 6, 9, 'daily'];
const EDGE = 12;
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const report = [];
const errors = [];
const VEHICLES = ['moto', 'trike', 'sedan', 'suv', 'van', 'pickup', 'truck', 'bus', 'tractor'];

const overlaps = (a, b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
const r1 = r => r ? `[${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.right.toFixed(0)},${r.bottom.toFixed(0)}]` : 'null';

/** Every in-level block keeps its own rectangle; the plate shows whole; the pile keeps 12px of edge. */
function checkInLevel(layout, fail) {
  const { width, height } = layout.viewport;
  const hud = layout.hud ?? {};
  const blocks = ['home', 'banner', 'sound'].map(key => [key, hud[key]]);
  for (const [key, rect] of blocks) {
    if (!rect) { fail(`top bar ${key} missing`); continue; }
    if (rect.left < -.5 || rect.right > width + .5 || rect.top < -.5) fail(`top bar ${key} leaves the screen ${r1(rect)}`);
  }
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    if (blocks[i][1] && blocks[j][1] && overlaps(blocks[i][1], blocks[j][1])) fail(`${blocks[i][0]} overlaps ${blocks[j][0]}`);
  }
  const pile = layout.cardBounds;
  const shelf = layout.reserveBounds;
  const hudBottom = Math.max(...blocks.filter(([, r]) => r).map(([, r]) => r.bottom));
  if (pile.top < hudBottom - .5) fail(`pile top ${pile.top.toFixed(1)} under the top bar (${hudBottom.toFixed(1)})`);
  for (const [name, rect] of [['pile', pile], ['side shelf', shelf]]) {
    if (!rect) continue;
    if (rect.left < EDGE - .5 || rect.right > width - EDGE + .5) fail(`${name} ${r1(rect)} closer than ${EDGE}px to the screen edge`);
  }
  const ride = layout.ride;
  if (!ride) fail('ride art missing');
  else {
    if (ride.top < pile.bottom - .5) fail(`ride ${r1(ride)} overlaps the pile (bottom ${pile.bottom.toFixed(1)})`);
    if (shelf && ride.top < shelf.bottom - .5) fail(`ride overlaps the side shelf`);
    if (ride.bottom > layout.actionsTop + .5) fail(`ride ${r1(ride)} runs behind the prop buttons (${layout.actionsTop.toFixed(1)})`);
  }
  const plate = layout.plateRect;
  if (!plate) fail('plate missing');
  else {
    if (plate.left < -.5 || plate.right > width + .5 || plate.top < -.5) fail(`plate ${r1(plate)} leaves the screen`);
    if (plate.bottom > layout.actionsTop - 1) fail(`plate ${r1(plate)} hidden behind the prop buttons (${layout.actionsTop.toFixed(1)})`);
    if (plate.bottom > height + .5) fail('plate below the screen');
  }
  const actions = layout.actionRects ?? [];
  if (actions.length !== 3) fail('prop buttons missing');
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a.left < EDGE - .5 || a.right > width - EDGE + .5 || a.bottom > height + .5) fail(`prop button ${i} leaves the screen ${r1(a)}`);
    for (let j = i + 1; j < actions.length; j++) if (overlaps(a, actions[j])) fail(`prop buttons ${i} and ${j} overlap`);
  }
}

/** Slot cells sit on the ride, inside the screen and above the prop buttons; the side shelf stays above the ride. */
function checkBottom(layout, fail) {
  const cells = layout.slotCells ?? [];
  if (!cells.length) fail('no slot cells exposed');
  for (const cell of cells) {
    if (cell.left < -.5 || cell.right > layout.viewport.width + .5) fail('slot cell leaves the screen');
    if (cell.bottom > layout.actionsTop - 1) fail('slot cell hidden behind the prop buttons');
    if (cell.top < layout.lidTop - .5) fail('slot cell above the ride');
  }
  if (layout.reserveBounds && layout.reserveBounds.bottom > layout.lidTop + .5) fail('side shelf overlaps the ride');
  if (layout.cardBounds.bottom > layout.lidTop + .5) fail('cards overlap the ride');
}
try {
  for (const [width, height] of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height }, screen: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    for (const stage of STAGES) {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`${width}x${height} s${stage}: ${error.message}`));
      const url = new URL(base);
      url.searchParams.set('mode', 'stack');
      url.searchParams.set('stage', String(stage));
      url.searchParams.set('api', 'off');
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__stack?.getState().clickable?.length > 0, undefined, { timeout: 20_000 });
      await page.waitForTimeout(stage === 1 ? 900 : 2600);
      const layout = await page.evaluate(() => window.__stack.getLayout());
      const clickable = await page.evaluate(() => window.__stack.getClickable());
      const row = {
        viewport: `${width}x${height}`, stage,
        boardScale: +layout.boardScale.toFixed(3),
        cardPx: +layout.cardSize.width.toFixed(1),
        cardsBottom: +layout.cardBounds.bottom.toFixed(1),
        lidTop: +layout.lidTop.toFixed(1),
        trunkTop: +layout.trunkTop.toFixed(1),
        vehicle: layout.vehicle?.key,
        pileEdge: +Math.min(layout.cardBounds.left, width - layout.cardBounds.right).toFixed(1),
        plateGap: layout.plateRect ? +(layout.actionsTop - layout.plateRect.bottom).toFixed(1) : null,
        buttonsGap: +(layout.viewport.height - layout.actionsBottom).toFixed(1),
      };
      report.push(row);
      const fail = msg => errors.push(`${row.viewport} stage ${stage}: ${msg} ${JSON.stringify(row)}`);
      if (layout.cardBounds.bottom > layout.lidTop + .5) fail('cards overlap the trunk lid');
      if (layout.cardBounds.top < layout.hudBottom - .5) fail('cards overlap the title bar');
      if (layout.cardBounds.left < -.5 || layout.cardBounds.right > width + .5) fail('cards leave the screen');
      if (layout.viewport.height - layout.actionsBottom < 18) fail('bottom buttons too close to the gesture bar');
      // Card-size floor for the stage-1/2 opening boards: 56px on 390x844, 44px on the short phones.
      const floor = stage !== 1 && stage !== 2 ? 0 : width === 390 && height === 844 ? 56 : height <= 676 ? 44 : 0;
      if (layout.cardSize.width < floor) fail(`cards ${layout.cardSize.width.toFixed(1)}px < ${floor}px`);
      for (const card of clickable) if (card.screenBottom > layout.lidTop + .5) fail(`card ${card.id} below lid`);
      checkBottom(layout, fail);
      checkInLevel(layout, fail);
      await page.screenshot({ path: path.join(outDir, `${width}x${height}-stage${stage}.png`) });
      await page.close();
    }
    await context.close();
  }
  // Poster home: every painted block and control must keep its own rectangle on all phone sizes.
  for (const [width, height] of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height }, screen: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`home ${width}x${height}: ${error.message}`));
    await page.goto(new URL('?api=off', base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__home, undefined, { timeout: 20_000 });
    await page.waitForTimeout(1200);
    const { boxes, height: designH } = await page.evaluate(() => window.__home.getLayout());
    const row = { viewport: `${width}x${height}`, home:'ok', carScale: boxes.car ? +(boxes.car.h / 452).toFixed(2) : 0 };
    report.push(row);
    const fail = msg => errors.push(`home ${width}x${height}: ${msg}`);
    const keys = Object.keys(boxes ?? {});
    if (keys.length < 12) fail('poster boxes missing');
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = boxes[keys[i]], b = boxes[keys[j]];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) fail(`${keys[i]} overlaps ${keys[j]}`);
    }
    const bottom = Math.max(...keys.map(k => boxes[k].y + boxes[k].h));
    if (bottom > designH - 16) fail(`controls reach the bottom edge (${bottom}/${designH})`);
    await page.screenshot({ path: path.join(outDir, `${width}x${height}-home-layout.png`) });
    await context.close();
  }
  // Every ride on the heavier stage-2 board, tall phone and Safari-with-toolbar, one screenshot each.
  await mkdir(path.join(outDir, 'vehicles'), { recursive: true });
  for (const [vw, vh] of [[390, 844], [390, 664]]) {
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, screen: { width: vw, height: vh }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const key of VEHICLES) {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`vehicle ${key}: ${error.message}`));
    const url = new URL(base);
    url.searchParams.set('mode', 'stack');
    url.searchParams.set('stage', '2');
    url.searchParams.set('api', 'off');
    url.searchParams.set('vehicle', key);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__stack?.getState().clickable?.length > 0, undefined, { timeout: 20_000 });
    await page.waitForTimeout(2600);
    const layout = await page.evaluate(() => window.__stack.getLayout());
    const row = {
      viewport: `${vw}x${vh}`, vehicle: key, label: layout.vehicle?.label,
      cardPx: +layout.cardSize.width.toFixed(1),
      slotPx: layout.slotCells?.length ? +(layout.slotCells[0].right - layout.slotCells[0].left).toFixed(1) : 0,
      cardsBottom: +layout.cardBounds.bottom.toFixed(1), rideTop: +layout.lidTop.toFixed(1),
    };
    report.push(row);
    const fail = msg => errors.push(`vehicle ${key} ${vw}x${vh}: ${msg} ${JSON.stringify(row)}`);
    if (layout.vehicle?.key !== key) fail(`page shows ${layout.vehicle?.key}`);
    checkBottom(layout, fail);
    checkInLevel(layout, fail);
    await page.screenshot({ path: path.join(outDir, 'vehicles', `${vw}x${vh}-${key}.png`) });
    await page.close();
  }
  await context.close();
  }
  // Sound popover: one speaker button opens 音效/音乐 switches that toggle and close cleanly.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 664 }, screen: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`sound menu: ${error.message}`));
    await page.goto(new URL('?mode=stack&stage=2&api=off', base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__stack?.getState().clickable?.length > 0, undefined, { timeout: 20_000 });
    await page.waitForTimeout(2600);
    const fail = msg => errors.push(`sound menu: ${msg}`);
    const center = r => [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
    const before = await page.evaluate(() => window.__stack.getLayout());
    await page.touchscreen.tap(...center(before.hud.sound));
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => window.__stack.getLayout());
    if (!open.soundMenu.open) fail('speaker tap did not open the popover');
    const enabled = await page.evaluate(() => window.__stack.getState().soundEnabled);
    await page.touchscreen.tap(...center(open.soundMenu.rows[0]));
    await page.waitForTimeout(300);
    const toggled = await page.evaluate(() => window.__stack.getState().soundEnabled);
    if (toggled === enabled) fail('音效 switch did not toggle');
    await page.screenshot({ path: path.join(outDir, '390x664-sound-menu.png') });
    const remaining = await page.evaluate(() => window.__stack.getState().remaining);
    await page.touchscreen.tap(195, 300);
    await page.waitForTimeout(300);
    const closed = await page.evaluate(() => ({ open: window.__stack.getLayout().soundMenu.open, remaining: window.__stack.getState().remaining }));
    if (closed.open) fail('tap outside did not close the popover');
    if (closed.remaining !== remaining) fail('closing tap fell through to the pile');
    report.push({ soundMenu: 'ok', toggled: enabled !== toggled });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: errors.length === 0, report, errors }, null, 1));
if (errors.length) process.exitCode = 1;
