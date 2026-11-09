import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
it('keeps the core independent from engine and platform APIs', () => {
 const directory='client/assets/scripts/core';
 for (const name of readdirSync(directory).filter(name=>name.endsWith('.ts'))) {
  const text=readFileSync(join(directory,name),'utf8');
  expect(text,name).not.toMatch(/\b(?:window|document|wx)\b|(?:from\s*|import\s*\()\s*['"]cc['"]/);
 }
});
