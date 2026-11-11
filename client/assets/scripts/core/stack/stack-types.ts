export type StackCardSource = 'pile' | 'side-left' | 'side-right' | 'reserve' | 'mom';
export type StackStatus = 'playing' | 'won' | 'lost';

export interface StackPoint {
  readonly x: number;
  readonly y: number;
}

export interface StackCard extends StackPoint {
  readonly id: number;
  kind: string;
  name: string;
  readonly w: number;
  readonly h: number;
  readonly layer: number;
  readonly source: StackCardSource;
}

export interface StackItemDef {
  readonly key: string;
  readonly name: string;
}

export interface StackLevel {
  readonly stage: number;
  readonly seed: string;
  readonly cardW: number;
  readonly cardH: number;
  readonly items: readonly StackItemDef[];
  readonly cards: readonly StackCard[];
  readonly reservePositions: readonly StackPoint[];
  readonly momPositions: readonly StackPoint[];
  /** Click order recorded by the triples used to assign kinds. A simulator rechecks every step. */
  readonly solution: readonly number[];
}

export interface StackTapResult {
  readonly ok: boolean;
  readonly reason?: 'missing' | 'blocked' | 'finished';
  readonly card?: StackCard;
  readonly insertIndex: number;
  readonly slotBeforePack: readonly StackCard[];
  readonly packed: readonly StackCard[];
  readonly status: StackStatus;
}

export interface StackProps {
  readonly moveOut: boolean;
  readonly undo: boolean;
  readonly shuffle: boolean;
}

export interface StackSolveResult {
  readonly solvable: boolean;
  readonly picks: readonly number[];
  readonly nodes: number;
  readonly limited: boolean;
  readonly method: 'certificate' | 'search' | 'none';
}
