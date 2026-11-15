import { describe, expect, it } from 'vitest';
import { CONFIRM_TEXT, HOME_BUTTON, HOME_BUTTON_CLASSIC, confirmLayout, exitNeedsConfirm, inExitRect } from '../client/assets/scripts/core/home-exit';
import { STACK_BANNER, STACK_HUD_BOTTOM, STACK_SOUND_BUTTON, STACK_SUBTITLE } from '../client/assets/scripts/core/stack/stack-layout';

describe('in-game home button', () => {
  it('asks only while a round is under way and something was played', () => {
    expect(exitNeedsConfirm({playing:true,moves:3})).toBe(true);
    expect(exitNeedsConfirm({playing:true,moves:0})).toBe(false);
    expect(exitNeedsConfirm({playing:false,moves:9})).toBe(false);
    expect(CONFIRM_TEXT).toBe('回主页会放弃本局，确定吗？');
  });

  it('sits at the top-left inside the HUD banner', () => {
    expect(HOME_BUTTON.x + HOME_BUTTON.w).toBeLessThan(375);
    expect(HOME_BUTTON.y + HOME_BUTTON.h).toBeLessThanOrEqual(STACK_HUD_BOTTOM);
    expect(HOME_BUTTON_CLASSIC.x + HOME_BUTTON_CLASSIC.w).toBeLessThan(260); // clear of the centred title
    expect(Math.min(HOME_BUTTON.w,HOME_BUTTON.h,HOME_BUTTON_CLASSIC.h)).toBeGreaterThanOrEqual(40); // finger-sized
  });

  it('shares the match-3 top bar with the banner and the sound button without touching either', () => {
    const row = [HOME_BUTTON, STACK_BANNER, STACK_SOUND_BUTTON];
    for (let i = 1; i < row.length; i++) expect(row[i].x - (row[i - 1].x + row[i - 1].w)).toBe(12);
    expect(HOME_BUTTON.x).toBeGreaterThanOrEqual(24);
    expect(750 - STACK_SOUND_BUTTON.x - STACK_SOUND_BUTTON.w).toBe(HOME_BUTTON.x);
    for (const block of row) expect(block.y + block.h / 2).toBe(STACK_BANNER.y + STACK_BANNER.h / 2);
    // The subtitle is the banner's second row; the bar ends above the pile.
    expect(STACK_SUBTITLE.x).toBeGreaterThanOrEqual(STACK_BANNER.x);
    expect(STACK_SUBTITLE.x + STACK_SUBTITLE.w).toBeLessThanOrEqual(STACK_BANNER.x + STACK_BANNER.w);
    expect(STACK_SUBTITLE.y + STACK_SUBTITLE.h).toBeLessThanOrEqual(STACK_BANNER.y + STACK_BANNER.h);
    expect(STACK_BANNER.y + STACK_BANNER.h).toBeLessThanOrEqual(STACK_HUD_BOTTOM);
  });

  it('centres the confirm dialog with two separate buttons', () => {
    for (const height of [1334,1623]) {
      const {panel,confirm,cancel} = confirmLayout(height);
      expect(panel.x + panel.w / 2).toBe(375);
      expect(Math.abs(panel.y + panel.h / 2 - height / 2)).toBeLessThanOrEqual(1);
      expect(confirm.x + confirm.w).toBeLessThan(cancel.x);
      for (const b of [confirm,cancel]) expect(inExitRect(panel,b.x,b.y) && inExitRect(panel,b.x + b.w,b.y + b.h)).toBe(true);
      expect(inExitRect(confirm,cancel.x + 5,cancel.y + 5)).toBe(false);
    }
  });
});
