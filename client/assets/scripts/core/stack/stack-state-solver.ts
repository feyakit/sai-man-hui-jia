import { PACK_SIZE, SLOT_CAPACITY } from './stack-constants';
import type { StackCard } from './stack-types';

export interface StackSolveOptions {
  readonly maxNodes?: number;
}

export interface StackStateSolveResult {
  readonly solvable: boolean;
  readonly picks: number[];
  readonly nodes: number;
  readonly limited: boolean;
}

/**
 * Depth-first search from a live game state (cards still on the board plus the kinds already in
 * the slot). Blocking is precomputed once; every step only updates blocker counts, so a few
 * thousand nodes stay cheap enough to run on the main thread when mom inserts goods.
 */
export function solveStackState(
  cards: readonly StackCard[],
  slotKinds: readonly string[],
  options: StackSolveOptions & {capacity?: number} = {},
): StackStateSolveResult {
  const maxNodes = options.maxNodes ?? 20_000;
  const capacity = options.capacity ?? SLOT_CAPACITY;
  const n = cards.length;
  const kindIndex = new Map<string, number>();
  const kinds = cards.map(card => {
    if (!kindIndex.has(card.kind)) kindIndex.set(card.kind, kindIndex.size);
    return kindIndex.get(card.kind)!;
  });
  for (const kind of slotKinds) if (!kindIndex.has(kind)) kindIndex.set(kind, kindIndex.size);
  const slot = new Array<number>(kindIndex.size).fill(0);
  let slotSize = 0;
  for (const kind of slotKinds) { slot[kindIndex.get(kind)!]++; slotSize++; }
  for (let k = 0; k < slot.length; k++) {
    while (slot[k] >= PACK_SIZE) { slot[k] -= PACK_SIZE; slotSize -= PACK_SIZE; }
  }
  // covers[i] = cards that card i sits on top of; blockers[j] = how many active cards cover j.
  const covers: number[][] = cards.map(() => []);
  const blockers = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = cards[i], b = cards[j];
      if (a.layer > b.layer && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        covers[i].push(j);
        blockers[j]++;
      }
    }
  }
  const active = new Array<boolean>(n).fill(true);
  const picks: number[] = [];
  const seen = new Set<string>();
  let nodes = 0;
  let limited = false;
  let remaining = n;

  const search = (): boolean => {
    if (remaining === 0) return slotSize === 0;
    if (nodes >= maxNodes) { limited = true; return false; }
    nodes++;
    let key = '';
    for (let i = 0; i < n; i++) key += active[i] ? '1' : '0';
    key += `|${slot.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const free: number[] = [];
    const freeOfKind = new Array<number>(slot.length).fill(0);
    for (let i = 0; i < n; i++) if (active[i] && blockers[i] === 0) { free.push(i); freeOfKind[kinds[i]]++; }
    free.sort((a, b) => (slot[kinds[b]] - slot[kinds[a]]) || (freeOfKind[kinds[b]] - freeOfKind[kinds[a]]));
    for (const i of free) {
      const k = kinds[i];
      const packs = slot[k] === PACK_SIZE - 1;
      if (!packs && slotSize + 1 >= capacity) continue;
      active[i] = false; remaining--;
      for (const j of covers[i]) blockers[j]--;
      if (packs) { slot[k] = 0; slotSize -= PACK_SIZE - 1; } else { slot[k]++; slotSize++; }
      picks.push(cards[i].id);
      if (search()) return true;
      picks.pop();
      if (packs) { slot[k] = PACK_SIZE - 1; slotSize += PACK_SIZE - 1; } else { slot[k]--; slotSize--; }
      for (const j of covers[i]) blockers[j]++;
      active[i] = true; remaining++;
      if (limited) return false;
    }
    return false;
  };

  const solvable = search();
  return {solvable, picks: solvable ? [...picks] : [], nodes, limited};
}
