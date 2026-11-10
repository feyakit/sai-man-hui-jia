import { SpriteFrame, resources } from 'cc';

// Resource paths omit extensions. Cocos imports PNG frames as <name>/spriteFrame.
// Missing entries are checked before load so absent optional assets do not log errors.
const images = new Map<string,Promise<SpriteFrame | undefined>>();
export function loadArt(file: string): Promise<SpriteFrame | undefined> {
  const path=`art/${file}/spriteFrame`;
  let pending=images.get(path);
  if (!pending) {
    pending=new Promise(resolve => {
      try {
        if (!resources.getInfoWithPath(path,SpriteFrame)) { resolve(undefined); return; }
        resources.load(path,SpriteFrame,(error,frame) => resolve(error ? undefined : frame));
      } catch { resolve(undefined); }
    });
    images.set(path,pending);
  }
  return pending;
}
