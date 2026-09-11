import {
  createMarketEnvironment, DEFAULT_MARKET_ENVIRONMENT_CONFIG, getMarketEnvironmentObstacles,
  isMarketEnvironmentBlocked, isNearMarketStation, MARKET_CHAIR_SLOTS, MARKET_CUSTOMER_SLOTS,
  MARKET_EMPLOYEE_SLOTS, MARKET_PILLAR_SLOTS, MARKET_SHELF_SLOTS,
  type MarketEnvironment, type MarketEnvironmentConfig,
} from '../src/game/marketEnvironment';
import type { Point, Rect } from '../src/game/prototypeWorld';

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Flood-fill with the same player radius as runtime; a visual gap alone is insufficient. */
function reachableCells(environment: MarketEnvironment) {
  const cells = new Map<string, Point>();
  for (let y = 30; y < environment.world.height - 22; y += 20) {
    for (let x = 30; x < environment.world.width - 22; x += 20) {
      const point = { x, y };
      if (!isMarketEnvironmentBlocked(environment, point, { checkout: true, 'checkout-2': true })) cells.set(`${x},${y}`, point);
    }
  }
  const start = [...cells.values()].sort((a, b) =>
    Math.hypot(a.x - environment.spawn.x, a.y - environment.spawn.y) -
    Math.hypot(b.x - environment.spawn.x, b.y - environment.spawn.y))[0];
  const queue = [start];
  const visited = new Set([`${start.x},${start.y}`]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const [dx, dy] of [[20, 0], [-20, 0], [0, 20], [0, -20]]) {
      const key = `${current.x + dx},${current.y + dy}`;
      const point = cells.get(key);
      if (point && !visited.has(key)) {
        visited.add(key);
        queue.push(point);
      }
    }
  }
  return queue;
}

it('같은 seed와 환경 변수는 기기와 호출 순서에 무관하게 같은 배치를 생성한다', () => {
  const first = createMarketEnvironment({ seed: 'team-replay-42' });
  createMarketEnvironment({ seed: 'unrelated' });
  expect(createMarketEnvironment({ seed: 'team-replay-42' })).toEqual(first);
  expect(createMarketEnvironment(first.config)).toEqual(first);
  expect(DEFAULT_MARKET_ENVIRONMENT_CONFIG.seed).toBe('oneuldo-market-1');
});

it('사람·계산원·기둥·의자·키오스크 및 진열대 위치를 개별 고정할 수 있다', () => {
  const environment = createMarketEnvironment({
    seed: 12, employeeCount: 3, customerCount: 5, cashierCount: 0,
    pillarCount: 4, chairCount: 4, kioskPresent: true,
    shelfOrder: ['drink', 'meal', 'produce', 'fresh'],
    employeeSlotIds: MARKET_EMPLOYEE_SLOTS.slice(0, 3).map(({ id }) => id),
    customerSlotIds: MARKET_CUSTOMER_SLOTS.slice(0, 5).map(({ id }) => id),
  });
  expect(environment.employees).toHaveLength(3);
  expect(environment.customers).toHaveLength(5);
  expect(environment.checkout.cashierPresent).toBe(false);
  expect(environment.objects.filter(({ kind }) => kind === 'pillar')).toHaveLength(4);
  expect(environment.objects.filter(({ kind }) => kind === 'chair')).toHaveLength(0);
  expect(environment.objects.filter(({ kind }) => kind === 'restSet')).toHaveLength(2);
  expect(environment.config.chairCount).toBe(0);
  expect(environment.objects.filter(({ kind }) => kind === 'kiosk')).toHaveLength(1);
  expect(environment.shelves.drink.slotId).toBe('northwest');
  expect(environment.shelves.fresh.slotId).toBe('middle-east');
  expect(environment.shelves.household.slotId).toBe('middle-west');
  expect(environment.stationDetails.filter(({ kind }) => kind === 'checkout')).toHaveLength(2);
  expect(environment.checkouts).toHaveLength(2);
  expect(environment.checkout).toEqual(environment.checkouts[0]);
  expect(environment.stationDetails.some(({ id }) => id.includes('kiosk'))).toBe(false);
  expect(getMarketEnvironmentObstacles(environment, true)).toHaveLength(environment.obstacles.length + 1);
});

