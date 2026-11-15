import type { StackCard, StackLevel } from './stack-types';

export const STACK_DESIGN_WIDTH = 750;
/**
 * In-level screen plan (design y, 750 wide, page height H):
 *   0–124     top bar: “← 主页” pill | banner (stage · 年货三消 · remaining / subtitle) | sound button
 *   130–…     the pile, centred with ≥ STACK_BOARD_SIDE on each side
 *   …         the ride (25.5% of short pages, 28.5% of tall ones), fully above the prop buttons
 *   H-safe-72 prop buttons (60 tall), then a 12 margin and the gesture-bar safe area
 */
export const STACK_HUD_BOTTOM = 124;
/** First board row starts this far below the top bar. */
export const STACK_BOARD_TOP_GAP = 6;
/** Pages shorter than this (wider than 750:1160) letterbox instead of squeezing further. */
export const STACK_MIN_HEIGHT = 1160;
export const STACK_CARD_SIZE = 108;
export const STACK_CAR_SCALE_Y = 0.55;
export const STACK_ACTION_HEIGHT = 60;
/** Gap between the prop buttons and the safe-area bottom. */
export const STACK_ACTION_MARGIN = 12;
/** Design units kept clear on each side of the pile: 26/750 of the width ≥ 12px on a 360px phone. */
export const STACK_BOARD_SIDE = 26;
export const STACK_BODY_SIZE = {w: 1024, h: 640} as const;
export const STACK_BODY_HOLE = {left: 159, right: 878, top: 104, bottom: 425} as const;
export const STACK_BODY_SLICE = {top: 150, bottom: 380} as const;
/**
 * The open trunk lid is drawn 642×82 centred 34 above the car top and tilted 3°, so its corner
 * reaches 34 + 41·cos3° + 321·sin3° ≈ 92 above it.
 */
export const STACK_LID_RISE = 92;
/** Breathing room between the lowest card and the lid. */
export const STACK_BOARD_GAP = 8;
/** Minimum bottom margin (design units) kept clear for the Android gesture bar / iOS home indicator. */
export const STACK_MIN_SAFE_BOTTOM = 28;
/** The board never grows past this, so wide phones keep the approved card size. */
export const STACK_BOARD_MAX_SCALE = 1;

export interface StackRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Top bar, left to right with 12 between blocks: “← 主页” (home-exit.ts HOME_BUTTON), banner, sound. */
export const STACK_BANNER: StackRect = {x: 156, y: 14, w: 438, h: 102};
export const STACK_SOUND_BUTTON: StackRect = {x: 606, y: 38, w: 120, h: 54};
/** Second banner row (under the divider) holding the subtitle. */
export const STACK_SUBTITLE: StackRect = {x: 186, y: 74, w: 378, h: 28};
/** Sound popover (opens over the pile's top-right corner) and its two switches. */
export const STACK_SOUND_MENU: StackRect = {x: 556, y: 102, w: 170, h: 132};
export const STACK_SOUND_ROWS: readonly StackRect[] = [
  {x: 568, y: 114, w: 146, h: 50},
  {x: 568, y: 172, w: 146, h: 50},
];

export interface StackPageLayout {
  readonly height: number;
  readonly safeBottom: number;
  readonly actionY: number;
  readonly carBottom: number;
  readonly carTop: number;
  readonly bodyHeight: number;
  readonly trunk: StackRect;
  readonly stackTop: number;
  readonly stackBottom: number;
  readonly stackRatio: number;
  /** Uniform sedan scale used for this layout (1 = full size). */
  readonly carScale: number;
}

/** Converts a phone viewport to the 750-wide design coordinate used by StackPage. */
export function stackPageHeight(screenWidth: number, screenHeight: number): number {
  if (!(screenWidth > 0) || !(screenHeight > 0)) return STACK_MIN_HEIGHT;
  return Math.max(STACK_MIN_HEIGHT, screenHeight / screenWidth * STACK_DESIGN_WIDTH);
}

/** Shared, renderer-independent geometry for the board, car and bottom action row. */
/**
 * `vehicleTop` (design y of the top of a non-sedan ride's art) replaces the sedan's lid as the
 * lowest line the board may reach.
 */
/**
 * `carScale` shrinks the sedan uniformly around the page centre on short phones (the lid, hole and
 * body all follow), freeing board height so 375×667 keeps ≥44px cards.
 */
