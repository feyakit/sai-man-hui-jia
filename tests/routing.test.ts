import { describe, expect, it } from 'vitest';
import { resolveRoute } from '../client/assets/scripts/platform/route';

describe('app route', () => {
  it('uses the start page for the bare root', () => {
    expect(resolveRoute('')).toBe('home');
    expect(resolveRoute('?debug=fail')).toBe('home');
  });

  it('opens match-three for stack mode with stage and debug parameters', () => {
    expect(resolveRoute('?mode=stack')).toBe('stack');
    expect(resolveRoute('?mode=stack&stage=2&debug=fail')).toBe('stack');
    expect(resolveRoute('?mode=stack&level=demo')).toBe('stack');
  });

  it('keeps classic packing behind pack mode and level overrides', () => {
    expect(resolveRoute('?mode=pack')).toBe('pack');
    expect(resolveRoute('?mode=pack&level=demo')).toBe('pack');
    expect(resolveRoute('?level=demo')).toBe('level');
    expect(resolveRoute('?mode=pack&stage=2')).toBe('pack');
  });

  it('keeps mom mode independent', () => {
    expect(resolveRoute('?mode=mom')).toBe('mom');
    expect(resolveRoute('?mode=mom&level=demo')).toBe('mom');
  });
});
