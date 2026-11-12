import { createRng, shuffle } from '../rng';
import { stackItemByName, stackItems } from './stack-catalog';
import { freeCards } from './stack-rules';
import { STACK_CARD_SIZE } from './stack-layout';
import { solveStackLevel } from './stack-solver';
import { PACK_SIZE, SLOT_CAPACITY, slotCapacityOf } from './stack-constants';
import type { StackCard, StackItemDef, StackLevel, StackPoint } from './stack-types';

export const STACK_SEEDS = ['trunk-stack-stage1-v1', 'trunk-stack-stage2-v2a'] as const;
export const STAGE1_CARDS = 18;
export const STAGE2_CARDS = 150;
export const STAGE2_ITEM_COUNT = 12;

export interface GeneratedStackLevel {
  readonly level: StackLevel;
  readonly attempts: number;
}

export interface AssignTriplesOptions {
  readonly capacity?: number;
  /** Prefer this many picks between finishing one group and starting another of the same kind. */
  readonly minGap?: number;
  readonly maxOpenGroups?: number;
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
const GRID = 112;
const HALF = GRID / 2;
const GRID_X0 = Math.round((750 - (5 * GRID + STAGE2_CARD)) / 2);
const GRID_Y0 = 150;
/**
 * Rows sit 100 apart (cards are 108), slightly tighter than the 112 columns, so the 150-card
 * mound fits a 390×844 phone at full card size (≥56px) above the vehicle.
 */
export const STACK_ROW_STEP = 100;
/** Top of the two bottom side fans and of the side shelf for moved-out cards. */
export const STACK_SIDE_FAN_Y = GRID_Y0 + 6 * STACK_ROW_STEP + STAGE2_CARD + 76;
export const STACK_SHELF_Y = STACK_SIDE_FAN_Y - 70;
/**
 * Bottom-to-top layers of the hard mound. Odd layers sit half a card right and down, so every
 * card is pinned by up to four cards above; upper layers shrink towards the centre and the
 * base loses its top corners, giving a hill silhouette instead of a wall. The cap zig-zags six
 * reachable cards across the crown so the opening choices are broader without flattening the pile.
 */
const MAIN_LAYERS: readonly {cols: readonly [number, number]; rows: readonly [number, number]; half: boolean; wave?: number; skip?: readonly string[]}[] = [
  {cols: [0, 5], rows: [0, 6], half: false, skip: ['0,0', '5,0', '0,1', '5,1', '2,6', '3,6']},
  {cols: [0, 4], rows: [0, 5], half: true, skip: ['0,0', '4,0']},
  {cols: [1, 4], rows: [0, 6], half: false},
  {cols: [1, 3], rows: [0, 5], half: true},
  {cols: [2, 3], rows: [1, 5], half: false},
  {cols: [2, 2], rows: [0, 5], half: true, wave: 40},
];
const SIDE_STACKS = [
  {source: 'side-left', x: 36, y: STACK_SIDE_FAN_Y, count: 12, step: 13},
  {source: 'side-right', x: 606, y: STACK_SIDE_FAN_Y, count: 12, step: -13},
] as const;

export function layoutStageTwo(random: () => number): StackCard[] {
  const cards: StackCard[] = [];
  let id = 0;
  MAIN_LAYERS.forEach((layer, index) => {
    const offset = layer.half ? HALF : 0;
    for (let row = layer.rows[0]; row <= layer.rows[1]; row++) {
      const wave = layer.wave ? (row % 2 ? layer.wave : -layer.wave) : 0;
      for (let col = layer.cols[0]; col <= layer.cols[1]; col++) {
        if (layer.skip?.includes(`${col},${row}`)) continue;
        const jitterX = Math.round((random() - .5) * 4);
        const jitterY = Math.round((random() - .5) * 4);
        cards.push(pileCard(++id, GRID_X0 + offset + wave + col * GRID + jitterX, GRID_Y0 + offset * STACK_ROW_STEP / GRID + row * STACK_ROW_STEP + jitterY, STAGE2_CARD, STAGE2_CARD, index, 'pile'));
      }
    }
  });
  for (const stack of SIDE_STACKS) {
    for (let index = 0; index < stack.count; index++) {
      cards.push(pileCard(++id, stack.x + index * stack.step, stack.y, STAGE2_CARD, STAGE2_CARD, 20 + index, stack.source));
    }
  }
  return cards;
}

export function stackReservePositions(cardW: number, cardH: number, count: number, top = 936): StackPoint[] {
  const gap = 8, columns = 6;
  const reserveW = Math.round(cardW * .72);
  const total = columns * reserveW + (columns - 1) * gap;
  const start = Math.round((750 - total) / 2);
  return Array.from({length: count}, (_, index) => ({
    x: start + (index % columns) * (reserveW + gap),
    y: top + Math.floor(index / columns) * (Math.round(cardH * .72) + 8),
  }));
}

export function stackMomPositions(cardW: number): StackPoint[] {
  return [0, 1, 2].map(index => ({x: Math.round(375 - cardW * 1.5 + index * cardW), y: 290}));
}

function buildCards(stage: number, random: () => number): {cards: StackCard[]; items: readonly StackItemDef[]; w: number; h: number} {
  if (stage === 1) {
    return {cards: layoutStageOne(), items: stackItems(1), w: 136, h: 136};
  }
  if (stage === 2) {
    return {
      cards: layoutStageTwo(random),
      items: stackItems(2).slice(0, STAGE2_ITEM_COUNT),
      w: STAGE2_CARD,
      h: STAGE2_CARD,
    };
  }
  throw new Error(`unknown stack stage ${stage}`);
}

function plannedGroupKinds(
  groupCount: number,
  items: readonly StackItemDef[],
  random: () => number,
): StackItemDef[] | undefined {
  if (!items.length || groupCount < items.length) return undefined;
  const groups = [...items];
  for (let index = items.length; index < groupCount; index++) {
    groups.push(items[Math.floor(random() * items.length)]);
  }
  return shuffle(groups, random);
}

/**
 * Assigns kinds to a legal click order. A small set of unfinished groups keeps the certificate's
 * slot occupancy around 3–5 cards instead of clearing each triple immediately. Cards of one kind
 * are deliberately separated by other picks, while open groups always have distinct kinds so the
 * recorded order can never auto-pack more than one group at a time.
 */
export function assignTriples(
  cards: StackCard[],
  items: readonly StackItemDef[],
  random: () => number,
  capacityOrOptions: number | AssignTriplesOptions = SLOT_CAPACITY,
): {cards: StackCard[]; solution: number[]} | undefined {
  const options = typeof capacityOrOptions === 'number'
    ? {capacity: capacityOrOptions}
    : capacityOrOptions;
  const capacity = slotCapacityOf({slotCapacity: options.capacity ?? SLOT_CAPACITY});
  const minGap = options.minGap ?? 7;
  const maxOpenGroups = options.maxOpenGroups ?? 3;
  if (!Number.isInteger(minGap) || minGap < 0) throw new Error('invalid stack triple gap');
  if (!Number.isInteger(maxOpenGroups) || maxOpenGroups < 1) throw new Error('invalid stack in-flight groups');
  if (cards.length % PACK_SIZE !== 0) return undefined;
  const planned = plannedGroupKinds(cards.length / PACK_SIZE, items, random);
  if (!planned) return undefined;
  const remaining = new Map<string, number>();
  for (const item of planned) remaining.set(item.key, (remaining.get(item.key) ?? 0) + 1);
  const itemByKey = new Map(items.map(item => [item.key, item]));
  const lastPick = new Map<string, number>();
  let active = [...cards];
  const solution: number[] = [];
  const open: {item: StackItemDef; picks: number}[] = [];
  let pending = 0;

  const pickOpen = (wanted: number): {item: StackItemDef; picks: number} | undefined => {
    const matches = open.filter(group => group.picks === wanted);
    if (!matches.length) return undefined;
    return matches[Math.floor(random() * matches.length)];
  };
  const canStart = (index: number): boolean => {
    if (open.length >= maxOpenGroups) return false;
    const openKeys = new Set(open.map(group => group.item.key));
    return [...remaining.entries()].some(([key, count]) => count > 0 && !openKeys.has(key)
      && (lastPick.get(key) === undefined || index - lastPick.get(key)! >= minGap));
  };
  const startGroup = (index: number): {item: StackItemDef; picks: number} | undefined => {
    if (open.length >= maxOpenGroups) return undefined;
    const openKeys = new Set(open.map(group => group.item.key));
    const available = [...remaining.entries()]
      .filter(([key, count]) => count > 0 && !openKeys.has(key) && itemByKey.has(key));
    const spaced = available.filter(([key]) => lastPick.get(key) === undefined || index - lastPick.get(key)! >= minGap);
    const pool = spaced.length ? spaced : available;
    if (!pool.length) return undefined;
    const [key] = pool[Math.floor(random() * pool.length)];
    remaining.set(key, (remaining.get(key) ?? 0) - 1);
    const group = {item: itemByKey.get(key)!, picks: 0};
    open.push(group);
    return group;
  };
  const continueGroup = (group: {item: StackItemDef; picks: number}): void => {
    group.picks++;
    pending++;
  };
  const completeGroup = (group: {item: StackItemDef; picks: number}): void => {
    group.picks++;
    pending -= PACK_SIZE - 1;
    open.splice(open.indexOf(group), 1);
  };

  for (let index = 0; index < cards.length; index++) {
    const available = freeCards(active);
    if (!available.length) return undefined;
    let group: {item: StackItemDef; picks: number} | undefined;
    const pair = pickOpen(2);
    const single = pickOpen(1);
    if (pending >= 5) {
      if (!pair) return undefined;
      group = pair;
    } else if (pending <= 2) {
      group = startGroup(index) ?? single ?? pair;
    } else if (pending === 3) {
      group = single ?? startGroup(index) ?? pair;
    } else {
      group = canStart(index) ? startGroup(index) : pair;
      group ??= single;
    }
    if (!group) return undefined;
    if (group.picks === 2) completeGroup(group);
    else continueGroup(group);
    if (pending > capacity) return undefined;
    const card = available[Math.floor(random() * available.length)];
    card.kind = group.item.key;
    card.name = group.item.name;
    lastPick.set(group.item.key, index);
    solution.push(card.id);
    active = active.filter(candidate => candidate.id !== card.id);
  }
  if (active.length || pending !== 0 || open.length) return undefined;
  return {cards, solution};
}

function attemptLevel(stage: number, baseSeed: string, attempt: number): {level: StackLevel; solvable: boolean} {
  const seed = attempt === 0 ? baseSeed : `${baseSeed}#retry-${attempt}`;
  const random = createRng(seed);
  const built = buildCards(stage, random);
  const capacity = SLOT_CAPACITY;
  const assigned = assignTriples(built.cards, built.items, random, {
    capacity,
    minGap: stage === 2 ? 5 : 4,
    maxOpenGroups: stage === 2 ? 2 : 2,
  });
  if (!assigned) throw new Error('layout could not be assigned');
  const level: StackLevel = {
    stage,
    seed,
    cardW: built.w,
    cardH: built.h,
    items: built.items,
    cards: assigned.cards,
    reservePositions: stackReservePositions(built.w, built.h, 12, stage === 2 ? STACK_SHELF_Y : 936),
    momPositions: stackMomPositions(built.w),
    solution: assigned.solution,
    slotCapacity: capacity,
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
