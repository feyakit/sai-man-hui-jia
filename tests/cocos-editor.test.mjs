import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as asar from '@electron/asar';
import { expect, it } from 'vitest';
import { preloadImporters, prepareEditor } from '../tools/cocos/prepare-editor.mjs';

const source = 'function scanPrePackage(){return ["./modules/editor-extensions/extensions/device","./modules/editor-extensions/extensions/ui-kit"].forEach(enable)}';
it('preloads engine importers before asset-db starts, idempotently and with a layout guard', () => {
  const fixed = preloadImporters(source);
  expect(fixed).toContain('"./modules/editor-extensions/extensions/ui-kit","./modules/engine-extensions/extensions/engine-extends"].forEach');
  expect(preloadImporters(fixed)).toBe(fixed);
  expect(() => preloadImporters('changed editor format')).toThrow('Unknown Creator');
});

it('patches a Creator archive while preserving unpacked native helpers and other entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'creator-test-'));
  try {
    const app = join(root, 'app');
    await mkdir(join(app, 'launch/dist'), {recursive:true});
    await mkdir(join(app, 'native'), {recursive:true});
    await writeFile(join(app, 'launch/dist/launch.js'), source);
    await writeFile(join(app, 'native/helper.node'), 'native fixture');
    await writeFile(join(app, 'package.json'), '{"version":"3.8.8"}');
    const archive = join(root, 'app.asar');
    await asar.createPackageWithOptions(app, archive, {unpack:'**/*.node'});
    const original = await readFile(archive);
    const originalHeader = asar.getRawHeader(archive);
    const originalHelper = asar.statFile(archive, 'native/helper.node');
    await prepareEditor(archive);
    // Clear asar's read cache before checking the archive at its original path.
    asar.uncacheAll();
    expect(asar.extractFile(archive, 'launch/dist/launch.js').toString()).toBe(preloadImporters(source));
    expect(asar.extractFile(archive, 'package.json').toString()).toBe('{"version":"3.8.8"}');
    expect(asar.statFile(archive, 'native/helper.node')).toEqual(originalHelper);
    const updated = await readFile(archive);
    const dataStart = 8 + asar.getRawHeader(archive).headerSize;
    expect(updated.subarray(dataStart, dataStart + original.length - 8 - originalHeader.headerSize))
      .toEqual(original.subarray(8 + originalHeader.headerSize));
    expect(asar.extractFile(archive, 'native/helper.node').toString()).toBe('native fixture');
    await prepareEditor(archive);
  } finally {
    asar.uncacheAll();
    await rm(root, {recursive:true,force:true});
  }
});
