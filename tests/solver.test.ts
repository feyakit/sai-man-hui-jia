import { describe, expect, it } from 'vitest';
import { solve } from '../client/assets/scripts/core/dlx';
import { generateLevel, type GeneratorConfig } from '../client/assets/scripts/core/generator';
import { createRng, shuffle } from '../client/assets/scripts/core/rng';
import { validateSolution } from '../client/assets/scripts/core/validate';
import type { Level, VehicleTemplate } from '../client/assets/scripts/core/types';

const dominoes: Level = {date:'2027-01-01',stage:2,vehicle:'test',width:2,height:2,blocked:[],timeLimitSec:180,pieces:[
 {id:1,shape:'I2',item:'liquor',initialRotation:0},
 {id:2,shape:'I2',item:'liquor',initialRotation:0},
]};
const template: VehicleTemplate = {id:'test',name:'test',width:4,height:3,blocked:[]};
const cfg: GeneratorConfig = {date:'2027-01-01',minPieces:3,maxPieces:6,minLargeFraction:0,minSix:0,maxSix:2,maxSmall:6,maxSolutions:100,minNodesToFirst:0,maxNodes:100000,maxPartitionTries:10000,maxAttempts:30};

describe('solver', () => {
 it('counts interchangeable pieces just once', () => {
  const result = solve(dominoes,{maxSolutions:10,maxNodes:10000});
  expect(result.solutionCount).toBe(2);
  expect(result.solutionCountCapped).toBe(false);
  expect(validateSolution(dominoes,result.firstSolution!).ok).toBe(true);
 });
 it('reports search limits without claiming an exact count', () => {
  expect(solve(dominoes,{maxSolutions:1,maxNodes:100}).solutionCountCapped).toBe(true);
  expect(solve(dominoes,{maxSolutions:10,maxNodes:1}).nodeLimitReached).toBe(true);
  expect(() => solve(dominoes,{maxSolutions:0,maxNodes:1})).toThrow();
 });
 it('rejects an impossible board', () => {
  expect(solve({...dominoes,blocked:[[0,0]]},{maxSolutions:10,maxNodes:100}).solutionCount).toBe(0);
 });
});

describe('generator', () => {
 it('is deterministic and validates 500 generated solutions', () => {
  const first=generateLevel(template,cfg,'same');
  expect(generateLevel(template,cfg,'same')).toEqual(first);
  for (let i=0;i<500;i++) {
   const {level,solution}=generateLevel(template,cfg,String(i));
   expect(validateSolution(level,solution.placements).ok).toBe(true);
  }
 },30000);
 it('stops when constraints cannot be met', () => {
  expect(() => generateLevel(template,{...cfg,minPieces:20,maxPieces:20,maxAttempts:2,maxPartitionTries:10},'no')).toThrow();
 });
 it('has repeatable random numbers and shuffle', () => {
  const a=createRng('a'), b=createRng('a');
  expect(Array.from({length:10},a)).toEqual(Array.from({length:10},b));
  expect(shuffle([1,2,3,4],createRng('x'))).toEqual(shuffle([1,2,3,4],createRng('x')));
 });
});
