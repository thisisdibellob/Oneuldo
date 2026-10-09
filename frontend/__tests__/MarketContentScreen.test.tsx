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

it('추천 안내가 규격을 생략해도 브리핑과 HUD에서 규격과 예산을 읽을 수 있다', async () => {
  const mission = { ...buildMarketScenarioMission('S01'), scenarioId: 'CUSTOM', budget: 7000,
    objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'water', quantity: 1 }],
    briefing: ['우유와 생수를 사세요.'] };
  const screen = render(<MarketSimulationScreen mission={mission} onExit={jest.fn()} />);
  try {
    expect(screen.getByText('흰 우유 900mL')).toBeTruthy();
    expect(screen.getByText('생수 500mL')).toBeTruthy();
    expect(screen.getByText('예산 7,000원')).toBeTruthy();
    fireEvent.press(screen.getByText('장보기 시작'));
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
    expect(screen.getByText('흰 우유 900mL')).toBeTruthy();
    expect(screen.getByText('생수 500mL')).toBeTruthy();
    expect(screen.getByText('예산 7,000원')).toBeTruthy();
    expect(startSessionAnalysisJob).not.toHaveBeenCalled();
  } finally { screen.unmount(); }
});
async function setup(scenario: 'S01'|'S02', station: 'fresh'|'produce', override?: ReturnType<typeof buildMarketScenarioMission>) {
  const mission=override ?? buildMarketScenarioMission(scenario);
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
    expect(snapshot.questInstanceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
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


it('AI가 작성한 여러 단계 안내와 계산대 안내를 생략하지 않는다', async () => {
  const mission = { ...buildMarketScenarioMission('S01'), briefing: ['P01: 물건 이름을 먼저 읽어요.', 'P02: 목록과 수량을 비교해요.', 'P03: 장바구니를 확인해요.'], checkoutDialogue: ['C01: 담은 물건을 하나씩 살펴봐요.', 'C02: 준비되면 구매를 확정해요.'] };
  const env = createMarketEnvironment({ seed: 'ai-instructions', cashierCount: 2, kioskLane: 'none' });
  const screen = render(<MarketSimulationScreen mission={mission} environment={env} playerPositionRef={{ current: env.stations.checkout }} interactionRequest={{id:1,station:'checkout'}} onExit={jest.fn()} />);
  try {
    for (const line of mission.briefing.slice(0, 2)) {
      expect(screen.getByText(line)).toBeTruthy();
      expect(screen.queryByText('장보기 시작')).toBeNull();
      fireEvent.press(screen.getByText('다음'));
    }
    expect(screen.getByText(mission.briefing[2])).toBeTruthy();
    fireEvent.press(screen.getByText('장보기 시작'));
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
    for (const line of mission.checkoutDialogue) expect(screen.getByText(line)).toBeTruthy();
  } finally { screen.unmount(); }
});


it('1품목 과제에서 안내한 기존 상품 제거와 규격 교체를 실제 조작·제출 로그에 보존한다', async () => {
  const base=buildMarketScenarioMission('S01');
  const mission={...base,scenarioId:'CUSTOM',budget:4200,objectives:[base.objectives[0]],
    briefing:['우유 카드의 숫자를 보세요.','900mL를 1개 골라요.'],
    checkoutDialogue:['장바구니의 우유가 900mL인지 보세요.','200mL면 진열대에서 수량을 0으로 줄이고 900mL를 담아요.']};
  const {screen,checkout}=await setup('S01','fresh',mission);
  try {
    act(()=>{screen.UNSAFE_getByType(MarketShelfScene).props.onDropProduct('milk-small');});
    act(()=>{screen.UNSAFE_getByType(MarketShelfScene).props.onChangeQuantity('milk-small',-1);});
    act(()=>{screen.UNSAFE_getByType(MarketShelfScene).props.onDropProduct('milk');});
    const cart=screen.UNSAFE_getByType(MarketShelfScene).props.cart;
    expect(cart.milk).toBe(1);expect(cart['milk-small'] ?? 0).toBe(0);
    await checkout();
    const events=jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call=>call[1].map(row=>row.event));
    const start=events.find(e=>e.action.eventCode==='SHOP.SESSION_STARTED')!;
    expect((start.payload?.marketContent as any).sceneSnapshot.mission.objectives).toHaveLength(1);
    const submit=events.find(e=>e.action.eventCode==='SHOP.CHECKOUT_SUBMITTED')!;
    expect((submit.payload?.marketContent as any).cart.milk).toBe(1);
    expect((submit.payload?.marketContent as any).cart['milk-small'] ?? 0).toBe(0);
    expect(startSessionAnalysisJob).toHaveBeenCalledTimes(1);
  } finally {screen.unmount();}
});
