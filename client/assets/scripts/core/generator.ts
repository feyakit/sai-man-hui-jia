import { solve } from './dlx';
import { ITEMS } from './items';
import { createRng, shuffle } from './rng';
import { orientations, SHAPES } from './shapes';
import type { DifficultyStats, Level, LevelSolution, Placement, Rotation, ShapeId, VehicleTemplate } from './types';

export interface GeneratorConfig {
  date: string;
  minPieces: number;
  maxPieces: number;
  minLargeFraction: number;
  minSix: number;
  maxSix: number;
  maxSmall: number;
  maxSolutions: number;
  minNodesToFirst: number;
  maxNodes: number;
  maxPartitionTries: number;
  maxAttempts: number;
}
interface Candidate { shape: ShapeId; rotation: Rotation; x: number; y: number; cells: number[] }

export function generateLevel(template: VehicleTemplate, cfg: GeneratorConfig, seed: string): { level: Level; solution: LevelSolution; stats: DifficultyStats } {
  const integerLimits = [cfg.minPieces, cfg.maxPieces, cfg.minSix, cfg.maxSix, cfg.maxSmall,
    cfg.maxSolutions, cfg.minNodesToFirst, cfg.maxNodes, cfg.maxPartitionTries, cfg.maxAttempts];
  if (integerLimits.some(value => !Number.isSafeInteger(value) || value < 0) ||
      cfg.minPieces > cfg.maxPieces || cfg.minSix > cfg.maxSix ||
      cfg.maxSolutions < 1 || cfg.maxNodes < 1 || cfg.maxPartitionTries < 1 || cfg.maxAttempts < 1 ||
      !Number.isFinite(cfg.minLargeFraction) || cfg.minLargeFraction < 0 || cfg.minLargeFraction > 1) {
    throw new Error('invalid generator configuration');
  }
  if (!Number.isSafeInteger(template.width) || !Number.isSafeInteger(template.height) ||
      template.width < 1 || template.height < 1 ||
      template.blocked.some(([x,y]) => !Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || y < 0 || x >= template.width || y >= template.height) ||
      new Set(template.blocked.map(([x,y]) => `${x},${y}`)).size !== template.blocked.length) {
    throw new Error('invalid vehicle template');
  }
  const random = createRng(seed);
  const blocked = new Set(template.blocked.map(([x,y]) => y*template.width+x));
  const usable = template.width*template.height-blocked.size;
  const candidates: Candidate[][] = Array.from({length: template.width*template.height}, () => []);
  const neighbors: number[][] = Array.from({length: template.width*template.height}, (_, cell) => {
    const x = cell % template.width, y = Math.floor(cell / template.width);
    const adjacent: number[] = [];
    if (x > 0) adjacent.push(cell-1);
    if (x+1 < template.width) adjacent.push(cell+1);
    if (y > 0) adjacent.push(cell-template.width);
    if (y+1 < template.height) adjacent.push(cell+template.width);
    return adjacent;
  });
  for (const shape of Object.keys(SHAPES) as ShapeId[]) {
    for (const orientation of orientations(shape)) {
      for (let y=0; y<template.height; y++) for (let x=0; x<template.width; x++) {
        const points = orientation.cells.map(([dx,dy]) => [x+dx,y+dy] as const);
        if (points.some(([px,py]) => px>=template.width || py>=template.height || blocked.has(py*template.width+px))) continue;
        const cells = points.map(([px,py]) => py*template.width+px);
        const candidate = {shape, rotation:orientation.rotation, x, y, cells};
        for (const cell of cells) candidates[cell].push(candidate);
      }
    }
  }
  let partitionFailures = 0, nodeLimitFailures = 0, solutionLimitFailures = 0, difficultyFailures = 0;
  for (let attempt=0; attempt<cfg.maxAttempts; attempt++) {
    const occupied = new Set(blocked), placed: Candidate[] = [];
    let visits = 0;
    const partition = (): boolean => {
      if (++visits > cfg.maxPartitionTries) return false;
      if (occupied.size === template.width*template.height) {
        const six = placed.filter(item => item.cells.length === 6).length;
        const small = placed.filter(item => item.cells.length <= 3).length;
        const large = placed.filter(item => item.cells.length === 4 || item.cells.length === 5).length;
        return placed.length >= cfg.minPieces && placed.length <= cfg.maxPieces && six >= cfg.minSix && six <= cfg.maxSix && small <= cfg.maxSmall && large/placed.length >= cfg.minLargeFraction;
      }
      if (placed.length >= cfg.maxPieces) return false;
      let first = 0;
      while (occupied.has(first)) first++;
      const six = placed.filter(item => item.cells.length === 6).length;
      const small = placed.filter(item => item.cells.length <= 3).length;
      const options = candidates[first].filter(candidate =>
        !candidate.cells.some(cell => occupied.has(cell)) &&
        (candidate.cells.length !== 6 || six < cfg.maxSix) &&
        (candidate.cells.length > 3 || small < cfg.maxSmall));
      for (const candidate of shuffle(options, random)) {
        candidate.cells.forEach(cell => occupied.add(cell)); placed.push(candidate);
        const remaining = usable - placed.reduce((sum, item) => sum + item.cells.length, 0);
        const leavesIsolatedCell = candidate.cells.some(cell => neighbors[cell].some(neighbor =>
          !occupied.has(neighbor) && neighbors[neighbor].every(adjacent => occupied.has(adjacent))));
        if (!leavesIsolatedCell && placed.length + Math.ceil(remaining/6) <= cfg.maxPieces &&
            placed.length + Math.floor(remaining/2) >= cfg.minPieces && partition()) return true;
        placed.pop(); candidate.cells.forEach(cell => occupied.delete(cell));
        if (visits > cfg.maxPartitionTries) break;
      }
      return false;
    };
    if (!partition()) { partitionFailures++; continue; }
    const shuffled = shuffle(placed, random);
    const level: Level = {
      date:cfg.date, stage:2, vehicle:template.id, width:template.width, height:template.height,
      blocked:template.blocked.map(([x,y]) => [x,y]), timeLimitSec:180,
      pieces:shuffled.map((candidate,index) => ({ id:index+1, shape:candidate.shape, item:ITEMS[candidate.shape].key, initialRotation:Math.floor(random()*4) as Rotation })),
    };
    const result = solve(level, {maxSolutions:cfg.maxSolutions+1, maxNodes:cfg.maxNodes});
    if (result.nodeLimitReached) { nodeLimitFailures++; continue; }
    if (result.solutionCountCapped || result.solutionCount > cfg.maxSolutions) { solutionLimitFailures++; continue; }
    if (result.solutionCount < 1 || result.nodesToFirst < cfg.minNodesToFirst) { difficultyFailures++; continue; }
    const placements: Placement[] = shuffled.map((candidate,index) => ({pieceId:index+1, rotation:candidate.rotation, x:candidate.x, y:candidate.y}));
    return {level, solution:{date:cfg.date,stage:2,placements}, stats:{solutionCount:result.solutionCount,solutionCountCapped:false,nodesToFirst:result.nodesToFirst,totalNodes:result.totalNodes}};
  }
  throw new Error(
    `Failed to generate a level in ${cfg.maxAttempts} attempts: partition=${partitionFailures}, ` +
    `nodeLimit=${nodeLimitFailures}, solutionLimit=${solutionLimitFailures}, difficulty=${difficultyFailures}`,
  );
}
