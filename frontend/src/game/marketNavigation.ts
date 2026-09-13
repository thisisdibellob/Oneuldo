import { getMarketEnvironmentObstacles, MARKET_ENVIRONMENT_PLAYER_RADIUS, isMarketEnvironmentBlocked, type MarketEnvironment, type MarketCashierAvailability } from './marketEnvironment';
import type { Point, Rect } from './prototypeWorld';

type CashierState = boolean | Partial<MarketCashierAvailability>;
const GRID_STEP = 16;
const SEGMENT_SAMPLE_STEP = 6;

/** Exact swept-square check prevents a sampled diagonal from shaving a wall/fixture corner. */
function segmentEntersRect(from: Point, to: Point, rect: Rect): boolean {
  const radius = MARKET_ENVIRONMENT_PLAYER_RADIUS;
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

/** The navigation and movement loops use the same complete ground-footprint collision query. */
export function isMarketNavigationSegmentClear(environment: MarketEnvironment, from: Point, to: Point, cashierCalled: CashierState = false): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (!Number.isFinite(distance)) return false;
  if (getMarketEnvironmentObstacles(environment, cashierCalled).some(rect => segmentEntersRect(from, to, rect))) return false;
  const steps = Math.max(1, Math.ceil(distance / SEGMENT_SAMPLE_STEP));
  for (let index = 0; index <= steps; index += 1) {
    const fraction = index / steps;
    if (isMarketEnvironmentBlocked(environment, { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction }, cashierCalled)) return false;
  }
  return true;
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

/**
 * Bounded local A* for a touch destination. Returns waypoints excluding the origin and including
 * the exact destination; null means blocked/unreachable, and [] means already at the destination.
 * It has no shared cache, so randomized fixtures and newly called cashiers always affect routes.
 */
export function getMarketNavigationPath(environment: MarketEnvironment, from: Point, to: Point, cashierCalled: CashierState = false): Point[] | null {
  if (isMarketEnvironmentBlocked(environment, from, cashierCalled) || isMarketEnvironmentBlocked(environment, to, cashierCalled)) return null;
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.001) return [];
  if (isMarketNavigationSegmentClear(environment, from, to, cashierCalled)) return [{ ...to }];
  const columns = Math.floor(environment.world.width / GRID_STEP) + 1;
  const rows = Math.floor(environment.world.height / GRID_STEP) + 1;
  const size = columns * rows;
  const free = new Uint8Array(size);
  const closed = new Uint8Array(size);
  const parents = new Int32Array(size).fill(-1);
  const costs = new Float64Array(size).fill(Infinity);
  const pointFor = (node: number): Point => ({ x: node % columns * GRID_STEP, y: Math.floor(node / columns) * GRID_STEP });
  const nodeIsFree = (node: number) => {
    if (free[node] === 0) free[node] = isMarketEnvironmentBlocked(environment, pointFor(node), cashierCalled) ? 2 : 1;
    return free[node] === 1;
  };
  const anchors = (point: Point) => {
    const matches: number[] = [];
    const centerX = Math.round(point.x / GRID_STEP); const centerY = Math.round(point.y / GRID_STEP);
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      const x = centerX + dx; const y = centerY + dy;
      if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
      const node = y * columns + x;
      if (nodeIsFree(node) && isMarketNavigationSegmentClear(environment, point, pointFor(node), cashierCalled)) matches.push(node);
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
  let expanded = 0;
  while (queue.length && expanded < size) {
    const { node } = queue.pop();
    if (closed[node]) continue;
    closed[node] = 1; expanded += 1;
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
      if (nextCost >= costs[neighbor] || !isMarketNavigationSegmentClear(environment, current, next, cashierCalled)) continue;
      costs[neighbor] = nextCost; parents[neighbor] = node;
      queue.push({ node: neighbor, score: nextCost + Math.hypot(next.x - to.x, next.y - to.y) });
    }
  }
  if (reached < 0) return null;
  const raw: Point[] = [{ ...to }];
  for (let node = reached; node >= 0; node = parents[node]) raw.push(pointFor(node));
  raw.push({ ...from }); raw.reverse();
  // Remove grid stair-steps only when the full player footprint can traverse the shortcut.
  const result: Point[] = [];
  for (let index = 0; index < raw.length - 1;) {
    let next = raw.length - 1;
    while (next > index + 1 && !isMarketNavigationSegmentClear(environment, raw[index], raw[next], cashierCalled)) next -= 1;
    result.push(raw[next]); index = next;
  }
  return result.filter((point, index) => index === 0 ? Math.hypot(point.x - from.x, point.y - from.y) >= 0.001
    : point.x !== result[index - 1].x || point.y !== result[index - 1].y);
}
