import { describe, expect, it } from 'vitest';
import {
  BGM_BARS, BGM_BEAT_SECONDS, BGM_FORM, BGM_LOOP_SECONDS, BGM_MELODY, BGM_SCALE, renderBgm,
} from '../client/assets/scripts/core/audio/stack-music';
import {
  comboFrequency, renderSfx, SFX_DURATIONS, STACK_SFX_EVENTS, type StackSfxEvent,
} from '../client/assets/scripts/core/audio/stack-sfx';
import {
  readStackMusicEnabled, readStackSoundEnabled, StackSound, STACK_MUSIC_STORAGE_KEY,
  STACK_SOUND_EVENTS, STACK_SOUND_STORAGE_KEY,
} from '../client/assets/scripts/services/StackSound';

const RATE = 8000;

function peak(samples: Float32Array): number {
  let maximum = 0;
  for (const sample of samples) maximum = Math.max(maximum, Math.abs(sample));
  return maximum;
}

function estimateFrequency(samples: Float32Array, sampleRate: number): number {
  const start = Math.floor(sampleRate * 0.03);
  const end = Math.min(samples.length - 1, Math.floor(sampleRate * 0.2));
  let crossings = 0;
  let previous = samples[start];
  for (let index = start + 1; index <= end; index++) {
    const current = samples[index];
    if (previous <= 0 && current > 0) crossings++;
    previous = current;
  }
  return crossings / ((end - start) / sampleRate);
}

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('synthesized background music', () => {
  it('renders a deterministic 16-bar loop with safe peak and a seamless seam', () => {
    const first = renderBgm(RATE);
    const second = renderBgm(RATE);
    expect(first.length).toBe(Math.round(BGM_LOOP_SECONDS * RATE));
    expect(BGM_LOOP_SECONDS).toBeGreaterThan(30);
    expect(BGM_LOOP_SECONDS).toBeLessThan(40);
    expect(peak(first)).toBeGreaterThan(0.1);
    expect(peak(first)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(first[0] - first[first.length - 1])).toBeLessThan(1e-5);
    expect(second).toEqual(first);
  });

  it('documents 16 bars of original D-pentatonic melody that fill every bar', () => {
    expect(BGM_SCALE).toContain('D');
    expect(BGM_FORM).toHaveLength(5);
    expect(BGM_MELODY.length).toBeGreaterThan(40);
    const beatsByBar = new Map<number, number>();
    for (const note of BGM_MELODY) {
      expect(note.bar).toBeGreaterThanOrEqual(1);
      expect(note.bar).toBeLessThanOrEqual(BGM_BARS);
      expect(note.note).toMatch(/^[A-G]#?\d$/);
      beatsByBar.set(note.bar, (beatsByBar.get(note.bar) ?? 0) + note.beats);
    }
    expect(beatsByBar.size).toBe(BGM_BARS);
    for (const beats of beatsByBar.values()) expect(beats).toBeCloseTo(4, 6);
    expect(BGM_BEAT_SECONDS * BGM_BARS * 4).toBeCloseTo(BGM_LOOP_SECONDS, 9);
  });

  it('rejects unusable sample rates', () => {
    expect(() => renderBgm(0)).toThrow(RangeError);
    expect(() => renderBgm(Number.NaN)).toThrow(RangeError);
  });
});

describe('synthesized sound effects', () => {
  it('renders all eleven events within duration and peak limits', () => {
    expect(STACK_SFX_EVENTS).toHaveLength(11);
    for (const event of STACK_SFX_EVENTS) {
      const samples = renderSfx(event, RATE, event === 'combo' ? { level: 4 } : undefined);
      expect(samples.length, event).toBe(Math.round(SFX_DURATIONS[event] * RATE));
      expect(SFX_DURATIONS[event], event).toBeGreaterThanOrEqual(0.1);
      // The finale firecracker string is the only long cue.
      expect(SFX_DURATIONS[event], event).toBeLessThanOrEqual(event === 'home' ? 3.6 : 2.5);
      expect(peak(samples), event).toBeGreaterThan(0.02);
      expect(peak(samples), event).toBeLessThanOrEqual(0.6);
    }
  });

  it('is deterministic and fires the crackling win cue', () => {
    const first = renderSfx('win', RATE);
    const second = renderSfx('win', RATE);
    expect(second).toEqual(first);
    expect(peak(first)).toBeLessThanOrEqual(0.6);
    expect(first.length).toBe(Math.round(2.3 * RATE));
  });

  it('raises the combo pitch for every level and clamps beyond 1..8', () => {
    const frequencies: number[] = [];
    for (let level = 1; level <= 8; level++) {
      const samples = renderSfx('combo', RATE, { level });
      const measured = estimateFrequency(samples, RATE);
      const expected = comboFrequency(level);
      expect(Math.abs(measured - expected) / expected, `level ${level}`).toBeLessThan(0.08);
      frequencies.push(measured);
    }
    for (let index = 1; index < frequencies.length; index++) {
      expect(frequencies[index]).toBeGreaterThan(frequencies[index - 1]);
    }
    expect(comboFrequency(0)).toBeCloseTo(comboFrequency(1), 6);
    expect(comboFrequency(99)).toBeCloseTo(comboFrequency(8), 6);
    expect(renderSfx('combo', RATE, { level: 2 })).toEqual(renderSfx('combo', RATE, { level: 2 }));
  });

  it('rejects unknown events and unusable sample rates', () => {
    expect(() => renderSfx('nope' as StackSfxEvent, RATE)).toThrow(RangeError);
    expect(() => renderSfx('tap', 500)).toThrow(RangeError);
  });
});

describe('stack sound switches', () => {
  it('defaults both switches on and persists independent values', () => {
    const storage = new MemoryStorage();
    const sound = new StackSound(storage);
    expect(sound.soundEnabled).toBe(true);
    expect(sound.musicEnabled).toBe(true);
    expect(sound.enabled).toBe(true);

    sound.setSoundEnabled(false);
    expect(storage.getItem(STACK_SOUND_STORAGE_KEY)).toBe('0');
    expect(new StackSound(storage).soundEnabled).toBe(false);
    expect(new StackSound(storage).musicEnabled).toBe(true);

    sound.setMusicEnabled(false);
    expect(storage.getItem(STACK_MUSIC_STORAGE_KEY)).toBe('0');
    expect(new StackSound(storage).soundEnabled).toBe(false);
    expect(new StackSound(storage).musicEnabled).toBe(false);

    sound.setSoundEnabled(true);
    sound.setMusicEnabled(true);
    expect(storage.getItem(STACK_SOUND_STORAGE_KEY)).toBe('1');
    expect(storage.getItem(STACK_MUSIC_STORAGE_KEY)).toBe('1');
    expect(readStackSoundEnabled(storage)).toBe(true);
    expect(readStackMusicEnabled(storage)).toBe(true);
  });

  it('toggles each switch independently and keeps the legacy toggle alias', () => {
    const storage = new MemoryStorage();
    const sound = new StackSound(storage);
    expect(sound.toggleSound()).toBe(false);
    expect(sound.musicEnabled).toBe(true);
    expect(sound.toggleMusic()).toBe(false);
    expect(sound.soundEnabled).toBe(false);
    expect(sound.toggle()).toBe(true);
    expect(sound.soundEnabled).toBe(true);
    expect(sound.musicEnabled).toBe(false);
    expect(sound.toggleMusic()).toBe(true);
    expect(sound.musicEnabled).toBe(true);
  });

  it('is silent and non-throwing without WebAudio or storage access', () => {
    const sound = new StackSound(undefined);
    expect(() => sound.unlock()).not.toThrow();
    expect(() => sound.play('tap')).not.toThrow();
    for (const event of STACK_SOUND_EVENTS) expect(() => sound.play(event, { level: 8 })).not.toThrow();
    expect(() => sound.pause()).not.toThrow();
    expect(() => sound.resume()).not.toThrow();
    expect(() => sound.dispose()).not.toThrow();

    const blocked = {
      getItem(): string | null { throw new Error('blocked'); },
      setItem(): void { throw new Error('blocked'); },
    };
    const fallback = new StackSound(blocked);
    expect(fallback.soundEnabled).toBe(true);
    expect(fallback.musicEnabled).toBe(true);
    expect(() => fallback.toggleSound()).not.toThrow();
    expect(fallback.soundEnabled).toBe(false);
  });
});
