import { createRng } from '../rng';
import { ENDLESS_ITEMS } from './stack-catalog';
import {
  STACK_SHELF_Y, STACK_SIDE_FAN_Y, assignTriples, layoutStageTwo, stackMomPositions, stackReservePositions,
} from './stack-generator';
import { STACK_CARD_SIZE } from './stack-layout';
import { freeCards, isBlocked } from './stack-rules';
import { solveStackLevel } from './stack-solver';
import { ENDLESS_TUNING } from './stack-endless-table';
import type { StackCard, StackLevel } from './stack-types';

export const ENDLESS_MIN_STAGE = 3;
export const ENDLESS_MAX_CARDS = 240;
export const ENDLESS_BASE_CARDS = 165;
export const ENDLESS_CARDS_PER_STAGE = 15;
export const ENDLESS_MAX_LAYERS = 11;
export { ENDLESS_TUNING };
export const ENDLESS_BASE_LAYERS = 6;
export const ENDLESS_MAX_KINDS = 30;

/** One place per road level 3–9; level 9 is the finale at home. */
export const ROUTE_TITLES = ['出城收费站', '高速服务区', '跨江大桥', '山区隧道', '县城环岛', '进村牌楼', '到家了'] as const;
export const ROAD_FINAL_STAGE = 9;

export function capacityForLevel(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new Error('invalid endless level');
  if (n <= 3) return 7;
  if (n <= 5) return 8;
  return 9;
}

export function routeTitleForLevel(n: number): string {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE || n > ROAD_FINAL_STAGE) throw new Error('invalid endless route level');
  return `第 ${n} 关 · ${ROUTE_TITLES[(n - ENDLESS_MIN_STAGE) % ROUTE_TITLES.length]}`;
}

export function endlessCardCount(n: number): number {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  return Math.min(ENDLESS_MAX_CARDS, ENDLESS_BASE_CARDS + (n - ENDLESS_MIN_STAGE) * ENDLESS_CARDS_PER_STAGE);
}

export function endlessKindCount(n: number, available = ENDLESS_ITEMS.length): number {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  return Math.min(available, ENDLESS_MAX_KINDS, 14 + (n - ENDLESS_MIN_STAGE));
}

function card(id: number, x: number, y: number, layer: number, source: StackCard['source']): StackCard {
  return {id, kind: '', name: '', x, y, w: STACK_CARD_SIZE, h: STACK_CARD_SIZE, layer, source};
}

/** Mound outlines on a staggered lattice ('#' = a pile spot). Rotated level by level. */
export const MOUND_TEMPLATES = [
  {key: 'lantern', name: '灯笼', rows: [
    '...#...',
    '..###..',
    '.#####.',
    '#######',
    '.#####.',
    '..###..',
    '...#...',
  ]},
  {key: 'ingot', name: '元宝', rows: [
    '#.....#',
    '##...##',
    '###.###',
    '#######',
    '.#####.',
    '..###..',
  ]},
  {key: 'fu', name: '福字斗方', rows: [
    '...#...',
    '..###..',
    '.##.##.',
    '###.###',
    '.##.##.',
    '..###..',
    '...#...',
  ]},
  {key: 'fish', name: '年年有鱼', rows: [
    '..##...',
    '.####.#',
    '#######',
    '#######',
    '.####.#',
    '..##...',
  ]},
  {key: 'knot', name: '中国结', rows: [
    '.#...#.',
    '###.###',
    '.#####.',
    '..###..',
    '.#####.',
    '###.###',
    '.#...#.',
  ]},
  {key: 'gourd', name: '葫芦', rows: [
    '...#...',
    '..###..',
    '..###..',
    '...#...',
    '.#####.',
    '#######',
    '.#####.',
  ]},
] as const;

const MOUND_STEP_X = 92;
const MOUND_STEP_Y = 78;
const MOUND_CENTER_Y = 500;
/** Each card higher in one spot sits a little up-left so the pile reads as a stack. */
const MOUND_LIFT_X = -5;
const MOUND_LIFT_Y = -9;

/** Opening tappable cards (pile tops + the two side-fan tops) every road board starts with. */
export const ENDLESS_OPEN_RANGE = [6, 8] as const;
const MOUND_ALIGNS = [0, .25, .5, .75, 1] as const;

/** Pile count for a mound of `count` cards: 10 piles at 20 cards, 18 at 100 (one open card each). */
export function moundPiles(count: number): number {
  return Math.round(8 + count / 10);
}

/** Levels 4–9 each get their own outline (lantern, ingot, 福 square, fish, knot, gourd). */
export function moundTemplateFor(n: number): typeof MOUND_TEMPLATES[number] {
  return MOUND_TEMPLATES[((n - ENDLESS_MIN_STAGE - 1) % MOUND_TEMPLATES.length + MOUND_TEMPLATES.length) % MOUND_TEMPLATES.length];
}

