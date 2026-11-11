import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solve } from '../client/assets/scripts/core/dlx';
import { generateLevel } from '../client/assets/scripts/core/generator';
import { parseLevel } from '../client/assets/scripts/core/level';
import { rotate, SHAPES } from '../client/assets/scripts/core/shapes';
import { stage1 } from '../client/assets/scripts/core/stage1';
import { validateSolution } from '../client/assets/scripts/core/validate';
import { VEHICLES } from '../client/assets/scripts/core/vehicles';
import { generateV1Mom, generateV1Stage2 } from '../tools/generate-v1-levels';

const json = (path: string) => JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const config = json('tools/config/v1-levels.json');
const load = (name: string) => parseLevel(json(`client/assets/resources/levels/v1/${name}.json`));

describe('committed V1 levels', () => {
  for (const name of ['stage1','stage2','mom']) it(`${name} has a valid fixture and an independently found DLX solution`, () => {
    const level = load(name);
    const full = {...level,pieces:[...level.pieces,...(level.extras ?? []).flat()]};
    const fixture = json(`tests/fixtures/v1/${name}.solution.json`);
    expect(fixture.date).toBe(level.date);
    expect(fixture.stage).toBe(level.stage);
    expect(validateSolution(full,fixture.placements)).toEqual({ok:true});
    const result = solve(full,{maxSolutions:1,maxNodes:500000});
    expect(result.firstSolution).toBeDefined();
    expect(result.nodeLimitReached).toBe(false);
    expect(validateSolution(full,result.firstSolution!)).toEqual({ok:true});
  });

  it('stage2 obeys every configured difficulty constraint, including complete solution count', () => {
    const level = load('stage2'), cfg = config.stage2;
    expect(level.vehicle).toBe(cfg.vehicle);
    expect([level.width,level.height,level.blocked]).toEqual([cfg.width,cfg.height,cfg.blocked]);
    expect(level.timeLimitSec).toBe(cfg.timeLimitSec);
    expect(level.pieces.length).toBeGreaterThanOrEqual(cfg.pieceCount[0]);
    expect(level.pieces.length).toBeLessThanOrEqual(cfg.pieceCount[1]);
    for (const shape of Object.keys(SHAPES)) expect(level.pieces.filter(p => p.shape === shape).length).toBeLessThanOrEqual(cfg.maxSameShape);
    expect(level.pieces.filter(p => SHAPES[p.shape].length === 6).length).toBeLessThanOrEqual(cfg.maxSixCells);
    const result = solve(level,{maxSolutions:cfg.solutionCount[1]+1,maxNodes:500000});
    expect(result.solutionCountCapped).toBe(false);
    expect(result.nodeLimitReached).toBe(false);
    expect(result.solutionCount).toBeGreaterThanOrEqual(cfg.solutionCount[0]);
    expect(result.solutionCount).toBeLessThanOrEqual(cfg.solutionCount[1]);
    expect(result.nodesToFirst).toBeGreaterThanOrEqual(cfg.minNodesToFirst);
    expect(generateV1Stage2(cfg).level).toEqual({...level,mode:undefined});
  });

  it('mom starts with base pieces and appends the configured sequence to fill exactly', () => {
    const level = load('mom');
    expect(level.mode).toBe('mom');
    expect(level.stage).toBe(3);
    expect(level.timeLimitSec).toBe(0);
    expect(level.pieces).toHaveLength(config.mom.base);
    expect(level.extras!.map(batch => batch.map(p => p.shape))).toEqual(config.mom.extras.map((shape: string) => [shape]));
    const all = [...level.pieces,...level.extras!.flat()];
    expect(new Set(all.map(p => p.id)).size).toBe(all.length);
    expect(all.reduce((sum,p) => sum+SHAPES[p.shape].length,0)).toBe(level.width*level.height-level.blocked.length);
    expect(generateV1Mom(config.mom).level).toEqual(level);
  });

  it('mom verifies every append prefix against the complete DLX solution', () => {
    const level = load('mom');
    const fixture = json('tests/fixtures/v1/mom.solution.json');
    const batches = [level.pieces,...level.extras!];
    let pieces = [] as typeof level.pieces;
    for (let index=0;index<batches.length;index++) {
      pieces = [...pieces,...batches[index]];
      const occupied = new Set<string>();
      for (const piece of pieces) {
        const placement = fixture.placements.find((entry: {pieceId: number}) => entry.pieceId === piece.id);
        expect(placement).toBeDefined();
        for (const [dx,dy] of rotate(SHAPES[piece.shape],placement.rotation)) {
          const x=placement.x+dx,y=placement.y+dy,key=`${x},${y}`;
          expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(level.width); expect(y).toBeLessThan(level.height);
          expect(level.blocked.some(([bx,by]) => bx === x && by === y)).toBe(false);
          expect(occupied.has(key)).toBe(false); occupied.add(key);
        }
      }
      if (index < batches.length-1) {
        expect(pieces.reduce((sum,piece) => sum+SHAPES[piece.shape].length,0))
          .toBeLessThan(level.width*level.height-level.blocked.length);
      }
    }
    expect(pieces.reduce((sum,piece) => sum+SHAPES[piece.shape].length,0))
      .toBe(level.width*level.height-level.blocked.length);
  });

  it('adds sedan_v1 without changing daily vehicle order or geometry', () => {
    expect(VEHICLES.map(v => v.id)).toEqual(['wuling','suv','pickup','etrike','moto','train','sedan_v1']);
    expect(VEHICLES[6]).toMatchObject({width:8,height:6,blocked:[[0,5],[7,5]]});
  });
});

