import { createMarketEnvironment, isMarketEnvironmentBlocked } from '../src/game/marketEnvironment';
import { createMarketSession } from '../src/game/marketSession';
import { DEFAULT_REPLAY_PRESENTATION, type ReplayDirection } from '../src/game/marketReplayPerception';
import { createDirectionalInputPlayback, directionalInputSlices, MARKET_DIRECTIONAL_MOVE_SPEED,
  type ReplayDirectionalInput } from '../src/game/marketDirectionalInput';
import { resolveMarketEnvironmentMovement } from '../src/game/marketMovement';
import { createMarketReplaySnapshot, marketReplayTraceId, validateMarketReplayTrace,
  type MarketReplayTrace } from '../src/game/marketReplayTrace';
import { createMotionReport, moveDirection, REPLAY_INPUT_RATE_LIMIT } from '../src/replay/motor';
import type { ReplayMotionPort, ReplayUiPort, ReplayUiState } from '../src/replay/ports';
import { playMarketTrace, type ReplayProgress } from '../src/replay/player';

const movement = { speedMultiplier: .8, accelerationMs: 180 };
const environment = createMarketEnvironment({ seed: 'direction-replay', employeeCount: 1, customerCount: 1,
  cashierCount: 0, pillarCount: 0, kioskPresent: false });
const cashiers = { checkout: false, 'checkout-2': false };
const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'direction-replay' }, environment),
  undefined, DEFAULT_REPLAY_PRESENTATION);
function traceFor(): MarketReplayTrace {
  const trace: MarketReplayTrace = {
    traceSchemaVersion: '2', traceId: '', personaId: 'mild-intellectual-disability-adult', personaVersion: '5',
    seed: 'direction-replay', generationPolicy: 'llm', policyVersion: '6', experienceMode: 'first-play',
    generation: { model: 'gpt-6-luna', reproducibility: 'captured-trace', actorPolicyVersion: 'feedback-choice-v2',
      timingProfile: 'activity-duration-v2', movementContract: 'joystick-direction-v1',
      feedback: { version: '1', observationScope: 'current-screen', memory: 'actor-authored', contextDelivery: 'external-frame', decisions: 2 } },
    target: { snapshotId: snapshot.snapshotId, completionMode: 'ai-review' },
    steps: [
      { id: 'start', type: 'start', reactionDelayMs: 0, timeoutMs: 10000, reason: 'start' },
      { id: 'move', type: 'moveDirection', direction: 'northwest', durationMs: 1007, movement,
        reactionDelayMs: 0, timeoutMs: 10000, reason: '위 왼쪽으로 걷는다.' },
      { id: 'stop', type: 'giveUp', reactionDelayMs: 0, timeoutMs: 10000, reason: 'stop' },
      { id: 'skip', type: 'skipRating', reactionDelayMs: 0, timeoutMs: 10000, reason: 'skip' },
      { id: 'leave', type: 'leave', reactionDelayMs: 0, timeoutMs: 10000, reason: 'leave' },
    ],
  };
  return reseal(trace);
}
function reseal(trace: MarketReplayTrace) { trace.traceId = marketReplayTraceId(trace); return trace; }

