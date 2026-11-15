import { createRng } from '../rng';
import { freeCards, StackGame } from './stack-rules';
import type { StackCard, StackLevel, StackStatus } from './stack-types';

export type StackSimStrategy = 'random' | 'greedy' | 'greedy-lookahead';
export type StackItemMode = 'none' | 'all' | 'all-revive';

export interface StackSimulationOptions {
  readonly strategy: StackSimStrategy;
  readonly itemMode?: StackItemMode;
  /** Prefix for the deterministic per-run RNG seed. */
  readonly seed?: string;
  readonly maxClicks?: number;
  readonly clickIntervalMs?: number;
}

export interface StackItemsUsed {
  readonly moveOut: boolean;
  readonly undo: boolean;
  readonly shuffle: boolean;
  readonly revive: boolean;
}

export interface StackRunResult {
  readonly won: boolean;
  readonly status: 'won' | 'lost' | 'playing';
  readonly remaining: number;
  readonly clicks: number;
  readonly groupsCleared: number;
  readonly momEvents: number;
  readonly itemsUsed: StackItemsUsed;
}

export interface StackBatchResult extends Omit<StackRunResult, 'won' | 'status' | 'remaining' | 'clicks' | 'groupsCleared' | 'momEvents' | 'itemsUsed'> {
  readonly runs: number;
  readonly wins: number;
  readonly winRate: number;
  readonly averageRemaining: number;
  readonly averageClicks: number;
  readonly averageGroupsCleared: number;
  readonly averageMomEvents: number;
  readonly itemUseRate: Readonly<Record<keyof StackItemsUsed, number>>;
}

export const DEFAULT_SIM_CLICKS = 2_000;
export const DEFAULT_CLICK_INTERVAL_MS = 1_800;

function slotCounts(game: StackGame): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of game.slot) counts.set(card.kind, (counts.get(card.kind) ?? 0) + 1);
  return counts;
}

function visibleKindCounts(cards: readonly StackCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.kind, (counts.get(card.kind) ?? 0) + 1);
  return counts;
}

function randomFrom<T>(values: readonly T[], random: () => number): T {
  const raw = random();
  const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
  return values[Math.floor(value * values.length)];
}

function pickBest<T>(scored: readonly {value: T; score: number}[], random: () => number): T | undefined {
  if (!scored.length) return undefined;
  const best = Math.max(...scored.map(entry => entry.score));
  return randomFrom(scored.filter(entry => entry.score === best), random).value;
}

interface ExposureScore {
  readonly newlyFree: number;
  readonly matchingSlot: number;
  readonly matchingKind: number;
}

function exposureScore(card: StackCard, cards: readonly StackCard[], slot: Map<string, number>): ExposureScore {
  let newlyFree = 0;
  let matchingSlot = 0;
  let matchingKind = 0;
  for (const below of cards) {
    if (below.id === card.id || below.layer >= card.layer) continue;
    if (!(card.x < below.x + below.w && card.x + card.w > below.x
      && card.y < below.y + below.h && card.y + card.h > below.y)) continue;
    const stillCovered = cards.some(other => other.id !== card.id && other.id !== below.id
      && other.layer > below.layer
      && other.x < below.x + below.w && other.x + other.w > below.x
      && other.y < below.y + below.h && other.y + other.h > below.y);
    if (stillCovered) continue;
    newlyFree++;
    // A covered carton hides its kind; dimmed faces are readable like on the real board.
    if (below.carton) continue;
    if ((slot.get(below.kind) ?? 0) > 0) matchingSlot++;
    if (below.kind === card.kind) matchingKind++;
  }
  return {newlyFree, matchingSlot, matchingKind};
}

function chooseCard(
  game: StackGame,
  strategy: StackSimStrategy,
  random: () => number,
  banned?: number,
): StackCard | undefined {
  let candidates = freeCards(game.cards);
  if (!candidates.length) return undefined;
  if (banned !== undefined && candidates.length > 1) {
    candidates = candidates.filter(card => card.id !== banned);
  }
  if (strategy === 'random') return randomFrom(candidates, random);
  const slot = slotCounts(game);
  const visible = visibleKindCounts(candidates);
  if (strategy === 'greedy') {
    return pickBest(candidates.map(card => {
      const inSlot = slot.get(card.kind) ?? 0;
      const priority = inSlot >= 2 ? 2 : inSlot === 1 ? 1 : 0;
      return {value: card, score: priority * 10_000 + (visible.get(card.kind) ?? 0)};
    }), random);
  }
  const capacity = game.slotCapacity;
  return pickBest(candidates.map(card => {
    const inSlot = slot.get(card.kind) ?? 0;
    const pack = inSlot >= 2;
    const exposure = exposureScore(card, game.cards, slot);
    const nextSlotSize = pack ? Math.max(0, game.slot.length - 2) : game.slot.length + 1;
    const pressure = nextSlotSize >= capacity - 1 ? 30_000 : nextSlotSize >= capacity - 2 ? 8_000 : 0;
    return {
      value: card,
      score: (pack ? 1_000_000 : inSlot === 1 ? 180_000 : 0)
        + (visible.get(card.kind) ?? 0) * 4_000
        + exposure.newlyFree * 2_000
        + exposure.matchingSlot * 6_000
        + exposure.matchingKind * 3_000
        - pressure,
    };
  }), random);
}

