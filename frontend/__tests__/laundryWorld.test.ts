import { LAUNDRY_DRYER, LAUNDRY_FOLDING_TABLE, LAUNDRY_OBSTACLES, LAUNDRY_PLAYER_RADIUS, LAUNDRY_PLAYER_SCALE, LAUNDRY_ROOM, LAUNDRY_SPAWN, LAUNDRY_STATIONS, LAUNDRY_VIEW_SCALE, LAUNDRY_WALL_FLOOR_Y, laundryTargetEdge, findLaundryPath, isLaundryBlocked, moveLaundryPlayer, type LaundryPoint } from '../src/game/laundryWorld';
import { LIBRARY_PLAYER_SCALE, LIBRARY_VIEW_SCALE } from '../src/game/libraryWorld';

function segmentEntersFurniture(from: LaundryPoint, to: LaundryPoint): boolean {
  return LAUNDRY_OBSTACLES.some(rect => {
    let entry = 0; let exit = 1;
    for (const [start, delta, low, high] of [
      [from.x, to.x - from.x, rect.x - LAUNDRY_PLAYER_RADIUS, rect.x + rect.width + LAUNDRY_PLAYER_RADIUS],
      [from.y, to.y - from.y, rect.y - LAUNDRY_PLAYER_RADIUS, rect.y + rect.height + LAUNDRY_PLAYER_RADIUS],
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

const locations = [['spawn', LAUNDRY_SPAWN], ...Object.entries(LAUNDRY_STATIONS).map(([id, station]) => [id, station.point] as const)] as const;

it('도서관과 같은 캐릭터 크기를 유지하고 휴대폰에 방 전체를 축소하지 않는다', () => {
  expect(LAUNDRY_PLAYER_SCALE).toBe(LIBRARY_PLAYER_SCALE);
  expect(LAUNDRY_VIEW_SCALE).toBe(LIBRARY_VIEW_SCALE);
  expect(LAUNDRY_ROOM.width).toBeGreaterThan(1000);
});

it.each(locations)('%s에서 모든 업무 지점으로 가는 경로가 가구를 통과하지 않는다', (_id, from) => {
  expect(isLaundryBlocked(from)).toBe(false);
  for (const { point: to } of Object.values(LAUNDRY_STATIONS)) {
    const path = findLaundryPath(from, to);
    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)).toEqual(to);
    let previous = from;
    for (const point of path) {
      expect(isLaundryBlocked(point)).toBe(false);
      expect(segmentEntersFurniture(previous, point)).toBe(false);
      previous = point;
    }
  }
});

it.each(LAUNDRY_OBSTACLES)('가구 ($x,$y) 밑동은 큰 이동에도 관통하지 않는다', rect => {
  const from = { x: rect.x + rect.width / 2, y: rect.y + rect.height + LAUNDRY_PLAYER_RADIUS + 3 };
  expect(isLaundryBlocked(from)).toBe(false);
  const moved = moveLaundryPlayer(from, 0, -LAUNDRY_ROOM.height);
  expect(isLaundryBlocked(moved)).toBe(false);
  expect(moved.y).toBeGreaterThanOrEqual(rect.y + rect.height + LAUNDRY_PLAYER_RADIUS);
  expect(segmentEntersFurniture(from, moved)).toBe(false);
});

it('벽과 가구 안의 터치 목적지를 거절한다', () => {
  const blocked = LAUNDRY_OBSTACLES.map(rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }));
  blocked.push({ x: 0, y: 500 }, { x: 600, y: LAUNDRY_WALL_FLOOR_Y }, { x: NaN, y: 500 });
  blocked.forEach(point => expect(findLaundryPath(LAUNDRY_SPAWN, point)).toEqual([]));
  expect(moveLaundryPlayer(LAUNDRY_SPAWN, Infinity, 0)).toBe(LAUNDRY_SPAWN);
});

it('가구 앞에 선 캐릭터의 깊이는 기계와 테이블 밑동보다 크다', () => {
  expect(LAUNDRY_STATIONS.dryer.point.y).toBeGreaterThan(LAUNDRY_DRYER.y + LAUNDRY_DRYER.height + LAUNDRY_PLAYER_RADIUS);
  expect(LAUNDRY_STATIONS.fold.point.y).toBeGreaterThan(LAUNDRY_FOLDING_TABLE.y + LAUNDRY_FOLDING_TABLE.height + LAUNDRY_PLAYER_RADIUS);
});

it('작은 화면에서 보이지 않는 업무 지점의 방향을 알려준다', () => {
  const viewport = { width: 375, height: 740 };
  expect(laundryTargetEdge(null, { x: 0, y: 0 }, viewport)).toBeNull();
  expect(laundryTargetEdge({ x: 200, y: 300 }, { x: 0, y: 0 }, viewport)).toBeNull();
  expect(laundryTargetEdge(LAUNDRY_STATIONS.washer.point, { x: -450, y: -500 }, viewport)).toBe('up');
  expect(laundryTargetEdge(LAUNDRY_STATIONS.fold.point, { x: -300, y: -400 }, viewport)).toBe('right');
});
