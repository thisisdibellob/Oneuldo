import { MARKET_DEFAULT_ZOOM } from './worldZoom';
import { getMarketWorldCameraFrame } from './marketWorldCamera';
import { getNearestMarketStation, getMarketStationApproachPoint, getMarketEnvironmentObstacles, isMarketEnvironmentBlocked, isNearMarketStation,
  MARKET_ENVIRONMENT_PLAYER_RADIUS, type MarketEnvironment, type MarketCashierAvailability,
  type MarketEnvironmentStationId } from './marketEnvironment';
import { isMarketNavigationSegmentClear } from './marketNavigation';
import { getMarketShelfLayout } from './marketShelfLayout';
import { getMarketHudOcclusionRect, type MarketHudRect } from './marketHudLayout';
import { getMarketShelfUnitRects, MARKET_SHELF_ART_BOTTOM, MARKET_SHELF_ART_HEIGHT, MARKET_SHELF_ART_WIDTH, MARKET_SHELF_SCALE } from './marketFixtureLayout';
import { marketCategories } from './scenarios';
import type { Point } from './prototypeWorld';

export type ReplayPresentation = {
  viewport: { width: number; height: number }; zoom: number;
  fontScale?: number; safeArea?: { top: number; bottom: number };
};
/** Explicit offline fixture, never substituted for an attached app's actual viewport. */
export const DEFAULT_REPLAY_PRESENTATION: ReplayPresentation = {
  viewport: { width: 390, height: 844 }, zoom: MARKET_DEFAULT_ZOOM, fontScale: 1, safeArea: { top: 0, bottom: 0 },
};
export function validateReplayPresentation(p: ReplayPresentation): boolean {
  return !!p && !!p.viewport && Object.keys(p).every(k => ['viewport', 'zoom', 'fontScale', 'safeArea'].includes(k))
    && Object.keys(p.viewport).every(k => ['width', 'height'].includes(k))
    && [p.viewport.width, p.viewport.height].every(n => Number.isFinite(n) && n >= 240 && n <= 8192)
    && Number.isFinite(p.zoom) && p.zoom >= 1 && p.zoom <= 2
    && (p.fontScale === undefined || Number.isFinite(p.fontScale) && p.fontScale >= 1 && p.fontScale <= 4)
    && (p.safeArea === undefined || !!p.safeArea && Object.keys(p.safeArea).every(k => ['top', 'bottom'].includes(k))
      && [p.safeArea.top, p.safeArea.bottom].every(n => Number.isFinite(n) && n >= 0 && n <= 200));
}
export function replayPresentationKey(p: ReplayPresentation | undefined): string {
  return p ? [p.viewport.width, p.viewport.height, p.zoom, p.fontScale ?? 1, p.safeArea?.top ?? 0, p.safeArea?.bottom ?? 0].join(':') : 'unbound';
}
export type ReplayDirection = 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest';
export type ReplayDistanceBand = 'near' | 'medium' | 'far';
type RelativeCue = { direction: ReplayDirection; distanceBand: ReplayDistanceBand };
export type ReplayVisibleStation = RelativeCue & {
  id: MarketEnvironmentStationId; kind: MarketEnvironment['stationDetails'][number]['kind']; label: string; near: boolean;
};
export type ReplayVisibleAnchor = RelativeCue & { id: string; label: string };
/** A visible piece of furniture is not a readable category, inventory or interaction target. */
export type ReplayVisibleStructure = RelativeCue & { kind: 'shelf'; label: '진열대' };
/** The motor stops within 0.6px; planning excludes choices unstable within a 1px square. */
export const REPLAY_ARRIVAL_MARGIN = 1;
function arrivalPositions(position: Point, margin: number): Point[] {
  return margin > 0 ? [-margin, 0, margin].flatMap(dx => [-margin, 0, margin].map(dy => ({ x: position.x + dx, y: position.y + dy }))) : [position];
}
const directions: ReplayDirection[] = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
function relative(from: Point, to: Point): RelativeCue {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const octant = (Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) + 8) % 8;
  return { direction: directions[octant], distanceBand: distance <= 110 ? 'near' : distance <= 240 ? 'medium' : 'far' };
}
/** Conservative screen projection. UI panels are excluded by the caller; this is the world HUD view. */
function screenState(environment: MarketEnvironment, position: Point, point: Point, p: ReplayPresentation): 'visible' | 'offscreen' | 'covered' {
  const frame = getMarketWorldCameraFrame(position, p, environment.world);
  const x = p.viewport.width / 2 + (point.x - frame.center.x) * p.zoom;
  const y = p.viewport.height / 2 + (point.y - frame.center.y) * p.zoom;
  if (x < 12 || x > p.viewport.width - 12 || y < 12 || y > p.viewport.height - 12) return 'offscreen';
  // The embedded shopping list covers the centre of the upper world. Do not read a sign through it.
  const hud = getMarketHudOcclusionRect(p);
  if (x >= hud.left && x <= hud.right && y >= hud.top && y <= hud.bottom) return 'covered';
  return 'visible';
}
function visiblePoint(environment: MarketEnvironment, position: Point, point: Point, p: ReplayPresentation): boolean {
  return screenState(environment, position, point, p) === 'visible';
}
function marker(environment: MarketEnvironment, station: MarketEnvironment['stationDetails'][number]): Point {
  if (station.kind === 'shelf') {
    const shelf = environment.shelves[station.categoryId!];
    return { x: shelf.x + shelf.width / 2, y: shelf.y + shelf.height + 10 };
  }
  return station.point;
}
export function visibleStations(environment: MarketEnvironment, position: Point, presentation: ReplayPresentation,
  cashiers: Partial<MarketCashierAvailability> = {}, arrivalMargin = REPLAY_ARRIVAL_MARGIN): ReplayVisibleStation[] {
  if (!validateReplayPresentation(presentation)) throw new Error('Invalid replay presentation');
  // The nearest interactable station also has an actual labelled button in the bottom HUD.
  const positions = arrivalPositions(position, arrivalMargin);
  const nearby = positions.map(point => getNearestMarketStation(environment, point, cashiers)?.id);
  return environment.stationDetails.filter(station => positions.every((point, index) => station.id === nearby[index] || visiblePoint(environment, point, marker(environment, station), presentation)))
    .map(station => {
      const category = marketCategories.find(c => c.id === station.categoryId);
      const checkout = environment.checkouts.find(c => c.id === station.id);
      const person = environment.employees.find(p => `staff:${p.id}` === station.id);
      const signVisible = positions.every(point => visiblePoint(environment, point, marker(environment, station), presentation));
      const label = category?.label ?? (checkout ? `${checkout.id === 'checkout' ? 1 : 2}번 계산대${signVisible ? ` · ${(cashiers[checkout.id] ?? checkout.cashierPresent) ? '계산 가능' : '직원 호출'}` : ''}`
        : person?.label ?? (station.kind === 'entrance' ? station.available === false ? '입구 · 공사 중' : '입구' : station.kind === 'exit' ? '출구' : '공동 출입문'));
      return { id: station.id, kind: station.kind, label, ...relative(position, marker(environment, station)),
        near: positions.every(point => isNearMarketStation(environment, station.id, point, undefined, cashiers)) };
    });
}

