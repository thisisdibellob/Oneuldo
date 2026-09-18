import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { resetGamePreferencesForTests, updateGamePreferences } from '../src/game/gamePreferences';
import { useAudioPlayer } from 'expo-audio';
import { useDialogueAudio } from '../src/components/game/useDialogueAudio';
import { DIALOGUE_TONE_MIN_GAP, DIALOGUE_TONE_VOLUME } from '../src/game/dialogueFeedback';

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: jest.fn(() => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  }),
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(1000); jest.clearAllMocks(); resetGamePreferencesForTests(); });
afterEach(() => { jest.useRealTimers(); });

it('uses soft voices at the configured volume, ignores punctuation, and limits repeated character sounds', async () => {
  const hook = renderHook(() => useDialogueAudio({ active: true, ready: true, turnKey: 'first' }));
  await act(async () => {
    hook.result.current.playCharacter('가');
    await Promise.resolve();
  });
  const players = hook.result.current.voices.map(voice => voice.player);
  const plays = () => players.reduce((sum, player) => sum + jest.mocked(player.play).mock.calls.length, 0);
  expect(plays()).toBe(1);
  expect(players.find(player => jest.mocked(player.play).mock.calls.length)?.volume).toBe(DIALOGUE_TONE_VOLUME);
  await act(async () => {
    hook.result.current.playCharacter('나');
    jest.advanceTimersByTime(DIALOGUE_TONE_MIN_GAP);
    hook.result.current.playCharacter(' ');
    hook.result.current.playCharacter('!');
    await Promise.resolve();
  });
  expect(plays()).toBe(1);
  await act(async () => { hook.result.current.playCharacter('다'); await Promise.resolve(); });
  expect(plays()).toBe(2);
  hook.unmount();
});

it('cancels pending playback on skip, a new line, inactivity and unmount', async () => {
  const hook = renderHook<ReturnType<typeof useDialogueAudio>, { active: boolean; turnKey: string }>(({ active, turnKey }) => useDialogueAudio({ active, ready: true, turnKey }),
    { initialProps: { active: true, turnKey: 'first' } });
  const players = hook.result.current.voices.map(voice => voice.player);
  let resolveSeek: (() => void) | undefined;
  players.forEach(player => jest.mocked(player.seekTo).mockImplementation(() => new Promise<void>(resolve => { resolveSeek = resolve; })));
  const expectNoPlayback = () => players.forEach(player => expect(player.play).not.toHaveBeenCalled());
  await act(async () => {
    hook.result.current.playCharacter('가');
    hook.result.current.stop();
    resolveSeek?.();
    await Promise.resolve();
  });
  expectNoPlayback();
  act(() => hook.result.current.playCharacter('나'));
  hook.rerender({ active: true, turnKey: 'second' });
  await act(async () => { resolveSeek?.(); await Promise.resolve(); });
  expectNoPlayback();
  act(() => hook.result.current.playCharacter('다'));
  hook.rerender({ active: false, turnKey: 'second' });
  await act(async () => { resolveSeek?.(); hook.result.current.playCharacter('라'); await Promise.resolve(); });
  expectNoPlayback();
  hook.rerender({ active: true, turnKey: 'third' });
  act(() => hook.result.current.playCharacter('마'));
  hook.unmount();
  await act(async () => { resolveSeek?.(); await Promise.resolve(); });
  expectNoPlayback();
  players.forEach(player => expect(player.pause).toHaveBeenCalled());
});

it('does not play before audio readiness and gives silent previews null sources', async () => {
  const waiting = renderHook(() => useDialogueAudio({ active: true, ready: false }));
  await act(async () => { waiting.result.current.playCharacter('가'); await Promise.resolve(); });
  waiting.result.current.voices.forEach(({ player }) => expect(player.play).not.toHaveBeenCalled());
  waiting.unmount();
  jest.mocked(useAudioPlayer).mockClear();
  const oldPlatform = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { search: '?muteAudio=1' } } });
  try {
    const quiet = renderHook(() => useDialogueAudio({ active: true, ready: true }));
    expect(jest.mocked(useAudioPlayer).mock.calls.map(([source]) => source)).toEqual([null, null, null]);
    await act(async () => { quiet.result.current.playCharacter('가'); await Promise.resolve(); });
    quiet.result.current.voices.forEach(({ player }) => expect(player.play).not.toHaveBeenCalled());
    quiet.unmount();
  } finally {
    if (oldPlatform) Object.defineProperty(Platform, 'OS', oldPlatform);
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
it('applies effect volume immediately and cancels pending tones when muted, even after unmuting', async () => {
  updateGamePreferences({ effectsVolume: 0.5 });
  const hook = renderHook(() => useDialogueAudio({ active: true, ready: true, turnKey: 'first' }));
  const players = hook.result.current.voices.map(voice => voice.player);
  await act(async () => { hook.result.current.playCharacter('가'); await Promise.resolve(); });
  const first = players.find(player => jest.mocked(player.play).mock.calls.length)!;
  expect(first.volume).toBe(DIALOGUE_TONE_VOLUME * 0.5);
  act(() => updateGamePreferences({ effectsVolume: 0.25 }));
  players.forEach(player => expect(player.volume).toBe(DIALOGUE_TONE_VOLUME * 0.25));
  let resolveSeek: (() => void) | undefined;
  players.forEach(player => { jest.mocked(player.play).mockClear();
    jest.mocked(player.pause).mockClear();
    jest.mocked(player.seekTo).mockImplementation(() => new Promise<void>(resolve => { resolveSeek = resolve; })); });
  act(() => { jest.advanceTimersByTime(DIALOGUE_TONE_MIN_GAP); hook.result.current.playCharacter('나'); });
  expect(resolveSeek).toBeDefined();
  act(() => updateGamePreferences({ effectsVolume: 0 }));
  players.forEach(player => { expect(player.pause).toHaveBeenCalled(); expect(player.volume).toBe(0); });
  act(() => hook.result.current.playCharacter('다'));
  act(() => updateGamePreferences({ effectsVolume: 1 }));
  await act(async () => { resolveSeek?.(); await Promise.resolve(); });
  players.forEach(player => expect(player.play).not.toHaveBeenCalled());
  await act(async () => { hook.result.current.playCharacter('라'); resolveSeek?.(); await Promise.resolve(); });
  expect(players.reduce((sum, player) => sum + jest.mocked(player.play).mock.calls.length, 0)).toBe(1);
  hook.unmount();
});
