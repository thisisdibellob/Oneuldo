import {
  buildMarketCheckoutEvents,
  MarketBehaviorSession,
} from '../src/behavior/marketBehaviorTracker';
import { evaluateMarketCart } from '../src/game/scenarios';

let mockUuidCounter = 0;

jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuidCounter).padStart(12, '0')}`,
}));

const session: MarketBehaviorSession = {
  evidenceContext: 'ASSESSMENT_TASK',
  sessionId: '10000000-0000-4000-8000-000000000001',
  simulation: {
    contentSource: 'GENERATED',
    questInstanceId: '90000000-0000-4000-8000-000000000001',
    simulationStarted: true,
  },
  startedAt: '2026-08-29T10:00:00.000Z',
};

describe('장보기 행동 로그 생성', () => {
  beforeEach(() => {
    mockUuidCounter = 0;
  });

  it('정상 장바구니를 목록-상품-수량-예산-종료 순서로 만든다', () => {
    const cart = { apple: 2, curry: 1, milk: 1 };
    const evaluation = evaluateMarketCart(cart);
    const events = buildMarketCheckoutEvents(
      session,
      cart,
      evaluation,
      new Date('2026-08-29T10:01:00.000Z'),
    );

    expect(events.map((event) => event.metadata.eventSequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(events.map((event) => event.action.eventCode)).toEqual([
      'SHOP.LIST_OPENED',
      'SHOP.ITEM_SELECTED',
      'SHOP.QUANTITY_CHANGED',
      'SHOP.ITEM_SELECTED',
      'SHOP.QUANTITY_CHANGED',
      'SHOP.ITEM_SELECTED',
      'SHOP.QUANTITY_CHANGED',
      'SHOP.PRICE_CHECKED',
    ]);
    expect(events.at(-1)?.taskResult).toEqual({
      completionQuality: 100,
      completionTimeMs: 60000,
      taskCompleted: true,
    });
    expect(events.at(-1)?.sessionEnd?.reason).toBe('COMPLETED');
    expect(events.every((event) => event.metadata.offlineQueued === false)).toBe(true);
    expect(events.every((event) => event.simulation.contentSource === 'GENERATED')).toBe(true);
    expect(events.every(
      (event) => event.simulation.questInstanceId === '90000000-0000-4000-8000-000000000001',
    )).toBe(true);
  });

  it('상품별 실제 조작 시각을 이벤트에 보존한다', () => {
    const cart = { apple: 2, curry: 1, milk: 1 };
    const events = buildMarketCheckoutEvents(
      session,
      cart,
      evaluateMarketCart(cart),
      new Date('2026-08-29T10:01:00.000Z'),
      [
        { occurredAt: '2026-08-29T10:00:10.000Z', productId: 'milk', selectedQuantity: 1 },
        { occurredAt: '2026-08-29T10:00:20.000Z', productId: 'apple', selectedQuantity: 1 },
        { occurredAt: '2026-08-29T10:00:25.000Z', productId: 'apple', selectedQuantity: 2 },
        { occurredAt: '2026-08-29T10:00:35.000Z', productId: 'curry', selectedQuantity: 1 },
      ],
    );

    expect(events.slice(1).map((event) => event.metadata.occurredAt)).toEqual([
      '2026-08-29T10:00:10.000Z',
      '2026-08-29T10:00:10.000Z',
      '2026-08-29T10:00:20.000Z',
      '2026-08-29T10:00:25.000Z',
      '2026-08-29T10:00:35.000Z',
      '2026-08-29T10:00:35.000Z',
      '2026-08-29T10:01:00.000Z',
    ]);
    expect(events[1].action.startLatencyMs).toBe(10000);
    expect(events[2].action.startLatencyMs).toBeUndefined();
  });

  it('누락·수량 오류·목록 외 상품을 서로 다른 이벤트로 분리한다', () => {
    const cart = { apple: 1, curry: 1, ramen: 1 };
    const evaluation = evaluateMarketCart(cart);
    const events = buildMarketCheckoutEvents(
      session,
      cart,
      evaluation,
      new Date('2026-08-29T10:01:00.000Z'),
    );

    const codes = events.map((event) => event.action.eventCode);
    expect(codes).toContain('SHOP.ITEM_MISSING');
    expect(codes).toContain('SHOP.WRONG_ITEM_SELECTED');
    expect(events).toContainEqual(expect.objectContaining({
      action: expect.objectContaining({
        eventCode: 'SHOP.QUANTITY_CHANGED',
        stepOutcome: 'FAILURE',
      }),
      payload: expect.objectContaining({ itemId: 'apple', requiredQuantity: 2, selectedQuantity: 1 }),
    }));
    expect(events.at(-1)?.taskResult?.taskCompleted).toBe(false);
  });
});
