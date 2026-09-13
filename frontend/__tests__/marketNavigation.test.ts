import { createMarketEnvironment, getMarketStationApproachPoint, isMarketEnvironmentBlocked, MARKET_LAYOUT_OPTIONS } from '../src/game/marketEnvironment';
import { getMarketNavigationPath, isMarketNavigationSegmentClear } from '../src/game/marketNavigation';
import type { Point } from '../src/game/prototypeWorld';

const environment = createMarketEnvironment({ seed: 'touch-navigation', employeeCount: 1, customerCount: 1,
  employeeSlotIds: ['staff-southwest'], customerSlotIds: ['customer-southeast'], cashierCount: 2, pillarCount: 0, kioskPresent: false });

function verifyRoute(from: Point, to: Point) {
  const path = getMarketNavigationPath(environment, from, to, { checkout: true, 'checkout-2': true });
  expect(path).not.toBeNull();
  expect(path?.at(-1)).toEqual(to);
  let previous = from;
  for (const point of path!) {
    expect(isMarketNavigationSegmentClear(environment, previous, point, true)).toBe(true);
    // Verify every world pixel, including between the navigation helper's coarser samples.
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y)));
    for (let index = 0; index <= steps; index += 1) {
      expect(isMarketEnvironmentBlocked(environment, { x: previous.x + (point.x - previous.x) * index / steps,
        y: previous.y + (point.y - previous.y) * index / steps }, true)).toBe(false);
    }
    previous = point;
  }
  return path!;
}

it('keeps an unobstructed same-aisle route direct and returns no movement when already there', () => {
  const from = { x: 470, y: 1280 }; const to = { x: 850, y: 1350 };
  expect(verifyRoute(from, to)).toEqual([to]);
  expect(getMarketNavigationPath(environment, from, from)).toEqual([]);
});

it('walks around the reduced checkout corner into its customer aisle instead of stopping at the counter', () => {
  const from = { x: 680, y: 980 }; const to = environment.checkouts[0].point;
  expect(isMarketNavigationSegmentClear(environment, from, to, true)).toBe(false);
  expect(verifyRoute(from, to).length).toBeGreaterThan(1);
});

it('crosses the real forty-pixel gap between vertical shelf units', () => {
  const from = { x: 327, y: 516 }; const to = { x: 485, y: 516 };
  expect(verifyRoute(from, to)).toEqual([to]);
});

it('finds the designated side doorway around a solid sales-floor wall and rejects a destination inside the wall', () => {
  verifyRoute({ x: 240, y: 500 }, { x: 327, y: 412 });
  expect(getMarketNavigationPath(environment, { x: 240, y: 500 }, { x: 298, y: 500 })).toBeNull();
  expect(getMarketNavigationPath(environment, { x: 240, y: 500 }, { x: NaN, y: 500 })).toBeNull();
});

it('recomputes a route against called cashiers and rejects the solid elevator facade', () => {
  const unstaffed = createMarketEnvironment({ seed: 'navigation-cashier-call', employeeCount: 1, customerCount: 1,
    employeeSlotIds: ['staff-southwest'], customerSlotIds: ['customer-southeast'], cashierCount: 0, pillarCount: 0, kioskPresent: false });
  const from = { x: 650, y: 1100 }; const target = unstaffed.checkout.cashierPoint;
  expect(getMarketNavigationPath(unstaffed, from, target)).not.toBeNull();
  expect(getMarketNavigationPath(unstaffed, from, target, { checkout: true })).toBeNull();
  const behindElevatorWall = { x: 180, y: 110 };
  expect(isMarketEnvironmentBlocked(environment, behindElevatorWall)).toBe(true);
  expect(getMarketNavigationPath(environment, environment.spawn, behindElevatorWall)).toBeNull();
});

it('keeps the elevator lobby approach open but never routes into the visible wall between doors', () => {
  verifyRoute({ x: 240, y: 315 }, { x: 165, y: 260 });
  expect(isMarketNavigationSegmentClear(environment, { x: 165, y: 260 }, { x: 165, y: 220 })).toBe(false);
  expect(getMarketNavigationPath(environment, { x: 240, y: 315 }, { x: 165, y: 220 })).toBeNull();
});

it.each(MARKET_LAYOUT_OPTIONS.flatMap(layout => [false, true].map(entranceConstruction => ({ ...layout, entranceConstruction }))))(
  '$label 공사=$entranceConstruction: 100개 최대 밀집 시드에서 모든 목적지까지 실제 경로를 생성한다', ({ id: layoutId, entranceConstruction }) => {
  for (let seed = 0; seed < 100; seed++) {
    const env = createMarketEnvironment({ layoutId, entranceConstruction, seed, shelfOrder: 'random', employeeCount: 3, customerCount: 5,
      pillarCount: 4, cashierCount: 0, kioskPresent: true });
    const cashiers = { checkout: true, 'checkout-2': true };
    let from = env.spawn;
    for (const station of env.stationDetails.filter(station => station.available !== false)) {
      const target = getMarketStationApproachPoint(env, station.id, from, cashiers);
      expect({ layoutId, seed, station: station.id, target: !!target }).toEqual({ layoutId, seed, station: station.id, target: true });
      const path = getMarketNavigationPath(env, from, target!, cashiers);
      expect({ layoutId, seed, station: station.id, found: path !== null }).toEqual({ layoutId, seed, station: station.id, found: true });
      for (const waypoint of path!) {
        expect(isMarketNavigationSegmentClear(env, from, waypoint, cashiers)).toBe(true);
        from = waypoint;
      }
      expect(from).toEqual(target);
    }
  }
});
