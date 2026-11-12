import type { StackCard } from './stack-types';

export const STACK_DESIGN_WIDTH = 750;
export const STACK_HUD_BOTTOM = 140;
export const STACK_MIN_HEIGHT = 1334;
export const STACK_CARD_SIZE = 108;
export const STACK_CAR_SCALE_Y = 0.55;
export const STACK_ACTION_HEIGHT = 68;
export const STACK_BODY_SIZE = {w: 1024, h: 640} as const;
export const STACK_BODY_HOLE = {left: 159, right: 878, top: 104, bottom: 425} as const;
export const STACK_BODY_SLICE = {top: 150, bottom: 380} as const;

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
  const actionY = height - Math.max(0, safeBottom) - 20 - STACK_ACTION_HEIGHT;
  const bodyHeight = Math.round(STACK_BODY_SIZE.h * STACK_CAR_SCALE_Y);
  const carBottom = actionY - 52;
  const carTop = carBottom - bodyHeight;
  const trunk: StackRect = {
    x: Math.round((STACK_BODY_HOLE.left - STACK_BODY_SIZE.w / 2) + STACK_DESIGN_WIDTH / 2),
    y: carTop + Math.round(STACK_BODY_HOLE.top * STACK_CAR_SCALE_Y),
    w: STACK_BODY_HOLE.right - STACK_BODY_HOLE.left,
    h: Math.round((STACK_BODY_HOLE.bottom - STACK_BODY_HOLE.top) * STACK_CAR_SCALE_Y),
  };
  const stackTop = STACK_HUD_BOTTOM;
  const stackBottom = trunk.y;
  return {
    height,
    safeBottom: Math.max(0, safeBottom),
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

export function stackCardsAreVisible(
  cards: readonly StackCard[],
  layout: StackPageLayout,
): boolean {
  const bounds = stackCardBounds(cards);
  return bounds.left >= 0
    && bounds.right <= STACK_DESIGN_WIDTH
    && bounds.top >= layout.stackTop
    && bounds.bottom <= layout.stackBottom;
}
