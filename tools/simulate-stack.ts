import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { generateDailyLevel } from '../client/assets/scripts/core/stack/stack-daily';
import { generateEndlessLevel, routeTitleForLevel } from '../client/assets/scripts/core/stack/stack-endless';
import { generateStackLevel } from '../client/assets/scripts/core/stack/stack-generator';
import { simulateStackBatch, type StackBatchResult, type StackItemMode, type StackSimStrategy } from '../client/assets/scripts/core/stack/stack-sim';
import type { StackLevel } from '../client/assets/scripts/core/stack/stack-types';

interface Policy {
  readonly strategy: StackSimStrategy;
  readonly itemMode: StackItemMode;
}

interface LevelResult {
  readonly id: string;
  readonly stage: number;
  readonly seed: string;
  readonly cards: number;
  readonly kinds: number;
  readonly slotCapacity: number;
  readonly attempts: number;
  readonly generationMs: number;
  readonly runCount: number;
  readonly results: readonly (StackBatchResult & Policy & {readonly runs: number})[];
}

interface Output {
  readonly generatedAt: string;
  readonly defaultRuns: number;
  readonly endlessRuns: number;
  readonly dailyRuns: number;
  readonly levels: readonly LevelResult[];
}

const ALL_POLICIES: readonly Policy[] = [
  {strategy: 'random', itemMode: 'none'},
  {strategy: 'random', itemMode: 'all'},
  {strategy: 'greedy', itemMode: 'none'},
  {strategy: 'greedy', itemMode: 'all'},
  {strategy: 'greedy-lookahead', itemMode: 'none'},
  {strategy: 'greedy-lookahead', itemMode: 'all'},
  {strategy: 'greedy-lookahead', itemMode: 'all-revive'},
];

const CORE_POLICIES: readonly Policy[] = [
  {strategy: 'greedy', itemMode: 'none'},
  {strategy: 'greedy-lookahead', itemMode: 'all'},
  {strategy: 'greedy-lookahead', itemMode: 'all-revive'},
];

const DEFAULT_DAILY_DATES = [
  '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
  '2026-11-16', '2026-11-17', '2026-11-18',
] as const;

function integer(value: string | undefined, name: string, fallback: number, min = 1): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${name} must be an integer >= ${min}`);
  return parsed;
}

function stageNumbers(value: string | undefined): number[] {
  if (!value) return [1, 2];
  const parsed = value.split(',').map(part => Number(part.trim()));
  if (!parsed.length || parsed.some(stage => !Number.isInteger(stage) || stage < 1 || stage > 2)) {
    throw new Error('--stage must be 1, 2, or a comma-separated subset');
  }
  return [...new Set(parsed)];
}

function endlessNumbers(value: string | undefined): number[] {
  if (!value) return [3, 4, 5, 6, 7, 8];
  const range = /^(\d+)-(\d+)$/.exec(value.trim());
  const parsed = range
    ? Array.from({length: Number(range[2]) - Number(range[1]) + 1}, (_, index) => Number(range[1]) + index)
    : value.split(',').map(part => Number(part.trim()));
  if (!parsed.length || parsed.some(stage => !Number.isInteger(stage) || stage < 3)) {
    throw new Error('--endless must be a stage >= 3 or a range such as 3-8');
  }
  return [...new Set(parsed)];
}

function dailyDates(value: string | undefined): string[] {
  if (!value) return [...DEFAULT_DAILY_DATES];
  const dates = value.split(',').map(part => part.trim());
  if (dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('--daily must be comma-separated YYYY-MM-DD dates');
  return [...new Set(dates)];
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printResult(level: LevelResult): void {
  console.log(`\n${level.id}  seed=${level.seed}  cards=${level.cards}  kinds=${level.kinds}  slots=${level.slotCapacity}  runs=${level.runCount}  generated=${level.generationMs.toFixed(1)}ms`);
  console.log('strategy           items       win      avg left  clicks  groups  mom');
  for (const result of level.results) {
    console.log(
      `${result.strategy.padEnd(18)} ${result.itemMode.padEnd(11)} ${percent(result.winRate).padStart(7)}`
      + `  ${result.averageRemaining.toFixed(1).padStart(8)}  ${result.averageClicks.toFixed(1).padStart(6)}`
      + `  ${result.averageGroupsCleared.toFixed(1).padStart(6)}  ${result.averageMomEvents.toFixed(1).padStart(4)}`,
    );
  }
}

function benchmarkLevel(
  id: string,
  level: StackLevel,
  attempts: number,
  generationMs: number,
  policies: readonly Policy[],
  runs: number,
): LevelResult {
  const results = policies.map(policy => ({
    ...policy,
    ...simulateStackBatch(level, {strategy: policy.strategy, itemMode: policy.itemMode, seed: `${level.seed}:${id}`}, runs),
  }));
  return {
    id,
    stage: level.stage,
    seed: level.seed,
    cards: level.cards.length,
    kinds: level.items.length,
    slotCapacity: level.slotCapacity ?? 7,
    attempts,
    generationMs,
    runCount: runs,
    results,
  };
}

async function main(): Promise<void> {
  const {values} = parseArgs({
    options: {
      runs: {type: 'string', default: '1000'},
      'endless-runs': {type: 'string'},
      'daily-runs': {type: 'string'},
      out: {type: 'string', default: 'tools/out/sim-results.json'},
      stage: {type: 'string'},
      endless: {type: 'string'},
      daily: {type: 'string'},
      policies: {type: 'string', default: 'all'},
    },
  });
  const runs = integer(values.runs, '--runs', 1_000);
  const endlessRuns = integer(values['endless-runs'], '--endless-runs', 300);
  const dailyRuns = integer(values['daily-runs'], '--daily-runs', 300);
  const selected = values.stage !== undefined || values.endless !== undefined || values.daily !== undefined;
  const runStory = !selected || values.stage !== undefined;
  const runEndless = !selected || values.endless !== undefined;
  const runDaily = !selected || values.daily !== undefined;
  const policies = values.policies === 'all' ? ALL_POLICIES : CORE_POLICIES;
  const levels: LevelResult[] = [];

  if (runStory) {
    for (const stage of stageNumbers(values.stage)) {
      const started = performance.now();
      const generated = generateStackLevel(stage);
      const generationMs = performance.now() - started;
      const result = benchmarkLevel(`第 ${stage} 关`, generated.level, generated.attempts, generationMs, policies, runs);
      levels.push(result);
      printResult(result);
    }
  }
  if (runEndless) {
    for (const stage of endlessNumbers(values.endless)) {
      const started = performance.now();
      const level = generateEndlessLevel(stage);
      const generationMs = performance.now() - started;
      const result = benchmarkLevel(routeTitleForLevel(stage), level, 1, generationMs, CORE_POLICIES, endlessRuns);
      levels.push(result);
      printResult(result);
    }
  }
  if (runDaily) {
    for (const date of dailyDates(values.daily)) {
      const started = performance.now();
      const level = generateDailyLevel(date);
      const generationMs = performance.now() - started;
      const result = benchmarkLevel(`每日 ${date}`, level, 1, generationMs, CORE_POLICIES, dailyRuns);
      levels.push(result);
      printResult(result);
    }
  }

  const output: Output = {generatedAt: new Date().toISOString(), defaultRuns: runs, endlessRuns, dailyRuns, levels};
  const out = resolve(values.out);
  await mkdir(dirname(out), {recursive: true});
  await writeFile(out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`\nJSON written to ${out}`);
}

await main();
