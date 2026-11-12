import { resolveRoute, type AppRoute } from './route';

export class WebPlatform {
  now(): number { return Date.now(); }

  route(): AppRoute { return resolveRoute(window.location.search); }

  isMomMode(): boolean { return this.route() === 'mom'; }

  isStackMode(): boolean { return this.route() === 'stack'; }

  stackStage(): 1 | 2 {
    return new URLSearchParams(window.location.search).get('stage') === '2' ? 2 : 1;
  }

  hasLevelOverride(): boolean { return new URLSearchParams(window.location.search).has('level'); }

  levelFilename(): string {
    const value = new URLSearchParams(window.location.search).get('level') ?? 'demo';
    if (!/^[a-zA-Z0-9_-]+(?:\.json)?$/.test(value)) throw new Error('关卡文件名无效');
    return value.replace(/\.json$/,'');
  }
}
