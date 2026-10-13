import { villageObstacles, VILLAGE_ROADS, WORLD_BOUNDS, type Point, type Rect } from './prototypeWorld';
import { VILLAGE_CROSSINGS } from './villageStreets';

export const VILLAGE_PLAYER_RADIUS = 22;
export const VILLAGE_BUS_STOP_INTERACTION_DISTANCE = 24;
const GRID_STEP = 16;
const bounds = WORLD_BOUNDS.village;

export function isVillageNavigationBlocked(point: Point): boolean {
  const radius = VILLAGE_PLAYER_RADIUS;
  return !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < radius || point.y < radius || point.x > bounds.width - radius || point.y > bounds.height - radius
    || villageObstacles.some(rect => point.x + radius > rect.x && point.x - radius < rect.x + rect.width
      && point.y + radius > rect.y && point.y - radius < rect.y + rect.height);
}

/** Continuous swept-square collision, including corners between grid samples. */
function segmentEntersRect(from: Point, to: Point, rect: Rect, radius = VILLAGE_PLAYER_RADIUS): boolean {
  let enter = 0; let leave = 1;
  for (const axis of ['x', 'y'] as const) {
    const minimum = rect[axis] - radius;
    const maximum = rect[axis] + (axis === 'x' ? rect.width : rect.height) + radius;
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 0.000001) {
      if (from[axis] <= minimum || from[axis] >= maximum) return false;
      continue;
    }
    const first = (minimum - from[axis]) / delta;
    const second = (maximum - from[axis]) / delta;
    enter = Math.max(enter, Math.min(first, second)); leave = Math.min(leave, Math.max(first, second));
    if (enter >= leave - 0.000001) return false;
  }
  return enter < leave - 0.000001;
}

export function isVillageNavigationSegmentClear(from: Point, to: Point): boolean {
  return !isVillageNavigationBlocked(from) && !isVillageNavigationBlocked(to)
    && !villageObstacles.some(rect => segmentEntersRect(from, to, rect));
}

const containsPoint = (rect: Rect, point: Point) => point.x > rect.x && point.x < rect.x + rect.width
  && point.y > rect.y && point.y < rect.y + rect.height;

// Painted stripes stop 12 px short of each kerb. Include those unpainted ends so
// every crossing connects continuously to the pavement on both sides.
const crossingCorridors: readonly Rect[] = VILLAGE_CROSSINGS.map(crossing => crossing.direction === 'across-main'
  ? { ...crossing, y: crossing.y - 12, height: crossing.height + 24 }
  : { ...crossing, x: crossing.x - 12, width: crossing.width + 24 });

function subtractRect(rect: Rect, opening: Rect): Rect[] {
  const left = Math.max(rect.x, opening.x); const right = Math.min(rect.x + rect.width, opening.x + opening.width);
  const top = Math.max(rect.y, opening.y); const bottom = Math.min(rect.y + rect.height, opening.y + opening.height);
  if (right <= left || bottom <= top) return [rect];
  return [
    { x: rect.x, y: rect.y, width: rect.width, height: top - rect.y },
    { x: rect.x, y: bottom, width: rect.width, height: rect.y + rect.height - bottom },
    { x: rect.x, y: top, width: left - rect.x, height: bottom - top },
    { x: right, y: top, width: rect.x + rect.width - right, height: bottom - top },
  ].filter(piece => piece.width > 0 && piece.height > 0);
}

const nonCrossingRoads: readonly Rect[] = crossingCorridors.reduce<Rect[]>(
  (pieces, crossing) => pieces.flatMap(piece => subtractRect(piece, crossing)), [...VILLAGE_ROADS]);

export function isVillageRoadPoint(point: Point): boolean {
  // Include the kerb line itself: a tap exactly where two road rectangles meet
  // must not be mistaken for an isolated pavement destination.
  return VILLAGE_ROADS.some(road => point.x >= road.x && point.x <= road.x + road.width
    && point.y >= road.y && point.y <= road.y + road.height);
}

/** Auto-walking to pavement destinations may only enter roads through crossings. */
export function isVillagePedestrianSegmentClear(from: Point, to: Point): boolean {
  return isVillageNavigationSegmentClear(from, to)
    && !nonCrossingRoads.some(road => segmentEntersRect(from, to, road, 0));
}

/** A tap on a building resolves to its nearest free ground edge, never to its roof. */
export function getVillageNavigationTarget(desired: Point, from: Point): Point | null {
  if (![desired.x, desired.y, from.x, from.y].every(Number.isFinite)) return null;
  const clamp = (point: Point): Point => ({
    x: Math.max(VILLAGE_PLAYER_RADIUS, Math.min(point.x, bounds.width - VILLAGE_PLAYER_RADIUS)),
    y: Math.max(VILLAGE_PLAYER_RADIUS, Math.min(point.y, bounds.height - VILLAGE_PLAYER_RADIUS)),
  });
  const target = clamp(desired);
  if (!isVillageNavigationBlocked(target)) return target;
  const padding = VILLAGE_PLAYER_RADIUS + 1;
  const candidates = villageObstacles.flatMap(rect => {
    const left = rect.x - padding; const right = rect.x + rect.width + padding;
    const top = rect.y - padding; const bottom = rect.y + rect.height + padding;
    const x = Math.max(left, Math.min(target.x, right));
    const y = Math.max(top, Math.min(target.y, bottom));
    return [{ x: left, y }, { x: right, y }, { x, y: top }, { x, y: bottom },
      { x: left, y: top }, { x: right, y: top }, { x: left, y: bottom }, { x: right, y: bottom }];
  }).map(clamp).filter(point => !isVillageNavigationBlocked(point));
  candidates.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y)
    || Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
  return candidates[0] ?? null;
}

