import { parseArgs } from 'node:util';
import { datesFrom, readLevel, readSolution, run } from './level-data';

run(async () => {
  const {values} = parseArgs({options:{from:{type:'string'},days:{type:'string'},'dry-run':{type:'boolean'}}});
  if (!values['dry-run']) throw new Error('M2 supports uploads in --dry-run mode only');
  const dates = datesFrom(values.from,values.days);
  for (const date of dates) {
    const level = await readLevel(date);
    await readSolution(date,level);
  }
  for (const date of dates) {
    const id = `${date}-2`;
    process.stdout.write(`DRY RUN levels/${id} solutions/${id}\n`);
  }
});