/** An opt-in visible target approach: one unobstructed on-screen segment, never a hidden-map route. */
export const REPLAY_VISIBLE_APPROACH_MAX_DISTANCE = 600;
export function canApproachVisibleStation(environment: MarketEnvironment, position: Point, stationId: MarketEnvironmentStationId,
  presentation: ReplayPresentation, cashiers: Partial<MarketCashierAvailability> = {}, arrivalMargin = REPLAY_ARRIVAL_MARGIN): boolean {
  if (!visibleStations(environment, position, presentation, cashiers, arrivalMargin).some(s => s.id === stationId)) return false;
  return arrivalPositions(position, arrivalMargin).every(from => {
    const target = getMarketStationApproachPoint(environment, stationId, from, cashiers);
    return !!target && Math.hypot(target.x - from.x, target.y - from.y) <= REPLAY_VISIBLE_APPROACH_MAX_DISTANCE
      && isMarketNavigationSegmentClear(environment, from, target, cashiers);
  });
}

type ScreenRect = MarketHudRect;
function intersectRect(a: ScreenRect, b: ScreenRect): ScreenRect | null {
  const clipped = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return clipped.right > clipped.left && clipped.bottom > clipped.top ? clipped : null;
}
function unmaskedBodyPieces(rect: ScreenRect, presentation: ReplayPresentation): ScreenRect[] {
  const clipped = intersectRect(rect, { left: 12, top: 12,
    right: presentation.viewport.width - 12, bottom: presentation.viewport.height - 12 });
  if (!clipped) return [];
  const mask = getMarketHudOcclusionRect(presentation);
  const overlap = intersectRect(clipped, mask);
  if (!overlap) return [clipped];
  return [
    { ...clipped, bottom: overlap.top }, { ...clipped, top: overlap.bottom },
    { left: clipped.left, right: overlap.left, top: overlap.top, bottom: overlap.bottom },
    { left: overlap.right, right: clipped.right, top: overlap.top, bottom: overlap.bottom },
  ].filter(piece => piece.right > piece.left && piece.bottom > piece.top);
}

/**
 * Opt-in v2 body cues, using the same HUD mask as labelled stations/anchors.
 * Use the two actual sprite frames rather than the pair's empty aisle or sign
 * centre. A 24px-square visible patch avoids treating an edge sliver as a shelf.
 * The cue never contains a station/category ID, product, coordinate or route.
 */
