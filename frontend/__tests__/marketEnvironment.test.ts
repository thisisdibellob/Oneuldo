import {
  createMarketEnvironment, DEFAULT_MARKET_ENVIRONMENT_CONFIG, getMarketEnvironmentObstacles, getMarketElevatorFacadeRect,
  isMarketEnvironmentBlocked, isNearMarketStation, getMarketStationApproachPoint, getNearestMarketStation, MARKET_CHAIR_SLOTS, MARKET_CUSTOMER_SLOTS,
  MARKET_EMPLOYEE_SLOTS, MARKET_PILLAR_SLOTS, MARKET_SHELF_SLOTS, MARKET_LAYOUT_OPTIONS, getMarketLayoutSlots,
  type MarketEnvironment, type MarketEnvironmentConfig, type MarketEnvironmentStationId,
} from '../src/game/marketEnvironment';
import { getMarketShelfUnitRects } from '../src/game/marketFixtureLayout';
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
  expect(environment.objects.filter(({ kind }) => kind === 'restSet')).toHaveLength(4);
  expect(environment.config.chairCount).toBe(0);
  expect(environment.objects.filter(({ kind }) => kind === 'kiosk')).toHaveLength(0);
  expect(environment.kiosks).toHaveLength(2);
  expect(environment.shelves.drink.slotId).toBe('northwest');
  expect(environment.shelves.fresh.slotId).toBe('middle-east');
  expect(environment.shelves.household.slotId).toBe('middle-west');
  expect(environment.stationDetails.filter(({ kind }) => kind === 'checkout')).toHaveLength(1);
  expect(environment.checkouts).toHaveLength(2);
  expect(environment.checkout).toEqual(environment.checkouts[0]);
  expect(environment.stationDetails.filter(({ kind }) => kind === 'kiosk')).toHaveLength(2);
  expect(getMarketEnvironmentObstacles(environment, true)).toHaveLength(environment.obstacles.length + 1);
});

