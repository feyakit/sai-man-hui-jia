import {
  addEcho, addNoise, addTone, createNoise, fadeEdges, matchLoopSeam, midiToFrequency,
  normalizePeak, noteToMidi, seedFromString,
} from './synth';

/**
 * Original 16-bar festive folk loop in D gong pentatonic (宫商角徵羽 = D E F# A B).
 * 104 BPM, 4/4, so one loop is 36.92 seconds. The melody below was composed for this
 * project; it is not quoted from, or a variation of, any existing tune.
 *
 * Form:
 *   bars 1-2  引子    gong/drum call, rising suona pickup
 *   bars 3-6  A 段    main theme, phrase answers on the second half of each pair
 *   bars 7-10 A' 段   higher answer with a longer, stepwise release
 *   bars 11-14 B 段   contrast section, repeated-note percussion and a rising climax
 *   bars 15-16 尾声   descending cadence on D, final gong wraps into the loop head
 */
export const BGM_BPM = 104;
export const BGM_BEATS_PER_BAR = 4;
export const BGM_BARS = 16;
export const BGM_BEAT_SECONDS = 60 / BGM_BPM;
export const BGM_BAR_SECONDS = BGM_BEATS_PER_BAR * BGM_BEAT_SECONDS;
export const BGM_LOOP_SECONDS = BGM_BARS * BGM_BAR_SECONDS;
export const BGM_SCALE = 'D 宫五声：D E F# A B（宫商角徵羽）';

export const BGM_FORM = [
  { bars: '1-2', name: '引子', text: '锣鼓开场，唢呐从徵音上行到羽音，落回宫音' },
  { bars: '3-6', name: 'A 段', text: '主句从高音宫起，第二句逐级下行落徵' },
  { bars: '7-10', name: "A' 段", text: '提高五度再唱一次，句尾拉长并回宫' },
  { bars: '11-14', name: 'B 段', text: '节奏加密，梆子与鼓点推动，旋律冲到高音羽' },
  { bars: '15-16', name: '尾声', text: '羽—徵—角—宫收束，锣声余音卷入循环开头' },
] as const;

export interface BgmNote {
  /** 1-based bar number. */
  readonly bar: number;
  /** 0-based beat within the bar. */
  readonly beat: number;
  readonly beats: number;
  readonly note: string;
  /** Short upward scoop into the note, the way a suona player often enters a phrase. */
  readonly slide?: boolean;
}

