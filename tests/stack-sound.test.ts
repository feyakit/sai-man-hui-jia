import { describe, expect, it } from 'vitest';
import {
  STACK_SOUND_EVENTS, STACK_SOUND_PROFILES, STACK_SOUND_STORAGE_KEY, StackSound,
} from '../client/assets/scripts/services/StackSound';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('stack sound settings', () => {
  it('maps every requested game event to a distinct synthesized profile', () => {
    expect(STACK_SOUND_EVENTS).toEqual(['tap', 'fly', 'pack', 'fail', 'win', 'mom']);
    expect(new Set(STACK_SOUND_EVENTS.map(event => STACK_SOUND_PROFILES[event].label)).size).toBe(6);
    expect(STACK_SOUND_PROFILES.pack.layers).toBe(2);
    expect(STACK_SOUND_PROFILES.win.layers).toBeGreaterThan(1);
  });

  it('persists the global toggle and stays silent without browser audio support', () => {
    const storage = new MemoryStorage();
    const sound = new StackSound(storage);
    expect(sound.enabled).toBe(true);
    expect(() => sound.unlock()).not.toThrow();
    expect(() => sound.play('tap')).not.toThrow();
    expect(sound.toggle()).toBe(false);
    expect(storage.getItem(STACK_SOUND_STORAGE_KEY)).toBe('0');
    expect(new StackSound(storage).enabled).toBe(false);
    expect(sound.toggle()).toBe(true);
    expect(storage.getItem(STACK_SOUND_STORAGE_KEY)).toBe('1');
  });

  it('defaults to enabled when storage access fails', () => {
    const storage = {
      getItem(): string | null { throw new Error('blocked'); },
      setItem(): void { throw new Error('blocked'); },
    };
    const sound = new StackSound(storage);
    expect(sound.enabled).toBe(true);
    expect(() => sound.toggle()).not.toThrow();
    expect(sound.enabled).toBe(false);
  });
});
