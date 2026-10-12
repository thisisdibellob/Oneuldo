import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { getMarketAiQuest } from '../src/api/marketPersonalization';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { getMarketEnvironmentContext } from '../src/game/marketEnvironmentPlan';
import { getMarketRuntimeContext } from '../src/game/marketAdaptivePlan';
import { buildMarketScenarioMission } from '../src/game/scenarios';
import { HARD_BASELINE_SCENARIO_ID, pilotScenario } from '../src/replay/pilotScenario';
import { HARD_SHARED_ENVIRONMENT_ID, pilotEnvironment, pilotSessionConfig } from '../src/replay/pilotEnvironment';
import { MarketSimulationScreen, type MarketSimulationScreenProps } from '../src/screens/MarketSimulationScreen';

jest.mock('../src/screens/MarketSimulationScreen', () => ({
  MarketSimulationScreen: jest.fn(() => {
    const { View } = jest.requireActual('react-native');
    return <View testID="pilot-market-session" />;
  }),
}));
jest.mock('../src/api/marketPersonalization', () => ({
  getMarketAiQuest: jest.fn(), FirstPlayRequiredError: class extends Error {}, MarketQuestReadinessError: class extends Error {},
}));
jest.mock('../src/replay/connection', () => ({ connectMarketReplay: jest.fn(async () => jest.fn()) }));
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

const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const developmentDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
const pilotWindow = { location: { search: '?marketReplay=1' }, addEventListener: jest.fn(), removeEventListener: jest.fn() };
let GamePrototypeScreen: typeof import('../src/screens/GamePrototypeScreen').GamePrototypeScreen;
const query = (baseline = false) => '?marketReplay=1&marketPilotEnvironment=' + HARD_SHARED_ENVIRONMENT_ID
  + (baseline ? '&marketPilotScenario=' + HARD_BASELINE_SCENARIO_ID : '');
const props = () => jest.mocked(MarketSimulationScreen).mock.calls.at(-1)![0];
async function enter(view: ReturnType<typeof render>) {
  await waitFor(() => expect(view.getByRole('button', { name: '하늘마트 들어가기' })).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: '하늘마트 들어가기' }));
  await act(async () => { await Promise.resolve(); });
}
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: pilotWindow });
  GamePrototypeScreen = require('../src/screens/GamePrototypeScreen').GamePrototypeScreen;
});
beforeEach(() => { jest.clearAllMocks(); pilotWindow.location.search = query(true); });
afterAll(() => {
  if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
  if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
  else Reflect.deleteProperty(globalThis, 'window');
  if (developmentDescriptor) Object.defineProperty(globalThis, '__DEV__', developmentDescriptor);
});

test('hard baseline is STATIC at difficulty 2; AI round applies its plan and the post probe resets', async () => {
  const generation = {
    generationId: 'pilot-ai-generation', analysisId: 'analysis', profileId: 'profile', source: 'AI' as const,
    model: 'existing-model', latencyMs: 1, personalizationMode: 'AI_PROFILE' as const,
    promptVersion: 'market-ai-quest-v19', adaptationSummary: '목록과 분류를 확인해요.', reasonCodes: [],
    quest: { ...buildMarketScenarioMission('S01'), scenarioId: 'S01',
      catalogVersion: pilotScenario(true, HARD_BASELINE_SCENARIO_ID)!.catalogVersion!,
      scenarioVersion: pilotScenario(true, HARD_BASELINE_SCENARIO_ID)!.scenarioVersion!, difficulty: 2 as const,
      environmentPlan: { shelfOrder: ['drink', 'meal', 'fresh', 'produce', 'household'] as const, rationale: '분류 안내판을 찾아요.' } },
  };
  jest.mocked(getMarketAiQuest).mockResolvedValue(generation);
  const view = render(<GamePrototypeScreen accessToken="pilot-account" onExit={jest.fn()} />);
  try {
    await enter(view);
    const before = props();
    expect(before.mission).toEqual(pilotScenario(true, HARD_BASELINE_SCENARIO_ID));
    expect(before.difficulty).toBe(2);
    expect(before.simulation?.contentSource).toBe('STATIC');
    expect(before.environment).toEqual(createMarketEnvironment(pilotEnvironment(true, HARD_SHARED_ENVIRONMENT_ID)!));
    expect(before.initialConfig).toEqual(pilotSessionConfig(true, HARD_SHARED_ENVIRONMENT_ID));
    expect(getMarketAiQuest).not.toHaveBeenCalled();

    act(() => { before.onExit(); });
    pilotWindow.location.search = query();
    await enter(view);
    const practice = props();
    expect(jest.mocked(getMarketAiQuest).mock.calls[0][1]).toEqual({
      ...getMarketEnvironmentContext(before.environment!, false),
      runtimeContext: getMarketRuntimeContext(before.environment!, {}),
    });
    expect(practice.environment?.config.shelfOrder).toEqual(generation.quest.environmentPlan.shelfOrder);
    expect(practice.environment?.employees).toEqual(before.environment?.employees);
    expect(practice.environment?.customers).toEqual(before.environment?.customers);
    expect(practice.environment?.checkouts).toEqual(before.environment?.checkouts);
    expect(practice.initialConfig).toEqual(before.initialConfig);
    expect(practice.simulation).toEqual({ contentSource: 'GENERATED', questInstanceId: 'pilot-ai-generation' });

    act(() => { practice.onExit(); });
    pilotWindow.location.search = query(true);
    await enter(view);
    const after = props();
    expect(after.environment).toEqual(before.environment);
    expect(after.mission).toEqual(before.mission);
    expect(after.initialConfig).toEqual(before.initialConfig);
    expect(after.difficulty).toBe(2);
    expect(after.simulation?.contentSource).toBe('STATIC');
    expect(getMarketAiQuest).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

test('production ignores both experiment selectors even when replay was enabled in development', async () => {
  Object.defineProperty(globalThis, '__DEV__', { configurable: true, writable: true, value: false });
  const view = render(<GamePrototypeScreen onExit={jest.fn()} />);
  try {
    await enter(view);
    expect(props().mission?.scenarioId).toMatch(/^S0[12]$/);
    expect(props().mission?.id).not.toBe('market-pilot-hard-baseline-v1');
    expect(props().initialConfig).toBeUndefined();
    expect(props().environment?.seed).not.toBe(HARD_SHARED_ENVIRONMENT_ID);
  } finally {
    view.unmount();
    if (developmentDescriptor) Object.defineProperty(globalThis, '__DEV__', developmentDescriptor);
  }
});
