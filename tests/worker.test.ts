import { describe, expect, it } from 'vitest';
import worker, { d1Store, d1TestStore } from '../worker/src/index';
import { STAGE1_CARDS, STAGE2_CARDS } from '../client/assets/scripts/core/stack/stack-generator';
import { MOM_INTERVAL_MS as CLIENT_MOM_INTERVAL_MS } from '../client/assets/scripts/core/stack/stack-rules';
import {
  ALLOWED_ORIGIN, MIN_MS, MOM_INTERVAL_MS, POSTS_PER_MINUTE, STAGE_CARDS, TEST_HEADER, checkBoxes, handle, parseClear,
  provinceRank, sameSecret, shanghaiDay, sortCounts, type ClearRow, type ProvinceCount, type RankStore, type TestStore,
} from '../worker/src/rank';

class MemoryStore implements RankStore {
  readonly rows: ClearRow[] = [];
  readonly hits = new Map<string, number>();
  async hit(key: string, minute: number): Promise<number> {
    const k = `${key}@${minute}`;
    const next = (this.hits.get(k) ?? 0) + 1;
    this.hits.set(k, next);
    return next;
  }
  async insertClear(row: ClearRow): Promise<{inserted: boolean; province: string}> {
    const existing = this.rows.find(r => r.sessionId === row.sessionId && r.stage === row.stage);
    if (existing) return {inserted: false, province: existing.province};
    this.rows.push(row);
    return {inserted: true, province: row.province};
  }
  async stage2Counts(day: string): Promise<ProvinceCount[]> {
    const map = new Map<string, ProvinceCount>();
    for (const r of this.rows.filter(row => row.stage === 2)) {
      const prev = map.get(r.province) ?? {province: r.province, total: 0, today: 0};
      map.set(r.province, {province: r.province, total: prev.total + 1, today: prev.today + (r.day === day ? 1 : 0)});
    }
    return [...map.values()];
  }
}

const NOW = Date.UTC(2027, 0, 20, 16, 30); // 2027-01-21 00:30 in Shanghai
const base = 'https://smhj-api.feyakit.workers.dev';
function post(body: unknown, {ip = '1.2.3.4', origin = ALLOWED_ORIGIN as string | null} = {}): Request {
  const headers: Record<string, string> = {'Content-Type': 'application/json', 'CF-Connecting-IP': ip};
  if (origin) headers.Origin = origin;
  return new Request(`${base}/api/clear`, {method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body)});
}
const clear = (over: Partial<Record<string, unknown>> = {}) => ({
  province: '广东', stage: 2, ms: 90_000, sessionId: 'device-abc-123', boxes: over.stage === 1 ? 6 : 50, momBoxes: 0, ...over,
});

class MemoryTestStore extends MemoryStore implements TestStore {
  async reset(): Promise<{clears: number; rate: number}> {
    const result = {clears: this.rows.length, rate: this.hits.size};
    this.rows.length = 0;
    this.hits.clear();
    return result;
  }
}
const TEST_KEY = 'unit-test-key-0123456789';
function withTest(request: Request, key = TEST_KEY): Request {
  const copy = new Request(request);
  copy.headers.set(TEST_HEADER, key);
  return copy;
}

