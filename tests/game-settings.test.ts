import { expect, test } from 'vitest';
import { GAME_SETTINGS_KEY, defaultGameSettings, loadGameSettings, parseGameSettings, saveGameSettings } from '../client/assets/scripts/game/GameSettings';

test('settings default to sound and vibration on',() => {
  expect(defaultGameSettings()).toEqual({sound:true,vibration:true});
  expect(parseGameSettings(null)).toEqual({sound:true,vibration:true});
  expect(parseGameSettings('')).toEqual({sound:true,vibration:true});
});

test('parses saved booleans and ignores corrupt or partial data',() => {
  expect(parseGameSettings('{"sound":false,"vibration":false}')).toEqual({sound:false,vibration:false});
  expect(parseGameSettings('{"sound":false}')).toEqual({sound:false,vibration:true});
  expect(parseGameSettings('{"sound":"no","vibration":1}')).toEqual({sound:true,vibration:true});
  expect(parseGameSettings('{bad json')).toEqual({sound:true,vibration:true});
});

test('loads and saves through a tolerant storage adapter',() => {
  const values=new Map<string,string>();
  const storage={getItem:(key: string) => values.get(key) ?? null,setItem:(key: string,value: string) => { values.set(key,value); }};
  const settings={sound:false,vibration:true};
  saveGameSettings(settings,storage);
  expect(values.get(GAME_SETTINGS_KEY)).toBe('{"sound":false,"vibration":true}');
  expect(loadGameSettings(storage)).toEqual(settings);
  expect(loadGameSettings(undefined)).toEqual({sound:true,vibration:true});
  const blocked={getItem:() => { throw new Error('blocked'); },setItem:() => { throw new Error('blocked'); }};
  expect(loadGameSettings(blocked)).toEqual({sound:true,vibration:true});
  expect(() => saveGameSettings(settings,blocked)).not.toThrow();
});
