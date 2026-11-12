import { PROVINCES } from '../../client/assets/scripts/core/provinces';

export const ALLOWED_ORIGIN = 'https://feyakit.github.io';
export const MIN_MS: Readonly<Record<1 | 2, number>> = {1: 4_000, 2: 45_000};
export const MAX_MS = 6 * 60 * 60 * 1000;
export const POSTS_PER_MINUTE = 10;
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

export interface ClearRow {
  readonly sessionId: string;
  readonly stage: 1 | 2;
  readonly province: string;
  readonly ms: number;
  readonly day: string;
  readonly createdAt: number;
}

export interface ProvinceCount {
  readonly province: string;
  readonly total: number;
  readonly today: number;
}

/** Storage seam: D1 in production, memory in tests. */
export interface RankStore {
  /** Increments and returns this key's count for the minute. */
  hit(key: string, minute: number): Promise<number>;
  /** Records (sessionId, stage) once; a repeat keeps the first province. */
  insertClear(row: ClearRow): Promise<{inserted: boolean; province: string}>;
  /** Stage-2 clears per province (only provinces with at least one clear). */
  stage2Counts(day: string): Promise<ProvinceCount[]>;
}

/** Shanghai calendar day, which is what “今日” means to players. */
export function shanghaiDay(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

export type ClearInput = {province: string; stage: 1 | 2; ms: number; sessionId: string};

export function parseClear(body: unknown): ClearInput | string {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const {province, stage, ms, sessionId} = body as Record<string, unknown>;
  if (typeof province !== 'string' || !(PROVINCES as readonly string[]).includes(province)) return 'unknown province';
  if (stage !== 1 && stage !== 2) return 'stage must be 1 or 2';
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0 || ms > MAX_MS) return 'invalid ms';
  if (typeof sessionId !== 'string' || !SESSION_RE.test(sessionId)) return 'invalid sessionId';
  return {province, stage, ms: Math.round(ms), sessionId};
}

export function sortCounts(rows: readonly ProvinceCount[]): ProvinceCount[] {
  return rows
    .filter(row => row.total > 0)
    .map(row => ({province: row.province, total: row.total, today: row.today}))
    .sort((a, b) => b.total - a.total || b.today - a.today || PROVINCES.indexOf(a.province as never) - PROVINCES.indexOf(b.province as never));
}

/** Competition ranking: provinces with more clears are ahead; ties share a place. */
export function provinceRank(rows: readonly ProvinceCount[], province: string): {rank: number | null; total: number} {
  const mine = rows.find(row => row.province === province)?.total ?? 0;
  if (mine === 0) return {rank: null, total: 0};
  return {rank: rows.filter(row => row.total > mine).length + 1, total: mine};
}

async function ipKey(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`smhj:${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {'Vary': 'Origin'};
  if (origin === ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function json(status: number, body: unknown, origin: string | null, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin), ...extra},
  });
}

export async function handle(request: Request, store: RankStore, now = Date.now()): Promise<Response> {
  const origin = request.headers.get('Origin');
  // Browsers from other sites are refused outright; no Origin (curl, server) is allowed.
  if (origin !== null && origin !== ALLOWED_ORIGIN) return json(403, {ok: false, error: 'origin not allowed'}, null);
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(origin)});

  if (url.pathname === '/api/rank' && request.method === 'GET') {
    const day = shanghaiDay(now);
    const provinces = sortCounts(await store.stage2Counts(day));
    return json(200, {
      ok: true,
      provinces,
      totalClears: provinces.reduce((sum, row) => sum + row.total, 0),
      todayClears: provinces.reduce((sum, row) => sum + row.today, 0),
      updatedAt: now,
    }, origin, {'Cache-Control': 'no-store'});
  }

  if (url.pathname === '/api/clear' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const hits = await store.hit(await ipKey(ip), Math.floor(now / 60_000));
    if (hits > POSTS_PER_MINUTE) return json(429, {ok: false, error: 'too many requests'}, origin, {'Retry-After': '60'});
    let body: unknown;
    try { body = await request.json(); } catch { return json(400, {ok: false, error: 'invalid JSON'}, origin); }
    const input = parseClear(body);
    if (typeof input === 'string') return json(400, {ok: false, error: input}, origin);
    if (input.ms < MIN_MS[input.stage]) return json(422, {ok: false, error: 'too fast'}, origin);
    const day = shanghaiDay(now);
    const {inserted, province} = await store.insertClear({...input, day, createdAt: now});
    const {rank, total} = provinceRank(sortCounts(await store.stage2Counts(day)), province);
    return json(200, {ok: true, duplicate: !inserted, province, rank, total}, origin);
  }

  return json(404, {ok: false, error: 'not found'}, origin);
}
