export type LaundryPoint = { x: number; y: number };
export type LaundryStation = 'basket' | 'washer' | 'dryer' | 'rack' | 'fold' | 'exit';

// A compact, walkable shop at the same character scale as the library.
export const LAUNDRY_ROOM = { width: 1200, height: 1000 };
export const LAUNDRY_PLAYER_SCALE = 0.55;
export const LAUNDRY_VIEW_SCALE = 1;
export const LAUNDRY_PLAYER_RADIUS = 17;
export const LAUNDRY_WALL_FLOOR_Y = 285;
export const LAUNDRY_SPAWN: LaundryPoint = { x: 600, y: 855 };
export const LAUNDRY_WASHERS = [
  { id: 'occupied', x: 228, y: 259, width: 138, height: 180, footprintTop: 138 },
  { id: 'available', x: 398, y: 259, width: 138, height: 180, footprintTop: 138 },
] as const;
export const LAUNDRY_DRYER = { x: 615.5, y: 259, width: 133, height: 180, footprintTop: 138 };
export const LAUNDRY_FOLDING_TABLE = { x: 795, y: 698, width: 245, height: 90, footprintTop: 48 };
export const LAUNDRY_DRYING_RACK = { x: 62, y: 618, width: 205, height: 138, footprintTop: 112 };
export const LAUNDRY_BASKET = { x: 389, y: 748, width: 96, height: 46, footprintTop: 26 };
export const LAUNDRY_BENCH = { x: 915, y: 422, width: 180, height: 94, footprintTop: 60 };
export const LAUNDRY_PLANTS = [
  { x: 70, y: 350, width: 84, height: 100, footprintTop: 78 },
  { x: 1060, y: 765, width: 84, height: 100, footprintTop: 78 },
] as const;
export const LAUNDRY_WINDOWS = [
  { x: 46, y: 73, width: 173, height: 160 },
  { x: 905, y: 73, width: 173, height: 160 },
] as const;
export const LAUNDRY_STATIONS: Record<LaundryStation, { point: LaundryPoint; label: string; icon: 'basket' | 'water' | 'sunny' | 'shirt' | 'hand-left' | 'exit-outline' }> = {
  basket: { point: { x: 440, y: 843 }, label: '빨래 바구니', icon: 'basket' },
  washer: { point: { x: 467, y: 493 }, label: '세탁기', icon: 'water' },
  dryer: { point: { x: 682, y: 493 }, label: '건조기', icon: 'sunny' },
  rack: { point: { x: 303, y: 720 }, label: '건조대', icon: 'shirt' },
  fold: { point: { x: 918, y: 839 }, label: '빨래 개기', icon: 'hand-left' },
  exit: { point: { x: 600, y: 945 }, label: '나가기', icon: 'exit-outline' },
};

// Only furniture feet occupy the floor. Tall drawings use the same base as
// their depth, so a player below a machine/table stays in front of it.
export const LAUNDRY_OBSTACLES = [
  ...LAUNDRY_WASHERS, LAUNDRY_DRYER, LAUNDRY_FOLDING_TABLE,
  LAUNDRY_DRYING_RACK, LAUNDRY_BASKET, LAUNDRY_BENCH, ...LAUNDRY_PLANTS,
].map(item => ({ x: item.x + 10, y: item.y + item.footprintTop, width: item.width - 20, height: item.height - item.footprintTop }));

export function isLaundryBlocked(point: LaundryPoint): boolean {
  const r = LAUNDRY_PLAYER_RADIUS;
  return !Number.isFinite(point.x + point.y) || point.x < 39 || point.x > LAUNDRY_ROOM.width - 39
    || point.y < LAUNDRY_WALL_FLOOR_Y + r || point.y > LAUNDRY_ROOM.height - 40
    || LAUNDRY_OBSTACLES.some(rect => point.x + r > rect.x && point.x - r < rect.x + rect.width && point.y + r > rect.y && point.y - r < rect.y + rect.height);
}

