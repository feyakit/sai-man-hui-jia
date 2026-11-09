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

it('keeps all vehicle regions connected in groups of at least six cells', () => {
 for (const vehicle of VEHICLES) {
  const blocked = new Set(vehicle.blocked.map(([x,y]) => `${x},${y}`));
  expect(blocked.size).toBe(vehicle.blocked.length);
  for (const [x,y] of vehicle.blocked) {
   expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(vehicle.width);
   expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(vehicle.height);
  }
  const pending=new Set<string>();
  for(let y=0;y<vehicle.height;y++) for(let x=0;x<vehicle.width;x++) if(!blocked.has(`${x},${y}`)) pending.add(`${x},${y}`);
  while(pending.size) {
   const first=pending.values().next().value as string;
   const queue=[first]; pending.delete(first);
   for(let i=0;i<queue.length;i++) {
    const [x,y]=queue[i].split(',').map(Number);
    for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
     const key=`${nx},${ny}`;
     if(pending.delete(key)) queue.push(key);
    }
   }
   expect(queue.length).toBeGreaterThanOrEqual(6);
  }
 }
});

it('uses the specified number of cells for every shape', () => {
 const sizes = {I2:2,I3:3,L3:3,I4:4,O4:4,L4:4,J4:4,T4:4,S4:4,Z4:4,P5:5,L5:5,T5:5,U5:5,V5:5,Z5:5,N5:5,Y5:5,R6:6};
 for (const [shape,expected] of Object.entries(sizes)) {
  const cells=SHAPES[shape as keyof typeof SHAPES];
  expect(cells).toHaveLength(expected);
  expect(new Set(cells.map(([x,y]) => `${x},${y}`)).size).toBe(expected);
 }
});

it('rejects malformed boards before validating placements', () => {
 const level=stage1('2027-01-01');
 expect(validateSolution({...level,blocked:[[0,0],[0,0]]},[])).toEqual({ok:false,reason:'invalid level'});
 expect(validateSolution({...level,blocked:[[4,0]]},[])).toEqual({ok:false,reason:'invalid level'});
 expect(validateSolution({...level,pieces:[level.pieces[0],level.pieces[0]]},[])).toEqual({ok:false,reason:'invalid level'});
});