export function visibleUnlabelledShelfBodies(environment: MarketEnvironment, position: Point, presentation: ReplayPresentation,
  cashiers: Partial<MarketCashierAvailability> = {}): ReplayVisibleStructure[] {
  if (!validateReplayPresentation(presentation)) throw new Error('Invalid replay presentation');
  const labelled = new Set(visibleStations(environment, position, presentation, cashiers).map(station => station.id));
  const camera = getMarketWorldCameraFrame(position, presentation, environment.world);
  const cues = new Map<string, ReplayVisibleStructure>();
  for (const station of environment.stationDetails) {
    if (station.kind !== 'shelf' || labelled.has(station.id) || !station.categoryId) continue;
    for (const unit of getMarketShelfUnitRects(environment.shelves[station.categoryId])) {
      // MarketRetailShelf centres its sprite horizontally on each unit and
      // anchors the artwork below the footprint by MARKET_SHELF_ART_BOTTOM.
      // The produce canvas is smaller inside that shared frame, matching the
      // renderer; transparent outer padding is not visible furniture.
      const artWidth = station.categoryId === 'produce' ? 258 * MARKET_SHELF_SCALE : MARKET_SHELF_ART_WIDTH;
      const artHeight = station.categoryId === 'produce' ? 172 * MARKET_SHELF_SCALE : MARKET_SHELF_ART_HEIGHT;
      const left = unit.x + (unit.width - artWidth) / 2;
      const bottom = unit.y + unit.height - MARKET_SHELF_ART_BOTTOM;
      const rect = {
        left: presentation.viewport.width / 2 + (left - camera.center.x) * presentation.zoom,
        right: presentation.viewport.width / 2 + (left + artWidth - camera.center.x) * presentation.zoom,
        top: presentation.viewport.height / 2 + (bottom - artHeight - camera.center.y) * presentation.zoom,
        bottom: presentation.viewport.height / 2 + (bottom - camera.center.y) * presentation.zoom,
      };
      const piece = unmaskedBodyPieces(rect, presentation)
        .filter(piece => piece.right - piece.left >= 24 && piece.bottom - piece.top >= 24)
        .sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top))[0];
      if (!piece) continue;
      const visiblePoint = { x: camera.center.x + ((piece.left + piece.right) / 2 - presentation.viewport.width / 2) / presentation.zoom,
        y: camera.center.y + ((piece.top + piece.bottom) / 2 - presentation.viewport.height / 2) / presentation.zoom };
      const cue: ReplayVisibleStructure = { kind: 'shelf', label: '진열대', ...relative(position, visiblePoint) };
      cues.set(`${cue.direction}:${cue.distanceBand}`, cue);
    }
  }
  // No stable identity, category order, or count of hidden fixtures survives.
  return [...cues.values()].sort((a, b) => directions.indexOf(a.direction) - directions.indexOf(b.direction)
    || ['near', 'medium', 'far'].indexOf(a.distanceBand) - ['near', 'medium', 'far'].indexOf(b.distanceBand));
}

/**
 * wayfinding-v1: what the world view actually shows along each of the eight
 * screen directions. A wall/edge or furniture is drawn on screen; "covered"
 * means the shopping-list note hides that part of the floor, which is not a
 * wall; "open" means the floor continues to the screen edge. Contains no
 * category, product, coordinate, route or hidden-map identity.
 */
export type ReplayVisibleBoundary = { direction: ReplayDirection; kind: 'wall' | 'fixture' | 'covered' | 'open';
  label: string; distanceBand: ReplayDistanceBand };
