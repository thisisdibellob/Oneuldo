import { getMarketNavigationPath, isMarketNavigationSegmentClear } from '../game/marketNavigation';
import { getMarketStationApproachPoint, isNearMarketStation, type MarketEnvironmentStationId } from '../game/marketEnvironment';
import type { Point } from '../game/prototypeWorld';
import { replayDelay, replayUntil, type ReplayMotionPort, type ReplayShelfPort } from './ports';
import { replayPresentationKey, resolveReplayAnchor, visibleStations, type ReplayDirection, type ReplayPresentation } from '../game/marketReplayPerception';
import { createDirectionalInputPlayback, createCanonicalInputPlayback, MARKET_DIRECTIONAL_MOVE_SPEED,
  MARKET_DIRECTIONAL_INPUT_TICK_MS, type DirectionalMovement } from '../game/marketDirectionalInput';
import { approachMovementVector, nextLocalWalkInput, localWalkInputSlices } from '../game/marketLocalInput';

const MOVE_SPEED = 190;
export const REPLAY_INPUT_RATE_LIMIT = 10; // Full magnitude ramp >= 100ms; measured in input units/second.
export type MotionReport = {
  frames: number; distance: number; maxDisplacement: number; maxSpeedRatio: number;
  maxInputDelta: number; maxInputRate: number; displacementViolations: number;
  inputViolations: number; replans: number; dragFrames: number; dragCount: number;
};
export const createMotionReport = (): MotionReport => ({ frames: 0, distance: 0, maxDisplacement: 0,
  maxSpeedRatio: 0, maxInputDelta: 0, maxInputRate: 0, displacementViolations: 0,
  inputViolations: 0, replans: 0, dragFrames: 0, dragCount: 0 });

export const approachVector = approachMovementVector;

/** A bounded joystick input independent of visible targets; collision is an ordinary movement result. */
export async function moveDirection(port: ReplayMotionPort, direction: ReplayDirection, durationMs: number,
  presentation: ReplayPresentation, movement: DirectionalMovement, signal: AbortSignal, report: MotionReport,
  timeoutMs = 10000): Promise<void> {
  const playback = createDirectionalInputPlayback(direction, durationMs, movement);
  return playCanonicalInput(port, playback, presentation, signal, report, timeoutMs);
}
async function playCanonicalInput(port: ReplayMotionPort, playback: ReturnType<typeof createCanonicalInputPlayback>,
  presentation: ReplayPresentation, signal: AbortSignal, report: MotionReport, timeoutMs: number,
  initialSampleMs = 0): Promise<void> {
  const profile = replayPresentationKey(presentation);
  let previous = port.read().position, previousIntegrationMs = 0, previousInput = { x: 0, y: 0 }, previousSliceMs = initialSampleMs;
  try {
    await replayUntil(() => !port.read().locked, signal);
    previous = port.read().position;
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (error?: Error) => {
        if (done) return; done = true;
        clearTimeout(deadline); clearInterval(availabilityCheck); signal.removeEventListener('abort', abort);
        error ? reject(error) : resolve();
      };
      const abort = () => finish(new Error(String(signal.reason ?? 'Replay stopped')));
      const deadline = setTimeout(() => finish(new Error('Directional movement timed out')), timeoutMs);
      const assertWorldAvailable = () => {
        const state = port.read();
        if (state.locked) throw new Error('Replay world became unavailable during directional movement');
        if (state.presentation && replayPresentationKey(state.presentation) !== profile)
          throw new Error('Replay presentation changed during directional movement');
        return state;
      };
      // A panel may cancel the UI's RAF before it can call the driver again.
      const availabilityCheck = setInterval(() => {
        try { assertWorldAvailable(); }
        catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
      }, 32);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      try { port.drive((_timestamp, dt) => {
        if (done) return { x: 0, y: 0 };
        try {
          const state = assertWorldAvailable();
          const displacement = Math.hypot(state.position.x - previous.x, state.position.y - previous.y);
          if (previousIntegrationMs > 0) {
            const bound = MARKET_DIRECTIONAL_MOVE_SPEED * previousIntegrationMs / 1000;
            report.frames++; report.distance += displacement;
            report.maxDisplacement = Math.max(report.maxDisplacement, displacement);
            report.maxSpeedRatio = Math.max(report.maxSpeedRatio, displacement / bound);
            if (displacement > bound + 1e-5) report.displacementViolations++;
          }
          previous = { ...state.position };
          // The previous RAF has already applied the final slice before this acknowledgement.
          if (playback.done) { finish(); return { x: 0, y: 0 }; }
          const input = playback.takeFrame(dt * 1000);
          previousIntegrationMs = 0;
          for (const slice of input.directionalSlices ?? []) {
            previousIntegrationMs += slice.durationMs;
            const change = Math.hypot(slice.input.x - previousInput.x, slice.input.y - previousInput.y);
            // Samples are interval means: their clock is the distance between interval midpoints.
            const seconds = (previousSliceMs + slice.durationMs) / 2000;
            report.maxInputDelta = Math.max(report.maxInputDelta, change);
            report.maxInputRate = Math.max(report.maxInputRate, change / seconds);
            if (change > REPLAY_INPUT_RATE_LIMIT * seconds + 1e-6) report.inputViolations++;
            previousInput = slice.input;
            previousSliceMs = slice.durationMs;
          }
          return input;
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error))); return { x: 0, y: 0 };
        }
      }); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
  } finally { port.stop(); }
}
function seedPhase(seed: string | number): number {
  let n = 2166136261;
  for (const char of String(seed)) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return (n >>> 0) / 4294967296 * Math.PI * 2;
}

