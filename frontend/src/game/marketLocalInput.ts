import type { Point } from './prototypeWorld';
import type { MarketEnvironment, MarketCashierAvailability } from './marketEnvironment';
import { resolveMarketEnvironmentMovement } from './marketMovement';
import { MARKET_DIRECTIONAL_INPUT_TICK_MS, MARKET_DIRECTIONAL_MOVE_SPEED,
  type DirectionalInputSlice, type DirectionalMovement } from './marketDirectionalInput';

export function approachMovementVector(previous: Point, target: Point, maximumChange: number): Point {
  const dx = target.x - previous.x, dy = target.y - previous.y, length = Math.hypot(dx, dy);
  const scale = length > maximumChange ? maximumChange / length : 1;
  return { x: previous.x + dx * scale, y: previous.y + dy * scale };
}

/** The existing local motor controller. Legacy RAF and fixed-input replay share
 * these exact steering, acceleration and stop rules; neither sets a position. */
export function nextLocalWalkInput(position: Point, target: Point, previous: Point, stopping: boolean,
  movement: DirectionalMovement, dtSeconds: number) {
  const speed = Math.max(.15, Math.min(1, movement.speedMultiplier));
  const inputRate = 1000 / Math.max(100, Math.min(300, movement.accelerationMs));
  const dx = target.x - position.x, dy = target.y - position.y, distance = Math.hypot(dx, dy);
  if (distance < .6) stopping = true;
  const magnitude = stopping ? 0 : Math.min(speed, Math.max(.015, distance / 30 * speed));
  const desired = distance < .001 ? { x: 0, y: 0 } : { x: dx / distance * magnitude, y: dy / distance * magnitude };
  const input = approachMovementVector(previous, desired, inputRate * dtSeconds);
  return { input, stopping, done: stopping && Math.hypot(input.x, input.y) < .001 };
}

/** Canonical 10ms controller inputs with the same game collision integration.
 * The frontend consumes these inputs through its ordinary movement RAF and the
 * offline guard consumes them through bounded moveInput actions. The residual
 * position is the controller's real stop result, never a snap to the target. */
export function localWalkInputSlices(environment: MarketEnvironment, start: Point, target: Point,
  cashiers: Partial<MarketCashierAvailability>, movement: DirectionalMovement,
  timeoutMs = 120000): DirectionalInputSlice[] {
  if (![start.x, start.y, target.x, target.y, movement.speedMultiplier, movement.accelerationMs, timeoutMs].every(Number.isFinite)
    || movement.speedMultiplier < .4 || movement.speedMultiplier > 1
    || !Number.isInteger(movement.accelerationMs) || movement.accelerationMs < 100 || movement.accelerationMs > 300
    || timeoutMs <= 0 || timeoutMs > 300000) throw new Error('Invalid fixed local movement input');
  let position = { ...start }, input = { x: 0, y: 0 }, stopping = false, progressDistance = 0, progressAt = 0;
  const slices: DirectionalInputSlice[] = [], durationMs = MARKET_DIRECTIONAL_INPUT_TICK_MS;
  for (let elapsedMs = durationMs; elapsedMs <= timeoutMs; elapsedMs += durationMs) {
    if (elapsedMs - progressAt > 1500) {
      if (progressDistance < 2 && !stopping) throw new Error('Local exploration blocked; no global replan or teleport');
      progressAt = elapsedMs; progressDistance = 0;
    }
    const next = nextLocalWalkInput(position, target, input, stopping, movement, durationMs / 1000);
    stopping = next.stopping;
    input = next.done ? { x: 0, y: 0 } : next.input;
    slices.push({ input, durationMs });
    const moved = resolveMarketEnvironmentMovement(environment, position, {
      x: input.x * MARKET_DIRECTIONAL_MOVE_SPEED * durationMs / 1000,
      y: input.y * MARKET_DIRECTIONAL_MOVE_SPEED * durationMs / 1000,
    }, cashiers).position;
    progressDistance += Math.hypot(moved.x - position.x, moved.y - position.y);
    position = moved;
    if (next.done) return slices;
  }
  throw new Error('Local replay walking timed out');
}
