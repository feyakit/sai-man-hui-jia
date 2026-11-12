// Usage: node --import tsx tools/sim-curve-report.ts <level|daily:YYYY-MM-DD> [runs]
// Prints greedy/no-prop, look-ahead/all props and look-ahead/all props + revive win rates for the shipped board.
import {generateDailyLevel} from '../client/assets/scripts/core/stack/stack-daily';
import {generateEndlessLevel} from '../client/assets/scripts/core/stack/stack-endless';
import {generateStackLevel} from '../client/assets/scripts/core/stack/stack-generator';
import {simulateStackBatch} from '../client/assets/scripts/core/stack/stack-sim';
const arg = process.argv[2];
const runs = Number(process.argv[3] ?? 400);
const level = arg.startsWith('daily:') ? generateDailyLevel(arg.slice(6)) : Number(arg) <= 2 ? generateStackLevel(Number(arg)).level : generateEndlessLevel(Number(arg));
const seed = arg.startsWith('daily:') ? `report-${arg}` : `curve-${arg}`;
const rate = (strategy: 'greedy' | 'greedy-lookahead', itemMode: 'none' | 'all' | 'all-revive') =>
  +(simulateStackBatch(level, {strategy, itemMode, seed}, runs).winRate * 100).toFixed(1);
console.log(JSON.stringify({level: arg, cards: level.cards.length, kinds: level.items.length, cap: level.slotCapacity ?? 7,
  greedyNone: rate('greedy', 'none'), lookAll: rate('greedy-lookahead', 'all'), lookRevive: rate('greedy-lookahead', 'all-revive')}));
