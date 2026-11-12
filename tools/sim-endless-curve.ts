// Usage: node --import tsx tools/sim-endless-curve.ts <level> [runs] [rushRate minGap maxOpen attempt]
import {endlessTuning, generateEndlessLevel} from '../client/assets/scripts/core/stack/stack-endless';
import {simulateStackBatch} from '../client/assets/scripts/core/stack/stack-sim';
const n = Number(process.argv[2]);
const runs = Number(process.argv[3] ?? 200);
const base = endlessTuning(n);
const tuning = process.argv[4] ? {rushRate: Number(process.argv[4]), minGap: Number(process.argv[5] ?? base.minGap), maxOpenGroups: Number(process.argv[6] ?? base.maxOpenGroups), attempt: Number(process.argv[7] ?? 0)} : base;
const t = Date.now();
const level = generateEndlessLevel(n, 8, tuning);
const gen = Date.now() - t;
const revive = simulateStackBatch(level, {strategy: 'greedy-lookahead', itemMode: 'all-revive', seed: `curve-${n}`}, runs);
console.log(JSON.stringify({n, tuning, cards: level.cards.length, kinds: level.items.length, cap: level.slotCapacity, genMs: gen, revive: revive.winRate, ms: Date.now() - t}));
