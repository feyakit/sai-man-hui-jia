import { describe, expect, it } from 'vitest';
import { CONFIRM_TEXT, HOME_BUTTON, HOME_BUTTON_CLASSIC, confirmLayout, exitNeedsConfirm, inExitRect } from '../client/assets/scripts/core/home-exit';
import { STACK_HUD_BOTTOM } from '../client/assets/scripts/core/stack/stack-layout';

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
