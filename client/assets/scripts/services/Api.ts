import { JsonAsset, resources } from 'cc';
import { parseLevel } from '../core/level';
import type { Level } from '../core/types';
import { WebPlatform } from '../platform/WebPlatform';

export class Api {
  constructor(private readonly platform: WebPlatform) {}

  private async load(path: string): Promise<Level> {
    const asset = await new Promise<JsonAsset>((resolve,reject) => {
      resources.load(path,JsonAsset,(error,value) => error ? reject(error) : resolve(value));
    });
    return parseLevel(asset.json);
  }

  async loadChallenge(): Promise<Level> {
    const level = await this.load(`dev-levels/${this.platform.levelFilename()}`);
    if (level.stage !== 2) throw new Error('挑战关数据无效');
    return level;
  }

  async loadMom(): Promise<Level> {
    const level = await this.load('levels/v1/mom');
    if (level.stage !== 3 || level.mode !== 'mom') throw new Error('妈妈模式数据无效');
    return level;
  }
}
