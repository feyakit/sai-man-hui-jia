import { describe, expect, it } from 'vitest';
import { CITY_PLATES, citiesOf, findCity, plateLetter } from '../client/assets/scripts/core/cities';
import { PROVINCE_PLATE_ABBR, plateText } from '../client/assets/scripts/core/plate';
import { PROVINCES } from '../client/assets/scripts/core/provinces';
import { CITY_STORAGE_KEY, RANK_PROVINCE_STORAGE_KEY, readStoredCity, readStoredProvince, writeStoredRegion } from '../client/assets/scripts/core/rank/rank';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem:(key: string) => data.get(key) ?? null,
    setItem:(key: string, value: string) => { data.set(key, value); },
    removeItem:(key: string) => { data.delete(key); },
  };
}

describe('city plate codes', () => {
  it.each([
    ['河南','郑州','豫A'],['河南','开封','豫B'],['河南','洛阳','豫C'],['河南','信阳','豫S'],['河南','济源','豫U'],
    ['广东','深圳','粤B'],['广东','东莞','粤S'],['广东','云浮','粤W'],['福建','厦门','闽D'],['江苏','苏州','苏E'],
    ['山东','青岛','鲁B'],['山东','临沂','鲁Q'],['湖北','襄阳','鄂F'],['湖北','恩施州','鄂Q'],['四川','眉山','川Z'],
    ['湖南','湘西州','湘U'],['吉林','延边州','吉H'],['新疆','喀什','新Q'],['新疆','伊犁州','新F'],['辽宁','大连','辽B'],
    ['浙江','台州','浙J'],['广西','桂林','桂C'],['河北','廊坊','冀R'],['黑龙江','大兴安岭','黑P'],['西藏','林芝','藏G'],
  ] as const)('%s %s → %s', (province, city, plate) => {
    expect(`${PROVINCE_PLATE_ABBR[province]}${plateLetter(province, city)}`).toBe(plate);
    expect(plateText(province, city)).toBe(`${plate}·春节`);
  });

  it('covers every province with prefectures, with the capital on A and unique letters', () => {
    const noCities = PROVINCES.filter(province => citiesOf(province).length === 0);
    expect(noCities.sort()).toEqual(['上海','北京','台湾','天津','澳门','重庆','香港'].sort());
    let total = 0;
    for (const province of PROVINCES) {
      const list = CITY_PLATES[province];
      total += list.length;
      if (!list.length) continue;
      expect(list[0].code, province).toBe('A');
      expect(new Set(list.map(city => city.code)).size, province).toBe(list.length);
      expect(new Set(list.map(city => city.name)).size, province).toBe(list.length);
      for (const city of list) {
        expect(city.code).toMatch(/^[A-HJ-NP-Z]$/); // I and O are never issuing letters
        expect([...city.name].length).toBeLessThanOrEqual(4); // fits the home seal
      }
    }
    expect(total).toBeGreaterThanOrEqual(333); // all prefecture-level divisions + self-coded county-level ones
  });

  it('falls back to the capital A, then to 回家', () => {
    expect(plateText('河南')).toBe('豫A·春节');
    expect(plateText('河南', null)).toBe('豫A·春节');
    expect(plateText('河南', '深圳')).toBe('豫A·春节'); // a city of another province is ignored
    expect(plateText('北京')).toBe('京A·春节');
    expect(plateText(null)).toBe('回家·春节');
    expect(findCity('河南', '洛阳')?.full).toBe('洛阳市');
  });
});

describe('stored region', () => {
  it('keeps old province-only saves working', () => {
    const storage = memory({[RANK_PROVINCE_STORAGE_KEY]:'河南'});
    expect(readStoredProvince(storage)).toBe('河南');
    expect(readStoredCity(storage)).toBeNull();
  });

  it('saves province + city and drops a city that no longer matches', () => {
    const storage = memory();
    writeStoredRegion(storage, '河南', '洛阳');
    expect(storage.data.get(RANK_PROVINCE_STORAGE_KEY)).toBe('河南');
    expect(readStoredCity(storage)).toBe('洛阳');
    writeStoredRegion(storage, '北京', null);
    expect(storage.data.has(CITY_STORAGE_KEY)).toBe(false);
    expect(readStoredCity(storage)).toBeNull();
    storage.setItem(CITY_STORAGE_KEY, '洛阳'); // stale city from another province
    expect(readStoredCity(storage)).toBeNull();
    writeStoredRegion(storage, '广东', '火星');
    expect(readStoredCity(storage)).toBeNull();
  });
});
