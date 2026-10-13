import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import type { RunMode } from './movementControls';
import { isMarketInteriorTheme, type MarketInteriorThemeId } from './marketInteriorThemes';

export type GamePreferences = {
  musicVolume: number;
  effectsVolume: number;
  wallpaperColor: string;
  runMode: RunMode;
  marketInteriorTheme: MarketInteriorThemeId;
};
export const DEFAULT_GAME_PREFERENCES: Readonly<GamePreferences> = Object.freeze({
  musicVolume: 1,
  effectsVolume: 1,
  wallpaperColor: '#F2F0E5',
  runMode: 'distance',
  marketInteriorTheme: 'classic',
});
export const GAME_PREFERENCES_STORAGE_KEY = 'oneuldo.game-preferences.v1';
export type GamePreferencesStorage = Pick<Storage, 'getItem' | 'setItem'>;

function normalize(patch: unknown, previous: Readonly<GamePreferences>): Readonly<GamePreferences> {
  const data = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch as Partial<GamePreferences> : {};
  const volume = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value)) : fallback;
  const wallpaperColor = typeof data.wallpaperColor === 'string' && /^#[0-9a-f]{6}$/i.test(data.wallpaperColor)
    ? data.wallpaperColor.toUpperCase() : previous.wallpaperColor;
  return Object.freeze({ musicVolume: volume(data.musicVolume, previous.musicVolume),
    effectsVolume: volume(data.effectsVolume, previous.effectsVolume), wallpaperColor,
    runMode: data.runMode === 'distance' || data.runMode === 'toggle' ? data.runMode : previous.runMode,
    marketInteriorTheme: isMarketInteriorTheme(data.marketInteriorTheme) ? data.marketInteriorTheme : previous.marketInteriorTheme });
}
function browserStorage(): GamePreferencesStorage | null {
  if (Platform.OS !== 'web') return null;
  try { return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage; }
  catch { return null; }
}

/** A single in-memory snapshot remains usable when native storage or browser persistence is unavailable. */
export function createGamePreferencesStore(storageProvider: () => GamePreferencesStorage | null = browserStorage) {
  let initialized = false;
  let current = DEFAULT_GAME_PREFERENCES;
  const listeners = new Set<() => void>();
  const notify = () => [...listeners].forEach(listener => listener());
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    try {
      const raw = storageProvider()?.getItem(GAME_PREFERENCES_STORAGE_KEY);
      if (!raw || raw.length > 4096) return;
      const stored: unknown = JSON.parse(raw);
      if (stored && typeof stored === 'object' && 'version' in stored && stored.version === 1 && 'preferences' in stored) {
        current = normalize(stored.preferences, DEFAULT_GAME_PREFERENCES);
      }
    } catch { /* Preferences must never block opening the game. */ }
  };
  const getSnapshot = () => { initialize(); return current; };
  const update = (patch: Partial<GamePreferences>) => {
    initialize();
    const next = normalize(patch, current);
    if (next.musicVolume === current.musicVolume && next.effectsVolume === current.effectsVolume && next.wallpaperColor === current.wallpaperColor && next.runMode === current.runMode && next.marketInteriorTheme === current.marketInteriorTheme) return current;
    current = next;
    try { storageProvider()?.setItem(GAME_PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, preferences: current })); }
    catch { /* Retain the new in-memory values even if saving is denied or full. */ }
    notify();
    return current;
  };
  return {
    getSnapshot, update,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    resetForTests(patch: Partial<GamePreferences> = {}) {
      initialized = true;
      current = normalize(patch, DEFAULT_GAME_PREFERENCES);
      notify();
    },
  };
}

const gamePreferences = createGamePreferencesStore();
export const getGamePreferences = gamePreferences.getSnapshot;
export const updateGamePreferences = gamePreferences.update;
export const resetGamePreferencesForTests = gamePreferences.resetForTests;
export function useGamePreferences() {
  const preferences = useSyncExternalStore(gamePreferences.subscribe, getGamePreferences, () => DEFAULT_GAME_PREFERENCES);
  return { preferences, updatePreferences: updateGamePreferences };
}
