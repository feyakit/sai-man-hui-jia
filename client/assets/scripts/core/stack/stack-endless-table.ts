import type {EndlessTuning} from './stack-endless';

/**
 * Fixed per-level generator seeds for road levels 3–9 (offline calibration, tools/calibrate-endless.ts).
 * Rates: greedy look-ahead bot with every prop + one revive, 400 runs (seed confirm-n) / 600 runs (seed verify-n).
 */
export const ENDLESS_TUNING: Readonly<Record<number, EndlessTuning>> = {
  3: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 0}, // 26.00% / 20.67% (target ~25%)
  4: {rushRate: .85, minGap: 6, maxOpenGroups: 3, attempt: 5, kindDelta: 2}, // 21.50% / 21.50% (~20%)
  5: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 4, kindDelta: 4}, // 13.75% / 15.50% (~15%)
  6: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 20}, // 13.25% / 13.83% (~12%)
  7: {rushRate: 1, minGap: 6, maxOpenGroups: 3, attempt: 1}, // 8.25% / 7.17% (~9%)
  8: {rushRate: .5, minGap: 6, maxOpenGroups: 3, attempt: 5}, // 6.00% / 6.83% (~7%)
  9: {rushRate: .7, minGap: 6, maxOpenGroups: 3, attempt: 4}, // 7.25% / 7.00% (~5%, floor 5%)
};
