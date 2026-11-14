import { act, renderHook } from '@testing-library/react-native';
import { Animated, AppState, type AppStateStatus } from 'react-native';
import * as Speech from 'expo-speech';
import { resetGamePreferencesForTests } from '../src/game/gamePreferences';
import { useBusAppActive, useBusClock, useBusSpeech } from '../src/game/useBusRuntime';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(() => Promise.resolve()) }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(1000);
  jest.clearAllMocks();
  resetGamePreferencesForTests({ effectsVolume: 1 });
  jest.mocked(Speech.speak).mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

const advance = (time: number) => act(() => { jest.advanceTimersByTime(time); });

it('freezes the moving marker with the trip and restarts it for a new segment without a world render loop', () => {
  const progress = new Animated.Value(0);
  const setValue = jest.spyOn(progress, 'setValue');
  const stop = jest.fn();
  const animation = jest.spyOn(Animated, 'timing').mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() });
  const elapsed = jest.fn();
  const hook = renderHook(({ stopId, paused }: { stopId: string; paused: boolean }) => useBusClock(stopId, 20000, paused, elapsed, 5000, progress), { initialProps: { stopId: 'park', paused: false } });
  expect(animation).toHaveBeenLastCalledWith(progress, expect.objectContaining({ duration: 20000, useNativeDriver: true }));
  advance(6000); hook.rerender({ stopId: 'park', paused: true }); advance(60000);
  expect(stop).toHaveBeenCalledTimes(1); expect(elapsed).not.toHaveBeenCalled();
  hook.rerender({ stopId: 'park', paused: false });
  expect(setValue).toHaveBeenLastCalledWith(expect.closeTo(0.3));
  expect(animation).toHaveBeenLastCalledWith(progress, expect.objectContaining({ duration: 14000 }));
  advance(14000); expect(elapsed).toHaveBeenCalledTimes(1); expect(setValue).toHaveBeenLastCalledWith(1);
  hook.rerender({ stopId: 'library', paused: true }); expect(setValue).toHaveBeenLastCalledWith(0);
  hook.unmount();
});

