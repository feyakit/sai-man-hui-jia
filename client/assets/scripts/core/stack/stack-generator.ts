import { createRng, shuffle } from '../rng';
import { stackItemByName, stackItems } from './stack-catalog';
import { freeCards } from './stack-rules';
import { solveStackLevel } from './stack-solver';
import type { StackCard, StackItemDef, StackLevel, StackPoint } from './stack-types';

export const STACK_SEEDS = ['trunk-stack-stage1-v1', 'trunk-stack-stage2-v1'] as const;
export const STAGE1_CARDS = 18;
export const STAGE2_CARDS = 150;

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
  const w = 92, h = 92;
  for (let i = 0; i < 5; i++) cards.push(pileCard(++id, 120 + i * 124, 202, w, h, 0, 'pile'));
  for (let i = 0; i < 4; i++) cards.push(pileCard(++id, 182 + i * 124, 304, w, h, 0, 'pile'));
  for (let i = 0; i < 5; i++) cards.push(pileCard(++id, 158 + i * 124, 251, w, h, 1, 'pile'));
  for (let i = 0; i < 4; i++) cards.push(pileCard(++id, 220 + i * 124, 353, w, h, 1, 'pile'));
  return cards;
}

function layoutStageTwo(random: () => number): StackCard[] {
  const cards: StackCard[] = [];
  let id = 0;
  const w = 82, h = 82;
  const counts = [17, 17, 17, 17, 17, 17, 18, 18];
  for (let layer = 0; layer < counts.length; layer++) {
    const slots = Array.from({length: 18}, (_, index) => index);
    for (const index of shuffle(slots, random).slice(0, counts[layer])) {
      const col = index % 6, row = Math.floor(index / 6);
      const x = Math.round(132 + col * 82 + (random() - .5) * 52);
      const y = Math.round(176 + row * 82 + (random() - .5) * 40);
      cards.push(pileCard(++id, x, y, w, h, layer, 'pile'));
    }
  }
  for (let i = 0; i < 6; i++) cards.push(pileCard(++id, 8, 270, w, h, 20 + i, 'side-left'));
  for (let i = 0; i < 6; i++) cards.push(pileCard(++id, 660, 270, w, h, 20 + i, 'side-right'));
  return cards;
}

function reservePositions(cardW: number, cardH: number, count: number): StackPoint[] {
  const gap = 8, columns = 6;
  const total = columns * cardW + (columns - 1) * gap;
  const start = Math.round((750 - total) / 2);
  return Array.from({length: count}, (_, index) => ({
    x: start + (index % columns) * (cardW + gap),
    y: 492 + Math.floor(index / columns) * (cardH + 10),
  }));
}

function momPositions(cardW: number): StackPoint[] {
  return [0, 1, 2].map(index => ({x: Math.round(375 - cardW * 1.5 - 8 + index * (cardW + 8)), y: 148}));
}

function buildCards(stage: number, random: () => number): {cards: StackCard[]; items: readonly StackItemDef[]; w: number; h: number} {
  if (stage === 1) {
    return {cards: layoutStageOne(), items: stackItems(1), w: 92, h: 92};
  }
  if (stage === 2) {
    return {cards: layoutStageTwo(random), items: stackItems(2), w: 82, h: 82};
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
