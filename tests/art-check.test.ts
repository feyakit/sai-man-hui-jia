import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, test } from 'vitest';
import { checkArt, checkImage } from '../tools/art-check';
import { ITEM_ART } from '../tools/art-manifest';

const dirs: string[]=[];
async function temporary() { const dir=await mkdtemp(join(tmpdir(),'art-check-')); dirs.push(dir); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir,{recursive:true,force:true}))); });
test('committed assets meet all dimensions and masks',async () => {
  expect(await checkArt('client/assets/resources/art')).toEqual([]);
});
test('reports missing and corrupt PNGs with filename',async () => {
  const root=await temporary();
  const errors=await checkArt(root);
  expect(errors.some(e => e.startsWith('items/liquor.png:'))).toBe(true);
  expect(errors.some(e => e.startsWith('fx/confetti_*.png:'))).toBe(true);
  const path=join(root,'broken.png'); await writeFile(path,'bad');
  expect((await checkImage(path,ITEM_ART[0]))[0]).toContain('无法解码');
});
test('rejects wrong dimensions and opaque empty cells',async () => {
  const root=await temporary(), path=join(root,'item.png');
  const entry=ITEM_ART.find(e => e.file.endsWith('ricecooker.png'))!;
  await sharp({create:{width:128,height:128,channels:4,background:'#00000000'}}).png().toFile(path);
  expect((await checkImage(path,entry))[0]).toContain('尺寸');
  await sharp({create:{width:256,height:256,channels:4,background:'#ff0000'}}).png().toFile(path);
  expect((await checkImage(path,entry))[0]).toContain('alpha');
  const data=Buffer.alloc(256*256*4); data[(20*256+200)*4+3]=1;
  await sharp(data,{raw:{width:256,height:256,channels:4}}).png().toFile(path);
  expect((await checkImage(path,entry))[0]).toContain('alpha');
});
test('does not accept another image format disguised as PNG',async () => {
  const path=join(await temporary(),'fake.png');
  await sharp({create:{width:256,height:128,channels:3,background:'red'}}).jpeg().toFile(path);
  expect(await checkImage(path,ITEM_ART[0])).toContain('不是 PNG');
});
