import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { ART, CELL_PX } from './art-manifest';
import { run } from './level-data';

run(async () => {
  for (const [index,entry] of ART.entries()) {
    const color = `hsl(${index*47%360},60%,48%)`;
    const cells = entry.cells ?? Array.from({length:Math.ceil(entry.width/CELL_PX)*Math.ceil(entry.height/CELL_PX)},(_,i) =>
      [i%Math.ceil(entry.width/CELL_PX),Math.floor(i/Math.ceil(entry.width/CELL_PX))] as const);
    const parts = cells.map(([x,y],i) => {
      const w=Math.min(CELL_PX,entry.width-x*CELL_PX), h=Math.min(CELL_PX,entry.height-y*CELL_PX);
      return `<rect x="${x*CELL_PX+6}" y="${y*CELL_PX+6}" width="${w-12}" height="${h-12}" rx="8" fill="${color}" stroke="white" stroke-width="2"/>`+
        (i === 0 && entry.width > 32 ? `<text x="${x*CELL_PX+w/2}" y="${y*CELL_PX+h/2}" text-anchor="middle" dominant-baseline="central" font-family="Noto Sans CJK SC,sans-serif" font-size="${Math.min(19,100/entry.name.length)}" fill="white">${entry.name}</text>` : '');
    });
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${entry.width}" height="${entry.height}">${parts.join('')}</svg>`;
    const path=join('client/assets/resources/art',entry.file);
    await mkdir(dirname(path),{recursive:true});
    await sharp(Buffer.from(svg)).toColourspace('srgb').png().toFile(path);
  }
  process.stdout.write(`Generated ${ART.length} placeholder PNGs (Chinese labels require Noto Sans CJK SC).\n`);
});