it('fires a leg exactly once and uses the latest callback without restarting on ordinary renders', () => {
  const first = jest.fn(); const latest = jest.fn();
  const hook = renderHook(({ callback }: { callback: () => void }) => useBusClock('leg:201:park', 15000, false, callback), { initialProps: { callback: first } });
  advance(8000);
  hook.rerender({ callback: latest });
  advance(6999);
  expect(first).not.toHaveBeenCalled(); expect(latest).not.toHaveBeenCalled();
  advance(1);
  expect(first).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledTimes(1);
  hook.rerender({ callback: latest }); advance(60000);
  expect(latest).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it('preserves a paused leg and guarantees five seconds after a nearly expired reading pause', () => {
  const elapsed = jest.fn();
  const hook = renderHook(({ paused }: { paused: boolean }) => useBusClock('library', 15000, paused, elapsed), { initialProps: { paused: false } });
  advance(12000); hook.rerender({ paused: true }); advance(90000);
  expect(elapsed).not.toHaveBeenCalled();
  hook.rerender({ paused: false }); advance(4999);
  expect(elapsed).not.toHaveBeenCalled();
  advance(1); expect(elapsed).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it('keeps the greater remaining duration instead of shortening every resumed leg to five seconds', () => {
  const elapsed = jest.fn();
  const hook = renderHook(({ paused }: { paused: boolean }) => useBusClock('park', 15000, paused, elapsed), { initialProps: { paused: false } });
  advance(2000); hook.rerender({ paused: true }); advance(100000);
  hook.rerender({ paused: false }); advance(12999);
  expect(elapsed).not.toHaveBeenCalled(); advance(1); expect(elapsed).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it('does not start until all panels close and the app returns to foreground', () => {
  const elapsed = jest.fn();
  type Pauses = { routeOpen: boolean; phoneOpen: boolean; active: boolean };
  const hook = renderHook(({ routeOpen, phoneOpen, active }: Pauses) =>
    useBusClock('overlays', 12000, routeOpen || phoneOpen || !active, elapsed),
  { initialProps: { routeOpen: true, phoneOpen: true, active: true } });
  advance(40000);
  hook.rerender({ routeOpen: false, phoneOpen: true, active: true }); advance(40000);
  hook.rerender({ routeOpen: false, phoneOpen: false, active: false }); advance(40000);
  expect(elapsed).not.toHaveBeenCalled();
  hook.rerender({ routeOpen: false, phoneOpen: false, active: true }); advance(11999);
  expect(elapsed).not.toHaveBeenCalled(); advance(1); expect(elapsed).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it('cancels the prior segment when the key changes, including a key change while paused', () => {
  const elapsed = jest.fn();
  const hook = renderHook(({ stop, paused }: { stop: string; paused: boolean }) => useBusClock(stop, 15000, paused, () => elapsed(stop)),
    { initialProps: { stop: 'park', paused: false } });
  advance(14000); hook.rerender({ stop: 'library', paused: true }); advance(60000);
  hook.rerender({ stop: 'library', paused: false }); advance(14999);
  expect(elapsed).not.toHaveBeenCalled(); advance(1);
  expect(elapsed).toHaveBeenCalledTimes(1); expect(elapsed).toHaveBeenCalledWith('library');
  hook.unmount();
});

it('cancels pending callbacks on unmount and does not schedule a disabled zero-duration clock', () => {
  const elapsed = jest.fn();
  const hook = renderHook(() => useBusClock('unmount', 12000, false, elapsed));
  advance(11999); hook.unmount(); advance(30000); expect(elapsed).not.toHaveBeenCalled();
  const disabled = renderHook(() => useBusClock('disabled', 0, false, elapsed));
  advance(30000); expect(elapsed).not.toHaveBeenCalled(); disabled.unmount();
});

it('subscribes to app activity and removes its lifecycle listener on unmount', () => {
  let listener: ((state: AppStateStatus) => void) | null = null;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, next) => { listener = next; return { remove }; });
  const hook = renderHook(() => useBusAppActive());
  act(() => listener!('background')); expect(hook.result.current).toBe(false);
  act(() => listener!('inactive')); expect(hook.result.current).toBe(false);
  act(() => listener!('active')); expect(hook.result.current).toBe(true);
  hook.unmount(); expect(remove).toHaveBeenCalledTimes(1);
});

it('keeps Korean speech speaking until the matching native completion arrives', () => {
  const hook = renderHook(() => useBusSpeech(true));
  act(() => hook.result.current.speak('이번 정류장은 중앙공원입니다.'));
  expect(hook.result.current.speaking).toBe(true);
  expect(Speech.speak).toHaveBeenCalledWith('이번 정류장은 중앙공원입니다.', expect.objectContaining({ language: 'ko-KR', rate: 0.9, volume: 1 }));
  const options = jest.mocked(Speech.speak).mock.calls[0][1]!;
  act(() => options.onDone?.()); expect(hook.result.current.speaking).toBe(false);
  hook.unmount();
});

it('ignores completion callbacks from a stopped announcement when a new announcement is playing', () => {
  const hook = renderHook(() => useBusSpeech(true));
  act(() => hook.result.current.speak('중앙공원'));
  const first = jest.mocked(Speech.speak).mock.calls[0][1]!;
  act(() => hook.result.current.speak('하늘도서관'));
  const second = jest.mocked(Speech.speak).mock.calls[1][1]!;
  act(() => first.onStopped?.()); expect(hook.result.current.speaking).toBe(true);
  act(() => first.onDone?.()); expect(hook.result.current.speaking).toBe(true);
  act(() => second.onDone?.()); expect(hook.result.current.speaking).toBe(false);
  hook.unmount();
});

it('allows an explicit replay with automatic speech disabled but respects zero effects volume', () => {
  const hook = renderHook(() => useBusSpeech(false));
  act(() => hook.result.current.speak('자동 방송'));
  expect(Speech.speak).not.toHaveBeenCalled();
  act(() => hook.result.current.speak('다시 듣기', true));
  expect(Speech.speak).toHaveBeenCalledTimes(1);
  act(() => resetGamePreferencesForTests({ effectsVolume: 0 }));
  expect(hook.result.current.speaking).toBe(false);
  act(() => hook.result.current.speak('무음에서는 자막', true));
  expect(Speech.speak).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it('clears a speech engine that never calls back and handles synchronous speech failure', () => {
  const hook = renderHook(() => useBusSpeech(true));
  act(() => hook.result.current.speak('응답이 없는 음성 엔진'));
  advance(21999); expect(hook.result.current.speaking).toBe(true);
  advance(1); expect(hook.result.current.speaking).toBe(false);
  jest.mocked(Speech.speak).mockImplementationOnce(() => { throw new Error('native engine unavailable'); });
  act(() => hook.result.current.speak('자막으로 계속 진행'));
  expect(hook.result.current.speaking).toBe(false);
  hook.unmount();
});
