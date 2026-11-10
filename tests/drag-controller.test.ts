import { expect, it } from 'vitest';
import { rotate, SHAPES } from '../client/assets/scripts/core/shapes';
import { DragController } from '../client/assets/scripts/game/DragController';

const piece = {id:1,shape:'L3',item:'rice_cooker',initialRotation:0} as const;
const start = {id:4,start:{x:80,y:430},time:1000,piece,fromTray:true,rotation:0,offset:{x:25,y:40}} as const;

it('snaps a quick drop even when the browser reports only start and release', () => {
  const controller = new DragController();
  controller.begin(start);
  const result = controller.release(4,{x:125,y:240},1020)!;
  expect(result.tap).toBe(false);
  expect(result.gesture.mode).toBe('drag');
  expect(controller.placement(result.gesture,{x:100,y:150},50)).toEqual({pieceId:1,x:0,y:1,rotation:0});
  expect(controller.active).toBeUndefined();
});

it('isolates the active pointer and picks up on horizontal movement', () => {
  const controller = new DragController();
  controller.begin(start);
  expect(controller.cancel(5)).toBe(false);
  expect(controller.release(5,{x:80,y:220},1030)).toBeUndefined();
  expect(controller.move(4,{x:125,y:428})?.mode).toBe('drag');
  expect(controller.move(4,{x:125,y:200})?.mode).toBe('drag');
  expect(controller.cancel(4)).toBe(true);
  expect(controller.release(4,{x:125,y:200},1050)).toBeUndefined();
});

it('rotates a held asymmetric piece clockwise in screen coordinates', () => {
  const controller = new DragController();
  controller.begin(start);
  expect(controller.move(4,{x:85,y:400})?.mode).toBe('drag');
  expect(controller.rotateHeld()).toBe(true);
  expect(rotate(SHAPES.L3,controller.active!.rotation)).toEqual([[0,0],[1,0],[0,1]]);
});

it('reports taps without changing rotation', () => {
  const controller = new DragController();
  controller.begin(start);
  const released = controller.release(4,{x:81,y:428},1150)!;
  expect(released.tap).toBe(true);
  expect(released.gesture.rotation).toBe(0);
  controller.begin(start);
  expect(controller.release(4,{x:81,y:428},1300)?.tap).toBe(false);
});
