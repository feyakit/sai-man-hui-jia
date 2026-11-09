import { JsonAsset, resources } from 'cc';
import { parseLevel } from '../core/level';
import type { Level } from '../core/types';
import { WebPlatform } from '../platform/WebPlatform';

export class Api {
  constructor(private readonly platform: WebPlatform) {}

  async loadChallenge(): Promise<Level> {
    const name = this.platform.levelFilename();
    const asset = await new Promise<JsonAsset>((resolve,reject) => {
      resources.load(`dev-levels/${name}`,JsonAsset,(error,value) => error ? reject(error) : resolve(value));
    });
    const level = parseLevel(asset.json);
    if (level.stage !== 2) throw new Error('挑战关数据无效');
    return level;
  }
}
