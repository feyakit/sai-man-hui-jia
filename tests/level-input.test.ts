import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { solve } from '../client/assets/scripts/core/dlx';
import { parseLevel } from '../client/assets/scripts/core/level';
import { stage1 } from '../client/assets/scripts/core/stage1';
import { StageSession } from '../client/assets/scripts/game/StageSession';

it('loads the committed challenge and clears it through the live session rules', () => {
  const raw: unknown = JSON.parse(readFileSync(new URL('../client/assets/resources/dev-levels/demo.json',import.meta.url),'utf8'));
  const level = parseLevel(raw);
  const result = solve(level,{maxSolutions:1,maxNodes:300000});
  expect(result.firstSolution).toBeDefined();
  const session = new StageSession(level,() => 0);
  for (const placement of result.firstSolution!) expect(session.drop(placement)).toBe(true);
  expect(session.solved).toBe(true);
});

it('rejects malformed level fields before the renderer reads them', () => {
  const level = stage1('2027-01-19');
  const invalid: unknown[] = [
    null,
    {...level,stage:4},
    {...level,timeLimitSec:Infinity},
    {...level,blocked:[null]},
    {...level,blocked:[[0,0],[0,0]]},
    {...level,blocked:[[4,0]]},
    {...level,pieces:[level.pieces[0],level.pieces[0]]},
    {...level,pieces:[{...level.pieces[0],shape:'toString'}]},
    {...level,pieces:[{...level.pieces[0],initialRotation:5}]},
    {...level,pieces:level.pieces.slice(1)},
  ];
  for (const value of invalid) expect(() => parseLevel(value)).toThrow();
  expect(parseLevel(level)).toEqual(level);
});
