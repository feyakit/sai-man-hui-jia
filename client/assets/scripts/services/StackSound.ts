import { renderBgm } from '../core/audio/stack-music';
import { renderSfx, type StackSfxEvent } from '../core/audio/stack-sfx';

/** Synthesized cues for stack mode. No clips or new resource types are required. */
export type StackSoundEvent = StackSfxEvent;

export const STACK_SOUND_STORAGE_KEY = 'stack-sound-enabled';
export const STACK_MUSIC_STORAGE_KEY = 'stack-music-enabled';
export const STACK_SOUND_EVENTS: readonly StackSoundEvent[] = [
  'tap', 'fly', 'pack', 'combo', 'warn', 'mom', 'swap', 'win', 'fail', 'prop', 'home',
];

export interface StackSoundProfile {
  readonly label: string;
  readonly layers: number;
}

export const STACK_SOUND_PROFILES: Readonly<Record<StackSoundEvent, StackSoundProfile>> = {
  tap: { label: '短哒木鱼', layers: 1 },
  fly: { label: '飞入轻嗖', layers: 2 },
  pack: { label: '封箱咔哒与叮', layers: 3 },
  combo: { label: '连击高音铃', layers: 3 },
  warn: { label: '槽位告急双音', layers: 2 },
  mom: { label: '妈妈加塞提示', layers: 3 },
  swap: { label: '换车机械声', layers: 3 },
  win: { label: '通关唢呐与鞭炮', layers: 5 },
  fail: { label: '下行低音', layers: 3 },
  prop: { label: '道具闪光铃', layers: 3 },
  home: { label: '到家鞭炮与锣', layers: 4 },
};

export interface StackSoundPlayOptions {
  /** Combo level 1..8; higher levels sound higher. */
  readonly level?: number;
}

export interface StackSoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type AudioContextCtor = new () => AudioContext;

const SFX_MASTER_LEVEL = 0.65;
const MUSIC_MASTER_LEVEL = 0.58;
const RENDER_RATE = 22050;
const bgmSamples = new Map<number, Float32Array>();
const sfxSamples = new Map<string, Float32Array>();

export function readStackSoundEnabled(storage: StackSoundStorage | undefined = browserStorage()): boolean {
  try { return storage?.getItem(STACK_SOUND_STORAGE_KEY) !== '0'; } catch { return true; }
}

export function writeStackSoundEnabled(
  enabled: boolean,
  storage: StackSoundStorage | undefined = browserStorage(),
): void {
  try { storage?.setItem(STACK_SOUND_STORAGE_KEY, enabled ? '1' : '0'); } catch { /* Private mode: keep in-memory state. */ }
}

export function readStackMusicEnabled(storage: StackSoundStorage | undefined = browserStorage()): boolean {
  try { return storage?.getItem(STACK_MUSIC_STORAGE_KEY) !== '0'; } catch { return true; }
}

export function writeStackMusicEnabled(
  enabled: boolean,
  storage: StackSoundStorage | undefined = browserStorage(),
): void {
  try { storage?.setItem(STACK_MUSIC_STORAGE_KEY, enabled ? '1' : '0'); } catch { /* Private mode: keep in-memory state. */ }
}

function browserStorage(): StackSoundStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

function browserDocument(): Document | undefined {
  try { return typeof document === 'undefined' ? undefined : document; } catch { return undefined; }
}

function contextConstructor(): AudioContextCtor | undefined {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

function comboLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(8, Math.round(level)));
}

function renderRateFor(context: AudioContext): number {
  return Math.min(RENDER_RATE, Math.max(8000, Math.round(context.sampleRate)));
}

function bgmData(rate: number): Float32Array {
  let data = bgmSamples.get(rate);
  if (!data) {
    data = renderBgm(rate);
    bgmSamples.set(rate, data);
  }
  return data;
}

function sfxData(event: StackSoundEvent, level: number, rate: number): Float32Array {
  const key = `${event}:${level}:${rate}`;
  let data = sfxSamples.get(key);
  if (!data) {
    data = renderSfx(event, rate, event === 'combo' ? { level } : undefined);
    sfxSamples.set(key, data);
  }
  return data;
}

/** Synthesizes music and cues after the first real touch unlocks the browser AudioContext. */
export class StackSound {
  private readonly storage: StackSoundStorage | undefined;
  private readonly visibilityListener = (): void => {
    const doc = browserDocument();
    if (!doc) return;
    if (doc.hidden) this.pause();
    else this.resume();
  };
  private _soundEnabled: boolean;
  private _musicEnabled: boolean;
  private listening = false;
  private paused = false;
  private disposed = false;
  private context?: AudioContext;
  private sfxGain?: GainNode;
  private musicGain?: GainNode;
  private musicSource?: AudioBufferSourceNode;
  private musicBuffer?: AudioBuffer;
  private readonly sfxBuffers = new Map<string, AudioBuffer>();

  constructor(storage: StackSoundStorage | undefined = browserStorage()) {
    this.storage = storage;
    this._soundEnabled = readStackSoundEnabled(storage);
    this._musicEnabled = readStackMusicEnabled(storage);
    const doc = browserDocument();
    if (doc) {
      try {
        doc.addEventListener('visibilitychange', this.visibilityListener);
        this.listening = true;
      } catch { /* Optional browser integration. */ }
    }
  }

  /** Backwards-compatible alias for the sound-effects switch. */
  get enabled(): boolean { return this._soundEnabled; }
  get soundEnabled(): boolean { return this._soundEnabled; }
  get musicEnabled(): boolean { return this._musicEnabled; }

  setSoundEnabled(enabled: boolean): void {
    this._soundEnabled = !!enabled;
    writeStackSoundEnabled(this._soundEnabled, this.storage);
    this.updateSfxGain();
  }

