import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dimensions, heldOffset, inRect, MIN_TRAY_CELL, previewVisible, trayLayout } from '../client/assets/scripts/game/InteractionGeometry';
import { parseLevel } from '../client/assets/scripts/core/level';
import type { Rotation } from '../client/assets/scripts/core/types';
const tray = {x:24,y:880,w:702,h:270};
const level = parseLevel(JSON.parse(readFileSync('client/assets/resources/levels/v1/stage2.json','utf8')));
const demo = parseLevel(JSON.parse(readFileSync('client/assets/resources/dev-levels/demo.json','utf8')));

it('keeps every 12-piece tray cargo complete and disjoint at the 56px minimum', () => {
  const pieces = [...level.pieces];
  while (pieces.length < 12) pieces.push({...pieces[pieces.length%level.pieces.length],id:pieces.length+100});
  const layout = trayLayout(pieces,tray);
  expect(layout.cell).toBe(MIN_TRAY_CELL);
  expect(layout.slots.map(s => s.piece.id)).toEqual(pieces.map(p => p.id));
  for (const {piece,rect} of layout.slots) {
    const box=dimensions(piece,piece.initialRotation);
    expect(rect.w).toBe(box.w*MIN_TRAY_CELL);
    expect(rect.h).toBe(box.h*MIN_TRAY_CELL);
    expect(rect.x).toBeGreaterThanOrEqual(tray.x);
    expect(rect.y).toBeGreaterThanOrEqual(tray.y);
    expect(rect.y+rect.h).toBeLessThanOrEqual(tray.y+tray.h);
    for (const other of layout.slots.filter(s => s.piece.id !== piece.id)) {
      const b=other.rect;
      expect(rect.x+rect.w <= b.x || b.x+b.w <= rect.x || rect.y+rect.h <= b.y || b.y+b.h <= rect.y).toBe(true);
    }
  }
  for (const r of [0,1,2,3] as Rotation[]) {
    const rotated=pieces.map(piece => ({...piece,initialRotation:r}));
    const rotatedLayout=trayLayout(rotated,tray);
    for (const {piece,rect} of rotatedLayout.slots) {
      const box=dimensions(piece,r);
      expect(rect.w).toBe(box.w*MIN_TRAY_CELL);
      expect(rect.h).toBe(box.h*MIN_TRAY_CELL);
    }
  }
});

it('gives every ten-piece stage-two cargo at least 56 design pixels and scrolls the overflow', () => {
  const phoneTray={x:5,y:1043,w:740,h:420};
  const layout=trayLayout(level.pieces,phoneTray);
  expect(layout.cell).toBe(MIN_TRAY_CELL);
  expect(layout.maxScroll).toBeGreaterThan(0);
  for (const {rect} of layout.slots) {
    expect(rect.x).toBeGreaterThanOrEqual(phoneTray.x);
    expect(rect.x+rect.w).toBeLessThanOrEqual(phoneTray.x+layout.contentWidth);
    expect(rect.y+rect.h).toBeLessThanOrEqual(phoneTray.y+phoneTray.h);
  }
});

it('keeps the legacy 20-piece challenge readable through horizontal scrolling', () => {
  const phoneTray={x:5,y:1043,w:740,h:420};
  const layout=trayLayout(demo.pieces,phoneTray);
  expect(demo.pieces).toHaveLength(20);
  expect(layout.cell).toBe(MIN_TRAY_CELL);
  expect(layout.maxScroll).toBeGreaterThan(0);
  expect(layout.slots).toHaveLength(20);
  for (const {piece,rect} of layout.slots) {
    const box=dimensions(piece,piece.initialRotation);
    expect(rect.w).toBe(box.w*MIN_TRAY_CELL);
    expect(rect.h).toBe(box.h*MIN_TRAY_CELL);
    expect(rect.y+rect.h).toBeLessThanOrEqual(phoneTray.y+phoneTray.h);
  }
});

it('keeps the full piece center at least 120px above the finger through all rotations', () => {
  for (const piece of level.pieces) for (const r of [0,1,2,3] as Rotation[]) for (const cell of [50,100,110]) {
    const offset = heldOffset(piece,r,cell), box=dimensions(piece,r);
    expect(offset.x).toBe(box.w*cell/2);
    expect(offset.y-box.h*cell/2).toBe(Math.max(120,cell*1.2));
  }
});

it('shows preview at half the occupied cells, independent of blocked cells', () => {
  const piece = {id:1,shape:'I4',item:'sugarcane',initialRotation:0} as const;
  expect(previewVisible(piece,{pieceId:1,x:-2,y:0,rotation:0},4,3)).toBe(true);
  expect(previewVisible(piece,{pieceId:1,x:-3,y:0,rotation:0},4,3)).toBe(false);
  expect(previewVisible(piece,{pieceId:1,x:0,y:-1,rotation:0},4,3)).toBe(false);
  expect(inRect({x:24,y:880},tray)).toBe(true);
});
