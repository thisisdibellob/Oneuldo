import { act, render } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';
import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import { resetGamePreferencesForTests } from '../src/game/gamePreferences';
import { RUN_SPEED_MULTIPLIER } from '../src/game/movementControls';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});

it('WASD walks, held Shift runs immediately in either key order, and release/blur clear the modifier', async () => {
  resetGamePreferencesForTests();
  const originalOS = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Map<string, Set<(event: KeyboardEvent) => void>>();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { search: '?muteAudio=1' },
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    removeEventListener: (name: string, listener: (event: KeyboardEvent) => void) => listeners.get(name)?.delete(listener),
  } });
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0, clock = 1000;
  const raf = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id; });
  const cancel = jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(frame => { if (frame != null) frames.delete(frame); });
  const view = render(<GamePrototypeScreen onExit={jest.fn()} />);
  const send = (name: string, code: string, shiftKey = false, tagName = 'DIV') => act(() => {
    listeners.get(name)?.forEach(listener => listener({ code, shiftKey, target: { tagName }, preventDefault: jest.fn() } as unknown as KeyboardEvent));
  });
  const step = () => act(() => {
    clock += 16;
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(clock));
  });
  const x = () => {
    const style = StyleSheet.flatten(view.getByTestId('village-world-player').props.style);
    const value = style.transform.find((transform: { translateX?: unknown }) => transform.translateX !== undefined).translateX;
    return typeof value === 'number' ? value : value.__getValue();
  };
  const motion = () => view.UNSAFE_getByType(DirectionalAvatar).props.motion;
  try {
    await act(async () => { await Promise.resolve(); });
    const start = x();
    send('keydown', 'KeyD'); step(); step();
    const walkStep = x() - start;
    expect(walkStep).toBeGreaterThan(0);
    expect(motion()).toBe('walk');

    send('keydown', 'ShiftLeft', true);
    const beforeRun = x(); step();
    expect(x() - beforeRun).toBeCloseTo(walkStep * RUN_SPEED_MULTIPLIER);
    expect(motion()).toBe('sprint');

    send('keyup', 'ShiftLeft');
    const beforeWalk = x(); step();
    expect(x() - beforeWalk).toBeCloseTo(walkStep);
    expect(motion()).toBe('walk');
    send('keyup', 'KeyD'); step();
    expect(motion()).toBe('idle');

    send('keydown', 'ShiftRight', true);
    send('keydown', 'KeyD', true); step(); step();
    expect(motion()).toBe('sprint');
    send('blur', '');
    const blurred = x(); step(); step();
    expect(x()).toBe(blurred);
    expect(motion()).toBe('idle');
    send('keydown', 'KeyD'); step(); step();
    expect(motion()).toBe('walk');
    send('keyup', 'KeyD'); step();

    const beforeTyping = x();
    send('keydown', 'ShiftLeft', true, 'INPUT');
    send('keydown', 'KeyD', true, 'INPUT'); step(); step();
    expect(x()).toBe(beforeTyping);
  } finally {
    view.unmount(); raf.mockRestore(); cancel.mockRestore();
    if (originalOS) Object.defineProperty(Platform, 'OS', originalOS);
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}, 20000);
