import { GAME_TITLE } from '../../config/brand';
import { PROVINCES } from '../provinces';

export const RANK_DEFAULT_API_BASE = 'https://smhj-api.feyakit.workers.dev';
export const RANK_PROVINCE_STORAGE_KEY = 'smhj.province';
export const RANK_DEVICE_STORAGE_KEY = 'smhj.deviceId';
export const RANK_PENDING_STORAGE_KEY = 'smhj.pendingClears';
export const RANK_REQUEST_TIMEOUT_MS = 5_000;
export const RANK_MAX_REPORT_ATTEMPTS = 3;
export const RANK_MAX_PENDING_CLEARS = 80;
export const RANK_MIN_CLEAR_MS: Readonly<Record<1 | 2, number>> = Object.freeze({1:4_000,2:45_000});

export const RANK_TITLE = '为家乡而战 · 省份排行';
export const RANK_EMPTY_TEXT = `还没有人${GAME_TITLE}，你来当第一个`;
export const RANK_LOADING_TEXT = '排行加载中…';
export const RANK_ERROR_TEXT = '排行暂时连不上';
export const RANK_RETRY_TEXT = '重试';
export const RANK_DEBUG_TEXT = '调试模式不计入排行';

export type Province = typeof PROVINCES[number];
export type RankStage = 1 | 2;

export interface RankEntry {
  readonly province: Province;
  readonly total: number;
  readonly today: number;
}

export interface RankSnapshot {
  readonly provinces: readonly RankEntry[];
  readonly totalClears: number;
  readonly todayClears: number;
  readonly updatedAt: number;
}

export interface RankClearResult {
  readonly duplicate: boolean;
  readonly province: Province;
  readonly rank: number | null;
  readonly total: number;
}

export interface ClearReport {
  readonly province: Province;
  readonly stage: RankStage;
  readonly ms: number;
  readonly sessionId: string;
  /** Boxes actually packed this run (one per cleared triple, mom's packs included). */
  readonly boxes: number;
  /** How many 3-card packs mom added this run. */
  readonly momBoxes: number;
}

export interface PendingClear extends ClearReport {
  readonly queuedAt: number;
}

export type RankApiConfig =
  | { readonly enabled: true; readonly base: string }
  | { readonly enabled: false; readonly base: null };

export interface RankStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface RankRandomSource {
  randomUUID?(): string;
  getRandomValues?(array: Uint8Array): Uint8Array;
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const DEVICE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/** Resolves the API base from `?api=`; `off` disables every rank request. */
export function resolveRankApi(search: string): RankApiConfig {
  const raw = new URLSearchParams(search).get('api');
  if (raw === null) return {enabled:true,base:RANK_DEFAULT_API_BASE};
  const value = raw.trim();
  if (!value || value.toLowerCase() === 'off') return {enabled:false,base:null};
  return {enabled:true,base:normalizeApiBase(value) ?? RANK_DEFAULT_API_BASE};
}

export function isProvince(value: unknown): value is Province {
  return typeof value === 'string' && (PROVINCES as readonly string[]).includes(value);
}

export function isRankStage(value: unknown): value is RankStage {
  return value === 1 || value === 2;
}

export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

export function isValidClearMs(stage: RankStage, ms: unknown): ms is number {
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= RANK_MIN_CLEAR_MS[stage];
}

export function isValidClearReport(value: unknown): value is ClearReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<ClearReport>;
  return isProvince(report.province)
    && isRankStage(report.stage)
    && isPositiveFinite(report.ms)
    && isValidSessionId(report.sessionId)
    && isCount(report.boxes)
    && isCount(report.momBoxes);
}

/** Any `debug` URL parameter (win/fail/mom/…) marks a run that must never reach the leaderboard. */
export function isDebugRun(search: string): boolean {
  return new URLSearchParams(search).has('debug');
}

