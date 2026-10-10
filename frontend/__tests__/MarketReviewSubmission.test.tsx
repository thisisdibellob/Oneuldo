import { act, fireEvent, render } from '@testing-library/react-native';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { buildMarketScenarioMission } from '../src/game/scenarios';
import type { ReplayUiPort } from '../src/replay/ports';
import * as queue from '../src/behavior/behaviorEventQueue';
import { startSessionAnalysisJob } from '../src/api/behaviorAnalysis';

jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: jest.fn(() => `10000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`) };
});
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => undefined),
  flushBehaviorEventQueue: jest.fn(async () => undefined),
  assertBehaviorEventsAcknowledged: jest.fn(async () => undefined),
}));
jest.mock('../src/api/behaviorAnalysis', () => ({ startSessionAnalysisJob: jest.fn() }));

const events = () => jest.mocked(queue.enqueueBehaviorEvents).mock.calls.flatMap(call => call[1].map(entry => entry.event));
const job = (sessionId: string) => ({ id: 'job-1', sessionId, datasetId: 'dataset-1', status: 'QUEUED' as const,
  stage: 'QUEUED', completed: 0, total: 0, waitUntil: null, analysisId: null, errorCode: null, createdAt: '', updatedAt: '' });

async function setup() {
  const environment = createMarketEnvironment({ seed: 'review-submission', cashierCount: 2 });
  const replayUiRef: { current: ReplayUiPort | null } = { current: null };
  const position = { current: { ...environment.spawn } };
  const screen = render(<MarketSimulationScreen embedded accessToken="test-token"
    environment={environment} mission={buildMarketScenarioMission('S01')} playerPositionRef={position}
    replayUiRef={replayUiRef} onExit={jest.fn()} />);
  while (replayUiRef.current!.read().briefing) {
    await act(async () => { replayUiRef.current!.advanceBriefing(); });
  }
  await act(async () => { jest.advanceTimersByTime(300); });
  position.current = { ...environment.stations.checkout };
  await act(async () => { replayUiRef.current!.interact('checkout'); });
  expect(replayUiRef.current!.read().phase).toBe('checkout');
  return { screen, replayUiRef };
}

beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers();
  jest.mocked(queue.assertBehaviorEventsAcknowledged).mockResolvedValue(undefined);
  jest.mocked(startSessionAnalysisJob).mockImplementation(async (_token, sessionId) => job(sessionId));
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('empty-basket confirmation writes and acknowledges the ending before requesting analysis', async () => {
  const { screen, replayUiRef } = await setup();
  const order: string[] = [];
  jest.mocked(queue.assertBehaviorEventsAcknowledged).mockImplementation(async (_token, _session, sequence) => {
    const end = events().at(-1)!;
    expect(end.action.eventCode).toBe('SHOP.SESSION_ENDED');
    expect(end.sessionEnd?.reason).toBe('FLOW_FINISHED');
    expect(sequence).toBe(end.metadata.eventSequence);
    order.push('receipt');
  });
  jest.mocked(startSessionAnalysisJob).mockImplementation(async (_token, sessionId) => {
    expect(order).toEqual(['receipt']);
    order.push('analysis');
    return job(sessionId);
  });
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '구매 확정' })); });
  expect(order).toEqual(['receipt', 'analysis']);
  expect(replayUiRef.current!.read().reviewAccepted).toBe(true);
  expect(replayUiRef.current!.read().cart).toEqual({});
  expect(events().filter(event => event.action.eventCode === 'SHOP.CHECKOUT_SUBMITTED')).toHaveLength(1);
  await act(async () => { await replayUiRef.current!.leave(); });
  expect(events().filter(event => event.action.eventCode === 'SHOP.SESSION_ENDED')).toHaveLength(1);
  screen.unmount();
});

test('analysis failure offers a retry without duplicating submission or session-end logs', async () => {
  const { screen, replayUiRef } = await setup();
  jest.mocked(startSessionAnalysisJob).mockRejectedValueOnce(new Error('temporary analysis failure'));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '구매 확정' })); });
  expect(replayUiRef.current!.read().reviewAccepted).toBe(false);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '분석 접수 다시 시도' })); });
  expect(replayUiRef.current!.read().reviewAccepted).toBe(true);
  expect(startSessionAnalysisJob).toHaveBeenCalledTimes(2);
  expect(jest.mocked(startSessionAnalysisJob).mock.calls[0]).toEqual(jest.mocked(startSessionAnalysisJob).mock.calls[1]);
  expect(events().filter(event => event.action.eventCode === 'SHOP.CHECKOUT_SUBMITTED')).toHaveLength(1);
  expect(events().filter(event => event.action.eventCode === 'SHOP.SESSION_ENDED')).toHaveLength(1);
  await act(async () => { await replayUiRef.current!.submit(); });
  expect(startSessionAnalysisJob).toHaveBeenCalledTimes(2);
  screen.unmount();
});

