/** Pure TypeScript DSP helpers shared by the synthesized music and SFX renderers. */

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type FilterKind = 'lowpass' | 'highpass' | 'bandpass';

export interface FilterSpec {
  readonly kind: FilterKind;
  readonly frequency: number;
  readonly q?: number;
  /** 0 = dry, 1 = fully filtered. Defaults to 1. */
  readonly mix?: number;
}

export interface ToneOptions {
  /** Seconds from the start of the target buffer. */
  readonly start: number;
  readonly duration: number;
  readonly gain: number;
  readonly frequency: number;
  /** When present, glide from frequency to endFrequency. */
  readonly endFrequency?: number;
  /** Glide time in seconds. Defaults to the whole note duration. */
  readonly glideSeconds?: number;
  readonly wave?: Waveform;
  readonly attack?: number;
  readonly release?: number;
  /** Exponential body-decay time constant in seconds. 0 keeps a flat body. */
  readonly decay?: number;
  readonly vibratoRate?: number;
  readonly vibratoCents?: number;
  readonly vibratoDelay?: number;
  readonly phaseOffset?: number;
  readonly filter?: FilterSpec;
  /** Wrap the tail into the beginning for seamless loop buffers. */
  readonly loop?: boolean;
}

export interface NoiseOptions {
  readonly start: number;
  readonly duration: number;
  readonly gain: number;
  readonly seed: number;
  readonly attack?: number;
  readonly release?: number;
  readonly decay?: number;
  readonly filter?: FilterSpec;
  /** Optional filter sweep endpoint in Hz. */
  readonly filterEndFrequency?: number;
  readonly loop?: boolean;
}

