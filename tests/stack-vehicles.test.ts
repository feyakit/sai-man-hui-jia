import { plateBox } from '../client/assets/scripts/core/plate';
import {describe, expect, it} from 'vitest';
import {createStackPageLayout} from '../client/assets/scripts/core/stack/stack-layout';
import {
  VEHICLES, sedanSlotCells, vehicleArtRect, vehicleScaleForPage, vehicleForLevel, vehicleRegionRects, vehicleSlotCells, vehicleSlotLabel,
} from '../client/assets/scripts/core/stack/stack-vehicles';

describe('vehicle per level', () => {
  it('starts on the motorcycle and follows the garage order', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => vehicleForLevel(level).def.key))
      .toEqual(['moto', 'trike', 'sedan', 'suv', 'van', 'pickup', 'truck', 'bus', 'tractor']);
  });

  it('gives each of the 9 levels its own ride with no colour laps', () => {
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => vehicleForLevel(level).def.key)).size).toBe(9);
    expect(vehicleForLevel(3).displayName).toBe('红轿车');
    expect(vehicleForLevel(9).displayName).toBe('拖拉机');
    expect(vehicleForLevel(12).def.key).toBe('tractor');
    expect(Object.keys(vehicleForLevel(5)).sort()).toEqual(['def', 'displayName']);
  });

  it('labels the container with the slot count', () => {
    expect(vehicleSlotLabel(VEHICLES[1], 7)).toBe('三轮车斗 · 7 格');
  });
});

describe('vehicle slot cells', () => {
  for (const vehicle of VEHICLES.filter(candidate => candidate.art)) {
    for (const capacity of [7, 8, 9]) {
      it(`${vehicle.key} lays out ${capacity} cells inside its load areas, above the buttons`, () => {
        for (const height of [1334, 1623, 1800]) {
          for (const safe of [0, 34]) {
            const base = createStackPageLayout(height, safe);
            const scale = vehicleScaleForPage(height);
            const art = vehicleArtRect(vehicle, base.actionY, 750, scale);
            const cells = vehicleSlotCells(vehicle, capacity, art);
            expect(cells).toHaveLength(capacity);
            const regions = vehicleRegionRects(vehicle, art);
            for (const cell of cells) {
              expect(cell.w).toBeGreaterThanOrEqual(60 * scale);
              expect(cell.x).toBeGreaterThanOrEqual(0);
              expect(cell.x + cell.w).toBeLessThanOrEqual(750);
              expect(cell.y + cell.h).toBeLessThan(base.actionY);
              expect(regions.some(region => cell.x >= region.x - 1 && cell.x + cell.w <= region.x + region.w + 1
                && cell.y >= region.y - 1 && cell.y + cell.h <= region.y + region.h + 1)).toBe(true);
            }
            for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
              const a = cells[i], b = cells[j];
              const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
              expect(overlap).toBe(false);
            }
            const layout = createStackPageLayout(height, safe, art.y);
            expect(layout.stackBottom).toBeLessThan(art.y);
            // The whole ride, plate included, stays above the prop buttons.
            expect(art.y + art.h).toBeLessThanOrEqual(base.actionY - 8);
            const plate = plateBox(vehicle.key, vehicle.artSize);
            expect(art.y + (plate.cy + plate.h / 2) * art.h).toBeLessThan(base.actionY);
            // …and the board keeps at least 40% of the page.
            expect(layout.stackBottom - layout.stackTop).toBeGreaterThanOrEqual(height * .4);
          }
        }
      });
    }
  }

  it('keeps the sedan trunk row at 96 for seven and shrinks for nine', () => {
    const trunk = createStackPageLayout(1334).trunk;
    expect(sedanSlotCells(trunk, 7).every(cell => cell.w === 96)).toBe(true);
    const nine = sedanSlotCells(trunk, 9);
    expect(nine[8].x + nine[8].w).toBeLessThanOrEqual(trunk.x + trunk.w);
  });
});

describe('sedan on short pages', () => {
  it('shrinks the whole sedan so 375x667 keeps ≥44px stage cards', async () => {
    const {createStackPageLayout, fitStackBoard, stackContentBounds, stackPageHeight} = await import('../client/assets/scripts/core/stack/stack-layout');
    const {sedanScaleForPage} = await import('../client/assets/scripts/core/stack/stack-vehicles');
    const {generateEndlessLevel} = await import('../client/assets/scripts/core/stack/stack-endless');
    const height = stackPageHeight(375, 667);
    const scale = sedanScaleForPage(height);
    expect(scale).toBeLessThan(1);
    expect(sedanScaleForPage(stackPageHeight(390, 844))).toBe(1);
    const full = createStackPageLayout(height, 0);
    const small = createStackPageLayout(height, 0, undefined, scale);
    expect(small.carBottom).toBe(full.carBottom);
    expect(small.trunk.w).toBeLessThan(full.trunk.w);
    expect(small.trunk.x + small.trunk.w / 2 - 375).toBeCloseTo((full.trunk.x + full.trunk.w / 2 - 375) * scale, 0);
    expect(small.stackBottom).toBeGreaterThan(full.stackBottom);
    const level = generateEndlessLevel(3);
    const fit = fitStackBoard(stackContentBounds(level), small);
    expect(108 * fit.scale * 375 / 750).toBeGreaterThanOrEqual(44);
  });
});
