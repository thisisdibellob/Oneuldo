import { playMarketTrace, type ReplayProgress } from '../src/replay/player';
import { createMarketSession } from '../src/game/marketSession';
import { createMarketReplaySnapshot, marketReplayTraceId, type MarketReplayTrace } from '../src/game/marketReplayTrace';
import { DEFAULT_REPLAY_PRESENTATION } from '../src/game/marketReplayPerception';
import { marketMission } from '../src/game/scenarios';
import { walkToStation, walkToVisibleStation } from '../src/replay/motor';
import type { ReplayMotionPort, ReplayUiPort, ReplayUiState } from '../src/replay/ports';

jest.mock('../src/replay/motor', () => ({ ...jest.requireActual('../src/replay/motor'),
  walkToStation: jest.fn(async () => {}), walkToVisibleStation: jest.fn(async () => {}) }));

function harness(cart: Record<string, number> = {}) {
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'player-controller-test' }), marketMission, DEFAULT_REPLAY_PRESENTATION);
  const movement = { style: 'steady', speedMultiplier: .6, running: false, motorSeed: 'test', accelerationMs: 200 };
  const intents = [{ type: 'start' }, { type: 'walkTo', target: { stationId: 'fresh' }, movement },
    ...Array.from({ length: 99 }, () => ({ type: 'lookAround', durationMs: 100 })),
    { type: 'walkTo', target: { stationId: 'checkout' }, movement }, { type: 'checkout', checkoutId: 'checkout' },
    { type: 'submitForReview' }, { type: 'awaitReviewAccepted' }, { type: 'leave' }];
  const body = { traceSchemaVersion: '2', personaId: 'test', personaVersion: '1', seed: 1, generationPolicy: 'llm', policyVersion: '5',
    generation: { model: 'test', reproducibility: 'captured-trace', actorPolicyVersion: 'episodic-choice-v9',
      systemCompletion: { reason: 'action-limit', afterDecisions: 100, actionLimit: 100, firstStepId: 's101', checkoutId: 'checkout', cartAtStart: { ...cart } } },
    target: { snapshotId: snapshot.snapshotId, missionId: marketMission.id, completionMode: 'ai-review' },
    steps: intents.map((s, i) => ({ ...s, id: `s${i}`, reactionDelayMs: 0, timeoutMs: 1000, reason: 'player boundary fixture' })) } as MarketReplayTrace;
  const trace = { ...body, traceId: marketReplayTraceId(body) };
  let mounted = true;
  // Fake UI basket isolates the boundary contract; no real app/database execution is claimed.
  const state: ReplayUiState = { briefing: true, briefingStep: 0, phase: 'shopping', shelf: null, cartOpen: false,
    helpOpen: false, staffOpen: false, staffReturnHelp: false, panelTransition: false, reviewing: false,
    reviewAccepted: false, reviewError: null, cart: { ...cart } };
  const ui = { snapshot: () => snapshot, presentation: () => DEFAULT_REPLAY_PRESENTATION, read: () => state,
    advanceBriefing: jest.fn(() => { state.briefing = false; }),
    beginSystemCompletion: jest.fn(),
    interact: jest.fn(() => { state.phase = 'checkout'; }),
    submit: jest.fn(async () => { state.reviewAccepted = true; }),
    leave: jest.fn(async () => { mounted = false; }),
  } as unknown as ReplayUiPort;
  const motion = { read: () => ({ locked: false, presentation: DEFAULT_REPLAY_PRESENTATION }), stop: jest.fn() } as unknown as ReplayMotionPort;
  const progress: ReplayProgress[] = [];
  const run = () => playMarketTrace(trace, () => mounted ? ui : null, motion, new AbortController().signal, p => progress.push(p));
  return { trace, ui, state, motion, progress, run };
}
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks();
  jest.mocked(walkToStation).mockResolvedValue(); jest.mocked(walkToVisibleStation).mockResolvedValue(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
async function finish(test: ReturnType<typeof harness>) { const run = test.run(); await jest.advanceTimersByTimeAsync(20000); await run; }

test.each<Record<string, number>>([{}, { milk: 1 }])('system checkout preserves basket %j, logs boundary and waits for actual acceptance', async cart => {
  const test = harness(cart); await finish(test);
  expect(test.progress.at(-1)).toMatchObject({ status: 'completed', report: { acknowledged: true,
    submission: { cart, source: 'app-ui-before-submit' }, systemCompletion: { observedCartAtStart: cart, source: 'app-ui-before-system-completion' } } });
  expect(test.ui.beginSystemCompletion).toHaveBeenCalledTimes(1);
  expect(test.ui.beginSystemCompletion).toHaveBeenCalledWith(test.trace.generation!.systemCompletion);
  expect(walkToVisibleStation).toHaveBeenCalledTimes(1);
  expect(jest.mocked(walkToVisibleStation).mock.calls[0][1]).toBe('fresh');
  expect(walkToStation).toHaveBeenCalledTimes(1);
  expect(jest.mocked(walkToStation).mock.calls[0][1]).toBe('checkout');
  expect(test.ui.submit).toHaveBeenCalledTimes(1);
  expect(test.ui.leave).toHaveBeenCalledTimes(1);
  expect(test.state.cart).toEqual(cart);
});

test('a boundary basket mismatch stops before controller logging or movement', async () => {
  const test = harness({ milk: 1 }); test.state.cart = {}; await finish(test);
  expect(test.progress.at(-1)).toMatchObject({ status: 'failed', error: 'System completion basket changed from the actor boundary' });
  expect(test.ui.beginSystemCompletion).not.toHaveBeenCalled();
  expect(walkToStation).not.toHaveBeenCalled(); expect(test.ui.submit).not.toHaveBeenCalled();
});

test('a basket change during controller movement blocks submission', async () => {
  const test = harness({ milk: 1 });
  jest.mocked(walkToStation).mockImplementation(async () => { test.state.cart.milk = 2; });
  await finish(test);
  expect(test.progress.at(-1)?.status).toBe('failed');
  expect(test.ui.beginSystemCompletion).toHaveBeenCalledTimes(1);
  expect(test.ui.submit).not.toHaveBeenCalled(); expect(test.ui.leave).not.toHaveBeenCalled();
});

test('controller cannot continue without provenance logging support', async () => {
  const test = harness(); delete test.ui.beginSystemCompletion; await finish(test);
  expect(test.progress.at(-1)).toMatchObject({ status: 'failed', error: 'System completion provenance logging is unavailable' });
  expect(walkToStation).not.toHaveBeenCalled(); expect(test.ui.submit).not.toHaveBeenCalled();
});

test('missing analysis acceptance is a failed wait, not an acknowledged leave', async () => {
  const test = harness(); jest.mocked(test.ui.submit).mockImplementation(async () => {}); await finish(test);
  expect(test.progress.at(-1)).toMatchObject({ status: 'failed', report: { acknowledged: false } });
  expect(test.ui.submit).toHaveBeenCalledTimes(1); expect(test.ui.leave).not.toHaveBeenCalled();
});

test('actor prefix still fails a hidden-station walk instead of using the controller planner', async () => {
  const test = harness(); jest.mocked(walkToVisibleStation).mockRejectedValue(new Error('station is not visible'));
  await finish(test);
  expect(test.progress.at(-1)).toMatchObject({ status: 'failed', error: 'station is not visible' });
  expect(walkToStation).not.toHaveBeenCalled(); expect(test.ui.beginSystemCompletion).not.toHaveBeenCalled();
});