const TAU = Math.PI * 2;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Deterministic 32-bit PRNG (mulberry32). Same seed always gives the same stream. */
export function createNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteToMidi(note: string): number {
  const match = /^([A-G]#?)(-?\d)$/.exec(note);
  if (!match) throw new RangeError(`Invalid note: ${note}`);
  const semitones: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  return (Number(match[2]) + 1) * 12 + semitones[match[1]];
}

/** RBJ biquad; sufficient for the formant/noise shaping used by these cues. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(kind: FilterKind, frequency: number, q: number, sampleRate: number) {
    this.set(kind, frequency, q, sampleRate);
  }

  set(kind: FilterKind, frequency: number, q: number, sampleRate: number): void {
    const nyquist = sampleRate * 0.45;
    const cutoff = clamp(frequency, 20, Math.max(20, nyquist));
    const resonance = clamp(q, 0.1, 20);
    const omega = (TAU * cutoff) / sampleRate;
    const cosine = Math.cos(omega);
    const sine = Math.sin(omega);
    const alpha = sine / (2 * resonance);

    let b0 = 1;
    let b1 = 0;
    let b2 = 0;
    let a0 = 1 + alpha;
    let a1 = -2 * cosine;
    let a2 = 1 - alpha;

    if (kind === 'lowpass') {
      b0 = (1 - cosine) / 2;
      b1 = 1 - cosine;
      b2 = b0;
    } else if (kind === 'highpass') {
      b0 = (1 + cosine) / 2;
      b1 = -(1 + cosine);
      b2 = b0;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(input: number): number {
    const output = this.b0 * input + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
}

function waveform(wave: Waveform, phase: number): number {
  const sine = Math.sin(phase);
  if (wave === 'sine') return sine;
  if (wave === 'square') return sine >= 0 ? 1 : -1;
  const position = (phase / TAU) % 1;
  if (wave === 'sawtooth') return position * 2 - 1;
  return 2 * Math.abs(position * 2 - 1) - 1;
}

function addAt(target: Float32Array, index: number, value: number, loop: boolean): void {
  if (loop) {
    const length = target.length;
    target[((index % length) + length) % length] += value;
  } else if (index >= 0 && index < target.length) {
    target[index] += value;
  }
}

function envelope(t: number, duration: number, attack: number, release: number, decay: number): number {
  const attackGain = attack > 0 ? Math.min(1, t / attack) : 1;
  const releaseGain = release > 0 ? Math.min(1, Math.max(0, duration - t) / release) : 1;
  const body = decay > 0 ? Math.exp(-t / decay) : 1;
  return attackGain * releaseGain * body;
}

export function addTone(target: Float32Array, sampleRate: number, options: ToneOptions): void {
  if (!(options.duration > 0) || !(options.gain > 0) || !Number.isFinite(options.frequency)) return;
  const loop = options.loop === true;
  const startIndex = Math.round(options.start * sampleRate);
  if (!loop && startIndex >= target.length) return;
  const wanted = Math.max(1, Math.round(options.duration * sampleRate));
  const count = loop ? wanted : Math.max(0, Math.min(wanted, target.length - startIndex));
  if (count <= 0) return;

  const attack = clamp(options.attack ?? 0.004, 0.0001, options.duration);
  const release = clamp(options.release ?? 0.02, 0, options.duration);
  const decay = Math.max(0, options.decay ?? 0);
  const wave = options.wave ?? 'sine';
  const glideDuration = options.endFrequency && options.endFrequency > 0
    ? clamp(options.glideSeconds ?? options.duration, 0.0001, options.duration)
    : 0;
  const vibratoRate = Math.max(0, options.vibratoRate ?? 0);
  const vibratoCents = Math.max(0, options.vibratoCents ?? 0);
  const vibratoDelay = Math.max(0, options.vibratoDelay ?? 0);
  const filter = options.filter ? new Biquad(options.filter.kind, options.filter.frequency, options.filter.q ?? 1, sampleRate) : undefined;
  const filterMix = clamp(options.filter?.mix ?? 1, 0, 1);
  let phase = (options.phaseOffset ?? 0) * TAU;

  for (let index = 0; index < count; index++) {
    const t = index / sampleRate;
    let frequency = options.frequency;
    if (glideDuration > 0 && options.endFrequency) {
      const glide = Math.min(1, t / glideDuration);
      frequency *= Math.pow(options.endFrequency / options.frequency, glide);
    }
    if (vibratoCents > 0 && t >= vibratoDelay) {
      frequency *= Math.pow(2, (vibratoCents * Math.sin(TAU * vibratoRate * (t - vibratoDelay))) / 1200);
    }
    phase += (TAU * frequency) / sampleRate;
    let sample = waveform(wave, phase) * envelope(t, options.duration, attack, release, decay);
    if (filter) sample = sample * (1 - filterMix) + filter.process(sample) * filterMix;
    addAt(target, startIndex + index, sample * options.gain, loop);
  }
}

export function addNoise(target: Float32Array, sampleRate: number, options: NoiseOptions): void {
  if (!(options.duration > 0) || !(options.gain > 0)) return;
  const loop = options.loop === true;
  const startIndex = Math.round(options.start * sampleRate);
  if (!loop && startIndex >= target.length) return;
  const wanted = Math.max(1, Math.round(options.duration * sampleRate));
  const count = loop ? wanted : Math.max(0, Math.min(wanted, target.length - startIndex));
  if (count <= 0) return;

  const random = createNoise(options.seed);
  const attack = clamp(options.attack ?? 0.002, 0.0001, options.duration);
  const release = clamp(options.release ?? 0.012, 0, options.duration);
  const decay = Math.max(0, options.decay ?? 0);
  const filter = options.filter ? new Biquad(options.filter.kind, options.filter.frequency, options.filter.q ?? 1, sampleRate) : undefined;
  const filterMix = clamp(options.filter?.mix ?? 1, 0, 1);
  const startFrequency = options.filter?.frequency ?? 1000;
  const endFrequency = options.filterEndFrequency ?? startFrequency;
  let nextFilterUpdate = 0;

  for (let index = 0; index < count; index++) {
    const t = index / sampleRate;
    if (filter && options.filter && index >= nextFilterUpdate) {
      const sweep = Math.min(1, index / Math.max(1, count - 1));
      filter.set(options.filter.kind, startFrequency * Math.pow(endFrequency / startFrequency, sweep), options.filter.q ?? 1, sampleRate);
      nextFilterUpdate = index + 32;
    }
    let sample = (random() * 2 - 1) * envelope(t, options.duration, attack, release, decay);
    if (filter) sample = sample * (1 - filterMix) + filter.process(sample) * filterMix;
    addAt(target, startIndex + index, sample * options.gain, loop);
  }
}

/** One-tap echo; the dry copy is used as the source so the delay cannot run away. */
export function addEcho(target: Float32Array, sampleRate: number, delaySeconds: number, mix: number, loop = false): void {
  const length = target.length;
  const delay = Math.max(1, Math.round(delaySeconds * sampleRate));
  if (length === 0 || mix <= 0) return;
  const dry = target.slice();
  for (let index = 0; index < length; index++) {
    const source = index - delay;
    const wrapped = loop ? (source + length) % length : source;
    if (wrapped >= 0 && wrapped < length) target[index] += dry[wrapped] * mix;
  }
}

/** Fade the very end into the first sample so a loop point is click-free. */
export function matchLoopSeam(target: Float32Array, samples = 128): void {
  if (target.length < 2) return;
  const count = Math.min(samples, Math.floor(target.length / 4));
  if (count < 2) return;
  const delta = target[0] - target[target.length - 1];
  for (let index = 0; index < count; index++) {
    const position = (index + 1) / count;
    target[target.length - count + index] += delta * position * position;
  }
}

/** Scale the whole buffer to an absolute peak. Returns the resulting peak. */
export function normalizePeak(target: Float32Array, peak: number): number {
  if (!(peak > 0)) return 0;
  let maximum = 0;
  for (let index = 0; index < target.length; index++) maximum = Math.max(maximum, Math.abs(target[index]));
  if (maximum <= 1e-9) return 0;
  const scale = peak / maximum;
  for (let index = 0; index < target.length; index++) target[index] *= scale;
  return peak;
}

export function fadeEdges(target: Float32Array, sampleRate: number, fadeInSeconds: number, fadeOutSeconds: number): void {
  const length = target.length;
  const fadeIn = Math.min(length, Math.max(0, Math.round(fadeInSeconds * sampleRate)));
  for (let index = 0; index < fadeIn; index++) {
    target[index] *= fadeIn > 1 ? index / (fadeIn - 1) : 0;
  }
  const fadeOut = Math.min(length, Math.max(0, Math.round(fadeOutSeconds * sampleRate)));
  for (let index = 0; index < fadeOut; index++) {
    target[length - fadeOut + index] *= fadeOut > 1 ? (fadeOut - 1 - index) / (fadeOut - 1) : 0;
  }
}
