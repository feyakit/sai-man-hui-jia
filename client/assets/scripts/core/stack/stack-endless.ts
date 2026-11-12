import { createRng } from '../rng';
import { ENDLESS_ITEMS } from './stack-catalog';
import {
  STACK_SHELF_Y, STACK_SIDE_FAN_Y, assignTriples, layoutStageTwo, stackMomPositions, stackReservePositions,
} from './stack-generator';
import { STACK_CARD_SIZE } from './stack-layout';
import { solveStackLevel } from './stack-solver';
import type { StackCard, StackLevel } from './stack-types';

export const ENDLESS_MIN_STAGE = 3;
export const ENDLESS_MAX_CARDS = 240;
export const ENDLESS_BASE_CARDS = 165;
export const ENDLESS_CARDS_PER_STAGE = 15;
export const ENDLESS_MAX_LAYERS = 11;
export const ENDLESS_BASE_LAYERS = 6;

export const ROUTE_TITLES = [
  '出城收费站', '高速服务区', '跨江大桥', '山区隧道', '县城环岛', '老街牌坊',
  '河堤长坡', '稻田岔路', '石桥驿站', '竹林弯道', '水库大坝', '省道加油站',
  '集市路口', '火车涵洞', '山顶垭口', '松林慢坡', '渡口码头', '新村广场',
  '学校后门', '果园岔口', '窑厂小路', '铁路道口', '祠堂前街', '入镇牌楼',
] as const;

export function capacityForLevel(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new Error('invalid endless level');
  if (n <= 3) return 7;
  if (n <= 5) return 8;
  return 9;
}

export function routeTitleForLevel(n: number): string {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless route level');
  return `第 ${n} 关 · ${ROUTE_TITLES[(n - ENDLESS_MIN_STAGE) % ROUTE_TITLES.length]}`;
}

export function endlessCardCount(n: number): number {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  return Math.min(ENDLESS_MAX_CARDS, ENDLESS_BASE_CARDS + (n - ENDLESS_MIN_STAGE) * ENDLESS_CARDS_PER_STAGE);
}

