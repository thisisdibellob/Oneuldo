import {
  LIBRARY_OBSTACLES, LIBRARY_SPAWN, LIBRARY_STATIONS, LIBRARY_ROOM, LIBRARY_PLAYER_RADIUS,
  LIBRARY_COMPUTERS, LIBRARY_SHELVES, LIBRARY_SHELF_FIXTURES, LIBRARY_WALL_FLOOR_Y, LIBRARY_WALL_WINDOWS, LIBRARY_PLAYER_SCALE, LIBRARY_VIEW_SCALE, LIBRARY_LOUNGE, LIBRARY_LOUNGE_FOOTPRINT_TOP,
  findLibraryPath, isLibraryBlocked, moveLibraryPlayer, createLibraryFollower, advanceLibraryFollower, getLibraryFollowerResumePoint, LIBRARY_FOLLOW_DISTANCE, LIBRARY_VISITOR_SPAWN, LIBRARY_VISITOR_SPAWNS,
  libraryTargetEdge, type LibraryPoint,
} from '../src/game/libraryWorld';
import { LIBRARY_CATEGORIES } from '../src/game/librarySession';

// Check swept player footprints analytically, independently of the route's grid/sampling.
function segmentEntersFurniture(from: LibraryPoint, to: LibraryPoint): boolean {
  return LIBRARY_OBSTACLES.some(rect => {
    let entry = 0;
    let exit = 1;
    for (const [start, delta, low, high] of [
      [from.x, to.x - from.x, rect.x - LIBRARY_PLAYER_RADIUS, rect.x + rect.width + LIBRARY_PLAYER_RADIUS],
      [from.y, to.y - from.y, rect.y - LIBRARY_PLAYER_RADIUS, rect.y + rect.height + LIBRARY_PLAYER_RADIUS],
    ]) {
      if (Math.abs(delta) < 0.000001) {
        if (start <= low || start >= high) return false;
        continue;
      }
      const a = (low - start) / delta;
      const b = (high - start) / delta;
      entry = Math.max(entry, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (entry >= exit - 0.000001) return false;
    }
    return entry < exit - 0.000001;
  });
}

const locations = [['spawn', LIBRARY_SPAWN], ...Object.entries(LIBRARY_STATIONS).map(([id, station]) =>
  [id, station.point] as const)] as const;

it('화면 밖 업무 방향은 카메라 이동을 반영하고 HUD와 조작키에 가린 목적지를 안내한다', () => {
  const viewport = { width: 375, height: 740 };
  expect(libraryTargetEdge(null, { x: 0, y: 0 }, viewport)).toBeNull();
  const target = { x: 795, y: 1295 };
  expect(libraryTargetEdge(target, { x: -700, y: -900 }, viewport)).toBeNull();
  expect(libraryTargetEdge(target, { x: -400, y: -900 }, viewport)).toBe('right');
  expect(libraryTargetEdge(target, { x: -900, y: -900 }, viewport)).toBe('left');
  expect(libraryTargetEdge(target, { x: -700, y: -1200 }, viewport)).toBe('up');
  expect(libraryTargetEdge(target, { x: -700, y: -700 }, viewport)).toBe('down');
});

it('KDC 10개 분류는 하나씩 독립 서가와 그 앞의 막히지 않은 접근 지점을 가진다', () => {
  expect(LIBRARY_SHELVES).toHaveLength(10);
  expect(LIBRARY_SHELVES.map(shelf => shelf.id).sort()).toEqual(LIBRARY_CATEGORIES.map(category => category.id).sort());
  expect(new Set(LIBRARY_SHELVES.map(shelf => shelf.id)).size).toBe(10);
  for (const shelf of LIBRARY_SHELVES) {
    const station = LIBRARY_STATIONS[shelf.id];
    expect(station.point.x).toBe(shelf.x + shelf.width / 2);
    expect(station.point.y).toBeGreaterThan(shelf.y + shelf.height + LIBRARY_PLAYER_RADIUS);
    expect(isLibraryBlocked(station.point)).toBe(false);
    expect(shelf.x).toBeGreaterThan(39);
    expect(shelf.x + shelf.width).toBeLessThan(LIBRARY_ROOM.width - 39);
  }
});

describe('도서관 이동 경로', () => {
  it.each(locations)('%s에서 모든 업무 지점과 출구로 가는 길이 가구를 통과하지 않는다', (_id, from) => {
    expect(isLibraryBlocked(from)).toBe(false);
    Object.values(LIBRARY_STATIONS).forEach(({ point: destination }) => {
      const path = findLibraryPath(from, destination);
      expect(path.length).toBeGreaterThan(0);
      expect(path[path.length - 1]).toEqual(destination);
      let previous = from;
      path.forEach(point => {
        expect(isLibraryBlocked(point)).toBe(false);
        if (segmentEntersFurniture(previous, point)) {
          throw new Error(`${_id} -> ${JSON.stringify(destination)} 경로가 가구와 겹칩니다: ${JSON.stringify(previous)} -> ${JSON.stringify(point)}`);
        }
        previous = point;
      });
    });
  });

  it('가구 안이나 벽 밖을 누르면 이동 경로를 만들지 않는다', () => {
    const targets = LIBRARY_OBSTACLES.map(rect => ({
      x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
    }));
    targets.push({ x: 0, y: LIBRARY_ROOM.height / 2 }, { x: LIBRARY_ROOM.width, y: LIBRARY_ROOM.height / 2 },
      { x: LIBRARY_SPAWN.x, y: 120 }, { x: LIBRARY_SPAWN.x, y: LIBRARY_ROOM.height });
    targets.forEach(target => expect(findLibraryPath(LIBRARY_SPAWN, target)).toEqual([]));
  });
});

describe('도서관 이동 충돌', () => {
  it.each(LIBRARY_OBSTACLES)('큰 이동에도 가구 ($x, $y)를 위아래로 관통하지 않는다', rect => {
    const fromAbove = { x: rect.x + rect.width / 2, y: rect.y - LIBRARY_PLAYER_RADIUS - 3 };
    const fromBelow = { x: rect.x + rect.width / 2, y: rect.y + rect.height + LIBRARY_PLAYER_RADIUS + 3 };
    if (rect.y < LIBRARY_WALL_FLOOR_Y) {
      expect(isLibraryBlocked(fromAbove)).toBe(true); // No walkable strip behind the wall installation.
      expect(isLibraryBlocked(fromBelow)).toBe(false);
      expect(moveLibraryPlayer(fromBelow, 0, -LIBRARY_ROOM.height).y).toBeGreaterThanOrEqual(rect.y + rect.height + LIBRARY_PLAYER_RADIUS);
      return;
    }
    expect(isLibraryBlocked(fromAbove)).toBe(false);
    expect(isLibraryBlocked(fromBelow)).toBe(false);
    const down = moveLibraryPlayer(fromAbove, 0, LIBRARY_ROOM.height);
    const up = moveLibraryPlayer(fromBelow, 0, -LIBRARY_ROOM.height);
    expect(isLibraryBlocked(down)).toBe(false);
    expect(isLibraryBlocked(up)).toBe(false);
    expect(down.y).toBeLessThanOrEqual(rect.y - LIBRARY_PLAYER_RADIUS);
    expect(up.y).toBeGreaterThanOrEqual(rect.y + rect.height + LIBRARY_PLAYER_RADIUS);
    expect(segmentEntersFurniture(fromAbove, down)).toBe(false);
    expect(segmentEntersFurniture(fromBelow, up)).toBe(false);
  });

  it('대각선 이동 중 반납 카트에 닿으면 옆으로 움직이되 카트 안으로 들어가지 않는다', () => {
    const cartApproach = LIBRARY_STATIONS.cart.point;
    const cart = LIBRARY_OBSTACLES.filter(rect => rect.x < cartApproach.x && rect.x + rect.width > cartApproach.x
      && rect.y + rect.height < cartApproach.y).sort((a, b) => (b.y + b.height) - (a.y + a.height))[0];
    expect(cart).toBeDefined();
    const start = { x: cart.x + 20, y: cart.y + cart.height + LIBRARY_PLAYER_RADIUS + 21 };
    const end = moveLibraryPlayer(start, 50, -100);
    expect(isLibraryBlocked(start)).toBe(false);
    expect(isLibraryBlocked(end)).toBe(false);
    expect(end.x).toBeCloseTo(start.x + 50);
    expect(end.y).toBeGreaterThanOrEqual(cart.y + cart.height + LIBRARY_PLAYER_RADIUS);
    expect(end.y).toBeLessThan(start.y);
    expect(segmentEntersFurniture(start, end)).toBe(false);
  });

  it('방의 아래 경계에서 대각선으로 걸어도 벽을 넘지 않으며 옆으로 이동한다', () => {
    const start = { x: LIBRARY_SPAWN.x, y: LIBRARY_ROOM.height - 50 };
    const end = moveLibraryPlayer(start, 100, 100);
    expect(end.x).toBe(start.x + 100);
    expect(end.y).toBeLessThanOrEqual(LIBRARY_ROOM.height - 40);
    expect(end.y).toBeGreaterThanOrEqual(start.y);
    expect(isLibraryBlocked(end)).toBe(false);
  });
});

it('큰 창문을 위해 뒤벽 폭만 늘리고 화면 축소 없이 캐릭터와 충돌 크기를 유지한다', () => {
  expect(LIBRARY_ROOM).toEqual({ width: 1860, height: 1520 });
  expect(LIBRARY_VIEW_SCALE).toBe(1);
  expect(LIBRARY_PLAYER_SCALE).toBe(0.55);
  expect(LIBRARY_PLAYER_RADIUS).toBe(17);
});

it('PC 세 좌석과 규격이 같은 연결 서가·양면 서가가 밑동 충돌 영역을 가진다', () => {
  expect(LIBRARY_COMPUTERS).toHaveLength(3);
  expect(new Set(LIBRARY_SHELVES.map(shelf => `${shelf.width}:${shelf.height}`)).size).toBe(2);
  for (const furniture of [...LIBRARY_COMPUTERS, ...LIBRARY_SHELVES]) {
    const foot = { x: furniture.x + furniture.width / 2, y: furniture.y + furniture.height - 20 };
    expect(isLibraryBlocked(foot)).toBe(true);
    expect(LIBRARY_OBSTACLES.some(rect => foot.x > rect.x && foot.x < rect.x + rect.width
      && foot.y > rect.y && foot.y < rect.y + rect.height)).toBe(true);
  }
});

it('창문·연결 서가가 번갈아 벽에 붙고 600~900 양면 서가에는 양쪽·가운데·뒤 통로가 열린다', () => {
  const wall = LIBRARY_SHELF_FIXTURES.filter(fixture => fixture.kind === 'wall');
  const islands = LIBRARY_SHELF_FIXTURES.filter(fixture => fixture.kind === 'island');
  expect(LIBRARY_WALL_WINDOWS).toHaveLength(3);
  const wallOrder = [LIBRARY_WALL_WINDOWS[0], wall[0], LIBRARY_WALL_WINDOWS[1], wall[1], LIBRARY_WALL_WINDOWS[2]];
  wallOrder.slice(1).forEach((item, i) => expect(item.x - (wallOrder[i].x + wallOrder[i].width)).toBe(20));
  expect(wallOrder[0].x).toBe(LIBRARY_ROOM.width - wallOrder[4].x - wallOrder[4].width);
  for (const window of LIBRARY_WALL_WINDOWS) {
    expect(window.width).toBe(180);
    expect(window.height).toBe(162);
    expect(LIBRARY_WALL_FLOOR_Y - window.y - window.height).toBe(50);
    expect(window.y + window.height).toBeGreaterThan(wall[0].y);
    expect(window.y).toBeLessThan(wall[0].y + wall[0].height);
  }
  for (const fixture of wall) {
    expect(fixture.y + fixture.height).toBe(LIBRARY_WALL_FLOOR_Y + 20);
    expect(fixture.width / fixture.height).toBeCloseTo(600 / 184);
  }
  expect(LIBRARY_SHELVES.map(shelf => shelf.id)).toEqual(LIBRARY_CATEGORIES.map(category => category.id));
  expect(islands[1].x - (islands[0].x + islands[0].width)).toBeGreaterThanOrEqual(200);
  for (const point of [
    { x: 95, y: 675 }, // Left aisle.
    { x: 650, y: 675 }, // Central aisle.
    { x: 1190, y: 675 }, // Right aisle, before the PC desks.
    { x: 350, y: 525 }, { x: 950, y: 525 }, // Behind both double-sided islands.
    { x: 350, y: 750 }, { x: 950, y: 750 }, // In front of both.
    { x: 1720, y: 392 }, // The enlarged eastern window has reachable floor in front.
    { x: LIBRARY_ROOM.width - 45, y: 675 }, // New eastern wall boundary.
  ]) {
    expect(isLibraryBlocked(point)).toBe(false);
    const path = findLibraryPath(LIBRARY_SPAWN, point);
    expect(path.at(-1)).toEqual(point);
    let previous = LIBRARY_SPAWN;
    for (const step of path) { expect(segmentEntersFurniture(previous, step)).toBe(false); previous = step; }
  }
});

it('독서 라운지는 인물 비율로 줄어들어도 중심과 바닥 기준을 유지하고 축소된 의자 바닥만 막는다', () => {
  expect(LIBRARY_LOUNGE.x + LIBRARY_LOUNGE.width / 2).toBe(870);
  expect(LIBRARY_LOUNGE.y + LIBRARY_LOUNGE.height).toBe(1033);
  expect(LIBRARY_LOUNGE.width / 3).toBeLessThan(90);
  expect(LIBRARY_LOUNGE.height).toBeLessThan(120);
  expect(isLibraryBlocked({ x: 690, y: 980 })).toBe(false); // Former, oversized left edge is walkable.
  expect(isLibraryBlocked({ x: 870, y: LIBRARY_LOUNGE.y + LIBRARY_LOUNGE_FOOTPRINT_TOP + 10 })).toBe(true);
  expect(isLibraryBlocked({ x: 870, y: 1033 + LIBRARY_PLAYER_RADIUS + 1 })).toBe(false);
});

it('안내받는 손님은 서가 충돌 경계 0.1px 옆을 돌아도 플레이어 발자취를 따라가며 코너를 가로지르지 않는다', () => {
  let leader = { x: 138.9, y: 713.1 };
  const follower = createLibraryFollower({ x: 138.9, y: 789.1 }, leader);
  const corners = [{ x: 561.1, y: 713.1 }, { x: 561.1, y: 632.9 }, { x: 138.9, y: 632.9 }, { x: 138.9, y: 713.1 }];
  for (const target of corners) {
    for (let step = 0; step < 200 && Math.hypot(target.x - leader.x, target.y - leader.y) > 0.01; step++) {
      const distance = Math.hypot(target.x - leader.x, target.y - leader.y);
      const amount = Math.min(5, distance);
      leader = moveLibraryPlayer(leader, (target.x - leader.x) / distance * amount, (target.y - leader.y) / distance * amount);
      const before = { ...follower.position };
      const after = advanceLibraryFollower(follower, leader, 5.3);
      expect(isLibraryBlocked(after)).toBe(false);
      expect(segmentEntersFurniture(before, after)).toBe(false);
      expect(follower.trail.length).toBeLessThan(40);
    }
    expect(leader.x).toBeCloseTo(target.x);
    expect(leader.y).toBeCloseTo(target.y);
  }
  for (let step = 0; step < 20; step++) advanceLibraryFollower(follower, leader, 5.3);
  expect(Math.hypot(follower.position.x - leader.x, follower.position.y - leader.y)).toBeCloseTo(LIBRARY_FOLLOW_DISTANCE);
  const stopped = { ...follower.position };
  advanceLibraryFollower(follower, leader, 100);
  expect(follower.position).toEqual(stopped);
});

it('동행 재입장 위치는 현재 캐릭터 가까이의 안전한 바닥이며 최초 손님은 카트 옆에서 만난다', () => {
  expect(isLibraryBlocked(LIBRARY_VISITOR_SPAWN)).toBe(false);
  expect(Math.hypot(LIBRARY_VISITOR_SPAWN.x - LIBRARY_STATIONS.cart.point.x, LIBRARY_VISITOR_SPAWN.y - LIBRARY_STATIONS.cart.point.y)).toBeLessThan(150);
  const second = LIBRARY_VISITOR_SPAWNS['visitor-2'];
  expect(isLibraryBlocked(second)).toBe(false);
  expect(Math.hypot(second.x - LIBRARY_VISITOR_SPAWN.x, second.y - LIBRARY_VISITOR_SPAWN.y)).toBeGreaterThanOrEqual(180);
  expect(LIBRARY_STATIONS['visitor-2'].point).toEqual({ x: second.x, y: second.y + 60 });
  for (const [, leader] of locations) {
    const resumed = getLibraryFollowerResumePoint(leader);
    expect(isLibraryBlocked(resumed)).toBe(false);
    expect(Math.hypot(resumed.x - leader.x, resumed.y - leader.y)).toBeLessThanOrEqual(LIBRARY_FOLLOW_DISTANCE + 0.01);
    expect(segmentEntersFurniture(resumed, leader)).toBe(false);
  }
});
