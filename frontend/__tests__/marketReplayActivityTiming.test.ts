import { createMarketSession } from '../src/game/marketSession';
import { createMarketReplaySnapshot, marketReplayTraceId, validateMarketReplayTrace,
  type MarketReplayStep, type MarketReplayTrace } from '../src/game/marketReplayTrace';
import { DEFAULT_REPLAY_PRESENTATION } from '../src/game/marketReplayPerception';
import { playMarketTrace, type ReplayProgress } from '../src/replay/player';
import type { ReplayMotionPort, ReplayShelfPort, ReplayUiPort, ReplayUiState } from '../src/replay/ports';

const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'activity-timing' }), undefined, DEFAULT_REPLAY_PRESENTATION);
type AuthoredStep = { type: MarketReplayStep['type']; [key: string]: unknown };
function traceFor(actions: AuthoredStep[], timingProfile: 'activity-duration-v1' | 'actor-preserved-v1' = 'activity-duration-v1') {
  const trace = {
    traceSchemaVersion: '2', traceId: '', personaId: 'mild-intellectual-disability-adult', personaVersion: '5',
    seed: 'activity-timing', generationPolicy: 'llm', policyVersion: '6', experienceMode: 'first-play',
    generation: { model: 'gpt-6-luna', reproducibility: 'captured-trace', actorPolicyVersion: 'feedback-choice-v1',
      timingProfile, feedback: { version: '1', observationScope: 'current-screen', memory: 'actor-authored',
        contextDelivery: 'external-frame', decisions: 1 } },
    target: { snapshotId: snapshot.snapshotId, completionMode: 'ai-review' },
    steps: [{ type: 'start' }, ...actions, { type: 'giveUp' }, { type: 'skipRating' }, { type: 'leave' }]
      .map((step, i) => ({ id: `step-${i}`, reactionDelayMs: 0, timeoutMs: 130000, reason: 'timing contract', ...step })),
  } as MarketReplayTrace;
  trace.traceId = marketReplayTraceId(trace);
  return trace;
}
function reseal(trace: MarketReplayTrace) { trace.traceId = marketReplayTraceId(trace); return trace; }
function harness(trace: MarketReplayTrace) {
  const state: ReplayUiState = { briefing: true, briefingStep: 0, phase: 'shopping', shelf: null,
    cartOpen: false, helpOpen: false, staffOpen: false, staffReturnHelp: false, panelTransition: false,
    reviewing: false, reviewAccepted: false, reviewError: null, cart: {} };
  const inputs: { type: string; at: number }[] = [];
  const record = (type: string) => inputs.push({ type, at: Date.now() });
  const shelf = { scroll: jest.fn(() => record('scrollShelf')), viewCart: jest.fn((open: boolean) => {
    state.cartOpen = open; record('shelfCart');
  }) } as unknown as ReplayShelfPort;
  const ui = {
    snapshot: () => snapshot, presentation: () => snapshot.presentation, sessionId: () => 'timing-session', read: () => state,
    shelf: () => state.shelf ? shelf : null,
    advanceBriefing: jest.fn(() => { state.briefing = false; record('start'); }),
    viewCart: jest.fn(() => { state.cartOpen = true; record('viewCart'); }),
    viewHelp: jest.fn(() => { state.helpOpen = true; record('viewHelp'); }),
    closeView: jest.fn(() => { state.cartOpen = state.helpOpen = false; record('closeView'); }),
    closeStation: jest.fn(() => { state.shelf = null; state.staffOpen = false; record('closeStation'); }),
    interact: jest.fn((station: string) => { state.shelf = station; record('openShelf'); }),
    scrollList: jest.fn(() => record('scrollList')),
    giveUp: jest.fn(() => { state.phase = 'finished'; record('giveUp'); }), skipRating: jest.fn(() => record('skipRating')),
    leave: jest.fn(async () => { record('leave'); }),
  } as unknown as ReplayUiPort;
  const motion = { read: () => ({ locked: false, presentation: snapshot.presentation }), stop: jest.fn() } as unknown as ReplayMotionPort;
  const progress: ReplayProgress[] = [];
  const run = () => playMarketTrace(trace, () => ui, motion, new AbortController().signal, value => progress.push(value));
  return { ui, state, inputs, progress, run };
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test.each(['viewCart', 'viewHelp'] as const)('%s opens immediately and only dwells after its existing transition', async type => {
  const trace = traceFor([{ type: 'closeStation' }, { type, durationMs: 1000 }, { type: 'closeView' }]);
  expect(validateMarketReplayTrace(trace, snapshot)).toEqual({ valid: true, errors: [] });
  const test = harness(trace), run = test.run();
  await jest.advanceTimersByTimeAsync(0);
  expect(test.inputs).toEqual([{ type: 'start', at: 0 }, { type: 'closeStation', at: 0 }, { type, at: 0 }]);
  expect(type === 'viewCart' ? test.state.cartOpen : test.state.helpOpen).toBe(true);
  await jest.advanceTimersByTimeAsync(1259);
  expect(test.ui.closeView).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect(test.inputs.at(-1)).toEqual({ type: 'closeView', at: 1260 });
  await jest.advanceTimersByTimeAsync(360); await run;
  expect(test.inputs.filter(input => ['giveUp', 'skipRating', 'leave'].includes(input.type))).toEqual([
    { type: 'giveUp', at: 1540 }, { type: 'skipRating', at: 1540 }, { type: 'leave', at: 1620 },
  ]);
  expect(test.progress.at(-1)?.status).toBe('completed');
  expect(jest.getTimerCount()).toBe(0);
});

test('pause, list reading, looking around and browsing consume their durations once', async () => {
  const trace = traceFor([{ type: 'pause', durationMs: 300 }, { type: 'readList', durationMs: 500 },
    { type: 'lookAround', durationMs: 700 }, { type: 'openShelf', stationId: 'fresh' },
    { type: 'browse', durationMs: 600, scrollFraction: .5 }, { type: 'closeStation' }]);
  const test = harness(trace), run = test.run();
  await jest.advanceTimersByTimeAsync(2220); await run;
  expect(test.progress.at(-1)?.status).toBe('completed');
  const elapsed = Object.fromEntries(test.progress.at(-1)!.report.completedSteps.map(step =>
    [step.type, Date.parse(step.finishedAt) - Date.parse(step.startedAt)]));
  expect(elapsed).toMatchObject({ start: 0, pause: 300, readList: 500, lookAround: 700, openShelf: 40, browse: 600, closeStation: 0 });
  expect(test.inputs.filter(input => input.type === 'scrollList').map(input => input.at)).toEqual([300, 400, 500, 600, 700]);
  expect(test.inputs.at(-1)).toEqual({ type: 'leave', at: 2220 });
});

test('saved actor-preserved traces retain their pre-action waits and no extra panel dwell', async () => {
  const trace = traceFor([{ type: 'viewCart', reactionDelayMs: 20 }, { type: 'closeView' }], 'actor-preserved-v1');
  trace.steps[0].reactionDelayMs = 40; reseal(trace);
  expect(validateMarketReplayTrace(trace, snapshot)).toEqual({ valid: true, errors: [] });
  const test = harness(trace), run = test.run();
  await jest.advanceTimersByTimeAsync(39); expect(test.inputs).toEqual([]);
  await jest.advanceTimersByTimeAsync(21);
  expect(test.inputs).toEqual([{ type: 'start', at: 40 }, { type: 'viewCart', at: 60 }]);
  await jest.advanceTimersByTimeAsync(620); await run;
  expect(test.inputs.find(input => input.type === 'closeView')).toEqual({ type: 'closeView', at: 320 });
  expect(test.progress.at(-1)?.status).toBe('completed');
});

test('activity durations require the feedback profile and reject pre-action delays on every step', () => {
  const trace = traceFor([{ type: 'viewCart', durationMs: 0 }, { type: 'closeView' }, { type: 'viewHelp', durationMs: 120000 }]);
  expect(validateMarketReplayTrace(trace, snapshot).valid).toBe(true);
  for (let i = 0; i < trace.steps.length; i++) {
    const invalid = structuredClone(trace); invalid.steps[i].reactionDelayMs = 1;
    expect(validateMarketReplayTrace(reseal(invalid), snapshot).errors).toContain('Activity-duration timing requires zero reaction delay on every step.');
  }
  const other = structuredClone(trace); other.generation!.actorPolicyVersion = 'episodic-choice-v10';
  expect(validateMarketReplayTrace(reseal(other), snapshot).errors).toContain('Activity-duration timing requires feedback-choice-v1.');
  const legacy = structuredClone(trace); legacy.generation!.timingProfile = 'actor-preserved-v1';
  expect(validateMarketReplayTrace(reseal(legacy), snapshot).errors).toContain('Cart and help durations require activity-duration-v1 timing.');
});

test.each([-1, 1.5, 120001])('panel duration %s is rejected by the exact shared schema', durationMs => {
  expect(validateMarketReplayTrace(traceFor([{ type: 'viewCart', durationMs }]), snapshot).valid).toBe(false);
});

test('activity timing rejects hidden drag hesitation while saved legacy gestures retain it', () => {
  const action: AuthoredStep = { type: 'dragProduct', productId: 'milk', quantity: 1,
    gesture: { durationMs: 300, hesitationMs: 0, outcome: 'drop', motorSeed: 'drag-hesitation' } };
  const trace = traceFor([action]);
  expect(validateMarketReplayTrace(trace, snapshot)).toEqual({ valid: true, errors: [] });
  const drag = trace.steps.find(step => step.type === 'dragProduct')!;
  drag.gesture.hesitationMs = 100;
  expect(validateMarketReplayTrace(reseal(trace), snapshot).errors).toContain(
    'Activity-duration timing requires zero drag hesitation; use an explicit pause action.');
  trace.generation!.timingProfile = 'actor-preserved-v1';
  expect(validateMarketReplayTrace(reseal(trace), snapshot)).toEqual({ valid: true, errors: [] });
});

test.each([
  { type: 'start' }, { type: 'closeView' }, { type: 'closeStation' }, { type: 'submitForReview' },
  { type: 'dragProduct', productId: 'milk', quantity: 1,
    gesture: { durationMs: 300, hesitationMs: 0, outcome: 'drop', motorSeed: 'drag-timing' } },
  { type: 'walkTo', target: { stationId: 'fresh' }, movement: { style: 'steady', speedMultiplier: .8,
    running: false, motorSeed: 'walk-timing', accelerationMs: 180 } },
] as AuthoredStep[])('$type cannot acquire an activity duration field', action => {
  const trace = traceFor(action.type === 'start' || action.type === 'submitForReview' ? [] : [action]);
  if (action.type === 'submitForReview') {
    Object.assign(trace.steps.at(-3)!, { type: 'submitForReview' });
    Object.assign(trace.steps.at(-2)!, { type: 'awaitReviewAccepted' });
  }
  expect(validateMarketReplayTrace(reseal(trace), snapshot)).toEqual({ valid: true, errors: [] });
  Object.assign(trace.steps.find(step => step.type === action.type)!, { durationMs: 0 });
  expect(validateMarketReplayTrace(reseal(trace), snapshot).errors.join(' ')).toMatch(/supported intention shape/);
});
