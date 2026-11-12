import {
  addNoise, addTone, clamp, createNoise, fadeEdges, normalizePeak, seedFromString,
} from './synth';

export type StackSfxEvent =
  | 'tap'
  | 'fly'
  | 'pack'
  | 'combo'
  | 'warn'
  | 'mom'
  | 'swap'
  | 'win'
  | 'fail'
  | 'prop'
  | 'home';

export interface StackSfxOptions {
  /** Combo level, clamped to 1..8. Ignored by other events. */
  readonly level?: number;
}

export const STACK_SFX_EVENTS: readonly StackSfxEvent[] = [
  'tap', 'fly', 'pack', 'combo', 'warn', 'mom', 'swap', 'win', 'fail', 'prop', 'home',
];

export const SFX_DURATIONS: Readonly<Record<StackSfxEvent, number>> = {
  tap: 0.12,
  fly: 0.22,
  pack: 0.36,
  combo: 0.34,
  warn: 0.62,
  mom: 0.55,
  swap: 0.32,
  win: 2.3,
  fail: 0.9,
  prop: 0.6,
  home: 3.6,
};

const SFX_PEAKS: Readonly<Record<StackSfxEvent, number>> = {
  tap: 0.38,
  fly: 0.42,
  pack: 0.52,
  combo: 0.48,
  warn: 0.5,
  mom: 0.46,
  swap: 0.46,
  win: 0.58,
  fail: 0.52,
  prop: 0.46,
  home: 0.58,
};

export function comboFrequency(level: number): number {
  const safeLevel = clamp(Math.round(level || 1), 1, 8);
  return 523.251 * Math.pow(2, ((safeLevel - 1) * 2) / 12);
}

function addTap(buffer: Float32Array, sampleRate: number): void {
  addTone(buffer, sampleRate, {
    start: 0.004, duration: 0.075, gain: 0.3, frequency: 980, endFrequency: 660,
    wave: 'triangle', attack: 0.001, decay: 0.031, release: 0.012,
  });
  addTone(buffer, sampleRate, {
    start: 0.004, duration: 0.055, gain: 0.12, frequency: 1580, endFrequency: 1060,
    wave: 'sine', attack: 0.001, decay: 0.018, release: 0.01,
  });
  addNoise(buffer, sampleRate, {
    start: 0.004, duration: 0.025, gain: 0.13, seed: seedFromString('sfx-tap-wood'),
    attack: 0.001, decay: 0.007, release: 0.004,
    filter: { kind: 'bandpass', frequency: 3000, q: 1.2, mix: 1 },
  });
}

function addFly(buffer: Float32Array, sampleRate: number): void {
  addNoise(buffer, sampleRate, {
    start: 0.01, duration: 0.18, gain: 0.2, seed: seedFromString('sfx-fly-air'),
    attack: 0.018, release: 0.05,
    filter: { kind: 'bandpass', frequency: 480, q: 0.9, mix: 0.95 },
    filterEndFrequency: 2600,
  });
  addTone(buffer, sampleRate, {
    start: 0.01, duration: 0.17, gain: 0.12, frequency: 330, endFrequency: 760,
    wave: 'sine', attack: 0.014, release: 0.04,
  });
}

function addPack(buffer: Float32Array, sampleRate: number): void {
  addNoise(buffer, sampleRate, {
    start: 0.002, duration: 0.08, gain: 0.18, seed: seedFromString('sfx-pack-tape'),
    attack: 0.001, decay: 0.02, release: 0.01,
    filter: { kind: 'bandpass', frequency: 2600, q: 1.1, mix: 1 },
  });
  addTone(buffer, sampleRate, {
    start: 0.006, duration: 0.18, gain: 0.3, frequency: 172, endFrequency: 68,
    wave: 'sine', attack: 0.002, decay: 0.063, release: 0.03,
  });
  addTone(buffer, sampleRate, {
    start: 0.15, duration: 0.2, gain: 0.12, frequency: 1046.5, wave: 'triangle',
    attack: 0.002, decay: 0.07, release: 0.035,
  });
  addTone(buffer, sampleRate, {
    start: 0.155, duration: 0.17, gain: 0.065, frequency: 1568, wave: 'sine',
    attack: 0.002, decay: 0.06, release: 0.03,
  });
}

