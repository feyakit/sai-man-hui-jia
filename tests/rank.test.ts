import { describe, expect, it } from 'vitest';
import { PROVINCES } from '../client/assets/scripts/core/provinces';
import {
  RANK_DEFAULT_API_BASE,
  RANK_DEVICE_STORAGE_KEY,
  RANK_MAX_PENDING_CLEARS,
  RANK_PENDING_STORAGE_KEY,
  RANK_PROVINCE_STORAGE_KEY,
  createDeviceId,
  enqueuePendingClear,
  findRankEntry,
  formatContributionFailure,
  formatContributionResult,
  formatRankProgress,
  formatRankSummary,
  formatRankToday,
  formatYourProvince,
  isProvince,
  isRankStage,
  isValidClearMs,
  isValidClearReport,
  isValidSessionId,
  parseClearResult,
  parsePendingClears,
  parseRankSnapshot,
  readPendingClears,
  readStoredProvince,
  removePendingClear,
  resolveRankApi,
  retryDelayMs,
  serializePendingClears,
  writePendingClears,
  writeStoredProvince,
  type PendingClear,
  type RankStorage,
} from '../client/assets/scripts/core/rank/rank';

function memoryStorage(seed: Record<string,string> = {}): RankStorage & {data: Map<string,string>} {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key,value) => { data.set(key,value); },
    removeItem: key => { data.delete(key); },
  };
}

const report = {
  province: '广东' as const,
  stage: 2 as const,
  ms: 61_000,
  sessionId: 'device_12345678',
};

describe('rank API config', () => {
  it('uses the production base by default and supports explicit overrides', () => {
    expect(resolveRankApi('')).toEqual({enabled:true,base:RANK_DEFAULT_API_BASE});
    expect(resolveRankApi('?mode=stack')).toEqual({enabled:true,base:RANK_DEFAULT_API_BASE});
    expect(resolveRankApi('?api=https://example.com/base/')).toEqual({enabled:true,base:'https://example.com/base'});
    expect(resolveRankApi('?api=off')).toEqual({enabled:false,base:null});
    expect(resolveRankApi('?api=OFF')).toEqual({enabled:false,base:null});
    expect(resolveRankApi('?api=')).toEqual({enabled:false,base:null});
  });

  it('ignores malformed or non-http overrides', () => {
    expect(resolveRankApi('?api=not-a-url')).toEqual({enabled:true,base:RANK_DEFAULT_API_BASE});
    expect(resolveRankApi('?api=file:///tmp/api')).toEqual({enabled:true,base:RANK_DEFAULT_API_BASE});
  });
});

describe('rank validation and device identity', () => {
  it('accepts exactly the 34 provincial regions', () => {
    expect(PROVINCES).toHaveLength(34);
    expect(isProvince('广东')).toBe(true);
    expect(isProvince('新疆')).toBe(true);
    expect(isProvince('广东 ')).toBe(false);
    expect(isProvince(3)).toBe(false);
    expect(isRankStage(1)).toBe(true);
    expect(isRankStage(2)).toBe(true);
    expect(isRankStage(3)).toBe(false);
  });

  it('enforces stage timing and report shape', () => {
    expect(isValidClearMs(1,4_000)).toBe(true);
    expect(isValidClearMs(1,3_999)).toBe(false);
    expect(isValidClearMs(2,45_000)).toBe(true);
    expect(isValidClearMs(2,44_999)).toBe(false);
    expect(isValidClearMs(2,Number.NaN)).toBe(false);
    expect(isValidClearReport(report)).toBe(true);
    expect(isValidClearReport({...report,stage:3})).toBe(false);
    expect(isValidClearReport({...report,ms:0})).toBe(false);
    expect(isValidClearReport({...report,sessionId:'short'})).toBe(false);
    expect(isValidClearReport(null)).toBe(false);
  });

  it('validates session ids at the documented boundaries', () => {
    expect(isValidSessionId('12345678')).toBe(true);
    expect(isValidSessionId('_a-9'.repeat(16))).toBe(true);
    expect(isValidSessionId('1234567')).toBe(false);
    expect(isValidSessionId('a'.repeat(65))).toBe(false);
    expect(isValidSessionId('has space')).toBe(false);
    expect(isValidSessionId(undefined)).toBe(false);
  });

  it('prefers crypto UUIDs and falls back to deterministic random bytes', () => {
    expect(createDeviceId({randomUUID:() => '12345678-abcd'})).toBe('12345678-abcd');
    const bytes = new Uint8Array(24).fill(65);
    expect(createDeviceId({getRandomValues:(array) => { array.set(bytes); return array; }})).toMatch(/^smhj-[A-Za-z0-9_-]{24}$/);
    const savedRandom = Math.random;
    try {
      Math.random = () => 0.1;
      expect(createDeviceId({getRandomValues:() => { throw new Error('blocked'); }})).toHaveLength(29);
    } finally { Math.random = savedRandom; }
  });

  it('persists the province without leaking storage failures', () => {
    const storage = memoryStorage();
    expect(readStoredProvince(storage)).toBeNull();
    writeStoredProvince(storage,'浙江');
    expect(storage.data.get(RANK_PROVINCE_STORAGE_KEY)).toBe('浙江');
    expect(readStoredProvince(storage)).toBe('浙江');
    writeStoredProvince(storage,'不存在' as never);
    expect(readStoredProvince(storage)).toBeNull();
    const broken: RankStorage = {getItem:() => { throw new Error('no'); },setItem:() => { throw new Error('no'); }};
    expect(readStoredProvince(broken)).toBeNull();
    expect(() => writeStoredProvince(broken,'广东')).not.toThrow();
  });
});

