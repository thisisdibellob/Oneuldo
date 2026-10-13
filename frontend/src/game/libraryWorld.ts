import { getLibraryCategory, type LibraryCategoryId } from './librarySession';

export type LibraryPoint = { x: number; y: number };
export type LibraryVisitorStation = 'visitor' | 'visitor-2';
export type LibraryStation = LibraryCategoryId | 'librarian' | 'catalog' | 'cart' | 'handoff' | LibraryVisitorStation | 'exit';
// Widen the rear wall for three low windows without scaling people or furniture.
export const LIBRARY_ROOM = { width: 1860, height: 1520 };
export const LIBRARY_SPAWN = { x: 480, y: 1400 };
export const LIBRARY_VISITOR_SPAWN = { x: 910, y: 1260 };
export const LIBRARY_VISITOR_SPAWNS: Record<LibraryVisitorStation, LibraryPoint> = {
  visitor: LIBRARY_VISITOR_SPAWN,
  'visitor-2': { x: 1110, y: 1260 },
};
export const LIBRARY_FOLLOW_DISTANCE = 76;
export const LIBRARY_PLAYER_RADIUS = 17;
export const LIBRARY_PLAYER_SCALE = 0.55;
export const LIBRARY_VIEW_SCALE = 1;
export const LIBRARY_WALL_FLOOR_Y = 300;
export const LIBRARY_WALL_WINDOWS = [
  { id: 'west-window', x: 50, y: 88, width: 180, height: 162 },
  { id: 'middle-window', x: 840, y: 88, width: 180, height: 162 },
  { id: 'east-window', x: 1630, y: 88, width: 180, height: 162 },
] as const;
// The six northern classes share two three-bay wall installations. The two
// freestanding double-sided islands share a lower elevation and a 200px aisle.
export const LIBRARY_SHELF_FIXTURES = [
  { id: 'wall-west', kind: 'wall', x: 250, y: 145.2, width: 570, height: 174.8, art: 'wallShelfLeft', categories: ['general', 'philosophy', 'religion'], labelTop: 7, footprintDepth: 36.1 },
  { id: 'wall-east', kind: 'wall', x: 1040, y: 145.2, width: 570, height: 174.8, art: 'wallShelfRight', categories: ['social', 'nature', 'life'], labelTop: 7, footprintDepth: 36.1 },
  { id: 'island-west', kind: 'island', x: 150, y: 572, width: 400, height: 124, art: 'islandShelfArts', categories: ['arts', 'language'], labelTop: 12, footprintDepth: 46 },
  { id: 'island-east', kind: 'island', x: 750, y: 572, width: 400, height: 124, art: 'islandShelfStory', categories: ['story', 'history'], labelTop: 12, footprintDepth: 46 },
] as const;
export const LIBRARY_SHELVES = LIBRARY_SHELF_FIXTURES.flatMap(fixture => fixture.categories.map((id, bay) => ({
  id, fixtureId: fixture.id, kind: fixture.kind, x: fixture.x + bay * fixture.width / fixture.categories.length,
  y: fixture.y, width: fixture.width / fixture.categories.length, height: fixture.height,
  labelTop: fixture.labelTop, footprintDepth: fixture.footprintDepth,
})));
export const LIBRARY_COMPUTERS = [1230, 1355, 1480].map(x => ({ x, y: 585, width: 120, height: 145 }));
export const LIBRARY_COUNTER = { x: 260, y: 1170, width: 356, height: 116 };
export const LIBRARY_LOUNGE = { x: 745, y: 919, width: 250, height: 114 };
export const LIBRARY_LOUNGE_FOOTPRINT_TOP = Math.round(LIBRARY_LOUNGE.height * 0.32);
// Share art bounds and floor contact rectangles so decoration never uses its
// canopy/tabletop as the collision box or changes depth above its actual base.
export const LIBRARY_DECORATIONS = [
  { id: 'featured-books', label: '추천 도서 전시대', art: 'bookDisplay', x: 330, y: 889, width: 216, height: 95, footprintTop: 66, footprintInset: 10 },
  { id: 'reading-books', label: '라운지 도서 전시대', art: 'bookDisplay', x: 1190, y: 900, width: 192, height: 84, footprintTop: 58, footprintInset: 10 },
  { id: 'entry-plants', label: '입구 화분', art: 'plantCluster', x: 165, y: 1210, width: 90, height: 102, footprintTop: 77, footprintInset: 12 },
  { id: 'lounge-plants', label: '라운지 화분', art: 'plantCluster', x: 1040, y: 871, width: 90, height: 102, footprintTop: 77, footprintInset: 12 },
  { id: 'reading-plants', label: '열람 공간 화분', art: 'plantCluster', x: 1490, y: 1177, width: 93, height: 105, footprintTop: 80, footprintInset: 12 },
] as const;
type LibraryStationInfo = { point: LibraryPoint; label: string; icon: 'chatbubble' | 'book' | 'exit-outline' | 'file-tray' };
const shelfStations = Object.fromEntries(LIBRARY_SHELVES.map(shelf => [shelf.id, {
  point: { x: shelf.x + shelf.width / 2, y: shelf.y + shelf.height + 72 },
  label: getLibraryCategory(shelf.id).label,
  icon: 'book',
}])) as Record<LibraryCategoryId, LibraryStationInfo>;
export const LIBRARY_STATIONS: Record<LibraryStation, LibraryStationInfo> = {
  ...shelfStations,
  librarian: { point: { x: 320, y: 1345 }, label: '사서', icon: 'chatbubble' },
  catalog: { point: { x: 545, y: 1345 }, label: '도서 검색', icon: 'book' },
  cart: { point: { x: 795, y: 1295 }, label: '반납 도서', icon: 'book' },
  handoff: { point: { x: 660, y: 1345 }, label: '확인함', icon: 'file-tray' },
  visitor: { point: { x: LIBRARY_VISITOR_SPAWN.x, y: LIBRARY_VISITOR_SPAWN.y + 60 }, label: '이용자', icon: 'chatbubble' },
  'visitor-2': { point: { x: LIBRARY_VISITOR_SPAWNS['visitor-2'].x, y: LIBRARY_VISITOR_SPAWNS['visitor-2'].y + 60 }, label: '이용자 2', icon: 'chatbubble' },
  exit: { point: { x: 480, y: 1465 }, label: '나가기', icon: 'exit-outline' },
};
export function isLibraryVisitorStation(station: LibraryStation): station is LibraryVisitorStation {
  return station === 'visitor' || station === 'visitor-2';
}
// Furniture occupies its footprint; tall art above it can overlap the player.
export const LIBRARY_OBSTACLES = [
  ...LIBRARY_SHELF_FIXTURES.map(fixture => ({ x: fixture.x + 6, y: fixture.y + fixture.height - fixture.footprintDepth, width: fixture.width - 12, height: fixture.footprintDepth })),
  ...LIBRARY_COMPUTERS.map(pc => ({ x: pc.x + 8, y: pc.y + pc.height - 40, width: pc.width - 16, height: 40 })),
  { x: LIBRARY_COUNTER.x + 8, y: LIBRARY_COUNTER.y + LIBRARY_COUNTER.height - 46, width: LIBRARY_COUNTER.width - 16, height: 46 },
  // Lounge chairs surround the tabletop; its entire floor footprint is solid.
  { x: LIBRARY_LOUNGE.x + 8, y: LIBRARY_LOUNGE.y + LIBRARY_LOUNGE_FOOTPRINT_TOP, width: LIBRARY_LOUNGE.width - 16, height: LIBRARY_LOUNGE.height - LIBRARY_LOUNGE_FOOTPRINT_TOP },
  { x: 637, y: 1260, width: 50, height: 38 },
  { x: 750, y: 1204, width: 90, height: 38 },
  { x: 1330, y: 1210, width: 130, height: 40 },
  ...LIBRARY_DECORATIONS.map(item => ({ x: item.x + item.footprintInset, y: item.y + item.footprintTop, width: item.width - item.footprintInset * 2, height: item.height - item.footprintTop })),
];
export function isLibraryBlocked(p: LibraryPoint) {
  const r = LIBRARY_PLAYER_RADIUS;
  return !Number.isFinite(p.x + p.y) || p.x < 39 || p.x > LIBRARY_ROOM.width - 39 || p.y < LIBRARY_WALL_FLOOR_Y + r || p.y > LIBRARY_ROOM.height - 40
    || LIBRARY_OBSTACLES.some(b => p.x + r > b.x && p.x - r < b.x + b.width && p.y + r > b.y && p.y - r < b.y + b.height);
}
export function moveLibraryPlayer(from: LibraryPoint, dx: number, dy: number): LibraryPoint {
  let next = from;
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 5));
  for (let i = 0; i < count; i++) {
    const x = { x: next.x + dx / count, y: next.y };
    if (!isLibraryBlocked(x)) next = x;
    const y = { x: next.x, y: next.y + dy / count };
    if (!isLibraryBlocked(y)) next = y;
  }
  return next;
}
function clearSegment(from: LibraryPoint, to: LibraryPoint) {
  if (isLibraryBlocked(from) || isLibraryBlocked(to)) return false;
  // Route smoothing must check the entire swept footprint: point sampling can
  // miss a short diagonal intersection at a desk or cart corner.
  return !LIBRARY_OBSTACLES.some(rect => {
    const radius = LIBRARY_PLAYER_RADIUS;
    let entry = 0;
    let exit = 1;
    const axes = [
      [from.x, to.x - from.x, rect.x - radius, rect.x + rect.width + radius],
      [from.y, to.y - from.y, rect.y - radius, rect.y + rect.height + radius],
    ];
    for (const [start, delta, low, high] of axes) {
      if (delta === 0) {
        // Contact with the boundary is allowed, matching isLibraryBlocked.
        if (start <= low || start >= high) return false;
        continue;
      }
      const a = (low - start) / delta;
      const b = (high - start) / delta;
      entry = Math.max(entry, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (entry >= exit) return false;
    }
    return entry < exit;
  });
}
/** Small room: a bounded grid search gives taps a route around desks and shelves. */
export function findLibraryPath(from: LibraryPoint, to: LibraryPoint): LibraryPoint[] {
  if (isLibraryBlocked(to)) return [];
  if (clearSegment(from, to)) return [to];
  const step = 24;
  const grid = (p: LibraryPoint) => ({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step });
  const neighbors = (p: LibraryPoint) => [{ x: p.x + step, y: p.y }, { x: p.x - step, y: p.y }, { x: p.x, y: p.y + step }, { x: p.x, y: p.y - step }];
  const candidates = [grid(from), ...neighbors(grid(from))].filter(p => !isLibraryBlocked(p) && clearSegment(from, p));
  if (!candidates.length) return [];
  const key = (p: LibraryPoint) => `${p.x},${p.y}`;
  const queue = [...candidates]; const previous = new Map<string, LibraryPoint | null>(candidates.map(p => [key(p), null]));
  let found: LibraryPoint | null = null;
  for (let index = 0; index < queue.length && index < Math.ceil(LIBRARY_ROOM.width * LIBRARY_ROOM.height / (step * step)); index++) {
    const point = queue[index];
    if (Math.hypot(point.x - to.x, point.y - to.y) < 45 && clearSegment(point, to)) { found = point; break; }
    for (const next of neighbors(point)) {
      if (previous.has(key(next)) || !clearSegment(point, next)) continue;
      previous.set(key(next), point); queue.push(next);
    }
  }
  if (!found) return [];
  const path: LibraryPoint[] = [to];
  for (let p: LibraryPoint | null = found; p; p = previous.get(key(p)) ?? null) path.unshift(p);
  const reduced: LibraryPoint[] = []; let anchor = from;
  for (let i = 0; i < path.length;) {
    let last = i;
    while (last + 1 < path.length && clearSegment(anchor, path[last + 1])) last++;
    reduced.push(path[last]); anchor = path[last]; i = last + 1;
  }
  return reduced;
}

export type LibraryTargetEdge = 'up' | 'down' | 'left' | 'right';
/** Keep guidance inside the playable view, clear of the task card and controls. */
export function libraryTargetEdge(point: LibraryPoint | null, camera: LibraryPoint, viewport: { width: number; height: number }, scale = 1): LibraryTargetEdge | null {
  if (!point) return null;
  const x = point.x * scale + camera.x;
  const y = point.y * scale + camera.y;
  const top = Math.min(185, viewport.height * 0.3);
  const bottom = Math.max(top + 80, viewport.height - 220);
  const sides: [LibraryTargetEdge, number][] = [
    ['left', (42 - x) / viewport.width], ['right', (x - viewport.width + 42) / viewport.width],
    ['up', (top - y) / viewport.height], ['down', (y - bottom) / viewport.height],
  ];
  const [edge, overflow] = sides.sort((a, b) => b[1] - a[1])[0];
  return overflow > 0 ? edge : null;
}

export type LibraryFollower = { position: LibraryPoint; trail: LibraryPoint[] };

/** A resumed escort starts nearby, on reachable floor, instead of across the room. */
export function getLibraryFollowerResumePoint(leader: LibraryPoint): LibraryPoint {
  for (const [x, y] of [[0, 1], [1, 0], [-1, 0], [0, -1], [0.707, 0.707], [-0.707, 0.707]]) {
    const point = { x: leader.x + x * LIBRARY_FOLLOW_DISTANCE, y: leader.y + y * LIBRARY_FOLLOW_DISTANCE };
    if (clearSegment(leader, point)) return point;
  }
  return { ...leader };
}

export function createLibraryFollower(start: LibraryPoint, leader: LibraryPoint): LibraryFollower {
  return { position: { ...start }, trail: findLibraryPath(start, leader).map(point => ({ ...point })) };
}

/** Consume the actual walked polyline: a follower must never cut across a desk corner. */
export function advanceLibraryFollower(follower: LibraryFollower, leader: LibraryPoint, maxDistance: number): LibraryPoint {
  const frameStart = follower.position;
  const tail = follower.trail.at(-1) ?? follower.position;
  if (Math.hypot(leader.x - tail.x, leader.y - tail.y) > 0.01) {
    // Axis-sliding can bend inside a single player frame. Check that short segment too.
    const addition = clearSegment(tail, leader) ? [leader] : findLibraryPath(tail, leader);
    follower.trail.push(...addition.map(point => ({ ...point })));
  }
  let trailLength = 0;
  let previous = follower.position;
  for (const point of follower.trail) {
    trailLength += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  let remaining = Math.min(Math.max(0, maxDistance), Math.max(0, trailLength - LIBRARY_FOLLOW_DISTANCE));
  while (remaining > 0.001 && follower.trail.length) {
    const next = follower.trail[0];
    const distance = Math.hypot(next.x - follower.position.x, next.y - follower.position.y);
    if (distance <= remaining + 0.001) {
      // A single rendered frame must also stay outside the expanded footprint,
      // even when it could consume waypoints on both sides of a very tight turn.
      if (!clearSegment(frameStart, next)) break;
      follower.position = { ...next };
      follower.trail.shift();
      remaining -= distance;
    } else {
      const fraction = remaining / distance;
      const candidate = { x: follower.position.x + (next.x - follower.position.x) * fraction, y: follower.position.y + (next.y - follower.position.y) * fraction };
      if (clearSegment(frameStart, candidate)) follower.position = candidate;
      remaining = 0;
    }
  }
  return follower.position;
}
