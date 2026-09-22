import { randomUUID } from 'expo-crypto';
import type { BehaviorLogRequest } from '../src/api/behaviorLog';
import { enqueueBehaviorEvents } from '../src/behavior/behaviorEventQueue';
import { MarketBehaviorTracker } from '../src/behavior/marketBehaviorTracker';
import {
  convertMarketEpisodeToBehaviorLogs, createMarketEpisodeBehaviorMission, marketBehaviorReplayId,
} from '../src/behavior/marketEpisodeBehaviorLogs';
import { applyMarketAction, createMarketSession, exportMarketEpisode } from '../src/game/marketSession';
import type { MarketAction } from '../src/game/marketSession';
import { getMarketProduct } from '../src/game/scenarios';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => undefined),
  flushBehaviorEventQueue: jest.fn(async () => undefined),
  assertBehaviorEventsAcknowledged: jest.fn(async () => undefined),
}));

const start = Date.parse('2026-09-19T00:00:00.000Z');
const timestamp = (offset: number) => new Date(start + offset).toISOString();
const provenance = { source: 'synthetic' as const, agentModel: 'policy-engine-v1', personaId: 'careful-checker', personaVersion: '1' };
function fixture() {
  let session = createMarketSession({
    seed: 'mapping-parity', startedAt: timestamp(0), provenance,
    objectives: [{ productId: 'milk', quantity: 1 }], environment: { cashierCount: 2 },
  });
  return {
    get session() { return session; },
    act(action: MarketAction, offset: number) {
      session = applyMarketAction(session, { ...action, at: timestamp(offset) });
      expect(session.lastActionError).toBeNull();
    },
    export: () => exportMarketEpisode(session),
  };
}

afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });

test('headless conversion is byte-stable, unique, chronological and carries provenance on every event', () => {
  const game = fixture();
  game.act({ type: 'viewCart' }, 2000);
  game.act({ type: 'closeView' }, 3400);
  game.act({ type: 'viewHelp' }, 4600);
  game.act({ type: 'closeView' }, 5900);
  game.act({ type: 'giveUp' }, 6100);
  const episode = game.export();
  const before = JSON.stringify(episode);
  const logs: BehaviorLogRequest[] = convertMarketEpisodeToBehaviorLogs(episode);
  expect(JSON.stringify(convertMarketEpisodeToBehaviorLogs(episode))).toBe(JSON.stringify(logs));
  expect(JSON.stringify(episode)).toBe(before);
  expect(new Set(logs.map(log => log.metadata.clientEventId)).size).toBe(logs.length);
  expect(logs.map(log => log.metadata.eventSequence)).toEqual(logs.map((_, index) => index + 1));
  expect(logs.map(log => log.action.eventCode)).toEqual([
    'SHOP.SESSION_STARTED', 'SHOP.MISSION_PRESENTED', 'SHOP.CART_OPENED', 'SHOP.CART_CLOSED',
    'SHOP.STAFF_HELP_REQUESTED', 'SHOP.SESSION_ENDED',
  ]);
  for (const log of logs) expect((log.payload.marketContent as any).provenance).toEqual(provenance);
  expect(logs[2].action.startLatencyMs).toBe(2000);
  expect(logs[3].payload.durationMs).toBe(1400);
  expect(logs.at(-1)?.sessionEnd?.reason).toBe('USER_ABORTED');
});

