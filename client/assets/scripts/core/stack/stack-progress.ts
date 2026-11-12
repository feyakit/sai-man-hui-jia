import { generateDailyLevel, dailySeed } from './stack-daily';
import { ENDLESS_MIN_STAGE, ROAD_FINAL_STAGE, generateEndlessLevel, routeTitleForLevel } from './stack-endless';
import { STACK_SEEDS, generateStackLevel } from './stack-generator';
import type { StackLevel } from './stack-types';

/** Which board a StackPage plays: a numbered level on the road home, or today's daily board. */
export type StackRoute = number | 'daily';

export const STACK_BEST_LEVEL_KEY = 'smhj.bestLevel';
export const STACK_DAILY_DONE_KEY = 'smhj.dailyDone';
export const STACK_HOME_DONE_KEY = 'smhj.homeDone';
export { ROAD_FINAL_STAGE };

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeRoute(value: string | null | undefined): StackRoute {
  if (value === 'daily') return 'daily';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(ROAD_FINAL_STAGE, n);
}

export function levelForRoute(route: StackRoute, now: Date = new Date()): StackLevel {
  if (route === 'daily') return generateDailyLevel(dailySeed(now));
  if (route >= ENDLESS_MIN_STAGE) return generateEndlessLevel(route);
  const stage = route === 2 ? 2 : 1;
  return generateStackLevel(stage, STACK_SEEDS[stage - 1]).level;
}

/** HUD lines: “第 3 关” + “出城收费站”, or the daily date. */
export function routeHeadline(route: StackRoute, now: Date = new Date()): {stage: string; subtitle: string | null} {
  if (route === 'daily') {
    const [, month, day] = dailySeed(now).split('-').map(Number);
    return {stage: '每日一关', subtitle: `${month} 月 ${day} 日 · 今日挑战`};
  }
  if (route >= ENDLESS_MIN_STAGE) {
    const [stage, place] = routeTitleForLevel(route).split(' · ');
    return {stage, subtitle: place};
  }
  return {stage: `第 ${route} 关`, subtitle: null};
}

/** Daily boards ride a different vehicle each day (Beijing date), level boards follow the level. */
export function vehicleLevelForRoute(route: StackRoute, now: Date = new Date()): number {
  if (route !== 'daily') return route;
  const [year, month, day] = dailySeed(now).split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return 1 + dayNumber % 9;
}

export function readBestLevel(storage: ProgressStorage | undefined): number {
  try {
    const n = Number(storage?.getItem(STACK_BEST_LEVEL_KEY));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch { return 0; }
}

/** Remembers the farthest level the player has reached (started). Returns the new best. */
export function recordLevelReached(storage: ProgressStorage | undefined, level: number): number {
  const best = Math.min(ROAD_FINAL_STAGE, Math.max(readBestLevel(storage), Math.floor(level)));
  try { storage?.setItem(STACK_BEST_LEVEL_KEY, String(best)); } catch { /* storage optional */ }
  return best;
}

export function isDailyDone(storage: ProgressStorage | undefined, now: Date = new Date()): boolean {
  try { return storage?.getItem(STACK_DAILY_DONE_KEY) === dailySeed(now); } catch { return false; }
}

export function markDailyDone(storage: ProgressStorage | undefined, now: Date = new Date()): void {
  try { storage?.setItem(STACK_DAILY_DONE_KEY, dailySeed(now)); } catch { /* storage optional */ }
}

export function nextRouteTitle(route: StackRoute): string | null {
  if (route === 'daily' || route >= ROAD_FINAL_STAGE) return null;
  return `继续回家路 · 第 ${route + 1} 关`;
}

/** Whether the level-9 finale has been cleared at least once. */
export function isHomeDone(storage: ProgressStorage | undefined): boolean {
  try { return storage?.getItem(STACK_HOME_DONE_KEY) === '1'; } catch { return false; }
}

export function markHomeDone(storage: ProgressStorage | undefined): void {
  try { storage?.setItem(STACK_HOME_DONE_KEY, '1'); } catch { /* storage optional */ }
}

/** Home-screen progress: “回家进度 N/9”, or “已到家” once the finale is cleared. */
export function homeProgressLabel(storage: ProgressStorage | undefined): string {
  if (isHomeDone(storage)) return '已到家';
  const best = readBestLevel(storage);
  return best >= 2 ? `回家进度 ${best}/${ROAD_FINAL_STAGE}` : '';
}

export function browserStorage(): ProgressStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}
