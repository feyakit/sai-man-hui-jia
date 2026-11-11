export interface GameSettingsData {
  sound: boolean;
  vibration: boolean;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const GAME_SETTINGS_KEY = 'smhj.game-settings.v1';

export function defaultGameSettings(): GameSettingsData {
  return {sound:true,vibration:true};
}

export function parseGameSettings(raw: string | null | undefined): GameSettingsData {
  const settings=defaultGameSettings();
  if (!raw) return settings;
  try {
    const value=JSON.parse(raw) as Partial<GameSettingsData> | null;
    if (typeof value?.sound === 'boolean') settings.sound=value.sound;
    if (typeof value?.vibration === 'boolean') settings.vibration=value.vibration;
  } catch { /* Corrupt or stale preference data falls back to the defaults. */ }
  return settings;
}

export function loadGameSettings(storage: SettingsStorage | undefined): GameSettingsData {
  if (!storage) return defaultGameSettings();
  try { return parseGameSettings(storage.getItem(GAME_SETTINGS_KEY)); }
  catch { return defaultGameSettings(); }
}

export function saveGameSettings(settings: GameSettingsData, storage: SettingsStorage | undefined): void {
  if (!storage) return;
  try { storage.setItem(GAME_SETTINGS_KEY,JSON.stringify({sound:settings.sound,vibration:settings.vibration})); }
  catch { /* Private mode or a blocked storage API still leaves the in-memory setting usable. */ }
}

export function browserSettingsStorage(): SettingsStorage | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    return localStorage;
  } catch { return undefined; }
}