test('missing receipt prevents analysis and can be retried with the same complete log sequence', async () => {
  const { screen, replayUiRef } = await setup();
  jest.mocked(queue.assertBehaviorEventsAcknowledged).mockRejectedValueOnce(new Error('missing receipt'));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '구매 확정' })); });
  expect(startSessionAnalysisJob).not.toHaveBeenCalled();
  expect(replayUiRef.current!.read().reviewAccepted).toBe(false);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '분석 접수 다시 시도' })); });
  expect(startSessionAnalysisJob).toHaveBeenCalledTimes(1);
  expect(events().filter(event => event.action.eventCode === 'SHOP.SESSION_ENDED')).toHaveLength(1);
  screen.unmount();
});

test('system completion hook checks the actual basket and marks only its following events', async () => {
  const { screen, replayUiRef } = await setup();
  const metadata = { reason: 'action-limit' as const, afterDecisions: 100 as const, actionLimit: 100 as const,
    firstStepId: 'step-0102', checkoutId: 'checkout' as const, cartAtStart: {} };
  expect(() => replayUiRef.current!.beginSystemCompletion!({ ...metadata, cartAtStart: { milk: 1 } })).toThrow('actual app basket');
  replayUiRef.current!.beginSystemCompletion!(metadata);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '구매 확정' })); });
  expect(events().filter(event => event.action.eventCode === 'SHOP.CHECKOUT_ENTERED').every(event => !event.validity?.assistantIntervention)).toBe(true);
  const submitted = events().find(event => event.action.eventCode === 'SHOP.CHECKOUT_SUBMITTED')!;
  expect(submitted.validity?.assistantIntervention).toBe(true);
  expect((submitted.payload.marketContent as any).replaySystemCompletion).toEqual(metadata);
  screen.unmount();
});

test('reapplying the same setup starts a new measurement session without charging preparation time to briefing', async () => {
  jest.setSystemTime(10000);
  const environment = createMarketEnvironment({ seed: 'reapply-unchanged-quest', cashierCount: 2 });
  const replayUiRef: { current: ReplayUiPort | null } = { current: null };
  const screen = render(<MarketSimulationScreen embedded accessToken="test-token"
    environment={environment} mission={buildMarketScenarioMission('S01')} replayUiRef={replayUiRef}
    onExit={jest.fn()} />);
  const preparationSession = replayUiRef.current!.sessionId();
  const preparedSnapshot = replayUiRef.current!.snapshot();
  const resetTime = 10000 + 20 * 60 * 1000;
  jest.setSystemTime(resetTime); // Time spent generating a trace, before any actor input.
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '연습 환경 설정' })); });
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '설정 적용' })); });
  const measurementSession = replayUiRef.current!.sessionId();
  expect(measurementSession).not.toBe(preparationSession);
  expect(replayUiRef.current!.snapshot()).toEqual(preparedSnapshot);
  expect(replayUiRef.current!.read()).toMatchObject({ briefing: true, briefingStep: 0, cart: {} });
  jest.setSystemTime(resetTime + 750);
  await act(async () => { replayUiRef.current!.advanceBriefing(); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  const measured = events().filter(event => event.identity.sessionId === measurementSession);
  const started = measured.find(event => event.action.eventCode === 'SHOP.SESSION_STARTED')!;
  const advanced = measured.find(event => event.action.eventCode === 'SHOP.BRIEFING_ADVANCED')!;
  expect(Date.parse(started.metadata.occurredAt)).toBe(resetTime);
  expect(advanced.payload.durationMs).toBe(750);
  expect(advanced.action.startLatencyMs).toBe(750);
  expect(advanced.presentation?.foregroundDurationMs).toBe(750);
  expect(measured.filter(event => event.action.eventCode === 'SHOP.SESSION_STARTED')).toHaveLength(1);
  screen.unmount();
});
