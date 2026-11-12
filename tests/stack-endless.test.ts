import { describe, expect, it } from 'vitest';
import { dailySeed, generateDailyLevel } from '../client/assets/scripts/core/stack/stack-daily';
import {
  ENDLESS_MAX_CARDS, ROUTE_TITLES, capacityForLevel, endlessCardCount, endlessKindCount,
  generateEndlessLevel, routeTitleForLevel,
} from '../client/assets/scripts/core/stack/stack-endless';
import { stackCardBounds } from '../client/assets/scripts/core/stack/stack-layout';
import { solveStackLevel } from '../client/assets/scripts/core/stack/stack-solver';

describe('endless stack levels', () => {
  it('grows capacity from seven to nine slots', () => {
    expect([1, 2, 3].map(capacityForLevel)).toEqual([7, 7, 7]);
    expect([4, 5].map(capacityForLevel)).toEqual([8, 8]);
    expect([6, 7, 8, 20].map(capacityForLevel)).toEqual([9, 9, 9, 9]);
    expect(() => capacityForLevel(0)).toThrow('invalid endless level');
  });

  it('generates deterministic, solvable levels with growing cards, layers and kinds', () => {
    const stage3 = generateEndlessLevel(3);
    expect(stage3).toEqual(generateEndlessLevel(3));
    expect(stage3.cards).toHaveLength(165);
    expect([...new Set(stage3.cards.filter(card => card.source === 'pile').map(card => card.layer))]).toHaveLength(6);
    expect(stage3.items).toHaveLength(14);
    expect(stage3.slotCapacity).toBe(7);
    expect(stage3.hideCovered).toBe(false);
    expect(stage3.seed).toBe('trunk-road-3');
    expect(solveStackLevel(stage3, {maxNodes: 1_000}).solvable).toBe(true);

    const stage4 = generateEndlessLevel(4);
    expect(stage4.cards).toHaveLength(180);
    expect([...new Set(stage4.cards.filter(card => card.source === 'pile').map(card => card.layer))]).toHaveLength(7);
    expect(stage4.items).toHaveLength(15);
    expect(stage4.slotCapacity).toBe(8);
    expect(stage4.hideCovered).toBe(true);
    expect(solveStackLevel(stage4, {maxNodes: 1_000}).solvable).toBe(true);
  });

  it('caps the endless route without expanding the board footprint', () => {
    const stage8 = generateEndlessLevel(8);
    expect(stage8.cards).toHaveLength(ENDLESS_MAX_CARDS);
    expect(stage8.items).toHaveLength(19);
    expect(stage8.slotCapacity).toBe(9);
    expect(endlessCardCount(20)).toBe(ENDLESS_MAX_CARDS);
    expect(endlessKindCount(20)).toBeLessThanOrEqual(53);
    const bounds = stackCardBounds(stage8.cards);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(750);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(1_120);
    expect(solveStackLevel(stage8).solvable).toBe(true);
    expect(() => generateEndlessLevel(2)).toThrow('invalid endless level');
  });

  it('provides at least twenty unique route titles and cycles them', () => {
    expect(new Set(ROUTE_TITLES).size).toBeGreaterThanOrEqual(20);
    expect(routeTitleForLevel(3)).toBe('第 3 关 · 出城收费站');
    expect(routeTitleForLevel(4)).toBe('第 4 关 · 高速服务区');
    expect(routeTitleForLevel(3 + ROUTE_TITLES.length).split(' · ')[1]).toBe(routeTitleForLevel(3).split(' · ')[1]);
    expect(() => routeTitleForLevel(2)).toThrow('invalid endless route level');
  });
});

describe('daily stack levels', () => {
  it('uses the Beijing calendar day at UTC+8 midnight', () => {
    expect(dailySeed(new Date('2026-11-11T15:59:59.999Z'))).toBe('2026-11-11');
    expect(dailySeed(new Date('2026-11-11T16:00:00.000Z'))).toBe('2026-11-12');
    expect(dailySeed(new Date('2026-12-31T16:00:00.000Z'))).toBe('2027-01-01');
    expect(() => dailySeed(new Date('invalid'))).toThrow('invalid daily stack date');
  });

  it('generates deterministic, solvable four-layer levels at stage-one difficulty', () => {
    for (const key of ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']) {
      const level = generateDailyLevel(key);
      expect(level).toEqual(generateDailyLevel(key));
      expect(level.cards.length).toBeGreaterThanOrEqual(60);
      expect(level.cards.length).toBeLessThanOrEqual(90);
      expect([...new Set(level.cards.map(card => card.layer))]).toHaveLength(4);
      expect(level.items.length).toBeGreaterThanOrEqual(8);
      expect(level.items.length).toBeLessThanOrEqual(10);
      expect(level.slotCapacity).toBe(7);
      expect(level.seed).toBe(`trunk-daily-${key}`);
      expect(solveStackLevel(level, {maxNodes: 1_000}).solvable).toBe(true);
    }
    expect(() => generateDailyLevel('2026-02-30')).toThrow('invalid daily stack date key');
    expect(() => generateDailyLevel('not-a-date')).toThrow('invalid daily stack date key');
  });
});
