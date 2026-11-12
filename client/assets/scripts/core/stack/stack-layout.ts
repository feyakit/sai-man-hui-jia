import type { StackCard, StackLevel } from './stack-types';

export const STACK_DESIGN_WIDTH = 750;
export const STACK_HUD_BOTTOM = 140;
export const STACK_MIN_HEIGHT = 1334;
export const STACK_CARD_SIZE = 108;
export const STACK_CAR_SCALE_Y = 0.55;
export const STACK_ACTION_HEIGHT = 68;
export const STACK_BODY_SIZE = {w: 1024, h: 640} as const;
export const STACK_BODY_HOLE = {left: 159, right: 878, top: 104, bottom: 425} as const;
export const STACK_BODY_SLICE = {top: 150, bottom: 380} as const;
/** The open trunk lid is drawn 82 tall centred 34 above the car top, so it reaches 75 above it. */
export const STACK_LID_RISE = 75;
/** Breathing room between the lowest card and the lid. */
export const STACK_BOARD_GAP = 10;
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
}

/** Converts a phone viewport to the 750-wide design coordinate used by StackPage. */
export function stackPageHeight(screenWidth: number, screenHeight: number): number {
  if (!(screenWidth > 0) || !(screenHeight > 0)) return STACK_MIN_HEIGHT;
  return Math.max(STACK_MIN_HEIGHT, screenHeight / screenWidth * STACK_DESIGN_WIDTH);
}

/** Shared, renderer-independent geometry for the board, car and bottom action row. */
export function createStackPageLayout(height: number, safeBottom = 0): StackPageLayout {
  safeBottom = Math.max(STACK_MIN_SAFE_BOTTOM, safeBottom);
  const actionY = height - safeBottom - 20 - STACK_ACTION_HEIGHT;
  const bodyHeight = Math.round(STACK_BODY_SIZE.h * STACK_CAR_SCALE_Y);
  const carBottom = actionY - 26;
  const carTop = carBottom - bodyHeight;
  const trunk: StackRect = {
    x: Math.round((STACK_BODY_HOLE.left - STACK_BODY_SIZE.w / 2) + STACK_DESIGN_WIDTH / 2),
    y: carTop + Math.round(STACK_BODY_HOLE.top * STACK_CAR_SCALE_Y),
    w: STACK_BODY_HOLE.right - STACK_BODY_HOLE.left,
    h: Math.round((STACK_BODY_HOLE.bottom - STACK_BODY_HOLE.top) * STACK_CAR_SCALE_Y),
  };
  const stackTop = STACK_HUD_BOTTOM;
  // Cards must stay above the open lid, not merely above the trunk hole.
  const stackBottom = carTop - STACK_LID_RISE - STACK_BOARD_GAP;
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
  const availableW = STACK_DESIGN_WIDTH - 16;
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
  return bounds.left >= -eps
    && bounds.right <= STACK_DESIGN_WIDTH + eps
    && bounds.top >= layout.stackTop - eps
    && bounds.bottom <= layout.stackBottom + eps;
}
