import { isClick, snapToGrid, type Point } from '../core/input';
import type { PieceDef, Placement, Rotation } from '../core/types';
import { clockwiseRotation } from '../core/shapes';

interface StartGesture {
  id: number;
  start: Point;
  time: number;
  piece?: PieceDef;
  fromTray: boolean;
  rotation: Rotation;
  offset: Point;
}

export interface Gesture extends StartGesture {
  current: Point;
  mode: 'pending' | 'drag';
}

export class DragController {
  private gesture?: Gesture;

  get active(): Readonly<Gesture> | undefined { return this.gesture; }

  begin(start: StartGesture): void {
    if (!this.gesture) this.gesture = {...start,start:{...start.start},current:{...start.start},mode:'pending'};
  }

  move(id: number, current: Point): Readonly<Gesture> | undefined {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== id) return;
    gesture.current.x = current.x; gesture.current.y = current.y;
    if (gesture.mode === 'pending' && Math.hypot(current.x-gesture.start.x,current.y-gesture.start.y) > 8) {
      if (gesture.piece) gesture.mode = 'drag';
    }
    return gesture;
  }

  release(id: number, current: Point, now: number): {gesture: Readonly<Gesture>; tap: boolean} | undefined {
    const gesture = this.move(id,current);
    if (!gesture) return;
    this.gesture = undefined;
    return {gesture,tap:gesture.mode === 'pending' && isClick(gesture.start,current,now-gesture.time)};
  }

  cancel(id?: number): boolean {
    if (!this.gesture || (id !== undefined && this.gesture.id !== id)) return false;
    this.gesture = undefined;
    return true;
  }

  rotateHeld(): boolean {
    if (this.gesture?.mode !== 'drag' || !this.gesture.piece) return false;
    this.gesture.rotation = clockwiseRotation(this.gesture.rotation);
    return true;
  }

  placement(gesture: Readonly<Gesture>, origin: Point, cell: number): Placement | undefined {
    if (!gesture.piece) return;
    return {
      ...snapToGrid(gesture.current,gesture.offset,origin,cell),
      pieceId:gesture.piece.id,
      rotation:gesture.rotation,
    };
  }
}
