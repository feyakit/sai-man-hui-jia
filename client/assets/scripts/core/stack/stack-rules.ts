import { shuffle } from '../rng';
import type {
  StackCard, StackLevel, StackPoint, StackProps, StackStatus, StackTapResult,
} from './stack-types';

export const SLOT_CAPACITY = 7;
export const PACK_SIZE = 3;
export const MOM_INTERVAL_MS = 25_000;

export interface StackRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function rectsOverlap(a: StackRect, b: StackRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function isBlocked(card: StackCard, cards: readonly StackCard[]): boolean {
  return cards.some(other => other.id !== card.id && other.layer > card.layer && rectsOverlap(card, other));
}

export function freeCards(cards: readonly StackCard[]): StackCard[] {
  return cards.filter(card => !isBlocked(card, cards));
}

export function topCardAt(cards: readonly StackCard[], x: number, y: number): StackCard | undefined {
  return [...cards]
    .filter(card => x >= card.x && x <= card.x + card.w && y >= card.y && y <= card.y + card.h)
    .sort((a, b) => b.layer - a.layer)[0];
}

export function slotInsertIndex(slot: readonly StackCard[], kind: string): number {
  let index = slot.length;
  for (let i = slot.length - 1; i >= 0; i--) {
    if (slot[i].kind === kind) { index = i + 1; break; }
  }
  return index;
}

function cloneCards(cards: readonly StackCard[]): StackCard[] {
  return cards.map(card => ({...card}));
}

interface Snapshot {
  readonly cards: StackCard[];
  readonly slot: StackCard[];
  readonly status: StackStatus;
  readonly groups: number;
}

/** Pure match-three state machine. Rendering owns card nodes, never this class. */
export class StackGame {
  private cardList: StackCard[];
  private slotList: StackCard[] = [];
  private currentStatus: StackStatus = 'playing';
  private history?: Snapshot;
  private propState: StackProps = {moveOut: false, undo: false, shuffle: false};
  private groupsCleared = 0;
  private lastMomGroup = 0;
  private momEvents = 0;
  private nextMomAt: number;
  private maxCardId: number;

  constructor(
    readonly level: StackLevel,
    private readonly random: () => number = Math.random,
    now = 0,
  ) {
    this.cardList = cloneCards(level.cards);
    this.maxCardId = Math.max(0, ...this.cardList.map(card => card.id));
    this.nextMomAt = now + MOM_INTERVAL_MS;
  }

  get cards(): readonly StackCard[] { return this.cardList; }
  get slot(): readonly StackCard[] { return this.slotList; }
  get status(): StackStatus { return this.currentStatus; }
  get remaining(): number { return this.cardList.length + this.slotList.length; }
  get clearedGroups(): number { return this.groupsCleared; }
  get props(): StackProps { return this.propState; }

  canTap(id: number): boolean {
    if (this.currentStatus !== 'playing') return false;
    const card = this.cardList.find(candidate => candidate.id === id);
    return !!card && !isBlocked(card, this.cardList);
  }

  tap(id: number, now = 0): StackTapResult {
    const card = this.cardList.find(candidate => candidate.id === id);
    if (this.currentStatus !== 'playing') return this.result(false, 'finished', undefined, [], [], 0);
    if (!card) return this.result(false, 'missing', undefined, [], [], 0);
    if (isBlocked(card, this.cardList)) return this.result(false, 'blocked', card, [], [], 0);
    this.history = {
      cards: cloneCards(this.cardList),
      slot: cloneCards(this.slotList),
      status: this.currentStatus,
      groups: this.groupsCleared,
    };
    this.cardList = this.cardList.filter(candidate => candidate.id !== id);
    const insertAt = slotInsertIndex(this.slotList, card.kind);
    this.slotList.splice(insertAt, 0, card);
    const beforePack = cloneCards(this.slotList);
    const matching = this.slotList.filter(candidate => candidate.kind === card.kind);
    let packed: StackCard[] = [];
    if (matching.length >= PACK_SIZE) {
      packed = matching.slice(0, PACK_SIZE);
      const packedIds = new Set(packed.map(candidate => candidate.id));
      this.slotList = this.slotList.filter(candidate => !packedIds.has(candidate.id));
      this.groupsCleared++;
    } else if (this.slotList.length >= SLOT_CAPACITY) {
      this.currentStatus = 'lost';
    }
    if (this.cardList.length === 0 && this.slotList.length === 0) this.currentStatus = 'won';
    this.maybeMomByGroups(now);
    return this.result(true, undefined, card, packed, beforePack, insertAt);
  }

  useUndo(): boolean {
    if (this.propState.undo || !this.history || this.currentStatus !== 'playing') return false;
    const snapshot = this.history;
    this.cardList = cloneCards(snapshot.cards);
    this.slotList = cloneCards(snapshot.slot);
    this.currentStatus = snapshot.status;
    this.groupsCleared = snapshot.groups;
    this.history = undefined;
    this.propState = {...this.propState, undo: true};
    return true;
  }

  useMoveOut(): StackCard[] {
    if (this.propState.moveOut || this.currentStatus !== 'playing' || this.slotList.length < PACK_SIZE) return [];
    this.propState = {...this.propState, moveOut: true};
    return this.moveOutCards();
  }

  revive(): StackCard[] {
    if (this.currentStatus !== 'lost' || this.slotList.length < PACK_SIZE) return [];
    const moved = this.moveOutCards();
    this.currentStatus = 'playing';
    this.history = undefined;
    return moved;
  }

  useShuffle(): boolean {
    if (this.propState.shuffle || this.currentStatus !== 'playing' || this.cardList.length === 0) return false;
    const kinds = this.cardList.map(card => ({kind: card.kind, name: card.name}));
    const mixed = shuffle(kinds, this.random);
    this.cardList = this.cardList.map((card, index) => ({...card, ...mixed[index]}));
    this.propState = {...this.propState, shuffle: true};
    this.history = undefined;
    return true;
  }

  triggerMom(): readonly StackCard[] {
    if (this.level.stage !== 2 || this.currentStatus !== 'playing') return [];
    const item = this.level.items[Math.floor(this.random() * this.level.items.length)];
    const added: StackCard[] = [];
    for (let i = 0; i < PACK_SIZE; i++) {
      const pos = this.level.momPositions[i % this.level.momPositions.length];
      this.maxCardId++;
      added.push({
        id: this.maxCardId,
        kind: item.key,
        name: item.name,
        x: pos.x,
        y: pos.y,
        w: this.level.cardW,
        h: this.level.cardH,
        layer: 2000 + this.momEvents * PACK_SIZE + i,
        source: 'mom',
      });
    }
    this.momEvents++;
    this.cardList.push(...added);
    this.history = undefined;
    return added;
  }

  tickMom(now: number): readonly StackCard[] {
    if (this.level.stage !== 2 || this.currentStatus !== 'playing' || now < this.nextMomAt) return [];
    this.nextMomAt = now + MOM_INTERVAL_MS;
    return this.triggerMom();
  }

  private maybeMomByGroups(now: number): void {
    if (this.level.stage === 2 && this.groupsCleared - this.lastMomGroup >= 10) {
      this.lastMomGroup = this.groupsCleared;
      this.triggerMom();
      this.nextMomAt = now + MOM_INTERVAL_MS;
    }
  }

  private moveOutCards(): StackCard[] {
    const moved = this.slotList.splice(0, PACK_SIZE);
    const offset = this.cardList.filter(card => card.source === 'reserve').length;
    const restored = moved.map((card, index) => {
      const pos: StackPoint = this.level.reservePositions[(offset + index) % this.level.reservePositions.length];
      return {...card, x: pos.x, y: pos.y, layer: 1000 + offset + index, source: 'reserve' as const};
    });
    this.cardList.push(...restored);
    this.history = undefined;
    this.propState = {...this.propState};
    return restored;
  }

  private result(
    ok: boolean,
    reason: StackTapResult['reason'],
    card: StackCard | undefined,
    packed: StackCard[],
    slotBeforePack: StackCard[],
    insertIndex: number,
  ): StackTapResult {
    return {ok, reason, card, packed, slotBeforePack, insertIndex, status: this.currentStatus};
  }
}
