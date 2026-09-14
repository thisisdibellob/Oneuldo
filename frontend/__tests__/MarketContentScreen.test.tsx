import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';
import { MarketShelfScene } from '../src/components/game/MarketShelfScene';
import { buildMarketScenarioMission, marketProducts } from '../src/game/scenarios';
import { getEnabledMarketScenario } from '../src/game/marketContent';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { startSessionAnalysisJob } from '../src/api/behaviorAnalysis';
import { enqueueBehaviorEvents } from '../src/behavior/behaviorEventQueue';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '10000000-0000-4000-8000-000000000001') }));
jest.mock('../src/api/behaviorAnalysis', () => ({ startSessionAnalysisJob: jest.fn(async () => ({ jobId:'job' })) }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({ enqueueBehaviorEvents: jest.fn(async () => undefined), flushBehaviorEventQueue: jest.fn(async () => undefined), assertBehaviorEventsAcknowledged: jest.fn(async () => undefined) }));
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(async () => undefined), useAudioPlayer: () => { const React=jest.requireActual('react'); return React.useRef({pause:jest.fn(),play:jest.fn(),seekTo:jest.fn(async()=>undefined),setPlaybackRate:jest.fn()}).current; }, useAudioPlayerStatus:()=>({isLoaded:true}) }));
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });
async function setup(scenario: 'S01'|'S02', station: 'fresh'|'produce') {
  const mission=buildMarketScenarioMission(scenario);
  const environment=createMarketEnvironment({seed:'merged-content',cashierCount:2});
  const position={current:environment.stations[station]};
  const required=station==='fresh'?['milk','milk-small']:['apple','apple-green'];
  const inventory=[...required,...marketProducts.filter(p=>p.categoryId===station&&!required.includes(p.id)).map(p=>p.id)].slice(0,12);
  let interaction={id:1,station:station as 'fresh'|'produce'|'checkout'};
  const onMissionComplete=jest.fn();
  const element=()=> <MarketSimulationScreen embedded accessToken="test-token" mission={mission} environment={environment}
    initialConfig={{seed:environment.seed,stockPerProduct:5,inventoryProductIds:{[station]:inventory}}}
    playerPositionRef={position} interactionRequest={interaction} onExit={jest.fn()} onMissionComplete={onMissionComplete} />;
  const screen=render(element());
  fireEvent.press(screen.getByText('다음'));fireEvent.press(screen.getByText('장보기 시작'));
  await act(async()=>{jest.advanceTimersByTime(300);await Promise.resolve();});
  const checkout=async()=>{
    fireEvent.press(screen.getAllByRole('button',{name:'진열대 닫기'})[0]);
    await act(async()=>{jest.advanceTimersByTime(300);await Promise.resolve();});
    position.current=environment.stations.checkout;interaction={id:2,station:'checkout'};screen.rerender(element());
    await act(async()=>{jest.advanceTimersByTime(300);await Promise.resolve();});
    fireEvent.press(screen.getByText('구매 확정'));
    await waitFor(()=>expect(startSessionAnalysisJob).toHaveBeenCalledTimes(1));
    await act(async()=>{jest.advanceTimersByTime(300);await Promise.resolve();});
  };
  return {screen,checkout,onMissionComplete};
}

it('새 진열대에서도 규격·재고와 실제 선택을 보존하고 로컬 판정 없이 AI 분석을 접수한다',async()=>{
  const {screen,checkout,onMissionComplete}=await setup('S01','fresh');
  try {
    const shelf=screen.UNSAFE_getByType(MarketShelfScene);
    expect(shelf.props.slots).toHaveLength(12);expect(shelf.props.stock.milk).toBe(5);
    expect(screen.getAllByText('900mL').length).toBeGreaterThan(0);
    for(let i=0;i<8;i++)act(()=>{shelf.props.onDropProduct('milk');});
    expect(screen.UNSAFE_getByType(MarketShelfScene).props.cart.milk).toBe(5);
    await checkout();
    expect(screen.getByText('AI 수행 검토')).toBeTruthy();
    expect(screen.queryByText('장보기에 성공했어요!')).toBeNull();expect(screen.queryByText('이번 구매는 맞지 않았어요')).toBeNull();
    expect(onMissionComplete).not.toHaveBeenCalled();
    const events=jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call=>call[1].map(row=>row.event));
    expect(events.some(e=>e.action.eventCode==='SHOP.QUANTITY_CHANGED')).toBe(true);
    expect(events.some(e=>e.action.eventCode==='SHOP.CHECKOUT_SUBMITTED')).toBe(true);
    const start=events.find(e=>e.action.eventCode==='SHOP.SESSION_STARTED')!;
    expect((start.payload?.marketContent as any).sceneSnapshot.startingConditions.geometry).toContain('shelves');
    const snapshot = (start.payload?.marketContent as any).sceneSnapshot;
    expect(snapshot.products).toHaveLength(60);
    expect(snapshot.seed).toBe('merged-content');
    const preset = getEnabledMarketScenario('S01');
    expect(snapshot.products.map((product: {id: string}) => product.id)).toEqual(expect.arrayContaining([...preset.mandatoryProductIds, ...preset.distractorProductIds]));
  } finally {screen.unmount();}
});

it('S02의 허용 상품인 초록 사과 선택을 새 UI와 행동 로그에 유지한다',async()=>{
  const {screen,checkout}=await setup('S02','produce');
  try {
    act(()=>{screen.UNSAFE_getByType(MarketShelfScene).props.onDropProduct('apple-green');});
    act(()=>{screen.UNSAFE_getByType(MarketShelfScene).props.onDropProduct('apple-green');});
    expect(screen.UNSAFE_getByType(MarketShelfScene).props.cart['apple-green']).toBe(2);
    await checkout();
    const events=jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call=>call[1].map(row=>row.event));
    expect(events.some(e=>e.action.eventCode==='SHOP.QUANTITY_CHANGED'&&e.payload?.itemId==='apple-green')).toBe(true);
    expect(events.some(e=>e.action.eventCode.includes('WRONG'))).toBe(false);
  } finally {screen.unmount();}
});