const BOUNDARY_LABELS: Record<ReplayVisibleBoundary['kind'], string> = {
  wall: '벽이나 매장 끝', fixture: '진열대·계산대 같은 집기', covered: '화면의 장보기 목록에 가려 보이지 않음', open: '바닥 통로가 화면 끝까지 이어짐',
};
export function visibleBoundaries(environment: MarketEnvironment, position: Point, presentation: ReplayPresentation,
  cashiers: Partial<MarketCashierAvailability> = {}): ReplayVisibleBoundary[] {
  if (!validateReplayPresentation(presentation)) throw new Error('Invalid replay presentation');
  const obstacles = getMarketEnvironmentObstacles(environment, cashiers);
  const unit: Record<ReplayDirection, Point> = { east: { x: 1, y: 0 }, southeast: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    south: { x: 0, y: 1 }, southwest: { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, west: { x: -1, y: 0 },
    northwest: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }, north: { x: 0, y: -1 }, northeast: { x: Math.SQRT1_2, y: -Math.SQRT1_2 } };
  const band = (distance: number): ReplayDistanceBand => distance <= 110 ? 'near' : distance <= 240 ? 'medium' : 'far';
  return directions.map(direction => {
    let last = 0;
    for (let distance = 16; distance <= 1200; distance += 8) {
      const point = { x: position.x + unit[direction].x * distance, y: position.y + unit[direction].y * distance };
      const screen = screenState(environment, position, point, presentation);
      const kind: ReplayVisibleBoundary['kind'] | null = screen === 'offscreen' ? 'open' : screen === 'covered' ? 'covered'
        : !isMarketEnvironmentBlocked(environment, point, cashiers) ? null
          : obstacles.some(rect => point.x + MARKET_ENVIRONMENT_PLAYER_RADIUS > rect.x && point.x - MARKET_ENVIRONMENT_PLAYER_RADIUS < rect.x + rect.width
            && point.y + MARKET_ENVIRONMENT_PLAYER_RADIUS > rect.y && point.y - MARKET_ENVIRONMENT_PLAYER_RADIUS < rect.y + rect.height) ? 'fixture' : 'wall';
      if (kind) return { direction, kind, label: BOUNDARY_LABELS[kind], distanceBand: band(kind === 'open' ? last : distance) };
      last = distance;
    }
    return { direction, kind: 'open' as const, label: BOUNDARY_LABELS.open, distanceBand: 'far' as const };
  });
}

/**
 * wayfinding-v3: the same eight rays, but the hit is named by what the world
 * view actually draws there. v1/v2 grouped every collider (walls, benches,
 * planters, the shop front) as "furniture like shelves or counters", which sent
 * actors after lobby benches. Archived v1/v2 traces keep visibleBoundaries.
 */
export type ReplayVisibleBoundaryV3 = { direction: ReplayDirection;
  kind: 'wall' | 'shelf' | 'checkout' | 'furniture' | 'person' | 'construction' | 'fixture' | 'covered' | 'open';
  label: string; distanceBand: ReplayDistanceBand };
const FURNITURE_LABELS: Record<MarketEnvironment['objects'][number]['kind'], string> = {
  pillar: '기둥', chair: '의자', kiosk: '무인 계산기', restSet: '의자와 탁자', atm: 'ATM 기기', elevator: '엘리베이터', planter: '화분',
};
const BOUNDARY_V3_LABELS: Record<Exclude<ReplayVisibleBoundaryV3['kind'], 'furniture'>, string> = {
  wall: '벽', shelf: '진열대', checkout: '계산대', person: '사람', construction: '공사 구역 가림막', fixture: '집기',
  covered: '화면의 장보기 목록에 가려 보이지 않음', open: '바닥 통로가 화면 끝까지 이어짐',
};
function touches(point: Point, rect: { x: number; y: number; width: number; height: number }): boolean {
  const r = MARKET_ENVIRONMENT_PLAYER_RADIUS;
  return point.x + r > rect.x && point.x - r < rect.x + rect.width && point.y + r > rect.y && point.y - r < rect.y + rect.height;
}
export function visibleBoundariesV3(environment: MarketEnvironment, position: Point, presentation: ReplayPresentation,
  cashiers: Partial<MarketCashierAvailability> = {}): ReplayVisibleBoundaryV3[] {
  if (!validateReplayPresentation(presentation)) throw new Error('Invalid replay presentation');
  const obstacles = getMarketEnvironmentObstacles(environment, cashiers);
  const shelves = Object.values(environment.shelves).flatMap(shelf => getMarketShelfUnitRects(shelf));
  const people = [...environment.employees, ...environment.customers].map(person => person.collider);
  const classify = (point: Point): Omit<ReplayVisibleBoundaryV3, 'direction' | 'distanceBand'> => {
    if (shelves.some(rect => touches(point, rect))) return { kind: 'shelf', label: BOUNDARY_V3_LABELS.shelf };
    if (environment.checkouts.some(checkout => touches(point, checkout.rect)) || environment.kiosks.some(kiosk => touches(point, kiosk.rect)))
      return { kind: 'checkout', label: BOUNDARY_V3_LABELS.checkout };
    const object = environment.objects.find(item => touches(point, item.rect));
    if (object) return { kind: 'furniture', label: FURNITURE_LABELS[object.kind] ?? '비품' };
    if ((environment.constructionZones ?? []).some(zone => touches(point, zone.rect))) return { kind: 'construction', label: BOUNDARY_V3_LABELS.construction };
    if (people.some(rect => touches(point, rect)) || environment.checkouts.some(checkout => touches(point, checkout.cashierCollider)))
      return { kind: 'person', label: BOUNDARY_V3_LABELS.person };
    if (environment.walls.some(rect => touches(point, rect)) || !obstacles.some(rect => touches(point, rect))) return { kind: 'wall', label: BOUNDARY_V3_LABELS.wall };
    return { kind: 'fixture', label: BOUNDARY_V3_LABELS.fixture };
  };
  const unit: Record<ReplayDirection, Point> = { east: { x: 1, y: 0 }, southeast: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    south: { x: 0, y: 1 }, southwest: { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, west: { x: -1, y: 0 },
    northwest: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }, north: { x: 0, y: -1 }, northeast: { x: Math.SQRT1_2, y: -Math.SQRT1_2 } };
  const band = (distance: number): ReplayDistanceBand => distance <= 110 ? 'near' : distance <= 240 ? 'medium' : 'far';
  return directions.map(direction => {
    let last = 0;
    for (let distance = 16; distance <= 1200; distance += 8) {
      const point = { x: position.x + unit[direction].x * distance, y: position.y + unit[direction].y * distance };
      const screen = screenState(environment, position, point, presentation);
      if (screen === 'offscreen') return { direction, kind: 'open' as const, label: BOUNDARY_V3_LABELS.open, distanceBand: band(last) };
      if (screen === 'covered') return { direction, kind: 'covered' as const, label: BOUNDARY_V3_LABELS.covered, distanceBand: band(distance) };
      if (isMarketEnvironmentBlocked(environment, point, cashiers)) return { direction, ...classify(point), distanceBand: band(distance) };
      last = distance;
    }
    return { direction, kind: 'open' as const, label: BOUNDARY_V3_LABELS.open, distanceBand: 'far' as const };
  });
}

