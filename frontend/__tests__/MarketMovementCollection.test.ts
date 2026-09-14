import { MarketBehaviorTracker } from '../src/behavior/marketBehaviorTracker';
import { marketMission } from '../src/game/scenarios';
import { enqueueBehaviorEvents } from '../src/behavior/behaviorEventQueue';
import { createMarketEnvironment } from '../src/game/marketEnvironment';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => String(Math.random())) }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => undefined),
  flushBehaviorEventQueue: jest.fn(async () => undefined),
  assertBehaviorEventsAcknowledged: jest.fn(async () => undefined),
}));

beforeEach(() => jest.clearAllMocks());

test('uploaded movement context uses the actual retail layout including household and checkout stations', async () => {
  const environment = createMarketEnvironment();
  const tracker = new MarketBehaviorTracker('test', marketMission, 2, undefined, environment.stations);
  tracker.cartOpened({});
  await tracker.abort({});
  const events = jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call => call[1].map(entry => entry.event));
  expect(events.length).toBeGreaterThan(2);
  for (const event of events) {
    expect((event.payload?.marketContent as any).movementContext.stations).toEqual(environment.stations);
  }
});

test('pending movement survives interactions, periodic persistence, backgrounding and session close', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(10000);
  const tracker = new MarketBehaviorTracker('test', marketMission);
  const move = (time: number, x: number) => {
    jest.setSystemTime(time);
    tracker.observeMovement({ point: { x, y: 100 }, occurredAt: time, controlMode: 'joystick', targetZoneIds: new Set() });
  };
  move(10000, 0); move(10100, 1); move(10200, 2); move(10300, 3);
  tracker.cartOpened({});
  move(10400, 4); move(10500, 5);
  await tracker.flushNow();
  move(10600, 6); move(10700, 7);
  tracker.appBackgrounded();
  jest.setSystemTime(11000); tracker.appForegrounded();
  move(11100, 8); move(11200, 9);
  await tracker.abort({});
  const events = jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call => call[1].map(entry => entry.event));
  expect(events.map(e => e.metadata.eventSequence)).toEqual(events.map((_, i) => i + 1));
  const samples = events.filter(e => e.action.eventCode === 'SHOP.MOVEMENT_SAMPLED');
  expect(samples.map(e => e.payload?.x)).toEqual(expect.arrayContaining([0, 3, 5, 7, 9]));
  expect(samples.length).toBeLessThan(10);
  const cart = events.findIndex(e => e.action.eventCode === 'SHOP.CART_OPENED');
  expect(events[cart - 1].payload?.x).toBe(3);
  expect(events.at(-1)?.action.eventCode).toBe('SHOP.SESSION_ENDED');
  expect(samples.every(e => (e.payload?.marketContent as any).movementContext.samplingVersion === 'market-movement-v2')).toBe(true);
  jest.useRealTimers();
});