describe('pending clear queue', () => {
  it('round-trips only valid reports', () => {
    const pending: PendingClear = {...report,queuedAt:123};
    expect(parsePendingClears(serializePendingClears([pending]))).toEqual([pending]);
    expect(parsePendingClears('')).toEqual([]);
    expect(parsePendingClears('{')).toEqual([]);
    expect(parsePendingClears('{}')).toEqual([]);
    expect(parsePendingClears(JSON.stringify([{...pending,queuedAt:-1},{...pending,province:'火星'},pending]))).toEqual([pending]);
  });

  it('replaces a device/stage entry and caps the queue', () => {
    const first: PendingClear = {...report,queuedAt:1};
    const second = enqueuePendingClear([first],{...report,ms:70_000},2);
    expect(second).toEqual([{...report,ms:70_000,queuedAt:2}]);
    let queue: PendingClear[] = [];
    for (let index = 0; index < RANK_MAX_PENDING_CLEARS + 5; index++) {
      queue = enqueuePendingClear(queue,{...report,sessionId:`device_${String(index).padStart(8,'0')}`},index);
    }
    expect(queue).toHaveLength(RANK_MAX_PENDING_CLEARS);
    expect(queue.at(-1)?.sessionId).toBe(`device_${String(RANK_MAX_PENDING_CLEARS + 4).padStart(8,'0')}`);
    expect(removePendingClear(second,report)).toEqual([]);
  });

  it('reads and writes through optional storage', () => {
    const storage = memoryStorage();
    expect(readPendingClears(storage)).toEqual([]);
    const pending: PendingClear = {...report,queuedAt:9};
    writePendingClears(storage,[pending]);
    expect(storage.data.get(RANK_PENDING_STORAGE_KEY)).toBe(serializePendingClears([pending]));
    expect(readPendingClears(storage)).toEqual([pending]);
    writePendingClears(storage,[]);
    expect(storage.data.has(RANK_PENDING_STORAGE_KEY)).toBe(false);
    const noRemove: RankStorage = {getItem:() => null,setItem:(key,value) => { seed.set(key,value); }};
    const seed = new Map<string,string>();
    writePendingClears(noRemove,[]);
    expect(seed.get(RANK_PENDING_STORAGE_KEY)).toBe('[]');
    const broken: RankStorage = {getItem:() => { throw new Error('no'); },setItem:() => { throw new Error('no'); }};
    expect(readPendingClears(broken)).toEqual([]);
    expect(() => writePendingClears(broken,[pending])).not.toThrow();
  });
});

