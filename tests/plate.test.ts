import {describe, expect, it} from 'vitest';
import {PROVINCE_PLATE_ABBR, VEHICLE_PLATES, plateBox, plateFontSize, plateText} from '../client/assets/scripts/core/plate';
import {PROVINCES} from '../client/assets/scripts/core/provinces';
import {VEHICLES} from '../client/assets/scripts/core/stack/stack-vehicles';

describe('province plates', () => {
  it('gives all 34 provincial-level regions a distinct one-character abbreviation', () => {
    expect(PROVINCES).toHaveLength(34);
    const abbrs = PROVINCES.map(province => PROVINCE_PLATE_ABBR[province]);
    expect(abbrs.every(abbr => [...abbr].length === 1)).toBe(true);
    expect(new Set(abbrs).size).toBe(34);
    expect([PROVINCE_PLATE_ABBR.台湾, PROVINCE_PLATE_ABBR.香港, PROVINCE_PLATE_ABBR.澳门]).toEqual(['台', '港', '澳']);
  });

  it('uses festive text, never a real plate number', () => {
    expect(plateText('河南')).toBe('豫A·春节');
    expect(plateText('广东')).toBe('粤A·春节');
    expect(plateText(null)).toBe('回家·春节');
    expect(plateText('火星')).toBe('回家·春节');
    for (const province of PROVINCES) expect(plateText(province)).not.toMatch(/\d{3,}/);
  });

  it('places a legible plate inside every ride’s art', () => {
    for (const def of VEHICLES) {
      const p = VEHICLE_PLATES[def.key];
      expect(p.x + p.w).toBeLessThanOrEqual(def.artSize.w);
      expect(p.y + p.h).toBeLessThanOrEqual(def.artSize.h);
      const box = plateBox(def.key, def.artSize);
      expect(box.cx - box.w / 2).toBeGreaterThan(0);
      expect(box.cx + box.w / 2).toBeLessThan(1);
      expect(box.cy + box.h / 2).toBeLessThan(1);
      expect(box.w * def.artSize.w / (box.h * def.artSize.h)).toBeLessThanOrEqual(3.45);
    }
    expect(plateFontSize('豫A·春节', 100, 30)).toBeCloseTo(21, 0);
  });
});
