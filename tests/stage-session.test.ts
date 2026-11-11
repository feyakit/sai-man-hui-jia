import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseLevel } from '../client/assets/scripts/core/level';
import { stage1 } from '../client/assets/scripts/core/stage1';
import { StageSession } from '../client/assets/scripts/game/StageSession';

const json = (path: string) => JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const mom = parseLevel(json('client/assets/resources/levels/v1/mom.json'));
const momSolution = json('tests/fixtures/v1/mom.solution.json').placements;

it('moves pieces, rejects collisions and restores the prior state on undo', () => {
  const session = new StageSession(stage1('2027-01-19'),() => 0);
  expect(session.drop({pieceId:1,rotation:0,x:0,y:0})).toBe(true);
  expect(session.drop({pieceId:2,rotation:0,x:0,y:0})).toBe(false);
  expect(session.placements).toHaveLength(1);
  expect(session.rotatePiece(1)).toBe(false);
  expect(session.placements).toHaveLength(1);
  expect(session.rotationFor(1)).toBe(0);
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

it('rejects blocked/overlapping rotations atomically and records no failed undo step', () => {
  const level = {...stage1('2027-01-19'),width:4,height:4,blocked:[[0,1] as const]};
  const session = new StageSession(level,() => 0);
  const placement = {pieceId:3,rotation:0 as const,x:0,y:0};
  expect(session.drop(placement)).toBe(true);
  expect(session.rotatePiece(3)).toBe(false);
  expect(session.placements).toEqual([placement]);
  expect(session.rotationFor(3)).toBe(0);
  session.undo();
  expect(session.placements).toEqual([]);
  const overlap = new StageSession({...level,blocked:[]},() => 0);
  expect(overlap.drop(placement)).toBe(true);
  expect(overlap.drop({pieceId:4,rotation:0,x:0,y:1})).toBe(true);
  expect(overlap.rotatePiece(3)).toBe(false);
  expect(overlap.placements).toHaveLength(2);
});

it('undoes successful rotations, returns and more than 100 moves without losing pieces', () => {
  const session = new StageSession({...stage1('2027-01-19'),height:4},() => 0);
  expect(session.drop({pieceId:3,rotation:0,x:0,y:0})).toBe(true);
  expect(session.rotatePiece(3)).toBe(true);
  expect(session.placements[0].rotation).toBe(3);
  session.undo();
  expect(session.rotationFor(3)).toBe(0);
  session.returnToTray(3,3); session.undo();
  expect(session.placements[0]).toEqual({pieceId:3,rotation:0,x:0,y:0});
  for (let i=0;i<120;i++) expect(session.rotatePiece(4)).toBe(true);
  for (let i=0;i<120;i++) session.undo();
  expect(session.rotationFor(4)).toBe(0);
  session.undo(); expect(session.placements).toHaveLength(0);
});

it('freezes all mutations on timeout and resets every rotation on restart', () => {
  let now=0; const session = new StageSession(stage1('2027-01-19'),() => now);
  session.rotatePiece(3); session.drop({pieceId:3,rotation:3,x:0,y:0});
  const before=session.placements;
  now=60000;
  session.undo(); session.returnToTray(3); expect(session.rotatePiece(3)).toBe(false);
  expect(session.drop({pieceId:3,rotation:0,x:0,y:1})).toBe(false);
  expect(session.placements).toEqual(before);
  session.restart(); expect(session.rotationFor(3)).toBe(0); expect(session.placements).toHaveLength(0);
});

it('appends mom batches only after the active tray clears and never undoes an append', () => {
  const session = new StageSession(mom,() => 0);
  const baseIds = new Set(mom.pieces.map(piece => piece.id));
  const extra = mom.extras![0][0];
  expect(session.pieces).toHaveLength(mom.pieces.length);
  expect(session.pendingBatches).toBe(mom.extras!.length);
  expect(session.totalPieces).toBe(mom.pieces.length+mom.extras!.flat().length);
  expect(session.remainingSeconds).toBe(Infinity);
  expect(session.readyForNextBatch).toBe(false);
  expect(session.drop({pieceId:extra.id,rotation:extra.initialRotation,x:0,y:0})).toBe(false);

  for (const placement of momSolution.filter((entry: any) => baseIds.has(entry.pieceId))) {
    expect(session.drop(placement)).toBe(true);
  }
  expect(session.readyForNextBatch).toBe(true);
  expect(session.solved).toBe(false);
  expect(session.appendNextBatch()).toBe(true);
  expect(session.appendNextBatch()).toBe(false);
  expect(session.pieces).toHaveLength(mom.pieces.length+1);
  for (const placement of session.placements) expect(session.rotationFor(placement.pieceId)).toBe(placement.rotation);
  expect(session.rotationFor(extra.id)).toBe(extra.initialRotation);

  session.undo();
  expect(session.pieces).toHaveLength(mom.pieces.length+1);
  expect(session.readyForNextBatch).toBe(false);
  expect(session.placements).toHaveLength(mom.pieces.length-1);
  expect(session.drop(momSolution.find((entry: any) => baseIds.has(entry.pieceId) &&
    !session.placements.some(placed => placed.pieceId === entry.pieceId)))).toBe(true);

  for (let index=0;index<mom.extras!.length;index++) {
    for (const placement of momSolution.filter((entry: any) =>
      mom.extras![index].some(piece => piece.id === entry.pieceId))) {
      if (!session.placements.some(placed => placed.pieceId === placement.pieceId)) {
        expect(session.drop(placement)).toBe(true);
      }
    }
    if (index < mom.extras!.length-1) {
      expect(session.readyForNextBatch).toBe(true);
      expect(session.appendNextBatch()).toBe(true);
      expect(session.pieces.at(-1)!.id).toBe(mom.extras![index+1][0].id);
      expect(session.rotationFor(mom.extras![index+1][0].id)).toBe(mom.extras![index+1][0].initialRotation);
    }
  }
  expect(session.solved).toBe(true);
  const lastExtra=mom.extras!.at(-1)![0];
  session.undo();
  expect(session.pieces.some(piece => piece.id === lastExtra.id)).toBe(true);
  expect(session.rotationFor(lastExtra.id)).toBe(lastExtra.initialRotation);
  session.restart();
  expect(session.pieces).toHaveLength(mom.pieces.length);
  expect(session.pendingBatches).toBe(mom.extras!.length);
  expect(session.placements).toHaveLength(0);
});

it('never appends extras outside mom mode', () => {
  const session = new StageSession({...stage1('2027-01-19'),extras:[[{id:99,shape:'I2',item:'milk',initialRotation:0}]]},() => 0);
  expect(session.pendingBatches).toBe(0);
  expect(session.readyForNextBatch).toBe(false);
  expect(session.appendNextBatch()).toBe(false);
  expect(session.pieces).toHaveLength(4);
});

it('keeps an appended batch and its rotation when undo crosses the append snapshot', () => {
  const session = new StageSession(mom,() => 0);
  const solution = (momSolution as {pieceId:number;x:number;y:number;rotation:0|1|2|3}[]);
  for (const placement of solution.filter(entry => entry.pieceId <= mom.pieces.length)) session.drop(placement);
  session.appendNextBatch();
  const first=mom.extras![0][0];
  session.drop(solution.find(entry => entry.pieceId === first.id)!);
  session.appendNextBatch();
  const second=mom.extras![1][0];
  expect(second.initialRotation).not.toBe(0);
  expect(session.rotationFor(second.id)).toBe(second.initialRotation);
  session.undo();
  expect(session.pieces.some(piece => piece.id === second.id)).toBe(true);
  expect(session.rotationFor(second.id)).toBe(second.initialRotation);
});
