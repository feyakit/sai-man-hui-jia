// Usage: node --import tsx tools/gen-daily-table.ts <start YYYY-MM-DD> <days> [out.txt]
// Prints one base-36 calibrated attempt per day (see calibrateDaily) for stack-daily-table.ts.
import {appendFileSync, writeFileSync} from 'node:fs';
import {calibrateDaily} from '../client/assets/scripts/core/stack/stack-daily';
const [start, daysArg, out] = process.argv.slice(2);
const base = new Date(`${start}T00:00:00Z`).getTime();
if (out) writeFileSync(out, '');
let text = '';
for (let index = 0; index < Number(daysArg); index++) {
  const key = new Date(base + index * 86_400_000).toISOString().slice(0, 10);
  const {attempt} = calibrateDaily(key);
  const char = attempt.toString(36);
  text += char;
  if (out) appendFileSync(out, `${key} ${char}\n`);
}
console.log(text);
