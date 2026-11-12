// Usage: node --import tsx tools/calibrate-endless.ts <level> <targetPct> <outDir> [floorPct=5]
// Tries (rushRate, attempt) candidates for one endless level: 150-run screen, 400-run confirm
// (greedy look-ahead bot, every prop + one revive). Writes <outDir>/level-<n>.json; skips if present.
import {existsSync, mkdirSync, writeFileSync, appendFileSync} from 'node:fs';
import path from 'node:path';
import {generateEndlessLevel, type EndlessTuning} from '../client/assets/scripts/core/stack/stack-endless';
import {simulateStackBatch} from '../client/assets/scripts/core/stack/stack-sim';
import {freeCards} from '../client/assets/scripts/core/stack/stack-rules';

const n = Number(process.argv[2]);
const target = Number(process.argv[3]);
const outDir = process.argv[4];
mkdirSync(outDir, {recursive: true});
const out = path.join(outDir, `level-${n}.json`);
const log = path.join(outDir, `level-${n}.log`);
if (existsSync(out)) process.exit(0);
const screenTol = Math.max(2, target * .3);
const confirmTol = Math.max(1.2, target * .15);
const floor = Number(process.argv[5] ?? 5);
const rate = (tuning: EndlessTuning, runs: number, seed: string): number => {
  const level = generateEndlessLevel(n, 8, tuning);
  return +(simulateStackBatch(level, {strategy: 'greedy-lookahead', itemMode: 'all-revive', seed}, runs).winRate * 100).toFixed(2);
};
let best: {tuning: EndlessTuning; rate: number; miss: number} | undefined;
const candidates: EndlessTuning[] = [];
for (let attempt = 0; attempt < 10; attempt++) for (const rushRate of [1, .85, .7, .5]) candidates.push({rushRate, minGap: 6, maxOpenGroups: 3, attempt});
for (const kindDelta of [2, 4]) for (let attempt = 0; attempt < 8; attempt++) for (const rushRate of [1, .85]) candidates.push({rushRate, minGap: 6, maxOpenGroups: 3, attempt, kindDelta});
for (const tuning of candidates) {
  let screen: number;
  try { screen = rate(tuning, 150, `cal-${n}`); } catch (error) { appendFileSync(log, `${JSON.stringify(tuning)} gen-fail ${error}\n`); continue; }
  appendFileSync(log, `${JSON.stringify(tuning)} screen ${screen}\n`);
  if (Math.abs(screen - target) > screenTol) continue;
  const confirm = rate(tuning, 400, `confirm-${n}`);
  appendFileSync(log, `${JSON.stringify(tuning)} confirm ${confirm}\n`);
  const miss = Math.abs(confirm - target) + (confirm < floor ? 100 : 0);
  if (!best || miss < best.miss) best = {tuning, rate: confirm, miss};
  if (Math.abs(confirm - target) <= confirmTol && confirm >= floor) break;
}
if (!best) { appendFileSync(log, 'no candidate\n'); process.exit(1); }
const level = generateEndlessLevel(n, 8, best.tuning);
writeFileSync(out, JSON.stringify({n, target, ...best, open: freeCards(level.cards).length,
  cartons: level.cards.filter(card => card.carton).length, cards: level.cards.length, kinds: level.items.length}));