export function endlessKindCount(n: number, available = ENDLESS_ITEMS.length): number {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  return Math.min(available, 14 + (n - ENDLESS_MIN_STAGE));
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

export function moundTemplateFor(n: number): typeof MOUND_TEMPLATES[number] {
  return MOUND_TEMPLATES[((n - ENDLESS_MIN_STAGE - 1) % MOUND_TEMPLATES.length + MOUND_TEMPLATES.length) % MOUND_TEMPLATES.length];
}

/**
 * Per-spot pile heights for `count` cards: the centre of the outline rises highest and the
 * edges stay one card tall, so the mound has visible high and low parts instead of a flat grid.
 */
export function moundHeights(spots: number, distances: readonly number[], count: number): number[] {
  if (count <= 0) return distances.map(() => 0);
  const order = distances.map((distance, index) => ({distance, index})).sort((a, b) => a.distance - b.distance || a.index - b.index);
  const heights = new Array<number>(spots).fill(0);
  // Use fewer spots when there are few cards so even level 4 gets two- and three-high piles.
  const used = Math.min(spots, Math.max(1, Math.ceil(count / 1.6)));
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

function addMound(cards: StackCard[], n: number, count: number, random: () => number): void {
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
  const heights = moundHeights(spots.length, spots.map(spot => spot.d), count);
  let id = Math.max(...cards.map(item => item.id));
  // Lay level by level so ids stay ordered bottom-up like the rest of the pile.
  const tallest = Math.max(...heights);
  for (let level = 0; level < tallest; level++) {
    spots.forEach((spot, index) => {
      if (heights[index] <= level) return;
      const jitterX = Math.round((random() - .5) * 6);
      const jitterY = Math.round((random() - .5) * 6);
      cards.push(card(++id, Math.round(spot.x + level * MOUND_LIFT_X + jitterX), Math.round(spot.y + level * MOUND_LIFT_Y + jitterY),
        ENDLESS_BASE_LAYERS + level, 'pile'));
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
  const cards = main.map(item => ({...item}));
  addMound(cards, n, extraCards, random);
  const sideCount = target - cards.length;
  if (sideCount < 0) throw new Error('endless layout exceeds target');
  addSideFan(cards, sideCount);
  if (cards.length !== target) throw new Error('endless layout card count mismatch');
  return cards;
}

export interface EndlessTuning {
  readonly rushRate: number;
  readonly minGap: number;
  readonly maxOpenGroups: number;
  /** First generator attempt to try; picked offline so the shipped board hits its target rate. */
  readonly attempt: number;
}

/**
 * Calibrated with tools/sim-endless-curve.ts (400 runs, greedy look-ahead bot, every prop + one revive;
 * the comment on each row is the measured rate):
 * level 3 ≈ 20%, 4 ≈ 15%, 5 ≈ 12%, easing down to ≈ 5% around level 10 and never under 2% after.
 */
export const ENDLESS_TUNING: Readonly<Record<number, EndlessTuning>> = {
  3: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 6}, // 21.8%
  4: {rushRate: .8, minGap: 6, maxOpenGroups: 3, attempt: 1}, // 18.2%
  5: {rushRate: .5, minGap: 6, maxOpenGroups: 3, attempt: 2}, // 13.8%
  6: {rushRate: .7, minGap: 6, maxOpenGroups: 3, attempt: 1}, // 10.8%
  7: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 6}, // 10.2%
  8: {rushRate: .8, minGap: 6, maxOpenGroups: 3, attempt: 3}, // 6.5%
  9: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 2}, // 6.5%
  10: {rushRate: .7, minGap: 6, maxOpenGroups: 3, attempt: 2}, // 4.5%
  11: {rushRate: .7, minGap: 6, maxOpenGroups: 3, attempt: 1}, // 4.5%
  12: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 9}, // 4.0%
  13: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 0}, // 3.0%
  14: {rushRate: .9, minGap: 6, maxOpenGroups: 3, attempt: 5}, // 2.8%
  15: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 3}, // 3.0%
};
export const ENDLESS_TUNED_UNTIL = 15;

export function endlessTuning(n: number): EndlessTuning {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  return ENDLESS_TUNING[Math.min(n, ENDLESS_TUNED_UNTIL)];
}

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
    cards: assigned.cards,
    reservePositions: stackReservePositions(STACK_CARD_SIZE, STACK_CARD_SIZE, 12, STACK_SHELF_Y),
    momPositions: stackMomPositions(STACK_CARD_SIZE),
    solution: assigned.solution,
    slotCapacity: capacity,
    hideCovered: n >= 4,
  };
  return solveStackLevel(level, {maxNodes: 240_000}).solvable ? level : undefined;
}

/** Calibrated boards that later levels are re-skinned from. */
export const ENDLESS_REMIX_POOL = [13, 14, 15] as const;

/**
 * Past the calibrated range a level reuses one of the late calibrated boards with a new item set.
 * Geometry, solution and kind count are untouched (mirroring was tried and measurably changed the
 * bot win rate), so the rate stays on the measured ~3% floor instead of drifting under 2%.
 */
export function remixEndlessLevel(base: StackLevel, n: number): StackLevel {
  const offset = (n * 7) % ENDLESS_ITEMS.length;
  const items = base.items.map((_, index) => ENDLESS_ITEMS[(offset + index) % ENDLESS_ITEMS.length]);
  const byKey = new Map(base.items.map((item, index) => [item.key, items[index]]));
  const cards = base.cards.map(item => {
    const next = byKey.get(item.kind)!;
    return {...item, kind: next.key, name: next.name};
  });
  return {...base, stage: n, seed: `trunk-road-${n}`, items, cards};
}

export function generateEndlessLevel(n: number, maxAttempts = 8, tuning = endlessTuning(n)): StackLevel {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  if (n > ENDLESS_TUNED_UNTIL) {
    const source = ENDLESS_REMIX_POOL[(n - ENDLESS_TUNED_UNTIL - 1) % ENDLESS_REMIX_POOL.length];
    return remixEndlessLevel(generateEndlessLevel(source, maxAttempts), n);
  }
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