/** Creates a device id that satisfies the server's 8–64 character session rule. */
export function createDeviceId(source: RankRandomSource | undefined = globalThis.crypto): string {
  try {
    const uuid = source?.randomUUID?.();
    if (isValidSessionId(uuid)) return uuid;
  } catch { /* Fall through to a generated id. */ }
  const length = 24;
  const buffer = new Uint8Array(length);
  try {
    source?.getRandomValues?.(buffer);
    if (buffer.some(byte => byte !== 0)) return `smhj-${fromBytes(buffer)}`;
  } catch { /* Fall through to Math.random. */ }
  let fallback = 'smhj-';
  for (let index = 0; index < length; index++) {
    fallback += DEVICE_ALPHABET[Math.floor(Math.random() * DEVICE_ALPHABET.length)];
  }
  return fallback;
}

export function readStoredProvince(storage: RankStorage | undefined): Province | null {
  try {
    const value = storage?.getItem(RANK_PROVINCE_STORAGE_KEY);
    return isProvince(value) ? value : null;
  } catch { return null; }
}

export function writeStoredProvince(storage: RankStorage | undefined, province: Province): void {
  try { storage?.setItem(RANK_PROVINCE_STORAGE_KEY, province); } catch { /* Storage is optional. */ }
}

export function parsePendingClears(raw: string | null): PendingClear[] {
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const result: PendingClear[] = [];
  for (const item of value) {
    if (!isValidClearReport(item)) continue;
    const queuedAt = (item as {queuedAt?: unknown}).queuedAt;
    if (typeof queuedAt !== 'number' || !Number.isFinite(queuedAt) || queuedAt < 0) continue;
    result.push({...item,queuedAt});
  }
  return result.slice(0,RANK_MAX_PENDING_CLEARS);
}

export function serializePendingClears(items: readonly PendingClear[]): string {
  return JSON.stringify(items.slice(0,RANK_MAX_PENDING_CLEARS));
}

export function readPendingClears(storage: RankStorage | undefined): PendingClear[] {
  try { return parsePendingClears(storage?.getItem(RANK_PENDING_STORAGE_KEY) ?? null); }
  catch { return []; }
}

export function writePendingClears(storage: RankStorage | undefined, items: readonly PendingClear[]): void {
  try {
    if (!storage) return;
    if (!items.length) {
      if (storage.removeItem) storage.removeItem(RANK_PENDING_STORAGE_KEY);
      else storage.setItem(RANK_PENDING_STORAGE_KEY, '[]');
      return;
    }
    storage.setItem(RANK_PENDING_STORAGE_KEY, serializePendingClears(items));
  } catch { /* Storage is optional. */ }
}

/** Keeps one pending report per device/stage because the server de-duplicates it anyway. */
export function enqueuePendingClear(
  items: readonly PendingClear[],
  report: ClearReport,
  queuedAt = Date.now(),
): PendingClear[] {
  const next = items.filter(item => !(item.sessionId === report.sessionId && item.stage === report.stage));
  next.push({...report,queuedAt});
  return next.slice(-RANK_MAX_PENDING_CLEARS);
}

export function removePendingClear(items: readonly PendingClear[], report: ClearReport): PendingClear[] {
  return items.filter(item => !(item.sessionId === report.sessionId && item.stage === report.stage));
}

export function parseRankSnapshot(value: unknown): RankSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.ok !== true || !Array.isArray(data.provinces)) return null;
  if (!isNonNegativeFinite(data.totalClears) || !isNonNegativeFinite(data.todayClears) || !isNonNegativeFinite(data.updatedAt)) {
    return null;
  }
  const provinces: RankEntry[] = [];
  for (const item of data.provinces) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (!isProvince(entry.province) || !isNonNegativeFinite(entry.total) || !isNonNegativeFinite(entry.today)) continue;
    provinces.push({province:entry.province,total:entry.total,today:entry.today});
  }
  return {
    provinces,
    totalClears:data.totalClears,
    todayClears:data.todayClears,
    updatedAt:data.updatedAt,
  };
}

export function parseClearResult(value: unknown): RankClearResult | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.ok !== true || typeof data.duplicate !== 'boolean') return null;
  if (!isProvince(data.province) || !isNonNegativeFinite(data.total)) return null;
  if (data.rank !== null && (!isPositiveFinite(data.rank))) return null;
  return {
    duplicate:data.duplicate,
    province:data.province,
    rank:data.rank === null ? null : data.rank,
    total:data.total,
  };
}

