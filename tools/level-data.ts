import { createHmac } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generateLevel } from '../client/assets/scripts/core/generator';
import { validateSolution } from '../client/assets/scripts/core/validate';
import { SHAPES } from '../client/assets/scripts/core/shapes';
import { vehicleForDate } from '../client/assets/scripts/core/date';
import type { Level, LevelSolution, VehicleTemplate } from '../client/assets/scripts/core/types';

export function integer(value: string | undefined, flag: string): number {
  const number = Number(value);
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return number;
}

export function datesFrom(from: string | undefined, days: string | undefined): string[] {
  const count = integer(days, '--days');
  const start = Date.parse(`${from}T00:00:00Z`);
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(start) ||
    new Date(start).toISOString().slice(0,10) !== from || count > 366) {
    throw new Error('Provide --from YYYY-MM-DD and --days between 1 and 366');
  }
  const dates = Array.from({length:count}, (_,index) => new Date(start+index*86_400_000).toISOString().split('T')[0]);
  if (dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('Date range exceeds year 9999');
  return dates;
}

export const levelFilename = (date: string): string => `${date}-2.json`;

export function generateDaily(date: string, seed: string, vehicle: VehicleTemplate = vehicleForDate(date)) {
  const result = generateLevel(vehicle, {
    date, minPieces:20, maxPieces:26, minLargeFraction:.7, minSix:1, maxSix:2,
    maxSmall:3, maxSolutions:20, minNodesToFirst:2000, maxNodes:500000,
    maxPartitionTries:10000, maxAttempts:100,
  },seed);
  const validity = validateSolution(result.level,result.solution.placements);
  if (!validity.ok) throw new Error(validity.reason);
  return result;
}

export const dailySeed = (date: string, secret: string): string =>
  createHmac('sha256',secret).update(`${date}:2`).digest('hex');

export async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path),{recursive:true});
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary,content);
    await rename(temporary,path);
  } finally {
    await rm(temporary,{force:true});
  }
}

export async function readLevel(date: string): Promise<Level> {
  const source = JSON.parse(await readFile(`levels/${levelFilename(date)}`,'utf8')) as Level;
  if (source.date !== date || source.stage !== 2 || typeof source.vehicle !== 'string' ||
    !Number.isInteger(source.width) || source.width < 1 || source.width > 11 ||
    !Number.isInteger(source.height) || source.height < 1 || source.height > 11 ||
    !Number.isInteger(source.timeLimitSec) || source.timeLimitSec < 1 ||
    !Array.isArray(source.blocked) || !Array.isArray(source.pieces) ||
    source.blocked.some(cell => !Array.isArray(cell) || cell.length !== 2 ||
      !Number.isInteger(cell[0]) || cell[0] < 0 || cell[0] >= source.width ||
      !Number.isInteger(cell[1]) || cell[1] < 0 || cell[1] >= source.height) ||
    source.pieces.some(piece => !piece || !Number.isSafeInteger(piece.id) || piece.id < 1 ||
      typeof piece.shape !== 'string' || !Object.hasOwn(SHAPES,piece.shape) || typeof piece.item !== 'string' ||
      !Number.isInteger(piece.initialRotation) || piece.initialRotation < 0 || piece.initialRotation > 3)) {
    throw new Error(`Invalid level ${date}`);
  }
  return {
    date:source.date, stage:source.stage, vehicle:source.vehicle,
    width:source.width, height:source.height, timeLimitSec:source.timeLimitSec,
    blocked:source.blocked.map(([x,y]) => [x,y]),
    pieces:source.pieces.map(({id,shape,item,initialRotation}) => ({id,shape,item,initialRotation})),
  };
}

export async function readSolution(date: string, level: Level): Promise<LevelSolution> {
  const solution = JSON.parse(await readFile(`levels/solutions/${levelFilename(date)}`,'utf8')) as LevelSolution;
  if (solution.date !== date || solution.stage !== 2 || !Array.isArray(solution.placements)) throw new Error(`Invalid solution ${date}`);
  const validity = validateSolution(level,solution.placements);
  if (!validity.ok) throw new Error(`Invalid solution ${date}. ${validity.reason}`);
  return solution;
}

export function run(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
