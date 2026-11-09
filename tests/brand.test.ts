import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
it('keeps the game name in brand configuration only', () => {
 const walk=(dir:string):string[] => readdirSync(dir,{withFileTypes:true}).flatMap(entry => entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
 for(const file of walk('client/assets/scripts').filter(path => path.endsWith('.ts') && !path.endsWith('/config/brand.ts'))) {
  expect(readFileSync(file,'utf8'),file).not.toContain('塞满回家');
 }
});
