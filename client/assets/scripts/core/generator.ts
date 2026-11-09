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
  const random = createRng(seed);
  const blocked = new Set(template.blocked.map(([x,y]) => y*template.width+x));
  const usable = template.width*template.height-blocked.size;
  const candidates: Candidate[][] = Array.from({length: template.width*template.height}, () => []);
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
        if (placed.length + Math.ceil(remaining/6) <= cfg.maxPieces &&
            placed.length + Math.floor(remaining/2) >= cfg.minPieces && partition()) return true;
        placed.pop(); candidate.cells.forEach(cell => occupied.delete(cell));
        if (visits > cfg.maxPartitionTries) break;
      }
      return false;
    };
    if (!partition()) continue;
    const shuffled = shuffle(placed, random);
    const level: Level = {
      date:cfg.date, stage:2, vehicle:template.id, width:template.width, height:template.height,
      blocked:template.blocked.map(([x,y]) => [x,y]), timeLimitSec:180,
      pieces:shuffled.map((candidate,index) => ({ id:index+1, shape:candidate.shape, item:ITEMS[candidate.shape].key, initialRotation:Math.floor(random()*4) as Rotation })),
    };
    const result = solve(level, {maxSolutions:cfg.maxSolutions+1, maxNodes:cfg.maxNodes});
    if (result.nodeLimitReached || result.solutionCountCapped || result.solutionCount < 1 || result.solutionCount > cfg.maxSolutions || result.nodesToFirst < cfg.minNodesToFirst) continue;
    const placements: Placement[] = shuffled.map((candidate,index) => ({pieceId:index+1, rotation:candidate.rotation, x:candidate.x, y:candidate.y}));
    return {level, solution:{date:cfg.date,stage:2,placements}, stats:{solutionCount:result.solutionCount,solutionCountCapped:false,nodesToFirst:result.nodesToFirst,totalNodes:result.totalNodes}};
  }
  throw new Error(`Failed to generate a level in ${cfg.maxAttempts} attempts`);
}
