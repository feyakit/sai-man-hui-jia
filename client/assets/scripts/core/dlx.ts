import { orientations, SHAPES } from './shapes';
import type { DifficultyStats, Level, Placement, Rotation, ShapeId } from './types';

interface Link {
  left: Link;
  right: Link;
  up: Link;
  down: Link;
  column: Column;
  row?: Row;
}
interface Column extends Link { size: number }
interface Group { column: Column; ids: number[]; remaining: number }
interface Row { group: Group; rotation: Rotation; x: number; y: number }
export interface SolveResult extends DifficultyStats {
  firstSolution?: Placement[];
  nodeLimitReached: boolean;
}

function makeColumn(): Column {
  const column = {} as Column;
  Object.assign(column, { left: column, right: column, up: column, down: column, column, size: 0 });
  return column;
}

function cover(column: Column): void {
  column.right.left = column.left;
  column.left.right = column.right;
  for (let row = column.down; row !== column; row = row.down) {
    for (let node = row.right; node !== row; node = node.right) {
      node.down.up = node.up;
      node.up.down = node.down;
      node.column.size--;
    }
  }
}

function uncover(column: Column): void {
  for (let row = column.up; row !== column; row = row.up) {
    for (let node = row.left; node !== row; node = node.left) {
      node.column.size++;
      node.down.up = node;
      node.up.down = node;
    }
  }
  column.right.left = column;
  column.left.right = column;
}

export function solve(level: Level, options: { maxSolutions: number; maxNodes: number }): SolveResult {
  if (!Number.isSafeInteger(options.maxSolutions) || options.maxSolutions < 1 ||
      !Number.isSafeInteger(options.maxNodes) || options.maxNodes < 1) throw new Error('invalid solver limits');

  const root = makeColumn();
  const cells: (Column | undefined)[] = [];
  const blocked = new Set(level.blocked.map(([x,y]) => `${x},${y}`));
  let freeCells = 0;
  for (let y=0; y<level.height; y++) for (let x=0; x<level.width; x++) {
    if (blocked.has(`${x},${y}`)) continue;
    const column = makeColumn();
    column.left = root.left;
    column.right = root;
    root.left.right = column;
    root.left = column;
    cells[y*level.width+x] = column;
    freeCells++;
  }

  const pieces = [...level.pieces].sort((a,b) => a.id-b.id);
  if (new Set(pieces.map(piece => piece.id)).size !== pieces.length) throw new Error('duplicate piece id');
  const groups = new Map<ShapeId, Group>();
  let pieceArea = 0;
  for (const piece of pieces) {
    const group = groups.get(piece.shape) ?? {column:makeColumn(), ids:[], remaining:0};
    group.ids.push(piece.id);
    group.remaining++;
    groups.set(piece.shape,group);
    pieceArea += SHAPES[piece.shape].length;
  }
  if (freeCells !== pieceArea) {
    return { solutionCount:0, solutionCountCapped:false, nodesToFirst:0, totalNodes:0, nodeLimitReached:false };
  }

  // Interchangeable pieces share one secondary column with a placement quota.
  for (const [shape, group] of groups) for (const orientation of orientations(shape)) {
    for (let y=0; y<level.height; y++) for (let x=0; x<level.width; x++) {
      const columns = [group.column];
      for (const [dx,dy] of orientation.cells) {
        if (x+dx >= level.width || y+dy >= level.height) break;
        const cell = cells[(y+dy)*level.width+x+dx];
        if (!cell) break;
        columns.push(cell);
      }
      if (columns.length !== orientation.cells.length+1) continue;
      const row: Row = { group, rotation:orientation.rotation, x, y };
      let first: Link | undefined;
      for (const column of columns) {
        const node: Link = {column, row, up:column.up, down:column, left:column, right:column};
        column.up.down = node;
        column.up = node;
        column.size++;
        if (first) {
          node.left = first.left;
          node.right = first;
          first.left.right = node;
          first.left = node;
        } else {
          first = node;
          node.left = node;
          node.right = node;
        }
      }
    }
  }

  let solutionCount = 0, nodesToFirst = 0, totalNodes = 0;
  let firstSolution: Placement[] | undefined;
  let nodeLimitReached = false, solutionCountCapped = false;
  const chosen: Row[] = [];
  const search = (): void => {
    if (root.right === root) {
      solutionCount++;
      if (!firstSolution) {
        firstSolution = [];
        for (const group of groups.values()) {
          const ordered = chosen.filter(row => row.group === group).sort((a,b) => a.y-b.y || a.x-b.x);
          ordered.forEach(({x,y,rotation}, index) => firstSolution!.push({pieceId:group.ids[index],x,y,rotation}));
        }
        nodesToFirst = totalNodes;
      }
      if (solutionCount >= options.maxSolutions) solutionCountCapped = true;
      return;
    }

    let column = root.right as Column;
    for (let next = column.right; next !== root; next = next.right) {
      if ((next as Column).size < column.size) column = next as Column;
    }
    for (const group of groups.values()) {
      if (group.remaining > group.column.size) return;
      if (group.remaining === 1 && group.column.size < column.size) column = group.column;
    }
    if (column.size === 0) return;
    cover(column);
    for (let link = column.down; link !== column; link = link.down) {
      if (totalNodes >= options.maxNodes) { nodeLimitReached = true; break; }
      totalNodes++;
      const row = link.row!;
      const group = row.group;
      group.remaining--;
      chosen.push(row);
      for (let node = link.right; node !== link; node = node.right) {
        if (node.column !== group.column || group.remaining === 0) cover(node.column);
      }
      search();
      for (let node = link.left; node !== link; node = node.left) {
        if (node.column !== group.column || group.remaining === 0) uncover(node.column);
      }
      chosen.pop();
      group.remaining++;
      if (nodeLimitReached || solutionCountCapped) break;
    }
    uncover(column);
  };
  search();
  return { solutionCount, solutionCountCapped, nodesToFirst, totalNodes, firstSolution, nodeLimitReached };
}
