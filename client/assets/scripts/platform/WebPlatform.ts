export class WebPlatform {
  now(): number { return Date.now(); }

  isMomMode(): boolean { return new URLSearchParams(window.location.search).get('mode') === 'mom'; }

  hasLevelOverride(): boolean { return new URLSearchParams(window.location.search).has('level'); }

  levelFilename(): string {
    const value = new URLSearchParams(window.location.search).get('level') ?? 'demo';
    if (!/^[a-zA-Z0-9_-]+(?:\.json)?$/.test(value)) throw new Error('关卡文件名无效');
    return value.replace(/\.json$/,'');
  }
}