function addCombo(buffer: Float32Array, sampleRate: number, level: number): void {
  const frequency = comboFrequency(level);
  addTone(buffer, sampleRate, {
    start: 0.003, duration: 0.3, gain: 0.36, frequency, endFrequency: frequency * 1.012,
    glideSeconds: 0.055, wave: 'sine', attack: 0.003, decay: 0.17, release: 0.065,
  });
  addTone(buffer, sampleRate, {
    start: 0.003, duration: 0.2, gain: 0.018, frequency: frequency * 3, wave: 'sine',
    attack: 0.003, decay: 0.09, release: 0.04,
  });
  addNoise(buffer, sampleRate, {
    start: 0.0, duration: 0.014, gain: 0.025, seed: seedFromString(`sfx-combo-${level}`),
    attack: 0.001, decay: 0.004, release: 0.003,
    filter: { kind: 'highpass', frequency: 4500, q: 0.8, mix: 1 },
  });
}

function addWarn(buffer: Float32Array, sampleRate: number): void {
  const notes = [880, 880, 740];
  for (let index = 0; index < notes.length; index++) {
    const start = index * 0.19;
    addTone(buffer, sampleRate, {
      start, duration: 0.11, gain: 0.16, frequency: notes[index], wave: 'square',
      attack: 0.004, release: 0.025,
      filter: { kind: 'lowpass', frequency: 2200, q: 0.9, mix: 0.75 },
    });
    addTone(buffer, sampleRate, {
      start, duration: 0.1, gain: 0.055, frequency: notes[index] * 2, wave: 'sine',
      attack: 0.003, release: 0.02,
    });
  }
  addTone(buffer, sampleRate, {
    start: 0.41, duration: 0.16, gain: 0.1, frequency: 185, wave: 'sine',
    attack: 0.006, decay: 0.06, release: 0.04,
  });
}

function addMom(buffer: Float32Array, sampleRate: number): void {
  addTone(buffer, sampleRate, {
    start: 0.01, duration: 0.22, gain: 0.19, frequency: 440, wave: 'triangle',
    attack: 0.01, release: 0.05, vibratoRate: 4.8, vibratoCents: 10, vibratoDelay: 0.04,
    filter: { kind: 'bandpass', frequency: 1200, q: 1.1, mix: 0.35 },
  });
  addTone(buffer, sampleRate, {
    start: 0.15, duration: 0.3, gain: 0.16, frequency: 587.33, wave: 'triangle',
    attack: 0.012, release: 0.06, vibratoRate: 5.1, vibratoCents: 8, vibratoDelay: 0.05,
    filter: { kind: 'bandpass', frequency: 1350, q: 1.0, mix: 0.35 },
  });
  addTone(buffer, sampleRate, {
    start: 0.15, duration: 0.27, gain: 0.06, frequency: 880, wave: 'sine',
    attack: 0.012, release: 0.06,
  });
  addNoise(buffer, sampleRate, {
    start: 0.0, duration: 0.06, gain: 0.035, seed: seedFromString('sfx-mom-knock'),
    attack: 0.001, decay: 0.015, release: 0.01,
    filter: { kind: 'bandpass', frequency: 1900, q: 0.9, mix: 1 },
  });
}

function addSwap(buffer: Float32Array, sampleRate: number): void {
  addNoise(buffer, sampleRate, {
    start: 0.0, duration: 0.17, gain: 0.16, seed: seedFromString('sfx-swap-air'),
    attack: 0.006, release: 0.045,
    filter: { kind: 'bandpass', frequency: 2100, q: 0.85, mix: 0.95 },
    filterEndFrequency: 520,
  });
  addNoise(buffer, sampleRate, {
    start: 0.12, duration: 0.035, gain: 0.12, seed: seedFromString('sfx-swap-click'),
    attack: 0.001, decay: 0.009, release: 0.006,
    filter: { kind: 'bandpass', frequency: 1800, q: 1.3, mix: 1 },
  });
  addTone(buffer, sampleRate, {
    start: 0.12, duration: 0.1, gain: 0.085, frequency: 320, endFrequency: 176,
    wave: 'square', attack: 0.001, decay: 0.03, release: 0.018,
    filter: { kind: 'lowpass', frequency: 1500, q: 0.8, mix: 0.7 },
  });
  addTone(buffer, sampleRate, {
    start: 0.16, duration: 0.17, gain: 0.18, frequency: 142, endFrequency: 63,
    wave: 'sine', attack: 0.002, decay: 0.055, release: 0.03,
  });
}

