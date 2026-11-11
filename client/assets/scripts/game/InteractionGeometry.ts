import { rotate, SHAPES } from '../core/shapes';
import type { Point } from '../core/input';
import type { Cell, PieceDef, Placement, Rotation, ShapeId } from '../core/types';

export interface Rect { x: number; y: number; w: number; h: number }
export const MIN_TRAY_CELL = 56;
export const MAX_TRAY_CELL = 110;
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

export interface TrayLayout {
  readonly cell: number;
  readonly slots: {piece: PieceDef; rect: Rect}[];
  readonly contentWidth: number;
  readonly viewportWidth: number;
  readonly maxScroll: number;
}

/**
 * Use the largest 56–110px cell that fits every tray piece in up to three complete rows. Sparse
 * inventories grow to fill the tray; denser ones keep the 56px minimum and scroll horizontally.
 * Callers re-run this layout after rotating a piece, so slot bounds use its current orientation.
 */
export function trayLayout(
  pieces: readonly PieceDef[],
  tray: Rect,
  rotationFor: (piece: PieceDef) => Rotation = piece => piece.initialRotation,
): TrayLayout {
  if (!pieces.length) return {cell:MIN_TRAY_CELL,slots:[],contentWidth:0,viewportWidth:tray.w,maxScroll:0};
  const gap=6,pad=8;
  const metrics = pieces.map(piece => {
    const box=dimensions(piece,rotationFor(piece));
    return {piece,w:box.w,h:box.h};
  });
  type Candidate={counts:number[];height:number;width:number;balance:number};
  const fit=(cell: number): Candidate | undefined => {
    let best: Candidate | undefined;
    const consider=(counts: number[]) => {
      let start=0;
      let rowHeight=0;
      let rowWidth=0;
      let narrowest=Infinity;
      for (const count of counts) {
        const row=metrics.slice(start,start+count);
        start+=count;
        rowHeight+=Math.max(...row.map(entry => entry.h))*cell;
        const width=row.reduce((sum,entry) => sum+entry.w*cell,0)+gap*(count-1);
        rowWidth=Math.max(rowWidth,width);
        narrowest=Math.min(narrowest,width);
      }
      const height=pad*2+rowHeight+gap*(counts.length-1);
      const width=pad*2+rowWidth;
      if (height > tray.h+0.001 || width > tray.w+0.001) return;
      const candidate={counts:[...counts],height,width,balance:narrowest};
      const better=!best || candidate.counts.length < best.counts.length ||
        (candidate.counts.length === best.counts.length &&
          (candidate.height < best.height-0.001 ||
            (Math.abs(candidate.height-best.height) <= 0.001 && candidate.balance > best.balance+0.001)));
      if (better) best=candidate;
    };
    const partition=(row: number,left: number,counts: number[]) => {
      if (row === 0) { if (left) counts.push(left); if (left) consider(counts); if (left) counts.pop(); return; }
      const max=left-row;
      for (let count=1;count<=max;count++) { counts.push(count); partition(row-1,left-count,counts); counts.pop(); }
    };
    for (let rows=1;rows<=Math.min(3,pieces.length);rows++) partition(rows-1,pieces.length,[]);
    return best;
  };

  let cell=MAX_TRAY_CELL;
  let best: Candidate | undefined;
  for (;cell>=MIN_TRAY_CELL;cell--) { best=fit(cell); if (best) break; }
  // A single 56px row always fits vertically and remains complete through horizontal scrolling.
  if (!best) {
    cell=MIN_TRAY_CELL;
    const width=metrics.reduce((sum,entry) => sum+entry.w*cell,0)+gap*(metrics.length-1);
    best={counts:[pieces.length],height:pad*2+Math.max(...metrics.map(entry => entry.h))*cell,width:pad*2+width,balance:width};
  }

  const contentWidth=best.width;
  const contentHeight=best.height;
  const centered=contentWidth <= tray.w+0.001;
  const startX=centered ? tray.x+(tray.w-contentWidth)/2+pad : tray.x+pad;
  let startY=tray.y+(tray.h-contentHeight)/2+pad;
  const slots: {piece: PieceDef; rect: Rect}[] = [];
  let start=0;
  for (const count of best.counts) {
    const row=metrics.slice(start,start+count);
    start+=count;
    const rowHeight=Math.max(...row.map(entry => entry.h))*cell;
    let x=startX;
    for (const entry of row) {
      const w=entry.w*cell,h=entry.h*cell;
      slots.push({piece:entry.piece,rect:{x,y:startY+(rowHeight-h)/2,w,h}});
      x+=w+gap;
    }
    startY+=rowHeight+gap;
  }
  return {cell,slots,contentWidth,viewportWidth:tray.w,maxScroll:Math.max(0,contentWidth-tray.w)};
}
