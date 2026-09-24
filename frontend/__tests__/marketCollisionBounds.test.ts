import {
  createMarketEnvironment, getMarketEnvironmentObstacles, isMarketEnvironmentBlocked,
  MARKET_ENVIRONMENT_PLAYER_RADIUS, type MarketEnvironment,
} from '../src/game/marketEnvironment';
import { getMarketShelfUnitRects } from '../src/game/marketFixtureLayout';
import { getMarketPersonCollider } from '../src/game/marketPersonLayout';
import { isMarketNavigationSegmentClear } from '../src/game/marketNavigation';
import type { Rect } from '../src/game/prototypeWorld';

const environment = createMarketEnvironment({ seed: 'expanded-footprint-edges', cashierCount: 0,
  kioskLane: 'checkout-2', employeeCount: 1, customerCount: 1, pillarCount: 0 });

// Isolate each object so a neighbouring wall/NPC cannot hide an incorrect boundary.
function isolate(rect: Rect): MarketEnvironment {
  return { ...environment, walls: [], objects: [], constructionZones: [], checkouts: [],
    obstacles: [rect], walkableAreas: [{ id: 'test-floor', x: 0, y: 0, ...environment.world }] };
}

const fixtures = [
  ...getMarketShelfUnitRects(environment.shelves.household).map((rect, index) =>
    ({ name: `shelf ${index + 1}`, rect, previousWidth: 126.5 })),
  { name: 'staffed checkout', rect: environment.checkout.rect, previousWidth: 55.2 },
  ...environment.kiosks.map(kiosk => ({ name: kiosk.id, rect: kiosk.rect, previousWidth: 55.2 })),
  ...(['employee', 'customer'] as const).flatMap(kind => Array.from({ length: kind === 'employee' ? 4 : 12 }, (_, appearance) => {
    const rect = getMarketPersonCollider({ x: 600, y: 600 }, kind, appearance);
    return { name: `${kind} ${appearance}`, rect, previousWidth: rect.width * 86 / 104 };
  })),
];

it.each(fixtures)('$name: 확대된 양옆은 막고 바닥 경계 바로 바깥은 통과한다', ({ rect, previousWidth }) => {
  const env = isolate(rect);
  const radius = MARKET_ENVIRONMENT_PLAYER_RADIUS;
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  expect(rect.width).toBeGreaterThan(previousWidth);
  for (const side of [-1, 1]) {
    // This was outside the previous narrower footprint.
    const newlyBlocked = { x: center.x + side * (previousWidth / 2 + radius + 0.25), y: center.y };
    const tangent = { x: center.x + side * (rect.width / 2 + radius), y: center.y };
    const outside = { x: tangent.x + side * 0.25, y: center.y };
    expect(isMarketEnvironmentBlocked(env, newlyBlocked)).toBe(true);
    expect(isMarketEnvironmentBlocked(env, tangent)).toBe(false);
    expect(isMarketEnvironmentBlocked(env, outside)).toBe(false);
    expect(isMarketNavigationSegmentClear(env, outside, newlyBlocked)).toBe(false);
  }
  for (const side of [-1, 1]) {
    const tangent = { x: center.x, y: center.y + side * (rect.height / 2 + radius) };
    expect(isMarketEnvironmentBlocked(env, tangent)).toBe(false);
    expect(isMarketEnvironmentBlocked(env, { x: tangent.x, y: tangent.y - side * 0.25 })).toBe(true);
  }
});

it('호출한 계산원도 확대된 신발 경계로 막고 키오스크 줄에는 계산원 충돌을 만들지 않는다', () => {
  const counter = environment.checkout;
  const rect = counter.cashierCollider;
  const point = { x: rect.x - MARKET_ENVIRONMENT_PLAYER_RADIUS + 0.25, y: rect.y + rect.height / 2 };
  expect(isMarketEnvironmentBlocked(environment, point)).toBe(false);
  expect(isMarketEnvironmentBlocked(environment, point, { checkout: true })).toBe(true);
  const kioskLane = environment.checkouts.find(item => item.kind === 'kiosk')!;
  expect(getMarketEnvironmentObstacles(environment, { [kioskLane.id]: true })).toEqual(environment.obstacles);
});
