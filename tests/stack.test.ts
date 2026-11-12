import { describe, expect, it } from 'vitest';
import { STAGE1_ITEMS, STAGE2_ITEMS, stackItemByName, stackItems } from '../client/assets/scripts/core/stack/stack-catalog';
import { generateStackLevel, STACK_SEEDS } from '../client/assets/scripts/core/stack/stack-generator';
import {
  freeCards, isBlocked, rectsOverlap, SLOT_CAPACITY, slotInsertIndex, StackGame, topCardAt,
} from '../client/assets/scripts/core/stack/stack-rules';
import { simulateStackPicks, solveStackLevel } from '../client/assets/scripts/core/stack/stack-solver';
import type { StackCard, StackLevel } from '../client/assets/scripts/core/stack/stack-types';
import { createRng } from '../client/assets/scripts/core/rng';

function card(id: number, kind: string, x: number, y: number, layer = 0, w = 80, h = 80): StackCard {
  return {id, kind, name: kind.toUpperCase(), x, y, w, h, layer, source: 'pile'};
}

function level(cards: StackCard[], stage = 1, solution: number[] = []): StackLevel {
  return {
    stage,
    seed: 'test',
    cardW: 80,
    cardH: 80,
    items: STAGE2_ITEMS,
    cards,
    reservePositions: Array.from({length: 12}, (_, index) => ({x: 100 + (index % 6) * 88, y: 500 + Math.floor(index / 6) * 90})),
    momPositions: [{x: 260, y: 150}, {x: 350, y: 150}, {x: 440, y: 150}],
    solution,
  };
}

describe('stack level generation', () => {
  it('generates the fixed easy stage with three recognisable items and two layers', () => {
    const generated = generateStackLevel(1, STACK_SEEDS[0]);
    const level = generated.level;
    expect(generated.attempts).toBe(1);
    expect(level.seed).toBe(STACK_SEEDS[0]);
    expect(level.cards).toHaveLength(18);
    expect(new Set(level.cards.map(item => item.kind))).toEqual(new Set(STAGE1_ITEMS.map(item => item.key)));
    expect(new Set(level.cards.map(item => item.layer))).toEqual(new Set([0, 1]));
    expect(level.items).toHaveLength(3);
    const kinds = new Map<string, number>();
    for (const item of level.cards) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
    expect(kinds.size).toBe(STAGE1_ITEMS.length);
    for (const count of kinds.values()) expect(count % 3).toBe(0);
    expect(solveStackLevel(level, {maxNodes: 500}).solvable).toBe(true);
  });

  it('generates the fixed hard stage with 150 cards, eight layers and two side piles', () => {
    const level = generateStackLevel(2, STACK_SEEDS[1]).level;
    const kinds = new Map<string, number>();
    for (const item of level.cards) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
    expect(level.cards).toHaveLength(150);
    expect(level.items.length).toBeGreaterThanOrEqual(12);
    expect(level.items.length).toBeLessThanOrEqual(14);
    expect(kinds.size).toBe(level.items.length);
    for (const count of kinds.values()) expect(count % 3).toBe(0);
    const mainLayers = new Set(level.cards.filter(item => item.source === 'pile').map(item => item.layer));
    expect(mainLayers.size).toBeGreaterThanOrEqual(6);
    expect(mainLayers.size).toBeLessThanOrEqual(10);
    for (const side of ['side-left', 'side-right'] as const) {
      const cards = level.cards.filter(item => item.source === side);
      expect(cards).toHaveLength(6);
      const free = cards.filter(item => !isBlocked(item, level.cards));
      expect(free).toHaveLength(1);
      expect(free[0].layer).toBe(Math.max(...cards.map(item => item.layer)));
    }
    expect(solveStackLevel(level, {maxNodes: 500}).solvable).toBe(true);
  });

  it('is deterministic and can reject unknown stages', () => {
    expect(generateStackLevel(2, 'repeat')).toEqual(generateStackLevel(2, 'repeat'));
    expect(() => generateStackLevel(3 as 1)).toThrow('unknown stack stage');
    expect(() => generateStackLevel(1, STACK_SEEDS[0], 0)).toThrow('invalid stack generator attempts');
  });

  it('exposes the requested item catalog', () => {
    expect(stackItems(1)).toBe(STAGE1_ITEMS);
    expect(stackItems(2)).toBe(STAGE2_ITEMS);
    expect(STAGE1_ITEMS.map(item => item.key)).toEqual(['mandarin', 'duck', 'fruitbasket']);
    expect(STAGE2_ITEMS.map(item => item.key)).toEqual([
      'mandarin', 'duck', 'fruitbasket', 'fish', 'kumquat', 'milk', 'oven',
      'suitcase_l', 'woven', 'toycar', 'snacks', 'ham', 'thermos', 'crab',
    ]);
    expect(stackItemByName(STAGE2_ITEMS, 'fish').name).toBe('鱼');
    expect(stackItemByName(STAGE2_ITEMS, 'missing').key).toBe('mandarin');
  });
});

