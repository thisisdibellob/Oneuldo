import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { startSessionAnalysisJob } from '../src/api/behaviorAnalysis';
import { enqueueBehaviorEvents } from '../src/behavior/behaviorEventQueue';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { HARD_BASELINE_SCENARIO_ID, pilotScenario } from '../src/replay/pilotScenario';
import { HARD_SHARED_ENVIRONMENT_ID, pilotEnvironment, pilotSessionConfig } from '../src/replay/pilotEnvironment';
import { MarketSimulationScreen, type MarketInteractionRequest } from '../src/screens/MarketSimulationScreen';

jest.mock('../src/api/behaviorAnalysis', () => ({ startSessionAnalysisJob: jest.fn(async () => ({ jobId: 'job' })) }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => undefined), flushBehaviorEventQueue: jest.fn(async () => undefined),
  assertBehaviorEventsAcknowledged: jest.fn(async () => undefined),
}));
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('STATIC hard baseline with an empty basket submits actual AI analysis without a local verdict', async () => {
  const mission = pilotScenario(true, HARD_BASELINE_SCENARIO_ID)!;
  const environment = createMarketEnvironment(pilotEnvironment(true, HARD_SHARED_ENVIRONMENT_ID)!);
  const position = { current: environment.spawn };
  const onMissionComplete = jest.fn();
  let interaction: MarketInteractionRequest | null = null;
  const element = () => <MarketSimulationScreen embedded accessToken="pilot-token" mission={mission}
    environment={environment} initialConfig={pilotSessionConfig(true, HARD_SHARED_ENVIRONMENT_ID)} difficulty={2}
    playerPositionRef={position} interactionRequest={interaction} onExit={jest.fn()} onMissionComplete={onMissionComplete}
    simulation={{ contentSource: 'STATIC', questInstanceId: 'baseline-instance' }} />;
  const view = render(element());
  try {
    expect(view.getByText('즉석밥 210g · 3개입 제품')).toBeTruthy();
    expect(view.queryByText(/총 6/)).toBeNull();
    expect(view.queryByText(/19,400/)).toBeNull();
    fireEvent.press(view.getByText('다음'));
    fireEvent.press(view.getByText('장보기 시작'));
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
    position.current = environment.stations.checkout;
    interaction = { id: 1, station: 'checkout' };
    view.rerender(element());
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
    fireEvent.press(view.getByText('구매 확정'));
    await waitFor(() => expect(startSessionAnalysisJob).toHaveBeenCalledTimes(1));
    expect(view.getByText('AI 수행 검토')).toBeTruthy();
    expect(view.queryByText('장보기에 성공했어요!')).toBeNull();
    expect(view.queryByText('이번 구매는 맞지 않았어요')).toBeNull();
    expect(onMissionComplete).not.toHaveBeenCalled();
    const events = jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call => call[1].map(row => row.event));
    const start = events.find(event => event.action.eventCode === 'SHOP.SESSION_STARTED')!;
    expect(start.task.difficulty).toBe(2);
    expect(start.simulation.contentSource).toBe('STATIC');
    expect(start.simulation.questInstanceId).toBe('baseline-instance');
    expect(events.some(event => event.action.eventCode === 'SHOP.CHECKOUT_SUBMITTED')).toBe(true);
    expect(events.some(event => event.action.eventCode === 'SHOP.PURCHASE_SUCCEEDED')).toBe(false);
  } finally { view.unmount(); }
});
