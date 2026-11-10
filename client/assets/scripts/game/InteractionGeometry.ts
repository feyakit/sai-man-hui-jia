import { rotate, SHAPES } from '../core/shapes';
import type { Point } from '../core/input';
import type { PieceDef, Placement, Rotation } from '../core/types';

export interface Rect { x: number; y: number; w: number; h: number }
export const inRect = (p: Point, r: Rect): boolean => p.x >= r.x && p.y >= r.y && p.x < r.x+r.w && p.y < r.y+r.h;
export function dimensions(piece: PieceDef, rotation: Rotation): {w: number; h: number} {
  const cells = rotate(SHAPES[piece.shape],rotation);
  return {w:Math.max(...cells.map(([x]) => x))+1,h:Math.max(...cells.map(([,y]) => y))+1};
}
export function heldOffset(piece: PieceDef, rotation: Rotation, cell: number): Point {
  const box = dimensions(piece,rotation);
  return {x:box.w*cell/2,y:box.h*cell/2+Math.max(1.2*cell,120)};
}
export function previewVisible(piece: PieceDef, p: Placement, width: number, height: number): boolean {
  const cells = rotate(SHAPES[piece.shape],p.rotation);
  return cells.filter(([x,y]) => x+p.x >= 0 && y+p.y >= 0 && x+p.x < width && y+p.y < height).length*2 >= cells.length;
}

// Reserve every piece's largest orientation so drops/rotations never move another slot.
export function trayLayout(pieces: readonly PieceDef[], tray: Rect): {cell: number; slots: {piece: PieceDef; rect: Rect}[]} {
  const extents = pieces.map(piece => {
    const box = dimensions(piece,0);
    return Math.max(box.w,box.h);
  });
  const gap = 6;
  const fit = (rows: number) => {
    const count = Math.ceil(pieces.length/rows);
    let cell = 40;
    for (let row=0; row<rows; row++) {
      const values = extents.slice(row*count,(row+1)*count);
      if (values.length) cell = Math.min(cell,(tray.w-gap*(values.length+1))/values.reduce((a,b) => a+b,0),
        (tray.h/rows-2*gap)/Math.max(...values));
    }
    return {cell,count};
  };
  let rows = 1;
  let result = fit(rows);
  if (result.cell < 28) { rows = 2; result = fit(rows); }
  // Layout callers must provide enough room for the specified 20px minimum.
  if (pieces.length <= 12 && result.cell < 20) throw new Error('Tray too small for 20px luggage cells');
  const cell = Math.floor(result.cell);
  const slots: {piece: PieceDef; rect: Rect}[] = [];
  for (let row=0; row<rows; row++) {
    let x = tray.x+gap;
    for (let i=row*result.count; i<Math.min((row+1)*result.count,pieces.length); i++) {
      const size = extents[i]*cell;
      slots.push({piece:pieces[i],rect:{x,y:tray.y+row*tray.h/rows+(tray.h/rows-size)/2,w:size,h:size}});
      x += size+gap;
    }
  }
  return {cell,slots};
}