/** Every melody note, written out for review. */
export const BGM_MELODY: readonly BgmNote[] = [
  { bar: 1, beat: 0, beats: 0.5, note: 'A4' },
  { bar: 1, beat: 0.5, beats: 0.5, note: 'B4' },
  { bar: 1, beat: 1, beats: 0.5, note: 'A4' },
  { bar: 1, beat: 1.5, beats: 0.5, note: 'F#4' },
  { bar: 1, beat: 2, beats: 1, note: 'E4' },
  { bar: 1, beat: 3, beats: 1, note: 'D4' },
  { bar: 2, beat: 0, beats: 0.5, note: 'D4' },
  { bar: 2, beat: 0.5, beats: 0.5, note: 'E4' },
  { bar: 2, beat: 1, beats: 1, note: 'F#4' },
  { bar: 2, beat: 2, beats: 1, note: 'A4' },
  { bar: 2, beat: 3, beats: 1, note: 'B4' },

  { bar: 3, beat: 0, beats: 0.5, note: 'D5', slide: true },
  { bar: 3, beat: 0.5, beats: 0.5, note: 'E5' },
  { bar: 3, beat: 1, beats: 1, note: 'F#5' },
  { bar: 3, beat: 2, beats: 0.5, note: 'E5' },
  { bar: 3, beat: 2.5, beats: 0.5, note: 'D5' },
  { bar: 3, beat: 3, beats: 1, note: 'B4' },
  { bar: 4, beat: 0, beats: 0.5, note: 'A4' },
  { bar: 4, beat: 0.5, beats: 0.5, note: 'B4' },
  { bar: 4, beat: 1, beats: 1, note: 'D5' },
  { bar: 4, beat: 2, beats: 0.5, note: 'B4' },
  { bar: 4, beat: 2.5, beats: 0.5, note: 'A4' },
  { bar: 4, beat: 3, beats: 1, note: 'F#4' },
  { bar: 5, beat: 0, beats: 0.5, note: 'D5' },
  { bar: 5, beat: 0.5, beats: 0.5, note: 'F#5' },
  { bar: 5, beat: 1, beats: 1, note: 'A5' },
  { bar: 5, beat: 2, beats: 0.5, note: 'F#5' },
  { bar: 5, beat: 2.5, beats: 0.5, note: 'E5' },
  { bar: 5, beat: 3, beats: 1, note: 'D5' },
  { bar: 6, beat: 0, beats: 1, note: 'E5' },
  { bar: 6, beat: 1, beats: 0.5, note: 'D5' },
  { bar: 6, beat: 1.5, beats: 0.5, note: 'B4' },
  { bar: 6, beat: 2, beats: 1, note: 'A4' },
  { bar: 6, beat: 3, beats: 1, note: 'D4' },

  { bar: 7, beat: 0, beats: 0.5, note: 'F#5', slide: true },
  { bar: 7, beat: 0.5, beats: 0.5, note: 'A5' },
  { bar: 7, beat: 1, beats: 1, note: 'B5' },
  { bar: 7, beat: 2, beats: 0.5, note: 'A5' },
  { bar: 7, beat: 2.5, beats: 0.5, note: 'F#5' },
  { bar: 7, beat: 3, beats: 1, note: 'E5' },
  { bar: 8, beat: 0, beats: 0.5, note: 'D5' },
  { bar: 8, beat: 0.5, beats: 0.5, note: 'E5' },
  { bar: 8, beat: 1, beats: 1, note: 'F#5' },
  { bar: 8, beat: 2, beats: 0.5, note: 'A5' },
  { bar: 8, beat: 2.5, beats: 0.5, note: 'F#5' },
  { bar: 8, beat: 3, beats: 1, note: 'E5' },
  { bar: 9, beat: 0, beats: 0.75, note: 'D5' },
  { bar: 9, beat: 0.75, beats: 0.25, note: 'E5' },
  { bar: 9, beat: 1, beats: 0.5, note: 'F#5' },
  { bar: 9, beat: 1.5, beats: 0.5, note: 'E5' },
  { bar: 9, beat: 2, beats: 0.5, note: 'D5' },
  { bar: 9, beat: 2.5, beats: 0.5, note: 'B4' },
  { bar: 9, beat: 3, beats: 1, note: 'A4' },
  { bar: 10, beat: 0, beats: 0.5, note: 'B4' },
  { bar: 10, beat: 0.5, beats: 0.5, note: 'A4' },
  { bar: 10, beat: 1, beats: 1, note: 'F#4' },
  { bar: 10, beat: 2, beats: 0.5, note: 'E4' },
  { bar: 10, beat: 2.5, beats: 0.5, note: 'D4' },
  { bar: 10, beat: 3, beats: 1, note: 'D4' },

  { bar: 11, beat: 0, beats: 0.5, note: 'A4', slide: true },
  { bar: 11, beat: 0.5, beats: 0.5, note: 'B4' },
  { bar: 11, beat: 1, beats: 1, note: 'D5' },
  { bar: 11, beat: 2, beats: 1, note: 'E5' },
  { bar: 11, beat: 3, beats: 1, note: 'D5' },
  { bar: 12, beat: 0, beats: 0.5, note: 'B4' },
  { bar: 12, beat: 0.5, beats: 0.5, note: 'D5' },
  { bar: 12, beat: 1, beats: 1, note: 'E5' },
  { bar: 12, beat: 2, beats: 1, note: 'F#5' },
  { bar: 12, beat: 3, beats: 1, note: 'E5' },
  { bar: 13, beat: 0, beats: 1, note: 'A5' },
  { bar: 13, beat: 1, beats: 0.5, note: 'F#5' },
  { bar: 13, beat: 1.5, beats: 0.5, note: 'E5' },
  { bar: 13, beat: 2, beats: 1, note: 'D5' },
  { bar: 13, beat: 3, beats: 1, note: 'B4' },
  { bar: 14, beat: 0, beats: 0.5, note: 'A4' },
  { bar: 14, beat: 0.5, beats: 0.5, note: 'B4' },
  { bar: 14, beat: 1, beats: 0.5, note: 'D5' },
  { bar: 14, beat: 1.5, beats: 0.5, note: 'E5' },
  { bar: 14, beat: 2, beats: 1, note: 'F#5' },
  { bar: 14, beat: 3, beats: 1, note: 'A5' },

  { bar: 15, beat: 0, beats: 0.5, note: 'B5', slide: true },
  { bar: 15, beat: 0.5, beats: 0.5, note: 'A5' },
  { bar: 15, beat: 1, beats: 1, note: 'F#5' },
  { bar: 15, beat: 2, beats: 1, note: 'E5' },
  { bar: 15, beat: 3, beats: 1, note: 'D5' },
  { bar: 16, beat: 0, beats: 0.5, note: 'E5' },
  { bar: 16, beat: 0.5, beats: 0.5, note: 'D5' },
  { bar: 16, beat: 1, beats: 1, note: 'B4' },
  { bar: 16, beat: 2, beats: 2, note: 'D5' },
];

