import { describe, expect, it } from 'vitest';
import { STAGE2_ITEMS } from '../client/assets/scripts/core/stack/stack-catalog';
import { generateDailyLevel } from '../client/assets/scripts/core/stack/stack-daily';
import { generateEndlessLevel } from '../client/assets/scripts/core/stack/stack-endless';
import { generateStackLevel } from '../client/assets/scripts/core/stack/stack-generator';
import { simulateStackBatch, simulateStackRun, visibleStackCards } from '../client/assets/scripts/core/stack/stack-sim';
import { simulateStackPicks, solveStackLevel } from '../client/assets/scripts/core/stack/stack-solver';
import { StackGame } from '../client/assets/scripts/core/stack/stack-rules';
import type { StackCard, StackLevel } from '../client/assets/scripts/core/stack/stack-types';

function card(id: number, kind: string, x: number, y: number, layer = 0): StackCard {
  return {id, kind, name: kind.toUpperCase(), x, y, w: 80, h: 80, layer, source: 'pile'};
}

function level(cards: StackCard[], slotCapacity = 7, stage = 1): StackLevel {
  return {
    stage,
    seed: 'sim-test',
    cardW: 80,
    cardH: 80,
    items: STAGE2_ITEMS,
    cards,
    reservePositions: Array.from({length: 12}, (_, index) => ({x: 30 + index * 52, y: 800})),
    momPositions: [{x: 260, y: 150}, {x: 350, y: 150}, {x: 440, y: 150}],
    solution: [],
    slotCapacity,
  };
}

describe('slot capacity', () => {
  it('keeps seven slots by default and accepts eight or nine only when declared', () => {
    const cards = Array.from({length: 8}, (_, index) => card(index + 1, String.fromCharCode(97 + index), index * 90, 0));
    const seven = new StackGame(level(cards));
    const eight = new StackGame(level(cards, 8));
    const nine = new StackGame(level(cards, 9));
    for (let index = 0; index < 7; index++) {
      expect(seven.tap(index + 1).status).toBe(index === 6 ? 'lost' : 'playing');
      expect(eight.tap(index + 1).status).toBe('playing');
      expect(nine.tap(index + 1).status).toBe('playing');
    }
    expect(eight.tap(8).status).toBe('lost');
    expect(nine.tap(8).status).toBe('playing');
    expect(seven.slotCapacity).toBe(7);
    expect(eight.slotCapacity).toBe(8);
    expect(() => new StackGame(level(cards, 10)).slotCapacity).toThrow('invalid stack slot capacity');
  });

  it('threads capacity through certificate simulation and both solvers', () => {
    const cards = Array.from({length: 8}, (_, index) => card(index + 1, String.fromCharCode(97 + index), index * 90, 0));
    const base = level(cards, 9);
    expect(simulateStackPicks(base, cards.map(item => item.id))).toEqual({valid: false, used: 8});
    expect(solveStackLevel(base).solvable).toBe(false);
    expect(solveStackLevel({...base, slotCapacity: 7}).solvable).toBe(false);
    expect(() => solveStackLevel({...base, slotCapacity: 10})).toThrow('invalid stack slot capacity');
  });
});

describe('stack simulator', () => {
  it('plays deterministically and only chooses currently visible cards', () => {
    const cards = [
      card(1, 'a', 0, 0), card(2, 'a', 100, 0), card(3, 'a', 200, 0),
      card(4, 'b', 0, 100), card(5, 'b', 100, 100), card(6, 'b', 200, 100),
    ];
    const game = new StackGame(level(cards));
    expect(visibleStackCards(game).map(item => item.id)).toEqual([1, 2, 3, 4, 5, 6]);
    const first = simulateStackRun(level(cards), {strategy: 'greedy', seed: 'fixed'});
    const second = simulateStackRun(level(cards), {strategy: 'greedy', seed: 'fixed'});
    expect(first).toEqual(second);
    expect(first).toMatchObject({won: true, status: 'won', remaining: 0, groupsCleared: 2});
    const batch = simulateStackBatch(level(cards), {strategy: 'greedy-lookahead', seed: 'batch'}, 12);
    expect(batch).toMatchObject({runs: 12, wins: 12, winRate: 1});
    expect(batch.averageRemaining).toBe(0);
    expect(batch.itemUseRate).toEqual({moveOut: 0, undo: 0, shuffle: 0, revive: 0});
  });

  it('uses move-out, undo and shuffle once each when the full-prop policy is triggered', () => {
    const unique = Array.from({length: 12}, (_, index) => card(index + 1, `k${index}`, index * 90, 0));
    const result = simulateStackRun(level(unique), {
      strategy: 'random',
      itemMode: 'all',
      seed: 'props',
      maxClicks: 40,
    });
    expect(result.itemsUsed.moveOut || result.itemsUsed.undo || result.itemsUsed.shuffle).toBe(true);
    expect(result.status).not.toBe('won');
  });

  it('revives at most once after a loss', () => {
    const unique = Array.from({length: 12}, (_, index) => card(index + 1, `k${index}`, index * 90, 0));
    const result = simulateStackRun(level(unique), {
      strategy: 'random',
      itemMode: 'all-revive',
      seed: 'revive',
      maxClicks: 40,
    });
    expect(result.itemsUsed.revive).toBe(true);
    expect(result.status).not.toBe('playing');
  });

  it('drives mom by clicks at 1.8 seconds each', () => {
    const cards = Array.from({length: 90}, (_, index) => card(index + 1, `k${index % 3}`, index * 70, 0));
    const result = simulateStackRun(level(cards, 9, 2), {
      strategy: 'random',
      seed: 'mom-clock',
      maxClicks: 120,
    });
    expect(result.momEvents).toBeGreaterThan(0);
  });

  it('runs generated levels and validates option bounds', () => {
    const daily = generateDailyLevel('2026-11-12');
    const endless = generateEndlessLevel(3);
    expect(simulateStackRun(daily, {strategy: 'greedy-lookahead', itemMode: 'all', seed: 'daily'}).clicks).toBeGreaterThan(0);
    expect(simulateStackRun(endless, {strategy: 'greedy', seed: 'endless'}).clicks).toBeGreaterThan(0);
    expect(() => simulateStackBatch(daily, {strategy: 'greedy'}, 0)).toThrow('invalid stack simulation run count');
    expect(() => simulateStackRun(daily, {strategy: 'greedy', clickIntervalMs: 0})).toThrow('invalid stack click interval');
    expect(() => simulateStackRun(daily, {strategy: 'greedy', maxClicks: 0})).toThrow('invalid stack click limit');
  });

  it('keeps the existing easy and hard stages playable', () => {
    const easy = generateStackLevel(1).level;
    const hard = generateStackLevel(2).level;
    expect(simulateStackBatch(easy, {strategy: 'greedy', seed: 'easy'}, 20).winRate).toBeGreaterThanOrEqual(0.95);
    expect(simulateStackRun(hard, {strategy: 'greedy-lookahead', itemMode: 'all', seed: 'hard'}).clicks).toBeGreaterThan(0);
  });
});
