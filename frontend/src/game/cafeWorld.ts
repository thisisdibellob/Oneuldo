export type CafePoint = { x: number; y: number };
export type CafeStation = 'coworker' | 'customer' | 'brew' | 'table' | 'exit';
export type CafeGuestId = 'minsu' | 'jiyoung' | 'sujin';

// Keep people at the library/village scale; the camera follows them instead of
// shrinking the whole room to fit a phone screen.
export const CAFE_ROOM = { width: 1360, height: 1100 };
export const CAFE_PLAYER_SCALE = 0.55;
export const CAFE_VIEW_SCALE = 1;
export const CAFE_PLAYER_RADIUS = 17;
export const CAFE_WALL_FLOOR_Y = 290;
export const CAFE_SPAWN: CafePoint = { x: 640, y: 930 };
export const CAFE_COWORKER: CafePoint = { x: 165, y: 400 };
export const CAFE_CUSTOMER: CafePoint = { x: 805, y: 670 };
export const CAFE_COUNTER = { x: 220, y: 268, width: 450, height: 142, footprintTop: 94 };
export const CAFE_SHELF = { x: 330, y: 105, width: 260, height: 89 };
export const CAFE_TABLES = [
  { id: 'service', x: 870, y: 696, width: 200, height: 104, footprintTop: 38 },
  { id: 'window', x: 1050, y: 406, width: 180, height: 94, footprintTop: 34 },
  { id: 'lounge', x: 265, y: 731, width: 180, height: 94, footprintTop: 34 },
] as const;
export const CAFE_PLANTS = [
  { x: 1110, y: 825, width: 90, height: 102, footprintTop: 78 },
  { x: 105, y: 565, width: 90, height: 102, footprintTop: 78 },
  { x: 1220, y: 270, width: 75, height: 85, footprintTop: 65 },
] as const;
export const CAFE_WINDOWS = [
  { x: 60, y: 77, width: 180, height: 162 },
  { x: 820, y: 77, width: 180, height: 162 },
  { x: 1080, y: 77, width: 180, height: 162 },
] as const;
export const CAFE_STATIONS: Record<CafeStation, { point: CafePoint; label: string; icon: 'chatbubble' | 'cafe' | 'sparkles' | 'exit-outline' }> = {
  coworker: { point: { x: 170, y: 465 }, label: '동료', icon: 'chatbubble' },
  customer: { point: { x: 785, y: 730 }, label: '손님', icon: 'chatbubble' },
  brew: { point: { x: 595, y: 472 }, label: '음료 만들기', icon: 'cafe' },
  table: { point: { x: 965, y: 852 }, label: '자리 정리', icon: 'sparkles' },
  exit: { point: { x: 640, y: 1035 }, label: '나가기', icon: 'exit-outline' },
};

// Tall pixels are not solid: depth and collision meet at each furniture base.
export const CAFE_OBSTACLES = [
  { x: CAFE_COUNTER.x + 10, y: CAFE_COUNTER.y + CAFE_COUNTER.footprintTop, width: CAFE_COUNTER.width - 20, height: CAFE_COUNTER.height - CAFE_COUNTER.footprintTop },
  ...CAFE_TABLES.map(table => ({ x: table.x + 12, y: table.y + table.footprintTop, width: table.width - 24, height: table.height - table.footprintTop })),
  ...CAFE_PLANTS.map(plant => ({ x: plant.x + 14, y: plant.y + plant.footprintTop, width: plant.width - 28, height: plant.height - plant.footprintTop })),
];

export function isCafeBlocked(point: CafePoint): boolean {
  const r = CAFE_PLAYER_RADIUS;
  return !Number.isFinite(point.x + point.y) || point.x < 39 || point.x > CAFE_ROOM.width - 39
    || point.y < CAFE_WALL_FLOOR_Y + r || point.y > CAFE_ROOM.height - 40
    || CAFE_OBSTACLES.some(rect => point.x + r > rect.x && point.x - r < rect.x + rect.width && point.y + r > rect.y && point.y - r < rect.y + rect.height);
}