/**
 * wayfinding-v3: which kind of place the player is standing in, as the world
 * view shows it (shelves around vs. a lobby with benches and the shop front).
 * A coarse kind and Korean label only; no area ID, rectangle or neighbour list.
 */
export type ReplayCurrentArea = { kind: 'sales-floor' | 'lobby' | 'corridor' | 'elevator' | 'building-door' | 'other'; label: string };
const AREA_BY_ID: Record<string, ReplayCurrentArea> = {
  'main-sales-floor': { kind: 'sales-floor', label: '매장 안 판매 구역' },
  'entrance-lobby': { kind: 'lobby', label: '매장 밖 로비 (매장 앞)' },
  'west-corridor': { kind: 'corridor', label: '매장 옆 복도' }, 'east-corridor': { kind: 'corridor', label: '매장 옆 복도' },
  'elevator-room': { kind: 'elevator', label: '엘리베이터 앞' },
  'common-door-threshold': { kind: 'building-door', label: '건물 공동 출입문 앞' },
};
export function replayCurrentArea(environment: MarketEnvironment, position: Point): ReplayCurrentArea {
  // Areas overlap by a wall thickness; the area the player is deepest inside wins.
  const inset = (area: MarketEnvironment['walkableAreas'][number]) => Math.min(position.x - area.x, area.x + area.width - position.x,
    position.y - area.y, area.y + area.height - position.y);
  const area = environment.walkableAreas.filter(candidate => inset(candidate) >= 0).sort((a, b) => inset(b) - inset(a))[0];
  return area ? structuredClone(AREA_BY_ID[area.id] ?? { kind: 'other', label: '통로' }) : { kind: 'other', label: '통로' };
}

/**
 * wayfinding-v3: a displayed walk choice whose straight segment passes through a
 * visible door gate (entrance/exit/side door). This is what the screen shows
 * when the passage goes through the gate; it never names where the gate leads
 * beyond "inside"/"outside" the shop and never recommends taking it.
 */
export type ReplayGatePassage = { anchorId: string; gate: 'entrance' | 'exit' | 'side-door'; direction: 'inward' | 'outward'; label: string };
export function visibleGatePassages(environment: MarketEnvironment, position: Point, presentation: ReplayPresentation,
  anchors: readonly ReplayVisibleAnchor[], cashiers: Partial<MarketCashierAvailability> = {}): ReplayGatePassage[] {
  if (!validateReplayPresentation(presentation)) throw new Error('Invalid replay presentation');
  const points = new Map(localAnchors(environment, position, presentation, cashiers).map(anchor => [anchor.id, anchor.point]));
  return anchors.flatMap(anchor => {
    const target = points.get(anchor.id);
    if (!target) return [];
    for (const gate of environment.alarmGates) {
      const along = gate.axis === 'y' ? 'y' : 'x', across = gate.axis === 'y' ? 'x' : 'y';
      const from = position[along] - gate.boundary, to = target[along] - gate.boundary;
      if (from === 0 || to === 0 || Math.sign(from) === Math.sign(to)) continue;
      const t = from / (from - to);
      const crossing = { x: position.x + (target.x - position.x) * t, y: position.y + (target.y - position.y) * t };
      const start = across === 'x' ? gate.gate.x : gate.gate.y, size = across === 'x' ? gate.gate.width : gate.gate.height;
      if (crossing[across] < start || crossing[across] > start + size) continue;
      if (screenState(environment, position, crossing, presentation) === 'offscreen') continue;
      const kind = gate.id === 'entrance' ? 'entrance' as const : gate.id === 'exit' ? 'exit' as const : 'side-door' as const;
      const direction = Math.sign(to) === gate.outward ? 'outward' as const : 'inward' as const;
      const name = kind === 'entrance' ? '입구' : kind === 'exit' ? '출구' : '옆문';
      return [{ anchorId: anchor.id, gate: kind, direction, label: `${name}를 지나 매장 ${direction === 'inward' ? '안으로' : '밖으로'}` }];
    }
    return [];
  });
}

