import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import {
  createGamePreferencesStore, DEFAULT_GAME_PREFERENCES, GAME_PREFERENCES_STORAGE_KEY,
  getGamePreferences, resetGamePreferencesForTests, updateGamePreferences, useGamePreferences,
} from '../src/game/gamePreferences';

beforeEach(() => resetGamePreferencesForTests());

it('normalizes volumes and colors without accepting invalid saved values', () => {
  const store = createGamePreferencesStore(() => null);
  expect(store.getSnapshot()).toEqual(DEFAULT_GAME_PREFERENCES);
  store.update({ musicVolume: -1, effectsVolume: 2, wallpaperColor: '#abcdef' });
  expect(store.getSnapshot()).toEqual({ ...DEFAULT_GAME_PREFERENCES, musicVolume: 0, effectsVolume: 1, wallpaperColor: '#ABCDEF', runMode: 'distance' });
  const snapshot = store.getSnapshot();
  store.update({ musicVolume: NaN, effectsVolume: Infinity, wallpaperColor: 'red' });
  expect(store.getSnapshot()).toBe(snapshot);
  expect(Object.isFrozen(snapshot)).toBe(true);
});

it('persists updates and reloads the same preferences from browser storage', () => {
  const values = new Map<string, string>();
  const storage = { getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => { values.set(key, value); }) };
  const store = createGamePreferencesStore(() => storage);
  store.update({ musicVolume: 0.25, effectsVolume: 0, wallpaperColor: '#E8F0F8', runMode: 'toggle', marketInteriorTheme: 'cozy' });
  expect(storage.setItem).toHaveBeenCalledWith(GAME_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ version: 1, preferences: store.getSnapshot() }));
  const reloaded = createGamePreferencesStore(() => storage);
  expect(reloaded.getSnapshot()).toEqual(store.getSnapshot());
  expect(reloaded.getSnapshot()).toBe(reloaded.getSnapshot());
});

it.each(['{broken', JSON.stringify({ version: 2, preferences: { musicVolume: 0 } }),
  JSON.stringify({ version: 1, preferences: { musicVolume: 'loud', effectsVolume: null, wallpaperColor: 'url(image)' } })])(
  'opens with defaults for unsupported or malformed storage: %s', raw => {
    const store = createGamePreferencesStore(() => ({ getItem: () => raw, setItem: jest.fn() }));
    expect(store.getSnapshot()).toEqual(DEFAULT_GAME_PREFERENCES);
  },
);

it('retains changes in memory when storage reads and writes throw', () => {
  const store = createGamePreferencesStore(() => ({ getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('full'); } }));
  expect(store.getSnapshot()).toEqual(DEFAULT_GAME_PREFERENCES);
  expect(() => store.update({ musicVolume: 0.5 })).not.toThrow();
  expect(store.getSnapshot().musicVolume).toBe(0.5);
  const unavailable = createGamePreferencesStore(() => { throw new Error('unavailable'); });
  expect(() => unavailable.update({ effectsVolume: 0 })).not.toThrow();
  expect(unavailable.getSnapshot().effectsVolume).toBe(0);
});

it('uses localStorage only on web and falls back to memory on native', () => {
  const oldPlatform = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = { getItem: jest.fn(() => JSON.stringify({ version: 1, preferences: { musicVolume: 0.25 } })), setItem: jest.fn() };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const native = createGamePreferencesStore();
    native.update({ effectsVolume: 0.5 });
    expect(native.getSnapshot()).toEqual({ ...DEFAULT_GAME_PREFERENCES, effectsVolume: 0.5 });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const web = createGamePreferencesStore();
    expect(web.getSnapshot().musicVolume).toBe(0.25);
    web.update({ musicVolume: 0 });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  } finally {
    if (oldPlatform) Object.defineProperty(Platform, 'OS', oldPlatform);
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

it('shares immediate updates across mounted game and phone hooks and preserves unrelated settings', () => {
  const game = renderHook(useGamePreferences);
  const phone = renderHook(useGamePreferences);
  act(() => phone.result.current.updatePreferences({ musicVolume: 0.25 }));
  expect(game.result.current.preferences.musicVolume).toBe(0.25);
  act(() => updateGamePreferences({ effectsVolume: 0, wallpaperColor: '#E8F0F8' }));
  expect(game.result.current.preferences).toBe(phone.result.current.preferences);
  expect(getGamePreferences()).toEqual({ ...DEFAULT_GAME_PREFERENCES, musicVolume: 0.25, effectsVolume: 0, wallpaperColor: '#E8F0F8', runMode: 'distance' });
  const snapshot = game.result.current.preferences;
  act(() => updateGamePreferences({ musicVolume: 0.25 }));
  expect(game.result.current.preferences).toBe(snapshot);
  game.unmount();
  phone.unmount();
});

it('opens old preferences with the original interior and ignores unsupported themes', () => {
  const store = createGamePreferencesStore(() => ({ getItem: () => JSON.stringify({ version: 1, preferences: { musicVolume: 0.5 } }), setItem: jest.fn() }));
  expect(store.getSnapshot().marketInteriorTheme).toBe('classic');
  store.update({ marketInteriorTheme: 'cozy' });
  const before = store.getSnapshot();
  store.update({ marketInteriorTheme: 'unknown' as never });
  expect(store.getSnapshot()).toBe(before);
  expect(store.getSnapshot().musicVolume).toBe(0.5);
});