it('다양한 seed와 최대 밀집도에서도 발판이 겹치지 않고 모든 목적지로 걸어갈 수 있다', () => {
  const cashierStates = new Set<boolean>();
  const kioskStates = new Set<boolean>();
  for (let seed = 0; seed < 100; seed += 1) {
    const environment = createMarketEnvironment({ seed, shelfOrder: 'random',
      ...(seed % 2 === 0 ? { employeeCount: 3, customerCount: 5, pillarCount: 4, chairCount: 4 } : {}),
    });
    cashierStates.add(environment.checkout.cashierPresent);
    kioskStates.add(environment.objects.some(({ kind }) => kind === 'kiosk'));
    expect(environment.employees.length).toBeGreaterThanOrEqual(1);
    expect(environment.employees.length).toBeLessThanOrEqual(3);
    expect(environment.customers.length).toBeGreaterThanOrEqual(1);
    expect(environment.customers.length).toBeLessThanOrEqual(5);
    for (let first = 0; first < environment.obstacles.length; first += 1) {
      for (let second = first + 1; second < environment.obstacles.length; second += 1) {
        expect(overlaps(environment.obstacles[first], environment.obstacles[second])).toBe(false);
      }
    }
    const cells = reachableCells(environment);
    expect(isMarketEnvironmentBlocked(environment, environment.spawn)).toBe(false);
    for (const [id, point] of Object.entries(environment.stations)) {
      expect({ seed, id, blocked: isMarketEnvironmentBlocked(environment, point) }).toEqual({ seed, id, blocked: false });
      expect({ seed, id, reachable: cells.some((cell) => Math.hypot(cell.x - point.x, cell.y - point.y) <= 22) }).toEqual({ seed, id, reachable: true });
    }
  }
  expect(cashierStates.size).toBe(2);
  expect(kioskStates.size).toBe(2);
  // Record category order explicitly: Object.values follows the generated permutation.
  const categoryOrders = new Set(Array.from({ length: 20 }, (_, seed) =>
    ['fresh', 'produce', 'household', 'meal', 'drink'].map((id) => createMarketEnvironment({ seed, shelfOrder: 'random' }).shelves[id as 'fresh'].slotId).join(',')));
  expect(categoryOrders.size).toBeGreaterThan(8);
});

it('환경에 정의된 위치 외의 좌표와 범위 밖 개수는 거부한다', () => {
  const invalid: Partial<MarketEnvironmentConfig>[] = [
    { employeeCount: 0 }, { employeeCount: 4 }, { customerCount: 0 }, { customerCount: 6 },
    { pillarCount: 5 }, { chairCount: -1 }, { seed: Number.NaN }, { seed: '' },
    { employeeCount: { min: 3, max: 1 } }, { customerCount: 1.5 },
    { shelfOrder: ['fresh', 'fresh', 'meal', 'drink'] },
    { employeeSlotIds: ['arbitrary-position'] },
    { pillarSlotIds: [MARKET_PILLAR_SLOTS[0].id, MARKET_PILLAR_SLOTS[0].id] },
    { chairCount: 3, chairSlotIds: [MARKET_CHAIR_SLOTS[0].id] },
    { cashierCount: 3 as 0 }, { kioskPresent: 'enabled' as unknown as true },
    { employees: 2 } as Partial<MarketEnvironmentConfig>,
  ];
  for (const config of invalid) expect(() => createMarketEnvironment(config)).toThrow();
  expect(MARKET_SHELF_SLOTS).toHaveLength(5);
});

