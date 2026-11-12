import {describe, expect, it} from 'vitest';
import {
  homeProgress, homeProgressLabel, isDailyDone, isHomeDone, levelForRoute, markHomeDone, markDailyDone, nextRouteTitle, normalizeRoute, readBestLevel, recordLevelReached,
  routeHeadline, vehicleLevelForRoute, type ProgressStorage,
} from '../client/assets/scripts/core/stack/stack-progress';

function memory(): ProgressStorage & {data: Map<string, string>} {
  const data = new Map<string, string>();
  return {data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }};
}

describe('stack routes', () => {
  it('parses ?stage values', () => {
    expect(normalizeRoute('daily')).toBe('daily');
    expect(normalizeRoute('5')).toBe(5);
    expect(normalizeRoute('42')).toBe(9);
    expect(normalizeRoute(null)).toBe(1);
    expect(normalizeRoute('x')).toBe(1);
    expect(normalizeRoute('0')).toBe(1);
  });

  it('builds the right board for each route', () => {
    expect(levelForRoute(1).stage).toBe(1);
    expect(levelForRoute(2).stage).toBe(2);
    const third = levelForRoute(3);
    expect(third.stage).toBe(3);
    expect(third.cards.some(card => card.carton)).toBe(false);
    expect(levelForRoute(4).cards.some(card => card.carton)).toBe(true);
    expect(levelForRoute(9).stage).toBe(9);
    expect(levelForRoute('daily', new Date('2026-11-12T03:00:00Z')).slotCapacity).toBe(7);
  });

  it('names levels like a road home and the daily board by its Beijing date', () => {
    expect(routeHeadline(2)).toEqual({stage: '第 2 关', subtitle: null});
    expect(routeHeadline(3)).toEqual({stage: '第 3 关', subtitle: '出城收费站'});
    // 2026-11-12 23:30 UTC is already the 13th in Beijing.
    expect(routeHeadline('daily', new Date('2026-11-12T23:30:00Z'))).toEqual({stage: '每日一关', subtitle: '11 月 13 日 · 今日挑战'});
    expect(nextRouteTitle(2)).toBe('继续回家路 · 第 3 关');
    expect(nextRouteTitle('daily')).toBeNull();
    expect(nextRouteTitle(8)).toBe('继续回家路 · 第 9 关');
    expect(nextRouteTitle(9)).toBeNull();
    expect(routeHeadline(9)).toEqual({stage: '第 9 关', subtitle: '到家了'});
  });

  it('picks a ride for the daily board from the date', () => {
    expect(vehicleLevelForRoute(6)).toBe(6);
    const a = vehicleLevelForRoute('daily', new Date('2026-11-12T03:00:00Z'));
    const b = vehicleLevelForRoute('daily', new Date('2026-11-13T03:00:00Z'));
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(9);
    expect(b).not.toBe(a);
  });
});

describe('local progress', () => {
  it('remembers the farthest level reached', () => {
    const storage = memory();
    expect(readBestLevel(storage)).toBe(0);
    expect(homeProgressLabel(storage)).toBe('回家进度 0/9');
    expect(homeProgress(storage)).toEqual({steps: 0, label: '回家进度 0/9', done: false});
    expect(recordLevelReached(storage, 3)).toBe(3);
    expect(recordLevelReached(storage, 2)).toBe(3);
    expect(readBestLevel(storage)).toBe(3);
    expect(readBestLevel(undefined)).toBe(0);
    expect(homeProgressLabel(storage)).toBe('回家进度 3/9');
    expect(recordLevelReached(storage, 12)).toBe(9);
    expect(homeProgressLabel(storage)).toBe('回家进度 9/9');
    expect(isHomeDone(storage)).toBe(false);
    markHomeDone(storage);
    expect(isHomeDone(storage)).toBe(true);
    expect(homeProgressLabel(storage)).toBe('已到家');
    expect(homeProgress(storage).steps).toBe(9);
  });

  it('marks today’s daily board done until the Beijing date changes', () => {
    const storage = memory();
    const noon = new Date('2026-11-12T04:00:00Z');
    expect(isDailyDone(storage, noon)).toBe(false);
    markDailyDone(storage, noon);
    expect(isDailyDone(storage, noon)).toBe(true);
    expect(isDailyDone(storage, new Date('2026-11-12T16:30:00Z'))).toBe(false);
  });

  it('survives a broken storage', () => {
    const broken: ProgressStorage = {getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }};
    expect(readBestLevel(broken)).toBe(0);
    expect(recordLevelReached(broken, 4)).toBe(4);
    expect(isDailyDone(broken)).toBe(false);
    expect(() => markDailyDone(broken)).not.toThrow();
  });
});