describe('province leaderboard worker', () => {
  it('uses the Shanghai calendar day', () => {
    expect(shanghaiDay(NOW)).toBe('2027-01-21');
  });

  it('validates clear payloads', () => {
    expect(parseClear(clear())).toEqual({province: '广东', stage: 2, ms: 90_000, sessionId: 'device-abc-123', boxes: 50, momBoxes: 0});
    expect(parseClear({...clear(), momBoxes: undefined})).toMatchObject({momBoxes: 0});
    expect(parseClear(clear({boxes: undefined}))).toBe('invalid boxes');
    expect(parseClear(clear({boxes: 49.5}))).toBe('invalid boxes');
    expect(parseClear(clear({momBoxes: -1}))).toBe('invalid momBoxes');
    expect(parseClear(null)).toBe('body must be a JSON object');
    expect(parseClear(clear({province: '火星'}))).toBe('unknown province');
    expect(parseClear(clear({stage: 3}))).toBe('stage must be 1 or 2');
    expect(parseClear(clear({ms: -1}))).toBe('invalid ms');
    expect(parseClear(clear({ms: 'x'}))).toBe('invalid ms');
    expect(parseClear(clear({sessionId: 'short'}))).toBe('invalid sessionId');
    expect(parseClear(clear({sessionId: 'has space here!'}))).toBe('invalid sessionId');
  });

  it('ranks provinces by clears with shared places', () => {
    const rows = sortCounts([
      {province: '四川', total: 3, today: 1},
      {province: '广东', total: 5, today: 0},
      {province: '河南', total: 3, today: 2},
      {province: '西藏', total: 0, today: 0},
    ]);
    expect(rows.map(r => r.province)).toEqual(['广东', '河南', '四川']);
    expect(provinceRank(rows, '广东')).toEqual({rank: 1, total: 5});
    expect(provinceRank(rows, '四川')).toEqual({rank: 2, total: 3});
    expect(provinceRank(rows, '河南')).toEqual({rank: 2, total: 3});
    expect(provinceRank(rows, '西藏')).toEqual({rank: null, total: 0});
  });

  it('records a stage-2 clear, reports rank, and counts a session only once', async () => {
    const store = new MemoryStore();
    const first = await handle(post(clear()), store, NOW);
    expect(first.status).toBe(200);
    expect(first.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(await first.json()).toEqual({ok: true, duplicate: false, province: '广东', rank: 1, total: 1});
    const again = await handle(post(clear({province: '四川'})), store, NOW);
    expect(await again.json()).toEqual({ok: true, duplicate: true, province: '广东', rank: 1, total: 1});
    expect(store.rows).toHaveLength(1);
    const stage1 = await handle(post(clear({stage: 1, ms: 9_000})), store, NOW);
    expect(await stage1.json()).toMatchObject({ok: true, duplicate: false});
    expect(store.rows).toHaveLength(2);
  });

  it('returns only real province counts, empty when nobody has cleared', async () => {
    const store = new MemoryStore();
    const empty = await (await handle(new Request(`${base}/api/rank`), store, NOW)).json();
    expect(empty).toEqual({ok: true, provinces: [], totalClears: 0, todayClears: 0, updatedAt: NOW});
    await handle(post(clear()), store, NOW);
    await handle(post(clear({sessionId: 'device-xyz-789', province: '河南'}), {ip: '5.6.7.8'}), store, NOW - 86_400_000);
    await handle(post(clear({sessionId: 'device-stage1', stage: 1, ms: 5_000})), store, NOW);
    const rank = await (await handle(new Request(`${base}/api/rank`, {headers: {Origin: ALLOWED_ORIGIN}}), store, NOW)).json();
    expect(rank.provinces).toEqual([
      {province: '广东', total: 1, today: 1},
      {province: '河南', total: 1, today: 0},
    ]);
    expect(rank.totalClears).toBe(2);
    expect(rank.todayClears).toBe(1);
  });

  it('rejects clears that are too fast for the stage', async () => {
    const store = new MemoryStore();
    expect((await handle(post(clear({ms: MIN_MS[2] - 1})), store, NOW)).status).toBe(422);
    expect((await handle(post(clear({stage: 1, ms: MIN_MS[1] - 1})), store, NOW)).status).toBe(422);
    expect(store.rows).toHaveLength(0);
  });

  it('keeps the stage card counts in sync with the client levels', () => {
    expect(STAGE_CARDS).toEqual({1: STAGE1_CARDS, 2: STAGE2_CARDS});
    expect(MOM_INTERVAL_MS).toBe(CLIENT_MOM_INTERVAL_MS);
  });

  it('only accepts a run whose boxes equal the stage cards / 3 (plus mom packs)', async () => {
    const parsed = (over: Record<string, unknown>) => parseClear(clear(over)) as Exclude<ReturnType<typeof parseClear>, string>;
    expect(checkBoxes(parsed({}))).toBeNull();
    expect(checkBoxes(parsed({stage: 1, ms: 9_000}))).toBeNull();
    expect(checkBoxes(parsed({boxes: 53, momBoxes: 3}))).toBeNull();
    expect(checkBoxes(parsed({boxes: 0}))).toBe('boxes do not match the stage');
    expect(checkBoxes(parsed({boxes: 49}))).toBe('boxes do not match the stage');
    expect(checkBoxes(parsed({stage: 1, ms: 9_000, boxes: 50}))).toBe('boxes do not match the stage');
    expect(checkBoxes(parsed({stage: 1, ms: 9_000, boxes: 7, momBoxes: 1}))).toBe('stage 1 has no mom packs');
    expect(checkBoxes(parsed({ms: 50_000, boxes: 80, momBoxes: 30}))).toBe('too many mom packs');
    const store = new MemoryStore();
    const zero = await handle(post(clear({boxes: 0})), store, NOW);
    expect(zero.status).toBe(422);
    expect(await zero.json()).toEqual({ok: false, error: 'boxes do not match the stage'});
    expect((await handle(post(clear({stage: 1, ms: 9_000, boxes: 5})), store, NOW)).status).toBe(422);
    expect((await handle(post(clear({boxes: undefined})), store, NOW)).status).toBe(400);
    expect(store.rows).toHaveLength(0);
    expect((await handle(post(clear({boxes: 52, momBoxes: 2})), store, NOW)).status).toBe(200);
    expect(store.rows).toHaveLength(1);
  });

  it('routes test-key requests to the isolated test tables only', async () => {
    const live = new MemoryStore();
    const testStore = new MemoryTestStore();
    const test = {key: TEST_KEY, store: testStore};
    const written = await handle(withTest(post(clear())), live, NOW, test);
    expect(written.status).toBe(200);
    expect(await written.json()).toEqual({ok: true, duplicate: false, province: '广东', rank: 1, total: 1, test: true});
    expect(live.rows).toHaveLength(0);
    expect(live.hits.size).toBe(0);
    expect(testStore.rows).toHaveLength(1);
    const testRank = await (await handle(withTest(new Request(`${base}/api/rank`)), live, NOW, test)).json();
    expect(testRank).toMatchObject({provinces: [{province: '广东', total: 1, today: 1}], test: true});
    const liveRank = await (await handle(new Request(`${base}/api/rank`), live, NOW, test)).json();
    expect(liveRank).toEqual({ok: true, provinces: [], totalClears: 0, todayClears: 0, updatedAt: NOW});
    // Validation still applies on the test path.
    expect((await handle(withTest(post(clear({boxes: 0, sessionId: 'device-t2-000'}))), live, NOW, test)).status).toBe(422);
    const reset = await handle(withTest(new Request(`${base}/api/test/reset`, {method: 'POST'})), live, NOW, test);
    expect(await reset.json()).toEqual({ok: true, test: true, deleted: {clears: 1, rate: 1}});
    expect(testStore.rows).toHaveLength(0);
  });

  it('refuses a wrong or unconfigured test key and hides reset from the public', async () => {
    const live = new MemoryStore();
    const testStore = new MemoryTestStore();
    expect((await handle(withTest(post(clear()), 'wrong'), live, NOW, {key: TEST_KEY, store: testStore})).status).toBe(403);
    expect((await handle(withTest(post(clear())), live, NOW, {key: undefined, store: testStore})).status).toBe(403);
    expect((await handle(withTest(post(clear())), live, NOW)).status).toBe(403);
    expect((await handle(new Request(`${base}/api/test/reset`, {method: 'POST'}), live, NOW, {key: TEST_KEY, store: testStore})).status).toBe(404);
    expect(live.rows).toHaveLength(0);
    expect(testStore.rows).toHaveLength(0);
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
    const preflight = await handle(new Request(`${base}/api/clear`, {method: 'OPTIONS', headers: {Origin: ALLOWED_ORIGIN}}), live, NOW);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain(TEST_HEADER);
  });

  it('rate-limits each IP per minute', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < POSTS_PER_MINUTE; i++) {
      expect((await handle(post(clear({sessionId: `device-rate-${i}`})), store, NOW)).status).toBe(200);
    }
    const limited = await handle(post(clear({sessionId: 'device-rate-x'})), store, NOW);
    expect(limited.status).toBe(429);
    expect((await handle(post(clear({sessionId: 'device-rate-y'}), {ip: '9.9.9.9'}), store, NOW)).status).toBe(200);
    expect((await handle(post(clear({sessionId: 'device-rate-z'})), store, NOW + 60_000)).status).toBe(200);
  });

  it('only lets the trial site call it from a browser', async () => {
    const store = new MemoryStore();
    expect((await handle(post(clear(), {origin: 'https://evil.example'}), store, NOW)).status).toBe(403);
    const curl = await handle(post(clear(), {origin: null}), store, NOW);
    expect(curl.status).toBe(200);
    expect(curl.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const preflight = await handle(new Request(`${base}/api/clear`, {method: 'OPTIONS', headers: {Origin: ALLOWED_ORIGIN}}), store, NOW);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('answers bad requests without touching the leaderboard', async () => {
    const store = new MemoryStore();
    expect((await handle(post('{not json'), store, NOW)).status).toBe(400);
    expect((await handle(post(clear({province: '火星'})), store, NOW)).status).toBe(400);
    expect((await handle(new Request(`${base}/nope`), store, NOW)).status).toBe(404);
    expect(store.rows).toHaveLength(0);
  });

  it('maps the store onto D1 statements and hides server errors', async () => {
    const calls: {sql: string; args: unknown[]}[] = [];
    const db = {
      prepare(sql: string) {
        const call = {sql, args: [] as unknown[]};
        calls.push(call);
        const statement = {
          bind(...args: unknown[]) { call.args = args; return statement; },
          async first<T>() { return (sql.startsWith('SELECT province') ? {province: '四川'} : {count: 3}) as T; },
          async all<T>() { return {results: [{province: '广东', total: '2', today: 1}] as T[]}; },
          async run() { return {meta: {changes: sql.startsWith('INSERT OR IGNORE') && call.args[0] === 'device-abc-123' ? 1 : 0}}; },
        };
        return statement;
      },
    };
    const store = d1Store(db);
    expect(await store.hit('k', 10)).toBe(3);
    expect(calls.some(c => c.sql.startsWith('DELETE FROM rate'))).toBe(true);
    expect(await store.insertClear({sessionId: 'device-abc-123', stage: 2, province: '广东', ms: 1, day: 'd', createdAt: 1})).toEqual({inserted: true, province: '广东'});
    expect(await store.insertClear({sessionId: 'device-old-456', stage: 2, province: '广东', ms: 1, day: 'd', createdAt: 1})).toEqual({inserted: false, province: '四川'});
    expect(await store.stage2Counts('d')).toEqual([{province: '广东', total: 2, today: 1}]);
    const testCalls = calls.length;
    const testStore = d1TestStore(db);
    await testStore.insertClear({sessionId: 'device-abc-123', stage: 2, province: '广东', ms: 1, day: 'd', createdAt: 1});
    expect(await testStore.reset()).toEqual({clears: 0, rate: 0});
    const testSql = calls.slice(testCalls).map(c => c.sql);
    expect(testSql).toEqual([
      expect.stringContaining('INSERT OR IGNORE INTO test_clears'),
      'DELETE FROM test_clears',
      'DELETE FROM test_rate',
    ]);
    const failing = {prepare() { throw new Error('db down'); }};
    const response = await worker.fetch(new Request(`${base}/api/rank`), {DB: failing as never});
    expect(response.status).toBe(500);
  });
});

describe('leaderboard freshness', () => {
  it('never lets browsers cache the leaderboard, so a fresh clear shows at once', async () => {
    const response = await handle(new Request('https://smhj-api.feyakit.workers.dev/api/rank'), {
      hit: async () => 1, insertClear: async row => ({inserted: true, province: row.province}), stage2Counts: async () => [],
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