describe('stack geometry and slots', () => {
  it('blocks only cards under a higher overlapping rectangle and ignores touching edges', () => {
    const lower = card(1, 'a', 0, 0);
    const upper = card(2, 'b', 40, 40, 1);
    const touching = card(3, 'c', 80, 0, 1);
    const sameLayer = card(4, 'd', 10, 10, 0);
    expect(rectsOverlap(lower, upper)).toBe(true);
    expect(rectsOverlap(lower, touching)).toBe(false);
    expect(isBlocked(lower, [lower, upper, touching, sameLayer])).toBe(true);
    expect(isBlocked(touching, [lower, touching, upper])).toBe(false);
    expect(freeCards([lower, upper])).toEqual([upper]);
    expect(topCardAt([lower, upper], 50, 50)).toBe(upper);
    expect(topCardAt([lower], 200, 200)).toBeUndefined();
  });

  it('inserts matching items together and packs exactly three', () => {
    const cards = [card(1, 'a', 0, 0), card(2, 'a', 100, 0), card(3, 'b', 200, 0), card(4, 'a', 300, 0)];
    const game = new StackGame(level(cards));
    expect(slotInsertIndex(game.slot, 'a')).toBe(0);
    expect(game.tap(1).insertIndex).toBe(0);
    expect(game.tap(2).insertIndex).toBe(1);
    const bTap = game.tap(3);
    expect(bTap.insertIndex).toBe(2);
    expect(game.slot.map(item => item.kind)).toEqual(['a', 'a', 'b']);
    const packed = game.tap(4);
    expect(packed.packed.map(item => item.id)).toEqual([1, 2, 4]);
    expect(packed.slotBeforePack.map(item => item.id)).toEqual([1, 2, 4, 3]);
    expect(game.slot.map(item => item.kind)).toEqual(['b']);
    expect(game.clearedGroups).toBe(1);
  });

  it('blocks hidden cards, reports missing cards and wins after the final pack', () => {
    const cards = [card(1, 'a', 0, 0), card(2, 'a', 40, 40, 1), card(3, 'a', 300, 0)];
    const game = new StackGame(level(cards));
    expect(game.canTap(1)).toBe(false);
    expect(game.tap(1)).toMatchObject({ok: false, reason: 'blocked'});
    expect(game.tap(99)).toMatchObject({ok: false, reason: 'missing'});
    game.tap(2); game.tap(3); game.tap(1);
    expect(game.status).toBe('won');
    expect(game.remaining).toBe(0);
    expect(game.tap(1)).toMatchObject({ok: false, reason: 'finished'});
  });
});

