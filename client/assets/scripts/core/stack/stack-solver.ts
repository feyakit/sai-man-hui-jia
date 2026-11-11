import { freeCards, isBlocked, PACK_SIZE, SLOT_CAPACITY, slotInsertIndex } from './stack-rules';
import type { StackCard, StackLevel, StackSolveResult } from './stack-types';

export interface StackSolveOptions {
  readonly maxNodes?: number;
}

function insertAndClear(slot: string[], kind: string): boolean {
  const index = slotInsertIndexKinds(slot, kind);
  slot.splice(index, 0, kind);
  let packed = false;
  if (slot.filter(value => value === kind).length >= PACK_SIZE) {
    let removed = 0;
    for (let i = slot.length - 1; i >= 0 && removed < PACK_SIZE; i--) {
      if (slot[i] === kind) { slot.splice(i, 1); removed++; }
    }
    packed = true;
  }
  return packed;
}

function slotInsertIndexKinds(slot: readonly string[], kind: string): number {
  let index = slot.length;
  for (let i = slot.length - 1; i >= 0; i--) {
    if (slot[i] === kind) { index = i + 1; break; }
  }
  return index;
}

export function simulateStackPicks(
  level: StackLevel,
  picks: readonly number[],
  maxClicks = picks.length,
): {valid: boolean; used: number} {
  const cards = level.cards.map(card => ({...card}));
  const active = new Map(cards.map(card => [card.id, card]));
  const slot: string[] = [];
  for (let index = 0; index < picks.length && index < maxClicks; index++) {
    const card = active.get(picks[index]);
    if (!card) return {valid: false, used: index};
    const current = [...active.values()];
    if (isBlocked(card, current)) return {valid: false, used: index};
    active.delete(card.id);
    insertAndClear(slot, card.kind);
    if (slot.length >= SLOT_CAPACITY) return {valid: false, used: index + 1};
  }
  return {valid: active.size === 0 && slot.length === 0, used: Math.min(picks.length, maxClicks)};
}

interface SearchState {
  readonly active: boolean[];
  readonly slot: string[];
  readonly picks: number[];
}

export function solveStackLevel(level: StackLevel, options: StackSolveOptions = {}): StackSolveResult {
  const maxNodes = options.maxNodes ?? 120_000;
  if (level.solution.length > 0) {
    const certificate = simulateStackPicks(level, level.solution);
    if (certificate.valid) {
      return {solvable: true, picks: [...level.solution], nodes: level.solution.length, limited: false, method: 'certificate'};
    }
  }
  if (!Number.isInteger(maxNodes) || maxNodes < 1) throw new Error('invalid stack solver node limit');
  const active = level.cards.map(() => true);
  const seen = new Set<string>();
  let nodes = 0;
  let limited = false;
  const start: SearchState = {active, slot: [], picks: []};

  const search = (state: SearchState): number[] | undefined => {
    if (nodes >= maxNodes) { limited = true; return undefined; }
    nodes++;
    if (!state.active.some(Boolean)) return state.slot.length === 0 ? [...state.picks] : undefined;
    const key = `${state.active.map(value => value ? '1' : '0').join('')}|${state.slot.join(',')}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    const cards = level.cards.filter((_, index) => state.active[index]);
    const reachable = freeCards(cards);
    const byKind = new Map<string, StackCard[]>();
    for (const card of reachable) byKind.set(card.kind, [...(byKind.get(card.kind) ?? []), card]);

    const compound = [...byKind.entries()]
      .filter(([kind, cardsOfKind]) => cardsOfKind.length >= PACK_SIZE && !state.slot.includes(kind) && state.slot.length <= SLOT_CAPACITY - PACK_SIZE)
      .sort((a, b) => b[1].length - a[1].length);
    for (const [, cardsOfKind] of compound) {
      const picks = cardsOfKind.slice(0, PACK_SIZE).map(card => card.id);
      const nextActive = [...state.active];
      for (const card of cardsOfKind.slice(0, PACK_SIZE)) {
        const index = level.cards.findIndex(candidate => candidate.id === card.id);
        nextActive[index] = false;
      }
      const nextSlot = [...state.slot];
      for (let i = 0; i < PACK_SIZE; i++) insertAndClear(nextSlot, cardsOfKind[0].kind);
      const answer = search({active: nextActive, slot: nextSlot, picks: [...state.picks, ...picks]});
      if (answer) return answer;
      if (limited) return undefined;
    }

    const singles = [...reachable].sort((a, b) => {
      const aPair = state.slot.filter(kind => kind === a.kind).length;
      const bPair = state.slot.filter(kind => kind === b.kind).length;
      return bPair - aPair || (byKind.get(b.kind)?.length ?? 0) - (byKind.get(a.kind)?.length ?? 0);
    });
    for (const card of singles) {
      if (state.slot.length >= SLOT_CAPACITY && state.slot.filter(kind => kind === card.kind).length < 2) continue;
      const nextActive = [...state.active];
      const index = level.cards.findIndex(candidate => candidate.id === card.id);
      nextActive[index] = false;
      const nextSlot = [...state.slot];
      insertAndClear(nextSlot, card.kind);
      if (nextSlot.length >= SLOT_CAPACITY) continue;
      const answer = search({active: nextActive, slot: nextSlot, picks: [...state.picks, card.id]});
      if (answer) return answer;
      if (limited) return undefined;
    }
    return undefined;
  };

  const picks = search(start);
  return {
    solvable: !!picks,
    picks: picks ?? [],
    nodes,
    limited,
    method: picks ? 'search' : 'none',
  };
}