export function createStackPageLayout(height: number, safeBottom = 0, vehicleTop?: number, carScale = 1): StackPageLayout {
  safeBottom = Math.max(STACK_MIN_SAFE_BOTTOM, safeBottom);
  const actionY = height - safeBottom - STACK_ACTION_MARGIN - STACK_ACTION_HEIGHT;
  const bodyHeight = Math.round(STACK_BODY_SIZE.h * STACK_CAR_SCALE_Y * carScale);
  const carBottom = actionY - 16;
  const carTop = carBottom - bodyHeight;
  const trunk: StackRect = {
    x: Math.round((STACK_BODY_HOLE.left - STACK_BODY_SIZE.w / 2) * carScale + STACK_DESIGN_WIDTH / 2),
    y: carTop + Math.round(STACK_BODY_HOLE.top * STACK_CAR_SCALE_Y * carScale),
    w: Math.round((STACK_BODY_HOLE.right - STACK_BODY_HOLE.left) * carScale),
    h: Math.round((STACK_BODY_HOLE.bottom - STACK_BODY_HOLE.top) * STACK_CAR_SCALE_Y * carScale),
  };
  const stackTop = STACK_HUD_BOTTOM + STACK_BOARD_TOP_GAP;
  // Cards must stay above the open lid, not merely above the trunk hole.
  const stackBottom = (vehicleTop ?? carTop - STACK_LID_RISE * carScale) - STACK_BOARD_GAP;
  return {
    height,
    safeBottom,
    actionY,
    carBottom,
    carTop,
    bodyHeight,
    trunk,
    stackTop,
    stackBottom,
    stackRatio: Math.max(0, stackBottom - stackTop) / height,
    carScale,
  };
}

export function stackCardBounds(cards: readonly StackCard[]): {left: number; right: number; top: number; bottom: number} {
  if (!cards.length) return {left: 0, right: 0, top: 0, bottom: 0};
  return {
    left: Math.min(...cards.map(card => card.x)),
    right: Math.max(...cards.map(card => card.x + card.w)),
    top: Math.min(...cards.map(card => card.y)),
    bottom: Math.max(...cards.map(card => card.y + card.h)),
  };
}

/** Level-space → page-space mapping: page = offset + scale × level. */
export interface StackBoardFit {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const IDENTITY_BOARD: StackBoardFit = {scale: 1, offsetX: 0, offsetY: 0};

/**
 * Everything the board can ever show in level space: the dealt cards, the reserve shelf that
 * move-out fills, and where mom drops her goods. Fitting this box keeps later cards inside too.
 */
export function stackContentBounds(level: StackLevel): {left: number; right: number; top: number; bottom: number} {
  const reserve = Math.round(level.cardW * .72);
  const boxes = [
    ...level.cards,
    ...level.reservePositions.map(p => ({x: p.x, y: p.y, w: reserve, h: reserve})),
    ...level.momPositions.map(p => ({x: p.x, y: p.y, w: level.cardW, h: level.cardH})),
  ];
  return {
    left: Math.min(...boxes.map(b => b.x)),
    right: Math.max(...boxes.map(b => b.x + b.w)),
    top: Math.min(...boxes.map(b => b.y)),
    bottom: Math.max(...boxes.map(b => b.y + b.h)),
  };
}

/** Scales the board to the real space between the title bar and the trunk lid and centres it. */
export function fitStackBoard(
  bounds: {left: number; right: number; top: number; bottom: number},
  layout: StackPageLayout,
): StackBoardFit {
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const availableW = STACK_DESIGN_WIDTH - STACK_BOARD_SIDE * 2;
  const availableH = Math.max(1, layout.stackBottom - layout.stackTop);
  const scale = Math.min(STACK_BOARD_MAX_SCALE, availableW / width, availableH / height);
  return {
    scale,
    offsetX: (STACK_DESIGN_WIDTH - width * scale) / 2 - bounds.left * scale,
    offsetY: layout.stackTop + (availableH - height * scale) / 2 - bounds.top * scale,
  };
}

export function mapStackRect(fit: StackBoardFit, rect: StackRect): StackRect {
  return {x: fit.offsetX + rect.x * fit.scale, y: fit.offsetY + rect.y * fit.scale, w: rect.w * fit.scale, h: rect.h * fit.scale};
}

/** Page point → level point (inverse of mapStackRect), for hit-testing taps. */
export function unmapStackPoint(fit: StackBoardFit, x: number, y: number): {x: number; y: number} {
  return {x: (x - fit.offsetX) / fit.scale, y: (y - fit.offsetY) / fit.scale};
}

export function stackCardsAreVisible(
  cards: readonly StackCard[],
  layout: StackPageLayout,
  fit: StackBoardFit = IDENTITY_BOARD,
): boolean {
  const bounds = stackCardBounds(cards.map(card => ({...card, ...mapStackRect(fit, card)})));
  const eps = 0.5;
  return bounds.left >= STACK_BOARD_SIDE - eps
    && bounds.right <= STACK_DESIGN_WIDTH - STACK_BOARD_SIDE + eps
    && bounds.top >= layout.stackTop - eps
    && bounds.bottom <= layout.stackBottom + eps;
}
