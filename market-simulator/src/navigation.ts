import { getMarketStationApproachPoint, isNearMarketStation, type MarketEnvironmentStationId } from '../../frontend/src/game/marketEnvironment';
import { getMarketNavigationPath } from '../../frontend/src/game/marketNavigation';
import type { Observation, Decision } from './types';
import type { Random } from './random';

/** Plans use only the actor-visible environment. Every waypoint becomes a guarded adapter move. */
export function planWalk(observation: Observation, station: MarketEnvironmentStationId, random: Random, speed: number): Decision[] | null {
  const { environment, playerPosition: start, cashierAvailability } = observation;
  const approach = getMarketStationApproachPoint(environment, station, {
    x: start.x + random.between(-45, 45), y: start.y + random.between(-45, 45),
  }, cashierAvailability) ?? getMarketStationApproachPoint(environment, station, start, cashierAvailability);
  if (!approach) return null;
  let path = getMarketNavigationPath(environment, start, approach, cashierAvailability);
  if (!path) {
    const nearest = getMarketStationApproachPoint(environment, station, start, cashierAvailability);
    path = nearest && getMarketNavigationPath(environment, start, nearest, cashierAvailability);
  }
  if (!path) return null;
  const decisions: Decision[] = [];
  let point = start;
  const stepLength = random.between(23, 29);
  // Speed is chosen per journey, rather than independent jitter at every frame.
  const journeySpeed = speed * random.between(0.88, 1.12);
  for (const waypoint of path) {
    const dx = waypoint.x - point.x, dy = waypoint.y - point.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / stepLength));
    for (let i = 1; i <= steps; i++) {
      decisions.push({ action: { type: 'move', dx: dx / steps, dy: dy / steps },
        delayMs: Math.max(1, Math.ceil(distance / steps / journeySpeed * 1000)), reason: `walk-to:${station}` });
    }
    point = waypoint;
  }
  if (!isNearMarketStation(environment, station, point, undefined, cashierAvailability)) return null;
  decisions.push({ action: { type: 'interact', station }, delayMs: 500, reason: `inspect:${station}` });
  return decisions;
}