function harness() {
  let position = { ...environment.spawn };
  let driver: ((timestamp: number, dt: number) => ReplayDirectionalInput) | undefined;
  const controls = { locked: false, blocked: false, presentation: DEFAULT_REPLAY_PRESENTATION };
  const delivered: NonNullable<ReplayDirectionalInput['directionalSlices']> = [];
  const port: ReplayMotionPort = {
    read: () => ({ position: { ...position }, environment, cashiers, locked: controls.locked, presentation: controls.presentation }),
    drive: jest.fn(callback => { driver = callback; }), stop: jest.fn(() => { driver = undefined; }),
  };
  const frame = (milliseconds = 16) => {
    jest.advanceTimersByTime(milliseconds);
    if (!driver) return;
    const input = driver(Date.now(), milliseconds / 1000);
    for (const slice of input.directionalSlices ?? []) {
      delivered.push(slice);
      if (!controls.blocked && !controls.locked) position = resolveMarketEnvironmentMovement(environment, position,
        { x: slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
          y: slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000 }, cashiers).position;
      expect(isMarketEnvironmentBlocked(environment, position, cashiers)).toBe(false);
    }
  };
  return { port, controls, delivered, frame };
}
function observe(promise: Promise<void>) {
  const result = { settled: false, error: undefined as Error | undefined };
  void promise.then(() => { result.settled = true; }, error => { result.settled = true; result.error = error; });
  return result;
}
async function drive(h: ReturnType<typeof harness>, result: ReturnType<typeof observe>, frameTimes = [16], before?: (index: number) => void) {
  for (let index = 0; index < 1000 && !result.settled; index++) {
    await Promise.resolve(); before?.(index); h.frame(frameTimes[index % frameTimes.length]);
  }
  await Promise.resolve(); expect(result.settled).toBe(true);
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('canonical joystick integration includes the exact final partial interval, independently of RAF cadence', () => {
  const slices = directionalInputSlices('northeast', 1007, movement);
  expect(slices.reduce((sum, slice) => sum + slice.durationMs, 0)).toBe(1007);
  expect(slices.at(-1)?.durationMs).toBe(7);
  for (const timings of [[16], [8, 33, 47], [1007]]) {
    const playback = createDirectionalInputPlayback('northeast', 1007, movement), delivered = [];
    for (let i = 0; !playback.done; i++) delivered.push(...playback.takeFrame(timings[i % timings.length]).directionalSlices!);
    expect(delivered).toEqual(slices);
    expect(playback.takeFrame(100).directionalSlices).toEqual([]);
  }
  for (const slice of slices) {
    expect(Math.hypot(slice.input.x, slice.input.y)).toBeLessThanOrEqual(movement.speedMultiplier + 1e-12);
    expect(slice.input.x).toBeCloseTo(-slice.input.y, 12);
  }
});

test.each(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'] as ReplayDirection[])(
  '%s replay matches offline collision integration exactly across irregular frames', async direction => {
    const slices = directionalInputSlices(direction, 2000, movement);
    let expected = { ...environment.spawn };
    for (const slice of slices) expected = resolveMarketEnvironmentMovement(environment, expected,
      { x: slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
        y: slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000 }, cashiers).position;
    const h = harness(), report = createMotionReport();
    const result = observe(moveDirection(h.port, direction, 2000, DEFAULT_REPLAY_PRESENTATION, movement,
      new AbortController().signal, report));
    await drive(h, result, [8, 33, 16, 47]);
    expect(result.error).toBeUndefined(); expect(h.port.read().position).toEqual(expected);
    expect(h.delivered).toEqual(slices);
    expect(report).toMatchObject({ inputViolations: 0, displacementViolations: 0, replans: 0 });
    expect(report.maxInputRate).toBeLessThanOrEqual(REPLAY_INPUT_RATE_LIMIT + 1e-7);
    expect(h.port.stop).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
  });

test('fully blocked input completes normally without replanning, a target or a hidden destination', async () => {
  const h = harness(), report = createMotionReport(); h.controls.blocked = true;
  const result = observe(moveDirection(h.port, 'north', 1007, DEFAULT_REPLAY_PRESENTATION, movement,
    new AbortController().signal, report));
  await drive(h, result);
  expect(result.error).toBeUndefined(); expect(h.port.read().position).toEqual(environment.spawn);
  expect(h.delivered.reduce((sum, slice) => sum + slice.durationMs, 0)).toBe(1007);
  expect(report).toMatchObject({ distance: 0, replans: 0, inputViolations: 0 });
});

test.each(['abort', 'lock', 'presentation'] as const)('%s stops directional input and clears the driver', async interruption => {
  const h = harness(), controller = new AbortController();
  const result = observe(moveDirection(h.port, 'north', 2000, DEFAULT_REPLAY_PRESENTATION, movement, controller.signal, createMotionReport()));
  await drive(h, result, [16], index => {
    if (index !== 12) return;
    if (interruption === 'abort') controller.abort('operator stop');
    if (interruption === 'lock') h.controls.locked = true;
    if (interruption === 'presentation') h.controls.presentation = { ...DEFAULT_REPLAY_PRESENTATION, zoom: 2 };
  });
  expect(result.error?.message).toMatch(/operator stop|unavailable|presentation changed/);
  const before = h.port.read().position, count = h.delivered.length;
  for (let i = 0; i < 10; i++) h.frame();
  expect(h.port.read().position).toEqual(before); expect(h.delivered).toHaveLength(count);
  expect(h.port.stop).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test('a panel that cancels the UI RAF still rejects the active input and clears all timers', async () => {
  const h = harness();
  const result = observe(moveDirection(h.port, 'north', 2000, DEFAULT_REPLAY_PRESENTATION, movement,
    new AbortController().signal, createMotionReport()));
  await Promise.resolve(); h.frame(16); await Promise.resolve();
  h.controls.locked = true;
  // The real screen's lock handler can cancel RAF without invoking the motor again.
  await jest.advanceTimersByTimeAsync(32);
  expect(result.error?.message).toMatch(/unavailable/);
  expect(h.port.stop).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test('driver installation failure clears its deadline and availability watcher', async () => {
  const h = harness(); h.port.drive = () => { throw new Error('screen unmounted'); };
  await expect(moveDirection(h.port, 'north', 2000, DEFAULT_REPLAY_PRESENTATION, movement,
    new AbortController().signal, createMotionReport())).rejects.toThrow('screen unmounted');
  expect(h.port.stop).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test('new directional steps require their exact policy, timing, movement contract and bounded input shape', () => {
  expect(validateMarketReplayTrace(traceFor(), snapshot)).toEqual({ valid: true, errors: [] });
  const mutations: ((trace: MarketReplayTrace) => void)[] = [
    trace => { trace.generation!.actorPolicyVersion = 'feedback-choice-v1'; },
    trace => { trace.generation!.timingProfile = 'activity-duration-v1'; },
    trace => { delete trace.generation!.movementContract; },
    trace => { Object.assign(trace.steps[1], { durationMs: 2001 }); },
    trace => { Object.assign(trace.steps[1], { durationMs: 99 }); },
    trace => { Object.assign(trace.steps[1], { target: { stationId: 'fresh' } }); },
    trace => { Object.assign(trace.steps[1], { direction: 'fresh' }); },
    trace => { trace.steps[1].reactionDelayMs = 1; },
  ];
  for (const mutate of mutations) {
    const trace = traceFor(); mutate(trace);
    expect(validateMarketReplayTrace(reseal(trace), snapshot).valid).toBe(false);
  }
});

test('the player executes the new step once through joystick input and acknowledges its normal terminal tail', async () => {
  const h = harness(), state: ReplayUiState = { briefing: true, briefingStep: 0, phase: 'shopping', shelf: null,
    cartOpen: false, helpOpen: false, staffOpen: false, staffReturnHelp: false, panelTransition: false,
    reviewing: false, reviewAccepted: false, reviewError: null, cart: {} };
  const ui = { snapshot: () => snapshot, presentation: () => snapshot.presentation, read: () => state,
    advanceBriefing: () => { state.briefing = false; }, giveUp: () => { state.phase = 'finished'; },
    skipRating: () => {}, leave: async () => {},
  } as unknown as ReplayUiPort;
  const progress: ReplayProgress[] = [];
  const result = observe(playMarketTrace(traceFor(), () => ui, h.port, new AbortController().signal, value => progress.push(value)));
  await drive(h, result);
  expect(result.error).toBeUndefined(); expect(progress.at(-1)?.status).toBe('completed');
  expect(h.delivered).toEqual(directionalInputSlices('northwest', 1007, movement));
  expect(progress.at(-1)?.report.completedSteps.map(step => step.type)).toEqual(['start', 'moveDirection', 'giveUp', 'skipRating', 'leave']);
  expect(progress.at(-1)?.report.acknowledged).toBe(true);
});
