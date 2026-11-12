import { describe, expect, it } from 'vitest';
import { calibrateDaily, dailyGreedyRate, dailySeed, dailyTableAttempt, generateDailyLevel } from '../client/assets/scripts/core/stack/stack-daily';
import {
  ENDLESS_OPEN_RANGE, ROAD_FINAL_STAGE, ROUTE_TITLES, capacityForLevel, cartonRate, generateEndlessLevel, moundHeights,
  moundTemplateFor, routeTitleForLevel,
} from '../client/assets/scripts/core/stack/stack-endless';
import { freeCards, isBlocked } from '../client/assets/scripts/core/stack/stack-rules';
import { stackCardBounds } from '../client/assets/scripts/core/stack/stack-layout';
import { solveStackLevel } from '../client/assets/scripts/core/stack/stack-solver';

describe('road levels 3–9', () => {
  it('grows capacity from seven to nine slots', () => {
    expect([1, 2, 3].map(capacityForLevel)).toEqual([7, 7, 7]);
    expect([4, 5].map(capacityForLevel)).toEqual([8, 8]);
    expect([6, 7, 8, 9].map(capacityForLevel)).toEqual([9, 9, 9, 9]);
    expect(() => capacityForLevel(0)).toThrow('invalid endless level');
  });

  it('stops at level 9', () => {
    expect(ROAD_FINAL_STAGE).toBe(9);
    expect(() => generateEndlessLevel(2)).toThrow('invalid endless level');
    expect(() => generateEndlessLevel(10)).toThrow('invalid endless level');
    expect(() => routeTitleForLevel(10)).toThrow('invalid endless route level');
  });

  it('generates deterministic, solvable, distinct boards for every level', () => {
    const levels = [3, 4, 5, 6, 7, 8, 9].map(n => generateEndlessLevel(n));
    expect(generateEndlessLevel(4)).toEqual(levels[1]);
    expect(levels.map(level => level.cards.length)).toEqual([165, 180, 195, 210, 225, 240, 240]);
    const signatures = levels.map(level => level.cards.map(card => `${card.x},${card.y},${card.layer},${card.kind}`).join('|'));
    expect(new Set(signatures).size).toBe(7);
    for (const level of levels) {
      expect(solveStackLevel(level, {maxNodes: 240_000}).solvable).toBe(true);
      const bounds = stackCardBounds(level.cards);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(750);
      expect(bounds.bottom).toBeLessThanOrEqual(1_120);
    }
  }, 60_000);

  it('opens with 6–8 tappable cards on every level', () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9]) {
      const open = freeCards(generateEndlessLevel(n).cards).length;
      expect(open, `level ${n}`).toBeGreaterThanOrEqual(ENDLESS_OPEN_RANGE[0]);
      expect(open, `level ${n}`).toBeLessThanOrEqual(ENDLESS_OPEN_RANGE[1]);
    }
  });

  it('keeps most covered cards as dimmed faces: cartons from 15% on level 4 up to 30%, lowest layers first', () => {
    expect([3, 4, 5, 6, 7, 8, 9].map(cartonRate)).toEqual([0, .15, .18, .21, .24, .27, .3]);
    expect(generateEndlessLevel(3).cards.some(card => card.carton)).toBe(false);
    for (const n of [4, 6, 9]) {
      const level = generateEndlessLevel(n);
      const cartons = level.cards.filter(card => card.carton);
      expect(cartons.length).toBe(Math.round(cartonRate(n) * level.cards.length));
      // Every carton starts covered; the open top is always real cargo.
      for (const carton of cartons) expect(isBlocked(carton, level.cards)).toBe(true);
      const pileLayer = (cards: typeof cartons) => cards.filter(card => card.source === 'pile').reduce((sum, card) => sum + card.layer, 0)
        / Math.max(1, cards.filter(card => card.source === 'pile').length);
      const faces = level.cards.filter(card => !card.carton && isBlocked(card, level.cards));
      expect(pileLayer(cartons)).toBeLessThan(pileLayer(faces));
    }
  });

  it('gives levels 4–9 their own stepped mound outline', () => {
    expect(new Set([4, 5, 6, 7, 8, 9].map(n => moundTemplateFor(n).key)).size).toBe(6);
    for (const n of [4, 6, 9]) {
      const level = generateEndlessLevel(n);
      const mound = level.cards.filter(card => card.source === 'pile' && card.layer >= 6);
      expect(mound).toHaveLength(Math.min(5, n - 3) * 20);
      expect(new Set(mound.map(card => card.layer)).size).toBeGreaterThanOrEqual(3);
    }
    const heights = moundHeights(10, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 20, 10);
    expect(heights.reduce((sum, height) => sum + height, 0)).toBe(20);
    expect(heights[0]).toBeGreaterThan(heights[heights.length - 1]);
  });

  it('names one place per level and ends at home', () => {
    expect(ROUTE_TITLES).toHaveLength(7);
    expect(new Set(ROUTE_TITLES).size).toBe(7);
    expect(routeTitleForLevel(3)).toBe('第 3 关 · 出城收费站');
    expect(routeTitleForLevel(9)).toBe('第 9 关 · 到家了');
  });
});

describe('daily stack levels', () => {
  it('uses the Beijing calendar day at UTC+8 midnight', () => {
    expect(dailySeed(new Date('2026-11-11T15:59:59.999Z'))).toBe('2026-11-11');
    expect(dailySeed(new Date('2026-11-11T16:00:00.000Z'))).toBe('2026-11-12');
    expect(dailySeed(new Date('2026-12-31T16:00:00.000Z'))).toBe('2027-01-01');
    expect(() => dailySeed(new Date('invalid'))).toThrow('invalid daily stack date');
  });

  it('generates deterministic, solvable four-layer levels at stage-one difficulty', {timeout: 60_000}, () => {
    for (const key of ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']) {
      const level = generateDailyLevel(key);
      expect(level).toEqual(generateDailyLevel(key));
      expect(level.cards.length).toBeGreaterThanOrEqual(60);
      expect(level.cards.length).toBeLessThanOrEqual(90);
      expect([...new Set(level.cards.map(card => card.layer))]).toHaveLength(4);
      expect(level.items.length).toBeGreaterThanOrEqual(8);
      expect(level.items.length).toBeLessThanOrEqual(10);
      expect(level.slotCapacity).toBe(7);
      expect(level.seed.startsWith(`trunk-daily-${key}`)).toBe(true);
      // Greedy bot without props lands in the 30–70% band on every date.
      const rate = dailyGreedyRate(level, 200);
      expect(rate).toBeGreaterThanOrEqual(.3);
      expect(rate).toBeLessThanOrEqual(.7);
      expect(solveStackLevel(level, {maxNodes: 1_000}).solvable).toBe(true);
    }
    // The shipped table matches runtime calibration and skips re-simulation on phones.
    for (const key of ['2026-11-12', '2027-03-01', '2028-12-31']) {
      expect(dailyTableAttempt(key)).toBe(calibrateDaily(key).attempt);
    }
    expect(dailyTableAttempt('2026-10-31')).toBeUndefined();
    expect(dailyTableAttempt('2040-01-01')).toBeUndefined();
    expect(() => generateDailyLevel('2026-02-30')).toThrow('invalid daily stack date key');
    expect(() => generateDailyLevel('not-a-date')).toThrow('invalid daily stack date key');
  });
});