it('다양한 seed와 최대 밀집도에서도 발판이 겹치지 않고 모든 목적지로 걸어갈 수 있다', () => {
  const cashierStates = new Set<boolean>();
  const kioskStates = new Set<boolean>();
  for (const { id: layoutId } of MARKET_LAYOUT_OPTIONS) for (const entranceConstruction of [false, true]) for (let seed = 0; seed < 100; seed += 1) {
    const environment = createMarketEnvironment({ layoutId, entranceConstruction, seed, shelfOrder: 'random',
      employeeCount: 3, customerCount: 5, pillarCount: 4, chairCount: 4,
    });
    cashierStates.add(environment.checkout.cashierPresent);
    kioskStates.add(environment.kiosks.length > 0);
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
    for (const { id, point, available } of environment.stationDetails) {
      if (available === false) {
        expect(isMarketEnvironmentBlocked(environment, point)).toBe(true);
        expect(getMarketStationApproachPoint(environment, id, environment.spawn)).toBeNull();
        continue;
      }
      expect({ layoutId, seed, id, blocked: isMarketEnvironmentBlocked(environment, point) }).toEqual({ layoutId, seed, id, blocked: false });
      expect({ layoutId, seed, id, near: isNearMarketStation(environment, id as MarketEnvironmentStationId, point) }).toEqual({ layoutId, seed, id, near: true });
      expect({ layoutId, seed, id, reachable: cells.some((cell) => Math.hypot(cell.x - point.x, cell.y - point.y) <= 22) }).toEqual({ layoutId, seed, id, reachable: true });
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
    { layoutId: 'unknown' as 'classic' }, { entranceConstruction: 'yes' as unknown as boolean }, { entranceConstruction: null as unknown as boolean }, { employeeCount: 0 }, { employeeCount: 4 }, { customerCount: 0 }, { customerCount: 6 },
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
  expect(environment.shelves.fresh.y + environment.shelves.fresh.height / 2).toBeCloseTo(228);
  expect(environment.shelves.meal.y + environment.shelves.meal.height / 2).toBeCloseTo(516);
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
  const environment = createMarketEnvironment({ seed: 'architecture', cashierCount: 0, kioskLane: 'none' });
  expect(environment).toMatchObject({ layoutVersion: 3, world: { width: 1100, height: 1500 },
    spawn: { x: 710, y: 1350 }, exit: { x: 710, y: 1430 }, entrance: { alarmBoundaryY: 1030, rearmY: 970 } });
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
    expect(createMarketEnvironment({ cashierCount: count, kioskLane: 'none' }).checkouts.filter(checkout => checkout.cashierPresent)).toHaveLength(count);
  }
});

const emptyArchitecture = () => createMarketEnvironment({ seed: 'architecture-paths', employeeCount: 1, customerCount: 1,
  employeeSlotIds: ['staff-southwest'], customerSlotIds: ['customer-southeast'], pillarCount: 0, cashierCount: 2, kioskPresent: false });

it('공동 출입문, 넓은 로비와 서쪽 통로는 연결되고 판매장 옆벽으로 새어나갈 수 없다', () => {
  const environment = emptyArchitecture();
  for (const point of [{ x: 710, y: 1460 }, { x: 710, y: 1430 }, { x: 240, y: 1340 }, { x: 930, y: 1340 },
    { x: 480, y: 1030 }, { x: 930, y: 1030 }, { x: 240, y: 1000 }, { x: 298, y: 315 }]) {
    expect({ point, blocked: isMarketEnvironmentBlocked(environment, point) }).toEqual({ point, blocked: false });
  }
  for (const point of [{ x: 298, y: 800 }, { x: 298, y: 980 }, { x: 650, y: 1030 }, { x: 500, y: 1430 }]) {
    expect(isMarketEnvironmentBlocked(environment, point)).toBe(true);
  }
  const cells = reachableCells(environment);
  for (const point of [{ x: 240, y: 400 }, { x: 240, y: 1280 }, { x: 710, y: 1430 }, { x: 930, y: 1030 }]) {
    expect(cells.some(cell => Math.hypot(cell.x - point.x, cell.y - point.y) <= 22)).toBe(true);
  }
  expect(environment.alarmGates.map(gate => gate.id)).toEqual(['entrance', 'west-door', 'exit']);
  expect(getNearestMarketStation(environment, environment.entrance.point)?.id).not.toBe('entrance');
  expect(getNearestMarketStation(environment, environment.stations.exit)?.id).not.toBe('exit');
  expect(getNearestMarketStation(environment, environment.commonDoor.point)?.id).toBe('common-door');
});

it('두 진열대의 실제 발판 사이 간격은 통과하며 양쪽 유닛의 모든 열린 면에서 접근한다', () => {
  const environment = emptyArchitecture();
  const shelf = environment.shelves.household;
  const units = getMarketShelfUnitRects(shelf);
  expect(units).toHaveLength(2);
  expect(isMarketEnvironmentBlocked(environment, { x: 400, y: 516 })).toBe(false);
  expect(isNearMarketStation(environment, 'household', { x: 400, y: 516 })).toBe(true);
  const [back, front] = units;
  const centerX = back.x + back.width / 2;
  for (const point of [
    { x: back.x - 14, y: back.y + back.height / 2 },
    { x: back.x + back.width + 22, y: back.y + back.height / 2 },
    { x: centerX, y: back.y - 22 },
    { x: centerX, y: front.y + front.height + 22 },
    { x: front.x + front.width + 22, y: front.y + front.height / 2 },
  ]) {
    expect({ point, near: isNearMarketStation(environment, 'household', point) }).toEqual({ point, near: true });
    expect(getNearestMarketStation(environment, point)?.id).toBe('household');
  }
  expect(isNearMarketStation(environment, 'meal', { x: 478, y: 568 })).toBe(false);
  // The visible space behind the furniture across the west wall is not shelf access.
  expect(isNearMarketStation(environment, 'household', { x: 270, y: 464 })).toBe(false);
  const approach = getMarketStationApproachPoint(environment, 'household', { x: 470, y: 700 })!;
  expect(isMarketEnvironmentBlocked(environment, approach)).toBe(false);
  expect(isNearMarketStation(environment, 'household', approach)).toBe(true);
  expect(approach.y).toBeGreaterThanOrEqual(600);
});

it('커진 계산대의 받침 전체를 막으면서 두 곳 모두 직원 왼쪽·손님 오른쪽 접근을 유지한다', () => {
  const environment = emptyArchitecture();
  for (const counter of environment.checkouts.filter(counter => counter.kind !== 'kiosk')) {
    expect(counter.rect.width).toBeCloseTo(54 * 1.15);
    expect(counter.rect.height).toBeCloseTo(117 * 1.15);
    expect(counter.cashierPoint.x).toBeLessThan(counter.rect.x);
    expect(counter.point.x).toBeGreaterThan(counter.rect.x + counter.rect.width);
    expect(isNearMarketStation(environment, counter.id, counter.point)).toBe(true);
    expect(isNearMarketStation(environment, counter.id, { x: counter.rect.x - 22, y: counter.rect.y + 20 })).toBe(false);
  }
  for (const elevator of environment.objects.filter(object => object.kind === 'elevator')) {
    expect(environment.walls.some(wall => wall.y + wall.height === elevator.rect.y && wall.x <= elevator.rect.x && wall.x + wall.width >= elevator.rect.x + elevator.rect.width)).toBe(true);
  }
});

it('매장 안 입출구를 원래 계산대 전면에 붙이고 새 로비는 그 아래에 둔다', () => {
  const environment = emptyArchitecture();
  expect(environment.entrance.point).toEqual({ x: 480, y: 1030 });
  expect(environment.stations.exit).toEqual({ x: 930, y: 1030 });
  expect(environment.entrance).toMatchObject({ gate: { y: 1010, height: 40 }, alarmBoundaryY: 1030, rearmY: 970 });
  expect(environment.walls).toContainEqual({ x: 630, y: 780, width: 18, height: 240 });
  expect(environment.walls).toContainEqual({ x: 550, y: 1020, width: 300, height: 20 });
  expect(environment.walkableAreas.find(area => area.id === 'entrance-lobby')).toEqual({ id: 'entrance-lobby', x: 120, y: 1020, width: 930, height: 424 });
  expect(environment.commonDoor.point).toEqual({ x: 710, y: 1430 });
  for (const checkout of environment.checkouts) {
    expect(checkout.rect.y + checkout.rect.height).toBe(946);
    expect(checkout.point.y).toBeCloseTo(880.45);
    expect(checkout.cashierPoint.y).toBeCloseTo(checkout.point.y);
  }
});

it('엘리베이터 사이의 보이는 벽 전체가 막히고 문 앞 접근 공간은 열린다', () => {
  const environment = emptyArchitecture();
  const facade = getMarketElevatorFacadeRect(environment.objects, environment.walls)!;
  expect(facade).toEqual({ x: 50, y: 96, width: 236, height: 148 });
  expect(environment.obstacles).toContainEqual(facade);
  for (const point of [{ x: 165, y: 110 }, { x: 165, y: 200 }, { x: 165, y: 235 }]) {
    expect(isMarketEnvironmentBlocked(environment, point)).toBe(true);
  }
  for (const point of [{ x: 100, y: 260 }, { x: 165, y: 260 }, { x: 230, y: 260 }, { x: 240, y: 315 }]) {
    expect(isMarketEnvironmentBlocked(environment, point)).toBe(false);
  }
  const legacy = { ...environment, obstacles: environment.obstacles.filter(rect => rect !== facade
    && !(rect.x === facade.x && rect.y === facade.y && rect.width === facade.width && rect.height === facade.height)) };
  expect(isMarketEnvironmentBlocked(legacy, { x: 165, y: 220 })).toBe(true);
  const movedObjects = environment.objects.map(object => ({ ...object, rect: { ...object.rect, x: object.rect.x + 12, y: object.rect.y + 24 } }));
  const movedWalls = environment.walls.map(rect => ({ ...rect, x: rect.x + 12, y: rect.y + 24 }));
  expect(getMarketElevatorFacadeRect(movedObjects, movedWalls)).toEqual({ ...facade, x: facade.x + 12, y: facade.y + 24 });
  expect(getMarketElevatorFacadeRect([], environment.walls)).toBeNull();
});

it('출구 경보기는 매장 전면에 있고 공동 출입문과 로비에는 경보를 추가하지 않는다', () => {
  const environment = emptyArchitecture();
  expect(environment.alarmGates.find(gate => gate.id === 'exit')).toEqual({ id: 'exit',
    gate: { x: 850, y: 1010, width: 160, height: 40 }, axis: 'y', boundary: 1030, rearm: 970, outward: 1 });
  expect(environment.alarmGates).toHaveLength(3);
  expect(environment.alarmGates.every(gate => gate.id !== ('common-door' as string))).toBe(true);
  expect(environment.commonDoor.point).toEqual({ x: 710, y: 1430 });
});

it('두 배치는 같은 구조물과 슬롯 ID를 공유하지만 진열대 발판과 일부 사람 좌표는 실제로 다르다', () => {
  const classic = createMarketEnvironment({ seed: 'layout-contract' });
  const aisles = createMarketEnvironment({ seed: 'layout-contract', layoutId: 'aisles' });
  expect(classic.config.layoutId).toBe('classic');
  expect(createMarketEnvironment({ ...classic.config, layoutId: undefined })).toEqual(classic);
  expect(createMarketEnvironment(aisles.config)).toEqual(aisles);
  expect(aisles.shelves).not.toEqual(classic.shelves);
  expect(Object.values(aisles.shelves).every(shelf => shelf.orientation === 'horizontal')).toBe(true);
  expect(aisles.walls).toEqual(classic.walls);
  expect(aisles.checkouts).toEqual(classic.checkouts);
  expect(aisles.alarmGates).toEqual(classic.alarmGates);
  for (const key of ['shelves', 'employees', 'customers', 'pillars'] as const) {
    const ids = (layoutId: 'classic' | 'aisles') => getMarketLayoutSlots(layoutId)[key].map(slot => 'slotId' in slot ? slot.slotId : slot.id);
    expect(ids('aisles')).toEqual(ids('classic'));
  }
});

it('공용 로비 휴게석은 출입 통로를 남기고 ATM 그림은 서쪽 벽에 붙는다', () => {
  for (const { id: layoutId } of MARKET_LAYOUT_OPTIONS) {
    const environment = createMarketEnvironment({ layoutId });
    const lobby = environment.walkableAreas.find(area => area.id === 'entrance-lobby')!;
    const seats = environment.objects.filter(object => object.slotId.startsWith('rest-lobby'));
    expect(seats).toHaveLength(2);
    for (const { rect } of seats) {
      expect(rect.y).toBeGreaterThan(lobby.y);
      expect(rect.x + rect.width).toBeLessThan(environment.entrance.point.x);
      expect(rect.y + rect.height).toBeLessThan(environment.commonDoor.gate.y);
    }
    for (const point of layoutId === 'corner' ? [{ x: 290, y: 1240 }, { x: 700, y: 1220 }, { x: 1060, y: 1240 }] : [{ x: 295, y: 1220 }, { x: 480, y: 1220 }, { x: 240, y: 1280 }, { x: 240, y: 1390 }]) {
      expect(isMarketEnvironmentBlocked(environment, point)).toBe(false);
    }
    const atm = environment.objects.find(object => object.kind === 'atm')!;
    const faceX = layoutId === 'corner' ? atm.rect.x + atm.rect.width + 10 : atm.rect.x - 10;
    expect(faceX).toBe(layoutId === 'corner' ? 1200 : 120);
    expect(environment.walls.some(wall => (layoutId === 'corner' ? wall.x === faceX : wall.x + wall.width === faceX) && wall.y < atm.rect.y && wall.y + wall.height > atm.rect.y + atm.rect.height)).toBe(true);
  }
});

it('모퉁이 지점은 외벽·면적·복도·엘리베이터·계산대·출입문까지 별도 평면을 사용한다', () => {
  const classic = createMarketEnvironment();
  const corner = createMarketEnvironment({ layoutId: 'corner', shelfOrder: 'random' });
  expect(corner.world).toEqual({ width: 1280, height: 1380 });
  for (const key of ['walls', 'walkableAreas', 'shelves', 'checkouts', 'commonDoor', 'spawn', 'alarmGates'] as const) expect(corner[key]).not.toEqual(classic[key]);
  expect(corner.objects.filter(object => object.kind === 'elevator')).not.toEqual(classic.objects.filter(object => object.kind === 'elevator'));
  expect(corner.walkableAreas.find(area => area.id === 'east-corridor')).toBeTruthy();
  expect(corner.walkableAreas.find(area => area.id === 'west-corridor')).toBeUndefined();
  expect(isMarketEnvironmentBlocked(corner, { x: 1160, y: 700 })).toBe(false);
  expect(isMarketEnvironmentBlocked(corner, { x: 110, y: 100 })).toBe(true);
});

it('공사는 안쪽 입구만 막고 시작점은 각 공동 출입문에서 80px 안쪽에 둔다', () => {
  for (const { id: layoutId } of MARKET_LAYOUT_OPTIONS) for (const entranceConstruction of [false, true]) {
    const environment = createMarketEnvironment({ layoutId, entranceConstruction, seed: 'construction-replay' });
    expect(environment.spawn).toEqual({ x: environment.commonDoor.point.x, y: environment.commonDoor.point.y - 80 });
    expect(isMarketEnvironmentBlocked(environment, environment.spawn)).toBe(false);
    expect(isMarketEnvironmentBlocked(environment, environment.commonDoor.point)).toBe(false);
    expect(isMarketEnvironmentBlocked(environment, environment.entrance.point)).toBe(entranceConstruction);
    expect(environment.stationDetails.find(station => station.id === 'entrance')!.available).toBe(!entranceConstruction);
    expect(environment.constructionZones).toHaveLength(entranceConstruction ? 1 : 0);
    expect(createMarketEnvironment(environment.config)).toEqual(environment);
    if (entranceConstruction) {
      const zone = environment.constructionZones[0];
      expect(zone.rect.x).toBe(environment.entrance.gate.x);
      expect(zone.rect.width).toBe(environment.entrance.gate.width);
      expect(zone.detourGateIds).toEqual([layoutId === 'corner' ? 'east-door' : 'west-door']);
      expect(getMarketStationApproachPoint(environment, 'entrance', environment.spawn)).toBeNull();
    }
  }
});

it('부동소수점 누적이 생긴 벽 접선은 통과하지만 실제 0.001px 침범은 막는다', () => {
  const environment = createMarketEnvironment({ layoutId: 'corner', entranceConstruction: true });
  expect(isMarketEnvironmentBlocked(environment, { x: 585, y: 768 + 1e-12 })).toBe(false);
  expect(isMarketEnvironmentBlocked(environment, { x: 585, y: 768 + 0.001 })).toBe(true);
});

it('모퉁이 계산대를 내려 배치해도 53px 출구 연결 통로와 두 고객 접근점은 최대 밀집 시드에서 열린다', () => {
  for (let seed = 0; seed < 100; seed++) {
    const environment = createMarketEnvironment({ layoutId: 'corner', entranceConstruction: true, seed,
      employeeCount: 3, customerCount: 5, pillarCount: 4, cashierCount: 0, kioskPresent: true, shelfOrder: 'random' });
    const called = { checkout: true, 'checkout-2': true };
    for (const counter of environment.checkouts.filter(counter => counter.kind !== 'kiosk')) {
      expect(counter.rect.y + counter.rect.height).toBe(987);
      expect(counter.cashierPoint.y).toBeCloseTo(921.45);
      expect(counter.point.y).toBeCloseTo(counter.cashierPoint.y);
      expect(environment.entrance.gate.y + 10 - (counter.rect.y + counter.rect.height)).toBe(53);
      expect(isMarketEnvironmentBlocked(environment, counter.point, called)).toBe(false);
      expect(isNearMarketStation(environment, counter.id, counter.point, undefined, called)).toBe(true);
    }
    for (let x = 275; x <= 510; x += 5) expect(isMarketEnvironmentBlocked(environment, { x, y: 1008 }, called)).toBe(false);
  }
});

it('직원과 진열대가 모두 가까우면 직원 클릭은 말 걸기 버튼이 뜨는 접근점으로 안내한다', () => {
  const environment = createMarketEnvironment({ seed: 'market-v8-browser', layoutId: 'classic',
    employeeCount: 1, customerCount: 1, pillarCount: 1, cashierCount: 1, kioskLane: 'checkout-2',
    shelfOrder: ['produce', 'fresh', 'household', 'meal', 'drink'] });
  const employee = environment.employees[0];
  const staffId = `staff:${employee.id}` as const;
  const ambiguous: Point[] = [];
  for (let x = employee.point.x - 90; x <= employee.point.x + 90; x += 6) {
    for (let y = employee.point.y - 90; y <= employee.point.y + 90; y += 6) {
      const point = { x, y };
      if (isNearMarketStation(environment, staffId, point) && getNearestMarketStation(environment, point)?.id !== staffId) ambiguous.push(point);
    }
  }
  expect(ambiguous.length).toBeGreaterThan(0);
  for (const current of [environment.spawn, environment.stations.fresh, ...ambiguous]) {
    const target = getMarketStationApproachPoint(environment, staffId, current)!;
    expect(target).not.toBeNull();
    expect(isMarketEnvironmentBlocked(environment, target)).toBe(false);
    expect(isNearMarketStation(environment, staffId, target)).toBe(true);
    expect(getNearestMarketStation(environment, target)?.id).toBe(staffId);
  }
});
