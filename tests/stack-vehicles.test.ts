import {describe, expect, it} from 'vitest';
import {createStackPageLayout} from '../client/assets/scripts/core/stack/stack-layout';
import {
  VEHICLES, sedanSlotCells, vehicleArtRect, vehicleForLevel, vehicleRegionRects, vehicleSlotCells, vehicleSlotLabel,
} from '../client/assets/scripts/core/stack/stack-vehicles';

describe('vehicle per level', () => {
  it('starts on the motorcycle and follows the garage order', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => vehicleForLevel(level).def.key))
      .toEqual(['moto', 'trike', 'sedan', 'suv', 'van', 'pickup', 'truck', 'bus', 'tractor']);
  });

  it('never repeats a ride on adjacent levels and repaints later laps', () => {
    for (let level = 1; level < 60; level++) {
      expect(vehicleForLevel(level).def.key).not.toBe(vehicleForLevel(level + 1).def.key);
    }
    const second = vehicleForLevel(10);
    expect(second.def.key).toBe('moto');
    expect(second.tint).not.toBeNull();
    expect(second.displayName).toBe('金色摩托车');
    expect(vehicleForLevel(12).displayName).toBe('红色轿车');
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
            const art = vehicleArtRect(vehicle, base.actionY);
            const cells = vehicleSlotCells(vehicle, capacity, art);
            expect(cells).toHaveLength(capacity);
            const regions = vehicleRegionRects(vehicle, art);
            for (const cell of cells) {
              expect(cell.w).toBeGreaterThanOrEqual(60);
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
            // The board loses at most 60 design units against the sedan's open lid.
            expect(layout.stackBottom).toBeGreaterThanOrEqual(base.stackBottom - 60);
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
