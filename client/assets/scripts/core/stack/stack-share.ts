import { GAME_TITLE } from '../../config/brand';

export const STACK_SHARE_WIDTH = 1080;
export const STACK_SHARE_HEIGHT = 1440;
export const STACK_SHARE_TITLE = `《${GAME_TITLE}》`;

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
  return `差 ${safeInteger(result.remaining)} 件就塞满`;
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

export function stackShareFileName(stage: number, victory: boolean): string {
  return `${GAME_TITLE}-第${safeInteger(stage, 1)}关-${victory ? '胜利' : '差一点'}.png`;
}
