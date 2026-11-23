import { act, renderHook } from '@testing-library/react-native';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { buildMarketTrajectory, marketRoutePointAt, type MarketTrajectory } from '../src/game/marketTrajectory';
import { useMarketRoutePlayback } from '../src/game/useMarketRoutePlayback';

const at = (s: number) => new Date(1000 * s).toISOString();
const route = buildMarketTrajectory([
  { type: 'training_started', timestamp: at(0), payload: { point: { x: 0, y: 0 } } },
  { type: 'player_moved', timestamp: at(4), payload: { point: { x: 40, y: 0 } } },
  { type: 'player_moved', timestamp: at(8), payload: { point: { x: 40, y: 0 } } },
  { type: 'session_finished', timestamp: at(10), payload: {} },
].map((e, sequence) => ({ ...e, sequence })), { x: 0, y: 0 });

beforeEach(() => { jest.useFakeTimers(); jest.replaceProperty(Platform, 'OS', 'web'); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

test('continuous playback visits intermediate positions, pauses precisely and resumes instead of jumping to time markers', () => {
  const { result, unmount } = renderHook(() => useMarketRoutePlayback(route));
  act(() => { result.current.toggle(); });
  act(() => { jest.advanceTimersByTime(250); });
  const first = result.current.elapsed!;
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(1);
  expect(marketRoutePointAt(route, first)!.x).toBeGreaterThan(0);
  expect(marketRoutePointAt(route, first)!.x).toBeLessThan(10);
  act(() => { result.current.pause(); });
  const paused = result.current.elapsed!;
  act(() => { jest.advanceTimersByTime(1000); });
  expect(result.current.elapsed).toBe(paused);
  act(() => { result.current.toggle(); });
  act(() => { jest.advanceTimersByTime(250); });
  expect(result.current.elapsed).toBeGreaterThan(paused);
  act(() => { result.current.seek(6); });
  expect(marketRoutePointAt(route, result.current.elapsed!)!.x).toBe(40);
  act(() => { result.current.toggle(); });
  act(() => { jest.advanceTimersByTime(2500); });
  expect(result.current.playing).toBe(false);
  expect(result.current.elapsed).toBe(10);
  act(() => { result.current.seek(null); });
  expect(result.current.elapsed).toBeNull();
  unmount();
});

test('backgrounding pauses playback and replacing the trajectory resets to its complete path', () => {
  let stateListener: (state: AppStateStatus) => void = () => {};
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    stateListener = listener; return { remove };
  });
  const { result, rerender, unmount } = renderHook<ReturnType<typeof useMarketRoutePlayback>, { trajectory: MarketTrajectory }>(
    ({ trajectory }) => useMarketRoutePlayback(trajectory), { initialProps: { trajectory: route } });
  act(() => { result.current.toggle(); });
  act(() => { jest.advanceTimersByTime(200); });
  act(() => { stateListener('background'); });
  expect(result.current.playing).toBe(false);
  const position = result.current.elapsed;
  act(() => { jest.advanceTimersByTime(1000); });
  expect(result.current.elapsed).toBe(position);
  rerender({ trajectory: { ...route, durationSeconds: 20 } });
  expect(result.current.elapsed).toBeNull();
  act(() => { result.current.toggle(); });
  act(() => { jest.advanceTimersByTime(200); });
  rerender({ trajectory: { ...route, durationSeconds: 12 } });
  expect(result.current.playing).toBe(false);
  expect(result.current.elapsed).toBeNull();
  unmount();
  expect(remove).toHaveBeenCalled();
});
