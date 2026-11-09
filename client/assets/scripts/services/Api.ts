import { JsonAsset, resources } from 'cc';
import { SHAPES } from '../core/shapes';
import type { Level } from '../core/types';
import { WebPlatform } from '../platform/WebPlatform';

export class Api {
  constructor(private readonly platform: WebPlatform) {}

  async loadChallenge(): Promise<Level> {
    const name = this.platform.levelFilename();
    const asset = await new Promise<JsonAsset>((resolve,reject) => {
      resources.load(`dev-levels/${name}`,JsonAsset,(error,value) => error ? reject(error) : resolve(value));
    });
    const level = asset.json as Level;
    if (!level || level.stage !== 2 || !Number.isInteger(level.width) || !Number.isInteger(level.height) ||
      level.width < 1 || level.width > 11 || level.height < 1 || level.height > 11 ||
      !Number.isInteger(level.timeLimitSec) || level.timeLimitSec < 1 ||
      !Array.isArray(level.blocked) || !Array.isArray(level.pieces) || !level.pieces.length ||
      level.pieces.some(piece => !piece || !Object.hasOwn(SHAPES,piece.shape) ||
        !Number.isInteger(piece.initialRotation) || piece.initialRotation < 0 || piece.initialRotation > 3)) {
      throw new Error('关卡数据无效');
    }
    return level;
  }
}
