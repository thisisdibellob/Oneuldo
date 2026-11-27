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

// 2026-11-27 사용자 결정: AI 분석 전에 목록 비교 결과(성공/아쉬움)를 플레이어에게 보여 준다.
// 이 결과는 화면·개인 기록용이며 행동 로그에 성공 이벤트를 남기지 않고 AI 분석 접수도 그대로다.
test('STATIC hard baseline with an empty basket shows the give-up card, gives no XP and still submits actual AI analysis', async () => {
  const mission = pilotScenario(true, HARD_BASELINE_SCENARIO_ID)!;
  const environment = createMarketEnvironment(pilotEnvironment(true, HARD_SHARED_ENVIRONMENT_ID)!);
  const position = { current: environment.spawn };
  const onMissionComplete = jest.fn();
  const onShoppingFinished = jest.fn();
  let interaction: MarketInteractionRequest | null = null;
  const element = () => <MarketSimulationScreen embedded accessToken="pilot-token" mission={mission}
    environment={environment} initialConfig={pilotSessionConfig(true, HARD_SHARED_ENVIRONMENT_ID)} difficulty={2}
    playerPositionRef={position} interactionRequest={interaction} onExit={jest.fn()} onMissionComplete={onMissionComplete}
    onShoppingFinished={onShoppingFinished}
    simulation={{ contentSource: 'STATIC', questInstanceId: 'baseline-instance' }} />;
  const view = render(element());
  try {
    expect(view.getByText('즉석밥 210g · 3개입 제품')).toBeTruthy();
    expect(view.queryByText(/총 6/)).toBeNull();
    expect(view.queryByText(/19,400/)).toBeNull();
    fireEvent.press(view.getByText('다음'));
    fireEvent.press(view.getByRole('button', {name:'장보기 시작'}));
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
    position.current = environment.stations.checkout;
    interaction = { id: 1, station: 'checkout' };
    view.rerender(element());
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
    fireEvent.press(view.getByText('구매 확정'));
    await waitFor(() => expect(startSessionAnalysisJob).toHaveBeenCalledTimes(1));
    expect(view.getByTestId('market-purchase-result')).toBeTruthy();
    // 빈 장바구니 계산은 화면·개인 기록에서 '장보기 포기'로 보고 경험치·활동 기록을 남기지 않는다(AI 분석 접수는 그대로).
    expect(view.getByText('장보기 포기')).toBeTruthy();
    expect(view.getByText('물건을 하나도 담지 않고 계산해서 포기로 기록했어요.')).toBeTruthy();
    expect(view.getByText('이번 장보기는 경험치가 없어요')).toBeTruthy();
    expect(view.queryByText('장보기 성공!')).toBeNull();
    expect(onShoppingFinished).not.toHaveBeenCalled();
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
