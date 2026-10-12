import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { getMarketAiQuest } from '../src/api/marketPersonalization';
import { MarketEnvironmentObjects } from '../src/components/game/MarketInteriorLayer';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { getMarketEnvironmentContext } from '../src/game/marketEnvironmentPlan';
import { buildMarketScenarioMission, type MarketCategoryId } from '../src/game/scenarios';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';
import { MarketSimulationScreen, type MarketSimulationScreenProps } from '../src/screens/MarketSimulationScreen';

const mockMissionMount = jest.fn();
jest.mock('../src/screens/MarketSimulationScreen', () => ({
  MarketSimulationScreen: jest.fn((props: MarketSimulationScreenProps) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    React.useEffect(() => { mockMissionMount(props); }, []);
    return <View testID="resolved-market-session" />;
  }),
}));
jest.mock('../src/api/marketPersonalization', () => ({
  getMarketAiQuest: jest.fn(),
  FirstPlayRequiredError: class extends Error {},
  MarketQuestReadinessError: class extends Error {},
}));
jest.mock('../src/game/prototypeWorld', () => {
  const actual = jest.requireActual('../src/game/prototypeWorld');
  return { ...actual, INITIAL_PLAYER_POINT: actual.MARKET_ENTRANCE_POINT, MARKET_RETURN_POINT: actual.MARKET_ENTRANCE_POINT };
});
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
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});

function deferred<T>() {
  let resolve!: (result: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function generation(id: string, shelfOrder: readonly MarketCategoryId[] = ['drink', 'meal', 'fresh', 'produce', 'household']) {
  const mission = buildMarketScenarioMission('S01');
  return {
    generationId: id, analysisId: 'analysis', profileId: 'profile', source: 'AI' as const,
    model: 'model', latencyMs: 1, personalizationMode: 'AI_PROFILE' as const,
    promptVersion: 'market-ai-quest-v18-ai-shelf-plan', adaptationSummary: '매대 분류를 찾는 연습이에요.', reasonCodes: [],
    quest: {
      ...mission, scenarioId: mission.scenarioId!, catalogVersion: mission.catalogVersion!, scenarioVersion: mission.scenarioVersion!, difficulty: 2 as const,
      environmentPlan: { shelfOrder, rationale: '목록을 보며 분류 안내판을 찾아 이동하는 연습이에요.' },
    },
  };
}
function currentProps() {
  return jest.mocked(MarketSimulationScreen).mock.calls.at(-1)![0];
}
async function enterMarket(view: ReturnType<typeof render>) {
  await waitFor(() => expect(view.getByRole('button', { name: '하늘마트 들어가기' })).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: '하늘마트 들어가기' }));
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => { jest.clearAllMocks(); jest.mocked(getMarketAiQuest).mockReset(); });

