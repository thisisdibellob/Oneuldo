import { CAFE_COUNTER, CAFE_OBSTACLES, CAFE_PLAYER_RADIUS, CAFE_PLAYER_SCALE, CAFE_ROOM, CAFE_SPAWN, CAFE_STATIONS, CAFE_TABLES, CAFE_VIEW_SCALE, CAFE_WALL_FLOOR_Y, cafeTargetEdge, findCafePath, isCafeBlocked, moveCafePlayer, type CafePoint } from '../src/game/cafeWorld';
import { LIBRARY_PLAYER_SCALE, LIBRARY_VIEW_SCALE } from '../src/game/libraryWorld';

function segmentEntersFurniture(from: CafePoint, to: CafePoint): boolean {
  return CAFE_OBSTACLES.some(rect => {
    let entry = 0; let exit = 1;
    for (const [start, delta, low, high] of [
      [from.x, to.x - from.x, rect.x - CAFE_PLAYER_RADIUS, rect.x + rect.width + CAFE_PLAYER_RADIUS],
      [from.y, to.y - from.y, rect.y - CAFE_PLAYER_RADIUS, rect.y + rect.height + CAFE_PLAYER_RADIUS],
    ]) {
      if (Math.abs(delta) < 0.000001) {
        if (start <= low || start >= high) return false;
        continue;
      }
      const a = (low - start) / delta; const b = (high - start) / delta;
      entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (entry >= exit - 0.000001) return false;
    }
    return entry < exit - 0.000001;
  });
}

const locations = [['spawn', CAFE_SPAWN], ...Object.entries(CAFE_STATIONS).map(([id, station]) => [id, station.point] as const)] as const;

it('도서관과 같은 캐릭터 크기를 유지하고 휴대폰에 방 전체를 축소하지 않는다', () => {
  expect(CAFE_PLAYER_SCALE).toBe(LIBRARY_PLAYER_SCALE);
  expect(CAFE_VIEW_SCALE).toBe(LIBRARY_VIEW_SCALE);
  expect(CAFE_ROOM.width).toBeGreaterThan(1000);
});

it.each(locations)('%s에서 모든 업무 지점으로 가는 경로가 가구를 통과하지 않는다', (_id, from) => {
  expect(isCafeBlocked(from)).toBe(false);
  for (const { point: to } of Object.values(CAFE_STATIONS)) {
    const path = findCafePath(from, to);
    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)).toEqual(to);
    let previous = from;
    for (const point of path) {
      expect(isCafeBlocked(point)).toBe(false);
      expect(segmentEntersFurniture(previous, point)).toBe(false);
      previous = point;
    }
  }
});

it.each(CAFE_OBSTACLES)('가구 ($x,$y) 밑동은 큰 이동에도 관통하지 않는다', rect => {
  const from = { x: rect.x + rect.width / 2, y: rect.y + rect.height + CAFE_PLAYER_RADIUS + 3 };
  expect(isCafeBlocked(from)).toBe(false);
  const moved = moveCafePlayer(from, 0, -CAFE_ROOM.height);
  expect(isCafeBlocked(moved)).toBe(false);
  expect(moved.y).toBeGreaterThanOrEqual(rect.y + rect.height + CAFE_PLAYER_RADIUS);
  expect(segmentEntersFurniture(from, moved)).toBe(false);
});

it('벽과 가구 안의 터치 목적지를 거절한다', () => {
  const blocked = CAFE_OBSTACLES.map(rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }));
  blocked.push({ x: 0, y: 500 }, { x: 600, y: CAFE_WALL_FLOOR_Y }, { x: NaN, y: 500 });
  blocked.forEach(point => expect(findCafePath(CAFE_SPAWN, point)).toEqual([]));
  expect(moveCafePlayer(CAFE_SPAWN, Infinity, 0)).toBe(CAFE_SPAWN);
});

it('가구 표시 깊이는 밑동이므로 앞에 선 캐릭터가 책상 뒤로 숨지 않는다', () => {
  const counterBase = CAFE_COUNTER.y + CAFE_COUNTER.height;
  expect(CAFE_STATIONS.brew.point.y).toBeGreaterThan(counterBase + CAFE_PLAYER_RADIUS);
  const service = CAFE_TABLES.find(table => table.id === 'service')!;
  expect(CAFE_STATIONS.table.point.y).toBeGreaterThan(service.y + service.height + CAFE_PLAYER_RADIUS);
});

it('작은 화면에서 보이지 않는 업무 지점의 방향을 알려준다', () => {
  const viewport = { width: 375, height: 740 };
  expect(cafeTargetEdge(null, { x: 0, y: 0 }, viewport)).toBeNull();
  expect(cafeTargetEdge({ x: 200, y: 300 }, { x: 0, y: 0 }, viewport)).toBeNull();
  expect(cafeTargetEdge(CAFE_STATIONS.brew.point, { x: -450, y: -500 }, viewport)).toBe('up');
  expect(cafeTargetEdge(CAFE_STATIONS.customer.point, { x: -300, y: -400 }, viewport)).toBe('right');
});
