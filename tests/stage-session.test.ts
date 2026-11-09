import { expect, it } from 'vitest';
import { stage1 } from '../client/assets/scripts/core/stage1';
import { StageSession } from '../client/assets/scripts/game/StageSession';

it('moves pieces, rejects collisions and restores the prior state on undo', () => {
  const session = new StageSession(stage1('2027-01-19'),() => 0);
  expect(session.drop({pieceId:1,rotation:0,x:0,y:0})).toBe(true);
  expect(session.drop({pieceId:2,rotation:0,x:0,y:0})).toBe(false);
  expect(session.placements).toHaveLength(1);
  session.rotatePiece(1);
  expect(session.placements).toHaveLength(0);
  expect(session.rotationFor(1)).toBe(3);
  session.undo();
  expect(session.placements).toEqual([{pieceId:1,rotation:0,x:0,y:0}]);
  session.returnToTray(1);
  expect(session.placements).toHaveLength(0);
  session.undo();
  expect(session.placements).toHaveLength(1);
  for (const placement of [
    {pieceId:2,rotation:0 as const,x:0,y:1},
    {pieceId:3,rotation:0 as const,x:2,y:1},
    {pieceId:4,rotation:0 as const,x:2,y:2},
  ]) expect(session.drop(placement)).toBe(true);
  expect(session.solved).toBe(true);
});

it('uses the wall clock across a background gap and restarts from a clean state', () => {
  let now = 1000;
  const session = new StageSession(stage1('2027-01-19'),() => now);
  const placement = {pieceId:1,rotation:0 as const,x:0,y:0};
  expect(session.remainingSeconds).toBe(60);
  expect(session.drop(placement)).toBe(true);
  now += 10000;
  expect(session.remainingSeconds).toBe(50);
  now += 50000;
  expect(session.remainingSeconds).toBe(0);
  expect(session.drop(placement)).toBe(false);
  session.restart();
  expect(session.remainingSeconds).toBe(60);
  expect(session.placements).toHaveLength(0);
  session.undo();
  expect(session.placements).toHaveLength(0);
});
