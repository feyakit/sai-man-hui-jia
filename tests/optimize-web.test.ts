import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const optimizer = readFileSync('tools/optimize-web.mjs', 'utf8');
const home = readFileSync('client/assets/scripts/pages/HomePage.ts', 'utf8');

describe('web optimiser', () => {
  it('warms exactly the art the home page loads', () => {
    const listed = [...optimizer.match(/HOME_ART = \[([^\]]+)\]/)![1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
    const block = home.slice(home.indexOf('const art: [Sprite, string][]'), home.indexOf('void Promise.all(art.map'));
    const loaded = [...block.matchAll(/'(ui\/[^']+)'/g)].map(m => m[1]).sort();
    expect(loaded.length).toBeGreaterThan(8);
    expect(listed).toEqual(loaded);
  });

  it('only turns opaque backgrounds into JPEG', () => {
    const jpeg = [...optimizer.match(/JPEG_ART = \{([^}]+)\}/)![1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(jpeg).toEqual(['art/ui/bg_poster', 'art/ui/bg_night', 'art/ui/bg_home', 'art/vehicles/sedan_v1_trunk']);
    expect(optimizer).toContain('stats.isOpaque');
  });
});
