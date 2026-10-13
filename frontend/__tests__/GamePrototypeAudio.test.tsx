import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { resetGamePreferencesForTests, updateGamePreferences } from '../src/game/gamePreferences';
import { DIALOGUE_CLEAR_VOLUME } from '../src/game/dialogueFeedback';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => {
  const listeners = new Map<object, Set<(status: { isLoaded: boolean; currentTime?: number }) => void>>();
  const makePlayer = () => ({
    isLoaded: true,
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
    useAudioPlayerStatus: (player: object) => {
      const React = jest.requireActual('react');
      const [status, setStatus] = React.useState({ isLoaded: true });
      React.useEffect(() => {
        let callbacks = listeners.get(player);
        if (!callbacks) { callbacks = new Set(); listeners.set(player, callbacks); }
        callbacks.add(setStatus);
        return () => callbacks.delete(setStatus);
      }, [player]);
      return status;
    },
    __emitStatus: (player: object, status: { isLoaded: boolean; currentTime?: number }) => {
      listeners.get(player)?.forEach(callback => callback(status));
    },
  };
});

const emitAudioStatus = (player: object, status: { isLoaded: boolean; currentTime?: number }) => {
  require('expo-audio').__emitStatus(player, status);
};

it.each([1, 0.5, 0])('waits for the real downloaded player and applies initial music preference %s before playback', async (musicVolume) => {
  resetGamePreferencesForTests({ musicVolume });
  // Expo web's status snapshot says true while its empty player is still unloaded.
  const pendingBackground = {
    isLoaded: false, loop: false, volume: 1,
    pause: jest.fn(), play: jest.fn(),
  };
  jest.mocked(useAudioPlayer).mockImplementationOnce(() => {
    const React = jest.requireActual('react');
    return React.useRef(pendingBackground).current;
  });
  const onExit = jest.fn();
  const view = render(<GamePrototypeScreen onExit={onExit} />);
  await act(async () => { await Promise.resolve(); });
  expect(pendingBackground.play).not.toHaveBeenCalled();

  // downloadFirst replaces the HTMLAudioElement, resetting its volume to 1.
  pendingBackground.volume = 1;
  pendingBackground.isLoaded = true;
  pendingBackground.play.mockImplementation(() => {
    expect(pendingBackground.volume).toBe(0.375 * musicVolume);
    expect(pendingBackground.loop).toBe(true);
  });
  // onloadeddata sends another status object with isLoaded still true.
  act(() => emitAudioStatus(pendingBackground, { isLoaded: true }));
  expect(pendingBackground.volume).toBe(0.375 * musicVolume);
  expect(pendingBackground.play).toHaveBeenCalledTimes(musicVolume === 0 ? 0 : 1);
  view.unmount();
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

it.each([undefined, 'library'] as const)('keeps 20 periodic music position updates out of the %s world render', async (previewLocation) => {
  const view = render(<GamePrototypeScreen onExit={jest.fn()} previewLocation={previewLocation} />);
  await act(async () => { await Promise.resolve(); });
  const background = jest.mocked(useAudioPlayer).mock.results[0].value;
  expect(background.play).toHaveBeenCalled();
  // This hook runs in GamePrototypeScreen on every parent render, including
  // while its library/bus scene is mounted. It must not run for BGM progress.
  const worldAudioHookCalls = jest.mocked(useAudioPlayer).mock.calls.length;
  const plays = background.play.mock.calls.length;
  for (let tick = 1; tick <= 20; tick += 1) {
    act(() => emitAudioStatus(background, { isLoaded: true, currentTime: tick * 0.5 }));
  }
  expect(jest.mocked(useAudioPlayer)).toHaveBeenCalledTimes(worldAudioHookCalls);
  expect(background.play).toHaveBeenCalledTimes(plays);
  expect(background.volume).toBe(0.375);
  view.unmount();
});

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
it('applies 75% BGM gain, preserves immediate slider changes and dialogue ducking, and resumes only when unmuted', async () => {
  const view = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  const background = jest.mocked(useAudioPlayer).mock.results[0].value;
  expect(background.loop).toBe(true);
  expect(background.volume).toBe(0.375);
  expect(background.play).toHaveBeenCalled();
  act(() => updateGamePreferences({ musicVolume: 0.5 }));
  expect(background.volume).toBe(0.1875);
  fireEvent(view.getByLabelText('이동 조이스틱'), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
  fireEvent.press(view.getByRole('button', { name: '민수와 대화 또는 의뢰 선택하기' }));
  expect(background.volume).toBe(0.09375);
  background.play.mockClear();
  background.pause.mockClear();
  act(() => updateGamePreferences({ musicVolume: 0 }));
  expect(background.volume).toBe(0);
  expect(background.pause).toHaveBeenCalled();
  expect(background.play).not.toHaveBeenCalled();
  act(() => updateGamePreferences({ effectsVolume: 0.25 }));
  expect(background.play).not.toHaveBeenCalled();
  act(() => updateGamePreferences({ musicVolume: 0.75 }));
  expect(background.volume).toBe(0.140625);
  expect(background.play).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('scales the quiz chime and cancels its pending seek and later notes without replaying on unmute', async () => {
  jest.useFakeTimers();
  try {
    updateGamePreferences({ effectsVolume: 0.5 });
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