it('AI 응답의 배치를 맵·시작 위치에 확정한 뒤 동일 세션을 한 번 연다', async () => {
  const request = deferred<Awaited<ReturnType<typeof getMarketAiQuest>>>();
  jest.mocked(getMarketAiQuest).mockReturnValue(request.promise);
  const view = render(<GamePrototypeScreen accessToken="account-a" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    expect(view.queryByTestId('resolved-market-session')).toBeNull();
    const incoming = generation('generation-a');
    await act(async () => { request.resolve(incoming); await request.promise; });
    const props = currentProps();
    expect(props.environment?.config.shelfOrder).toEqual(incoming.quest.environmentPlan!.shelfOrder);
    expect(props.mission?.environmentPlan).toEqual(incoming.quest.environmentPlan);
    expect(view.UNSAFE_getByType(MarketEnvironmentObjects).props.environment).toEqual(props.environment);
    expect(props.playerPositionRef?.current).toEqual(props.environment?.spawn);
    expect(props.simulation?.questInstanceId).toBe('generation-a');
    expect(mockMissionMount).toHaveBeenCalledTimes(1);
    await act(async () => { await Promise.resolve(); });
    expect(mockMissionMount).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

it('입장을 취소하고 다시 들어오면 이전 응답이 새 요청의 배치나 미션을 덮어쓰지 않는다', async () => {
  const first = deferred<Awaited<ReturnType<typeof getMarketAiQuest>>>();
  const second = deferred<Awaited<ReturnType<typeof getMarketAiQuest>>>();
  jest.mocked(getMarketAiQuest).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const view = render(<GamePrototypeScreen accessToken="account-a" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    fireEvent.press(view.getByRole('button', { name: '마을로 돌아가기' }));
    await enterMarket(view);
    await act(async () => { first.resolve(generation('stale')); await first.promise; });
    expect(view.queryByTestId('resolved-market-session')).toBeNull();
    await act(async () => { second.resolve(generation('current')); await second.promise; });
    expect(currentProps().simulation?.questInstanceId).toBe('current');
    expect(mockMissionMount).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

it('계정 변경 뒤 도착한 이전 계정 응답은 적용하지 않는다', async () => {
  const first = deferred<Awaited<ReturnType<typeof getMarketAiQuest>>>();
  const second = deferred<Awaited<ReturnType<typeof getMarketAiQuest>>>();
  jest.mocked(getMarketAiQuest).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const view = render(<GamePrototypeScreen accessToken="account-a" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    view.rerender(<GamePrototypeScreen accessToken="account-b" onExit={jest.fn()} />);
    await act(async () => { first.resolve(generation('other-account')); await first.promise; });
    expect(view.queryByTestId('resolved-market-session')).toBeNull();
    await act(async () => { second.resolve(generation('account-b')); await second.promise; });
    expect(currentProps().simulation?.questInstanceId).toBe('account-b');
    expect(mockMissionMount).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

it('AI 생성이 실패하면 임의 과제를 실행하지 않고 재요청 안내를 보여준다', async () => {
  jest.mocked(getMarketAiQuest).mockRejectedValue(new Error('진열대 추천이 올바르지 않아요.'));
  const view = render(<GamePrototypeScreen accessToken="account-a" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    await waitFor(() => expect(view.getByText('진열대 추천이 올바르지 않아요.')).toBeTruthy());
    expect(view.queryByTestId('resolved-market-session')).toBeNull();
    expect(view.getByRole('button', { name: '다시 확인' })).toBeTruthy();
  } finally { view.unmount(); }
});

it('직접 설정한 매장과 순서는 재입장에도 유지하며 실제 맵을 다음 생성 요청에 보낸다', async () => {
  const order = ['fresh', 'produce', 'household', 'drink', 'meal'] as const;
  const revised = generation('manual-map-quest', order);
  revised.quest.briefing = ['변경한 매장에서 분류 안내판을 확인해요.'];
  const revisionRequest = deferred<Awaited<ReturnType<typeof getMarketAiQuest>>>();
  jest.mocked(getMarketAiQuest).mockResolvedValueOnce(generation('before-setup'))
    .mockReturnValueOnce(revisionRequest.promise).mockResolvedValueOnce(generation('after-reentry', order));
  const view = render(<GamePrototypeScreen accessToken="account-a" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    const initial = currentProps();
    const manual = createMarketEnvironment({ seed: initial.environment!.seed, layoutId: 'corner',
      shelfOrder: order, entranceConstruction: true });
    await act(async () => { initial.onEnvironmentChange!(manual, { shelfOrderTouched: true }); await Promise.resolve(); });
    expect(view.queryByTestId('resolved-market-session')).toBeNull();
    expect(jest.mocked(getMarketAiQuest).mock.calls[1][1]).toEqual(expect.objectContaining(getMarketEnvironmentContext(manual, true)));
    expect(view.UNSAFE_getByType(MarketEnvironmentObjects).props.environment).toEqual(manual);
    await act(async () => { revisionRequest.resolve(revised); await revisionRequest.promise; });
    expect(currentProps().mission?.briefing).toEqual(revised.quest.briefing);
    expect(currentProps().simulation?.questInstanceId).toBe('manual-map-quest');
    expect(currentProps().mission?.environmentPlan).toEqual(revised.quest.environmentPlan);
    act(() => { currentProps().onExit(); });
    await enterMarket(view);
    const next = currentProps();
    expect(next.environment?.config.layoutId).toBe('corner');
    expect(next.environment?.config.shelfOrder).toEqual(manual.config.shelfOrder);
    expect(next.environment?.config.entranceConstruction).toBe(true);
    expect(jest.mocked(getMarketAiQuest).mock.calls[2][1]).toEqual(expect.objectContaining(getMarketEnvironmentContext(next.environment!, true)));
    expect(next.mission?.environmentPlan).toEqual(generation('after-reentry', order).quest.environmentPlan);
    expect(mockMissionMount).toHaveBeenCalledTimes(3);
  } finally { view.unmount(); }
});

it('계산원만 바꾼 설정은 AI 매대 순서를 수동으로 잠그지 않고 다음 추천을 적용한다', async () => {
  const nextGeneration = { ...generation('next-layout'), quest: { ...generation('next-layout').quest,
    environmentPlan: { shelfOrder: ['produce', 'drink', 'household', 'fresh', 'meal'] as const, rationale: '다른 분류 안내판을 찾아 목록과 비교해요.' },
  } };
  jest.mocked(getMarketAiQuest).mockResolvedValueOnce(generation('first-layout')).mockResolvedValueOnce(nextGeneration);
  const view = render(<GamePrototypeScreen accessToken="account-a" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    const initial = currentProps();
    const cashierChange = createMarketEnvironment({ ...initial.environment!.config, cashierCount: 0 });
    act(() => { initial.onEnvironmentChange!(cashierChange, { shelfOrderTouched: false }); });
    expect(getMarketAiQuest).toHaveBeenCalledTimes(1);
    act(() => { currentProps().onExit(); });
    await enterMarket(view);
    const next = currentProps();
    expect(next.environment?.config.cashierCount).toBe(0);
    expect(next.environment?.config.shelfOrder).toEqual(nextGeneration.quest.environmentPlan.shelfOrder);
    expect(next.environment?.config.shelfOrder).not.toEqual(initial.mission?.environmentPlan?.shelfOrder);
    expect(mockMissionMount).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); }
});

it('매장 형태만 바꾸면 새 실제 슬롯으로 안내를 요청하고 AI의 새 매대 순서를 적용한다', async () => {
  const revisionRequest = deferred<Awaited<ReturnType<typeof getMarketAiQuest>>>();
  const revised = generation('new-preset', ['produce', 'drink', 'household', 'fresh', 'meal']);
  jest.mocked(getMarketAiQuest).mockResolvedValueOnce(generation('old-preset')).mockReturnValueOnce(revisionRequest.promise);
  const view = render(<GamePrototypeScreen accessToken="account-a" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    const initial = currentProps();
    const manual = createMarketEnvironment({ ...initial.environment!.config, layoutId: 'corner' });
    await act(async () => { initial.onEnvironmentChange!(manual, { shelfOrderTouched: false }); await Promise.resolve(); });
    expect(view.queryByTestId('resolved-market-session')).toBeNull();
    expect(jest.mocked(getMarketAiQuest).mock.calls[1][1]).toEqual(expect.objectContaining(getMarketEnvironmentContext(manual, false)));
    await act(async () => { revisionRequest.resolve(revised); await revisionRequest.promise; });
    expect(currentProps().environment?.config.layoutId).toBe('corner');
    expect(currentProps().environment?.config.shelfOrder).toEqual(revised.quest.environmentPlan.shelfOrder);
    expect(currentProps().simulation?.questInstanceId).toBe('new-preset');
  } finally { view.unmount(); }
});
