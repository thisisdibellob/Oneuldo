import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MarketEnvironmentObjects } from '../src/components/game/MarketInteriorLayer';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { buildMarketScenarioMission } from '../src/game/scenarios';
import type { MarketSimulationScreenProps } from '../src/screens/MarketSimulationScreen';

process.env.EXPO_PUBLIC_API_URL = 'http://first-play-test-server';

jest.mock('../src/screens/MarketSimulationScreen', () => ({
  MarketSimulationScreen: jest.fn(() => {
    const { View } = jest.requireActual('react-native');
    return <View testID="first-auth-market-session" />;
  }),
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
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});

const { GamePrototypeScreen } = require('../src/screens/GamePrototypeScreen') as typeof import('../src/screens/GamePrototypeScreen');
const { MarketSimulationScreen } = require('../src/screens/MarketSimulationScreen') as typeof import('../src/screens/MarketSimulationScreen');
const originalFetch = global.fetch;
const firstPlayBody = { code: 'MARKET_BASELINE_REQUIRED', stage: 'FIRST_PLAY', message: '첫 관찰 과제로 장보기를 시작해 주세요.' };
const errorResponse = (status: number, body: Record<string, unknown>) => ({ ok: false, status, json: async () => body });
function currentProps(): MarketSimulationScreenProps {
  return jest.mocked(MarketSimulationScreen).mock.calls.at(-1)![0];
}
async function enterMarket(view: ReturnType<typeof render>) {
  await waitFor(() => expect(view.getByRole('button', { name: '하늘마트 들어가기' })).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: '하늘마트 들어가기' }));
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => { global.fetch = originalFetch; });

it('인증된 첫 플레이의 명시 응답에서만 고정 S01·STATIC·난이도 2를 현재 지도에 연다', async () => {
  global.fetch = jest.fn().mockResolvedValue(errorResponse(404, firstPlayBody));
  const view = render(<GamePrototypeScreen accessToken="first-account" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    await waitFor(() => expect(view.getByTestId('first-auth-market-session')).toBeTruthy());
    expect(currentProps().mission).toEqual(buildMarketScenarioMission('S01'));
    expect(currentProps().difficulty).toBe(2);
    expect(currentProps().simulation?.contentSource).toBe('STATIC');
    expect(currentProps().mission?.environmentPlan).toBeUndefined();
    expect(currentProps().environment).toEqual(view.UNSAFE_getByType(MarketEnvironmentObjects).props.environment);
    const manual = createMarketEnvironment({ seed: currentProps().environment!.seed, layoutId: 'corner',
      shelfOrder: ['drink', 'meal', 'household', 'produce', 'fresh'] });
    await act(async () => { currentProps().onEnvironmentChange!(manual, { shelfOrderTouched: true }); await Promise.resolve(); });
    await waitFor(() => expect(view.getByTestId('first-auth-market-session')).toBeTruthy());
    expect(currentProps().environment).toEqual(manual);
    expect(currentProps().mission).toEqual(buildMarketScenarioMission('S01'));
    expect(currentProps().simulation?.contentSource).toBe('STATIC');
    expect(JSON.parse(jest.mocked(global.fetch).mock.calls[1][1]!.body as string).environmentContext.preserveShelfOrder).toBe(true);
  } finally { view.unmount(); }
});

it.each([
  [404, {}, '404'],
  [503, {}, '503'],
  [404, { code: 'MARKET_BASELINE_REQUIRED', stage: 'PROFILE' }, '404'],
  [404, { code: 'MARKET_BASELINE_REQUIRED' }, '404'],
  [503, firstPlayBody, '503'],
  [409, { code: 'LATEST_PLAY_PROFILE_PENDING', stage: 'NOT_REQUESTED', message: '분석 상태를 확인해 주세요.' }, '분석 상태를 확인해 주세요.'],
  [503, { code: 'LATEST_PLAY_PROFILE_FAILED', stage: 'FAILED', message: '분석을 완료하지 못했어요.' }, '분석을 완료하지 못했어요.'],
] as Array<[number, Record<string, unknown>, string]>)('HTTP %i / %j는 첫 과제로 대체하지 않는다', async (status, body, message) => {
  global.fetch = jest.fn().mockResolvedValue(errorResponse(status, body));
  const view = render(<GamePrototypeScreen accessToken="existing-account" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    await waitFor(() => expect(view.getByText(new RegExp(message))).toBeTruthy());
    expect(view.queryByTestId('first-auth-market-session')).toBeNull();
    expect(view.getByRole('button', { name: '다시 확인' })).toBeTruthy();
  } finally { view.unmount(); }
});

it('새 AI 응답의 배치가 손상되어도 첫 관찰 과제를 대신 열지 않는다', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({jobId:'broken-plan',status:'READY',result:{ promptVersion: 'market-ai-quest-v18-ai-shelf-plan', quest: buildMarketScenarioMission('S01') }}) });
  const view = render(<GamePrototypeScreen accessToken="invalid-plan-account" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    await waitFor(() => expect(view.getByText(/AI 진열대 추천이 빠져/)).toBeTruthy());
    expect(view.queryByTestId('first-auth-market-session')).toBeNull();
  } finally { view.unmount(); }
});

it('이전 계정의 첫 플레이 응답이 늦게 도착해도 현재 계정의 오류를 덮어쓰지 않는다', async () => {
  let resolve!: (response: ReturnType<typeof errorResponse>) => void;
  global.fetch = jest.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; }))
    .mockResolvedValueOnce(errorResponse(503, {}));
  const view = render(<GamePrototypeScreen accessToken="old-first-account" onExit={jest.fn()} />);
  try {
    await enterMarket(view);
    view.rerender(<GamePrototypeScreen accessToken="current-account" onExit={jest.fn()} />);
    await act(async () => { resolve(errorResponse(404, firstPlayBody)); await Promise.resolve(); });
    await waitFor(() => expect(view.getByText(/생성 실패: 503/)).toBeTruthy());
    expect(view.queryByTestId('first-auth-market-session')).toBeNull();
  } finally { view.unmount(); }
});
