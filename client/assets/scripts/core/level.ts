import { SHAPES } from './shapes';
import type { Cell, Level, PieceDef, Rotation, ShapeId } from './types';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function parseLevel(value: unknown): Level {
  if (!record(value)) throw new Error('Invalid level');
  const {date,stage,vehicle,width,height,timeLimitSec} = value;
  if (typeof date !== 'string' || (stage !== 1 && stage !== 2) ||
      typeof vehicle !== 'string' || !vehicle ||
      !integerIn(width,1,11) || !integerIn(height,1,11) ||
      !integerIn(timeLimitSec,1,Math.floor(Number.MAX_SAFE_INTEGER/1000)) ||
      !Array.isArray(value.blocked) || !Array.isArray(value.pieces) || !value.pieces.length) {
    throw new Error('Invalid level header');
  }

  const usedCells = new Set<number>();
  const blocked: Cell[] = value.blocked.map((cell: unknown) => {
    if (!Array.isArray(cell) || cell.length !== 2 ||
        !integerIn(cell[0],0,width-1) || !integerIn(cell[1],0,height-1)) {
      throw new Error('Invalid blocked cell');
    }
    const [x,y] = cell;
    const index = y*width+x;
    if (usedCells.has(index)) throw new Error('Duplicate blocked cell');
    usedCells.add(index);
    return [x,y];
  });

  const ids = new Set<number>();
  let area = 0;
  const pieces: PieceDef[] = value.pieces.map((piece: unknown) => {
    if (!record(piece) || !integerIn(piece.id,1,Number.MAX_SAFE_INTEGER) || ids.has(piece.id) ||
        typeof piece.shape !== 'string' || !Object.hasOwn(SHAPES,piece.shape) ||
        typeof piece.item !== 'string' || !integerIn(piece.initialRotation,0,3)) {
      throw new Error('Invalid or duplicate piece');
    }
    const shape = piece.shape as ShapeId;
    ids.add(piece.id);
    area += SHAPES[shape].length;
    return {id:piece.id,shape,item:piece.item,initialRotation:piece.initialRotation as Rotation};
  });
  if (area !== width*height-blocked.length) throw new Error('Pieces do not fill the board');
  return {date,stage,vehicle,width,height,blocked,timeLimitSec,pieces};
}
