import { rotate, SHAPES } from '../core/shapes';
import type { Point } from '../core/input';
import type { Cell, PieceDef, Placement, Rotation, ShapeId } from '../core/types';

export interface Rect { x: number; y: number; w: number; h: number }
export const inRect = (p: Point, r: Rect): boolean => p.x >= r.x && p.y >= r.y && p.x < r.x+r.w && p.y < r.y+r.h;
// Precompute once; touch-move must not allocate shape arrays or bounding boxes.
const geometry = {} as Record<ShapeId,{cells: readonly Cell[]; w: number; h: number}[]>;
for (const shape of Object.keys(SHAPES) as ShapeId[]) {
  geometry[shape] = ([0,1,2,3] as Rotation[]).map(rotation => {
    const cells=rotate(SHAPES[shape],rotation);
    return {cells,w:Math.max(...cells.map(([x]) => x))+1,h:Math.max(...cells.map(([,y]) => y))+1};
  });
}
export function dimensions(piece: PieceDef, rotation: Rotation): {w: number; h: number} {
  return geometry[piece.shape][rotation];
}
export function pieceCells(piece: PieceDef, rotation: Rotation): readonly Cell[] { return geometry[piece.shape][rotation].cells; }
export function heldOffset(piece: PieceDef, rotation: Rotation, cell: number): Point {
  const box = dimensions(piece,rotation);
  return {x:box.w*cell/2,y:box.h*cell/2+Math.max(1.2*cell,120)};
}
export function previewVisible(piece: PieceDef, p: Placement, width: number, height: number): boolean {
  const cells = pieceCells(piece,p.rotation);
  let inside=0;
  for (let i=0;i<cells.length;i++) {
    const x=cells[i][0]+p.x,y=cells[i][1]+p.y;
    if (x >= 0 && y >= 0 && x < width && y < height) inside++;
  }
  return inside*2 >= cells.length;
}

// Reserve each piece's largest width and height across rotations so rotations never collide.
export function trayLayout(pieces: readonly PieceDef[], tray: Rect): {cell: number; slots: {piece: PieceDef; rect: Rect}[]} {
  if (!pieces.length) return {cell:44,slots:[]};
  const metrics = pieces.map(piece => {
    let maxW=1,maxH=1;
    for (const rotation of [0,1,2,3] as Rotation[]) {
      const box=dimensions(piece,rotation);
      maxW=Math.max(maxW,box.w); maxH=Math.max(maxH,box.h);
    }
    return {piece,maxW,maxH};
  });
  const gap=6;
  let best={cell:0,counts:[] as number[]};

  const consider=(counts: number[]) => {
    let start=0;
    let heightUnits=0;
    let cell=Infinity;
    for (const count of counts) {
      const row=metrics.slice(start,start+count);
      start+=count;
      const widthUnits=row.reduce((sum,entry) => sum+entry.maxW,0);
      heightUnits+=Math.max(...row.map(entry => entry.maxH));
      cell=Math.min(cell,(tray.w-gap*(count+1))/widthUnits);
    }
    cell=Math.min(cell,(tray.h-gap*(counts.length+1))/heightUnits);
    if (cell > best.cell+0.001) best={cell,counts:[...counts]};
  };
  const partition=(row: number,left: number,counts: number[]) => {
    if (row === 0) { if (left) counts.push(left); if (left) consider(counts); if (left) counts.pop(); return; }
    const max=left-row;
    for (let count=1;count<=max;count++) { counts.push(count); partition(row-1,left-count,counts); counts.pop(); }
  };
  for (let rows=1;rows<=Math.min(3,pieces.length);rows++) partition(rows-1,pieces.length,[]);

  // Layout callers must provide enough room for the established 20px minimum.
  if (pieces.length <= 12 && best.cell < 20) throw new Error('Tray too small for 20px luggage cells');
  const cell=Math.floor(best.cell);
  const slots: {piece: PieceDef; rect: Rect}[] = [];
  let start=0;
  let y=tray.y+gap;
  for (const count of best.counts) {
    const row=metrics.slice(start,start+count);
    start+=count;
    const rowWidth=row.reduce((sum,entry) => sum+entry.maxW*cell,0)+gap*(count-1);
    const rowHeight=Math.max(...row.map(entry => entry.maxH))*cell;
    let x=tray.x+(tray.w-rowWidth)/2;
    for (const entry of row) {
      const w=entry.maxW*cell,h=entry.maxH*cell;
      slots.push({piece:entry.piece,rect:{x,y:y+(rowHeight-h)/2,w,h}});
      x+=w+gap;
    }
    y+=rowHeight+gap;
  }
  return {cell,slots};
}
