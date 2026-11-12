#!/usr/bin/env node
// Opening-board layout check: on each phone size, every stage-1/2 card must sit between the title
// bar and the open trunk lid, and the bottom buttons must keep a gesture-bar margin.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8772/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3-v8/layout';
const VIEWPORTS = [[390, 844], [360, 780], [412, 780], [375, 667]];
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const report = [];
const errors = [];
const VEHICLES = ['moto', 'trike', 'sedan', 'suv', 'van', 'pickup', 'truck', 'bus', 'tractor'];

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
    for (const stage of [1, 2]) {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`${width}x${height} s${stage}: ${error.message}`));
      const url = new URL(base);
      url.searchParams.set('mode', 'stack');
      url.searchParams.set('stage', String(stage));
      url.searchParams.set('api', 'off');
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__stack?.getState().clickable?.length > 0, undefined, { timeout: 20_000 });
      await page.waitForTimeout(900);
      const layout = await page.evaluate(() => window.__stack.getLayout());
      const clickable = await page.evaluate(() => window.__stack.getClickable());
      const row = {
        viewport: `${width}x${height}`, stage,
        boardScale: +layout.boardScale.toFixed(3),
        cardPx: +layout.cardSize.width.toFixed(1),
        cardsBottom: +layout.cardBounds.bottom.toFixed(1),
        lidTop: +layout.lidTop.toFixed(1),
        trunkTop: +layout.trunkTop.toFixed(1),
        buttonsGap: +(layout.viewport.height - layout.actionsBottom).toFixed(1),
      };
      report.push(row);
      const fail = msg => errors.push(`${row.viewport} stage ${stage}: ${msg} ${JSON.stringify(row)}`);
      if (layout.cardBounds.bottom > layout.lidTop + .5) fail('cards overlap the trunk lid');
      if (layout.cardBounds.top < layout.hudBottom - .5) fail('cards overlap the title bar');
      if (layout.cardBounds.left < -.5 || layout.cardBounds.right > width + .5) fail('cards leave the screen');
      if (layout.viewport.height - layout.actionsBottom < 18) fail('bottom buttons too close to the gesture bar');
      // Card-size floor for the opening boards: 56px on 390x844, 44px on the short 375x667.
      const floor = width === 390 && height === 844 ? 56 : width === 375 && height === 667 ? 44 : 0;
      if (layout.cardSize.width < floor) fail(`cards ${layout.cardSize.width.toFixed(1)}px < ${floor}px`);
      for (const card of clickable) if (card.screenBottom > layout.lidTop + .5) fail(`card ${card.id} below lid`);
      checkBottom(layout, fail);
      await page.screenshot({ path: path.join(outDir, `${width}x${height}-stage${stage}.png`) });
      await page.close();
    }
    await context.close();
  }
  // Every ride at 390x844 on the heavier stage-2 board, one opening screenshot each.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mkdir(path.join(outDir, 'vehicles'), { recursive: true });
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
      viewport: '390x844', vehicle: key, label: layout.vehicle?.label,
      cardPx: +layout.cardSize.width.toFixed(1),
      slotPx: layout.slotCells?.length ? +(layout.slotCells[0].right - layout.slotCells[0].left).toFixed(1) : 0,
      cardsBottom: +layout.cardBounds.bottom.toFixed(1), rideTop: +layout.lidTop.toFixed(1),
    };
    report.push(row);
    const fail = msg => errors.push(`vehicle ${key}: ${msg} ${JSON.stringify(row)}`);
    if (layout.vehicle?.key !== key) fail(`page shows ${layout.vehicle?.key}`);
    checkBottom(layout, fail);
    await page.screenshot({ path: path.join(outDir, 'vehicles', `390x844-${key}.png`) });
    await page.close();
  }
  await context.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: errors.length === 0, report, errors }, null, 1));
if (errors.length) process.exitCode = 1;
