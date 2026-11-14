import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { startSessionAnalysisJob } from '../src/api/behaviorAnalysis';
import { enqueueBehaviorEvents, assertBehaviorEventsAcknowledged } from '../src/behavior/behaviorEventQueue';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { buildMarketScenarioMission } from '../src/game/scenarios';
import type { ReplayUiPort } from '../src/replay/ports';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';

jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: jest.fn(() => `20000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`) };
});
jest.mock('../src/api/behaviorAnalysis', () => ({ startSessionAnalysisJob: jest.fn(async () => ({ jobId: 'job' })) }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => undefined), flushBehaviorEventQueue: jest.fn(async () => undefined),
  assertBehaviorEventsAcknowledged: jest.fn(async () => undefined),
}));
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  }, useAudioPlayerStatus: () => ({ isLoaded: true }),
}));

const epoch = Date.parse('2026-10-10T00:00:00.000Z');
const events = () => jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call => call[1].map(row => row.event));
const codes = () => events().map(event => event.action.eventCode);
const settle = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); await settle(); };

function setup() {
  const mission = { ...buildMarketScenarioMission('S01'), timeLimitSeconds: 180 };
  const environment = createMarketEnvironment({ seed: 'time-limit', cashierCount: 2 });
  const position = { current: { ...environment.spawn } };
  const port: { current: ReplayUiPort | null } = { current: null };
  const onExit = jest.fn(), onOpenAnalysis = jest.fn(), onLockChange = jest.fn();
  const view = render(<MarketSimulationScreen embedded accessToken="test-token" mission={mission} environment={environment}
    playerPositionRef={position} replayUiRef={port} onExit={onExit} onOpenAnalysis={onOpenAnalysis} onLockChange={onLockChange} />);
  const start = async () => {
    fireEvent.press(view.getByRole('button', { name: '다음' }));
    fireEvent.press(view.getByRole('button', { name: '장보기 시작' }));
    await advance(300);
  };
  const checkout = async () => {
    position.current = { ...environment.stations.checkout };
    act(() => port.current!.interact('checkout'));
    await advance(300);
  };
  return { view, port, start, checkout, onExit, onOpenAnalysis, onLockChange };
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(epoch); jest.clearAllMocks(); });

test('general help opens are recorded separately from staff interaction', async () => {
  const { port, start } = setup();
  await start();
  act(() => port.current!.viewHelp());
  await advance(1000);
  const help = events().filter(event => event.action.eventCode === 'SHOP.GENERAL_HELP_OPENED');
  expect(help).toHaveLength(1);
  expect(help[0].action.microActionId).toBe('VIEWHELP');
  expect(help[0].payload?.marketContent).toMatchObject({ action: { type: 'viewHelp' } });
  expect(codes()).not.toContain('SHOP.STAFF_HELP_REQUESTED');
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllTimers(); jest.useRealTimers(); });

test('reading the briefing spends no quest time; expiry is logged once before analysis and freezes input', async () => {
  const game = setup();
  try {
    await advance(360000);
    expect(codes()).not.toContain('SHOP.TIME_LIMIT_STARTED');
    expect(codes()).not.toContain('SHOP.TIME_LIMIT_EXPIRED');
    const expectedStart = Date.now();
    await game.start();
    const started = events().find(event => event.action.eventCode === 'SHOP.TIME_LIMIT_STARTED')!;
    expect(started.payload.timing).toMatchObject({ startedAt: new Date(expectedStart).toISOString(), elapsedMs: 0, timeLimitSeconds: 180 });
    expect(game.view.getByTestId('market-time-limit')).toBeTruthy();
    await advance(180000);
    expect(game.view.getByTestId('market-time-expired-message')).toBeTruthy();
    expect(game.onLockChange).toHaveBeenLastCalledWith(true);
    expect(codes().filter(code => code === 'SHOP.TIME_LIMIT_EXPIRED')).toHaveLength(1);
    expect(codes().filter(code => code === 'SHOP.SESSION_ENDED')).toHaveLength(1);
    expect(codes()).not.toContain('SHOP.CHECKOUT_SUBMITTED');
    const ended = events().find(event => event.action.eventCode === 'SHOP.SESSION_ENDED')!;
    expect(ended.sessionEnd?.reason).toBe('TIME_LIMIT_EXPIRED');
    expect(ended.payload.timing).toMatchObject({ remainingMs: 0, expired: true });
    expect(ended.payload.marketContent).toMatchObject({ cart: {}, missionSnapshot: { timeLimitSeconds: 180 }, objectiveProgress: expect.any(Array) });
    expect(codes().indexOf('SHOP.TIME_LIMIT_EXPIRED')).toBeLessThan(codes().indexOf('SHOP.SESSION_ENDED'));
    expect(startSessionAnalysisJob).toHaveBeenCalledTimes(1);
    expect(jest.mocked(assertBehaviorEventsAcknowledged).mock.invocationCallOrder.at(-1))
      .toBeLessThan(jest.mocked(startSessionAnalysisJob).mock.invocationCallOrder[0]);
    await act(async () => { await game.port.current!.submit(); });
    act(() => game.port.current!.viewHelp());
    expect(game.view.queryByText('이렇게 이용해요')).toBeNull();
    await advance(60000);
    expect(codes().filter(code => code === 'SHOP.TIME_LIMIT_EXPIRED')).toHaveLength(1);
    expect(codes()).not.toContain('SHOP.CHECKOUT_SUBMITTED');
    fireEvent.press(game.view.getByRole('button', { name: '분석 탭에서 확인' }));
    await settle();
    expect(game.onOpenAnalysis).toHaveBeenCalledTimes(1);
  } finally { game.view.unmount(); }
});

