import { createMarketEnvironment, getMarketEnvironmentObstacles, getMarketStationApproachPoint, isMarketEnvironmentBlocked, isNearMarketStation, MARKET_LAYOUT_OPTIONS, type MarketKioskLane } from '../src/game/marketEnvironment';
import { getMarketNavigationPath, isMarketNavigationSegmentClear } from '../src/game/marketNavigation';

it.each(['checkout', 'checkout-2'] as const)('%s 한 줄은 두 셀프 계산대로 바뀌고 나머지 줄만 직원이 배치된다', kioskLane => {
  const env = createMarketEnvironment({ kioskLane, cashierCount: 2 });
  expect(env.kiosks).toHaveLength(2);
  expect(env.objects.some(object => object.kind === 'kiosk')).toBe(false);
  const replacement = env.checkouts.find(checkout => checkout.id === kioskLane)!;
  expect(replacement).toMatchObject({ kind: 'kiosk', cashierPresent: false });
  expect(env.stationDetails.some(station => station.id === kioskLane)).toBe(false);
  expect(env.checkouts.filter(checkout => checkout.cashierPresent)).toHaveLength(1);
  expect(env.kiosks[0].rect.x).toBe(env.kiosks[1].rect.x);
  expect(env.kiosks[1].rect.y).toBeGreaterThan(env.kiosks[0].rect.y + env.kiosks[0].rect.height);
  expect(getMarketEnvironmentObstacles(env, { [kioskLane]: true })).toEqual(env.obstacles);
  expect(createMarketEnvironment(env.config)).toEqual(env);
});

it('구형 kioskPresent는 장식이 아닌 두 번째 셀프 계산 줄로 읽고 명시한 새 옵션이 우선한다', () => {
  expect(createMarketEnvironment({ kioskPresent: true }).kiosks.map(kiosk => kiosk.laneId)).toEqual(['checkout-2', 'checkout-2']);
  expect(createMarketEnvironment({ kioskPresent: true, kioskLane: 'none' }).kiosks).toHaveLength(0);
  expect(() => createMarketEnvironment({ kioskLane: 'all' as MarketKioskLane })).toThrow('kioskLane');
});

it.each(MARKET_LAYOUT_OPTIONS)('$label: 두 줄 중 어느 쪽을 바꿔도 공사·최대 밀집에서 양쪽 기기에 접근하고 출구로 나간다', ({ id: layoutId }) => {
  for (const kioskLane of ['checkout', 'checkout-2'] as const) for (const entranceConstruction of [false, true]) for (let seed = 0; seed < 12; seed++) {
    const env = createMarketEnvironment({ layoutId, kioskLane, entranceConstruction, seed, employeeCount: 3, customerCount: 5, pillarCount: 4, cashierCount: 2, shelfOrder: 'random' });
    for (const kiosk of env.kiosks) {
      expect({ layoutId, kioskLane, seed, blocked: isMarketEnvironmentBlocked(env, kiosk.point) }).toEqual({ layoutId, kioskLane, seed, blocked: false });
      expect(isNearMarketStation(env, kiosk.id, kiosk.point)).toBe(true);
      expect(isNearMarketStation(env, kiosk.id, { x: kiosk.rect.x - 30, y: kiosk.rect.y + 20 })).toBe(false);
      const target = getMarketStationApproachPoint(env, kiosk.id, env.spawn)!;
      expect(target).not.toBeNull();
      const path = getMarketNavigationPath(env, env.spawn, target);
      expect(path).not.toBeNull();
      let position = env.spawn;
      for (const waypoint of path!) { expect(isMarketNavigationSegmentClear(env, position, waypoint)).toBe(true); position = waypoint; }
      expect(getMarketNavigationPath(env, position, env.commonDoor.point)).not.toBeNull();
      for (const obstacle of env.obstacles) {
        if (obstacle.x === kiosk.rect.x && obstacle.y === kiosk.rect.y && obstacle.width === kiosk.rect.width && obstacle.height === kiosk.rect.height) continue;
        expect(kiosk.rect.x < obstacle.x + obstacle.width && kiosk.rect.x + kiosk.rect.width > obstacle.x && kiosk.rect.y < obstacle.y + obstacle.height && kiosk.rect.y + kiosk.rect.height > obstacle.y).toBe(false);
      }
    }
  }
});