/**
 * Per-spot pile heights for `count` cards: the centre of the outline rises highest and the
 * edges stay one card tall, so the mound has visible high and low parts instead of a flat grid.
 */
export function moundHeights(spots: number, distances: readonly number[], count: number, piles = moundPiles(count)): number[] {
  if (count <= 0) return distances.map(() => 0);
  const order = distances.map((distance, index) => ({distance, index})).sort((a, b) => a.distance - b.distance || a.index - b.index);
  const heights = new Array<number>(spots).fill(0);
  const used = Math.min(spots, count, Math.max(1, piles));
  const chosen = order.slice(0, used);
  const far = Math.max(1e-6, ...chosen.map(spot => spot.distance));
  let peak = 1;
  const total = (top: number): number => chosen.reduce((sum, spot) => sum + Math.max(1, Math.round(top * (1 - spot.distance / far * .85))), 0);
  while (total(peak + .25) <= count && peak < 12) peak += .25;
  for (const spot of chosen) heights[spot.index] = Math.max(1, Math.round(peak * (1 - spot.distance / far * .85)));
  let left = count - heights.reduce((sum, height) => sum + height, 0);
  for (let index = 0; left > 0; index = (index + 1) % chosen.length, left--) heights[chosen[index].index]++;
  for (let index = chosen.length - 1; left < 0; index = (index - 1 + chosen.length) % chosen.length) {
    if (heights[chosen[index].index] > 1) { heights[chosen[index].index]--; left++; }
  }
  return heights;
}

function addMound(cards: StackCard[], n: number, count: number, random: () => number, piles: number, align: number): void {
  if (count <= 0) return;
  const template = moundTemplateFor(n);
  const rows = template.rows;
  const spots: {x: number; y: number; d: number}[] = [];
  const midRow = (rows.length - 1) / 2;
  rows.forEach((line, row) => {
    const midCol = (line.length - 1) / 2;
    for (let col = 0; col < line.length; col++) {
      if (line[col] !== '#') continue;
      const stagger = row % 2 ? MOUND_STEP_X / 4 : -MOUND_STEP_X / 4;
      const x = 375 + (col - midCol) * MOUND_STEP_X + stagger - STACK_CARD_SIZE / 2;
      const y = MOUND_CENTER_Y + (row - midRow) * MOUND_STEP_Y - STACK_CARD_SIZE / 2;
      spots.push({x, y, d: Math.hypot((col - midCol) * 1.1, row - midRow) + random() * .3});
    }
  });
  const heights = moundHeights(spots.length, spots.map(spot => spot.d), count, piles);
  let id = Math.max(...cards.map(item => item.id));
  // Lay level by level so ids stay ordered bottom-up like the rest of the pile.
  const tallest = Math.max(...heights);
  for (let level = 0; level < tallest; level++) {
    spots.forEach((spot, index) => {
      if (heights[index] <= level) return;
      const jitterX = Math.round((random() - .5) * 6);
      const jitterY = Math.round((random() - .5) * 6);
      cards.push(card(++id, Math.round(spot.x + level * MOUND_LIFT_X + jitterX), Math.round(spot.y + level * MOUND_LIFT_Y + jitterY),
        // `align` lifts shorter piles toward the tallest one: at 1 every pile top shares the top
        // layer (all open), at 0 only local peaks are open. layoutEndless tunes it for 6–8 openers.
        ENDLESS_BASE_LAYERS + Math.round(align * (tallest - heights[index])) + level, 'pile'));
    });
  }
}

function addSideFan(cards: StackCard[], count: number): void {
  const left = Math.ceil(count / 2);
  const right = count - left;
  let id = Math.max(...cards.map(item => item.id));
  for (let index = 0; index < left; index++) {
    cards.push(card(++id, 36 + index * 13, STACK_SIDE_FAN_Y, 40 + index, 'side-left'));
  }
  for (let index = 0; index < right; index++) {
    cards.push(card(++id, 606 - index * 13, STACK_SIDE_FAN_Y, 40 + index, 'side-right'));
  }
}

/**
 * A compact endless mound. The base reuses the approved stage-two footprint; later stages add
 * stacked inner layers and grow the two side fans instead of widening the board.
 */