export function findRankEntry(snapshot: RankSnapshot, province: Province): RankEntry | undefined {
  return snapshot.provinces.find(entry => entry.province === province);
}

export function formatRankSummary(snapshot: RankSnapshot): string {
  return `全国累计 ${snapshot.totalClears} 次 · 今日 ${snapshot.todayClears} 次`;
}

export interface RankDisplayRow {
  readonly province: Province;
  readonly total: number;
  readonly today: number;
  readonly rank: number | null;
  readonly badge: 1 | 2 | 3 | null;
  readonly own: boolean;
  readonly waiting: boolean;
}

/**
 * Fills the public leaderboard to all 34 provincial regions. Returned API rows keep their
 * server order and only positive totals are ranked; every missing region is appended as waiting.
 */
export function buildRankRows(snapshot: RankSnapshot, own: Province | null): RankDisplayRow[] {
  const unique: RankEntry[] = [];
  const seen = new Set<Province>();
  for (const entry of snapshot.provinces) {
    if (seen.has(entry.province)) continue;
    seen.add(entry.province);
    unique.push(entry);
  }
  const ranked = unique.filter(entry => entry.total > 0);
  const ordered = ranked.length === 0 && own
    ? [own, ...PROVINCES.filter(province => province !== own)]
    : [...PROVINCES];
  const rows: RankDisplayRow[] = [];
  let rank = 0;
  for (const entry of ranked) {
    rank += 1;
    rows.push({
      ...entry,
      rank,
      badge: rank <= 3 ? rank as 1 | 2 | 3 : null,
      own: entry.province === own,
      waiting: false,
    });
  }
  const rankedProvinces = new Set(ranked.map(entry => entry.province));
  for (const province of ordered) {
    if (rankedProvinces.has(province)) continue;
    rows.push({province, total: 0, today: 0, rank: null, badge: null, own: province === own, waiting: true});
  }
  return rows;
}

export function formatRankToday(today: number): string {
  return `今日 +${Math.max(0,Math.floor(today))}`;
}

export function formatRankProgress(province: Province): string {
  return `正在为${provinceLabel(province)}加油…`;
}

export function formatContributionResult(province: Province, result: RankClearResult): string {
  const head = result.duplicate ? `你已为${provinceLabel(province)}贡献过` : `你为${provinceLabel(province)} +1`;
  return result.rank === null ? head : `${head}，${provinceLabel(province)}排第 ${result.rank}`;
}

export function formatContributionFailure(): string {
  return RANK_ERROR_TEXT;
}

export function formatYourProvince(province: Province | null, entry?: RankEntry, rank?: number): string {
  if (!province) return '你的省份：未选择';
  if (!entry) return `你的省份：${province} 暂无人通关`;
  if (rank !== undefined) return `你的省份：${province} · 排第 ${entryRank(rank)} 名 · ${entry.total} 人通关`;
  return `你的省份：${province} · ${entry.total} 人通关`;
}

/** Waits 700ms, 1.4s, 2.8s… between transient report failures. */
export function retryDelayMs(retryIndex: number): number {
  const index = Number.isFinite(retryIndex) ? Math.max(0,Math.floor(retryIndex)) : 0;
  return 700 * 2 ** index;
}

function entryRank(rank: number): number {
  return Math.max(1,Math.floor(rank));
}

function normalizeApiBase(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.href.replace(/\/+$/,'');
  } catch { return undefined; }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function fromBytes(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) result += DEVICE_ALPHABET[byte % DEVICE_ALPHABET.length];
  return result;
}

const MUNICIPALITIES = ['北京','天津','上海','重庆'];
const BARE_NAMES = ['内蒙古','广西','西藏','宁夏','新疆','香港','澳门'];
/** “广东省”“北京市”“新疆”: municipalities, autonomous regions and SARs are not 省. */
export function provinceLabel(province: string): string {
  if (MUNICIPALITIES.includes(province)) return `${province}市`;
  if (BARE_NAMES.includes(province)) return province;
  return `${province}省`;
}
