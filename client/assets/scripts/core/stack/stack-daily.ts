import { createRng } from '../rng';
import { STAGE2_ITEMS } from './stack-catalog';
import { assignTriples, stackMomPositions, stackReservePositions } from './stack-generator';
import { STACK_CARD_SIZE } from './stack-layout';
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

export function generateDailyLevel(dateKey: string, maxAttempts = 8): StackLevel {
  validateDateKey(dateKey);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('invalid daily generator attempts');
  const seed = `trunk-daily-${dateKey}`;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const level = attemptDaily(dateKey, seed, attempt);
    if (level) return level;
  }
  throw new Error(`no solvable daily stack seed after ${maxAttempts} attempts`);
}

export function dailySeedFor(dateKey: string): string {
  validateDateKey(dateKey);
  return `trunk-daily-${dateKey}`;
}
