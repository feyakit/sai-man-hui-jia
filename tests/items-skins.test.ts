import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { EXTRA_ITEMS, ITEMS, diversifySkins, itemKey, itemMeta, skinsFor } from '../client/assets/scripts/core/items';
import { SHAPES } from '../client/assets/scripts/core/shapes';
import type { Level, ShapeId } from '../client/assets/scripts/core/types';

const shapes = Object.keys(SHAPES) as ShapeId[];

test('every shape has at least two real-object skins and keys are unique', () => {
  const keys = [...Object.values(ITEMS),...EXTRA_ITEMS].map(item => item.key);
  expect(keys.length).toBeGreaterThanOrEqual(39);
  expect(new Set(keys).size).toBe(keys.length);
  for (const shape of shapes) expect(skinsFor(shape).length).toBeGreaterThanOrEqual(2);
});

test('extra skins resolve by key and keep their name', () => {
  const piece = {id:1,shape:'R6' as const,item:'woven',initialRotation:0 as const};
  expect(itemKey(piece)).toBe('woven');
  expect(itemMeta(piece).name).toBe('土特产编织袋');
});

test('diversifySkins only changes item keys, always to a skin of the same shape', () => {
  const pieces = shapes.flatMap((shape,index) => [0,1].map(n => ({id:index*2+n+1,shape,item:ITEMS[shape].key,initialRotation:(n*3) as 0|3})));
  const out = diversifySkins(pieces,1);
  out.forEach((piece,index) => {
    expect({...piece,item:pieces[index].item}).toEqual(pieces[index]);
    expect(skinsFor(piece.shape).map(skin => skin.key)).toContain(piece.item);
  });
  for (const shape of shapes) expect(new Set(out.filter(p => p.shape === shape).map(p => p.item)).size).toBe(2);
});

test('shipped stage 2 and mom levels mix skins, each key at most twice, skins match shapes', () => {
  for (const name of ['stage2','mom']) {
    const level = JSON.parse(readFileSync(`client/assets/resources/levels/v1/${name}.json`,'utf8')) as Level;
    const all = [...level.pieces,...(level.extras ?? []).flat()];
    const counts = new Map<string,number>();
    for (const piece of all) {
      expect(skinsFor(piece.shape).map(skin => skin.key)).toContain(piece.item);
      counts.set(piece.item,(counts.get(piece.item) ?? 0)+1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    expect(all.some(piece => EXTRA_ITEMS.some(item => item.key === piece.item))).toBe(true);
  }
});

test('the 20-piece challenge demo only uses skins drawn for each piece shape', () => {
  const level = JSON.parse(readFileSync('client/assets/resources/dev-levels/demo.json','utf8')) as Level;
  for (const piece of level.pieces) expect(skinsFor(piece.shape).map(skin => skin.key)).toContain(piece.item);
  expect(new Set(level.pieces.map(piece => piece.item)).size).toBeGreaterThanOrEqual(8);
});
