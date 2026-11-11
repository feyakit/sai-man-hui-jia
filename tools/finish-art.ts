// Native vector artwork for the finish sequence; no external assets or fonts.
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
await sharp(await readFile('tools/art-source/sedan_v1_lid.svg')).png().toFile('client/assets/resources/art/vehicles/sedan_v1_lid.png');
const shapes=[
  '<path d="M9 2h14v28H9z" fill="#ffca59"/><path d="M11 3h3v26h-3z" fill="#fff0aa"/>',
  '<path d="M3 6l23 3-3 17L0 23z" fill="#f45242"/><path d="M7 9l15 2" stroke="#ffbe75" stroke-width="3"/>',
  '<path d="M16 0l4 10 12 6-12 5-4 11-5-11L0 16l11-6z" fill="#ffe4a0"/>',
  '<path d="M5 4q23 0 19 12T9 29l-5-5q20-3 14-9T5 10z" fill="#ff886b"/>',
];
for (let i=0;i<shapes.length;i++) await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${shapes[i]}</svg>`)).png().toFile(`client/assets/resources/art/fx/confetti_${i+1}.png`);
