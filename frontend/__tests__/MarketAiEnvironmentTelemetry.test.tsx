import { act, fireEvent, render } from '@testing-library/react-native';
import { enqueueBehaviorEvents } from '../src/behavior/behaviorEventQueue';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { applyMarketEnvironmentPlan, getMarketEnvironmentContext } from '../src/game/marketEnvironmentPlan';
import { buildMarketScenarioMission } from '../src/game/scenarios';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';

jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => 0), flushBehaviorEventQueue: jest.fn(async () => undefined),
  assertBehaviorEventsAcknowledged: jest.fn(async () => undefined),
}));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

beforeEach(() => jest.clearAllMocks());

it('상세 설정에서 지정한 합성 입력 출처가 원본 행동 로그에도 남는다', async () => {
  const provenance={source:'synthetic' as const,agentModel:'functional-ui-test',personaId:'functional-only'};
  const view=render(<MarketSimulationScreen accessToken="token" mission={buildMarketScenarioMission('S01')}
    initialConfig={{provenance}} onExit={jest.fn()} />);
  try{
    await act(async()=>{await Promise.resolve();});
    const events=jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call=>call[1].map(entry=>entry.event));
    const content=events.find(event=>event.action.eventCode==='SHOP.SESSION_STARTED')!.payload.marketContent as any;
    expect(content.controlSource).toBe('AGENT');
    expect(content.agentContext).toMatchObject({agentModel:provenance.agentModel,personaId:provenance.personaId});
    expect(content.sceneSnapshot.startingConditions.runtimeConfig.provenance).toEqual(provenance);
  }finally{view.unmount();}
});

it.each([false, true])('실제 60칸·시작 위치·충돌맵을 generation과 기록하고 수동 override=%s를 구분한다', async userOverride => {
  const mission = { ...buildMarketScenarioMission('S01'), environmentPlan: {
    shelfOrder: ['drink', 'meal', 'fresh', 'produce', 'household'] as const, rationale: '분류 안내판을 찾아 목록과 비교해요.',
  } };
  const original = createMarketEnvironment({ seed: 'tracked-generation', layoutId: 'aisles' });
  const environment = userOverride ? original : applyMarketEnvironmentPlan(original, mission.environmentPlan);
  const onEnvironmentChange = jest.fn();
  const props = { embedded: true, accessToken: 'token', mission, environment,
    simulation: { contentSource: 'GENERATED' as const, questInstanceId: 'generation-layout' }, onExit: jest.fn(), onEnvironmentChange };
  const view = render(<MarketSimulationScreen {...props} />);
  try {
    await act(async () => { await Promise.resolve(); });
    const events = () => jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call => call[1].map(entry => entry.event));
    const starting = events().find(event => event.action.eventCode === 'SHOP.SESSION_STARTED')!;
    const content = starting.payload.marketContent as any;
    const scene = content.sceneSnapshot;
    expect(scene.questInstanceId).toBe('generation-layout'); expect(scene.seed).toBe(environment.seed);
    expect(scene.mission.environmentPlan).toEqual(mission.environmentPlan);
    expect(scene.products).toHaveLength(60); expect(scene.slots).toHaveLength(60);
    for (const category of ['fresh', 'produce', 'household', 'meal', 'drink']) {
      expect(scene.slots.filter((slot: { stationId: string }) => slot.stationId === category)).toHaveLength(12);
    }
    expect(JSON.parse(scene.startingConditions.geometry)).toEqual(environment);
    expect(scene.startingConditions.player).toEqual(environment.spawn);
    expect(content.movementContext.stations).toEqual(environment.stations);
    expect(scene.environmentPlanApplication).toEqual({
      requestedShelfOrder: mission.environmentPlan.shelfOrder,
      actualShelfOrder: getMarketEnvironmentContext(environment).shelfSlots.map(slot => slot.categoryId), applied: !userOverride,
    });
    view.rerender(<MarketSimulationScreen {...props} environment={JSON.parse(JSON.stringify(environment))} />);
    await act(async () => { await Promise.resolve(); });
    expect(events().filter(event => event.action.eventCode === 'SHOP.SESSION_STARTED')).toHaveLength(1);
    expect(onEnvironmentChange).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});

it('설정 화면에서 계산원만 바꾸면 매대 미선택 정보를 부모 맵에 전달한다', () => {
  const mission = { ...buildMarketScenarioMission('S01'), environmentPlan: {
    shelfOrder: ['drink', 'meal', 'fresh', 'produce', 'household'] as const, rationale: '분류 안내판을 찾아 목록과 비교해요.',
  } };
  const environment = applyMarketEnvironmentPlan(createMarketEnvironment({ seed: 'setup-metadata' }), mission.environmentPlan);
  const onEnvironmentChange = jest.fn();
  const view = render(<MarketSimulationScreen embedded mission={mission} environment={environment} onExit={jest.fn()} onEnvironmentChange={onEnvironmentChange} />);
  try {
    fireEvent.press(view.getByRole('button', { name: '연습 환경 설정' }));
    fireEvent.press(view.getByRole('button', { name: '0명' }));
    fireEvent.press(view.getByRole('button', { name: '설정 적용' }));
    expect(onEnvironmentChange).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ cashierCount: 0,
      shelfOrder: mission.environmentPlan.shelfOrder }) }), expect.objectContaining({ shelfOrderTouched: false,
        lockedSettings: {'/runtimePlan/environment/cashierCount':0} }));
  } finally { view.unmount(); }
});
