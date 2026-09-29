import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as ts from 'typescript';
import { randomUUID } from 'expo-crypto';
import { MarketBehaviorTracker } from '../src/behavior/marketBehaviorTracker';
import * as queue from '../src/behavior/behaviorEventQueue';
import { buildMarketScenarioMission } from '../src/game/scenarios';
import { createMarketScene, restoreMarketScene } from '../src/game/marketScene';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../src/behavior/behaviorEventQueue', () => ({
  enqueueBehaviorEvents: jest.fn(async () => undefined),
  flushBehaviorEventQueue: jest.fn(async () => undefined),
  assertBehaviorEventsAcknowledged: jest.fn(async () => undefined),
}));

// Frozen directly from `git show f124a95:frontend/src/behavior/marketBehaviorTracker.ts`.
// Keep the reference independent of production edits, and usable in shallow CI checkouts.
const reference = fs.readFileSync(path.join(__dirname, 'fixtures/marketBehaviorTracker.f124a95.source'), 'utf8');
const referenceHash = '4f709dd6116f0823a53e8a8f957c87d16d3e4724bd7b2a2f86abe11b4398f90c';
function baselineTracker(): typeof MarketBehaviorTracker {
  const source = ts.transpileModule(reference, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} as { MarketBehaviorTracker: typeof MarketBehaviorTracker } };
  const load = (name: string) => {
    if (name === 'expo-crypto') return { randomUUID };
    if (name === './behaviorEventQueue') return queue;
    return require(path.resolve(__dirname, '../src/behavior', name));
  };
  new Function('require', 'module', 'exports', source)(load, module, module.exports);
  return module.exports.MarketBehaviorTracker;
}

const start = Date.parse('2026-09-26T00:00:00.000Z');
type Ending = 'aborted' | 'submitted' | 'complete';
async function exercise(Tracker: typeof MarketBehaviorTracker, ending: Ending, scene: boolean) {
  jest.clearAllMocks();
  jest.clearAllTimers();
  jest.setSystemTime(start);
  let sequence = 0;
  jest.mocked(randomUUID).mockImplementation(() => `10000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
  const base = buildMarketScenarioMission('S02');
  const mission = scene ? restoreMarketScene(createMarketScene(base, 22, 'parity-scene')) : base;
  const tracker = new Tracker('test-token', mission, 2, scene ? {
    questInstanceId: '20000000-0000-4000-8000-000000000001', contentSource: 'GENERATED',
  } : undefined);
  const wait = (ms: number) => jest.advanceTimersByTime(ms);
  wait(1200); tracker.briefingAdvanced(0, 1200);
  for (let i = 0; i < 8; i++) {
    wait(100);
    tracker.observeMovement({ point: { x: 300 + i * 5, y: 400 }, controlMode: 'joystick',
      occurredAt: Date.now(), targetZoneIds: new Set() });
  }
  tracker.movementStopped('joystick');
  wait(5300); // Idle threshold and automatic persistence must remain unchanged.
  tracker.shelfOpened('fresh');
  const openedAt = Date.now();
  wait(550); tracker.quantityChanged('milk', 0, 2, { milk: 2 }); tracker.updateCart({ milk: 2 });
  wait(450); tracker.quantityChanged('milk', 2, 1, { milk: 1 }); tracker.updateCart({ milk: 1 });
  wait(300); tracker.shelfClosed('fresh', { milk: 1 }, openedAt);
  wait(250); tracker.cartOpened({ milk: 1 });
  wait(600); tracker.cartClosed({ milk: 1 }, 600);
  tracker.track({ eventCode: 'SHOP.STAFF_HELP_REQUESTED', microActionId: 'VIEWHELP',
    payload: { marketContent: { action: { type: 'viewHelp' } } } });
  tracker.appBackgrounded(); tracker.appBackgrounded();
  wait(800); tracker.appForegrounded(); tracker.appForegrounded();
  tracker.checkoutEntered({ milk: 1 });
  if (ending !== 'aborted') {
    tracker.checkoutSubmitted({ milk: 1 });
    await tracker.flushConfirmed();
    tracker.correctionStarted({ milk: 1 });
  }
  if (ending === 'complete') await tracker.complete({ milk: 1 });
  else await tracker.abort({ milk: 1 });
  await tracker.abort({ milk: 1 });
  tracker.cartOpened({}); // Closed sessions must not emit later user actions.
  wait(20000);
  const events = jest.mocked(queue.enqueueBehaviorEvents).mock.calls.flatMap(call => call[1]);
  return JSON.parse(JSON.stringify({ events, flushes: jest.mocked(queue.flushBehaviorEventQueue).mock.calls,
    acknowledged: jest.mocked(queue.assertBehaviorEventsAcknowledged).mock.calls, timers: jest.getTimerCount() }));
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('production tracker is restored byte-for-byte to the independently frozen f124a95 source', () => {
  expect(createHash('sha256').update(reference).digest('hex')).toBe(referenceHash);
  expect(fs.readFileSync(path.join(__dirname, '../src/behavior/marketBehaviorTracker.ts'), 'utf8')).toBe(reference);
});

test.each([
  ['aborted', false], ['submitted', false], ['complete', false],
  ['aborted', true], ['submitted', true], ['complete', true],
] as const)('f124a95 lifecycle, timings, movement and queue parity: %s / scene=%s', async (ending, scene) => {
  const original = await exercise(baselineTracker(), ending, scene);
  const restored = await exercise(MarketBehaviorTracker, ending, scene);
  expect(restored).toEqual(original);
  const events = restored.events.map((entry: { event: any }) => entry.event);
  expect(events.map((event: any) => event.action.eventCode)).toEqual(expect.arrayContaining([
    'SHOP.SESSION_STARTED', 'SHOP.MISSION_PRESENTED', 'SHOP.MOVEMENT_SAMPLED',
    'SHOP.IDLE_STARTED', 'SHOP.IDLE_ENDED', 'SHOP.QUANTITY_CHANGED', 'SHOP.STAFF_HELP_REQUESTED',
    'SHOP.APP_BACKGROUNDED', 'SHOP.APP_FOREGROUNDED', 'SHOP.SESSION_ENDED',
  ]));
  expect(events.filter((event: any) => event.action.eventCode === 'SHOP.SESSION_ENDED')).toHaveLength(1);
  expect(events.at(-1).sessionEnd).toMatchObject({
    reason: ending === 'aborted' ? 'USER_ABORTED' : ending === 'submitted' ? 'EXIT_AFTER_SUBMISSION' : 'FLOW_FINISHED',
    interruptionCount: 1, interruptionTimeMs: 800,
  });
  expect(restored.timers).toBe(0);
});
