import {
  BUS_STOP_POINT, CAFE_ENTRANCE_POINT, CAFE_RETURN_POINT, HOUSE_ENTRANCE_POINT, HOUSE_RETURN_POINT, INITIAL_PLAYER_POINT,
  MARKET_BUS_STOP_POINT, MARKET_ENTRANCE_POINT, MARKET_RETURN_POINT,
  VILLAGE_BUILDINGS, VILLAGE_NPCS, villageObstacles, VILLAGE_ROADS, WORLD_BOUNDS, type Point,
} from '../src/game/prototypeWorld';
import { VILLAGE_CROSSINGS } from '../src/game/villageStreets';
import {
  getVillageNavigationPath, getVillageNavigationTarget, isVillageNavigationBlocked,
  isVillageNavigationSegmentClear, isVillagePedestrianSegmentClear, isVillageRoadPoint, VILLAGE_PLAYER_RADIUS,
} from '../src/game/villageNavigation';

function verifyRoute(from: Point, desired: Point) {
  const path = getVillageNavigationPath(from, desired);
  expect(path).not.toBeNull();
  expect(path?.at(-1)).toEqual(getVillageNavigationTarget(desired, from));
  let previous = from;
  for (const waypoint of path!) {
    expect(isVillageNavigationSegmentClear(previous, waypoint)).toBe(true);
    // Independently check the live player's entire footprint at every world pixel.
    const steps = Math.max(1, Math.ceil(Math.hypot(waypoint.x - previous.x, waypoint.y - previous.y)));
    for (let step = 0; step <= steps; step++) {
      const point = { x: previous.x + (waypoint.x - previous.x) * step / steps,
        y: previous.y + (waypoint.y - previous.y) * step / steps };
      expect(villageObstacles.some(rect => point.x + 22 > rect.x && point.x - 22 < rect.x + rect.width
        && point.y + 22 > rect.y && point.y - 22 < rect.y + rect.height)).toBe(false);
    }
    previous = waypoint;
  }
  return path!;
}

it.each(VILLAGE_NPCS)('시작점에서 $name에게 건물에 멈추지 않고 접근한다', npc => {
  verifyRoute(INITIAL_PLAYER_POINT, npc.point);
});

it('집 문 앞에서는 좌우로 조금 어긋나도 관목에 발이 걸리지 않는다', () => {
  // Approach the actual portal with a 10px steering error on either side.
  for (const offset of [-10, 0, 10]) {
    const to = {x:HOUSE_ENTRANCE_POINT.x+offset,y:HOUSE_ENTRANCE_POINT.y};
    const from = {...to,y:to.y+25};
    expect(isVillageNavigationSegmentClear(from,to)).toBe(true);
    for(let y=to.y;y<=from.y;y++) {
      expect(villageObstacles.some(rect=>to.x+22>rect.x&&to.x-22<rect.x+rect.width
        &&y+22>rect.y&&y-22<rect.y+rect.height)).toBe(false);
    }
  }
});

it.each([
  ['지영', VILLAGE_NPCS.find(npc => npc.id === 'jiyoung')!.point],
  ['집', HOUSE_ENTRANCE_POINT], ['정류장', BUS_STOP_POINT],
] as const)('%s에게 자동 이동할 때 차도는 횡단보도를 통해서만 건넌다', (_name, destination) => {
  const path = getVillageNavigationPath(INITIAL_PLAYER_POINT, destination)!;
  expect(path).not.toBeNull();
  let from = INITIAL_PLAYER_POINT;
  for (const to of path) {
    expect(isVillagePedestrianSegmentClear(from, to)).toBe(true);
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
    for (let step = 0; step <= steps; step++) {
      const point = { x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps };
      const onRoad = VILLAGE_ROADS.some(road => point.x > road.x && point.x < road.x + road.width
        && point.y > road.y && point.y < road.y + road.height);
      if (!onRoad) continue;
      expect(VILLAGE_CROSSINGS.some(crossing => {
        const extensionX = crossing.direction === 'across-side' ? 12 : 0;
        const extensionY = crossing.direction === 'across-main' ? 12 : 0;
        return point.x >= crossing.x - extensionX && point.x <= crossing.x + crossing.width + extensionX
          && point.y >= crossing.y - extensionY && point.y <= crossing.y + crossing.height + extensionY;
      })).toBe(true);
    }
    from = to;
  }
});

it('직접 차도를 누른 이동은 허용하고 차도에서 보도로 돌아갈 때는 안전한 가장자리로 빠져나온다', () => {
  const roadPoint = { x: 800, y: 760 };
  expect(isVillageRoadPoint(roadPoint)).toBe(true);
  expect(getVillageNavigationPath(INITIAL_PLAYER_POINT, roadPoint)).toEqual([roadPoint]);
  const returning = getVillageNavigationPath(roadPoint, HOUSE_ENTRANCE_POINT)!;
  expect(returning).not.toBeNull();
  expect(isVillageNavigationSegmentClear(roadPoint, returning[0])).toBe(true);
  expect(isVillageRoadPoint(returning[0])).toBe(false);
  for (let index = 1; index < returning.length; index++) {
    expect(isVillagePedestrianSegmentClear(returning[index - 1], returning[index])).toBe(true);
  }
});

it('도로가 이어지는 정확한 경계선을 눌러도 고립된 보도로 오인하지 않는다', () => {
  const roadSeam = { x: 505, y: 1500 };
  expect(isVillageRoadPoint(roadSeam)).toBe(true);
  expect(verifyRoute(INITIAL_PLAYER_POINT, roadSeam).at(-1)).toEqual(roadSeam);
});

