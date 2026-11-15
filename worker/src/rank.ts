import { PROVINCES } from '../../client/assets/scripts/core/provinces';

export const ALLOWED_ORIGIN = 'https://feyakit.github.io';
export const MIN_MS: Readonly<Record<1 | 2, number>> = {1: 4_000, 2: 45_000};
export const MAX_MS = 6 * 60 * 60 * 1000;
export const POSTS_PER_MINUTE = 10;
/** Cards dealt per stage (must match STAGE1_CARDS / STAGE2_CARDS on the client). */
export const STAGE_CARDS: Readonly<Record<1 | 2, number>> = {1: 18, 2: 150};
/** Mom adds one 3-card pack every 25s and every 10 cleared boxes (stage 2 only). */
export const MOM_INTERVAL_MS = 25_000;
/** Request header that routes a request to the isolated test tables (value = TEST_KEY secret). */
export const TEST_HEADER = 'X-Smhj-Test';
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

/** The isolated test tables can also be wiped; the live store deliberately has no reset. */
export interface TestStore extends RankStore {
  reset(): Promise<{clears: number; rate: number}>;
}

export interface TestMode {
  /** TEST_KEY secret; when unset every request carrying the test header is refused. */
  readonly key: string | undefined;
  readonly store: TestStore;
}

/** Shanghai calendar day, which is what “今日” means to players. */
export function shanghaiDay(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

export type ClearInput = {province: string; stage: 1 | 2; ms: number; sessionId: string; boxes: number; momBoxes: number};

export function parseClear(body: unknown): ClearInput | string {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const {province, stage, ms, sessionId, boxes, momBoxes = 0} = body as Record<string, unknown>;
  if (typeof province !== 'string' || !(PROVINCES as readonly string[]).includes(province)) return 'unknown province';
  if (stage !== 1 && stage !== 2) return 'stage must be 1 or 2';
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0 || ms > MAX_MS) return 'invalid ms';
  if (typeof sessionId !== 'string' || !SESSION_RE.test(sessionId)) return 'invalid sessionId';
  if (!Number.isSafeInteger(boxes) || (boxes as number) < 0) return 'invalid boxes';
  if (!Number.isSafeInteger(momBoxes) || (momBoxes as number) < 0) return 'invalid momBoxes';
  return {province, stage, ms: Math.round(ms), sessionId, boxes: boxes as number, momBoxes: momBoxes as number};
}

/**
 * A finished run packs every card, so boxes = (dealt cards + mom's packs) / 3. Returns the
 * rejection reason, or null when the counts are consistent with the stage and the play time.
 */
export function checkBoxes(input: ClearInput): string | null {
  if (input.stage === 1 && input.momBoxes !== 0) return 'stage 1 has no mom packs';
  const maxMom = Math.ceil(input.ms / MOM_INTERVAL_MS) + Math.ceil(input.boxes / 10);
  if (input.momBoxes > maxMom) return 'too many mom packs';
  if (input.boxes !== STAGE_CARDS[input.stage] / 3 + input.momBoxes) return 'boxes do not match the stage';
  return null;
}

/** Constant-time string comparison for the test key. */
export function sameSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
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
    headers['Access-Control-Allow-Headers'] = `Content-Type, ${TEST_HEADER}`;
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

export async function handle(request: Request, live: RankStore, now = Date.now(), test?: TestMode): Promise<Response> {
  const origin = request.headers.get('Origin');
  // Browsers from other sites are refused outright; no Origin (curl, server) is allowed.
  if (origin !== null && origin !== ALLOWED_ORIGIN) return json(403, {ok: false, error: 'origin not allowed'}, null);
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(origin)});

  // A test-key request never touches the public tables; a wrong or unconfigured key is refused.
  const testHeader = request.headers.get(TEST_HEADER);
  let store: RankStore = live;
  let testStore: TestStore | null = null;
  if (testHeader !== null) {
    if (!test?.key || !sameSecret(testHeader, test.key)) return json(403, {ok: false, error: 'bad test key'}, origin);
    store = testStore = test.store;
  }

  if (url.pathname === '/api/test/reset' && request.method === 'POST' && testStore) {
    return json(200, {ok: true, test: true, deleted: await testStore.reset()}, origin, {'Cache-Control': 'no-store'});
  }

  if (url.pathname === '/api/rank' && request.method === 'GET') {
    const day = shanghaiDay(now);
    const provinces = sortCounts(await store.stage2Counts(day));
    return json(200, {
      ok: true,
      provinces,
      totalClears: provinces.reduce((sum, row) => sum + row.total, 0),
      todayClears: provinces.reduce((sum, row) => sum + row.today, 0),
      updatedAt: now,
      ...(testStore ? {test: true} : {}),
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
    const boxError = checkBoxes(input);
    if (boxError) return json(422, {ok: false, error: boxError}, origin);
    const day = shanghaiDay(now);
    const {inserted, province} = await store.insertClear({
      sessionId: input.sessionId, stage: input.stage, province: input.province, ms: input.ms, day, createdAt: now,
    });
    const {rank, total} = provinceRank(sortCounts(await store.stage2Counts(day)), province);
    return json(200, {ok: true, duplicate: !inserted, province, rank, total, ...(testStore ? {test: true} : {})}, origin);
  }

  return json(404, {ok: false, error: 'not found'}, origin);
}
