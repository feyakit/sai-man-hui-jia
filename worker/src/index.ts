import { handle, type ClearRow, type ProvinceCount, type RankStore, type TestStore } from './rank';

interface D1Result<T> { results?: T[]; meta?: {changes?: number} }
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}
interface D1Database { prepare(sql: string): D1Statement }
interface Env { DB: D1Database; TEST_KEY?: string }

type Tables = {clears: string; rate: string};
const LIVE: Tables = {clears: 'clears', rate: 'rate'};
const TEST: Tables = {clears: 'test_clears', rate: 'test_rate'};

export function d1Store(db: D1Database, t: Tables = LIVE): RankStore {
  return {
    async hit(key, minute) {
      const row = await db.prepare(
        `INSERT INTO ${t.rate} (k, minute, count) VALUES (?, ?, 1) ON CONFLICT (k, minute) DO UPDATE SET count = count + 1 RETURNING count`,
      ).bind(key, minute).first<{count: number}>();
      if (minute % 5 === 0) await db.prepare(`DELETE FROM ${t.rate} WHERE minute < ?`).bind(minute - 5).run();
      return row?.count ?? 1;
    },
    async insertClear(row: ClearRow) {
      const result = await db.prepare(
        `INSERT OR IGNORE INTO ${t.clears} (session_id, stage, province, ms, day, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(row.sessionId, row.stage, row.province, row.ms, row.day, row.createdAt).run();
      if ((result.meta?.changes ?? 0) > 0) return {inserted: true, province: row.province};
      const existing = await db.prepare(`SELECT province FROM ${t.clears} WHERE session_id = ? AND stage = ?`)
        .bind(row.sessionId, row.stage).first<{province: string}>();
      return {inserted: false, province: existing?.province ?? row.province};
    },
    async stage2Counts(day) {
      const result = await db.prepare(
        `SELECT province, COUNT(*) AS total, SUM(CASE WHEN day = ? THEN 1 ELSE 0 END) AS today FROM ${t.clears} WHERE stage = 2 GROUP BY province`,
      ).bind(day).all<ProvinceCount>();
      return (result.results ?? []).map(row => ({province: row.province, total: Number(row.total), today: Number(row.today)}));
    },
  };
}

/** The isolated test tables (test_clears / test_rate); only these can be wiped. */
export function d1TestStore(db: D1Database): TestStore {
  return {
    ...d1Store(db, TEST),
    async reset() {
      const clears = await db.prepare(`DELETE FROM ${TEST.clears}`).run();
      const rate = await db.prepare(`DELETE FROM ${TEST.rate}`).run();
      return {clears: clears.meta?.changes ?? 0, rate: rate.meta?.changes ?? 0};
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, d1Store(env.DB), Date.now(), {key: env.TEST_KEY, store: d1TestStore(env.DB)});
    } catch {
      return new Response(JSON.stringify({ok: false, error: 'server error'}), {status: 500, headers: {'Content-Type': 'application/json'}});
    }
  },
};
