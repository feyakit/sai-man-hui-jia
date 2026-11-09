import { rotate, SHAPES } from './shapes';
import type { Level, Placement } from './types';

export function canPlace(level: Level, occupied: ReadonlySet<string>, placement: Placement): boolean {
  const piece = level.pieces.find(p => p.id === placement.pieceId);
  if (!piece || !Number.isInteger(placement.rotation) || placement.rotation < 0 || placement.rotation > 3 || !Number.isInteger(placement.x) || !Number.isInteger(placement.y)) return false;
  const blocked = new Set(level.blocked.map(([x,y]) => `${x},${y}`));
  return rotate(SHAPES[piece.shape], placement.rotation).every(([dx,dy]) => {
    const x = dx + placement.x, y = dy + placement.y;
    return x >= 0 && y >= 0 && x < level.width && y < level.height && !blocked.has(`${x},${y}`) && !occupied.has(`${x},${y}`);
  });
}

export function validateSolution(level: Level, placements: readonly Placement[], removedPieceId?: number): { ok: true } | { ok: false; reason: string } {
  if (removedPieceId !== undefined && !level.pieces.some(p => p.id === removedPieceId)) return { ok:false, reason:'unknown removed piece' };
  const occupied = new Set<string>(), seen = new Set<number>();
  for (const p of placements) {
    if (p.pieceId === removedPieceId || seen.has(p.pieceId) || !canPlace(level, occupied, p)) return { ok:false, reason:'invalid placement' };
    seen.add(p.pieceId);
    const piece = level.pieces.find(v => v.id === p.pieceId)!;
    for (const [x,y] of rotate(SHAPES[piece.shape], p.rotation)) occupied.add(`${x+p.x},${y+p.y}`);
  }
  if (seen.size !== level.pieces.length - (removedPieceId === undefined ? 0 : 1)) return { ok:false, reason:'missing piece' };
  if (removedPieceId === undefined && occupied.size !== level.width * level.height - level.blocked.length) return { ok:false, reason:'incomplete board' };
  return { ok:true };
}
