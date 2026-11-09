import { clockwiseRotation, rotate, SHAPES } from '../core/shapes';
import type { Level, Placement, Rotation } from '../core/types';
import { canPlace, validateSolution } from '../core/validate';

interface Snapshot { rotations: Map<number, Rotation>; placements: Map<number, Placement> }

export class StageSession {
  private state: Snapshot = {rotations:new Map(),placements:new Map()};
  private history: Snapshot[] = [];
  private deadline = 0;

  constructor(readonly level: Level, private readonly now: () => number) {
    this.restart();
  }

  restart(): void {
    this.state = {
      rotations:new Map(this.level.pieces.map(piece => [piece.id,piece.initialRotation])),
      placements:new Map(),
    };
    this.history = [];
    this.deadline = this.now() + this.level.timeLimitSec*1000;
  }

  get remainingSeconds(): number {
    return Math.max(0,Math.ceil((this.deadline-this.now())/1000));
  }

  // Cocos Web Mobile can compile iterator spreads into array concatenation.
  get placements(): readonly Placement[] { return Array.from(this.state.placements.values()); }
  get solved(): boolean {
    return this.state.placements.size === this.level.pieces.length &&
      validateSolution(this.level,this.placements).ok;
  }

  rotationFor(id: number): Rotation { return this.state.rotations.get(id) ?? 0; }

  canDrop(placement: Placement): boolean {
    const occupied = new Set<string>();
    for (const other of this.state.placements.values()) {
      if (other.pieceId === placement.pieceId) continue;
      const piece = this.level.pieces.find(item => item.id === other.pieceId)!;
      for (const [x,y] of rotate(SHAPES[piece.shape],other.rotation)) {
        occupied.add(`${x+other.x},${y+other.y}`);
      }
    }
    return canPlace(this.level,occupied,placement);
  }

  drop(placement: Placement): boolean {
    if (!this.remainingSeconds || !this.canDrop(placement)) return false;
    this.remember();
    this.state.placements.set(placement.pieceId,{...placement});
    this.state.rotations.set(placement.pieceId,placement.rotation);
    return true;
  }

  returnToTray(id: number, rotation: Rotation = this.rotationFor(id)): void {
    if (!this.remainingSeconds || !this.state.rotations.has(id)) return;
    this.remember();
    this.state.placements.delete(id);
    this.state.rotations.set(id,rotation);
  }

  rotatePiece(id: number): void {
    if (!this.remainingSeconds || !this.state.rotations.has(id)) return;
    this.remember();
    const rotation = clockwiseRotation(this.rotationFor(id));
    this.state.rotations.set(id,rotation);
    const original = this.state.placements.get(id);
    if (!original) return;
    const rotated = {...original,rotation};
    if (this.canDrop(rotated)) this.state.placements.set(id,rotated);
    else this.state.placements.delete(id);
  }

  undo(): void {
    if (!this.remainingSeconds) return;
    const previous = this.history.pop();
    if (previous) this.state = previous;
  }

  private remember(): void {
    this.history.push({rotations:new Map(this.state.rotations),placements:new Map(this.state.placements)});
  }
}
