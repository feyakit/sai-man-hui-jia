#!/usr/bin/env node
// Renders share cards (win and fail, with a province and a ride) and saves them for review.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8772/';
const outDir = process.argv[3] ?? '/workspace/play-check/match3-v8/share';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.addInitScript(() => localStorage.setItem('smhj.province', '四川'));
  for (const [name, query, button] of [
    ['share-win-moto', '?mode=stack&stage=1&api=off&debug=win', 'finish'],
    ['share-fail-trike', '?mode=stack&stage=2&api=off&debug=fail', 'fail'],
    ['share-win-pickup', '?mode=stack&stage=2&api=off&debug=win&vehicle=pickup', 'finish'],
  ]) {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    const url = new URL(query, base);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__stack, undefined, { timeout: 20_000 });
    await page.waitForTimeout(1500);
    const targets = button === 'finish'
      ? await page.evaluate(() => window.__stack.getFinishButtons())
      : await page.evaluate(() => window.__stack.getModalButtons());
    const share = targets.find(target => target.action === 'share');
    if (!share) { errors.push(`${name}: no share button ${JSON.stringify(targets)}`); await page.close(); continue; }
    await page.touchscreen.tap(share.screenX, share.screenY);
    await page.waitForFunction(() => document.querySelector('#stack-share-image')?.naturalWidth > 0, undefined, { timeout: 8000 });
    const dataUrl = await page.evaluate(() => document.querySelector('#stack-share-image').src);
    await writeFile(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ ok: errors.length === 0, errors }));
if (errors.length) process.exitCode = 1;
