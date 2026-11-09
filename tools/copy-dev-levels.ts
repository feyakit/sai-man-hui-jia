import { readdir } from 'node:fs/promises';
import { levelFilename, readLevel, run, writeAtomic } from './level-data';

run(async () => {
  const entries = await readdir('levels',{withFileTypes:true});
  const dates = entries.filter(entry => entry.isFile() && /^\d{4}-\d{2}-\d{2}-2\.json$/.test(entry.name))
    .map(entry => entry.name.slice(0,10)).sort();
  if (!dates.length) throw new Error('No generated levels to copy');
  for (const date of dates) {
    const level = await readLevel(date);
    await writeAtomic(`client/assets/resources/dev-levels/${levelFilename(date)}`,JSON.stringify(level,null,2)+'\n');
    process.stdout.write(`Copied ${levelFilename(date)}\n`);
  }
});