it.each([
  ['market entrance', MARKET_ENTRANCE_POINT], ['market return', MARKET_RETURN_POINT],
  ['home entrance', HOUSE_ENTRANCE_POINT], ['home return', HOUSE_RETURN_POINT],
  ['cafe entrance', CAFE_ENTRANCE_POINT], ['cafe return', CAFE_RETURN_POINT],
  ['market bus waiting point', MARKET_BUS_STOP_POINT], ['east bus waiting point', BUS_STOP_POINT],
] as const)('시작점에서 %s까지 플레이어 발 크기를 고려한 경로를 만든다', (_name, point) => {
  expect(verifyRoute(INITIAL_PLAYER_POINT, point).at(-1)).toEqual(point);
});

it('직선이 건물에 막힌 목적지에는 실제 우회 지점을 반환한다', () => {
  const building = VILLAGE_BUILDINGS.find(item => item.id === 'school')!;
  const from = { x: building.x + building.width / 2, y: building.y + building.height + 30 };
  const to = { x: from.x, y: building.y - 30 };
  expect(isVillageNavigationSegmentClear(from, to)).toBe(false);
  expect(verifyRoute(from, to).length).toBeGreaterThan(1);
});

it('건물 안을 누르면 가까운 안전한 가장자리에서 멈추며 현재 위치로 되돌리지 않는다', () => {
  const building = VILLAGE_BUILDINGS.find(item => item.id === 'bank')!;
  const desired = { x: building.x + building.width / 2, y: building.y + building.height / 2 };
  expect(isVillageNavigationBlocked(desired)).toBe(true);
  const target = getVillageNavigationTarget(desired, INITIAL_PLAYER_POINT)!;
  expect(isVillageNavigationBlocked(target)).toBe(false);
  expect(target).not.toEqual(INITIAL_PLAYER_POINT);
  expect(Math.hypot(target.x - desired.x, target.y - desired.y)).toBeLessThan(200);
  verifyRoute(INITIAL_PLAYER_POINT, desired);
});

it('안전한 직선은 불필요하게 꺾지 않고 같은 자리에서는 이동하지 않는다', () => {
  const target = { x: INITIAL_PLAYER_POINT.x + 25, y: INITIAL_PLAYER_POINT.y };
  expect(getVillageNavigationPath(INITIAL_PLAYER_POINT, target)).toEqual([target]);
  expect(getVillageNavigationPath(INITIAL_PLAYER_POINT, INITIAL_PLAYER_POINT)).toEqual([]);
  expect(getVillageNavigationPath(INITIAL_PLAYER_POINT, { x: NaN, y: 20 })).toBeNull();
});

it('월드 밖 터치는 발 크기를 포함해 안쪽으로 보정하고 모서리를 관통하지 않는다', () => {
  const target = getVillageNavigationTarget({ x: -500, y: -500 }, INITIAL_PLAYER_POINT)!;
  expect(target.x).toBeGreaterThanOrEqual(VILLAGE_PLAYER_RADIUS);
  expect(target.y).toBeGreaterThanOrEqual(VILLAGE_PLAYER_RADIUS);
  expect(target.x).toBeLessThanOrEqual(WORLD_BOUNDS.village.width - VILLAGE_PLAYER_RADIUS);
  verifyRoute(INITIAL_PLAYER_POINT, { x: -500, y: -500 });
  const building = VILLAGE_BUILDINGS.find(item => item.id === 'school')!;
  const from = { x: building.x - 24, y: building.y + 8 };
  const to = { x: building.x + 8, y: building.y - 24 };
  expect(isVillageNavigationBlocked(from)).toBe(false);
  expect(isVillageNavigationBlocked(to)).toBe(false);
  expect(isVillageNavigationSegmentClear(from, to)).toBe(false);
});

it('정류장 경로의 끝은 차도 방향의 반경 오프셋이 아닌 지정 보행 대기점이다', () => {
  for (const from of [INITIAL_PLAYER_POINT, MARKET_RETURN_POINT, HOUSE_RETURN_POINT]) {
    expect(verifyRoute(from, BUS_STOP_POINT).at(-1)).toEqual(BUS_STOP_POINT);
  }
});

it.each([
  ['수진', VILLAGE_NPCS.find(npc => npc.id === 'sujin')!.point],
  ['집 입구', HOUSE_ENTRANCE_POINT], ['정류장', BUS_STOP_POINT],
] as const)('%s 경로는 실제 X/Y 분리 이동에서도 모서리에 걸려 정지하지 않는다', (_name, target) => {
  const path = getVillageNavigationPath(INITIAL_PLAYER_POINT, target)!;
  expect(path).not.toBeNull();
  let current = { ...INITIAL_PLAYER_POINT };
  for (const waypoint of path) {
    let iterations = 0;
    while (Math.hypot(waypoint.x - current.x, waypoint.y - current.y) > 3 && iterations < 5000) {
      const dx = waypoint.x - current.x; const dy = waypoint.y - current.y;
      const length = Math.hypot(dx, dy); const step = Math.min(3, length);
      const next = { ...current };
      if (!isVillageNavigationBlocked({ x: next.x + dx / length * step, y: next.y })) next.x += dx / length * step;
      if (!isVillageNavigationBlocked({ x: next.x, y: next.y + dy / length * step })) next.y += dy / length * step;
      expect(Math.hypot(next.x - current.x, next.y - current.y)).toBeGreaterThanOrEqual(0.05);
      current = next; iterations++;
    }
    expect(iterations).toBeLessThan(5000);
    const next = { x: waypoint.x, y: current.y };
    if (!isVillageNavigationBlocked(next)) current = next;
    if (!isVillageNavigationBlocked({ x: current.x, y: waypoint.y })) current.y = waypoint.y;
  }
  expect(Math.hypot(current.x - target.x, current.y - target.y)).toBeLessThanOrEqual(3);
});
