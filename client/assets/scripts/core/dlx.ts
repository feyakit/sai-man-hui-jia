import { orientations } from './shapes';
import type { DifficultyStats, Level, Placement } from './types';

interface Link {
  left: Link;
  right: Link;
  up: Link;
  down: Link;
  column: Column;
  placement?: Placement;
}
interface Column extends Link { size: number; name: string }
export interface SolveResult extends DifficultyStats {
  firstSolution?: Placement[];
  nodeLimitReached: boolean;
}

function makeColumn(name: string): Column {
  const column = {} as Column;
  Object.assign(column, { left: column, right: column, up: column, down: column, column, size: 0, name });
  return column;
}

export function solve(level: Level, options: { maxSolutions: number; maxNodes: number }): SolveResult {
  if (!Number.isInteger(options.maxSolutions) || options.maxSolutions < 1 || !Number.isInteger(options.maxNodes) || options.maxNodes < 1) throw new Error('invalid solver limits');
  const root = makeColumn('root');
  const columns = new Map<string, Column>();
  const addColumn = (name: string) => {
    const col = makeColumn(name);
    col.left = root.left; col.right = root;
    root.left.right = col; root.left = col;
    columns.set(name, col);
  };
  const blocked = new Set(level.blocked.map(([x,y]) => `${x},${y}`));
  for (let y=0; y<level.height; y++) for (let x=0; x<level.width; x++) {
    const key = `${x},${y}`;
    if (!blocked.has(key)) addColumn(key);
  }
  const pieces = [...level.pieces].sort((a,b) => a.id-b.id);
  if (new Set(pieces.map(piece => piece.id)).size !== pieces.length) throw new Error('duplicate piece id');
  for (const piece of pieces) addColumn(`p${piece.id}`);

  for (const piece of pieces) for (const orientation of orientations(piece.shape)) {
    for (let y=0; y<level.height; y++) for (let x=0; x<level.width; x++) {
      const keys = orientation.cells.map(([dx,dy]) => `${x+dx},${y+dy}`);
      if (keys.some(key => !columns.has(key))) continue;
      const placement: Placement = {pieceId:piece.id, rotation:orientation.rotation, x, y};
      let first: Link | undefined;
      for (const key of [`p${piece.id}`, ...keys]) {
        const column = columns.get(key)!;
        const node = {} as Link;
        Object.assign(node, {column, placement, up:column.up, down:column});
        column.up.down = node; column.up = node; column.size++;
        if (!first) { first = node; node.left = node; node.right = node; }
        else { node.left = first.left; node.right = first; first.left.right = node; first.left = node; }
      }
    }
  }

  const cover = (col: Column) => {
    col.right.left = col.left; col.left.right = col.right;
    for (let row = col.down; row !== col; row = row.down) {
      for (let node = row.right; node !== row; node = node.right) {
        node.down.up = node.up; node.up.down = node.down; node.column.size--;
      }
    }
  };
  const uncover = (col: Column) => {
    for (let row = col.up; row !== col; row = row.up) {
      for (let node = row.left; node !== row; node = node.left) {
        node.column.size++; node.down.up = node; node.up.down = node;
      }
    }
    col.right.left = col; col.left.right = col;
  };
  let solutionCount = 0, nodesToFirst = 0, totalNodes = 0;
  let firstSolution: Placement[] | undefined;
  let nodeLimitReached = false, solutionCountCapped = false;
  const chosen: Placement[] = [];
  const compatible = (p: Placement) => {
    const piece = pieces.find(item => item.id === p.pieceId)!;
    const anchor = p.y * level.width + p.x;
    return chosen.every(other => {
      const otherPiece = pieces.find(item => item.id === other.pieceId)!;
      if (otherPiece.shape !== piece.shape) return true;
      const otherAnchor = other.y * level.width + other.x;
      return other.pieceId < p.pieceId ? otherAnchor < anchor : otherAnchor > anchor;
    });
  };
  const search = (): void => {
    if (nodeLimitReached || solutionCountCapped) return;
    if (root.right === root) {
      solutionCount++;
      if (!firstSolution) { firstSolution = chosen.map(p => ({...p})); nodesToFirst = totalNodes; }
      if (solutionCount >= options.maxSolutions) solutionCountCapped = true;
      return;
    }
    let column = root.right as Column;
    for (let next = column.right; next !== root; next = next.right) {
      if ((next as Column).size < column.size) column = next as Column;
    }
    if (column.size === 0) return;
    cover(column);
    for (let row = column.down; row !== column; row = row.down) {
      if (totalNodes >= options.maxNodes) { nodeLimitReached = true; break; }
      totalNodes++;
      const placement = row.placement!;
      if (!compatible(placement)) continue;
      chosen.push(placement);
      for (let node = row.right; node !== row; node = node.right) cover(node.column);
      search();
      for (let node = row.left; node !== row; node = node.left) uncover(node.column);
      chosen.pop();
      if (nodeLimitReached || solutionCountCapped) break;
    }
    uncover(column);
  };
  search();
  return { solutionCount, solutionCountCapped, nodesToFirst, totalNodes, firstSolution, nodeLimitReached };
}
