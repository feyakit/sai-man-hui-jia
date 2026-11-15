// Pure geometry + rules for the in-game “← 主页” button and its confirm dialog (design px, 750 wide).

export interface ExitRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Left block of the match-3 top bar (banner at x 156–594, sound button at 606–726, all centred on y 65). */
export const HOME_BUTTON: ExitRect = {x:24, y:38, w:120, h:54};
/** Classic mode banner is one line taller; the pill sits on the title row instead. */
export const HOME_BUTTON_CLASSIC: ExitRect = {x:44, y:40, w:128, h:42};

export const CONFIRM_TEXT = '回主页会放弃本局，确定吗？';

/** Confirm panel and its two buttons for a page of the given design height. */
export function confirmLayout(height: number): {panel: ExitRect; confirm: ExitRect; cancel: ExitRect} {
  const panel = {x:95, y:Math.round(height / 2 - 170), w:560, h:340};
  return {
    panel,
    confirm:{x:panel.x + 40, y:panel.y + 220, w:225, h:76},
    cancel:{x:panel.x + panel.w - 265, y:panel.y + 220, w:225, h:76},
  };
}

/** Whether leaving needs the confirm dialog: only while a round is under way and something was played. */
export function exitNeedsConfirm(state: {playing: boolean; moves: number}): boolean {
  return state.playing && state.moves > 0;
}

export function inExitRect(rect: ExitRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
