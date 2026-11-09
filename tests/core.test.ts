import { describe, it, expect } from 'vitest';
import { SHAPES, orientations, rotate } from '../client/assets/scripts/core/shapes';
import { validateSolution } from '../client/assets/scripts/core/validate';
import { stage1 } from '../client/assets/scripts/core/stage1';
import { VEHICLES } from '../client/assets/scripts/core/vehicles';
import { vehicleForDate, shanghaiDate } from '../client/assets/scripts/core/date';
import { isClick, snapToGrid, trayGesture } from '../client/assets/scripts/core/input';

describe('core rules', () => {
 it('normalizes rotations and deduplicates symmetric orientations', () => {
  expect(Object.keys(SHAPES)).toHaveLength(19);
  expect(orientations('O4')).toHaveLength(1);
  expect(orientations('I4')).toHaveLength(2);
  expect(orientations('L4')).toHaveLength(4);
  expect(rotate(SHAPES.L3, 1)).toEqual([[1,0],[0,1],[1,1]]);
 });
 it('checks all pieces and occupancy', () => {
  const level=stage1('2027-01-01');
  const valid=[{pieceId:1,rotation:0 as const,x:0,y:0},{pieceId:2,rotation:0 as const,x:0,y:1},{pieceId:3,rotation:0 as const,x:2,y:1},{pieceId:4,rotation:0 as const,x:2,y:2}];
  expect(validateSolution(level,valid)).toEqual({ok:true});
  expect(validateSolution(level,valid.slice(0,3)).ok).toBe(false);
  expect(validateSolution(level,[...valid.slice(0,3),{...valid[3],x:0}]).ok).toBe(false);
  expect(validateSolution(level,valid.slice(0,3),4).ok).toBe(true);
  expect(validateSolution(level,valid,4).ok).toBe(false);
 });
 it('defines vehicle boards within limits and rotations by date', () => {
  for (const v of VEHICLES) {
   expect(v.width).toBeLessThanOrEqual(11); expect(v.height).toBeLessThanOrEqual(11);
   expect(v.width*v.height-v.blocked.length).toBeGreaterThanOrEqual(80);
   expect(v.width*v.height-v.blocked.length).toBeLessThanOrEqual(95);
  }
  expect(vehicleForDate('2027-01-01').id).toBe('wuling');
  expect(vehicleForDate('2026-12-31').id).toBe('train');
  expect(shanghaiDate(new Date('2027-01-01T16:00:00Z'))).toBe('2027-01-02');
 });
 it('interprets input in design coordinates', () => {
  expect(isClick({x:0,y:0},{x:6,y:8},250)).toBe(true);
  expect(isClick({x:0,y:0},{x:11,y:0},100)).toBe(false);
  expect(trayGesture({x:0,y:0},{x:5,y:2})).toBe('scroll');
  expect(snapToGrid({x:125,y:179},{x:5,y:9},{x:20,y:20},50)).toEqual({x:2,y:3});
 });
});
