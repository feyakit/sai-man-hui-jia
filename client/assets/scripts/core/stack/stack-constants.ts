/** Shared rule constants (kept dependency-free so solver and rules never import each other). */
export const SLOT_CAPACITY = 7;
export const MIN_SLOT_CAPACITY = 7;
export const MAX_SLOT_CAPACITY = 9;
export const PACK_SIZE = 3;

/** Resolves an optional level capacity while keeping every pre-capacity level on seven slots. */
export function slotCapacityOf(level: {readonly slotCapacity?: number}): number {
  const capacity = level.slotCapacity ?? SLOT_CAPACITY;
  if (!Number.isInteger(capacity) || capacity < MIN_SLOT_CAPACITY || capacity > MAX_SLOT_CAPACITY) {
    throw new Error('invalid stack slot capacity');
  }
  return capacity;
}
