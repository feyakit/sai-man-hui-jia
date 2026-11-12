import { handle, type ClearRow, type ProvinceCount, type RankStore } from './rank';

interface D1Result<T> { results?: T[]; meta?: {changes?: number} }
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}
interface D1Database { prepare(sql: string): D1Statement }
interface Env { DB: D1Database }

export function d1Store(db: D1Database): RankStore {
  return {
    async hit(key, minute) {
      const row = await db.prepare(
        'INSERT INTO rate (k, minute, count) VALUES (?, ?, 1) ON CONFLICT (k, minute) DO UPDATE SET count = count + 1 RETURNING count',
      ).bind(key, minute).first<{count: number}>();
      if (minute % 5 === 0) await db.prepare('DELETE FROM rate WHERE minute < ?').bind(minute - 5).run();
      return row?.count ?? 1;
    },
    async insertClear(row: ClearRow) {
      const result = await db.prepare(
        'INSERT OR IGNORE INTO clears (session_id, stage, province, ms, day, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(row.sessionId, row.stage, row.province, row.ms, row.day, row.createdAt).run();
      if ((result.meta?.changes ?? 0) > 0) return {inserted: true, province: row.province};
      const existing = await db.prepare('SELECT province FROM clears WHERE session_id = ? AND stage = ?')
        .bind(row.sessionId, row.stage).first<{province: string}>();
      return {inserted: false, province: existing?.province ?? row.province};
    },
    async stage2Counts(day) {
      const result = await db.prepare(
        'SELECT province, COUNT(*) AS total, SUM(CASE WHEN day = ? THEN 1 ELSE 0 END) AS today FROM clears WHERE stage = 2 GROUP BY province',
      ).bind(day).all<ProvinceCount>();
      return (result.results ?? []).map(row => ({province: row.province, total: Number(row.total), today: Number(row.today)}));
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, d1Store(env.DB));
    } catch {
      return new Response(JSON.stringify({ok: false, error: 'server error'}), {status: 500, headers: {'Content-Type': 'application/json'}});
    }
  },
};
