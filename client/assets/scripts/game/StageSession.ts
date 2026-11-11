import { clockwiseRotation } from '../core/shapes';
import type { Level, PieceDef, Placement, Rotation } from '../core/types';
import { validateSolution } from '../core/validate';

import { pieceCells } from './InteractionGeometry';

interface Snapshot { rotations: Map<number, Rotation>; placements: Map<number, Placement> }

export class StageSession {
  private state: Snapshot = {rotations:new Map(),placements:new Map()};
  private history: Snapshot[] = [];
  private deadline = 0;
  private readonly batches: PieceDef[][];
  private active: PieceDef[] = [];
  private batchIndex = 0;

  constructor(readonly level: Level, private readonly now: () => number) {
    this.batches = level.mode === 'mom'
      ? [level.pieces,...(level.extras ?? [])]
      : [level.pieces];
    this.restart();
  }

  restart(): void {
    this.batchIndex = 0;
    this.active = [...this.batches[0]];
    this.state = {
      rotations:new Map(this.pieces.map(piece => [piece.id,piece.initialRotation])),
      placements:new Map(),
    };
    this.history = [];
    this.deadline = this.now() + this.level.timeLimitSec*1000;
  }

  /** Pieces currently available on the board. Appended batches only ever add to this list. */
  get pieces(): readonly PieceDef[] { return this.active; }
  get totalPieces(): number { return this.batches.reduce((total,batch) => total+batch.length,0); }
  get pendingBatches(): number { return this.batches.length-this.batchIndex-1; }
  get readyForNextBatch(): boolean {
    return this.pendingBatches > 0 && this.pieces.every(piece => this.state.placements.has(piece.id));
  }

  /** Appends the next configured batch. This state change is deliberately outside undo history. */
  appendNextBatch(): boolean {
    if (!this.readyForNextBatch) return false;
    this.batchIndex++;
    this.active.push(...this.batches[this.batchIndex]);
    for (const piece of this.pieces) this.state.rotations.set(piece.id,piece.initialRotation);
    return true;
  }

  get expired(): boolean { return this.level.timeLimitSec > 0 && this.remainingSeconds === 0; }

  get remainingSeconds(): number {
    if (!this.level.timeLimitSec) return Infinity;
    return Math.max(0,Math.ceil((this.deadline-this.now())/1000));
  }

  // Cocos Web Mobile can compile iterator spreads into array concatenation.
  get placements(): readonly Placement[] { return Array.from(this.state.placements.values()); }
  get solved(): boolean {
    return this.pendingBatches === 0 && this.state.placements.size === this.pieces.length &&
      validateSolution({...this.level,pieces:[...this.pieces]},this.placements).ok;
  }

  rotationFor(id: number): Rotation { return this.state.rotations.get(id) ?? 0; }

  canDrop(placement: Placement): boolean {
    if (!Number.isInteger(placement.rotation) || placement.rotation < 0 || placement.rotation > 3 ||
        !Number.isInteger(placement.x) || !Number.isInteger(placement.y)) return false;
    let piece;
    for (const definition of this.pieces) if (definition.id === placement.pieceId) { piece=definition; break; }
    if (!piece) return false;
    const cells=pieceCells(piece,placement.rotation);
    for (let i=0;i<cells.length;i++) {
      const x=cells[i][0]+placement.x,y=cells[i][1]+placement.y;
      if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return false;
      for (const blocked of this.level.blocked) if (blocked[0] === x && blocked[1] === y) return false;
      for (const other of this.state.placements.values()) {
        if (other.pieceId === piece.id) continue;
        for (const definition of this.pieces) {
          if (definition.id !== other.pieceId) continue;
          const occupied=pieceCells(definition,other.rotation);
          for (let j=0;j<occupied.length;j++) if (occupied[j][0]+other.x === x && occupied[j][1]+other.y === y) return false;
          break;
        }
      }
    }
    return true;
  }

  drop(placement: Placement): boolean {
    if (this.expired || !this.canDrop(placement)) return false;
    this.remember();
    this.state.placements.set(placement.pieceId,{...placement});
    this.state.rotations.set(placement.pieceId,placement.rotation);
    return true;
  }

  returnToTray(id: number, rotation: Rotation = this.rotationFor(id)): void {
    if (this.expired || !this.state.rotations.has(id)) return;
    this.remember();
    this.state.placements.delete(id);
    this.state.rotations.set(id,rotation);
  }

  rotatePiece(id: number): boolean {
    if (this.expired || !this.state.rotations.has(id)) return false;
    const rotation = clockwiseRotation(this.rotationFor(id));
    const original = this.state.placements.get(id);
    const rotated = original ? {...original,rotation} : undefined;
    if (rotated && !this.canDrop(rotated)) return false;
    this.remember();
    this.state.rotations.set(id,rotation);
    if (rotated) this.state.placements.set(id,rotated);
    return true;
  }

  undo(): void {
    if (this.expired) return;
    const previous = this.history.pop();
    if (previous) {
      for (const piece of this.pieces) {
        if (!previous.rotations.has(piece.id)) {
          previous.rotations.set(piece.id,this.state.rotations.get(piece.id) ?? piece.initialRotation);
        }
      }
      this.state = previous;
    }
  }

  private remember(): void {
    this.history.push({rotations:new Map(this.state.rotations),placements:new Map(this.state.placements)});
  }
}
