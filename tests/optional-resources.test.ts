import { beforeEach, expect, test, vi } from 'vitest';
const engine=vi.hoisted(() => ({info:vi.fn(),load:vi.fn()}));
vi.mock('cc',() => ({SpriteFrame:class {},resources:{getInfoWithPath:engine.info,load:engine.load}}));
beforeEach(() => { vi.resetModules(); engine.info.mockReset(); engine.load.mockReset(); });
test('missing image skips engine load and resolves fallback',async () => {
  const {loadArt}=await import('../client/assets/scripts/services/OptionalResources');
  expect(await loadArt('items/liquor')).toBeUndefined();
  expect(engine.info.mock.calls[0][0]).toBe('art/items/liquor/spriteFrame');
  expect(engine.load).not.toHaveBeenCalled();
});
test('loaded frame is shared by filename; failed or thrown load resolves fallback',async () => {
  engine.info.mockReturnValue({uuid:'present'});
  const frame={name:'replacement'};
  engine.load.mockImplementation((_path,_type,done) => done(null,frame));
  const {loadArt}=await import('../client/assets/scripts/services/OptionalResources');
  expect(await loadArt('items/milk')).toBe(frame);
  expect(await loadArt('items/milk')).toBe(frame);
  expect(engine.load).toHaveBeenCalledTimes(1);
  engine.load.mockImplementation((_path,_type,done) => done(new Error('decode')));
  expect(await loadArt('items/fish')).toBeUndefined();
  engine.load.mockImplementation(() => { throw new Error('network'); });
  expect(await loadArt('items/duck')).toBeUndefined();
});