function addGongOpening(buffer: Float32Array, sampleRate: number): void {
  const ratios = [1, 1.49, 2.13, 2.79, 4.03];
  const levels = [1, 0.58, 0.38, 0.24, 0.13];
  for (let index = 0; index < ratios.length; index++) {
    addTone(buffer, sampleRate, {
      start: 0.0, duration: 1.9, gain: 0.075 * levels[index], frequency: 118 * ratios[index],
      wave: 'sine', attack: 0.004, decay: 0.72 / (index * 0.22 + 1), release: 0.08,
    });
  }
  addNoise(buffer, sampleRate, {
    start: 0.0, duration: 0.2, gain: 0.055, seed: seedFromString('sfx-win-gong'),
    attack: 0.001, decay: 0.04, release: 0.02,
    filter: { kind: 'bandpass', frequency: 3400, q: 0.72, mix: 0.9 },
  });
}

function addFirecrackers(buffer: Float32Array, sampleRate: number): void {
  const random = createNoise(seedFromString('sfx-win-firecrackers-v1'));
  for (let index = 0; index < 34; index++) {
    const start = 0.3 + random() * 1.72;
    const duration = 0.02 + random() * 0.045;
    const frequency = 1300 + random() * 4300;
    const gain = 0.1 + random() * 0.11;
    addNoise(buffer, sampleRate, {
      start, duration, gain, seed: Math.floor(random() * 0xffffffff),
      attack: 0.001, decay: 0.009 + random() * 0.008, release: 0.007,
      filter: { kind: 'bandpass', frequency, q: 0.75 + random() * 0.6, mix: 0.95 },
    });
    if (random() < 0.34) {
      addTone(buffer, sampleRate, {
        start, duration: 0.055, gain: 0.045 + random() * 0.035, frequency: 92 + random() * 95,
        wave: 'sine', attack: 0.001, decay: 0.018, release: 0.012,
      });
    }
  }
  addNoise(buffer, sampleRate, {
    start: 2.01, duration: 0.25, gain: 0.15, seed: seedFromString('sfx-win-final-cymbal'),
    attack: 0.001, decay: 0.085, release: 0.04,
    filter: { kind: 'highpass', frequency: 4300, q: 0.8, mix: 1 },
  });
}

function addWin(buffer: Float32Array, sampleRate: number): void {
  addGongOpening(buffer, sampleRate);
  const notes = [587.33, 739.99, 880, 1174.66];
  for (let index = 0; index < notes.length; index++) {
    const start = index * 0.12;
    addTone(buffer, sampleRate, {
      start, duration: 0.23, gain: 0.13, frequency: notes[index], wave: 'sawtooth',
      attack: 0.005, decay: 0.09, release: 0.05,
      filter: { kind: 'bandpass', frequency: 1600, q: 0.9, mix: 0.7 },
    });
    addTone(buffer, sampleRate, {
      start, duration: 0.2, gain: 0.04, frequency: notes[index] * 2, wave: 'sine',
      attack: 0.004, decay: 0.075, release: 0.04,
    });
  }
  addFirecrackers(buffer, sampleRate);
}

/** Finale at home: a long string of firecrackers, two gongs and a rising festive phrase. */
function addHome(buffer: Float32Array, sampleRate: number): void {
  const random = createNoise(seedFromString('sfx-home-firecracker-string-v1'));
  for (let index = 0; index < 120; index++) {
    // Denser in the middle, like a hanging string burning down.
    const start = 0.05 + Math.pow(random(), 0.9) * 3.1;
    const duration = 0.018 + random() * 0.04;
    addNoise(buffer, sampleRate, {
      start, duration, gain: 0.08 + random() * 0.12, seed: Math.floor(random() * 0xffffffff),
      attack: 0.001, decay: 0.008 + random() * 0.01, release: 0.006,
      filter: { kind: 'bandpass', frequency: 1200 + random() * 4800, q: 0.7 + random() * 0.7, mix: 0.95 },
    });
    if (random() < 0.3) {
      addTone(buffer, sampleRate, {
        start, duration: 0.06, gain: 0.05 + random() * 0.04, frequency: 80 + random() * 110,
        wave: 'sine', attack: 0.001, decay: 0.02, release: 0.012,
      });
    }
  }
  for (const start of [0.0, 1.6]) {
    addTone(buffer, sampleRate, {
      start, duration: 1.4, gain: 0.16, frequency: 196, endFrequency: 185,
      wave: 'triangle', attack: 0.004, decay: 0.6, release: 0.4,
    });
    addTone(buffer, sampleRate, {
      start, duration: 1.2, gain: 0.07, frequency: 523.25, endFrequency: 498,
      wave: 'sine', attack: 0.003, decay: 0.5, release: 0.3,
    });
  }
  const phrase = [587.33, 659.25, 783.99, 880, 1046.5, 880, 1174.66];
  for (let index = 0; index < phrase.length; index++) {
    addTone(buffer, sampleRate, {
      start: 0.45 + index * 0.17, duration: index === phrase.length - 1 ? 0.6 : 0.2, gain: 0.12,
      frequency: phrase[index], wave: 'sawtooth', attack: 0.006, decay: 0.08, release: 0.06,
      filter: { kind: 'bandpass', frequency: 1700, q: 0.9, mix: 0.7 },
    });
  }
  addNoise(buffer, sampleRate, {
    start: 3.2, duration: 0.3, gain: 0.16, seed: seedFromString('sfx-home-final-bang'),
    attack: 0.001, decay: 0.09, release: 0.05,
    filter: { kind: 'lowpass', frequency: 900, q: 0.8, mix: 1 },
  });
}

