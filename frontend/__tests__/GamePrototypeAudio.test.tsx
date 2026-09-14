import { act, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useAudioPlayer } from 'expo-audio';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => {
  const player = {
    loop: false,
    pause: jest.fn(),
    play: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
    setPlaybackRate: jest.fn(),
    volume: 1,
  };
  return {
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    useAudioPlayer: jest.fn(() => player),
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
    // Read the real preview query before importing the screen's mute setting.
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