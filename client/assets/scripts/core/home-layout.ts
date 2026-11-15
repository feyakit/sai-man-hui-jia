// Pure layout of the poster home screen, shared by HomePage and tests.
// Every coordinate is in design px (750 wide) and is measured on the approved mockup
// (tools/home-poster-src/home-mockup.jpg scaled to 750x1334), so at 750x1334 the screen reproduces it 1:1.
// Taller phones keep every block at mockup size and spread the extra height between the blocks.

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export const BASE_HEIGHT = 1334;

/** Painted sprites: where each PNG sits on the 750x1334 mockup frame. */
export const ART_RECTS = {
  help: {x:672, y:24, w:66, h:66},
  plaque: {x:0, y:40, w:750, h:305},
  car: {x:52, y:372, w:656, h:484},
  road: {x:55, y:820, w:657, h:170},
  start: {x:105, y:995, w:545, h:130},
  coins: [
    {x:90, y:1130, w:158, h:162},
    {x:298, y:1130, w:158, h:162},
    {x:508, y:1130, w:158, h:162},
  ],
} as const;

/** Tight, non-overlapping hit/layout boxes on the same frame. */
export const HIT_RECTS = {
  help: {x:672, y:24, w:66, h:66},
  plaque: {x:96, y:82, w:560, h:172},
  seal: {x:314, y:257, w:126, h:48},
  car: {x:79, y:386, w:592, h:452},
  road: {x:58, y:850, w:512, h:104},
  house: {x:570, y:842, w:130, h:108},
  progress: {x:545, y:955, w:150, h:34},
  restart: {x:172, y:968, w:120, h:28},
  start: {x:158, y:1003, w:438, h:114},
  coins: [
    {x:94, y:1132, w:150, h:158},
    {x:302, y:1132, w:150, h:158},
    {x:512, y:1132, w:150, h:158},
  ],
} as const;

/** Couplet scrolls: PNG size and the edge they hug (right edge of the left scroll stays clear of the car). */
export const COUPLET_ART = {w:90, h:576} as const;
export const COUPLET_RIGHT_ART = {w:92, h:576} as const;
export const COUPLET_TOP = 338;
export const COUPLET_CAR_GAP = 2;

/** Plate on car_poster.png (art px). */
export const CAR_PLATE = {x:241, y:322, w:164, h:46} as const;

/** Small car marker that sits on the start pin, then on the lit milestone. */
export const MARKER_ART = {x:62, y:878, w:62, h:44} as const;

/** Nine milestone dots on road_home.png (art px, relative to the road sprite). */
export const ROAD_MILESTONES: readonly {readonly x: number; readonly y: number}[] = [
  {x:87.6, y:89.2}, {x:138.8, y:69.1}, {x:192.9, y:64.5}, {x:241.7, y:85.4}, {x:289.3, y:113.0},
  {x:341.3, y:125.0}, {x:394.5, y:115.7}, {x:445.7, y:96.4}, {x:500.1, y:87.8},
];

/** Where labels sit (design px on the mockup frame). */
export const LABEL_POINTS = {
  seal: {x:377, y:281},
  progress: {x:620, y:972},
  restart: {x:232, y:982},
  start: {x:377, y:1059},
  coinLabelY: 1263,
} as const;

export interface HomeLayoutSlots {
  /** Vertical offsets added to each mockup band. */
  readonly top: number;
  readonly help: number;
  readonly car: number;
  readonly road: number;
  readonly start: number;
  readonly coins: number;
  readonly coupletTop: number;
  readonly coupletScale: number;
}

/** How far each band moves down on a screen taller than the mockup; spacing grows, sizes stay. */
export function homeLayoutSlots(height: number): HomeLayoutSlots {
  const extra = Math.max(0, height - BASE_HEIGHT);
  const top = extra * .16;
  const car = extra * .42;
  const road = extra * .6;
  const start = extra * .76;
  const coins = extra * .9;
  const coupletTop = COUPLET_TOP + top + (car - top) * .3;
  const limit = Math.min(HIT_RECTS.car.y + HIT_RECTS.car.h + car, HIT_RECTS.house.y + road) - 4;
  const coupletScale = Math.min(1, (limit - coupletTop) / COUPLET_ART.h);
  return {top, help:extra * .08, car, road, start, coins, coupletTop, coupletScale};
}

const shift = (r: Rect, dy: number): Rect => ({x:r.x, y:r.y + dy, w:r.w, h:r.h});

/** Every tight box for a given design height (the poster's own overlap contract). */
export function homeBoxes(height: number, withRestart: boolean): Record<string, Rect> {
  const s = homeLayoutSlots(height);
  const cw = COUPLET_ART.w * s.coupletScale;
  const crw = COUPLET_RIGHT_ART.w * s.coupletScale;
  const ch = COUPLET_ART.h * s.coupletScale;
  const carLeft = HIT_RECTS.car.x;
  const carRight = HIT_RECTS.car.x + HIT_RECTS.car.w;
  const boxes: Record<string, Rect> = {
    help:shift(HIT_RECTS.help, s.help),
    plaque:shift(HIT_RECTS.plaque, s.top),
    seal:shift(HIT_RECTS.seal, s.top),
    coupletLeft:{x:carLeft - COUPLET_CAR_GAP - cw, y:s.coupletTop, w:cw, h:ch},
    coupletRight:{x:carRight + COUPLET_CAR_GAP, y:s.coupletTop, w:crw, h:ch},
    car:shift(HIT_RECTS.car, s.car),
    road:shift(HIT_RECTS.road, s.road),
    house:shift(HIT_RECTS.house, s.road),
    progress:shift(HIT_RECTS.progress, s.road),
    start:shift(HIT_RECTS.start, s.start),
    rank:shift(HIT_RECTS.coins[0], s.coins),
    daily:shift(HIT_RECTS.coins[1], s.coins),
    classic:shift(HIT_RECTS.coins[2], s.coins),
  };
  if (withRestart) boxes.restart = shift(HIT_RECTS.restart, s.road);
  return boxes;
}