/** Called by the existing movement RAF, so steering and collision integration share a clock. */
export async function walkToStation(port: ReplayMotionPort, station: MarketEnvironmentStationId,
  movement: { speedMultiplier: number; accelerationMs: number; motorSeed: string | number; style?: string },
  signal: AbortSignal, report: MotionReport, timeoutMs = 120000): Promise<void> {
  await replayUntil(() => !port.read().locked, signal);
  const start = port.read();
  const approach = getMarketStationApproachPoint(start.environment, station, start.position, start.cashiers);
  if (!approach) throw new Error(`No reachable approach point for ${station}`);
  let target: Point = approach;
  let waypoints = getMarketNavigationPath(start.environment, start.position, target, start.cashiers);
  if (!waypoints) throw new Error(`No path to ${station}`);
  if (!waypoints.length) return;
  const speed = Math.max(0.15, Math.min(1, movement.speedMultiplier));
  const inputRate = 1000 / Math.max(100, Math.min(300, movement.accelerationMs));
  const phase = seedPhase(movement.motorSeed);
  let input = { x: 0, y: 0 }, previous = { ...start.position }, previousDt = 0;
  let travelledSinceCheck = 0, checkAt = 0, replans = 0, stopping = false;
  const started = Date.now();
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true; clearTimeout(deadline); signal.removeEventListener('abort', abort);
      port.stop(); error ? reject(error) : resolve();
    };
    const abort = () => finish(new Error(String(signal.reason ?? 'Replay stopped')));
    const deadline = setTimeout(() => finish(new Error(`Walking to ${station} timed out`)), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    port.drive((timestamp, dt) => {
      try {
        if (done) return { x: 0, y: 0 };
        const state = port.read(), current = state.position;
        const displacement = Math.hypot(current.x - previous.x, current.y - previous.y);
        if (previousDt > 0) {
          const bound = MOVE_SPEED * previousDt;
          report.frames++; report.distance += displacement; travelledSinceCheck += displacement;
          report.maxDisplacement = Math.max(report.maxDisplacement, displacement);
          report.maxSpeedRatio = Math.max(report.maxSpeedRatio, displacement / bound);
          if (displacement > bound + 1e-5) report.displacementViolations++;
        }
        previous = { ...current }; previousDt = dt;
        const remaining = Math.hypot(target.x - current.x, target.y - current.y);
        // Stop within interaction range, with room for the deceleration arc.
        const arrived = isNearMarketStation(state.environment, station, current, undefined, state.cashiers);
        if (arrived && remaining < 24) stopping = true;
        if (!checkAt) checkAt = timestamp;
        if (!stopping && timestamp - checkAt > 1500) {
          if (travelledSinceCheck < 4) {
            if (++replans > 3) throw new Error(`Blocked walking to ${station}; stopping without teleporting`);
            const newTarget = getMarketStationApproachPoint(state.environment, station, current, state.cashiers);
            waypoints = newTarget ? getMarketNavigationPath(state.environment, current, newTarget, state.cashiers) : null;
            if (!waypoints?.length) throw new Error(`Replanning ${station} failed`);
            target = newTarget!;
            report.replans++;
          }
          checkAt = timestamp; travelledSinceCheck = 0;
        }
        while (waypoints!.length > 1 && Math.hypot(waypoints![0].x - current.x, waypoints![0].y - current.y) < 24
          && isMarketNavigationSegmentClear(state.environment, current, waypoints![1], state.cashiers)) waypoints!.shift();
        const next = waypoints![0] ?? target;
        let dx = next.x - current.x, dy = next.y - current.y;
        const distance = Math.hypot(dx, dy);
        // Small seeded steering variation stays inside the existing collision path.
        const sway = movement.style === 'careful' ? 0.009 : 0.006;
        const angle = Math.atan2(dy, dx) + (remaining > 70 ? Math.sin((Date.now() - started) / 650 + phase) * sway : 0);
        const magnitude = stopping ? 0 : Math.min(speed, Math.max(0.08, remaining / 65 * speed));
        const desired = distance < 2 ? { x: 0, y: 0 } : { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
        const nextInput = approachVector(input, desired, inputRate * dt);
        const delta = Math.hypot(nextInput.x - input.x, nextInput.y - input.y);
        report.maxInputDelta = Math.max(report.maxInputDelta, delta);
        if (dt > 0) report.maxInputRate = Math.max(report.maxInputRate, delta / dt);
        if (delta > REPLAY_INPUT_RATE_LIMIT * dt + 1e-6) report.inputViolations++;
        input = nextInput;
        if (stopping && Math.hypot(input.x, input.y) < 0.001) {
          if (!arrived) throw new Error(`Stopped outside interaction range of ${station}`);
          finish(); return { x: 0, y: 0 };
        }
        return input;
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return { x: 0, y: 0 }; }
    });
  });
}

