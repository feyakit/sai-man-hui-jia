import { describe, expect, it } from 'vitest';
import {
  STACK_SHARE_CAPTIONS,
  STACK_SHARE_HEIGHT,
  STACK_SHARE_TITLE,
  STACK_SHARE_WIDTH,
  createStackShareCopy,
  formatStackShareStage,
  formatStackShareStats,
  pickStackShareCaption,
  stackShareFileName,
} from '../client/assets/scripts/core/stack/stack-share';

describe('stack share copy', () => {
  it('formats victory and failure statistics without browser state', () => {
    expect(formatStackShareStats({victory:true,elapsedSec:18,boxes:6})).toBe('用时 18 秒 · 打包 6 箱');
    expect(formatStackShareStats({victory:true,elapsedSec:NaN,boxes:-3})).toBe('用时 1 秒 · 打包 0 箱');
    expect(formatStackShareStats({victory:false,remaining:17})).toBe('差 17 件就塞满');
    expect(formatStackShareStats({victory:false,remaining:NaN})).toBe('差 0 件就塞满');
    expect(formatStackShareStage(2)).toBe('第 2 关');
    expect(formatStackShareStage(-1)).toBe('第 1 关');
  });

  it('picks only festive captions deterministically', () => {
    expect(pickStackShareCaption(() => 0)).toBe(STACK_SHARE_CAPTIONS[0]);
    expect(pickStackShareCaption(() => 0.999)).toBe(STACK_SHARE_CAPTIONS.at(-1));
    expect(pickStackShareCaption(() => Number.NaN)).toBe(STACK_SHARE_CAPTIONS[0]);
    const copy = createStackShareCopy(1, {victory:true,elapsedSec:32,boxes:3}, () => 0.4);
    expect(copy.title).toBe(STACK_SHARE_TITLE);
    expect(copy.stageText).toBe('第 1 关');
    expect(copy.statsText).toBe('用时 32 秒 · 打包 3 箱');
    expect(STACK_SHARE_CAPTIONS).toContain(copy.caption);
  });

  it('uses a portrait share canvas and safe file name', () => {
    expect(STACK_SHARE_WIDTH).toBe(1080);
    expect(STACK_SHARE_HEIGHT).toBe(1440);
    expect(STACK_SHARE_WIDTH / STACK_SHARE_HEIGHT).toBeCloseTo(3 / 4);
    expect(stackShareFileName(2, false)).toBe('塞满回家-第2关-差一点.png');
  });
});