function packAvailable(slot: Map<string, number>, candidates: readonly StackCard[]): boolean {
  return candidates.some(card => (slot.get(card.kind) ?? 0) >= 2);
}

/** Whether at least two copies of some kind can still be brought together. */
function hasPairPotential(slot: Map<string, number>, candidates: readonly StackCard[]): boolean {
  if ([...slot.values()].some(count => count >= 2)) return true;
  const visible = visibleKindCounts(candidates);
  if ([...visible.values()].some(count => count >= 2)) return true;
  return candidates.some(card => (slot.get(card.kind) ?? 0) === 1);
}

function summarize(results: readonly StackRunResult[]): StackBatchResult {
  const runs = results.length;
  const wins = results.filter(result => result.won).length;
  const total = (value: (result: StackRunResult) => number) => results.reduce((sum, result) => sum + value(result), 0);
  const rate = (value: (result: StackRunResult) => boolean) => runs ? total(result => value(result) ? 1 : 0) / runs : 0;
  return {
    runs,
    wins,
    winRate: runs ? wins / runs : 0,
    averageRemaining: runs ? total(result => result.remaining) / runs : 0,
    averageClicks: runs ? total(result => result.clicks) / runs : 0,
    averageGroupsCleared: runs ? total(result => result.groupsCleared) / runs : 0,
    averageMomEvents: runs ? total(result => result.momEvents) / runs : 0,
    itemUseRate: {
      moveOut: rate(result => result.itemsUsed.moveOut),
      undo: rate(result => result.itemsUsed.undo),
      shuffle: rate(result => result.itemsUsed.shuffle),
      revive: rate(result => result.itemsUsed.revive),
    },
  };
}

/**
 * Plays one deterministic run. The player only sees currently free cards; covered cards are
 * considered only by the lookahead strategy after a candidate tap would reveal them.
 */
export function simulateStackRun(
  level: StackLevel,
  options: StackSimulationOptions,
  runIndex = 0,
): StackRunResult {
  const clickIntervalMs = options.clickIntervalMs ?? DEFAULT_CLICK_INTERVAL_MS;
  if (!Number.isFinite(clickIntervalMs) || clickIntervalMs <= 0) throw new Error('invalid stack click interval');
  const maxClicks = options.maxClicks ?? DEFAULT_SIM_CLICKS;
  if (!Number.isInteger(maxClicks) || maxClicks < 1) throw new Error('invalid stack click limit');
  const itemMode = options.itemMode ?? 'none';
  const seed = `${options.seed ?? level.seed}|${options.strategy}|${itemMode}|${runIndex}`;
  const random = createRng(seed);
  const game = new StackGame(level, random, 0);
  const used: {moveOut: boolean; undo: boolean; shuffle: boolean; revive: boolean} = {
    moveOut: false, undo: false, shuffle: false, revive: false,
  };
  let clicks = 0;
  let now = 0;
  let lastTap: number | undefined;
  let bannedAfterUndo: number | undefined;

  while (game.status === 'playing' && clicks < maxClicks) {
    let candidates = freeCards(game.cards);
    if (!candidates.length) break;
    const slot = slotCounts(game);
    if (itemMode !== 'none') {
      const imminentLoss = game.slot.length >= game.slotCapacity - 1 && !packAvailable(slot, candidates);
      if (!used.undo && game.props.undo === false && imminentLoss && game.useUndo()) {
        used.undo = true;
        bannedAfterUndo = lastTap;
        lastTap = undefined;
        continue;
      }
      candidates = freeCards(game.cards);
      const refreshedSlot = slotCounts(game);
      if (!used.moveOut && !game.props.moveOut && game.slot.length >= 5
        && !hasPairPotential(refreshedSlot, candidates) && game.useMoveOut().length > 0) {
        used.moveOut = true;
        continue;
      }
      if (!used.shuffle && !game.props.shuffle && !packAvailable(refreshedSlot, candidates)
        && !hasPairPotential(refreshedSlot, candidates) && game.useShuffle()) {
        used.shuffle = true;
        candidates = freeCards(game.cards);
      }
    }
    const card = chooseCard(game, options.strategy, random, bannedAfterUndo);
    bannedAfterUndo = undefined;
    if (!card) break;
    now += clickIntervalMs;
    const result = game.tap(card.id, now);
    if (!result.ok) break;
    lastTap = card.id;
    clicks++;
    game.tickMom(now);
    const statusAfterTap = game.status as StackStatus;
    if (statusAfterTap === 'lost' && itemMode === 'all-revive' && !used.revive && game.canRevive) {
      if (game.revive().length > 0) used.revive = true;
    }
  }

  return {
    won: game.status === 'won',
    status: game.status,
    remaining: game.remaining,
    clicks,
    groupsCleared: game.clearedGroups,
    momEvents: game.momEventCount,
    itemsUsed: used,
  };
}

export function simulateStackBatch(
  level: StackLevel,
  options: StackSimulationOptions,
  runs = 1_000,
): StackBatchResult {
  if (!Number.isInteger(runs) || runs < 1) throw new Error('invalid stack simulation run count');
  const results: StackRunResult[] = [];
  for (let index = 0; index < runs; index++) results.push(simulateStackRun(level, options, index));
  return summarize(results);
}

/** Exposed for tools/tests that need to inspect the exact card set a player may tap. */
export function visibleStackCards(game: StackGame): StackCard[] {
  return freeCards(game.cards);
}