  setMusicEnabled(enabled: boolean): void {
    this._musicEnabled = !!enabled;
    writeStackMusicEnabled(this._musicEnabled, this.storage);
    if (!this._musicEnabled) this.stopMusic();
    else if (this.context && !this.paused) this.startMusic();
  }

  toggleSound(): boolean {
    this.setSoundEnabled(!this._soundEnabled);
    if (this._soundEnabled) this.unlock();
    return this._soundEnabled;
  }

  toggleMusic(): boolean {
    this.setMusicEnabled(!this._musicEnabled);
    if (this._musicEnabled) this.unlock();
    return this._musicEnabled;
  }

  /** Backwards-compatible alias for the sound-effects toggle. */
  toggle(): boolean {
    return this.toggleSound();
  }

  /** Called from the first real touch. Creates/resumes the AudioContext and starts music. */
  unlock(): void {
    if (this.disposed) return;
    const Ctor = contextConstructor();
    if (!Ctor) return;
    try {
      if (!this.context) {
        const context = new Ctor();
        const sfxGain = context.createGain();
        const musicGain = context.createGain();
        sfxGain.gain.value = this._soundEnabled ? SFX_MASTER_LEVEL : 0.0001;
        musicGain.gain.value = 0.0001;
        sfxGain.connect(context.destination);
        musicGain.connect(context.destination);
        this.context = context;
        this.sfxGain = sfxGain;
        this.musicGain = musicGain;
      }
      if (this.context.state === 'suspended' && !this.paused) {
        void this.context.resume().catch(() => undefined);
      }
      if (!this.paused) this.startMusic();
    } catch {
      this.close();
    }
  }

  play(event: StackSoundEvent, options: StackSoundPlayOptions = {}): void {
    if (!this._soundEnabled || this.paused || this.disposed) return;
    const context = this.context;
    const output = this.sfxGain;
    if (!context || !output) return;
    try {
      if (context.state === 'suspended' && !this.paused) void context.resume().catch(() => undefined);
      if (context.state === 'closed') return;
      const level = comboLevel(options.level);
      const buffer = this.sfxBuffer(context, event, level);
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      source.start();
    } catch { /* Device/browser failure: audio is optional. */ }
  }

  /** Pause music and suspend the context while the game is in the background. */
  pause(): void {
    if (this.disposed) return;
    this.paused = true;
    try {
      if (this.context?.state === 'running') void this.context.suspend().catch(() => undefined);
    } catch { /* Optional browser integration. */ }
  }

  /** Resume music after the game returns to the foreground, if the music switch is on. */
  resume(): void {
    if (this.disposed) return;
    if (browserDocument()?.hidden) { this.paused = true; return; }
    this.paused = false;
    const context = this.context;
    if (!context) return;
    try {
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      if (this._musicEnabled) this.startMusic();
    } catch { /* Optional browser integration. */ }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const doc = browserDocument();
    if (doc && this.listening) {
      try { doc.removeEventListener('visibilitychange', this.visibilityListener); } catch { /* Optional. */ }
    }
    this.listening = false;
    this.stopMusic();
    this.close();
  }

  private updateSfxGain(): void {
    const context = this.context;
    const gain = this.sfxGain?.gain;
    if (!context || !gain) return;
    try {
      const now = context.currentTime;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(this._soundEnabled ? SFX_MASTER_LEVEL : 0.0001, now, 0.01);
    } catch { /* Optional browser integration. */ }
  }

  private startMusic(): void {
    const context = this.context;
    const output = this.musicGain;
    if (!context || !output || !this._musicEnabled || this.paused || this.disposed) return;
    if (this.musicSource) return;
    try {
      const buffer = this.musicBuffer ?? this.createMusicBuffer(context);
      this.musicBuffer = buffer;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(output);
      const now = context.currentTime;
      const gain = output.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0.0001, now);
      gain.exponentialRampToValueAtTime(MUSIC_MASTER_LEVEL, now + 0.18);
      source.start();
      this.musicSource = source;
    } catch { /* Device/browser failure: audio is optional. */ }
  }

  private stopMusic(): void {
    const context = this.context;
    const gain = this.musicGain?.gain;
    const source = this.musicSource;
    this.musicSource = undefined;
    if (!context || !source) return;
    try {
      const now = context.currentTime;
      if (gain) {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(Math.max(0.0001, gain.value), now);
        gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      }
      source.stop(now + 0.12);
    } catch { /* The source may already have stopped. */ }
  }

  private createMusicBuffer(context: AudioContext): AudioBuffer {
    const rate = renderRateFor(context);
    const data = bgmData(rate);
    const buffer = context.createBuffer(1, data.length, rate);
    buffer.getChannelData(0).set(data);
    return buffer;
  }

  private sfxBuffer(context: AudioContext, event: StackSoundEvent, level: number): AudioBuffer {
    const rate = renderRateFor(context);
    const key = `${event}:${level}:${rate}`;
    const cached = this.sfxBuffers.get(key);
    if (cached) return cached;
    const data = sfxData(event, level, rate);
    const buffer = context.createBuffer(1, data.length, rate);
    buffer.getChannelData(0).set(data);
    this.sfxBuffers.set(key, buffer);
    return buffer;
  }

  private close(): void {
    const context = this.context;
    this.context = undefined;
    this.sfxGain = undefined;
    this.musicGain = undefined;
    this.musicSource = undefined;
    this.musicBuffer = undefined;
    this.sfxBuffers.clear();
    if (!context) return;
    try {
      if (context.state !== 'closed') void context.close().catch(() => undefined);
    } catch { /* Optional browser integration. */ }
  }
}
