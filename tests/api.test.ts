import { beforeEach, expect, test, vi } from 'vitest';

const engine = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('cc', () => ({
  JsonAsset: class {},
  resources: { load: engine.load },
}));

import stage2 from '../client/assets/resources/levels/v1/stage2.json';
import { Api } from '../client/assets/scripts/services/Api';
import type { WebPlatform } from '../client/assets/scripts/platform/WebPlatform';

const platform = (override?: string): WebPlatform => ({
  hasLevelOverride: () => override !== undefined,
  levelFilename: () => override ?? 'demo',
} as WebPlatform);

beforeEach(() => {
  engine.load.mockReset();
  engine.load.mockImplementation((_path, Asset, done) => done(null, Object.assign(new Asset(), { json: stage2 })));
});

test('challenge defaults to the shipped V1 stage 2', async () => {
  const level = await new Api(platform()).loadChallenge();
  expect(engine.load.mock.calls[0][0]).toBe('levels/v1/stage2');
  expect(level).toMatchObject({ stage: 2, vehicle: 'sedan_v1', timeLimitSec: 150 });
  expect(level.pieces).toHaveLength(10);
});

test('?level= keeps the development override', async () => {
  await new Api(platform('demo')).loadChallenge();
  expect(engine.load.mock.calls[0][0]).toBe('dev-levels/demo');
});
