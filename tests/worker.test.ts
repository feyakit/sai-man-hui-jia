import { describe, expect, it } from 'vitest';
import worker, { d1Store } from '../worker/src/index';
import {
  ALLOWED_ORIGIN, MIN_MS, POSTS_PER_MINUTE, handle, parseClear, provinceRank, shanghaiDay, sortCounts,
  type ClearRow, type ProvinceCount, type RankStore,
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
const clear = (over: Partial<Record<string, unknown>> = {}) => ({province: '广东', stage: 2, ms: 90_000, sessionId: 'device-abc-123', ...over});

describe('province leaderboard worker', () => {
  it('uses the Shanghai calendar day', () => {
    expect(shanghaiDay(NOW)).toBe('2027-01-21');
  });

  it('validates clear payloads', () => {
    expect(parseClear(clear())).toEqual({province: '广东', stage: 2, ms: 90_000, sessionId: 'device-abc-123'});
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
    const failing = {prepare() { throw new Error('db down'); }};
    const response = await worker.fetch(new Request(`${base}/api/rank`), {DB: failing as never});
    expect(response.status).toBe(500);
  });
});