export function moveLaundryPlayer(from: LaundryPoint, dx: number, dy: number): LaundryPoint {
  if (!Number.isFinite(dx + dy)) return from;
  let next = from;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 5));
  for (let step = 0; step < steps; step++) {
    const x = { x: next.x + dx / steps, y: next.y };
    if (!isLaundryBlocked(x)) next = x;
    const y = { x: next.x, y: next.y + dy / steps };
    if (!isLaundryBlocked(y)) next = y;
  }
  return next;
}

function clearSegment(from: LaundryPoint, to: LaundryPoint): boolean {
  if (isLaundryBlocked(from) || isLaundryBlocked(to)) return false;
  // Sweep the full foot radius, including diagonal table corners.
  return !LAUNDRY_OBSTACLES.some(rect => {
    let entry = 0; let exit = 1;
    for (const [start, delta, low, high] of [
      [from.x, to.x - from.x, rect.x - LAUNDRY_PLAYER_RADIUS, rect.x + rect.width + LAUNDRY_PLAYER_RADIUS],
      [from.y, to.y - from.y, rect.y - LAUNDRY_PLAYER_RADIUS, rect.y + rect.height + LAUNDRY_PLAYER_RADIUS],
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
export function findLaundryPath(from: LaundryPoint, to: LaundryPoint): LaundryPoint[] {
  if (isLaundryBlocked(to) || isLaundryBlocked(from)) return [];
  if (clearSegment(from, to)) return [to];
  const step = 24;
  const grid = (point: LaundryPoint) => ({ x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step });
  const neighbors = (point: LaundryPoint) => [{ x: point.x + step, y: point.y }, { x: point.x - step, y: point.y }, { x: point.x, y: point.y + step }, { x: point.x, y: point.y - step }];
  const candidates = [grid(from), ...neighbors(grid(from))].filter(point => clearSegment(from, point));
  if (!candidates.length) return [];
  const key = (point: LaundryPoint) => `${point.x},${point.y}`;
  const queue = [...candidates]; const previous = new Map<string, LaundryPoint | null>(candidates.map(point => [key(point), null]));
  let found: LaundryPoint | null = null;
  for (let index = 0; index < queue.length && index < Math.ceil(LAUNDRY_ROOM.width * LAUNDRY_ROOM.height / (step * step)); index++) {
    const point = queue[index];
    if (Math.hypot(point.x - to.x, point.y - to.y) < 45 && clearSegment(point, to)) { found = point; break; }
    for (const next of neighbors(point)) {
      if (previous.has(key(next)) || !clearSegment(point, next)) continue;
      previous.set(key(next), point); queue.push(next);
    }
  }
  if (!found) return [];
  const path: LaundryPoint[] = [to];
  for (let point: LaundryPoint | null = found; point; point = previous.get(key(point)) ?? null) path.unshift(point);
  const reduced: LaundryPoint[] = []; let anchor = from;
  for (let i = 0; i < path.length;) {
    let last = i;
    while (last + 1 < path.length && clearSegment(anchor, path[last + 1])) last++;
    reduced.push(path[last]); anchor = path[last]; i = last + 1;
  }
  return reduced;
}

export type LaundryTargetEdge = 'up' | 'down' | 'left' | 'right';
export function laundryTargetEdge(point: LaundryPoint | null, camera: LaundryPoint, viewport: { width: number; height: number }, scale = 1): LaundryTargetEdge | null {
  if (!point) return null;
  const x = point.x * scale + camera.x; const y = point.y * scale + camera.y;
  const top = Math.min(185, viewport.height * 0.3); const bottom = Math.max(top + 80, viewport.height - 220);
  const sides: [LaundryTargetEdge, number][] = [
    ['left', (42 - x) / viewport.width], ['right', (x - viewport.width + 42) / viewport.width],
    ['up', (top - y) / viewport.height], ['down', (y - bottom) / viewport.height],
  ];
  const [edge, overflow] = sides.sort((a, b) => b[1] - a[1])[0];
  return overflow > 0 ? edge : null;
}
