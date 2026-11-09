export interface Point { x: number; y: number }
export function isClick(start: Point, end: Point, durationMs: number): boolean {
  return durationMs >= 0 && durationMs <= 250 && Math.hypot(end.x-start.x, end.y-start.y) <= 10;
}
export function trayGesture(start: Point, end: Point): 'scroll' | 'pickup' {
  return Math.abs(end.x-start.x) > Math.abs(end.y-start.y) ? 'scroll' : 'pickup';
}
export function snapToGrid(finger: Point, offset: Point, origin: Point, cellSize: number): Point {
  if (cellSize <= 0) throw new Error('cellSize must be positive');
  return { x: Math.round((finger.x-offset.x-origin.x)/cellSize), y: Math.round((finger.y-offset.y-origin.y)/cellSize) };
}