export function layoutEndless(n: number, random: () => number): StackCard[] {
  const target = endlessCardCount(n);
  const extraCards = Math.max(0, Math.min(5, n - ENDLESS_MIN_STAGE)) * 20;
  const main = layoutStageTwo(random).filter(item => item.source === 'pile');
  const moundSeed = Math.floor(random() * 1e9);
  const build = (piles: number, align: number): StackCard[] => {
    const cards = main.map(item => ({...item}));
    addMound(cards, n, extraCards, createRng(`mound-${moundSeed}-${piles}-${align}`), piles, align);
    const sideCount = target - cards.length;
    if (sideCount < 0) throw new Error('endless layout exceeds target');
    addSideFan(cards, sideCount);
    if (cards.length !== target) throw new Error('endless layout card count mismatch');
    return cards;
  };
  if (!extraCards) return build(0, 0);
  // Piles about four cards tall, then the nearest pile count / top alignment that opens with
  // ENDLESS_OPEN_RANGE tappable cards (pile tops + the two side fans).
  const preferred = Math.max(6, Math.min(25, Math.round(extraCards / 4)));
  let fallback: {cards: StackCard[]; miss: number} | undefined;
  for (let offset = 0; offset <= 20; offset++) {
    for (const piles of offset ? [preferred - offset, preferred + offset] : [preferred]) {
      if (piles < 3 || piles > extraCards) continue;
      for (const align of MOUND_ALIGNS) {
        const cards = build(piles, align);
        const open = freeCards(cards).length;
        if (open >= ENDLESS_OPEN_RANGE[0] && open <= ENDLESS_OPEN_RANGE[1]) return cards;
        const miss = Math.max(ENDLESS_OPEN_RANGE[0] - open, open - ENDLESS_OPEN_RANGE[1]);
        if (!fallback || miss < fallback.miss) fallback = {cards, miss};
      }
    }
  }
  return fallback!.cards;
}

export interface EndlessTuning {
  readonly rushRate: number;
  readonly minGap: number;
  readonly maxOpenGroups: number;
  /** First generator attempt to try; picked offline so the shipped board hits its target rate. */
  readonly attempt: number;
}

/** Share of all cards that start as closed cartons: 15% on level 4, +3 points a level, capped at 30%. */
export function cartonRate(n: number): number {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  if (n < 4) return 0;
  return Math.min(.30, .15 + .03 * (n - 4));
}

/**
 * Marks covered cards as cartons, lowest layers first (side fans count as low), so the visible
 * top of the board stays mostly real cargo with dimmed faces underneath.
 */
export function markCartons(cards: readonly StackCard[], n: number, random: () => number): StackCard[] {
  const wanted = Math.round(cartonRate(n) * cards.length);
  if (!wanted) return cards.map(item => ({...item}));
  const depth = (item: StackCard): number => item.source === 'pile' ? item.layer : (item.layer - 40) / 4;
  const covered = cards.filter(item => isBlocked(item, cards))
    .map(item => ({item, key: depth(item) + random() * .9}))
    .sort((a, b) => a.key - b.key)
    .slice(0, wanted);
  const ids = new Set(covered.map(entry => entry.item.id));
  return cards.map(item => ids.has(item.id) ? {...item, carton: true} : {...item});
}

export function endlessTuning(n: number): EndlessTuning {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE || n > ROAD_FINAL_STAGE) throw new Error('invalid endless level');
  return ENDLESS_TUNING[n] ?? DEFAULT_TUNING;
}

const DEFAULT_TUNING: EndlessTuning = {rushRate: .85, minGap: 6, maxOpenGroups: 3, attempt: 0};

function attemptEndless(n: number, baseSeed: string, attempt: number, tuning: EndlessTuning): StackLevel | undefined {
  const seed = attempt === 0 ? baseSeed : `${baseSeed}#retry-${attempt}`;
  const random = createRng(seed);
  const cards = layoutEndless(n, random);
  const items = ENDLESS_ITEMS.slice(0, endlessKindCount(n));
  const capacity = capacityForLevel(n);
  const assigned = assignTriples(cards, items, random, {
    capacity,
    minGap: tuning.minGap,
    maxOpenGroups: tuning.maxOpenGroups,
    rushRate: tuning.rushRate,
  });
  if (!assigned) return undefined;
  const level: StackLevel = {
    stage: n,
    seed,
    cardW: STACK_CARD_SIZE,
    cardH: STACK_CARD_SIZE,
    items,
    cards: markCartons(assigned.cards, n, createRng(`${seed}:carton`)),
    reservePositions: stackReservePositions(STACK_CARD_SIZE, STACK_CARD_SIZE, 12, STACK_SHELF_Y),
    momPositions: stackMomPositions(STACK_CARD_SIZE),
    solution: assigned.solution,
    slotCapacity: capacity,
  };
  return solveStackLevel(level, {maxNodes: 240_000}).solvable ? level : undefined;
}

export function generateEndlessLevel(n: number, maxAttempts = 8, tuning = endlessTuning(n)): StackLevel {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE || n > ROAD_FINAL_STAGE) throw new Error('invalid endless level');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('invalid endless generator attempts');
  const seed = `trunk-road-${n}`;
  for (let attempt = tuning.attempt; attempt < tuning.attempt + maxAttempts; attempt++) {
    const level = attemptEndless(n, seed, attempt, tuning);
    if (level) return level;
  }
  throw new Error(`no solvable endless stack seed after ${maxAttempts} attempts`);
}

export function endlessSeedFor(n: number): string {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  return `trunk-road-${n}`;
}
