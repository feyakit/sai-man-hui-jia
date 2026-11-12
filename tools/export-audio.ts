import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BGM_LOOP_SECONDS, renderBgm } from '../client/assets/scripts/core/audio/stack-music';
import {
  renderSfx, SFX_DURATIONS, STACK_SFX_EVENTS,
} from '../client/assets/scripts/core/audio/stack-sfx';
import { fadeEdges } from '../client/assets/scripts/core/audio/synth';
import { run } from './level-data';

const SAMPLE_RATE = 44100;
const GAP_SECONDS = 0.6;

/** Minimal 16-bit PCM mono WAV writer; no external audio dependency. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const output = Buffer.alloc(44 + dataBytes);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    output.writeInt16LE(value < 0 ? Math.round(value * 32768) : Math.round(value * 32767), 44 + index * 2);
  }
  return output;
}

function concatWithGaps(clips: readonly Float32Array[], sampleRate: number, gapSeconds: number): Float32Array {
  const gap = Math.round(gapSeconds * sampleRate);
  const total = clips.reduce((sum, clip) => sum + clip.length, 0) + Math.max(0, clips.length - 1) * gap;
  const output = new Float32Array(total);
  let cursor = 0;
  for (let index = 0; index < clips.length; index++) {
    output.set(clips[index], cursor);
    cursor += clips[index].length;
    if (index < clips.length - 1) cursor += gap;
  }
  return output;
}

run(async () => {
  const target = process.argv[2];
  if (!target) throw new Error('Usage: node --import tsx tools/export-audio.ts <output-directory>');
  const outputDir = resolve(target);
  await mkdir(outputDir, { recursive: true });

  const loop = renderBgm(SAMPLE_RATE);
  const loopPath = join(outputDir, 'bgm-loop.wav');
  await writeFile(loopPath, encodeWav(loop, SAMPLE_RATE));

  const thirtySeconds = loop.slice(0, Math.round(30 * SAMPLE_RATE));
  fadeEdges(thirtySeconds, SAMPLE_RATE, 0, 1);
  const thirtyPath = join(outputDir, 'bgm-30s.wav');
  await writeFile(thirtyPath, encodeWav(thirtySeconds, SAMPLE_RATE));

  for (const event of STACK_SFX_EVENTS) {
    if (event === 'combo') continue;
    const file = join(outputDir, `sfx-${event}.wav`);
    await writeFile(file, encodeWav(renderSfx(event, SAMPLE_RATE), SAMPLE_RATE));
  }
  for (let level = 1; level <= 8; level++) {
    const file = join(outputDir, `sfx-combo-${level}.wav`);
    await writeFile(file, encodeWav(renderSfx('combo', SAMPLE_RATE, { level }), SAMPLE_RATE));
  }

  const sequence: Float32Array[] = [];
  for (const event of STACK_SFX_EVENTS) {
    if (event === 'combo') {
      for (let level = 1; level <= 5; level++) sequence.push(renderSfx('combo', SAMPLE_RATE, { level }));
    } else {
      sequence.push(renderSfx(event, SAMPLE_RATE));
    }
  }
  const allPath = join(outputDir, 'sfx-all.wav');
  await writeFile(allPath, encodeWav(concatWithGaps(sequence, SAMPLE_RATE, GAP_SECONDS), SAMPLE_RATE));

  process.stdout.write(`BGM loop: ${BGM_LOOP_SECONDS.toFixed(2)} s -> ${loopPath}\n`);
  process.stdout.write(`BGM excerpt: 30.00 s (1 s fade-out) -> ${thirtyPath}\n`);
  process.stdout.write(`SFX: ${STACK_SFX_EVENTS.map(event => `${event}=${SFX_DURATIONS[event].toFixed(2)}s`).join(', ')}\n`);
  process.stdout.write(`SFX pack: ${allPath} (${sequence.length} cues, ${GAP_SECONDS}s gaps)\n`);
  process.stdout.write(`Individual WAVs written to ${outputDir}\n`);
});
