import { createMarketEnvironment, isMarketEnvironmentBlocked, isNearMarketStation,
  type MarketEnvironment, type MarketEnvironmentStationId } from '../src/game/marketEnvironment';
import type { Point } from '../src/game/prototypeWorld';
import { approachVector, createMotionReport, REPLAY_INPUT_RATE_LIMIT, walkToAnchor, walkToStation } from '../src/replay/motor';
import { DEFAULT_REPLAY_PRESENTATION, resolveReplayAnchor, visibleAnchors } from '../src/game/marketReplayPerception';
import type { ReplayMotionPort } from '../src/replay/ports';

const speed = 190;
const startTime = Date.parse('2026-09-26T12:00:00.000Z');
const cashiers = { checkout: true, 'checkout-2': true };
const environment = () => createMarketEnvironment({ seed: 'replay-motor-test',
  employeeCount: 1, customerCount: 1, employeeSlotIds: ['staff-southwest'],
  customerSlotIds: ['customer-southeast'], cashierCount: 2, pillarCount: 0, kioskPresent: false });
type Reading = { from: Point; to: Point; input: Point; dt: number };

/** Only this fake UI integration owns position. The motor only gets cloned observations and inputs. */
function movementHarness(env: MarketEnvironment = environment()) {
  let position = { ...env.spawn };
  let driver: ((timestamp: number, dt: number) => Point) | undefined;
  const frames: Reading[] = [];
  const controls = { blocked: false, locked: false };
  const port: ReplayMotionPort = {
    read: () => ({ position: { ...position }, environment: env, cashiers, locked: controls.locked }),
    drive: jest.fn(callback => { driver = callback; }),
    stop: jest.fn(() => { driver = undefined; }),
  };
  const frame = (milliseconds = 16) => {
    jest.advanceTimersByTime(milliseconds);
    if (!driver) return;
    const callback = driver;
    const dt = milliseconds / 1000;
    const input = callback(Date.now(), dt);
    const from = { ...position };
    // Match the existing UI's axis-by-axis collision integration, including large-frame substeps.
    if (!controls.blocked && !controls.locked) {
      const dx = input.x * speed * dt, dy = input.y * speed * dt;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
      for (let index = 0; index < steps; index++) {
        const x = { x: position.x + dx / steps, y: position.y };
        if (!isMarketEnvironmentBlocked(env, x, cashiers)) position = x;
        const y = { x: position.x, y: position.y + dy / steps };
        if (!isMarketEnvironmentBlocked(env, y, cashiers)) position = y;
      }
    }
    frames.push({ from, to: { ...position }, input, dt });
  };
  return { port, controls, frames, frame, env };
}
const movement = (seed = 'motor-1', multiplier = .6) => ({
  speedMultiplier: multiplier, accelerationMs: 220, motorSeed: seed, style: 'careful',
});
function observe(promise: Promise<void>) {
  const result = { settled: false, error: undefined as Error | undefined };
  void promise.then(() => { result.settled = true; }, error => { result.error = error; result.settled = true; });
  return result;
}
async function driveUntil(harness: ReturnType<typeof movementHarness>, result: ReturnType<typeof observe>,
  options: { frameDurations?: number[]; maximumFrames?: number; beforeFrame?: (frame: number) => void } = {}) {
  await Promise.resolve();
  const durations = options.frameDurations ?? [16];
  for (let index = 0; index < (options.maximumFrames ?? 8000) && !result.settled; index++) {
    options.beforeFrame?.(index);
    harness.frame(durations[index % durations.length]);
    await Promise.resolve();
  }
  expect(result.settled).toBe(true);
}
function assertPhysicalBounds(harness: ReturnType<typeof movementHarness>, multiplier: number) {
  let previousInput: Point = { x: 0, y: 0 };
  for (const { from, to, input, dt } of harness.frames) {
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeLessThanOrEqual(speed * multiplier * dt + 1e-7);
    expect(Math.hypot(input.x, input.y)).toBeLessThanOrEqual(multiplier + 1e-7);
    expect(Math.hypot(input.x - previousInput.x, input.y - previousInput.y)).toBeLessThanOrEqual(REPLAY_INPUT_RATE_LIMIT * dt + 1e-7);
    expect(isMarketEnvironmentBlocked(harness.env, to, cashiers)).toBe(false);
    previousInput = input;
  }
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(startTime); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('a visible local anchor is reached with normal input and zero global replans', async () => {
  const harness = movementHarness(), report = createMotionReport();
  const anchor = visibleAnchors(harness.env, harness.env.spawn, DEFAULT_REPLAY_PRESENTATION, cashiers)[0];
  const target = resolveReplayAnchor(harness.env, harness.env.spawn, anchor.id, DEFAULT_REPLAY_PRESENTATION, cashiers)!;
  const result = observe(walkToAnchor(harness.port, anchor.id, DEFAULT_REPLAY_PRESENTATION, movement(), new AbortController().signal, report));
  await driveUntil(harness, result);
  expect(result.error).toBeUndefined();
  const end = harness.port.read().position;
  expect(Math.hypot(end.x - target.x, end.y - target.y)).toBeLessThan(2);
  expect(report.replans).toBe(0);
  assertPhysicalBounds(harness, .6);
});

test('a blocked local exploration stops without finding a global detour', async () => {
  const harness = movementHarness(), report = createMotionReport(); harness.controls.blocked = true;
  const anchor = visibleAnchors(harness.env, harness.env.spawn, DEFAULT_REPLAY_PRESENTATION, cashiers)[0];
  const result = observe(walkToAnchor(harness.port, anchor.id, DEFAULT_REPLAY_PRESENTATION, movement(), new AbortController().signal, report));
  await driveUntil(harness, result, { maximumFrames: 200 });
  expect(result.error?.message).toMatch(/blocked; no global replan/);
  expect(report.replans).toBe(0);
  expect(harness.port.read().position).toEqual(harness.env.spawn);
  expect(jest.getTimerCount()).toBe(0);
});

test('local exploration stops immediately if actual zoom changes during movement', async () => {
  const harness = movementHarness(), originalRead = harness.port.read;
  let presentation = DEFAULT_REPLAY_PRESENTATION;
  harness.port.read = () => ({ ...originalRead(), presentation });
  const anchor = visibleAnchors(harness.env, harness.env.spawn, presentation, cashiers)[0];
  const result = observe(walkToAnchor(harness.port, anchor.id, presentation, movement(), new AbortController().signal, createMotionReport()));
  await driveUntil(harness, result, { beforeFrame: frame => { if (frame === 10) presentation = { ...presentation, zoom: 2 }; } });
  expect(result.error?.message).toMatch(/presentation changed/);
  const end = harness.port.read().position;
  for (let i = 0; i < 20; i++) harness.frame();
  expect(harness.port.read().position).toEqual(end);
});

test('input easing bounds diagonal changes without overshooting or changing an already reached target', () => {
  const previous = { x: -1, y: 0 }, target = { x: .6, y: .8 };
  const next = approachVector(previous, target, .1);
  expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeCloseTo(.1, 12);
  expect(approachVector(next, target, 10).x).toBeCloseTo(target.x, 12);
  expect(approachVector(next, target, 10).y).toBeCloseTo(target.y, 12);
  expect(approachVector(target, target, .1)).toEqual(target);
});

test.each(['fresh', 'produce', 'drink', 'checkout'] as MarketEnvironmentStationId[])(
  'closed-loop %s route reaches interaction range with bounded input and collision-safe motion', async station => {
    const harness = movementHarness(), report = createMotionReport();
    const result = observe(walkToStation(harness.port, station, movement(), new AbortController().signal, report));
    await driveUntil(harness, result, { frameDurations: [16, 16, 33, 8] });
    expect(result.error).toBeUndefined();
    expect(isNearMarketStation(harness.env, station, harness.port.read().position, undefined, cashiers)).toBe(true);
    expect(harness.frames.length).toBeGreaterThan(30);
    assertPhysicalBounds(harness, .6);
    expect(report).toMatchObject({ displacementViolations: 0, inputViolations: 0 });
    expect(report.maxInputRate).toBeLessThanOrEqual(REPLAY_INPUT_RATE_LIMIT + 1e-7);
    expect(harness.port.stop).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

test('same motor seed reproduces the input path, while a different seed changes steering within its bounds', async () => {
  async function run(seed: string) {
    jest.setSystemTime(startTime);
    const harness = movementHarness();
    const result = observe(walkToStation(harness.port, 'fresh', movement(seed), new AbortController().signal, createMotionReport()));
    await driveUntil(harness, result);
    expect(result.error).toBeUndefined();
    assertPhysicalBounds(harness, .6);
    return harness.frames.map(({ input }) => input);
  }
  const a = await run('same');
  expect(await run('same')).toEqual(a);
  expect(await run('different')).not.toEqual(a);
});

test('a temporary collision triggers a route replan from the actual position and then recovers', async () => {
  const harness = movementHarness(), report = createMotionReport();
  harness.controls.blocked = true;
  const result = observe(walkToStation(harness.port, 'fresh', movement(), new AbortController().signal, report));
  await driveUntil(harness, result, { beforeFrame: frame => { if (frame === 130) harness.controls.blocked = false; } });
  expect(result.error).toBeUndefined();
  expect(report.replans).toBeGreaterThanOrEqual(1);
  expect(isNearMarketStation(harness.env, 'fresh', harness.port.read().position, undefined, cashiers)).toBe(true);
  assertPhysicalBounds(harness, .6);
});

test('persistent collision stops after bounded replans without moving or teleporting to the destination', async () => {
  const harness = movementHarness(), report = createMotionReport();
  harness.controls.blocked = true;
  const result = observe(walkToStation(harness.port, 'fresh', movement(), new AbortController().signal, report));
  await driveUntil(harness, result, { maximumFrames: 500 });
  expect(result.error?.message).toMatch(/Blocked walking.*without teleporting/);
  expect(report.replans).toBe(3);
  expect(harness.port.read().position).toEqual(harness.env.spawn);
  expect(harness.frames.every(frame => frame.from.x === frame.to.x && frame.from.y === frame.to.y)).toBe(true);
  expect(harness.port.stop).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('cancellation stops the input source immediately and preserves the observed current position', async () => {
  const harness = movementHarness(), controller = new AbortController();
  const result = observe(walkToStation(harness.port, 'fresh', movement(), controller.signal, createMotionReport()));
  await Promise.resolve();
  for (let frame = 0; frame < 20; frame++) harness.frame();
  const before = harness.port.read().position;
  controller.abort('operator stop');
  await driveUntil(harness, result);
  for (let frame = 0; frame < 100; frame++) harness.frame();
  expect(result.error?.message).toBe('operator stop');
  expect(harness.port.read().position).toEqual(before);
  expect(harness.port.stop).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('a locked initial screen receives no input, and cancellation while waiting leaves the player untouched', async () => {
  const harness = movementHarness(), controller = new AbortController();
  harness.controls.locked = true;
  const result = observe(walkToStation(harness.port, 'fresh', movement(), controller.signal, createMotionReport()));
  await Promise.resolve(); harness.frame(48); await Promise.resolve();
  expect(harness.port.drive).not.toHaveBeenCalled();
  controller.abort('screen left');
  await driveUntil(harness, result, { maximumFrames: 10 });
  expect(result.error?.message).toBe('screen left');
  expect(harness.port.read().position).toEqual(harness.env.spawn);
  expect(jest.getTimerCount()).toBe(0);
});

test('walking timeout cancels the active driver without treating a partial route as success', async () => {
  const harness = movementHarness();
  const result = observe(walkToStation(harness.port, 'fresh', movement(), new AbortController().signal, createMotionReport(), 100));
  await driveUntil(harness, result, { maximumFrames: 20 });
  expect(result.error?.message).toMatch(/timed out/);
  expect(harness.port.stop).toHaveBeenCalledTimes(1);
  expect(isNearMarketStation(harness.env, 'fresh', harness.port.read().position, undefined, cashiers)).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});
