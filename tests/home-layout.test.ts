import {describe, expect, it} from 'vitest';
import {
  CAR_HEIGHT, CLASSIC_HEIGHT, PROGRESS_HEIGHT, PROVINCE_HEIGHT, RULES_HEIGHT, START_HEIGHT, TAG_HEIGHT, homeLayoutSlots,
} from '../client/assets/scripts/core/home-layout';

describe('home layout', () => {
  // 1334 = 375x667 / 750x1334; 1437 ≈ the reported 360-wide Android browser; 1623 = 390x844.
  for (const height of [1334, 1380, 1437, 1500, 1623, 1800, 2000]) {
    it(`stacks every block without overlap at height ${height}`, () => {
      const s = homeLayoutSlots(height);
      const blocks: [string, number, number][] = [
        ['title panel', 40, 348],
        ['province', s.province, s.province + PROVINCE_HEIGHT],
        ['car', s.carTop, s.carTop + CAR_HEIGHT * s.carScale],
        ['tag', s.tag, s.tag + TAG_HEIGHT],
        ['progress', s.progress, s.progress + PROGRESS_HEIGHT],
        ['rules', s.rules, s.rules + RULES_HEIGHT],
        ['rank/daily', s.rank, s.rank + 58],
        ['start', s.start, s.start + START_HEIGHT],
        ['classic', s.classic, s.classic + CLASSIC_HEIGHT],
      ];
      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i][1] - blocks[i - 1][2], `${blocks[i - 1][0]} → ${blocks[i][0]}`).toBeGreaterThanOrEqual(4);
      }
      expect(s.classic + CLASSIC_HEIGHT).toBeLessThanOrEqual(height - 60);
      expect(s.carScale).toBeGreaterThanOrEqual(.7);
    });
  }
});