test('headless event mapping equals the UI tracker mapping for the same observed actions and time', async () => {
  const game = fixture();
  game.act({ type: 'viewCart' }, 2000);
  game.act({ type: 'closeView' }, 3400);
  game.act({ type: 'viewHelp' }, 4600);
  game.act({ type: 'closeView' }, 5900);
  game.act({ type: 'giveUp' }, 6100);
  const episode = game.export();
  const sessionId = marketBehaviorReplayId('parity-session');
  const questInstanceId = marketBehaviorReplayId('parity-quest');
  const createEventId = (sequence: number) => marketBehaviorReplayId(`parity-event-${sequence}`);
  const mission = createMarketEpisodeBehaviorMission(episode, questInstanceId);
  const converted = convertMarketEpisodeToBehaviorLogs(episode, { sessionId, questInstanceId, createEventId });
  let sequence = 0;
  jest.mocked(randomUUID).mockImplementationOnce(() => sessionId).mockImplementation(() => createEventId(++sequence));
  jest.useFakeTimers();
  jest.setSystemTime(start);
  const tracker = new MarketBehaviorTracker('unused', mission, 2, undefined, episode.environment.stations);
  jest.advanceTimersByTime(2000); tracker.cartOpened({});
  jest.advanceTimersByTime(1400); tracker.cartClosed({}, 1400);
  jest.advanceTimersByTime(1200); tracker.staffHelpRequested({ type: 'viewHelp' });
  jest.advanceTimersByTime(1500); await tracker.abort({});
  const uploaded = jest.mocked(enqueueBehaviorEvents).mock.calls.flatMap(call => call[1].map(entry => entry.event));
  const withoutProvenance = converted.map(log => {
    const { provenance: _provenance, ...marketContent } = log.payload.marketContent as Record<string, unknown>;
    return { ...log, payload: { ...log.payload, marketContent } };
  });
  expect(withoutProvenance).toEqual(JSON.parse(JSON.stringify(uploaded)));
});

test('family alternatives, retries, movement pauses and final purchase use shared mappings', () => {
  const game = fixture();
  // Trusted renderer positions are only test setup: the batch runner uses the bounded adapter.
  game.act({ type: 'setPosition', point: game.session.environment.stations.checkout }, 1000);
  game.act({ type: 'interact', station: 'checkout' }, 1300);
  game.act({ type: 'submit' }, 2000);
  game.act({ type: 'retry' }, 2600);
  game.act({ type: 'setPosition', point: game.session.environment.stations.fresh }, 3500);
  game.act({ type: 'interact', station: 'fresh' }, 10500);
  const alternate = game.session.shelfSlots.fresh.find(id => id !== 'milk' && getMarketProduct(id)?.familyId === 'milk')!;
  expect(alternate).toBeTruthy();
  game.act({ type: 'add', productId: alternate }, 11500);
  game.act({ type: 'closeStation' }, 12000);
  game.act({ type: 'setPosition', point: game.session.environment.stations.checkout }, 13000);
  game.act({ type: 'interact', station: 'checkout' }, 13500);
  game.act({ type: 'submit' }, 14000);
  const logs = convertMarketEpisodeToBehaviorLogs(game.export());
  const codes = logs.map(log => log.action.eventCode);
  expect(codes).toEqual(expect.arrayContaining([
    'SHOP.CHECKOUT_CORRECTION_STARTED', 'SHOP.IDLE_STARTED', 'SHOP.IDLE_ENDED',
    'SHOP.MOVEMENT_SAMPLED', 'SHOP.MOVEMENT_STOPPED', 'SHOP.QUANTITY_CHANGED',
  ]));
  expect(codes.filter(code => code === 'SHOP.CHECKOUT_SUBMITTED')).toHaveLength(2);
  expect((logs[0].payload.marketContent as any).objectiveConstraints[0].acceptedProductIds).toContain(alternate);
  expect(logs.find(log => log.action.eventCode === 'SHOP.QUANTITY_CHANGED')?.payload).toMatchObject({
    requiredQuantity: 1, itemId: alternate, selectedQuantity: 1,
  });
  expect(logs.at(-1)?.sessionEnd?.reason).toBe('FLOW_FINISHED');
  expect(logs.map(log => Date.parse(log.metadata.occurredAt))).toEqual(
    logs.map(log => Date.parse(log.metadata.occurredAt)).sort((a, b) => a - b),
  );
});

test('unfinished episodes and nonchronological event timestamps cannot become uploadable logs', () => {
  const game = fixture();
  game.act({ type: 'viewHelp' }, 500);
  game.act({ type: 'giveUp' }, 1000);
  const episode = game.export();
  expect(() => convertMarketEpisodeToBehaviorLogs({ ...episode, events: episode.events.slice(0, -1) })).toThrow('complete');
  episode.events[1].timestamp = timestamp(-100);
  expect(() => convertMarketEpisodeToBehaviorLogs(episode)).toThrow('chronological');
});
