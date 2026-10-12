import {
  isMarketEnvironmentBlocked, MARKET_ENVIRONMENT_PLAYER_RADIUS,
  type MarketCashierAvailability, type MarketEnvironment,
} from './marketEnvironment';
import type { Point } from './prototypeWorld';

export type MarketMovementConstraints = {
  clamp: (point: Point) => Point;
  isBlocked: (point: Point) => boolean;
};

export type MarketMovementOutcome = {
  position: Point;
  requestedDelta: Point;
  actualDelta: Point;
  requestedDistancePx: number;
  movedDistancePx: number;
  outcome: 'moved' | 'partially-blocked' | 'blocked';
};

/** The same bounded samples and x-then-y wall sliding used by the human controls. */
export function resolveMarketMovement(
  position: Point, delta: Point, constraints: MarketMovementConstraints,
): MarketMovementOutcome {
  if (![position.x, position.y, delta.x, delta.y].every(Number.isFinite)) {
    throw new Error('Movement position and delta must be finite.');
  }
  let next = { ...position };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / 6));
  for (let index = 0; index < steps; index += 1) {
    const xCandidate = constraints.clamp({ x: next.x + delta.x / steps, y: next.y });
    if (!constraints.isBlocked(xCandidate)) next = xCandidate;
    const yCandidate = constraints.clamp({ x: next.x, y: next.y + delta.y / steps });
    if (!constraints.isBlocked(yCandidate)) next = yCandidate;
  }
  const actualDelta = { x: next.x - position.x, y: next.y - position.y };
  const requestedDistancePx = Math.hypot(delta.x, delta.y);
  const movedDistancePx = Math.hypot(actualDelta.x, actualDelta.y);
  const epsilon = 1e-7;
  const constrained = Math.hypot(actualDelta.x - delta.x, actualDelta.y - delta.y) > epsilon;
  return {
    position: next, requestedDelta: { ...delta }, actualDelta, requestedDistancePx, movedDistancePx,
    outcome: !constrained ? 'moved' : movedDistancePx <= epsilon ? 'blocked' : 'partially-blocked',
  };
}

export function resolveMarketEnvironmentMovement(
  environment: MarketEnvironment, position: Point, delta: Point,
  cashiers: Partial<MarketCashierAvailability> = {},
): MarketMovementOutcome {
  const radius = MARKET_ENVIRONMENT_PLAYER_RADIUS;
  return resolveMarketMovement(position, delta, {
    clamp: point => ({
      x: Math.max(radius, Math.min(point.x, environment.world.width - radius)),
      y: Math.max(radius, Math.min(point.y, environment.world.height - radius)),
    }),
    isBlocked: point => isMarketEnvironmentBlocked(environment, point, cashiers),
  });
}
