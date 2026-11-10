import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { ART, CELL_PX, type ArtEntry } from './art-manifest';
import { run } from './level-data';

export async function checkImage(path: string, entry: ArtEntry): Promise<string[]> {
  try {
    const input=await readFile(path);
    const metadata=await sharp(input).metadata();
    const errors: string[]=[];
    if (metadata.format !== 'png') errors.push('不是 PNG');
    if (metadata.width !== entry.width || metadata.height !== entry.height)
      errors.push(`尺寸 ${metadata.width}×${metadata.height}，应为 ${entry.width}×${entry.height}`);
    if (errors.length) return errors;
    if (entry.cells) {
      const occupied=new Set(entry.cells.map(([x,y]) => `${x},${y}`));
      const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      for (let y=0;y<info.height;y++) for (let x=0;x<info.width;x++) {
        if (!occupied.has(`${Math.floor(x/CELL_PX)},${Math.floor(y/CELL_PX)}`) && data[(y*info.width+x)*info.channels+info.channels-1] !== 0)
          return ['非占用格 alpha 必须为 0（像素 '+x+','+y+'）'];
      }
    }
    return [];
  } catch (error) { return [`缺失、损坏或无法解码：${error instanceof Error ? error.message : String(error)}`]; }
}
export async function checkArt(root: string): Promise<string[]> {
  const files=await readdir(join(root,'fx')).catch(() => [] as string[]);
  const confetti=files.filter(file => /^confetti_.*\.png$/.test(file));
  const entries=ART.filter(e => !e.file.startsWith('fx/')).concat(confetti.map(file => ({file:`fx/${file}`,width:32,height:32,name:'彩纸'})));
  const errors=confetti.length >= 3 && confetti.length <= 6 ? [] : [`fx/confetti_*.png: 数量 ${confetti.length}，应为 3–6`];
  for (const entry of entries) for (const reason of await checkImage(join(root,entry.file),entry)) errors.push(`${entry.file}: ${reason}`);
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run(async () => {
  const errors=await checkArt('client/assets/resources/art');
  if (errors.length) throw new Error(errors.join('\n'));
  process.stdout.write('Art check passed: required PNGs, dimensions, transparent empty cells, 3–6 confetti.\n');
});