function addFail(buffer: Float32Array, sampleRate: number): void {
  addTone(buffer, sampleRate, {
    start: 0.0, duration: 0.58, gain: 0.16, frequency: 392, endFrequency: 196,
    wave: 'sawtooth', attack: 0.01, release: 0.12,
    filter: { kind: 'lowpass', frequency: 1350, q: 0.9, mix: 0.7 },
  });
  addTone(buffer, sampleRate, {
    start: 0.04, duration: 0.76, gain: 0.12, frequency: 293.66, endFrequency: 146.83,
    wave: 'triangle', attack: 0.012, release: 0.16,
  });
  addTone(buffer, sampleRate, {
    start: 0.08, duration: 0.7, gain: 0.16, frequency: 110, endFrequency: 55,
    wave: 'sine', attack: 0.008, decay: 0.33, release: 0.12,
  });
  addNoise(buffer, sampleRate, {
    start: 0.0, duration: 0.22, gain: 0.08, seed: seedFromString('sfx-fail-thud'),
    attack: 0.002, decay: 0.05, release: 0.03,
    filter: { kind: 'lowpass', frequency: 520, q: 0.8, mix: 1 },
  });
}

function addProp(buffer: Float32Array, sampleRate: number): void {
  const notes = [587.33, 739.99, 880, 1174.66];
  for (let index = 0; index < notes.length; index++) {
    const start = index * 0.075;
    addTone(buffer, sampleRate, {
      start, duration: 0.3, gain: 0.115, frequency: notes[index], wave: 'sine',
      attack: 0.003, decay: 0.12, release: 0.06,
    });
    addTone(buffer, sampleRate, {
      start, duration: 0.2, gain: 0.03, frequency: notes[index] * 2.01, wave: 'sine',
      attack: 0.002, decay: 0.075, release: 0.04,
    });
  }
  addNoise(buffer, sampleRate, {
    start: 0.02, duration: 0.3, gain: 0.045, seed: seedFromString('sfx-prop-shimmer'),
    attack: 0.02, decay: 0.11, release: 0.08,
    filter: { kind: 'bandpass', frequency: 4800, q: 1.3, mix: 0.9 },
    filterEndFrequency: 7200,
  });
}

/** Render one deterministic mono sound effect. Peak is always <= 0.6. */
export function renderSfx(event: StackSfxEvent, sampleRate: number, options: StackSfxOptions = {}): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate < 1000) throw new RangeError('sampleRate must be at least 1000 Hz');
  if (!(event in SFX_DURATIONS)) throw new RangeError(`Unknown sfx event: ${String(event)}`);
  const duration = SFX_DURATIONS[event];
  const buffer = new Float32Array(Math.max(1, Math.round(duration * sampleRate)));

  switch (event) {
    case 'tap': addTap(buffer, sampleRate); break;
    case 'fly': addFly(buffer, sampleRate); break;
    case 'pack': addPack(buffer, sampleRate); break;
    case 'combo': addCombo(buffer, sampleRate, options.level ?? 1); break;
    case 'warn': addWarn(buffer, sampleRate); break;
    case 'mom': addMom(buffer, sampleRate); break;
    case 'swap': addSwap(buffer, sampleRate); break;
    case 'win': addWin(buffer, sampleRate); break;
    case 'fail': addFail(buffer, sampleRate); break;
    case 'prop': addProp(buffer, sampleRate); break;
    case 'home': addHome(buffer, sampleRate); break;
  }

  fadeEdges(buffer, sampleRate, 0.0015, event === 'win' || event === 'home' ? 0.03 : 0.012);
  normalizePeak(buffer, SFX_PEAKS[event]);
  return buffer;
}
