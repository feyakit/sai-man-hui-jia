import { createRng } from '../rng';
import { STAGE2_ITEMS } from './stack-catalog';
import { assignTriples, stackMomPositions, stackReservePositions } from './stack-generator';
import { STACK_CARD_SIZE } from './stack-layout';
import { DAILY_TABLE, DAILY_TABLE_START } from './stack-daily-table';
import { simulateStackBatch } from './stack-sim';
import { solveStackLevel } from './stack-solver';
import type { StackCard, StackLevel } from './stack-types';

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1_000;

/** Returns the UTC+8 calendar day as YYYY-MM-DD, independent of the host timezone. */
export function dailySeed(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('invalid daily stack date');
  const beijing = new Date(date.getTime() + BEIJING_OFFSET_MS);
  const year = beijing.getUTCFullYear();
  const month = String(beijing.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijing.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const beijingDateKey = dailySeed;

export const DAILY_CARD_OPTIONS = [
  {cards: 72, items: 9, layers: [27, 21, 18, 6]},
  {cards: 78, items: 9, layers: [30, 24, 18, 6]},
  {cards: 84, items: 10, layers: [30, 27, 21, 6]},
  {cards: 90, items: 10, layers: [30, 27, 24, 9]},
] as const;

export const DAILY_LAYERS = 4;
export const DAILY_SLOT_CAPACITY = 7;

function dateHash(key: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function validateDateKey(key: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error('invalid daily stack date key');
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('invalid daily stack date key');
  }
}

function dailyCard(
  id: number,
  x: number,
  y: number,
  layer: number,
): StackCard {
  return {id, kind: '', name: '', x, y, w: STACK_CARD_SIZE, h: STACK_CARD_SIZE, layer, source: 'pile'};
}

export function layoutDaily(option: typeof DAILY_CARD_OPTIONS[number], random: () => number): StackCard[] {
  const cards: StackCard[] = [];
  let id = 0;
  const grid = 112;
  const columns = 5;
  option.layers.forEach((count, layer) => {
    const rows = Math.ceil(count / columns);
    const width = columns * grid + STACK_CARD_SIZE;
    const startX = Math.round((750 - width) / 2) + (layer % 2 ? grid / 2 : 0);
    const startY = 190 + layer * 14 + (layer % 2 ? 28 : 0);
    for (let index = 0; index < count; index++) {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const jitterX = Math.round((random() - .5) * 4);
      const jitterY = Math.round((random() - .5) * 4);
      cards.push(dailyCard(++id, startX + col * grid + jitterX, startY + row * grid + jitterY, layer));
    }
    // Keep the row count part of the layout shape even though all cards are explicit.
    if (rows < 1) throw new Error('invalid daily layer');
  });
  return cards;
}

function attemptDaily(dateKey: string, baseSeed: string, attempt: number): StackLevel | undefined {
  const seed = attempt === 0 ? baseSeed : `${baseSeed}#retry-${attempt}`;
  const random = createRng(seed);
  const option = DAILY_CARD_OPTIONS[dateHash(dateKey) % DAILY_CARD_OPTIONS.length];
  const cards = layoutDaily(option, random);
  const items = STAGE2_ITEMS.slice(0, option.items);
  const assigned = assignTriples(cards, items, random, {
    capacity: DAILY_SLOT_CAPACITY,
    minGap: 25,
    maxOpenGroups: 4,
  });
  if (!assigned) return undefined;
  const level: StackLevel = {
    stage: 0,
    seed,
    cardW: STACK_CARD_SIZE,
    cardH: STACK_CARD_SIZE,
    items,
    cards: assigned.cards,
    reservePositions: stackReservePositions(STACK_CARD_SIZE, STACK_CARD_SIZE, 12),
    momPositions: stackMomPositions(STACK_CARD_SIZE),
    solution: assigned.solution,
    slotCapacity: DAILY_SLOT_CAPACITY,
  };
  return solveStackLevel(level, {maxNodes: 120_000}).solvable ? level : undefined;
}

/** Greedy no-prop win-rate window every shipped daily board is checked against. */
export const DAILY_TARGET = {low: .42, high: .58, screenRuns: 50, runs: 200} as const;

/** Win rate of the greedy bot without props; deterministic for a given level. */
export function dailyGreedyRate(level: StackLevel, runs: number = DAILY_TARGET.runs): number {
  return simulateStackBatch(level, {strategy: 'greedy', itemMode: 'none', seed: 'daily-calibration'}, runs).winRate;
}

/**
 * Builds today's board and keeps re-rolling (deterministically) until the greedy no-prop bot wins
 * 42–58% of the time, so every date lands in the same comfortable 30–70% band. Falls back to the
 * closest candidate if none of the attempts hits the window.
 */
/** Runtime calibration: the first attempt whose greedy rate is in the window (or the closest one). */
export function calibrateDaily(dateKey: string, maxAttempts = 24): {level: StackLevel; attempt: number} {
  validateDateKey(dateKey);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('invalid daily generator attempts');
  const seed = `trunk-daily-${dateKey}`;
  let best: {level: StackLevel; attempt: number; miss: number} | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const level = attemptDaily(dateKey, seed, attempt);
    if (!level) continue;
    // Cheap screen first; only promising boards pay for the precise 200-run check.
    const screen = dailyGreedyRate(level, DAILY_TARGET.screenRuns);
    const rate = Math.abs(screen - .5) <= .15 ? dailyGreedyRate(level) : screen;
    if (rate >= DAILY_TARGET.low && rate <= DAILY_TARGET.high) return {level, attempt};
    const miss = Math.abs(rate - (DAILY_TARGET.low + DAILY_TARGET.high) / 2);
    if (!best || miss < best.miss) best = {level, attempt, miss};
  }
  if (best) return {level: best.level, attempt: best.attempt};
  throw new Error(`no solvable daily stack seed after ${maxAttempts} attempts`);
}

/**
 * Today's board, re-rolled (deterministically) until the greedy no-prop bot wins 42–58% of the
 * time so every date lands in the same comfortable 30–70% band. Dates covered by the offline table
 * (tools/gen-daily-table.ts) jump straight to the calibrated attempt, so phones build one board.
 */
export function generateDailyLevel(dateKey: string, maxAttempts = 24): StackLevel {
  validateDateKey(dateKey);
  const known = dailyTableAttempt(dateKey);
  if (known !== undefined) {
    const level = attemptDaily(dateKey, `trunk-daily-${dateKey}`, known);
    if (level) return level;
  }
  return calibrateDaily(dateKey, maxAttempts).level;
}

/** Calibrated attempt index for a date in the shipped table, if any. */
export function dailyTableAttempt(dateKey: string): number | undefined {
  const [sy, sm, sd] = DAILY_TABLE_START.split('-').map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const [y, m, d] = dateKey.split('-').map(Number);
  const index = Math.round((Date.UTC(y, m - 1, d) - start) / 86_400_000);
  if (index < 0 || index >= DAILY_TABLE.length) return undefined;
  const value = parseInt(DAILY_TABLE[index], 36);
  return Number.isNaN(value) ? undefined : value;
}

export function dailySeedFor(dateKey: string): string {
  validateDateKey(dateKey);
  return `trunk-daily-${dateKey}`;
}
