import { marketCatalogProducts, enabledMarketScenarios, marketScenarioDefinitions, MARKET_CATALOG_VERSION, MARKET_SCENARIO_VERSION } from '../src/game/marketContent';
import { buildMarketScenarioMission, buildRandomMarketScenarioMission, resolveMarketAiMission, marketProducts, getMarketProduct, getMarketCartTotal, evaluateMarketCart, getObjectiveQuantity } from '../src/game/scenarios';
import { MarketBehaviorTracker } from '../src/behavior/marketBehaviorTracker';
import { enqueueBehaviorEvents, flushBehaviorEventQueue } from '../src/behavior/behaviorEventQueue';
import type { BehaviorLogRequest } from '../src/api/behaviorLog';

jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000001' }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => undefined), flushBehaviorEventQueue: jest.fn(async () => undefined),
}));

afterEach(() => jest.clearAllTimers());

it('60개 상품·15개씩의 분류를 로딩하고 화면 가격과 구매 단위를 통일한다', () => {
  expect(marketCatalogProducts).toHaveLength(60);
  expect(new Set(marketCatalogProducts.map((p) => p.id)).size).toBe(60);
  for (const id of ['fresh', 'produce', 'meal', 'drink']) expect(marketCatalogProducts.filter((p) => p.categoryId === id)).toHaveLength(15);
  expect(getMarketProduct('milk')).toMatchObject({ price: 2200, detail: '900mL', initialStock: 5 });
  expect(getMarketProduct('premium-eggs')).toMatchObject({ salesUnit: '팩', attributes: { brand: '해뜰', pack_count: 10 } });
  expect(getMarketCartTotal({ milk: 1, banana: 1 })).toBe(5800);
});

it('16개 정의 중 S01/S02만 실행하고 원문 예산과 조건을 보존한다', () => {
  expect(marketScenarioDefinitions).toHaveLength(16);
  expect(enabledMarketScenarios.map((s) => s.id)).toEqual(['S01', 'S02']);
  expect(buildMarketScenarioMission('S01')).toMatchObject({ budget: 7000, scenarioId: 'S01', catalogVersion: MARKET_CATALOG_VERSION });
  expect(buildMarketScenarioMission('S02')).toMatchObject({ budget: 4000, objectives: [
    { productId: 'apple', quantity: 2, acceptedProductIds: ['apple', 'apple-green'] },
    { productId: 'water', quantity: 1 },
  ] });
  expect(() => buildMarketScenarioMission('S09')).toThrow();
});

it('첫 관찰 플레이는 실행 가능한 시나리오 중 하나를 자동 선택한다', () => {
  expect(buildRandomMarketScenarioMission(() => 0).scenarioId).toBe('S01');
  expect(buildRandomMarketScenarioMission(() => 0.999999).scenarioId).toBe('S02');
});

it('초록 사과를 목록 수량에 포함하고 작은 우유를 900mL로 취급하지 않는다', () => {
  const s02 = buildMarketScenarioMission('S02');
  expect(getObjectiveQuantity({ 'apple-green': 2, water: 1 }, s02.objectives[0])).toBe(2);
  expect(evaluateMarketCart({ 'apple-green': 2, water: 1 }, s02)).toMatchObject({ total: 3800, extra: [], quantityMismatches: [] });
  expect(evaluateMarketCart({ 'milk-small': 1, banana: 1 }, buildMarketScenarioMission('S01')).missing).toContainEqual({ productId: 'milk', quantity: 1 });
});

it('서버·앱 버전 불일치와 시나리오 변조 시 조용히 실행하지 않는다', () => {
  const mission = buildMarketScenarioMission('S01');
  expect(resolveMarketAiMission(mission).objectives).toEqual(mission.objectives);
  expect(() => resolveMarketAiMission({ ...mission, catalogVersion: 'old' })).toThrow('버전');
  expect(() => resolveMarketAiMission({ ...mission, scenarioVersion: 'old' })).toThrow('버전');
  expect(() => resolveMarketAiMission({ ...mission, budget: 10 })).toThrow('일치');
  expect(() => resolveMarketAiMission({ ...mission, scenarioId: 'S10' })).toThrow();
});

it('로그에 버전·목표 조건·당시 표시 상품을 남기고 초록 사과를 잘못된 상품으로 기록하지 않는다', async () => {
  jest.useFakeTimers(); jest.clearAllMocks();
  const tracker = new MarketBehaviorTracker('token', buildMarketScenarioMission('S02'));
  tracker.shelfOpened('produce');
  tracker.quantityChanged('apple-green', 0, 2, { 'apple-green': 2 });
  await tracker.flushNow();
  const events = jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap((call) => call[1]) as Array<{ event: BehaviorLogRequest }>;
  const start = events.find(({ event }) => event.action.eventCode === 'SHOP.SESSION_STARTED')!.event;
  expect(start.task.scenarioVariant).toBe('S02');
  expect(start.payload).toMatchObject({ catalogVersion: MARKET_CATALOG_VERSION, scenarioVersion: MARKET_SCENARIO_VERSION, marketContent: {
    initialStockPerSku: 5, objectiveConstraints: [{ acceptedProductIds: ['apple', 'apple-green'] }, {}],
  } });
  const shelf = events.find(({ event }) => event.action.eventCode === 'SHOP.SHELF_OPENED')!.event;
  expect((shelf.payload.marketContent as { displayedProducts: unknown[] }).displayedProducts).toHaveLength(marketProducts.filter(p => p.categoryId === 'produce').length);
  expect(events.some(({ event }) => event.action.eventCode === 'SHOP.WRONG_ITEM_SELECTED')).toBe(false);
  expect(flushBehaviorEventQueue).toHaveBeenCalledWith('token');
  jest.useRealTimers();
});
