import type {StackRect} from './stack-layout';

/** One level, one ride home: every level swaps the vehicle and with it the whole bottom of the page. */
export type VehicleKey = 'moto' | 'trike' | 'sedan' | 'suv' | 'van' | 'pickup' | 'truck' | 'bus' | 'tractor';

export type Rgb = readonly [number, number, number];

/** A load area on the vehicle art, in 0..1 fractions of the art's width/height. */
export interface VehicleRegion {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Container drawn behind the cards in this region. */
  readonly style: 'box' | 'bag' | 'bed' | 'hatch' | 'door';
}

export interface VehiclePalette {
  /** Prop buttons and slot-label plate. */
  readonly panel: Rgb;
  readonly accent: Rgb;
  readonly text: Rgb;
  /** Inside of the cargo container. */
  readonly well: Rgb;
}

export interface VehicleDef {
  readonly key: VehicleKey;
  readonly name: string;
  /** Slot label prefix, e.g. “摩托后尾箱”. */
  readonly container: string;
  /** resources path; the sedan keeps its 3-piece art and draws itself. */
  readonly art: string | null;
  /** Art pixel size (after keying/cropping). */
  readonly artSize: {readonly w: number; readonly h: number};
  /** Drawn height in design units; width follows the aspect times stretchX. */
  readonly height: number;
  readonly stretchX?: number;
  readonly regions: readonly VehicleRegion[];
  /** Cells per region for a given capacity; default spreads proportionally to region area. */
  readonly split?: Readonly<Record<number, readonly number[]>>;
  readonly palette: VehiclePalette;
}

const RED_GOLD: VehiclePalette = {panel: [118, 22, 30], accent: [246, 195, 67], text: [255, 233, 180], well: [28, 18, 20]};

export const VEHICLES: readonly VehicleDef[] = [
  {
    key: 'moto', name: '摩托车', container: '摩托后尾箱+挂包', art: 'vehicles/moto', artSize: {w: 548, h: 678}, height: 540,
    regions: [
      {x: .13, y: .325, w: .74, h: .165, style: 'box'},
      {x: 0, y: .56, w: .35, h: .32, style: 'bag'},
      {x: .65, y: .56, w: .35, h: .32, style: 'bag'},
    ],
    split: {7: [3, 2, 2], 8: [4, 2, 2], 9: [3, 3, 3]},
    palette: RED_GOLD,
  },
  {
    key: 'trike', name: '电动三轮', container: '三轮车斗', art: 'vehicles/trike', artSize: {w: 646, h: 670}, height: 540,
    regions: [{x: .09, y: .34, w: .82, h: .36, style: 'bed'}],
    palette: {panel: [126, 26, 30], accent: [255, 206, 92], text: [255, 236, 190], well: [36, 32, 34]},
  },
  {
    key: 'sedan', name: '红色轿车', container: '轿车后备箱', art: null, artSize: {w: 1024, h: 640}, height: 0,
    regions: [],
    palette: RED_GOLD,
  },
  {
    key: 'suv', name: 'SUV', container: 'SUV 后备箱', art: 'vehicles/suv', artSize: {w: 682, h: 665}, height: 540,
    regions: [{x: .15, y: .30, w: .70, h: .40, style: 'hatch'}],
    palette: {panel: [92, 62, 40], accent: [240, 206, 140], text: [255, 241, 214], well: [30, 28, 30]},
  },
  {
    key: 'van', name: '面包车', container: '面包车后门', art: 'vehicles/van', artSize: {w: 527, h: 680}, height: 540, stretchX: 1.45,
    regions: [{x: .07, y: .40, w: .52, h: .42, style: 'door'}],
    palette: {panel: [70, 72, 84], accent: [226, 60, 52], text: [250, 246, 240], well: [34, 34, 40]},
  },
  {
    key: 'pickup', name: '皮卡', container: '皮卡货斗', art: 'vehicles/pickup', artSize: {w: 706, h: 646}, height: 560,
    regions: [{x: .09, y: .41, w: .82, h: .31, style: 'bed'}],
    palette: {panel: [60, 60, 66], accent: [214, 40, 44], text: [245, 240, 236], well: [24, 24, 28]},
  },
  {
    key: 'truck', name: '小货车', container: '货车车厢', art: 'vehicles/truck', artSize: {w: 770, h: 625}, height: 540,
    regions: [{x: .10, y: .38, w: .80, h: .32, style: 'bed'}],
    palette: {panel: [30, 64, 132], accent: [255, 200, 80], text: [236, 244, 255], well: [52, 38, 30]},
  },
  {
    key: 'bus', name: '大巴车', container: '大巴行李舱', art: 'vehicles/bus', artSize: {w: 519, h: 661}, height: 540,
    regions: [{x: .10, y: .50, w: .80, h: .30, style: 'hatch'}],
    palette: {panel: [128, 20, 28], accent: [255, 214, 120], text: [255, 238, 200], well: [26, 24, 30]},
  },
  {
    key: 'tractor', name: '拖拉机', container: '拖拉机拖斗', art: 'vehicles/tractor', artSize: {w: 457, h: 647}, height: 540,
    regions: [{x: .06, y: .46, w: .88, h: .30, style: 'bed'}],
    palette: {panel: [44, 88, 48], accent: [244, 198, 74], text: [240, 255, 228], well: [40, 30, 26]},
  },
];

