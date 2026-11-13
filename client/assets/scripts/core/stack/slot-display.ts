import { slotInsertIndex } from './stack-rules';
import type { StackCard } from './stack-types';

/**
 * Rapid-tap support: the game logic applies every tap at once, while the slot keeps showing
 * cards that were already packed logically until their own flight lands and the pack plays.
 */
export interface PendingPack {
  /** Ids of the three cards that will pack together. */
  readonly ids: readonly number[];
  /** The three cards. */
  readonly cards: readonly StackCard[];
  /** Tap counter of the tap that completed the pack. */
  readonly seq: number;
}

/**
 * Slot contents to draw: the logical slot plus every pack still on screen. A pack stays where it was
 * made: before any card tapped after it (`seqOf` gives each slot card's tap counter).
 */
export function displaySlot(slot: readonly StackCard[], pending: readonly PendingPack[], seqOf: (id: number) => number = () => 0): StackCard[] {
  const out = [...slot];
  for (const pack of pending) {
    const missing = pack.cards.filter(card => !out.some(item => item.id === card.id));
    if (!missing.length) continue;
    let at = out.findIndex(item => !pack.ids.includes(item.id) && seqOf(item.id) > pack.seq);
    if (at < 0) at = out.length;
    out.splice(at, 0, ...missing);
  }
  return out;
}

/** Packs whose three cards have all landed (none still in flight), in the order they were made. */
export function readyPacks(pending: readonly PendingPack[], inFlight: ReadonlySet<number>): PendingPack[] {
  return pending.filter(pack => pack.ids.every(id => !inFlight.has(id)));
}

/** Cell a card is shown in, or -1. */
export function displayIndex(display: readonly StackCard[], id: number): number {
  return display.findIndex(card => card.id === id);
}
