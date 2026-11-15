import type { Cell, Rotation, ShapeId } from './types';

export const SHAPES: Record<ShapeId, readonly Cell[]> = {
  I2: [[0,0],[1,0]], I3: [[0,0],[1,0],[2,0]], L3: [[0,0],[0,1],[1,1]],
  I4: [[0,0],[1,0],[2,0],[3,0]], O4: [[0,0],[1,0],[0,1],[1,1]],
  L4: [[0,0],[0,1],[0,2],[1,2]], J4: [[1,0],[1,1],[0,2],[1,2]],
  T4: [[0,0],[1,0],[2,0],[1,1]], S4: [[1,0],[2,0],[0,1],[1,1]],
  Z4: [[0,0],[1,0],[1,1],[2,1]], P5: [[0,0],[1,0],[0,1],[1,1],[0,2]],
  L5: [[0,0],[0,1],[0,2],[0,3],[1,3]], T5: [[0,0],[1,0],[2,0],[1,1],[1,2]],
  U5: [[0,0],[2,0],[0,1],[1,1],[2,1]], V5: [[0,0],[0,1],[0,2],[1,2],[2,2]],
  Z5: [[0,0],[1,0],[1,1],[1,2],[2,2]], N5: [[0,0],[0,1],[1,1],[1,2],[1,3]],
  Y5: [[0,0],[0,1],[1,1],[0,2],[0,3]], R6: [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]],
};

// Grid rows increase downwards, while the stored rotation advances counterclockwise.
export const clockwiseRotation = (rotation: Rotation): Rotation => ((rotation+3)%4) as Rotation;

export function rotate(shape: readonly Cell[], rotation: Rotation): Cell[] {
  let cells = shape.map(([x,y]): Cell => [x,y]);
  for (let i = 0; i < rotation; i++) cells = cells.map(([x,y]): Cell => [y,-x]);
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([,y]) => y));
  return cells.map(([x,y]): Cell => [x-minX,y-minY]).sort((a,b) => a[1]-b[1] || a[0]-b[0]);
}

export function orientations(shape: ShapeId): { rotation: Rotation; cells: Cell[] }[] {
  const seen = new Set<string>();
  const result: { rotation: Rotation; cells: Cell[] }[] = [];
  for (const rotation of [0,1,2,3] as const) {
    const cells = rotate(SHAPES[shape], rotation);
    const key = JSON.stringify(cells);
    if (!seen.has(key)) { seen.add(key); result.push({ rotation, cells }); }
  }
  return result;
}
