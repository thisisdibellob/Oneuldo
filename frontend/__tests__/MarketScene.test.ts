import { createMarketScene, restoreMarketScene } from '../src/game/marketScene';
import { buildMarketScenarioMission, getMarketCartTotal, getMarketProduct } from '../src/game/scenarios';
import { MarketBehaviorTracker } from '../src/behavior/marketBehaviorTracker';
import { enqueueBehaviorEvents } from '../src/behavior/behaviorEventQueue';
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000001' }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => 0), flushBehaviorEventQueue: jest.fn(async () => undefined),
  assertBehaviorEventsAcknowledged: jest.fn(async () => undefined),
}));

it.each(['S01','S02'])('%s seed 반복 시 동일한 24개 슬롯과 목표·허용 대안을 보존한다', id => {
  for (let seed = 0; seed < 50; seed++) {
    const mission = buildMarketScenarioMission(id);
    const a = createMarketScene(mission, seed, 'same');
    expect(a).toEqual(createMarketScene(mission, seed, 'same'));
    expect(a.products).toHaveLength(24);
    expect(new Set(a.slots.map(s => s.slotId)).size).toBe(24);
    for (const o of mission.objectives) for (const productId of o.acceptedProductIds ?? [o.productId]) {
      expect(a.products.some(p => p.id === productId)).toBe(true);
    }
    for (const category of ['fresh','produce','meal','drink']) expect(a.products.filter(p => p.categoryId === category)).toHaveLength(6);
  }
});
it('seed 변경은 배치만 바꾸고 원래 미션을 수정하지 않는다', () => {
  const mission = buildMarketScenarioMission('S01');
  expect(createMarketScene(mission, 1).slots).not.toEqual(createMarketScene(mission, 2).slots);
  expect(mission.scene).toBeUndefined();
  expect(() => createMarketScene(mission, -1)).toThrow();
});
it('카탈로그가 바뀌어도 저장된 가격으로 복원하며 변조된 슬롯을 거부한다', () => {
  const scene = createMarketScene(buildMarketScenarioMission('S01'), 1);
  const original = getMarketProduct('milk')!.price;
  try {
    getMarketProduct('milk')!.price = 999;
    const restored = restoreMarketScene(scene);
    expect(getMarketCartTotal({milk: 1}, restored.scene!.products)).toBe(original);
  } finally { getMarketProduct('milk')!.price = original; }
  scene.slots[0].productId = 'invalid';
  expect(() => restoreMarketScene(scene)).toThrow();
});
it('시작 스냅샷과 실제 제공 목록·장바구니를 저장하고 성패 라벨을 생산하지 않는다', async () => {
  jest.useFakeTimers(); jest.clearAllMocks();
  const mission = restoreMarketScene(createMarketScene(buildMarketScenarioMission('S02'), 22));
  const tracker = new MarketBehaviorTracker('token', mission);
  tracker.shelfOpened('fresh');
  tracker.quantityChanged('milk', 0, 1, { milk: 1 });
  tracker.checkoutSubmitted({ milk: 1 });
  await tracker.abort({ milk: 1 });
  const events = jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(c => c[1]).map(e => e.event);
  expect(events[0].payload.marketContent).toMatchObject({ sceneSnapshot: mission.scene });
  const shelf = events.find(e => e.action.eventCode === 'SHOP.SHELF_OPENED')!;
  expect((shelf.payload.marketContent as { displayedProducts: unknown[] }).displayedProducts).toHaveLength(6);
  const submitted = events.find(e => e.action.eventCode === 'SHOP.CHECKOUT_SUBMITTED')!;
  expect(submitted.payload.marketContent).toMatchObject({ cart: { milk: 1 } });
  expect(events.every(e => e.action.stepOutcome === undefined && !e.taskResult)).toBe(true);
  expect(events.some(e => /WRONG|MATCHED|OVERSHOT|COMPLETED/.test(e.action.eventCode))).toBe(false);
  jest.useRealTimers();
});

