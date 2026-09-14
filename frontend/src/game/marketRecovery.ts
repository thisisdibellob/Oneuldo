import { isMarketEnvironmentBlocked, type MarketCashierAvailability, type MarketEnvironment } from './marketEnvironment';
import { isMarketNavigationSegmentClear } from './marketNavigation';
import type { Point } from './prototypeWorld';

const SEARCH_STEP = 12;
const PREFERRED_DISTANCE = 48;

/** Recover locally without crossing an alarm boundary or replacing the shopping session. */
export function getMarketRecoveryPoint(
  environment: MarketEnvironment,
  current: Point,
  cashierAvailability: boolean | Partial<MarketCashierAvailability> = false,
): Point | null {
  const { width, height } = environment.world;
  if (!Number.isFinite(current.x) || !Number.isFinite(current.y)
    || current.x < 0 || current.x > width || current.y < 0 || current.y > height) return null;

  const gates = environment.alarmGates ?? [{
    axis: 'y' as const, boundary: environment.entrance.alarmBoundaryY, outward: 1 as const,
  }];
  const startsBlocked = isMarketEnvironmentBlocked(environment, current, cashierAvailability);
  const canReachWithoutSkippingObstacle = (point: Point) => {
    if (!startsBlocked) return isMarketNavigationSegmentClear(environment, current, point, cashierAvailability);
    // When already stuck inside a collider, leave that continuous blocked region once.
    // After the first free foot position, no second wall, person or construction fence may be skipped.
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - current.x, point.y - current.y) / 3));
    for (let index = 1; index <= steps; index++) {
      const candidate = { x: current.x + (point.x - current.x) * index / steps,
        y: current.y + (point.y - current.y) * index / steps };
      if (!isMarketEnvironmentBlocked(environment, candidate, cashierAvailability)) {
        return isMarketNavigationSegmentClear(environment, candidate, point, cashierAvailability);
      }
    }
    return false;
  };
  const isSafe = (point: Point) => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height
    && gates.every(gate => {
      const before = (current[gate.axis] - gate.boundary) * gate.outward;
      const after = (point[gate.axis] - gate.boundary) * gate.outward;
      // Exactly on a boundary, recover inward instead of granting a free outward crossing.
      return before <= 0 ? after <= 0 : after > 0;
    })
    && !isMarketEnvironmentBlocked(environment, point, cashierAvailability)
    && canReachWithoutSkippingObstacle(point);

  const searchRing = (radius: number): Point | null => {
    const offsets: Point[] = [];
    for (let offset = -radius; offset <= radius; offset += SEARCH_STEP) {
      offsets.push({ x: offset, y: -radius }, { x: offset, y: radius });
      if (offset > -radius && offset < radius) {
        offsets.push({ x: -radius, y: offset }, { x: radius, y: offset });
      }
    }
    // Cardinal points first, then the nearest points around the same square ring.
    offsets.sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y || a.y - b.y || a.x - b.x);
    for (const offset of offsets) {
      const point = { x: current.x + offset.x, y: current.y + offset.y };
      if (isSafe(point)) return point;
    }
    return null;
  };

  const limit = Math.ceil(Math.max(current.x, width - current.x, current.y, height - current.y) / SEARCH_STEP) * SEARCH_STEP;
  for (let radius = PREFERRED_DISTANCE; radius <= limit; radius += SEARCH_STEP) {
    const point = searchRing(radius);
    if (point) return point;
  }
  // A tiny isolated free area is still safer than crossing a gate or returning a blocked point.
  for (let radius = SEARCH_STEP; radius < PREFERRED_DISTANCE; radius += SEARCH_STEP) {
    const point = searchRing(radius);
    if (point) return point;
  }
  return isSafe(current) ? { ...current } : null;
}