/** Later laps through the garage repaint the same rides (tint multiplies the red-gold art). */
const LAP_TINTS: readonly (Rgb | null)[] = [null, [255, 226, 160], [196, 214, 255], [214, 255, 214]];
const LAP_NAMES = ['', '金色', '蓝色', '青色'];

export interface LevelVehicle {
  readonly def: VehicleDef;
  readonly lap: number;
  readonly tint: Rgb | null;
  /** Display name including the lap colour, e.g. “金色摩托车”. */
  readonly displayName: string;
}

export function vehicleByKey(key: string): VehicleDef | undefined {
  return VEHICLES.find(vehicle => vehicle.key === key);
}

/** Level 1 starts on the motorcycle; after the list runs out it repeats with a new colour. */
export function vehicleForLevel(level: number): LevelVehicle {
  const index = Math.max(0, Math.floor(level) - 1);
  const def = VEHICLES[index % VEHICLES.length];
  const lap = Math.floor(index / VEHICLES.length);
  const tint = def.art ? LAP_TINTS[lap % LAP_TINTS.length] : null;
  const colour = def.art ? LAP_NAMES[lap % LAP_NAMES.length] : '';
  return {def, lap, tint, displayName: `${colour}${def.name}`};
}

export function vehicleSlotLabel(def: VehicleDef, capacity: number): string {
  return `${def.container} · ${capacity} 格`;
}

/**
 * The art is bottom-anchored so its wheels tuck behind the prop buttons (starting at `actionY`),
 * but never so low that a cargo cell slips under them.
 */
export function vehicleArtRect(def: VehicleDef, actionY: number, designWidth = 750): StackRect {
  const h = def.height;
  const w = h * def.artSize.w / def.artSize.h * (def.stretchX ?? 1);
  const lowestCargo = Math.max(0, ...def.regions.map(region => region.y + region.h));
  const bottom = Math.min(actionY + 80, actionY - 12 + (1 - lowestCargo) * h);
  return {x: (designWidth - w) / 2, y: bottom - h, w, h};
}

export function vehicleRegionRects(def: VehicleDef, art: StackRect): StackRect[] {
  return def.regions.map(region => ({
    x: art.x + region.x * art.w,
    y: art.y + region.y * art.h,
    w: region.w * art.w,
    h: region.h * art.h,
  }));
}

function regionSplit(def: VehicleDef, capacity: number, rects: readonly StackRect[]): number[] {
  const given = def.split?.[capacity];
  if (given && given.length === rects.length && given.reduce((a, b) => a + b, 0) === capacity) return [...given];
  if (rects.length === 1) return [capacity];
  const areas = rects.map(rect => rect.w * rect.h);
  const total = areas.reduce((a, b) => a + b, 0);
  const counts = areas.map(area => Math.max(1, Math.floor(capacity * area / total)));
  let index = 0;
  while (counts.reduce((a, b) => a + b, 0) < capacity) counts[index++ % counts.length]++;
  return counts;
}

const SLOT_GAP = 4;
const MAX_CELL = 96;

function bestGrid(rect: StackRect, count: number): {rows: number; cols: number; cell: number} {
  let best = {rows: 1, cols: count, cell: 0};
  for (let rows = 1; rows <= count; rows++) {
    const cols = Math.ceil(count / rows);
    const cell = Math.min((rect.w - (cols - 1) * SLOT_GAP) / cols, (rect.h - (rows - 1) * SLOT_GAP) / rows);
    if (cell > best.cell + .01) best = {rows, cols, cell};
  }
  return best;
}

/**
 * Slot cells laid out inside the vehicle's load areas, one uniform cell size for the whole
 * vehicle, region by region and row by row (that is the slot order the rules see).
 */
export function vehicleSlotCells(def: VehicleDef, capacity: number, art: StackRect): StackRect[] {
  const rects = vehicleRegionRects(def, art);
  const split = regionSplit(def, capacity, rects);
  const grids = rects.map((rect, index) => bestGrid(rect, split[index]));
  const cell = Math.floor(Math.min(MAX_CELL, ...grids.map(grid => grid.cell)));
  const cells: StackRect[] = [];
  rects.forEach((rect, index) => {
    const count = split[index];
    const {rows, cols} = grids[index];
    const usedRows = Math.ceil(count / cols);
    const gridH = usedRows * cell + (usedRows - 1) * SLOT_GAP;
    const top = rect.y + (rect.h - gridH) / 2;
    for (let row = 0; row < rows; row++) {
      const inRow = Math.min(cols, count - row * cols);
      if (inRow <= 0) break;
      const rowW = inRow * cell + (inRow - 1) * SLOT_GAP;
      const left = rect.x + (rect.w - rowW) / 2;
      for (let col = 0; col < inRow; col++) {
        cells.push({x: Math.round(left + col * (cell + SLOT_GAP)), y: Math.round(top + row * (cell + SLOT_GAP)), w: cell, h: cell});
      }
    }
  });
  return cells;
}

/** Sedan: one row inside the trunk hole, shrinking the cells for 8–9 slots. */
export function sedanSlotCells(trunk: StackRect, capacity: number, designWidth = 750): StackRect[] {
  const gap = 3;
  const cell = Math.min(96, Math.floor((trunk.w - 20 - (capacity - 1) * gap) / capacity));
  const width = capacity * cell + (capacity - 1) * gap;
  const x0 = Math.round((designWidth - width) / 2);
  const y = trunk.y + Math.round((trunk.h - cell) / 2);
  return Array.from({length: capacity}, (_, index) => ({x: x0 + index * (cell + gap), y, w: cell, h: cell}));
}