test('a failed expiry receipt can be retried without creating another terminal event', async () => {
  const game = setup();
  try {
    jest.mocked(assertBehaviorEventsAcknowledged).mockRejectedValueOnce(new Error('전송이 잠시 끊겼어요.'));
    await game.start();
    await advance(180000);
    expect(startSessionAnalysisJob).not.toHaveBeenCalled();
    expect(game.view.getByText('전송이 잠시 끊겼어요.')).toBeTruthy();
    fireEvent.press(game.view.getByRole('button', { name: '분석 접수 다시 시도' })); await settle();
    expect(startSessionAnalysisJob).toHaveBeenCalledTimes(1);
    expect(codes().filter(code => code === 'SHOP.TIME_LIMIT_EXPIRED')).toHaveLength(1);
    expect(codes().filter(code => code === 'SHOP.SESSION_ENDED')).toHaveLength(1);
    expect(codes()).not.toContain('SHOP.CHECKOUT_SUBMITTED');
  } finally { game.view.unmount(); }
});

test('a submit exactly at the deadline expires even before the next interval has run', async () => {
  const game = setup();
  try {
    await game.start(); await game.checkout();
    jest.setSystemTime(epoch + 180000);
    await act(async () => { await game.port.current!.submit(); });
    await settle();
    expect(codes()).not.toContain('SHOP.CHECKOUT_SUBMITTED');
    expect(events().find(event => event.action.eventCode === 'SHOP.TIME_LIMIT_EXPIRED')?.payload.timing)
      .toMatchObject({ elapsedMs: 180000, expired: true });
  } finally { game.view.unmount(); }
});

test('early purchase freezes actual elapsed time and does not wait for the configured minimum', async () => {
  const game = setup();
  try {
    await game.start(); await game.checkout(); await advance(42000);
    await act(async () => { await game.port.current!.submit(); }); await settle();
    expect(startSessionAnalysisJob).toHaveBeenCalledTimes(1);
    const submitted = events().find(event => event.action.eventCode === 'SHOP.CHECKOUT_SUBMITTED')!;
    const ended = events().find(event => event.action.eventCode === 'SHOP.SESSION_ENDED')!;
    expect(submitted.payload.timing).toMatchObject({ elapsedMs: 42600, remainingMs: 137400, expired: false });
    expect(ended.payload.timing).toEqual(submitted.payload.timing);
    await advance(180000);
    expect(codes()).not.toContain('SHOP.TIME_LIMIT_EXPIRED');
  } finally { game.view.unmount(); }
});

test('foreground catch-up expires suspended timers, and retry creates a new unstarted session', async () => {
  const subscriptions = jest.spyOn(AppState, 'addEventListener');
  const game = setup();
  try {
    await game.start();
    const listener = subscriptions.mock.calls.find(([event]) => event === 'change')![1];
    act(() => listener('background'));
    jest.setSystemTime(epoch + 181000);
    act(() => listener('active')); await settle();
    expect(codes().filter(code => code === 'SHOP.TIME_LIMIT_EXPIRED')).toHaveLength(1);
    const oldSession = events().find(event => event.action.eventCode === 'SHOP.TIME_LIMIT_EXPIRED')!.identity.sessionId;
    fireEvent.press(game.view.getByRole('button', { name: '다시 연습하기' })); await settle();
    expect(game.view.getByTestId('market-time-limit-briefing')).toBeTruthy();
    const nextSession = events().filter(event => event.action.eventCode === 'SHOP.SESSION_STARTED').at(-1)!;
    expect(nextSession.identity.sessionId).not.toBe(oldSession);
    expect(nextSession.payload.timing).toMatchObject({ startedAt: null, elapsedMs: 0, remainingMs: 180000, expired: false });
    await advance(300000);
    expect(codes().filter(code => code === 'SHOP.TIME_LIMIT_EXPIRED')).toHaveLength(1);
    await game.start();
    expect(codes().filter(code => code === 'SHOP.TIME_LIMIT_STARTED')).toHaveLength(2);
    expect(events().filter(event => event.action.eventCode === 'SHOP.TIME_LIMIT_STARTED').at(-1)?.payload.timing)
      .toMatchObject({ elapsedMs: 0, remainingMs: 180000, expired: false });
  } finally { game.view.unmount(); }
});
