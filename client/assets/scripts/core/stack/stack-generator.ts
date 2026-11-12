import { createRng, shuffle } from '../rng';
import { stackItemByName, stackItems } from './stack-catalog';
import { freeCards } from './stack-rules';
import { STACK_CARD_SIZE } from './stack-layout';
import { solveStackLevel } from './stack-solver';
import type { StackCard, StackItemDef, StackLevel, StackPoint } from './stack-types';

export const STACK_SEEDS = ['trunk-stack-stage1-v1', 'trunk-stack-stage2-v1'] as const;
export const STAGE1_CARDS = 18;
export const STAGE2_CARDS = 78;

export interface GeneratedStackLevel {
  readonly level: StackLevel;
  readonly attempts: number;
}

function pileCard(
  id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  layer: number,
  source: StackCard['source'],
): StackCard {
  return {id, kind: '', name: '', x, y, w, h, layer, source};
}

function layoutStageOne(): StackCard[] {
  const cards: StackCard[] = [];
  let id = 0;
  const w = 136, h = 136;
  const rows = [
    {y: 240, layer: 0, xs: [205, 365]},
    {y: 315, layer: 1, xs: [140, 305, 470]},
    {y: 395, layer: 0, xs: [125, 300, 475]},
    {y: 470, layer: 1, xs: [205, 382]},
    {y: 550, layer: 0, xs: [195, 375]},
    {y: 625, layer: 1, xs: [115, 465]},
    {y: 705, layer: 0, xs: [120, 465]},
    {y: 780, layer: 1, xs: [185, 395]},
  ] as const;
  for (const row of rows) {
    for (const x of row.xs) cards.push(pileCard(++id, x, row.y, w, h, row.layer, 'pile'));
  }
  return cards;
}

const STAGE2_CARD = STACK_CARD_SIZE;
/** Top-to-bottom rows of a wide pyramid: each level loses one column and half a card. */
const MAIN_LAYERS = [
  {columns: 1, rows: 1},
  {columns: 2, rows: 1},
  {columns: 3, rows: 2},
  {columns: 4, rows: 2},
  {columns: 5, rows: 3},
  {columns: 6, rows: 5},
] as const;
const MAIN_STEP_X = 114;
const MAIN_STEP_Y = 55;
const MAIN_TOP_Y = 142;
const SIDE_STACKS = [
  {source: 'side-left', x: 36, y: 1006, count: 8, step: 12},
  {source: 'side-right', x: 606, y: 1006, count: 8, step: -12},
] as const;

function layoutStageTwo(random: () => number): StackCard[] {
  const cards: StackCard[] = [];
  let id = 0;
  let rowCursor = 0;
  for (let layer = 0; layer < MAIN_LAYERS.length; layer++) {
    const {columns, rows} = MAIN_LAYERS[layer];
    const layerY = MAIN_TOP_Y + (layer % 2 === 1 ? Math.round(MAIN_STEP_Y / 2) : 0);
    const rowWidth = (columns - 1) * MAIN_STEP_X + STAGE2_CARD;
    const startX = Math.round((750 - rowWidth) / 2);
    for (let row = 0; row < rows; row++) {
      const jitterY = Math.round((random() - .5) * 4);
      const y = Math.round(layerY + rowCursor * MAIN_STEP_Y + jitterY);
      for (let column = 0; column < columns; column++) {
        const jitterX = Math.round((random() - .5) * 4);
        const x = startX + column * MAIN_STEP_X + jitterX;
        cards.push(pileCard(++id, x, y, STAGE2_CARD, STAGE2_CARD, layer, 'pile'));
      }
      rowCursor++;
    }
  }
  const sideSize = STAGE2_CARD;
  for (const stack of SIDE_STACKS) {
    for (let index = 0; index < stack.count; index++) {
      const x = stack.x + index * stack.step;
      cards.push(pileCard(++id, x, stack.y, sideSize, sideSize, 20 + index, stack.source));
    }
  }
  return cards;
}

