import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { resetGamePreferencesForTests, updateGamePreferences } from '../src/game/gamePreferences';
import { DIALOGUE_CLEAR_VOLUME } from '../src/game/dialogueFeedback';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => {
  const makePlayer = () => ({
    loop: false,
    pause: jest.fn(),
    play: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
    setPlaybackRate: jest.fn(),
    volume: 1,
  });
  return {
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    useAudioPlayer: jest.fn(() => { const React = jest.requireActual('react'); return React.useRef(makePlayer()).current; }),
    useAudioPlayerStatus: () => ({ isLoaded: true }),
  };
});
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

beforeEach(() => { jest.clearAllMocks(); resetGamePreferencesForTests(); });

it('does not load or play BGM or dialogue audio when opened with muteAudio=1', async () => {
  const previousPlatform = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search: '?muteAudio=1' },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  });

  try {
    // Read the real preview query when rendering the screen.
    const { GamePrototypeScreen } = require('../src/screens/GamePrototypeScreen');
    const view = render(<GamePrototypeScreen onExit={jest.fn()} />);
    await act(async () => { await Promise.resolve(); });

    const calls = jest.mocked(useAudioPlayer).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(4);
    // Null is Expo Audio's no-source path: there is nothing to download/decode.
    expect(calls.every(([source]) => source === null)).toBe(true);
    for (const result of jest.mocked(useAudioPlayer).mock.results) {
      expect(result.value.play).not.toHaveBeenCalled();
    }
    view.unmount();
  } finally {
    if (previousPlatform) Object.defineProperty(Platform, 'OS', previousPlatform);
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
it('changes BGM volume immediately, preserves dialogue ducking, and resumes only when unmuted', async () => {
  const { GamePrototypeScreen } = require('../src/screens/GamePrototypeScreen');
  const view = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  const background = jest.mocked(useAudioPlayer).mock.results[0].value;
  expect(background.loop).toBe(true);
  expect(background.volume).toBe(0.5);
  expect(background.play).toHaveBeenCalled();
  act(() => updateGamePreferences({ musicVolume: 0.5 }));
  expect(background.volume).toBe(0.25);
  fireEvent(view.getByLabelText('이동 조이스틱'), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
  fireEvent.press(view.getByRole('button', { name: '민수와 대화 또는 의뢰 선택하기' }));
  expect(background.volume).toBe(0.125);
  background.play.mockClear();
  background.pause.mockClear();
  act(() => updateGamePreferences({ musicVolume: 0 }));
  expect(background.volume).toBe(0);
  expect(background.pause).toHaveBeenCalled();
  expect(background.play).not.toHaveBeenCalled();
  act(() => updateGamePreferences({ effectsVolume: 0.25 }));
  expect(background.play).not.toHaveBeenCalled();
  act(() => updateGamePreferences({ musicVolume: 0.75 }));
  expect(background.volume).toBe(0.1875);
  expect(background.play).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('scales the quiz chime and cancels its pending seek and later notes without replaying on unmute', async () => {
  jest.useFakeTimers();
  try {
    updateGamePreferences({ effectsVolume: 0.5 });
    const { GamePrototypeScreen } = require('../src/screens/GamePrototypeScreen');
    const view = render(<GamePrototypeScreen onExit={jest.fn()} />);
    const wait = async (ms = 400) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };
    await wait(0);
    const voices = jest.mocked(useAudioPlayer).mock.results.slice(1, 4).map(result => result.value);
    fireEvent(view.getByLabelText('이동 조이스틱'), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
    const finishLine = async () => {
      fireEvent.press(view.getByRole('button', { name: '대화 계속하기' }));
      await wait();
      fireEvent.press(view.getByRole('button', { name: '대화 계속하기' }));
    };
    const openChoices = async () => {
      fireEvent.press(view.getByRole('button', { name: '민수와 대화 또는 의뢰 선택하기' }));
      await finishLine();
      fireEvent.press(view.getByRole('button', { name: '대화 계속하기' }));
    };
    await openChoices();
    fireEvent.press(view.getByRole('button', { name: '퀘스트 받기' }));
    fireEvent.press(view.getByLabelText('민수의 의뢰 받기'));
    fireEvent.press(view.getByLabelText('안내 확인'));
    await wait();
    await openChoices();
    fireEvent.press(view.getByRole('button', { name: '퀘스트 진행하기' }));
    await finishLine();
    await finishLine();
    fireEvent.press(view.getByRole('button', { name: '대화 계속하기' }));
    fireEvent.press(view.getByRole('radio', { name: '조금 피곤한 하루였어' }));
    fireEvent.press(view.getByRole('button', { name: '대화 계속하기' }));
    await wait();
    fireEvent.press(view.getByRole('button', { name: '대화 계속하기' }));
    await finishLine();
    await finishLine();
    await finishLine();
    await wait(210);
    let resolveSeek: (() => void) | undefined;
    voices.forEach(player => { player.play.mockClear(); player.pause.mockClear(); player.seekTo.mockClear();
      player.seekTo.mockImplementation(() => new Promise<void>(resolve => { resolveSeek = resolve; })); });
    fireEvent.press(view.getByText('초록불인지 확인해요'));
    expect(view.getByText('퀴즈를 마쳤어요!')).toBeTruthy();
    await wait(0);
    expect(resolveSeek).toBeDefined();
    expect(voices[0].volume).toBe(DIALOGUE_CLEAR_VOLUME * 0.5);
    act(() => updateGamePreferences({ effectsVolume: 0 }));
    voices.forEach(player => { expect(player.pause).toHaveBeenCalled(); expect(player.volume).toBe(0); });
    act(() => updateGamePreferences({ effectsVolume: 1 }));
    await act(async () => { resolveSeek?.(); await Promise.resolve(); });
    await wait(300);
    voices.forEach(player => expect(player.play).not.toHaveBeenCalled());
    expect(voices.reduce((sum, player) => sum + player.seekTo.mock.calls.length, 0)).toBe(1);
    view.unmount();
  } finally { jest.useRealTimers(); }
});