it('parses legacy and new optional fields and rejects malformed or duplicate extras', () => {
  const old = stage1('2026-11-09');
  expect(parseLevel(old)).toEqual(old);
  expect(parseLevel({...old,stage:3,timeLimitSec:0,mode:'normal'})).toEqual({...old,stage:3,timeLimitSec:0,mode:'normal'});
  const mom = load('mom');
  for (const value of [
    {...mom,mode:'other'}, {...mom,timeLimitSec:-1}, {...mom,extras:{}},
    {...mom,extras:[null]}, {...mom,extras:[[]]},
    {...mom,extras:[[{...mom.pieces[0]}]]},
    {...mom,extras:[[{...mom.extras![0][0],initialRotation:4}]]},
    {...mom,extras:mom.extras!.slice(1)},
  ]) expect(() => parseLevel(value)).toThrow();
});

it('parameterizes generator stage and zero timer while preserving legacy defaults', () => {
  const template = {id:'small',name:'small',width:4,height:3,blocked:[],preferredInventories:[['I4','O4','I2','I2'] as const]};
  const cfg = {date:'2026-11-09',minPieces:4,maxPieces:4,minLargeFraction:0,minSix:0,maxSix:0,maxSmall:4,maxSolutions:100000,minNodesToFirst:0,maxNodes:500000,maxPartitionTries:100,maxAttempts:1};
  const old = generateLevel(template,cfg,'test');
  expect(old.level.stage).toBe(2);
  expect(old.level.timeLimitSec).toBe(180);
  const custom = generateLevel(template,{...cfg,stage:3,timeLimitSec:0,randomInitialRotation:false},'test');
  expect(custom.level.stage).toBe(3);
  expect(custom.solution.stage).toBe(3);
  expect(custom.level.timeLimitSec).toBe(0);
  expect(custom.level.pieces.every(p => p.initialRotation === 0)).toBe(true);
  expect(() => generateLevel(template,{...cfg,timeLimitSec:-1},'test')).toThrow('configuration');
});

it('reports unmet config constraints instead of silently relaxing them', () => {
  expect(() => generateV1Stage2({...config.stage2,pieceCount:[0,0]})).toThrow('pieceCount');
  expect(() => generateV1Stage2({...config.stage2,pieceCount:[1,1]})).toThrow(/stage2 constraints.*area/);
  expect(() => generateV1Mom({...config.mom,extras:['unknown','I2']})).toThrow('extras');
});
