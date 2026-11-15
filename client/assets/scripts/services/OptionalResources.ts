import { AudioClip, SpriteFrame, resources } from 'cc';

// Resource paths omit extensions. Cocos imports PNG frames as <name>/spriteFrame.
// Missing entries are checked before load so absent optional assets do not log errors.
const images = new Map<string,Promise<SpriteFrame | undefined>>();
/** Settled loads, so a page built after a preload can draw the art in its very first frame. */
const settled = new Map<string,SpriteFrame | undefined>();

/** The frame if `loadArt(file)` already finished (undefined while pending, missing or failed). */
export function peekArt(file: string): SpriteFrame | undefined {
  return settled.get(`art/${file}/spriteFrame`);
}

/** Whether `loadArt(file)` has finished, successfully or not. */
export function artSettled(file: string): boolean {
  return settled.has(`art/${file}/spriteFrame`);
}

/**
 * Loads every file (at most `timeoutMs`; a slow or missing file never blocks the caller forever)
 * and reports progress as each one settles.
 */
export function preloadArt(files: readonly string[],onProgress?: (done: number,total: number) => void,timeoutMs = 20_000): Promise<void> {
  const unique = [...new Set(files)];
  let done = 0;
  onProgress?.(unique.filter(artSettled).length,unique.length);
  const all = Promise.all(unique.map(file => loadArt(file).then(() => { done++; onProgress?.(Math.max(done,unique.filter(artSettled).length),unique.length); })));
  return Promise.race([all.then(() => undefined),new Promise<void>(resolve => setTimeout(resolve,timeoutMs))]);
}

export function loadArt(file: string): Promise<SpriteFrame | undefined> {
  const path=`art/${file}/spriteFrame`;
  let pending=images.get(path);
  if (!pending) {
    pending=new Promise(resolve => {
      try {
        if (!resources.getInfoWithPath(path,SpriteFrame)) { settled.set(path,undefined); resolve(undefined); return; }
        resources.load(path,SpriteFrame,(error,frame) => {
          // Keep goods out of the dynamic atlas: cropped clones share the packed region, and
          // destroying a page freed it, so replays showed the wrong goods and a missing car body.
          if (!error && frame) frame.packable = false;
          settled.set(path,error ? undefined : frame);
          resolve(error ? undefined : frame);
        });
      } catch { settled.set(path,undefined); resolve(undefined); }
    });
    images.set(path,pending);
  }
  return pending;
}

export const AUDIO_NAMES = ['pickup','drop','invalid','rotate','undo','tick','trunk_slam','horn','cheer','mom','pack'] as const;
export type AudioName = typeof AUDIO_NAMES[number];
const audio = new Map<AudioName,Promise<AudioClip | undefined>>();
export function loadAudio(name: AudioName): Promise<AudioClip | undefined> {
  let pending=audio.get(name);
  if (!pending) {
    pending=new Promise(resolve => {
      try {
        const path=`audio/${name}`;
        if (!resources.getInfoWithPath(path,AudioClip)) { resolve(undefined); return; }
        resources.load(path,AudioClip,(error,clip) => resolve(error ? undefined : clip));
      } catch { resolve(undefined); }
    });
    audio.set(name,pending);
  }
  return pending;
}
