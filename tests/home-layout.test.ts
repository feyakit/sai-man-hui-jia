import {describe, expect, it} from 'vitest';
import {
  ART_RECTS, BASE_HEIGHT, COUPLET_TOP, HIT_RECTS, ROAD_MILESTONES, homeBoxes, homeLayoutSlots, type Rect,
} from '../client/assets/scripts/core/home-layout';

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('poster home layout', () => {
  // 1334 = 375x667 / 750x1334; 1408 = 360x676; 1623 = 390x844; 1666 = 412x915.
  for (const height of [1334, 1408, 1623, 1666, 1800]) {
    it(`keeps every poster block in its own box at height ${height}`, () => {
      for (const withRestart of [false, true]) {
        const boxes = homeBoxes(height, withRestart);
        const keys = Object.keys(boxes);
        for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
          expect(overlap(boxes[keys[i]], boxes[keys[j]]), `${keys[i]} ↔ ${keys[j]}`).toBe(false);
        }
        for (const key of keys.filter(k => !k.startsWith('couplet'))) {
          expect(boxes[key].x, key).toBeGreaterThanOrEqual(0);
          expect(boxes[key].x + boxes[key].w, key).toBeLessThanOrEqual(750);
          expect(boxes[key].y + boxes[key].h, key).toBeLessThanOrEqual(height - 16);
        }
        // Couplets may tuck slightly past the screen edge but most of the scroll stays visible.
        expect(boxes.coupletLeft.x + boxes.coupletLeft.w * .8).toBeGreaterThan(0);
        expect(boxes.coupletRight.x + boxes.coupletRight.w * .2).toBeLessThan(750);
      }
    });
  }

  it('reproduces the mockup 1:1 on the 750x1334 frame', () => {
    const s = homeLayoutSlots(BASE_HEIGHT);
    expect([s.top, s.car, s.road, s.start, s.coins]).toEqual([0, 0, 0, 0, 0]);
    expect(s.coupletTop).toBe(COUPLET_TOP);
    const boxes = homeBoxes(BASE_HEIGHT, false);
    expect(boxes.car).toEqual(HIT_RECTS.car);
    expect(boxes.start).toEqual(HIT_RECTS.start);
  });

  it('keeps the mockup proportions: plaque ~22%, car ~33-40%, road ~12%, button ~8%, icons ~12%', () => {
    const share = (h: number) => h / BASE_HEIGHT;
    expect(share(ART_RECTS.plaque.h)).toBeCloseTo(.22, 1);
    expect(share(HIT_RECTS.car.h)).toBeGreaterThan(.33);
    expect(share(ART_RECTS.road.h)).toBeCloseTo(.12, 1);
    expect(share(HIT_RECTS.start.h)).toBeCloseTo(.08, 1);
    expect(share(ART_RECTS.coins[0].h)).toBeCloseTo(.12, 1);
  });

  it('gives taller phones more breathing room without shrinking anything', () => {
    const tall = homeBoxes(1623, true);
    const base = homeBoxes(BASE_HEIGHT, true);
    expect(tall.car.h).toBe(base.car.h);
    expect(tall.road.y - (tall.car.y + tall.car.h)).toBeGreaterThan(base.road.y - (base.car.y + base.car.h));
    expect(homeLayoutSlots(1623).coupletScale).toBeGreaterThanOrEqual(homeLayoutSlots(BASE_HEIGHT).coupletScale);
  });

  it('places all nine road milestones on the painted road', () => {
    expect(ROAD_MILESTONES).toHaveLength(9);
    for (const point of ROAD_MILESTONES) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(ART_RECTS.road.w);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(ART_RECTS.road.h);
    }
    for (let i = 1; i < ROAD_MILESTONES.length; i++) expect(ROAD_MILESTONES[i].x).toBeGreaterThan(ROAD_MILESTONES[i - 1].x);
  });
});