type QueueEntry = { node: number; score: number };
class MinHeap {
  private items: QueueEntry[] = [];
  get length() { return this.items.length; }
  push(entry: QueueEntry) {
    let index = this.items.push(entry) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].score <= entry.score) break;
      this.items[index] = this.items[parent]; index = parent;
    }
    this.items[index] = entry;
  }
  pop(): QueueEntry {
    const first = this.items[0]; const last = this.items.pop()!;
    if (!this.items.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.items.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.items.length && this.items[child + 1].score < this.items[child].score) child += 1;
      if (this.items[child].score >= last.score) break;
      this.items[index] = this.items[child]; index = child;
    }
    this.items[index] = last;
    return first;
  }
}

/** Returns safe waypoints ending at the corrected destination; no persistent layout cache. */
export function getVillageNavigationPath(from: Point, desired: Point): Point[] | null {
  if (isVillageNavigationBlocked(from)) return null;
  const to = getVillageNavigationTarget(desired, from);
  if (!to) return null;
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.001) return [];
  // An intentional road tap, keyboard input and joystick movement remain free.
  if (isVillageRoadPoint(to)) return buildPath(from, to, isVillageNavigationSegmentClear, isVillageNavigationBlocked);
  const isPedestrianBlocked = (point: Point) => isVillageNavigationBlocked(point)
    || nonCrossingRoads.some(road => containsPoint(road, point));
  if (!isPedestrianBlocked(from)) return buildPath(from, to, isVillagePedestrianSegmentClear, isPedestrianBlocked);

  // A player who manually entered the carriageway can first leave at the nearest
  // clear kerb. Do not strand them or silently grant unrestricted road shortcuts.
  const exits = VILLAGE_ROADS.flatMap(road => {
    const left = road.x - 1; const right = road.x + road.width + 1;
    const top = road.y - 1; const bottom = road.y + road.height + 1;
    const x = Math.max(left, Math.min(from.x, right)); const y = Math.max(top, Math.min(from.y, bottom));
    return [{ x: left, y }, { x: right, y }, { x, y: top }, { x, y: bottom }];
  }).filter(point => !isPedestrianBlocked(point) && !isVillageRoadPoint(point)
    && isVillageNavigationSegmentClear(from, point));
  exits.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
  for (const exit of exits) {
    const tail = buildPath(exit, to, isVillagePedestrianSegmentClear, isPedestrianBlocked);
    if (tail) return [exit, ...tail];
  }
  return null;
}

function buildPath(from: Point, to: Point, canRoute: (from: Point, to: Point) => boolean,
  isBlocked: (point: Point) => boolean): Point[] | null {
  if (isBlocked(from) || isBlocked(to)) return null;
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.001) return [];
  if (canRoute(from, to)) return [to];
  const columns = Math.floor(bounds.width / GRID_STEP) + 1;
  const rows = Math.floor(bounds.height / GRID_STEP) + 1;
  const size = columns * rows;
  const free = new Uint8Array(size);
  const closed = new Uint8Array(size);
  const parents = new Int32Array(size).fill(-1);
  const costs = new Float64Array(size).fill(Infinity);
  const pointFor = (node: number): Point => ({ x: node % columns * GRID_STEP, y: Math.floor(node / columns) * GRID_STEP });
  const nodeIsFree = (node: number) => {
    if (free[node] === 0) free[node] = isBlocked(pointFor(node)) ? 2 : 1;
    return free[node] === 1;
  };
  const anchors = (point: Point) => {
    const matches: number[] = [];
    const centerX = Math.round(point.x / GRID_STEP); const centerY = Math.round(point.y / GRID_STEP);
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      const x = centerX + dx; const y = centerY + dy;
      if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
      const node = y * columns + x;
      if (nodeIsFree(node) && canRoute(point, pointFor(node))) matches.push(node);
    }
    return matches;
  };
  const destinations = new Set(anchors(to));
  if (!destinations.size) return null;
  const queue = new MinHeap();
  for (const node of anchors(from)) {
    const point = pointFor(node);
    costs[node] = Math.hypot(point.x - from.x, point.y - from.y);
    queue.push({ node, score: costs[node] + Math.hypot(point.x - to.x, point.y - to.y) });
  }
  let reached = -1;
  while (queue.length) {
    const { node } = queue.pop();
    if (closed[node]) continue;
    closed[node] = 1;
    if (destinations.has(node)) { reached = node; break; }
    const current = pointFor(node); const cellX = node % columns; const cellY = Math.floor(node / columns);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = cellX + dx; const y = cellY + dy;
      if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
      const neighbor = y * columns + x;
      if (closed[neighbor] || !nodeIsFree(neighbor)) continue;
      const next = pointFor(neighbor);
      const nextCost = costs[node] + Math.hypot(dx, dy) * GRID_STEP;
      if (nextCost >= costs[neighbor] || !canRoute(current, next)) continue;
      costs[neighbor] = nextCost; parents[neighbor] = node;
      queue.push({ node: neighbor, score: nextCost + Math.hypot(next.x - to.x, next.y - to.y) });
    }
  }
  if (reached < 0) return null;
  const raw: Point[] = [to];
  for (let node = reached; node >= 0; node = parents[node]) raw.push(pointFor(node));
  raw.push(from); raw.reverse();
  const result: Point[] = [];
  for (let index = 0; index < raw.length - 1;) {
    let next = raw.length - 1;
    while (next > index + 1 && !canRoute(raw[index], raw[next])) next -= 1;
    result.push(raw[next]); index = next;
  }
  return result.filter((point, index) => index === 0 ? Math.hypot(point.x - from.x, point.y - from.y) >= 0.001
    : point.x !== result[index - 1].x || point.y !== result[index - 1].y);
}