const BASS_ROOTS = ['D2', 'A2', 'D2', 'A2', 'D2', 'A2', 'D3', 'A2', 'D3', 'A2', 'B2', 'A2', 'D3', 'A2', 'D3', 'D2'];

function noteFrequency(note: string): number {
  return midiToFrequency(noteToMidi(note));
}

function addSuonaNote(buffer: Float32Array, sampleRate: number, start: number, duration: number, note: string, slide: boolean, random: () => number): void {
  const frequency = noteFrequency(note);
  const attack = Math.min(0.035, duration * 0.28);
  const release = Math.min(0.11, Math.max(0.035, duration * 0.32));
  const vibratoRate = 5.3 + random() * 1.2;
  const vibratoCents = 6 + random() * 4;
  const scoop = slide ? frequency * Math.pow(2, -2 / 12) : frequency;
  const glide = slide ? Math.min(0.075, duration * 0.35) : undefined;
  const startAt = start + 0.012;

  addTone(buffer, sampleRate, {
    start: startAt, duration, gain: 0.16, frequency: scoop, endFrequency: frequency, glideSeconds: glide,
    wave: 'sawtooth', attack, release, vibratoRate, vibratoCents, vibratoDelay: 0.09, loop: true,
    filter: { kind: 'bandpass', frequency: 1480, q: 0.92, mix: 0.78 },
  });
  addTone(buffer, sampleRate, {
    start: startAt, duration, gain: 0.052, frequency: scoop * 1.004, endFrequency: frequency * 1.004,
    glideSeconds: glide, wave: 'square', attack, release, vibratoRate: vibratoRate * 1.013,
    vibratoCents, vibratoDelay: 0.09, phaseOffset: 0.17, loop: true,
    filter: { kind: 'bandpass', frequency: 1820, q: 1.1, mix: 0.64 },
  });
  addTone(buffer, sampleRate, {
    start: startAt, duration, gain: 0.032, frequency: scoop, endFrequency: frequency, glideSeconds: glide,
    wave: 'sawtooth', attack, release, vibratoRate, vibratoCents, vibratoDelay: 0.09, loop: true,
  });
}

function addGong(buffer: Float32Array, sampleRate: number, start: number, gain: number): void {
  const base = 105;
  const ratios = [1, 1.47, 2.09, 2.72, 3.91, 5.17];
  const levels = [1, 0.62, 0.43, 0.29, 0.19, 0.11];
  const decays = [2.9, 2.4, 1.9, 1.45, 0.95, 0.62];
  for (let index = 0; index < ratios.length; index++) {
    addTone(buffer, sampleRate, {
      start, duration: 3.6, gain: gain * levels[index], frequency: base * ratios[index],
      wave: 'sine', attack: 0.005, decay: decays[index], release: 0.18, loop: true,
    });
  }
  addNoise(buffer, sampleRate, {
    start, duration: 0.2, gain: gain * 0.55, seed: seedFromString(`gong-${start.toFixed(3)}`),
    attack: 0.002, decay: 0.045, loop: true,
    filter: { kind: 'bandpass', frequency: 3100, q: 0.7, mix: 0.9 },
  });
}

function addDrum(buffer: Float32Array, sampleRate: number, start: number, gain: number): void {
  addTone(buffer, sampleRate, {
    start, duration: 0.5, gain, frequency: 132, endFrequency: 52, glideSeconds: 0.22,
    wave: 'sine', attack: 0.002, decay: 0.17, release: 0.04, loop: true,
  });
  addNoise(buffer, sampleRate, {
    start, duration: 0.13, gain: gain * 0.62, seed: seedFromString(`drum-${start.toFixed(3)}`),
    attack: 0.001, decay: 0.035, release: 0.02, loop: true,
    filter: { kind: 'lowpass', frequency: 420, q: 0.8, mix: 1 },
  });
}

function addCymbal(buffer: Float32Array, sampleRate: number, start: number, gain: number): void {
  addNoise(buffer, sampleRate, {
    start, duration: 0.42, gain, seed: seedFromString(`cymbal-${start.toFixed(3)}`),
    attack: 0.001, decay: 0.11, release: 0.05, loop: true,
    filter: { kind: 'highpass', frequency: 5200, q: 0.75, mix: 1 },
  });
  addNoise(buffer, sampleRate, {
    start, duration: 0.3, gain: gain * 0.55, seed: seedFromString(`cymbal-top-${start.toFixed(3)}`),
    attack: 0.001, decay: 0.08, release: 0.04, loop: true,
    filter: { kind: 'bandpass', frequency: 7600, q: 1.4, mix: 0.9 },
  });
}