describe('stack props, failure and mother event', () => {
  it('fails at seven mixed items, then revive returns three to the clickable reserve', () => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((kind, index) => card(index + 1, kind, index * 90, 0));
    const game = new StackGame(level(cards));
    for (let id = 1; id <= 6; id++) expect(game.tap(id).status).toBe('playing');
    expect(game.tap(7).status).toBe('lost');
    expect(game.slot).toHaveLength(SLOT_CAPACITY);
    expect(game.revive().map(item => item.id)).toEqual([1, 2, 3]);
    expect(game.status).toBe('playing');
    expect(game.slot.map(item => item.id)).toEqual([4, 5, 6, 7]);
    const reserve = game.cards.filter(item => item.source === 'reserve');
    expect(reserve).toHaveLength(3);
    for (const item of reserve) expect(game.canTap(item.id)).toBe(true);
  });

  it('uses move-out and undo once, restoring the board after a click', () => {
    const cards = [card(1, 'a', 0, 0), card(2, 'b', 90, 0), card(3, 'c', 180, 0), card(4, 'd', 270, 0)];
    const game = new StackGame(level(cards));
    game.tap(1); game.tap(2); game.tap(3); game.tap(4);
    expect(game.useMoveOut().map(item => item.id)).toEqual([1, 2, 3]);
    expect(game.slot.map(item => item.id)).toEqual([4]);
    expect(game.useMoveOut()).toEqual([]);
    expect(game.props.moveOut).toBe(true);

    const undoGame = new StackGame(level(cards));
    undoGame.tap(1);
    expect(undoGame.useUndo()).toBe(true);
    expect(undoGame.slot).toHaveLength(0);
    expect(undoGame.cards.map(item => item.id)).toEqual([1, 2, 3, 4]);
    expect(undoGame.useUndo()).toBe(false);
  });

  it('shuffles remaining kinds without changing positions or counts and only once', () => {
    const cards = [card(1, 'a', 0, 0), card(2, 'b', 90, 0), card(3, 'c', 180, 0), card(4, 'a', 270, 0)];
    const game = new StackGame(level(cards), createRng('shuffle'));
    const before = game.cards.map(item => ({id: item.id, x: item.x, y: item.y, kind: item.kind}));
    expect(game.useShuffle()).toBe(true);
    const after = game.cards.map(item => ({id: item.id, x: item.x, y: item.y, kind: item.kind}));
    expect(after.map(item => ({id: item.id, x: item.x, y: item.y}))).toEqual(before.map(item => ({id: item.id, x: item.x, y: item.y})));
    expect(sorted(after.map(item => item.kind))).toEqual(sorted(before.map(item => item.kind)));
    expect(game.useShuffle()).toBe(false);
  });

  it('adds three matching top cards for the timed mother event and by cleared groups', () => {
    const base = generateStackLevel(2, STACK_SEEDS[1]).level;
    const game = new StackGame(base, createRng('mom'), 0);
    expect(game.tickMom(24_999)).toEqual([]);
    const added = game.tickMom(25_000);
    expect(added).toHaveLength(3);
    expect(new Set(added.map(item => item.kind)).size).toBe(1);
    expect(game.remaining).toBe(153);
    for (const item of added) expect(game.canTap(item.id)).toBe(true);

    const simpleCards = Array.from({length: 33}, (_, index) => card(index + 1, `k${Math.floor(index / 3)}`, index * 10, 0));
    const groupGame = new StackGame(level(simpleCards, 2), () => 0);
    for (const item of simpleCards) groupGame.tap(item.id);
    expect(groupGame.clearedGroups).toBe(11);
    expect(groupGame.remaining).toBe(3);
    expect(groupGame.cards.filter(item => item.source === 'mom')).toHaveLength(3);
  });

  it('rejects props and events when unavailable', () => {
    const game = new StackGame(level([card(1, 'a', 0, 0)]));
    expect(game.useMoveOut()).toEqual([]);
    expect(game.useUndo()).toBe(false);
    expect(game.triggerMom()).toEqual([]);
    game.tap(1);
    expect(game.useShuffle()).toBe(false);
  });
});

describe('stack solver', () => {
  it('replays the generated certificate and falls back to bounded search', () => {
    const generated = generateStackLevel(1, STACK_SEEDS[0]).level;
    expect(simulateStackPicks(generated, generated.solution)).toEqual({valid: true, used: 18});
    const certificate = solveStackLevel(generated);
    expect(certificate).toMatchObject({solvable: true, method: 'certificate'});
    const searched = solveStackLevel({...generated, solution: []}, {maxNodes: 20_000});
    expect(searched.solvable).toBe(true);
    expect(searched.method).toBe('search');
    expect(simulateStackPicks(generated, searched.picks).valid).toBe(true);
  });

  it('reports impossible and node-limited searches', () => {
    const impossible = level([card(1, 'a', 0, 0), card(2, 'a', 90, 0), card(3, 'b', 180, 0)]);
    expect(solveStackLevel(impossible).solvable).toBe(false);
    expect(solveStackLevel(impossible, {maxNodes: 1})).toMatchObject({solvable: false, limited: true});
    expect(() => solveStackLevel(impossible, {maxNodes: 0})).toThrow('invalid stack solver node limit');
  });

  it('rejects blocked and incomplete certificate sequences', () => {
    const blocked = level([card(1, 'a', 0, 0), card(2, 'a', 40, 40, 1), card(3, 'a', 200, 0)]);
    expect(simulateStackPicks(blocked, [1, 2, 3])).toEqual({valid: false, used: 0});
    const generated = generateStackLevel(1, STACK_SEEDS[0]).level;
    expect(simulateStackPicks(generated, generated.solution.slice(0, 3))).toEqual({valid: false, used: 3});
  });
});

function sorted(values: readonly string[]): string[] { return [...values].sort(); }
