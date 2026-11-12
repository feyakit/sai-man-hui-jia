import {
  RANK_DEVICE_STORAGE_KEY,
  RANK_MAX_REPORT_ATTEMPTS,
  RANK_PENDING_STORAGE_KEY,
  RANK_REQUEST_TIMEOUT_MS,
  createDeviceId,
  enqueuePendingClear,
  isValidClearMs,
  isValidClearReport,
  isValidSessionId,
  parseClearResult,
  parseRankSnapshot,
  readPendingClears,
  readStoredProvince,
  removePendingClear,
  resolveRankApi,
  retryDelayMs,
  writePendingClears,
  writeStoredProvince,
  type ClearReport,
  type Province,
  type RankApiConfig,
  type RankClearResult,
  type RankSnapshot,
  type RankStorage,
} from '../core/rank/rank';

export type RankReportOutcome =
  | { readonly ok: true; readonly result: RankClearResult }
  | { readonly ok: false; readonly reason: 'disabled' | 'invalid' | 'network' };

type AttemptOutcome =
  | { readonly kind: 'ok'; readonly result: RankClearResult }
  | { readonly kind: 'permanent' }
  | { readonly kind: 'retry' };

/** Thin, failure-tolerant HTTP client for the provincial leaderboard. */
export class RankApi {
  readonly config: RankApiConfig;
  private readonly storage: RankStorage | undefined;
  private readonly fetcher: typeof fetch | undefined;
  private memoryDeviceId: string | undefined;

  constructor(
    config: RankApiConfig = resolveRankApi(currentSearch()),
    storage: RankStorage | undefined = browserStorage(),
    fetcher: typeof fetch | undefined = globalThis.fetch,
  ) {
    this.config = config;
    this.storage = storage;
    this.fetcher = fetcher;
  }

  get enabled(): boolean { return this.config.enabled; }

  get deviceId(): string {
    if (this.memoryDeviceId) return this.memoryDeviceId;
    try {
      const stored = this.storage?.getItem(RANK_DEVICE_STORAGE_KEY);
      if (isValidSessionId(stored)) {
        this.memoryDeviceId = stored;
        return stored;
      }
    } catch { /* Fall through to a new id. */ }
    const created = createDeviceId();
    this.memoryDeviceId = created;
    try { this.storage?.setItem(RANK_DEVICE_STORAGE_KEY, created); } catch { /* In-memory only. */ }
    return created;
  }

  get province(): Province | null {
    return readStoredProvince(this.storage);
  }

  setProvince(province: Province): void {
    writeStoredProvince(this.storage,province);
  }

  async fetchRank(): Promise<RankSnapshot> {
    if (!this.config.enabled) throw new Error('rank api disabled');
    const response = await this.request('/api/rank');
    if (!response.ok) throw new Error(`rank api ${response.status}`);
    const snapshot = parseRankSnapshot(await response.json());
    if (!snapshot) throw new Error('rank api payload invalid');
    return snapshot;
  }

  /** Never rejects: transient errors retry, then become a persisted pending report. */
  async submitClear(report: ClearReport): Promise<RankReportOutcome> {
    if (!this.config.enabled) return {ok:false,reason:'disabled'};
    if (!isValidClearReport(report) || !isValidClearMs(report.stage,report.ms)) {
      return {ok:false,reason:'invalid'};
    }
    let last: AttemptOutcome = {kind:'retry'};
    try {
      for (let attempt = 0; attempt < RANK_MAX_REPORT_ATTEMPTS; attempt++) {
        last = await this.attemptClear(report);
        if (last.kind === 'ok') {
          this.removeQueued(report);
          return {ok:true,result:last.result};
        }
        if (last.kind === 'permanent') return {ok:false,reason:'invalid'};
        if (attempt < RANK_MAX_REPORT_ATTEMPTS - 1) await sleep(retryDelayMs(attempt));
      }
      this.queue(report);
      return {ok:false,reason:'network'};
    } catch {
      this.queue(report);
      return {ok:false,reason:'network'};
    }
  }

  /** Best-effort one-shot flush for reports left behind by an earlier session. */
  async flushPending(): Promise<void> {
    if (!this.config.enabled) return;
    try {
      const pending = readPendingClears(this.storage);
      if (!pending.length) return;
      const keep = [];
      for (const report of pending) {
        const outcome = await this.attemptClear(report);
        if (outcome.kind === 'retry') keep.push(report);
      }
      writePendingClears(this.storage,keep);
    } catch { /* Pending reports stay for the next launch. */ }
  }

  private async attemptClear(report: ClearReport): Promise<AttemptOutcome> {
    if (!this.config.enabled || !this.fetcher) return {kind:'retry'};
    let response: Response;
    try {
      response = await this.request('/api/clear',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          province:report.province,
          stage:report.stage,
          ms:report.ms,
          sessionId:report.sessionId,
        }),
      });
    } catch { return {kind:'retry'}; }
    if (response.status === 400 || response.status === 422) return {kind:'permanent'};
    if (!response.ok) return {kind:'retry'};
    try {
      const result = parseClearResult(await response.json());
      return result ? {kind:'ok',result} : {kind:'retry'};
    } catch { return {kind:'retry'}; }
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    if (!this.config.enabled) throw new Error('rank api disabled');
    if (!this.fetcher) throw new Error('fetch unavailable');
    const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
    const timer = controller
      ? setTimeout(() => controller.abort(),RANK_REQUEST_TIMEOUT_MS)
      : undefined;
    try {
      return await this.fetcher(`${this.config.base}${path}`,{
        ...init,
        signal:controller?.signal,
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private queue(report: ClearReport): void {
    try {
      const next = enqueuePendingClear(readPendingClears(this.storage),report,Date.now());
      writePendingClears(this.storage,next);
    } catch { /* A full/blocked storage must not affect gameplay. */ }
  }

  private removeQueued(report: ClearReport): void {
    try {
      const next = removePendingClear(readPendingClears(this.storage),report);
      if (next.length !== readPendingClears(this.storage).length) writePendingClears(this.storage,next);
    } catch { /* Best effort. */ }
  }
}

function currentSearch(): string {
  try { return typeof window === 'undefined' ? '' : window.location.search; }
  catch { return ''; }
}

function browserStorage(): RankStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve,ms));
}

export { RANK_PENDING_STORAGE_KEY };