describe('rank payload parsing', () => {
  it('keeps only real returned province rows', () => {
    const parsed = parseRankSnapshot({
      ok:true,
      provinces:[
        {province:'广东',total:12,today:3},
        {province:'火星',total:9,today:1},
        {province:'浙江',total:-1,today:0},
        {province:'江苏',total:2,today:5},
      ],
      totalClears:14,
      todayClears:8,
      updatedAt:1_700_000_000_000,
    });
    expect(parsed).toEqual({
      provinces:[{province:'广东',total:12,today:3},{province:'江苏',total:2,today:5}],
      totalClears:14,
      todayClears:8,
      updatedAt:1_700_000_000_000,
    });
    expect(parseRankSnapshot(null)).toBeNull();
    expect(parseRankSnapshot({ok:false})).toBeNull();
    expect(parseRankSnapshot({ok:true,provinces:[],totalClears:0,todayClears:0})).toBeNull();
    expect(parseRankSnapshot({ok:true,provinces:[],totalClears:0,todayClears:0,updatedAt:0})).not.toBeNull();
  });

  it('parses clear responses and rejects malformed ones', () => {
    expect(parseClearResult({ok:true,duplicate:false,province:'广东',rank:2,total:10}))
      .toEqual({duplicate:false,province:'广东',rank:2,total:10});
    expect(parseClearResult({ok:true,duplicate:true,province:'广东',rank:null,total:10}))
      .toEqual({duplicate:true,province:'广东',rank:null,total:10});
    expect(parseClearResult({ok:true,duplicate:false,province:'广东',rank:0,total:10})).toBeNull();
    expect(parseClearResult({ok:true,duplicate:false,province:'火星',rank:1,total:10})).toBeNull();
    expect(parseClearResult({ok:false,error:'bad'})).toBeNull();
    expect(parseClearResult(undefined)).toBeNull();
  });

  it('formats only server-backed standings', () => {
    const snapshot = {
      provinces:[{province:'广东' as const,total:12,today:3}],
      totalClears:12,
      todayClears:3,
      updatedAt:1,
    };
    expect(findRankEntry(snapshot,'广东')).toEqual({province:'广东',total:12,today:3});
    expect(findRankEntry(snapshot,'浙江')).toBeUndefined();
    expect(formatRankSummary(snapshot)).toBe('全国累计 12 次 · 今日 3 次');
    expect(formatRankToday(3.9)).toBe('今日 +3');
    expect(formatRankToday(-1)).toBe('今日 +0');
    expect(formatRankProgress('广东')).toBe('正在为 广东 省加油…');
    expect(formatContributionResult('广东',{duplicate:false,province:'广东',rank:2,total:12})).toBe('你为 广东 省 +1，广东 省排第 2');
    expect(formatContributionResult('广东',{duplicate:true,province:'广东',rank:2,total:12})).toBe('你已为 广东 省贡献过，广东 省排第 2');
    expect(formatContributionResult('广东',{duplicate:false,province:'广东',rank:null,total:1})).toBe('你为 广东 省 +1');
    expect(formatContributionFailure()).toBe('排行暂时连不上');
    expect(formatYourProvince(null)).toBe('你的省份：未选择');
    expect(formatYourProvince('广东')).toBe('你的省份：广东 暂无人通关');
    expect(formatYourProvince('广东',{province:'广东',total:12,today:3},2)).toBe('你的省份：广东 · 排第 2 名 · 12 人通关');
    expect(formatYourProvince('广东',{province:'广东',total:12,today:3})).toBe('你的省份：广东 · 12 人通关');
  });

  it('uses bounded exponential retry delays', () => {
    expect(retryDelayMs(0)).toBe(700);
    expect(retryDelayMs(1)).toBe(1_400);
    expect(retryDelayMs(2)).toBe(2_800);
    expect(retryDelayMs(-2)).toBe(700);
    expect(retryDelayMs(Number.NaN)).toBe(700);
  });
});

describe('rank storage keys', () => {
  it('keeps the agreed browser keys', () => {
    expect(RANK_DEVICE_STORAGE_KEY).toBe('smhj.deviceId');
    expect(RANK_PROVINCE_STORAGE_KEY).toBe('smhj.province');
    expect(RANK_PENDING_STORAGE_KEY).toBe('smhj.pendingClears');
  });
});
