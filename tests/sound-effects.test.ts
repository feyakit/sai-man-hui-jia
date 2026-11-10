import { beforeEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(() => ({load:vi.fn(),play:vi.fn()}));
vi.mock('cc',() => ({AudioClip:class {},AudioSource:class {playOneShot=mocks.play;}}));
vi.mock('../client/assets/scripts/services/OptionalResources',() => ({
  AUDIO_NAMES:['pickup','drop','invalid','rotate','undo','tick','trunk_slam','horn','cheer','mom'],loadAudio:mocks.load,
}));
import { SoundEffects } from '../client/assets/scripts/services/SoundEffects';
import type { Node } from 'cc';
function owner() {
  return {isValid:true,getComponent:vi.fn(),addComponent:vi.fn((Type: new () => unknown) => new Type())};
}
beforeEach(() => { mocks.load.mockReset(); mocks.play.mockReset(); });
test('preloads all names, silent before ready, never replays an old action',async () => {
  let resolve!: (clip: unknown) => void;
  mocks.load.mockImplementation(() => new Promise(done => { resolve=done; }));
  const node=owner(), sounds=new SoundEffects(node as unknown as Node);
  expect(mocks.load).toHaveBeenCalledTimes(10);
  sounds.play('mom'); expect(mocks.play).not.toHaveBeenCalled();
  const clip={}; resolve(clip); await Promise.resolve();
  expect(mocks.play).not.toHaveBeenCalled();
  sounds.play('mom'); expect(mocks.play).toHaveBeenCalledWith(clip,1);
});
test('missing and playback failures are silent; destroyed owners are ignored',async () => {
  mocks.load.mockResolvedValue(undefined);
  const missing=new SoundEffects(owner() as unknown as Node);
  await Promise.resolve(); missing.play('drop'); expect(mocks.play).not.toHaveBeenCalled();
  mocks.load.mockResolvedValue({});
  const node=owner(), sounds=new SoundEffects(node as unknown as Node);
  await Promise.resolve();
  mocks.play.mockImplementation(() => { throw new Error('device unavailable'); });
  expect(() => sounds.play('pickup')).not.toThrow();
  mocks.play.mockClear(); node.isValid=false;
  sounds.play('pickup'); expect(mocks.play).not.toHaveBeenCalled();
});
