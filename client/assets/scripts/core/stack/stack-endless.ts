import { createRng } from '../rng';
import { ENDLESS_ITEMS } from './stack-catalog';
import { assignTriples, layoutStageTwo, stackMomPositions, stackReservePositions } from './stack-generator';
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

function addExtraLayer(cards: StackCard[], index: number, random: () => number): void {
  const layer = ENDLESS_BASE_LAYERS + index;
  const half = index % 2 === 1 ? 56 : 0;
  const wave = (index % 3 - 1) * 18;
  const idBase = Math.max(...cards.map(item => item.id));
  let id = idBase;
  for (let row = 1; row <= 5; row++) {
    for (let col = 1; col <= 4; col++) {
      const jitterX = Math.round((random() - .5) * 4);
      const jitterY = Math.round((random() - .5) * 4);
      cards.push(card(++id, 92 + half + wave + col * 112 + jitterX, 150 + half + row * 112 + jitterY, layer, 'pile'));
    }
  }
}

function addSideFan(cards: StackCard[], count: number): void {
  const left = Math.ceil(count / 2);
  const right = count - left;
  let id = Math.max(...cards.map(item => item.id));
  for (let index = 0; index < left; index++) {
    cards.push(card(++id, 36 + index * 13, 1006, 40 + index, 'side-left'));
  }
  for (let index = 0; index < right; index++) {
    cards.push(card(++id, 606 - index * 13, 1006, 40 + index, 'side-right'));
  }
}

/**
 * A compact endless mound. The base reuses the approved stage-two footprint; later stages add
 * stacked inner layers and grow the two side fans instead of widening the board.
 */
export function layoutEndless(n: number, random: () => number): StackCard[] {
  const target = endlessCardCount(n);
  const extraLayers = Math.max(0, Math.min(5, n - ENDLESS_MIN_STAGE));
  const main = layoutStageTwo(random).filter(item => item.source === 'pile');
  const cards = main.map(item => ({...item}));
  for (let index = 0; index < extraLayers; index++) addExtraLayer(cards, index, random);
  const sideCount = target - cards.length;
  if (sideCount < 0) throw new Error('endless layout exceeds target');
  addSideFan(cards, sideCount);
  if (cards.length !== target) throw new Error('endless layout card count mismatch');
  return cards;
}

function attemptEndless(n: number, baseSeed: string, attempt: number): StackLevel | undefined {
  const seed = attempt === 0 ? baseSeed : `${baseSeed}#retry-${attempt}`;
  const random = createRng(seed);
  const cards = layoutEndless(n, random);
  const items = ENDLESS_ITEMS.slice(0, endlessKindCount(n));
  const capacity = capacityForLevel(n);
  const assigned = assignTriples(cards, items, random, {
    capacity,
    minGap: n === 3 ? 3 : n === 4 ? 5 : n === 5 ? 4 : n === 6 ? 20 : n === 7 ? 10 : 15,
    maxOpenGroups: n === 3 ? 1 : n === 4 ? 3 : n === 5 ? 2 : n === 6 ? 3 : n === 7 ? 4 : 3,
  });
  if (!assigned) return undefined;
  const level: StackLevel = {
    stage: n,
    seed,
    cardW: STACK_CARD_SIZE,
    cardH: STACK_CARD_SIZE,
    items,
    cards: assigned.cards,
    reservePositions: stackReservePositions(STACK_CARD_SIZE, STACK_CARD_SIZE, 12),
    momPositions: stackMomPositions(STACK_CARD_SIZE),
    solution: assigned.solution,
    slotCapacity: capacity,
    hideCovered: n >= 4,
  };
  return solveStackLevel(level, {maxNodes: 240_000}).solvable ? level : undefined;
}

export function generateEndlessLevel(n: number, maxAttempts = 8): StackLevel {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('invalid endless generator attempts');
  const seed = `trunk-road-${n}`;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const level = attemptEndless(n, seed, attempt);
    if (level) return level;
  }
  throw new Error(`no solvable endless stack seed after ${maxAttempts} attempts`);
}

export function endlessSeedFor(n: number): string {
  if (!Number.isInteger(n) || n < ENDLESS_MIN_STAGE) throw new Error('invalid endless level');
  return `trunk-road-${n}`;
}