function addWoodblock(buffer: Float32Array, sampleRate: number, start: number, high: boolean, gain: number): void {
  const frequency = high ? 1460 : 980;
  addTone(buffer, sampleRate, {
    start, duration: 0.09, gain, frequency, wave: 'sine', attack: 0.001, decay: 0.018, release: 0.015, loop: true,
  });
  addTone(buffer, sampleRate, {
    start, duration: 0.06, gain: gain * 0.45, frequency: frequency * 1.61, wave: 'triangle',
    attack: 0.001, decay: 0.012, release: 0.01, loop: true,
  });
  addNoise(buffer, sampleRate, {
    start, duration: 0.025, gain: gain * 0.5, seed: seedFromString(`block-${start.toFixed(3)}`),
    attack: 0.001, decay: 0.006, release: 0.005, loop: true,
    filter: { kind: 'bandpass', frequency: 3200, q: 1.2, mix: 1 },
  });
}

function addBass(buffer: Float32Array, sampleRate: number, start: number, note: string): void {
  const frequency = noteFrequency(note);
  addTone(buffer, sampleRate, {
    start, duration: 0.52, gain: 0.058, frequency, wave: 'triangle', attack: 0.004, decay: 0.19, release: 0.035, loop: true,
  });
  addTone(buffer, sampleRate, {
    start, duration: 0.58, gain: 0.026, frequency: frequency / 2, wave: 'sine', attack: 0.006, decay: 0.24, release: 0.04, loop: true,
  });
}

/** Render the complete, seamless mono BGM loop at the requested sample rate. */
export function renderBgm(sampleRate: number): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate < 1000) throw new RangeError('sampleRate must be at least 1000 Hz');
  const length = Math.max(1, Math.round(BGM_LOOP_SECONDS * sampleRate));
  const buffer = new Float32Array(length);
  const random = createNoise(seedFromString('stack-bgm-v1'));

  for (let bar = 0; bar < BGM_BARS; bar++) {
    const barStart = bar * BGM_BAR_SECONDS;
    const root = BASS_ROOTS[bar];
    addBass(buffer, sampleRate, barStart, root);

    if (bar % 2 === 0) {
      addTone(buffer, sampleRate, {
        start: barStart, duration: BGM_BAR_SECONDS * 2, gain: 0.014, frequency: noteFrequency(root),
        wave: 'sine', attack: 0.36, release: 0.4, loop: true,
      });
      addTone(buffer, sampleRate, {
        start: barStart, duration: BGM_BAR_SECONDS * 2, gain: 0.009, frequency: noteFrequency(root) * 1.5,
        wave: 'triangle', attack: 0.42, release: 0.45, loop: true,
      });
    }

    addDrum(buffer, sampleRate, barStart, 0.135);
    addDrum(buffer, sampleRate, barStart + BGM_BEAT_SECONDS * 2, 0.088);
    if (bar % 4 === 3) addDrum(buffer, sampleRate, barStart + BGM_BEAT_SECONDS * 3.5, 0.064);
    if (bar % 2 === 0) addCymbal(buffer, sampleRate, barStart + BGM_BEAT_SECONDS * 3, 0.042);
    else addCymbal(buffer, sampleRate, barStart + BGM_BEAT_SECONDS * 2.5, 0.034);

    for (let beat = 0; beat < BGM_BEATS_PER_BAR; beat++) {
      addWoodblock(buffer, sampleRate, barStart + beat * BGM_BEAT_SECONDS, beat % 2 === 1, beat % 2 === 0 ? 0.031 : 0.021);
    }
    if (bar % 2 === 1) addWoodblock(buffer, sampleRate, barStart + BGM_BEAT_SECONDS * 3.5, true, 0.017);
    if (bar % 4 === 0 || bar === BGM_BARS - 1) addGong(buffer, sampleRate, barStart, 0.075);
  }

  for (const note of BGM_MELODY) {
    const start = (note.bar - 1) * BGM_BAR_SECONDS + note.beat * BGM_BEAT_SECONDS;
    const duration = note.beats * BGM_BEAT_SECONDS * 0.94;
    addSuonaNote(buffer, sampleRate, start, duration, note.note, note.slide === true, random);
  }

  addEcho(buffer, sampleRate, 0.115, 0.16, true);
  addEcho(buffer, sampleRate, 0.193, 0.085, true);
  matchLoopSeam(buffer);
  normalizePeak(buffer, 0.32);
  fadeEdges(buffer, sampleRate, 0.002, 0.002);
  return buffer;
}