/** V2 local intention: one visible straight segment, never a global route or a replan. */
async function walkLocal(port: ReplayMotionPort, target: Point, presentation: ReplayPresentation,
  movement: { speedMultiplier: number; accelerationMs: number }, signal: AbortSignal, report: MotionReport,
  timeoutMs: number): Promise<void> {
  await replayUntil(() => !port.read().locked, signal);
  const start = port.read();
  if (Math.hypot(target.x - start.position.x, target.y - start.position.y) > 180
    || !isMarketNavigationSegmentClear(start.environment, start.position, target, start.cashiers)) throw new Error('Local replay segment is not visible and clear');
  const profile = replayPresentationKey(presentation);
  let previous = start.position, previousDt = 0, input = { x: 0, y: 0 }, stopping = false;
  let progressDistance = 0, progressAt = 0;
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (error?: Error) => {
      if (done) return; done = true;
      clearTimeout(deadline); signal.removeEventListener('abort', abort); port.stop();
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new Error(String(signal.reason ?? 'Replay stopped')));
    const deadline = setTimeout(() => finish(new Error('Local replay walking timed out')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    port.drive((timestamp, dt) => {
      if (done) return { x: 0, y: 0 };
      try {
        const state = port.read(), current = state.position;
        if (state.presentation && replayPresentationKey(state.presentation) !== profile) throw new Error('Replay presentation changed during local walking');
        if (state.locked) throw new Error('Replay world became unavailable while walking');
        const displacement = Math.hypot(current.x - previous.x, current.y - previous.y);
        if (previousDt > 0) {
          report.frames++; report.distance += displacement; progressDistance += displacement;
          report.maxDisplacement = Math.max(report.maxDisplacement, displacement);
          report.maxSpeedRatio = Math.max(report.maxSpeedRatio, displacement / (MOVE_SPEED * previousDt));
          if (displacement > MOVE_SPEED * previousDt + 1e-5) report.displacementViolations++;
        }
        previous = { ...current }; previousDt = dt;
        if (!progressAt) progressAt = timestamp;
        if (timestamp - progressAt > 1500) {
          if (progressDistance < 2 && !stopping) throw new Error('Local exploration blocked; no global replan or teleport');
          progressAt = timestamp; progressDistance = 0;
        }
        const nextControl = nextLocalWalkInput(current, target, input, stopping, movement, dt);
        stopping = nextControl.stopping;
        const next = nextControl.input, change = Math.hypot(next.x - input.x, next.y - input.y);
        report.maxInputDelta = Math.max(report.maxInputDelta, change);
        if (dt > 0) report.maxInputRate = Math.max(report.maxInputRate, change / dt);
        if (change > REPLAY_INPUT_RATE_LIMIT * dt + 1e-6) report.inputViolations++;
        input = next;
        if (nextControl.done) { finish(); return { x: 0, y: 0 }; }
        return input;
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return { x: 0, y: 0 }; }
    });
  });
}

export async function walkToAnchor(port: ReplayMotionPort, id: string, presentation: ReplayPresentation,
  movement: { speedMultiplier: number; accelerationMs: number }, signal: AbortSignal, report: MotionReport, timeoutMs = 120000): Promise<void> {
  await replayUntil(() => !port.read().locked, signal);
  const state = port.read(), target = resolveReplayAnchor(state.environment, state.position, id, presentation, state.cashiers);
  if (!target) throw new Error('Anchor is not a visible local exploration choice');
  return walkLocal(port, target, presentation, movement, signal, report, timeoutMs);
}

