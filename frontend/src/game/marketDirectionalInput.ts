import type { Point } from './prototypeWorld';
import type { ReplayDirection } from './marketReplayPerception';

export const MARKET_DIRECTIONAL_MOVE_SPEED = 190;
export const MARKET_DIRECTIONAL_INPUT_TICK_MS = 10;
export type DirectionalMovement = { speedMultiplier: number; accelerationMs: number };
export type DirectionalInputSlice = { input: Point; durationMs: number };
/** Canonical joystick slices are consumed by the ordinary movement RAF, never as position setters. */
export type ReplayDirectionalInput = Point & { directionalSlices?: DirectionalInputSlice[] };

const vectors: Record<ReplayDirection, Point> = {
  north: { x: 0, y: -1 }, northeast: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  east: { x: 1, y: 0 }, southeast: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  south: { x: 0, y: 1 }, southwest: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  west: { x: -1, y: 0 }, northwest: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
};

/** Average a bounded ramp-up/hold/release profile over one canonical input interval. */
function averageMagnitude(from: number, to: number, duration: number, movement: DirectionalMovement): number {
  const acceleration = movement.accelerationMs;
  const envelope = (time: number) => Math.max(0, Math.min(1, time / acceleration, (duration - time) / acceleration));
  const breaks = [from, Math.min(acceleration, duration / 2), Math.max(duration - acceleration, duration / 2), to]
    .filter(time => time >= from && time <= to).sort((a, b) => a - b);
  let integral = 0;
  for (let index = 1; index < breaks.length; index++) {
    const a = breaks[index - 1], b = breaks[index];
    integral += (envelope(a) + envelope(b)) / 2 * (b - a);
  }
  return movement.speedMultiplier * integral / (to - from);
}

/** Both the offline guard and app replay integrate these exact slices in this order. */
export function directionalInputSlices(direction: ReplayDirection, durationMs: number,
  movement: DirectionalMovement): DirectionalInputSlice[] {
  if (!Object.hasOwn(vectors, direction) || !Number.isInteger(durationMs) || durationMs < 100 || durationMs > 2000
    || !Number.isFinite(movement.speedMultiplier) || movement.speedMultiplier < .4 || movement.speedMultiplier > 1
    || !Number.isInteger(movement.accelerationMs) || movement.accelerationMs < 100 || movement.accelerationMs > 300) {
    throw new Error('Invalid directional movement input');
  }
  const directionVector = vectors[direction], slices: DirectionalInputSlice[] = [];
  for (let elapsed = 0; elapsed < durationMs; elapsed += MARKET_DIRECTIONAL_INPUT_TICK_MS) {
    const end = Math.min(durationMs, elapsed + MARKET_DIRECTIONAL_INPUT_TICK_MS);
    const magnitude = averageMagnitude(elapsed, end, durationMs, movement);
    slices.push({ input: { x: directionVector.x * magnitude, y: directionVector.y * magnitude }, durationMs: end - elapsed });
  }
  return slices;
}

/** RAF partition affects only delivery time, not the collision integration sequence. */
export function createDirectionalInputPlayback(direction: ReplayDirection, durationMs: number, movement: DirectionalMovement) {
  const slices = directionalInputSlices(direction, durationMs, movement);
  let elapsed = 0, delivered = 0, next = 0;
  return {
    get done() { return next === slices.length; },
    takeFrame(dtMs: number): ReplayDirectionalInput {
      if (!Number.isFinite(dtMs) || dtMs < 0) throw new Error('Invalid directional movement frame time');
      elapsed = Math.min(durationMs, elapsed + dtMs);
      const directionalSlices: DirectionalInputSlice[] = [];
      while (next < slices.length && delivered + slices[next].durationMs <= elapsed + 1e-7) {
        const slice = slices[next++]; directionalSlices.push(slice); delivered += slice.durationMs;
      }
      // The averaged vector supports input display; integration consumes the canonical slices.
      const weighted = directionalSlices.reduce((sum, slice) => ({
        x: sum.x + slice.input.x * slice.durationMs, y: sum.y + slice.input.y * slice.durationMs,
      }), { x: 0, y: 0 });
      const magnitude = dtMs ? Math.hypot(weighted.x, weighted.y) / dtMs : 0;
      const scale = dtMs ? Math.min(1, movement.speedMultiplier / (magnitude || 1)) / dtMs : 0;
      return { x: weighted.x * scale, y: weighted.y * scale, directionalSlices };
    },
  };
}
