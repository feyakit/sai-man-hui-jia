import assert from 'node:assert/strict';
import { appendFile, stat, writeFile, rename, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import * as asar from '@electron/asar';

const enginePackage = './modules/engine-extensions/extensions/engine-extends';
const anchor = '"./modules/editor-extensions/extensions/ui-kit"';

export function preloadImporters(source) {
  // Creator 3.8.8 starts asset-db before engine-extends is enabled. The DB can
  // permanently import scripts/folders using '*', even after query-ready is true.
  // Enable engine-extends with the other pre-packages, before asset-db starts.
  // https://github.com/cocos/cocos-engine/issues/19250
  assert.equal(source.split(anchor).length, 2, 'Unknown Creator launch layout: expected one ui-kit pre-package');
  const fixed = `${anchor},"${enginePackage}"`;
  if (source.includes(fixed)) return source;
  assert.ok(source.includes(`${anchor}].forEach(`), 'Unknown Creator pre-package loop');
  return source.replace(`${anchor}].forEach(`, `${fixed}].forEach(`);
}

export async function prepareEditor(archive) {
  const source = asar.extractFile(archive, 'launch/dist/launch.js').toString('utf8');
  const patched = preloadImporters(source);
  if (patched === source) return;
  const {header, headerSize} = asar.getRawHeader(archive);
  const dataStart = 8 + headerSize;
  const entry = header.files.launch.files.dist.files['launch.js'];
  assert.ok(!entry.unpacked && entry.integrity?.algorithm === 'SHA256', 'Unknown Creator launch entry');
  const payload = Buffer.from(patched);
  const hash = createHash('sha256').update(payload).digest('hex');
  assert.ok(payload.length < entry.integrity.blockSize, 'Unexpected launch script size');
  entry.offset = String((await stat(archive)).size - dataStart);
  entry.size = payload.length;
  entry.integrity = {...entry.integrity, hash, blocks:[hash]};
  // ASAR: uint32 size pickle, then a pickle containing the JSON header string.
  // Offsets are relative to the data section. Copy that section unchanged and
  // append the patched launch script; all other entries and .unpacked files stay
  // byte-for-byte intact. Avoid expanding/repacking thousands of native helpers.
  const json = Buffer.from(JSON.stringify(header));
  const aligned = Math.ceil(json.length / 4) * 4;
  const prefix = Buffer.alloc(16 + aligned);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(8 + aligned, 4);
  prefix.writeUInt32LE(4 + aligned, 8);
  prefix.writeUInt32LE(json.length, 12);
  json.copy(prefix, 16);
  const output = `${archive}.patched`;
  try {
    await writeFile(output, prefix);
    await pipeline(createReadStream(archive, {start:dataStart}), createWriteStream(output, {flags:'a'}));
    await appendFile(output, payload);
    assert.equal(asar.extractFile(output, 'launch/dist/launch.js').toString('utf8'), patched);
    await rename(output, archive);
    asar.uncacheAll();
    console.log('Creator 3.8.8: engine-extends enabled before asset-db (importer startup race fix)');
  } finally {
    asar.uncacheAll();
    await rm(output, {force:true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareEditor(process.argv[2]);
}