export function moveCafePlayer(from: CafePoint, dx: number, dy: number): CafePoint {
  if (!Number.isFinite(dx + dy)) return from;
  let next = from;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 5));
  for (let step = 0; step < steps; step++) {
    const x = { x: next.x + dx / steps, y: next.y };
    if (!isCafeBlocked(x)) next = x;
    const y = { x: next.x, y: next.y + dy / steps };
    if (!isCafeBlocked(y)) next = y;
  }
  return next;
}

function clearSegment(from: CafePoint, to: CafePoint): boolean {
  if (isCafeBlocked(from) || isCafeBlocked(to)) return false;
  // Sweep the full foot radius, including diagonal table corners.
  return !CAFE_OBSTACLES.some(rect => {
    let entry = 0; let exit = 1;
    for (const [start, delta, low, high] of [
      [from.x, to.x - from.x, rect.x - CAFE_PLAYER_RADIUS, rect.x + rect.width + CAFE_PLAYER_RADIUS],
      [from.y, to.y - from.y, rect.y - CAFE_PLAYER_RADIUS, rect.y + rect.height + CAFE_PLAYER_RADIUS],
    ]) {
      if (delta === 0) {
        if (start <= low || start >= high) return false;
        continue;
      }
      const a = (low - start) / delta; const b = (high - start) / delta;
      entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (entry >= exit) return false;
    }
    return entry < exit;
  });
}

/** Bounded path search for the explicit touch-to-walk control mode. */
export function findCafePath(from: CafePoint, to: CafePoint): CafePoint[] {
  if (isCafeBlocked(to) || isCafeBlocked(from)) return [];
  if (clearSegment(from, to)) return [to];
  const step = 24;
  const grid = (point: CafePoint) => ({ x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step });
  const neighbors = (point: CafePoint) => [{ x: point.x + step, y: point.y }, { x: point.x - step, y: point.y }, { x: point.x, y: point.y + step }, { x: point.x, y: point.y - step }];
  const candidates = [grid(from), ...neighbors(grid(from))].filter(point => clearSegment(from, point));
  if (!candidates.length) return [];
  const key = (point: CafePoint) => `${point.x},${point.y}`;
  const queue = [...candidates]; const previous = new Map<string, CafePoint | null>(candidates.map(point => [key(point), null]));
  let found: CafePoint | null = null;
  for (let index = 0; index < queue.length && index < Math.ceil(CAFE_ROOM.width * CAFE_ROOM.height / (step * step)); index++) {
    const point = queue[index];
    if (Math.hypot(point.x - to.x, point.y - to.y) < 45 && clearSegment(point, to)) { found = point; break; }
    for (const next of neighbors(point)) {
      if (previous.has(key(next)) || !clearSegment(point, next)) continue;
      previous.set(key(next), point); queue.push(next);
    }
  }
  if (!found) return [];
  const path: CafePoint[] = [to];
  for (let point: CafePoint | null = found; point; point = previous.get(key(point)) ?? null) path.unshift(point);
  const reduced: CafePoint[] = []; let anchor = from;
  for (let i = 0; i < path.length;) {
    let last = i;
    while (last + 1 < path.length && clearSegment(anchor, path[last + 1])) last++;
    reduced.push(path[last]); anchor = path[last]; i = last + 1;
  }
  return reduced;
}

export type CafeTargetEdge = 'up' | 'down' | 'left' | 'right';
export function cafeTargetEdge(point: CafePoint | null, camera: CafePoint, viewport: { width: number; height: number }, scale = 1): CafeTargetEdge | null {
  if (!point) return null;
  const x = point.x * scale + camera.x; const y = point.y * scale + camera.y;
  const top = Math.min(185, viewport.height * 0.3); const bottom = Math.max(top + 80, viewport.height - 220);
  const sides: [CafeTargetEdge, number][] = [
    ['left', (42 - x) / viewport.width], ['right', (x - viewport.width + 42) / viewport.width],
    ['up', (top - y) / viewport.height], ['down', (y - bottom) / viewport.height],
  ];
  const [edge, overflow] = sides.sort((a, b) => b[1] - a[1])[0];
  return overflow > 0 ? edge : null;
}
