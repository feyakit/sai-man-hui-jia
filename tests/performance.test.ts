import { expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { generateLevel } from '../client/assets/scripts/core/generator';
import { validateSolution } from '../client/assets/scripts/core/validate';
import { VEHICLES } from '../client/assets/scripts/core/vehicles';

it.skipIf(process.env.RUN_M1_PERFORMANCE !== '1')('generates a qualifying full Wuling level within ten seconds', () => {
 const started = performance.now();
 const result = generateLevel(VEHICLES[0], {
  date:'2027-01-01', minPieces:20, maxPieces:26, minLargeFraction:0.7,
  minSix:1, maxSix:2, maxSmall:3, maxSolutions:20, minNodesToFirst:2000,
  maxNodes:250000, maxPartitionTries:10000, maxAttempts:100,
 }, 'm1-performance');
 expect(result.stats.solutionCount).toBeGreaterThanOrEqual(1);
 expect(result.stats.solutionCount).toBeLessThanOrEqual(20);
 expect(result.stats.nodesToFirst).toBeGreaterThanOrEqual(2000);
 expect(validateSolution(result.level,result.solution.placements).ok).toBe(true);
 expect(performance.now()-started).toBeLessThan(10000);
}, 60000);
