// Pure vertical layout of the title screen (design px, 750 wide), shared by HomePage and tests.
export const CAR_WIDTH = 700;
export const CAR_HEIGHT = 438;
export const START_WIDTH = 600;
export const START_HEIGHT = 88;
export const CLASSIC_WIDTH = 360;
export const CLASSIC_HEIGHT = 66;
export const PROVINCE_Y = 362;
export const PROVINCE_HEIGHT = 56;
export const RULES_HEIGHT = 96;
export const PROGRESS_HEIGHT = 50;
export const TAG_HEIGHT = 44;

/** Vertical slots of the title screen, in design px from the top. Bottom controls anchor to the bottom edge,
 * the title and province pill to the top; the car scales into whatever is left so nothing ever overlaps. */
export interface HomeLayoutSlots {
  readonly province: number;
  readonly carTop: number;
  readonly carScale: number;
  readonly tag: number;
  readonly progress: number;
  readonly rules: number;
  readonly rank: number;
  readonly start: number;
  readonly classic: number;
}

export function homeLayoutSlots(height: number): HomeLayoutSlots {
  const classic = height - 70 - CLASSIC_HEIGHT;
  const start = classic - 22 - START_HEIGHT;
  const rank = start - 26 - 58;
  const rules = rank - 24 - RULES_HEIGHT;
  const progress = rules - 18 - PROGRESS_HEIGHT;
  const areaTop = PROVINCE_Y + PROVINCE_HEIGHT + 14;
  const areaBottom = progress - 10 - TAG_HEIGHT;
  const carScale = Math.max(.5, Math.min(1, (areaBottom - areaTop) / CAR_HEIGHT));
  const carTop = Math.round(areaTop + Math.max(0, areaBottom - areaTop - CAR_HEIGHT * carScale) / 2);
  return {province: PROVINCE_Y, carTop, carScale, tag: carTop + CAR_HEIGHT * carScale + 4, progress, rules, rank, start, classic};
}

