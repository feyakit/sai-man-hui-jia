import assert from 'node:assert/strict';
import { writeFile, rename, rm, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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
  const scratch = await mkdtemp(join(dirname(archive), 'importer-fix-'));
  const output = join(scratch, 'app.asar');
  const directory = join(scratch, 'app');
  // Retain the original unpacked entries (native modules and editor helpers).
  const unpacked = asar.listPackage(archive).map(file => file.replace(/^[/\\]/, '').replaceAll('\\', '/')).filter(file => {
    const info = asar.statFile(archive, file);
    return !info.files && info.unpacked;
  });
  try {
    asar.extractAll(archive, directory);
    await writeFile(join(directory, 'launch/dist/launch.js'), patched);
    await asar.createPackageWithOptions(directory, output, {
      unpack: unpacked.length === 1 ? unpacked[0] : unpacked.length ? `{${unpacked.join(',')}}` : undefined,
    });
    assert.equal(asar.extractFile(output, 'launch/dist/launch.js').toString('utf8'), patched);
    await rm(`${archive}.unpacked`, {recursive:true,force:true});
    if (unpacked.length) await rename(`${output}.unpacked`, `${archive}.unpacked`);
    await rename(output, archive);
    asar.uncacheAll();
    console.log('Creator 3.8.8: engine-extends enabled before asset-db (importer startup race fix)');
  } finally {
    await rm(scratch, {recursive:true,force:true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareEditor(process.argv[2]);
}
