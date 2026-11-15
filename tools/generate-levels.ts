import { parseArgs } from 'node:util';
import { dailySeed, datesFrom, generateDaily, levelFilename, run, writeAtomic } from './level-data';

run(async () => {
  const {values} = parseArgs({options:{from:{type:'string'},days:{type:'string'}}});
  const dates = datesFrom(values.from,values.days);
  const secret = process.env.LEVEL_SECRET;
  if (!secret?.trim()) throw new Error('Set LEVEL_SECRET before generating levels');
  const results = dates.map(date => {
    try {
      return generateDaily(date,dailySeed(date,secret));
    } catch (error) {
      throw new Error(`Cannot generate ${date}. ${error instanceof Error ? error.message : String(error)}`,{cause:error});
    }
  });
  for (const {level,solution,stats} of results) {
    const filename = levelFilename(level.date);
    await writeAtomic(`levels/solutions/${filename}`,JSON.stringify(solution,null,2)+'\n');
    await writeAtomic(`levels/${filename}`,JSON.stringify(level,null,2)+'\n');
    process.stdout.write(`${filename} ${level.vehicle} ${stats.solutionCount} solutions\n`);
  }
});