export const REPLAY_ANCHOR_SPACING = 80;
export const REPLAY_ANCHOR_MAX_DISTANCE = 180;
export type WholeReplayWaypoint = { waypointId: string; anchorId: string; point: Point };
export type WholeReplayNearbyStation = Pick<ReplayVisibleStation, 'id' | 'kind' | 'label'>;
export type WholeReplayWaypointGraph = {
  schemaVersion: '1'; view: 'world'; presentationKey: string;
  world: MarketEnvironment['world']; cashierAvailability: Partial<MarketCashierAvailability>;
  startAllowedWaypointIds: string[]; startNearbyStations: WholeReplayNearbyStation[];
  /** IDs are sorted for serialization, never ranked by desirability or route cost. */
  nodes: { waypointId: string; allowedWaypointIds: string[]; nearbyStations: WholeReplayNearbyStation[] }[];
};
/**
 * The 80px grid can land inside the furniture on both sides of a narrow gap the
 * app lets the player walk through (between two horizontal shelf pairs, or a
 * shelf and a wall in the aisles layout). Without an anchor in it the replay
 * graph has no passage there at all. Add the gap's centre line, sampled on the
 * grid along the gap. Every point still passes the usual blocked, visibility,
 * arrival and segment guards; nothing is ranked or chosen for the actor.
 */
