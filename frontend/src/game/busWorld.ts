export type BusWorldPoint = { x: number; y: number };
export type BusWorldScene = 'village' | 'stop' | 'district' | 'bus';
export type BusWorldDirection = 'outbound' | 'inbound';
export type BusWorldTargetEdge = 'left' | 'right' | 'up' | 'down';
export type BusWorldStation = 'card' | 'stop-outbound' | 'stop-inbound' | 'crossing' | 'board' | 'driver' | 'reader-front' | 'seat' | 'handrail' | 'bell' | 'reader-rear' | 'door-front' | 'door-rear' | 'library';
export type BusWorldRect = BusWorldPoint & { width: number; height: number };
export type BusWorldGeometryOptions = { scene: BusWorldScene; direction?: BusWorldDirection; crossingAllowed?: boolean; busPresent?: boolean; travelling?: boolean };

export const BUS_PLAYER_SCALE = 0.55;
export const BUS_PLAYER_RADIUS = 17;
export const BUS_WORLD_SIZE = { width: 1280, height: 1150 };
export const BUS_INTERIOR_SIZE = { width: 440, height: 1080 };
// Native artwork ratio 756:2080. The entire narrow body fits mobile screens.
export const BUS_INTERIOR_BODY = { x: 45, y: 45, width: 350, height: 963 };
export const BUS_STANDING_POSITION = { x: 242, y: 468 };
export const BUS_SEAT_APPROACH = { x: 214, y: 366 };
export const BUS_ROAD_REPEAT = 960;
/** Viewport scenery is independent of the finite playable cabin/camera. */
export function busRoadBackdropLayout(viewport: { width: number; height: number }) {
  const roadWidth = Math.max(360, Math.min(620, viewport.width * 0.72));
  return {
    roadLeft: (viewport.width - roadWidth) / 2, roadWidth,
    laneLeft: viewport.width / 2 - 177, laneWidth: 354,
    tileTop: -BUS_ROAD_REPEAT,
    tileCount: Math.ceil(viewport.height / BUS_ROAD_REPEAT) + 2,
    tileHeight: (Math.ceil(viewport.height / BUS_ROAD_REPEAT) + 2) * BUS_ROAD_REPEAT,
  };
}
export const BUS_STREET = { top: 640, bottom: 850, crossingLeft: 965, crossingRight: 1105 };
export const BUS_WORLD_INTERACTIONS: Record<BusWorldStation, { label: string; icon: 'card' | 'bus' | 'walk' | 'chatbubble' | 'hand-left' | 'notifications' | 'exit-outline' | 'book' }> = {
  card: { label: '준비물', icon: 'card' }, 'stop-outbound': { label: '노선 보기', icon: 'bus' }, 'stop-inbound': { label: '노선 보기', icon: 'bus' },
  crossing: { label: '주변 살피기', icon: 'walk' }, board: { label: '버스 타기', icon: 'bus' }, driver: { label: '기사님', icon: 'chatbubble' },
  'reader-front': { label: '카드 찍기', icon: 'card' }, seat: { label: '앉기', icon: 'hand-left' }, handrail: { label: '손잡이 잡기', icon: 'hand-left' },
  bell: { label: '하차벨', icon: 'notifications' }, 'reader-rear': { label: '하차 카드', icon: 'card' },
  'door-front': { label: '앞문', icon: 'exit-outline' }, 'door-rear': { label: '내리기', icon: 'exit-outline' }, library: { label: '도서관', icon: 'book' },
};
export const BUS_INTERIOR_STATIONS: Partial<Record<BusWorldStation, BusWorldPoint>> = {
  driver: { x: 261, y: 275 }, 'reader-front': { x: 281, y: 259 }, 'door-front': { x: 332, y: 283 },
  seat: BUS_SEAT_APPROACH, handrail: BUS_STANDING_POSITION, bell: { x: 208, y: 468 },
  'reader-rear': { x: 279, y: 645 }, 'door-rear': { x: 335, y: 664 },
};
// One layout drives the visible furniture, interaction anchors and collisions.
export const BUS_SEATED_POSITION = { x: 143, y: 367 };
export const BUS_SEAT_BACK = { x: 113, y: 342, width: 65, height: 37 };
export type BusPassengerPlaceId = 'seat-front-left' | 'seat-middle-left' | 'seat-rear-left' | 'seat-front-right' | 'handrail-front' | 'handrail-middle' | 'handrail-rear';
export type BusPassengerPlace = {
  id: BusPassengerPlaceId; kind: 'seat' | 'handrail'; label: string;
  position: BusWorldPoint; approach: BusWorldPoint; hitbox: BusWorldRect; seatBack?: BusWorldRect;
};
/** Each selectable place shares the artwork, touch target and clear aisle anchor. */
export const BUS_PASSENGER_PLACES: readonly BusPassengerPlace[] = [
  { id: 'seat-front-left', kind: 'seat', label: '일반 좌석에 앉기', position: BUS_SEATED_POSITION, approach: BUS_SEAT_APPROACH, hitbox: { x: 108, y: 308, width: 81, height: 77 }, seatBack: BUS_SEAT_BACK },
  { id: 'seat-middle-left', kind: 'seat', label: '가운데 왼쪽 좌석에 앉기', position: { x: 143, y: 467 }, approach: { x: 214, y: 466 }, hitbox: { x: 108, y: 408, width: 81, height: 77 }, seatBack: { x: 113, y: 442, width: 65, height: 37 } },
  { id: 'seat-rear-left', kind: 'seat', label: '뒤쪽 왼쪽 좌석에 앉기', position: { x: 143, y: 573 }, approach: { x: 214, y: 572 }, hitbox: { x: 108, y: 514, width: 81, height: 77 }, seatBack: { x: 113, y: 548, width: 65, height: 37 } },
  { id: 'seat-front-right', kind: 'seat', label: '오른쪽 좌석에 앉기', position: { x: 307, y: 415 }, approach: { x: 307, y: 455 }, hitbox: { x: 273, y: 354, width: 67, height: 77 }, seatBack: { x: 276, y: 390, width: 61, height: 37 } },
  { id: 'handrail-front', kind: 'handrail', label: '앞쪽 손잡이 잡기', position: { x: 242, y: 330 }, approach: { x: 242, y: 330 }, hitbox: { x: 237, y: 279, width: 43, height: 57 } },
  { id: 'handrail-middle', kind: 'handrail', label: '손잡이 잡기', position: BUS_STANDING_POSITION, approach: BUS_STANDING_POSITION, hitbox: { x: 237, y: 417, width: 43, height: 57 } },
  { id: 'handrail-rear', kind: 'handrail', label: '뒤쪽 손잡이 잡기', position: { x: 242, y: 740 }, approach: { x: 242, y: 740 }, hitbox: { x: 237, y: 689, width: 43, height: 57 } },
];
export function getBusPassengerPlace(id: string | null | undefined): BusPassengerPlace | undefined {
  return BUS_PASSENGER_PLACES.find(place => place.id === id);
}
export const BUS_INTERIOR_OBSTACLES: readonly BusWorldRect[] = [
  { x: 100, y: 127, width: 140, height: 149 },
  { x: 108, y: 307, width: 79, height: 76 }, { x: 108, y: 407, width: 79, height: 76 },
  { x: 108, y: 513, width: 79, height: 76 }, { x: 108, y: 617, width: 79, height: 76 },
  { x: 273, y: 354, width: 67, height: 77 }, { x: 272, y: 688, width: 70, height: 96 },
  { x: 99, y: 784, width: 128, height: 95 }, { x: 275, y: 787, width: 70, height: 92 },
  { x: 97, y: 888, width: 252, height: 42 },
  { x: 289, y: 193, width: 28, height: 45 }, { x: 303, y: 598, width: 32, height: 38 },
  { x: 260, y: 350, width: 11, height: 88 },
];
export const BUS_OUTDOOR_OBSTACLES: readonly BusWorldRect[] = [
  { x: 106, y: 450, width: 43, height: 25 }, { x: 1146, y: 460, width: 43, height: 25 },
  { x: 105, y: 1032, width: 39, height: 25 }, { x: 1159, y: 1041, width: 39, height: 25 },
  { x: 319, y: 1072, width: 246, height: 25 }, { x: 44, y: 570, width: 246, height: 25 },
  { x: 772, y: 498, width: 119, height: 25 }, { x: 820, y: 378, width: 82, height: 24 },
  { x: 329, y: 578, width: 26, height: 14 }, { x: 604, y: 1085, width: 26, height: 14 },
  { x: 215, y: 445, width: 105, height: 12 }, { x: 865, y: 449, width: 105, height: 12 }, { x: 885, y: 1096, width: 105, height: 12 },
];
export function busWorldSize(scene: BusWorldScene) { return scene === 'bus' ? BUS_INTERIOR_SIZE : BUS_WORLD_SIZE; }
export function busWorldCamera(point: BusWorldPoint, viewport: { width: number; height: number }, scene: BusWorldScene): BusWorldPoint {
  const size = busWorldSize(scene);
  const usableBottom = Math.max(260, viewport.height - 185);
  // Keep the driver/forward seat above the player, below the compact HUD.
  const minimumFoot = (scene === 'bus' ? 248 : 190) + 108;
  const desiredFoot = scene === 'bus' ? Math.max(minimumFoot, Math.min(640, viewport.height - 255))
    : Math.max(minimumFoot, (minimumFoot + viewport.height - 225) / 2);
  // At boarding, keep the roof just below the HUD instead of centering a long
  // empty road above it. Negative offsets still follow passengers down the aisle.
  const maximumOffset = scene === 'bus' ? 185 : 350;
  return {
    x: scene === 'bus' ? (viewport.width - size.width) / 2 : size.width <= viewport.width ? (viewport.width - size.width) / 2 : Math.max(viewport.width - size.width, Math.min(0, viewport.width / 2 - point.x)),
    y: size.height <= usableBottom ? (usableBottom - size.height) / 2 : Math.max(usableBottom - size.height, Math.min(maximumOffset, desiredFoot - point.y)),
  };
}
/** A single hint stays outside the HUD/controls when the goal cannot be seen. */
export function busWorldTargetEdge(target: BusWorldPoint | undefined, camera: BusWorldPoint, viewport: { width: number; height: number }): BusWorldTargetEdge | null {
  if (!target) return null;
  const x = target.x + camera.x; const y = target.y + camera.y;
  const left = 18; const right = viewport.width - 18;
  const top = 234; const bottom = Math.max(top + 1, viewport.height - 245);
  const horizontal = x < left ? x - left : x > right ? x - right : 0;
  const vertical = y < top ? y - top : y > bottom ? y - bottom : 0;
  if (!horizontal && !vertical) return null;
  // At corners, choose the direction that brings the goal into view first.
  if (Math.abs(horizontal) >= Math.abs(vertical)) return horizontal < 0 ? 'left' : 'right';
  return vertical < 0 ? 'up' : 'down';
}
export function busWorldSpawn(scene: BusWorldScene, direction: BusWorldDirection = 'outbound'): BusWorldPoint {
  if (scene === 'bus') return { x: 276, y: 277 };
  if (scene === 'village') return { x: 490, y: 437 };
  return direction === 'outbound' ? { x: 765, y: 931 } : { x: 670, y: 570 };
}
export function busWorldStations(options: BusWorldGeometryOptions): Partial<Record<BusWorldStation, BusWorldPoint>> {
  if (options.scene === 'bus') return BUS_INTERIOR_STATIONS;
  const stations: Partial<Record<BusWorldStation, BusWorldPoint>> = {
    'stop-outbound': { x: 703, y: 1015 }, 'stop-inbound': { x: 450, y: 550 },
    crossing: { x: 1035, y: options.direction === 'inbound' ? 596 : 897 },
  };
  if (options.scene === 'village') stations.card = { x: 450, y: 425 };
  if (options.scene === 'district') stations.library = { x: 620, y: 397 };
  if (options.busPresent) {
    stations.board = options.direction === 'inbound' ? { x: 410, y: 607 } : { x: 800, y: 901 };
    stations.driver = options.direction === 'inbound' ? { x: 490, y: 599 } : { x: 743, y: 901 };
  }
  return stations;
}
export function busWorldObstacles(options: BusWorldGeometryOptions): readonly BusWorldRect[] {
  if (options.scene === 'bus') return BUS_INTERIOR_OBSTACLES;
  const street = [
    { x: 0, y: BUS_STREET.top, width: BUS_STREET.crossingLeft, height: BUS_STREET.bottom - BUS_STREET.top },
    { x: BUS_STREET.crossingRight, y: BUS_STREET.top, width: BUS_WORLD_SIZE.width - BUS_STREET.crossingRight, height: BUS_STREET.bottom - BUS_STREET.top },
  ];
  if (!options.crossingAllowed) street.push({ x: BUS_STREET.crossingLeft, y: BUS_STREET.top, width: BUS_STREET.crossingRight - BUS_STREET.crossingLeft, height: BUS_STREET.bottom - BUS_STREET.top });
  const building = options.scene === 'village' ? { x: 195, y: 230, width: 260, height: 140 }
    : options.scene === 'district' ? { x: 350, y: 125, width: 540, height: 205 }
      : { x: 335, y: 155, width: 380, height: 170 };
  return [...BUS_OUTDOOR_OBSTACLES, building, ...street];
}
export function isBusWorldBlocked(point: BusWorldPoint, options: BusWorldGeometryOptions): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return true;
  const size = busWorldSize(options.scene); const radius = BUS_PLAYER_RADIUS;
  const minY = options.scene === 'bus' ? 248 : 345;
  const minX = options.scene === 'bus' ? 105 : 40;
  const maxX = options.scene === 'bus' ? 352 : size.width - 40;
  const maxY = options.scene === 'bus' ? 902 : size.height - 40;
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return true;
  return busWorldObstacles(options).some(rect => point.x + radius > rect.x && point.x - radius < rect.x + rect.width && point.y + radius > rect.y && point.y - radius < rect.y + rect.height);
}
export function moveBusWorldPlayer(from: BusWorldPoint, dx: number, dy: number, options: BusWorldGeometryOptions): BusWorldPoint {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return from;
  let next = from;
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  for (let i = 0; i < count; i++) {
    const x = { x: next.x + dx / count, y: next.y }; if (!isBusWorldBlocked(x, options)) next = x;
    const y = { x: next.x, y: next.y + dy / count }; if (!isBusWorldBlocked(y, options)) next = y;
  }
  return next;
}
export function busWorldClearSegment(from: BusWorldPoint, to: BusWorldPoint, options: BusWorldGeometryOptions): boolean {
  if (isBusWorldBlocked(from, options) || isBusWorldBlocked(to, options)) return false;
  return !busWorldObstacles(options).some(rect => {
    let entry = 0; let exit = 1;
    for (const [start, delta, low, high] of [
      [from.x, to.x - from.x, rect.x - BUS_PLAYER_RADIUS, rect.x + rect.width + BUS_PLAYER_RADIUS],
      [from.y, to.y - from.y, rect.y - BUS_PLAYER_RADIUS, rect.y + rect.height + BUS_PLAYER_RADIUS],
    ]) {
      if (delta === 0) { if (start <= low || start >= high) return false; continue; }
      const a = (low - start) / delta; const b = (high - start) / delta;
      entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (entry >= exit) return false;
    }
    return entry < exit;
  });
}
/** Touch routes obey the same swept-footprint collisions as direct movement. */
export function findBusWorldPath(from: BusWorldPoint, to: BusWorldPoint, options: BusWorldGeometryOptions): BusWorldPoint[] {
  if (isBusWorldBlocked(to, options)) return [];
  if (busWorldClearSegment(from, to, options)) return [to];
  const step = options.scene === 'bus' ? 12 : 24; const size = busWorldSize(options.scene);
  const grid = (point: BusWorldPoint) => ({ x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step });
  const around = (p: BusWorldPoint) => [{ x: p.x + step, y: p.y }, { x: p.x - step, y: p.y }, { x: p.x, y: p.y + step }, { x: p.x, y: p.y - step }];
  const starts = [grid(from), ...around(grid(from))].filter(point => busWorldClearSegment(from, point, options));
  const key = (p: BusWorldPoint) => `${p.x},${p.y}`;
  const previous = new Map<string, BusWorldPoint | null>(starts.map(point => [key(point), null])); const queue = [...starts]; let found: BusWorldPoint | null = null;
  for (let index = 0; index < queue.length && index < Math.ceil(size.width * size.height / (step * step)); index++) {
    const point = queue[index];
    if (Math.hypot(point.x - to.x, point.y - to.y) < 46 && busWorldClearSegment(point, to, options)) { found = point; break; }
    for (const next of around(point)) {
      if (previous.has(key(next)) || !busWorldClearSegment(point, next, options)) continue;
      previous.set(key(next), point); queue.push(next);
    }
  }
  if (!found) return [];
  const path = [to]; for (let point: BusWorldPoint | null = found; point; point = previous.get(key(point)) ?? null) path.unshift(point);
  const result: BusWorldPoint[] = []; let anchor = from;
  for (let i = 0; i < path.length;) { let last = i; while (last + 1 < path.length && busWorldClearSegment(anchor, path[last + 1], options)) last++; result.push(path[last]); anchor = path[last]; i = last + 1; }
  return result;
}
export function busWorldSide(point: BusWorldPoint): BusWorldDirection | null {
  if (point.y <= BUS_STREET.top - BUS_PLAYER_RADIUS) return 'inbound';
  if (point.y >= BUS_STREET.bottom + BUS_PLAYER_RADIUS) return 'outbound';
  return null;
}
export function busRenderDepth(footY: number) { return Math.round(footY); }