it('가로 진열대 두 묶음과 세로 진열대 세 묶음은 카테고리 목적지를 각각 하나만 가진다', () => {
  const environment = createMarketEnvironment({ seed: 'paired-fixtures', employeeCount: 1, customerCount: 1,
    employeeSlotIds: ['staff-southwest'], customerSlotIds: ['customer-southeast'],
    shelfOrder: ['fresh', 'produce', 'meal', 'drink'], pillarCount: 0, chairCount: 0, cashierCount: 0, kioskPresent: false });
  expect(environment.stationDetails.filter(({ kind }) => kind === 'shelf')).toHaveLength(5);
  expect(new Set(environment.stationDetails.filter(({ kind }) => kind === 'shelf').map(({ categoryId }) => categoryId)).size).toBe(5);
  expect(Object.values(environment.shelves).filter(shelf => shelf.orientation === 'horizontal')).toHaveLength(2);
  expect(Object.values(environment.shelves).filter(shelf => shelf.orientation === 'vertical')).toHaveLength(3);
  expect(isMarketEnvironmentBlocked(environment, { x: 500, y: 350 })).toBe(false);
  expect(isMarketEnvironmentBlocked(environment, { x: 400, y: 550 })).toBe(true);
  expect(environment.shelves.fresh.y + environment.shelves.fresh.height).toBe(260);
  expect(environment.shelves.meal.y + environment.shelves.meal.height).toBe(600);
});

it('직원과 계산대의 접근점만 상호작용 허용하고 가짜 위치를 거부한다', () => {
  const environment = createMarketEnvironment({ cashierCount: 2 });
  const employee = environment.employees[0];
  const staffId = `staff:${employee.id}` as const;
  expect(isNearMarketStation(environment, staffId, environment.stations[staffId])).toBe(true);
  expect(isNearMarketStation(environment, staffId, employee.point)).toBe(false);
  expect(isNearMarketStation(environment, 'checkout', environment.spawn)).toBe(false);
  expect(isNearMarketStation(environment, 'checkout', { x: NaN, y: 0 })).toBe(false);
  expect(getMarketEnvironmentObstacles(environment, true)).toHaveLength(environment.obstacles.length);
});

it('입구와 출구, 별실과 ATM 통로 및 두 계산대의 독립 계산원 상태를 노출한다', () => {
  const environment = createMarketEnvironment({ seed: 'architecture', cashierCount: 0 });
  expect(environment).toMatchObject({ layoutVersion: 2, world: { width: 1100, height: 1200 },
    spawn: { x: 470, y: 970 }, exit: { x: 870, y: 1030 }, entrance: { alarmBoundaryY: 1030, rearmY: 970 } });
  expect(environment.objects.filter(object => object.kind === 'atm')).toHaveLength(1);
  expect(environment.objects.filter(object => object.kind === 'elevator')).toHaveLength(2);
  expect(environment.walkableAreas.map(area => area.id)).toContain('west-corridor');
  expect(isMarketEnvironmentBlocked(environment, { x: 75, y: 650 })).toBe(true);
  expect(isMarketEnvironmentBlocked(environment, { x: 240, y: 900 })).toBe(false);
  expect(isMarketEnvironmentBlocked(environment, { x: 470, y: 1070 })).toBe(false);
  const base = getMarketEnvironmentObstacles(environment);
  expect(getMarketEnvironmentObstacles(environment, { 'checkout-2': true })).toHaveLength(base.length + 1);
  expect(getMarketEnvironmentObstacles(environment, { checkout: true, 'checkout-2': true })).toHaveLength(base.length + 2);
  expect(getMarketEnvironmentObstacles(environment, { 'checkout-2': true })).toContainEqual(environment.checkouts[1].cashierCollider);
  for (const count of [0, 1, 2] as const) {
    expect(createMarketEnvironment({ cashierCount: count }).checkouts.filter(checkout => checkout.cashierPresent)).toHaveLength(count);
  }
});
