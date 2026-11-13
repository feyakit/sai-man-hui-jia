import { describe, expect, it } from 'vitest';
import { STAGE2_ITEMS } from '../client/assets/scripts/core/stack/stack-catalog';
import { displayIndex, displaySlot, readyPacks, type PendingPack } from '../client/assets/scripts/core/stack/slot-display';
import { StackGame } from '../client/assets/scripts/core/stack/stack-rules';
import type { StackCard, StackLevel } from '../client/assets/scripts/core/stack/stack-types';

const card = (id: number, kind: string, x = id * 100, y = 0): StackCard => ({id, kind, name: kind, x, y, w: 80, h: 80, layer: 0, source: 'pile'});
const level = (cards: StackCard[]): StackLevel => ({
  stage: 1, seed: 'rapid', cardW: 80, cardH: 80, items: STAGE2_ITEMS, cards,
  reservePositions: Array.from({length: 12}, (_, i) => ({x: 100 + (i % 6) * 88, y: 500 + Math.floor(i / 6) * 90})),
  momPositions: [], solution: [],
});

/** Mirrors StackPage: every tap hits the logic now; animations only track what is still flying. */
function rapid(game: StackGame, ids: number[]) {
  const inFlight = new Set<number>();
  let pending: PendingPack[] = [];
  const shown: number[][] = [];
  const seq = new Map<number, number>();
  const seqOf = (id: number) => seq.get(id) ?? 0;
  for (const id of ids) {
    const result = game.tap(id);
    expect(result.ok, `tap ${id}`).toBe(true);
    seq.set(id, seq.size + 1);
    inFlight.add(id);
    if (result.packed.length === 3) pending.push({ids: result.packed.map(c => c.id), cards: result.packed, seq: seq.size});
    shown.push(displaySlot(game.slot, pending, seqOf).map(c => c.id));
  }
  return {inFlight, pending, shown, seqOf, land(id: number) {
    inFlight.delete(id);
    const ready = readyPacks(pending, inFlight);
    pending = pending.filter(p => !ready.includes(p));
    return {ready, display: displaySlot(game.slot, pending, seqOf).map(c => c.id)};
  }};
}

describe('rapid tapping', () => {
  it('accepts ten taps in a row with no waiting, packing every third match at once', () => {
    const kinds = ['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'c', 'd'];
    const game = new StackGame(level(kinds.map((kind, i) => card(i + 1, kind))));
    const run = rapid(game, kinds.map((_, i) => i + 1));
    expect(game.clearedGroups).toBe(3);
    expect(game.slot.map(c => c.id)).toEqual([10]);
    expect(game.status).toBe('playing');
    // While cards 3, 6, 9 are still flying their packs keep showing in the slot.
    expect(run.shown.at(-1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('plays a pack only when all three of its cards have landed, in tap order', () => {
    const game = new StackGame(level(['a', 'b', 'a', 'a'].map((kind, i) => card(i + 1, kind))));
    const run = rapid(game, [1, 2, 3, 4]);
    expect(run.land(1).ready).toEqual([]);
    expect(run.land(3).ready).toEqual([]);
    const final = run.land(4);
    expect(final.ready.map(p => p.ids)).toEqual([[1, 3, 4]]);
    expect(final.display).toEqual([2]);
    run.land(2);
  });

  it('keeps the slot-full loss exact even when taps arrive faster than the animations', () => {
    const kinds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'a'];
    const game = new StackGame(level(kinds.map((kind, i) => card(i + 1, kind))));
    for (let i = 1; i <= 7; i++) game.tap(i);
    expect(game.status).toBe('lost');
    expect(game.tap(8).ok).toBe(false);
    expect(game.revive().length).toBe(3);
    expect(game.status).toBe('playing');
    expect(game.tap(8).ok).toBe(true);
  });

  it('wins on the final rapid pack and places pending cards next to their own kind', () => {
    const game = new StackGame(level(['a', 'a', 'b', 'a', 'b', 'b'].map((kind, i) => card(i + 1, kind))));
    const run = rapid(game, [1, 2, 3, 4, 5, 6]);
    expect(game.status).toBe('won');
    const display = displaySlot(game.slot, run.pending, run.seqOf);
    expect(display.map(c => c.kind)).toEqual(['a', 'a', 'a', 'b', 'b', 'b']);
    expect(displayIndex(display, 6)).toBe(5);
    expect(displayIndex(display, 99)).toBe(-1);
  });
});