function replayPassagePoints(environment: MarketEnvironment): Point[] {
  // The classic grid already reaches every station by the same shortest walk with
  // or without these points, and its bundles, menus and input hashes are pinned
  // byte-for-byte by regression fixtures. Keep it unchanged.
  if ((environment.config.layoutId ?? 'classic') === 'classic') return [];
  const grid = REPLAY_ANCHOR_SPACING, clearance = MARKET_ENVIRONMENT_PLAYER_RADIUS + REPLAY_ARRIVAL_MARGIN;
  const shelves = Object.values(environment.shelves) as { x: number; y: number; width: number; height: number }[];
  const rects = [...shelves, ...environment.walls];
  const points: Point[] = [];
  for (const shelf of shelves) {
    for (const axis of ['x', 'y'] as const) {
      const size = axis === 'x' ? 'width' : 'height', cross = axis === 'x' ? 'y' : 'x', crossSize = axis === 'x' ? 'height' : 'width';
      for (const side of [-1, 1]) {
        const edge = side < 0 ? shelf[axis] : shelf[axis] + shelf[size];
        const facing = rects.filter(r => r !== shelf && r[cross] < shelf[cross] + shelf[crossSize] && r[cross] + r[crossSize] > shelf[cross])
          .map(r => side < 0 ? r[axis] + r[size] : r[axis]).filter(e => side < 0 ? e <= edge : e >= edge);
        if (!facing.length) continue;
        const other = side < 0 ? Math.max(...facing) : Math.min(...facing);
        const [low, high] = side < 0 ? [other, edge] : [edge, other];
        // Too narrow for the player, or a grid line already runs through the free part.
        if (high - low < 2 * clearance || Math.ceil((low + clearance) / grid) * grid <= high - clearance) continue;
        const middle = Math.round((low + high) / 2);
        for (let along = Math.max(grid, Math.ceil((shelf[cross] - grid) / grid) * grid);
          along <= shelf[cross] + shelf[crossSize] + grid; along += grid) {
          points.push(axis === 'x' ? { x: middle, y: along } : { x: along, y: middle });
        }
      }
    }
  }
  // A shelf's own standing point can fall between grid rows (corner layout), so no
  // grid anchor is ever near enough to open it. Offer that point too.
  for (const station of environment.stationDetails) {
    if (station.kind === 'shelf') points.push({ x: Math.round(station.point.x), y: Math.round(station.point.y) });
  }
  return points;
}
function anchorId(environment: MarketEnvironment, point: Point): string {
  let hash = 2166136261;
  for (const char of `${environment.seed}:${environment.config.layoutId ?? 'classic'}:${point.x}:${point.y}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `anchor-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
/** Full-world planning catalog only. Incremental actor observations never expose it. */
export function wholeReplayWaypointCatalog(environment: MarketEnvironment, cashiers: Partial<MarketCashierAvailability> = {}): WholeReplayWaypoint[] {
  const points: Point[] = [];
  for (let x = REPLAY_ANCHOR_SPACING; x < environment.world.width; x += REPLAY_ANCHOR_SPACING)
    for (let y = REPLAY_ANCHOR_SPACING; y < environment.world.height; y += REPLAY_ANCHOR_SPACING)
      points.push({ x, y });
  // Include every existing off-grid employee passage that localAnchors can
  // expose. The catalog never removes an already legal visible choice.
  for (const station of environment.stationDetails.filter(s => s.kind === 'employee')) {
    for (const dx of [-32, -16, 0, 16, 32]) for (const dy of [-32, -16, 0, 16, 32]) {
      points.push({ x: station.point.x + dx, y: station.point.y + dy });
    }
  }
  points.push(...replayPassagePoints(environment));
  const seen = new Set<string>();
  return points.filter(point => {
    const id = anchorId(environment, point);
    if (seen.has(id) || isMarketEnvironmentBlocked(environment, point, cashiers)) return false;
    seen.add(id); return true;
  }).sort((a, b) => a.x - b.x || a.y - b.y)
    .map((point, i) => ({ waypointId: `W${String(i + 1).padStart(3, '0')}`, anchorId: anchorId(environment, point), point }));
}
function localAnchors(environment: MarketEnvironment, position: Point, p: ReplayPresentation, cashiers: Partial<MarketCashierAvailability>) {
  const result: { id: string; point: Point }[] = [];
  const add = (point: Point) => {
    const distance = Math.hypot(point.x - position.x, point.y - position.y);
    if (distance < 45 || distance > REPLAY_ANCHOR_MAX_DISTANCE || !visiblePoint(environment, position, point, p)
      || arrivalPositions(point, REPLAY_ARRIVAL_MARGIN).some(arrival => isMarketEnvironmentBlocked(environment, arrival, cashiers))
      || !isMarketNavigationSegmentClear(environment, position, point, cashiers)) return;
    const id = anchorId(environment, point);
    if (!result.some(a => a.id === id)) result.push({ id, point });
  };
  const grid = REPLAY_ANCHOR_SPACING;
  for (let x = Math.max(grid, Math.ceil((position.x - REPLAY_ANCHOR_MAX_DISTANCE) / grid) * grid); x < environment.world.width; x += grid) {
    if (x > position.x + REPLAY_ANCHOR_MAX_DISTANCE) break;
    for (let y = Math.max(grid, Math.ceil((position.y - REPLAY_ANCHOR_MAX_DISTANCE) / grid) * grid); y < environment.world.height; y += grid) {
      if (y > position.y + REPLAY_ANCHOR_MAX_DISTANCE) break;
      add({ x, y });
    }
  }
  // An 80px grid can miss the narrow space beside a visible employee completely.
  // Offer their visible free standing area as another opaque local choice. It is a
  // straight visible segment under the same guards, never a route to an unseen person.
  for (const station of environment.stationDetails) {
    if (station.kind === 'employee' && visiblePoint(environment, position, marker(environment, station), p)) {
      add(station.point);
      // The updated fixtures can block the single diagonal to a standing point.
      // Offer other locally visible free passages, without ranking or choosing an
      // action for the actor. Existing collision/visibility/arrival checks still apply.
      for (const dx of [-32, -16, 0, 16, 32]) for (const dy of [-32, -16, 0, 16, 32]) {
        add({ x: station.point.x + dx, y: station.point.y + dy });
      }
    }
  }
  // Narrow walkable gaps the grid misses; add() applies the same distance and guards.
  for (const point of replayPassagePoints(environment)) add(point);
  return result;
}
/** Only a one-hop neighbourhood is public. IDs contain no coordinates or category names. */
export function visibleAnchors(environment: MarketEnvironment, position: Point, presentation: ReplayPresentation,
  cashiers: Partial<MarketCashierAvailability> = {}): ReplayVisibleAnchor[] {
  if (!validateReplayPresentation(presentation)) throw new Error('Invalid replay presentation');
  const positions = arrivalPositions(position, REPLAY_ARRIVAL_MARGIN);
  return localAnchors(environment, position, presentation, cashiers).filter(anchor => positions.every(point => {
    const distance = Math.hypot(anchor.point.x - point.x, anchor.point.y - point.y);
    return distance >= 45 && distance <= REPLAY_ANCHOR_MAX_DISTANCE && visiblePoint(environment, point, anchor.point, presentation)
      && isMarketNavigationSegmentClear(environment, point, anchor.point, cashiers);
  })).map(anchor => ({ id: anchor.id,
    label: '눈앞의 통로', ...relative(position, anchor.point) }));
}
/**
 * Full-world planning adjacency under the same one-hop actor visibility guards.
 * Edges are directed: a passage can be under the HUD in only one direction.
 * Reuse the initial catalog when cashier occupancy changes to preserve its IDs.
 * This describes allowed choices; it neither selects nor repairs a movement.
 */
export function wholeReplayWaypointGraph(environment: MarketEnvironment, position: Point, presentation: ReplayPresentation,
  cashiers: Partial<MarketCashierAvailability> = {},
  waypoints: readonly WholeReplayWaypoint[] = wholeReplayWaypointCatalog(environment, cashiers)): WholeReplayWaypointGraph {
  if (!validateReplayPresentation(presentation)) throw new Error('Invalid replay presentation');
  const byAnchorId = new Map(waypoints.map(waypoint => [waypoint.anchorId, waypoint.waypointId]));
  const choices = (from: Point) => {
    if (isMarketEnvironmentBlocked(environment, from, cashiers)) return { allowedWaypointIds: [], nearbyStations: [] };
    return {
      allowedWaypointIds: visibleAnchors(environment, from, presentation, cashiers).flatMap(anchor => {
        const id = byAnchorId.get(anchor.id);
        return id === undefined ? [] : [id];
      }).sort(),
      nearbyStations: visibleStations(environment, from, presentation, cashiers).filter(station => station.near)
        .map(({ id, kind, label }) => ({ id, kind, label })).sort((a, b) => a.id.localeCompare(b.id)),
    };
  };
  const start = choices(position);
  return {
    schemaVersion: '1', view: 'world', presentationKey: replayPresentationKey(presentation), world: { ...environment.world },
    cashierAvailability: Object.fromEntries(environment.checkouts.map(checkout =>
      [checkout.id, cashiers[checkout.id] ?? checkout.cashierPresent])),
    startAllowedWaypointIds: start.allowedWaypointIds, startNearbyStations: start.nearbyStations,
    nodes: [...waypoints].sort((a, b) => a.waypointId.localeCompare(b.waypointId))
      .map(waypoint => ({ waypointId: waypoint.waypointId, ...choices(waypoint.point) })),
  };
}
/** Trusted motor/guard only. Never include the returned point in policy input or a trace. */
export function resolveReplayAnchor(environment: MarketEnvironment, position: Point, id: string, presentation: ReplayPresentation,
  cashiers: Partial<MarketCashierAvailability> = {}): Point | null {
  if (!validateReplayPresentation(presentation)) return null;
  return localAnchors(environment, position, presentation, cashiers).find(anchor => anchor.id === id)?.point ?? null;
}

export function replayShelfLayout(p: ReplayPresentation, count: number) {
  // Existing shelf: 44px header + 8px margin + top inset; 62px basket + 8px margin + bottom inset.
  const safe = p.safeArea ?? { top: 0, bottom: 0 };
  const gridHeight = p.viewport.height - 122 - Math.max(10, safe.top) - Math.max(10, safe.bottom);
  return getMarketShelfLayout(p.viewport.width, p.viewport.height, count, safe.top + safe.bottom, p.fontScale ?? 1, Math.max(1, gridHeight));
}
/** Full row visibility is conservative: half-hidden labels never become actor knowledge. */
export function visibleShelfProductIds(ids: readonly string[], p: ReplayPresentation, scrollFraction: number): string[] {
  const layout = replayShelfLayout(p, ids.length);
  const offset = Math.max(0, layout.contentHeight - layout.availableHeight) * Math.max(0, Math.min(1, scrollFraction));
  return ids.filter((_, index) => {
    const top = 4 + Math.floor(index / layout.columns) * (layout.rowHeight + 4);
    return top >= offset - 1 && top + layout.rowHeight <= offset + layout.availableHeight + 1;
  });
}
export function replayShelfPageFractions(ids: readonly string[], p: ReplayPresentation): number[] {
  const l = replayShelfLayout(p, ids.length), maximum = l.contentHeight - l.availableHeight;
  if (maximum <= 0) return [0];
  const pages = [0];
  for (let row = 1; row < l.rowCount; row++) pages.push(Math.min(1, (row * (l.rowHeight + 4)) / maximum));
  return [...new Set(pages)];
}
export function getReplayShelfPage(ids: readonly string[], p: ReplayPresentation, scrollFraction: number) {
  const pages = replayShelfPageFractions(ids, p), fraction = Math.max(0, Math.min(1, scrollFraction));
  const page = pages.reduce((best, candidate, index) => Math.abs(candidate - fraction) < Math.abs(pages[best] - fraction) ? index : best, 0);
  return { visibleProductIds: visibleShelfProductIds(ids, p, fraction), page, pageCount: pages.length, scrollFraction: fraction };
}
