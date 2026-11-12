import { GAME_TITLE } from '../../config/brand';
import { provinceLabel } from '../rank/rank';

export const STACK_SHARE_WIDTH = 1080;
export const STACK_SHARE_HEIGHT = 1440;
export const STACK_SHARE_TITLE = `《${GAME_TITLE}》`;
/** Above this many unpacked goods the share card calls the trunk overloaded instead of counting down. */
export const STACK_SHARE_BACKLOG_THRESHOLD = 30;

/** Goods visible in both the generated share card and the finish-screen trunk. */
export const STACK_SHARE_ITEM_KEYS = [
  'mandarin', 'duck', 'fruitbasket', 'milk', 'suitcase_l', 'toycar', 'oven',
] as const;

/** Normalized cargo layout (x, y, rotation) inside the trunk opening, from top-left. */
export const STACK_CARGO_POSITIONS = [
  [0.18, 0.34, 0.12], [0.39, 0.29, -0.10], [0.61, 0.34, 0.09], [0.82, 0.28, -0.12],
  [0.28, 0.72, -0.08], [0.52, 0.78, 0.06], [0.76, 0.72, -0.06],
] as const;

export const STACK_SHARE_CAPTIONS = [
  '年货塞满，平安到家',
  '今年的后备箱，装的都是爱',
  '满满一车年味，奔赴团圆',
  '车尾装不下，家里的牵挂装得下',
  '一路顺风，回家过年',
] as const;

export interface StackShareWinStats {
  readonly elapsedSec: number;
  readonly boxes: number;
}

export type StackShareResult =
  | ({ readonly victory: true } & StackShareWinStats)
  | { readonly victory: false; readonly remaining: number };

export interface StackShareCopy {
  readonly title: string;
  readonly stageText: string;
  readonly statsText: string;
  readonly caption: string;
}

function safeInteger(value: number, minimum = 0): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.round(value));
}

export function formatStackShareStats(result: StackShareResult): string {
  if (result.victory) {
    return `用时 ${safeInteger(result.elapsedSec, 1)} 秒 · 打包 ${safeInteger(result.boxes)} 箱`;
  }
  const remaining = safeInteger(result.remaining);
  if (remaining > STACK_SHARE_BACKLOG_THRESHOLD) return '后备箱塞爆了，年货还剩一大堆';
  return `差 ${remaining} 件就塞满`;
}

export function formatStackShareStage(stage: number): string {
  return `第 ${safeInteger(stage, 1)} 关`;
}

export function pickStackShareCaption(random: () => number = Math.random): string {
  const drawn = random();
  const value = Number.isFinite(drawn) ? Math.max(0, Math.min(0.999999, drawn)) : 0;
  return STACK_SHARE_CAPTIONS[Math.floor(value * STACK_SHARE_CAPTIONS.length)];
}

export function createStackShareCopy(
  stage: number,
  result: StackShareResult,
  random: () => number = Math.random,
): StackShareCopy {
  return {
    title: STACK_SHARE_TITLE,
    stageText: formatStackShareStage(stage),
    statsText: formatStackShareStats(result),
    caption: pickStackShareCaption(random),
  };
}

const HOMECOMING_CAPTIONS = [
  '9 关回家路走完了，爸妈就在门口',
  '一车年货塞满到家，过年好！',
  '拖拉机开到家门口，鞭炮已经响了',
] as const;

/** Copy for the level-9 finale card: “到家了！” instead of the usual title, plus a homecoming line. */
export function createStackHomecomingCopy(result: StackShareResult, random: () => number = Math.random): StackShareCopy {
  return {
    title: '到家了！',
    stageText: '第 9 关 · 到家了',
    statsText: formatStackShareStats(result),
    caption: HOMECOMING_CAPTIONS[Math.min(HOMECOMING_CAPTIONS.length - 1, Math.floor(random() * HOMECOMING_CAPTIONS.length))],
  };
}

export function stackShareFileName(stage: number, victory: boolean): string {
  return `${GAME_TITLE}-第${safeInteger(stage, 1)}关-${victory ? '胜利' : '差一点'}.png`;
}

/** Trial-site address printed on every share card. */
export const STACK_SHARE_LINK = 'feyakit.github.io/smhj-play';

const FAIL_TAUNTS = [
  (place: string) => `${place}还差我一箱`,
  (place: string) => `${place}的年货，还差我这一车`,
  (place: string) => `差一点就为${place}塞满了`,
] as const;

/**
 * Province line on the share card: a win claims “+1” (and the rank once the board answered),
 * a loss taunts the player's province. No province chosen → no line.
 */
export function formatStackShareProvince(
  province: string | null | undefined,
  victory: boolean,
  rank: number | null = null,
  random: () => number = Math.random,
  /** Levels the board does not count (3+, debug runs) never claim a “+1”. */
  counted = true,
): string | null {
  if (!province) return null;
  const place = provinceLabel(province);
  if (victory && !counted) return `我替${place}把年货装满一车了`;
  if (victory) return rank === null ? `我为${place}${GAME_TITLE} +1` : `我为${place}${GAME_TITLE} +1，${place}排第 ${rank}`;
  const drawn = random();
  const value = Number.isFinite(drawn) ? Math.max(0, Math.min(0.999999, drawn)) : 0;
  return FAIL_TAUNTS[Math.floor(value * FAIL_TAUNTS.length)](place);
}

export function formatStackShareVehicle(name: string | null | undefined): string | null {
  return name ? `本关座驾：${name}` : null;
}