/** directional-v2 only: identical canonical controller/collision inputs offline and in the app. */
export async function walkToAnchorFixed(port: ReplayMotionPort, id: string, presentation: ReplayPresentation,
  movement: DirectionalMovement, signal: AbortSignal, report: MotionReport, timeoutMs = 120000): Promise<void> {
  await replayUntil(() => !port.read().locked, signal);
  const state = port.read(), target = resolveReplayAnchor(state.environment, state.position, id, presentation, state.cashiers);
  if (!target) throw new Error('Anchor is not a visible local exploration choice');
  if (Math.hypot(target.x - state.position.x, target.y - state.position.y) > 180
    || !isMarketNavigationSegmentClear(state.environment, state.position, target, state.cashiers))
    throw new Error('Local replay segment is not visible and clear');
  const slices = localWalkInputSlices(state.environment, state.position, target, state.cashiers, movement, timeoutMs);
  return playCanonicalInput(port, createCanonicalInputPlayback(slices, movement.speedMultiplier), presentation,
    signal, report, timeoutMs, MARKET_DIRECTIONAL_INPUT_TICK_MS);
}

export async function walkToVisibleStation(port: ReplayMotionPort, station: MarketEnvironmentStationId, presentation: ReplayPresentation,
  movement: { speedMultiplier: number; accelerationMs: number }, signal: AbortSignal, report: MotionReport, timeoutMs = 120000): Promise<void> {
  await replayUntil(() => !port.read().locked, signal);
  const state = port.read();
  // Planning reserves arrival margin; execution checks only the real current UI range.
  if (!visibleStations(state.environment, state.position, presentation, state.cashiers, 0).some(s => s.id === station && s.near)) throw new Error('Station requires a visible nearby affordance');
  const target = getMarketStationApproachPoint(state.environment, station, state.position, state.cashiers);
  if (!target) throw new Error('Station has no local approach');
  return walkLocal(port, target, presentation, movement, signal, report, timeoutMs);
}

export async function dragProduct(port: ReplayShelfPort, productId: string,
  gesture: { durationMs: number; hesitationMs: number; outcome: 'drop' | 'cancel' | 'miss'; motorSeed: string | number },
  signal: AbortSignal, report: MotionReport, visibleOnly = false, verifyPresentation?: () => void): Promise<void> {
  signal.throwIfAborted();
  verifyPresentation?.();
  const bounds = await port.measure(productId, { visibleOnly });
  signal.throwIfAborted();
  verifyPresentation?.();
  const start = { x: bounds.product.x + bounds.product.width / 2, y: bounds.product.y + bounds.product.height / 2 };
  const end = { x: bounds.basket.x + bounds.basket.width * .5, y: bounds.basket.y + bounds.basket.height * .5 };
  if (gesture.outcome === 'miss') end.x = bounds.basket.x - 24;
  port.start(productId, start);
  let last = start;
  try {
    await replayDelay(gesture.hesitationMs, signal);
    const duration = Math.max(350, gesture.durationMs);
    const phase = seedPhase(gesture.motorSeed), bend = Math.sin(phase) * 36;
    const control = { x: (start.x + end.x) / 2 + bend, y: start.y + (end.y - start.y) * .25 };
    await new Promise<void>((resolve, reject) => {
      let frame: number, started: number | null = null;
      const cancel = () => { cancelAnimationFrame(frame); reject(new Error(String(signal.reason ?? 'Replay stopped'))); };
      signal.addEventListener('abort', cancel, { once: true });
      const tick = (time: number) => {
        if (signal.aborted) { cancel(); return; }
        try { verifyPresentation?.(); }
        catch (error) { signal.removeEventListener('abort', cancel); reject(error); return; }
        started ??= time;
        const t = Math.min(1, (time - started) / duration), u = t * t * (3 - 2 * t), v = 1 - u;
        last = { x: v * v * start.x + 2 * v * u * control.x + u * u * end.x,
          y: v * v * start.y + 2 * v * u * control.y + u * u * end.y };
        port.move(last); report.dragFrames++;
        if (t === 1) { signal.removeEventListener('abort', cancel); resolve(); }
        else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    port.finish(last, gesture.outcome === 'cancel'); report.dragCount++;
    await replayDelay(240, signal);
  } catch (error) { port.finish(last, true); throw error; }
}
