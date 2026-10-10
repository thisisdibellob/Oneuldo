import { MarketBehaviorTracker } from '../src/behavior/marketBehaviorTracker';
import { buildMarketScenarioMission } from '../src/game/scenarios';
import type { MarketReplaySystemCompletion } from '../src/game/marketReplayTrace';
import * as queue from '../src/behavior/behaviorEventQueue';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => String(Math.random())) }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => undefined),
  flushBehaviorEventQueue: jest.fn(async () => undefined),
  assertBehaviorEventsAcknowledged: jest.fn(async () => undefined),
}));

const metadata = (): MarketReplaySystemCompletion => ({ reason: 'action-limit', afterDecisions: 100,
  actionLimit: 100, firstStepId: 'step-0102', checkoutId: 'checkout', cartAtStart: {} });
const events = () => jest.mocked(queue.enqueueBehaviorEvents).mock.calls.flatMap(call => call[1].map(entry => entry.event));

beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); jest.setSystemTime(10000); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('assisted movement and final summary are marked; pending actor movement is flushed before the boundary', async () => {
  const tracker = new MarketBehaviorTracker('test', buildMarketScenarioMission('S01'));
  const move = (time: number, x: number) => {
    jest.setSystemTime(time);
    tracker.observeMovement({ point: { x, y: 100 }, occurredAt: time, controlMode: 'joystick', targetZoneIds: new Set() });
  };
  move(10000, 0); move(10100, 1); move(10200, 2);
  const completion = metadata();
  tracker.beginSystemCompletion(completion);
  tracker.beginSystemCompletion(completion); // Same replay hook is safe to resume.
  completion.cartAtStart.milk = 10; // Caller mutation must not rewrite the saved intervention.
  move(10300, 3); move(10400, 4);
  tracker.checkoutEntered({});
  await tracker.completeForReview({});
  await tracker.abort({});
  const all = events();
  const actor = all.filter(event => event.action.eventCode === 'SHOP.MOVEMENT_SAMPLED' && Number(event.payload.x) <= 2);
  const assisted = all.filter(event => event.action.eventCode === 'SHOP.MOVEMENT_SAMPLED' && Number(event.payload.x) > 2);
  expect(actor.map(event => event.payload.x)).toEqual(expect.arrayContaining([0, 2]));
  expect(actor.every(event => event.validity === undefined)).toBe(true);
  expect(assisted.length).toBeGreaterThan(0);
  for (const event of [...assisted, ...all.filter(event => ['SHOP.CHECKOUT_ENTERED', 'SHOP.CHECKOUT_SUBMITTED', 'SHOP.SESSION_ENDED'].includes(event.action.eventCode))]) {
    expect(event.validity).toEqual({ assistantIntervention: true, invalidReason: 'ASSISTANT_INTERVENTION' });
    // marketContent is the Java ShoppingBehaviorPayload's existing Map field.
    expect((event.payload.marketContent as any).replaySystemCompletion).toEqual(metadata());
    expect(event.taskResult).toBeUndefined();
  }
  expect(all.at(-1)?.sessionEnd?.reason).toBe('FLOW_FINISHED');
  expect(all.filter(event => event.action.eventCode === 'SHOP.SESSION_ENDED')).toHaveLength(1);
});

test('review retry after failed acknowledgement preserves one empty-basket submission and one ending', async () => {
  const tracker = new MarketBehaviorTracker('test', buildMarketScenarioMission('S01'));
  jest.mocked(queue.assertBehaviorEventsAcknowledged).mockRejectedValueOnce(new Error('receipt unavailable'));
  await expect(tracker.completeForReview({})).rejects.toThrow('receipt unavailable');
  await tracker.completeForReview({});
  await tracker.completeForReview({});
  await tracker.abort({});
  const all = events();
  expect(all.filter(event => event.action.eventCode === 'SHOP.CHECKOUT_SUBMITTED')).toHaveLength(1);
  const ended = all.filter(event => event.action.eventCode === 'SHOP.SESSION_ENDED');
  expect(ended).toHaveLength(1);
  expect(ended[0].sessionEnd?.reason).toBe('FLOW_FINISHED');
  expect((ended[0].payload.marketContent as any).cart).toEqual({});
  expect(jest.mocked(queue.assertBehaviorEventsAcknowledged)).toHaveBeenLastCalledWith('test', tracker.sessionId, ended[0].metadata.eventSequence);
  expect(all.every(event => event.validity === undefined)).toBe(true);
});

test('changed intervention metadata and previously aborted sessions cannot be relabeled as review completions', async () => {
  const tracker = new MarketBehaviorTracker('test', buildMarketScenarioMission('S01'));
  tracker.beginSystemCompletion(metadata());
  expect(() => tracker.beginSystemCompletion({ ...metadata(), firstStepId: 'step-9999' })).toThrow('metadata changed');
  await tracker.abort({});
  await expect(tracker.completeForReview({})).rejects.toThrow('aborted session');
  expect(events().some(event => event.action.eventCode === 'SHOP.CHECKOUT_SUBMITTED')).toBe(false);
});
