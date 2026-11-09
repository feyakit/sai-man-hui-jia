import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { solve } from '../client/assets/scripts/core/dlx';
import { generateLevel } from '../client/assets/scripts/core/generator';
import { ITEMS } from '../client/assets/scripts/core/items';
import { parseLevel } from '../client/assets/scripts/core/level';
import { createRng } from '../client/assets/scripts/core/rng';
import { SHAPES } from '../client/assets/scripts/core/shapes';
import { stage1 } from '../client/assets/scripts/core/stage1';
import { validateSolution } from '../client/assets/scripts/core/validate';
import { VEHICLES } from '../client/assets/scripts/core/vehicles';
import type { Cell, Level, Rotation, ShapeId, VehicleTemplate } from '../client/assets/scripts/core/types';
import { run, writeAtomic } from './level-data';

interface StageConfig {
  vehicle: string; width: number; height: number; blocked: Cell[];
  pieceCount: [number,number]; maxSameShape: number; maxSixCells: number;
  solutionCount: [number,number]; minNodesToFirst: number; timeLimitSec: number;
  randomInitialRotation: boolean; seed: string;
}
interface MomConfig { vehicle: string; base: number; extras: ShapeId[]; seed: string; timeLimitSec: number }
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Unsatisfied constraint: ${message}`);
}
const integer = (value: number, min: number, max = 1000000) => Number.isSafeInteger(value) && value >= min && value <= max;

export function generateV1Stage2(cfg: StageConfig) {
  check(cfg && typeof cfg.seed === 'string' && typeof cfg.randomInitialRotation === 'boolean','stage2 seed / randomInitialRotation');
  check(Array.isArray(cfg.pieceCount) && cfg.pieceCount.length === 2 && cfg.pieceCount.every(n => integer(n,1,60)) && cfg.pieceCount[0] <= cfg.pieceCount[1], 'stage2 pieceCount range');
  check(Array.isArray(cfg.solutionCount) && cfg.solutionCount.length === 2 && cfg.solutionCount.every(n => integer(n,1)) && cfg.solutionCount[0] <= cfg.solutionCount[1], 'stage2 solutionCount range');
  check(integer(cfg.maxSameShape,1) && integer(cfg.maxSixCells,0) && integer(cfg.minNodesToFirst,0) && integer(cfg.timeLimitSec,0), 'stage2 maxSameShape / maxSixCells / minNodesToFirst / timeLimitSec');
  check(VEHICLES.some(v => v.id === cfg.vehicle), 'stage2 known vehicle');
  check(Array.isArray(cfg.blocked), 'stage2 blocked array');
  const template: VehicleTemplate = {id:cfg.vehicle,name:cfg.vehicle,width:cfg.width,height:cfg.height,blocked:cfg.blocked};
  // Validate geometry through the shared parser, before searching inventories.
  const area = cfg.width*cfg.height-cfg.blocked.length;
  check(integer(cfg.width,1,11) && integer(cfg.height,1,11) && area > 0 &&
    cfg.blocked.every(cell => Array.isArray(cell) && cell.length === 2 && integer(cell[0],0,cfg.width-1) && integer(cell[1],0,cfg.height-1)) &&
    new Set(cfg.blocked.map(cell => cell.join(','))).size === cfg.blocked.length, 'stage2 board / blocked');
  const random = createRng(cfg.seed);
  const keys = Object.keys(SHAPES) as ShapeId[];
  const seen = new Set<string>();
  const failures = {area:0,shapeMultiplicity:0,sixCells:0,noSolution:0,solutionCount:0,minNodesToFirst:0,nodeLimit:0};
  // Sampling inventories avoids the strong easy-board bias of sampling complete tilings.
  for (let attempt=0; attempt<100000; attempt++) {
    const count = cfg.pieceCount[0]+Math.floor(random()*(cfg.pieceCount[1]-cfg.pieceCount[0]+1));
    const shapes = Array.from({length:count}, () => keys[Math.floor(random()*keys.length)]);
    if (shapes.reduce((sum,shape) => sum+SHAPES[shape].length,0) !== area) { failures.area++; continue; }
    if (shapes.some(shape => shapes.filter(other => other === shape).length > cfg.maxSameShape)) { failures.shapeMultiplicity++; continue; }
    if (shapes.filter(shape => SHAPES[shape].length === 6).length > cfg.maxSixCells) { failures.sixCells++; continue; }
    const key = shapes.sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const level: Level = {date:'2026-11-09',stage:2,vehicle:cfg.vehicle,width:cfg.width,height:cfg.height,blocked:cfg.blocked,timeLimitSec:cfg.timeLimitSec,
      pieces:shapes.map((shape,index) => ({id:index+1,shape,item:ITEMS[shape].key,initialRotation:0}))};
    const result = solve(level,{maxSolutions:cfg.solutionCount[1]+1,maxNodes:500000});
    if (result.nodeLimitReached) { failures.nodeLimit++; continue; }
    if (!result.firstSolution) { failures.noSolution++; continue; }
    if (result.solutionCountCapped || result.solutionCount < cfg.solutionCount[0] || result.solutionCount > cfg.solutionCount[1]) { failures.solutionCount++; continue; }
    if (result.nodesToFirst < cfg.minNodesToFirst) { failures.minNodesToFirst++; continue; }
    return generateLevel({...template,preferredInventories:[shapes]}, {
      date:level.date,stage:2,timeLimitSec:cfg.timeLimitSec,minPieces:cfg.pieceCount[0],maxPieces:cfg.pieceCount[1],
      maxSameShape:cfg.maxSameShape,minLargeFraction:0,minSix:0,maxSix:cfg.maxSixCells,maxSmall:cfg.pieceCount[1],
      minSolutions:cfg.solutionCount[0],maxSolutions:cfg.solutionCount[1],minNodesToFirst:cfg.minNodesToFirst,
      maxNodes:500000,maxPartitionTries:10000,maxAttempts:1,randomInitialRotation:cfg.randomInitialRotation,
    },cfg.seed);
  }
  throw new Error(`Unsatisfied stage2 constraints ${JSON.stringify(cfg)}; rejection counts ${JSON.stringify(failures)}`);
}

export function generateV1Mom(cfg: MomConfig) {
  const template = VEHICLES.find(vehicle => vehicle.id === cfg?.vehicle);
  check(template && integer(cfg.base,1,50) && typeof cfg.seed === 'string' && integer(cfg.timeLimitSec,0), 'mom vehicle / base / seed / timeLimitSec');
  check(Array.isArray(cfg.extras) && cfg.extras.length >= 2 && cfg.extras.length <= 3 && cfg.extras.every(shape => Object.hasOwn(SHAPES,shape)), 'mom extras: 2–3 known shapes');
  const random = createRng(cfg.seed);
  const keys = Object.keys(SHAPES) as ShapeId[];
  const area = template.width*template.height-template.blocked.length;
  for (let attempt=0; attempt<100000; attempt++) {
    const shapes = [...Array.from({length:cfg.base}, () => keys[Math.floor(random()*keys.length)]),...cfg.extras];
    if (shapes.reduce((sum,shape) => sum+SHAPES[shape].length,0) !== area) continue;
    const pieces = shapes.map((shape,index) => ({id:index+1,shape,item:ITEMS[shape].key,initialRotation:Math.floor(random()*4) as Rotation}));
    const full: Level = {date:'2026-11-09',stage:3,mode:'mom',vehicle:template.id,width:template.width,height:template.height,blocked:template.blocked,timeLimitSec:cfg.timeLimitSec,pieces};
    const result = solve(full,{maxSolutions:1,maxNodes:500000});
    if (!result.firstSolution) continue;
    const level = parseLevel({...full,pieces:pieces.slice(0,cfg.base),extras:pieces.slice(cfg.base).map(piece => [piece])});
    return {level,solution:{date:level.date,stage:level.stage,placements:result.firstSolution}};
  }
  throw new Error(`Unsatisfied mom constraints: base=${cfg.base}, extras=${cfg.extras.join(',')}, total area=${area}, solvable; seed=${cfg.seed}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run(async () => {
  const {values} = parseArgs({options:{config:{type:'string'}}});
  const cfg = JSON.parse(await readFile(values.config ?? 'tools/config/v1-levels.json','utf8')) as {stage2:StageConfig;mom:MomConfig};
  const second = generateV1Stage2(cfg.stage2);
  const mom = generateV1Mom(cfg.mom);
  const first = stage1('2026-11-09');
  const firstResult = solve(first,{maxSolutions:1,maxNodes:500000});
  check(firstResult.firstSolution,'stage1 solvable');
  const results = {
    stage1:{level:{...first,mode:'normal' as const},solution:{date:first.date,stage:first.stage,placements:firstResult.firstSolution}},
    stage2:{...second,level:{...second.level,mode:'normal' as const}},mom,
  };
  // Finish all generation and validation before writing any output.
  for (const {level,solution} of Object.values(results)) {
    parseLevel(level);
    check(validateSolution({...level,pieces:[...level.pieces,...(level.extras ?? []).flat()]},solution.placements).ok,'fixture covers all pieces');
  }
  for (const [name,{level,solution}] of Object.entries(results)) {
    await writeAtomic(`client/assets/resources/levels/v1/${name}.json`,JSON.stringify(level,null,2)+'\n');
    await writeAtomic(`tests/fixtures/v1/${name}.solution.json`,JSON.stringify(solution,null,2)+'\n');
  }
  console.log(`stage2: ${second.level.pieces.length} pieces, ${second.stats.solutionCount} solutions (complete), nodesToFirst=${second.stats.nodesToFirst}`);
});
