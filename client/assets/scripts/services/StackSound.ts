/** Compact Web Audio cues for stack mode. No clips or new resource types are required. */
export type StackSoundEvent = 'tap' | 'fly' | 'pack' | 'fail' | 'win' | 'mom';

export const STACK_SOUND_STORAGE_KEY = 'stack-sound-enabled';
export const STACK_SOUND_EVENTS: readonly StackSoundEvent[] = ['tap', 'fly', 'pack', 'fail', 'win', 'mom'];

export interface StackSoundProfile {
  readonly label: string;
  readonly layers: number;
}

export const STACK_SOUND_PROFILES: Readonly<Record<StackSoundEvent, StackSoundProfile>> = {
  tap: { label: '短哒', layers: 1 },
  fly: { label: '轻嗖', layers: 2 },
  pack: { label: '封箱咔哒与叮', layers: 2 },
  fail: { label: '下行低音', layers: 2 },
  win: { label: '上行喜庆音', layers: 4 },
  mom: { label: '妈妈提示音', layers: 2 },
};

export interface StackSoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type AudioContextCtor = new () => AudioContext;

export function readStackSoundEnabled(storage: StackSoundStorage | undefined = browserStorage()): boolean {
  try { return storage?.getItem(STACK_SOUND_STORAGE_KEY) !== '0'; } catch { return true; }
}

export function writeStackSoundEnabled(
  enabled: boolean,
  storage: StackSoundStorage | undefined = browserStorage(),
): void {
  try { storage?.setItem(STACK_SOUND_STORAGE_KEY, enabled ? '1' : '0'); } catch { /* Private mode: keep in-memory state. */ }
}

function browserStorage(): StackSoundStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

function contextConstructor(): AudioContextCtor | undefined {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

/** Synthesizes short cues after the first real touch unlocks the browser AudioContext. */
export class StackSound {
  private readonly storage: StackSoundStorage | undefined;
  private soundEnabled: boolean;
  private context?: AudioContext;
  private master?: GainNode;

  constructor(storage: StackSoundStorage | undefined = browserStorage()) {
    this.storage = storage;
    this.soundEnabled = readStackSoundEnabled(storage);
  }

  get enabled(): boolean { return this.soundEnabled; }

  toggle(): boolean {
    this.soundEnabled = !this.soundEnabled;
    writeStackSoundEnabled(this.soundEnabled, this.storage);
    if (this.soundEnabled) {
      this.unlock();
      this.play('tap');
    }
    return this.soundEnabled;
  }

  unlock(): void {
    const Ctor = contextConstructor();
    if (!Ctor) return;
    try {
      if (!this.context) {
        this.context = new Ctor();
        this.master = this.context.createGain();
        this.master.gain.value = .42;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch {
      this.context = undefined;
      this.master = undefined;
    }
  }

  play(event: StackSoundEvent): void {
    if (!this.soundEnabled) return;
    const context = this.context;
    if (!context || !this.master) return;
    try {
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      if (context.state === 'closed') return;
      this.synthesize(context, event);
    } catch { /* Device/browser failure: audio is optional. */ }
  }

  private synthesize(context: AudioContext, event: StackSoundEvent): void {
    const now = context.currentTime + .012;
    switch (event) {
      case 'tap':
        this.tone(context, 'square', 560, 240, now, .052, .13);
        this.noise(context, now, .022, .045, 1500, 700);
        break;
      case 'fly':
        this.noise(context, now, .14, .09, 480, 1900);
        this.tone(context, 'sine', 290, 560, now, .11, .035);
        break;
      case 'pack':
        this.noise(context, now, .026, .13, 2400, 500);
        this.tone(context, 'triangle', 145, 68, now, .085, .18);
        this.tone(context, 'sine', 880, 880, now + .065, .18, .095);
        this.tone(context, 'sine', 1318.5, 1318.5, now + .075, .22, .06);
        break;
      case 'fail':
        this.tone(context, 'sawtooth', 245, 82, now, .52, .115);
        this.tone(context, 'triangle', 164, 62, now + .06, .62, .075);
        break;
      case 'win': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let index = 0; index < notes.length; index++) {
          this.tone(context, 'sine', notes[index], notes[index], now + index * .075, .23, .09);
          this.tone(context, 'triangle', notes[index] * .5, notes[index] * .5, now + index * .075, .2, .025);
        }
        break;
      }
      case 'mom':
        this.tone(context, 'triangle', 659.25, 659.25, now, .16, .11);
        this.tone(context, 'sine', 880, 880, now + .13, .22, .09);
        break;
    }
  }

  private tone(
    context: AudioContext,
    type: OscillatorType,
    startFrequency: number,
    endFrequency: number,
    start: number,
    duration: number,
    peak: number,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(this.master!);
    oscillator.start(start); oscillator.stop(start + duration + .02);
  }

  private noise(
    context: AudioContext,
    start: number,
    duration: number,
    peak: number,
    startFrequency: number,
    endFrequency: number,
  ): void {
    const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.Q.value = .85;
    filter.frequency.setValueAtTime(startFrequency, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master!);
    source.start(start); source.stop(start + duration + .02);
  }
}