function reservePositions(cardW: number, cardH: number, count: number): StackPoint[] {
  const gap = 8, columns = 6;
  const reserveW = Math.round(cardW * .72);
  const total = columns * reserveW + (columns - 1) * gap;
  const start = Math.round((750 - total) / 2);
  return Array.from({length: count}, (_, index) => ({
    x: start + (index % columns) * (reserveW + gap),
    y: 936 + Math.floor(index / columns) * (Math.round(cardH * .72) + 8),
  }));
}

function momPositions(cardW: number): StackPoint[] {
  return [0, 1, 2].map(index => ({x: Math.round(375 - cardW * 1.5 + index * cardW), y: 290}));
}

function buildCards(stage: number, random: () => number): {cards: StackCard[]; items: readonly StackItemDef[]; w: number; h: number} {
  if (stage === 1) {
    return {cards: layoutStageOne(), items: stackItems(1), w: 136, h: 136};
  }
  if (stage === 2) {
    return {cards: layoutStageTwo(random), items: stackItems(2), w: STAGE2_CARD, h: STAGE2_CARD};
  }
  throw new Error(`unknown stack stage ${stage}`);
}

/**
 * Assigns kinds to a generated legal click order. Each round removes three currently reachable
 * cards, so replaying the recorded ids always clears a triple without filling the seven slots.
 */
function assignTriples(
  cards: StackCard[],
  items: readonly StackItemDef[],
  random: () => number,
): {cards: StackCard[]; solution: number[]} | undefined {
  let active = [...cards];
  const solution: number[] = [];
  const firstCycle = shuffle(items, random);
  const totalGroups = cards.length / 3;
  for (let group = 0; group < totalGroups; group++) {
    const picks: StackCard[] = [];
    for (let slot = 0; slot < 3; slot++) {
      const available = freeCards(active);
      if (available.length === 0) return undefined;
      const pick = available[Math.floor(random() * available.length)];
      picks.push(pick);
      active = active.filter(card => card.id !== pick.id);
    }
    const item = group < firstCycle.length
      ? firstCycle[group]
      : items[Math.floor(random() * items.length)];
    for (const pick of picks) {
      pick.kind = item.key;
      pick.name = item.name;
      solution.push(pick.id);
    }
  }
  return active.length === 0 ? {cards, solution} : undefined;
}

function attemptLevel(stage: number, baseSeed: string, attempt: number): {level: StackLevel; solvable: boolean} {
  const seed = attempt === 0 ? baseSeed : `${baseSeed}#retry-${attempt}`;
  const random = createRng(seed);
  const built = buildCards(stage, random);
  const assigned = assignTriples(built.cards, built.items, random);
  if (!assigned) throw new Error('layout could not be assigned');
  const level: StackLevel = {
    stage,
    seed,
    cardW: built.w,
    cardH: built.h,
    items: built.items,
    cards: assigned.cards,
    reservePositions: reservePositions(built.w, built.h, 12),
    momPositions: momPositions(built.w),
    solution: assigned.solution,
  };
  return {level, solvable: solveStackLevel(level, {maxNodes: 120_000}).solvable};
}

export function generateStackLevel(stage: number, baseSeed?: string, maxAttempts = 8): GeneratedStackLevel {
  if (stage !== 1 && stage !== 2) throw new Error(`unknown stack stage ${stage}`);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('invalid stack generator attempts');
  const seedBase = baseSeed ?? STACK_SEEDS[stage - 1];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const built = attemptLevel(stage, seedBase, attempt);
    if (built.solvable) return {level: built.level, attempts: attempt + 1};
  }
  throw new Error(`no solvable stack seed after ${maxAttempts} attempts`);
}

export function stackItemFor(level: StackLevel, key: string): StackItemDef {
  return stackItemByName(level.items, key);
}
