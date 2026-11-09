import { SHAPES } from '../client/assets/scripts/core/shapes';
import { run, writeAtomic } from './level-data';

run(async () => {
  const size = 128;
  for (const [shape,cells] of Object.entries(SHAPES)) {
    const width = (Math.max(...cells.map(([x]) => x))+1)*size;
    const height = (Math.max(...cells.map(([,y]) => y))+1)*size;
    const parts = cells.map(([x,y]) =>
      `  <rect x="${x*size}" y="${y*size}" width="${size}" height="${size}" />`);
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `  <title>${shape}</title>`,
      '  <g fill="#f1f5f9" stroke="#334155" stroke-width="2">',
      ...parts,
      '  </g>',
      '</svg>',
    ].join('\n')+'\n';
    await writeAtomic(`tools/out/art-templates/${shape}.svg`,svg);
  }
  process.stdout.write(`Exported ${Object.keys(SHAPES).length} SVG templates\n`);
});
