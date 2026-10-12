import { getWorldCameraFrame, MARKET_DEFAULT_ZOOM } from './worldZoom';
import { getNearestMarketStation, isMarketEnvironmentBlocked, isNearMarketStation, type MarketEnvironment, type MarketCashierAvailability,
  type MarketEnvironmentStationId } from './marketEnvironment';
import { isMarketNavigationSegmentClear } from './marketNavigation';
import { getMarketShelfLayout } from './marketShelfLayout';
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
function visiblePoint(environment: MarketEnvironment, position: Point, point: Point, p: ReplayPresentation): boolean {
  const frame = getWorldCameraFrame(position, p.viewport, p.zoom, environment.world);
  const x = p.viewport.width / 2 + (point.x - frame.center.x) * p.zoom;
  const y = p.viewport.height / 2 + (point.y - frame.center.y) * p.zoom;
  if (x < 12 || x > p.viewport.width - 12 || y < 12 || y > p.viewport.height - 12) return false;
  // The embedded shopping list covers the centre of the upper world. Do not read a sign through it.
  const hudLeft = Math.max(0, (p.viewport.width - 420) / 2);
  if (x >= hudLeft && x <= p.viewport.width - hudLeft && y >= 100 && y <= 246) return false;
  return true;
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

type ScreenRect = { left: number; top: number; right: number; bottom: number };
function intersectRect(a: ScreenRect, b: ScreenRect): ScreenRect | null {
  const clipped = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return clipped.right > clipped.left && clipped.bottom > clipped.top ? clipped : null;
}
function unmaskedBodyPieces(rect: ScreenRect, presentation: ReplayPresentation): ScreenRect[] {
  const clipped = intersectRect(rect, { left: 12, top: 12,
    right: presentation.viewport.width - 12, bottom: presentation.viewport.height - 12 });
  if (!clipped) return [];
  // Keep the v1 list exclusion, extending it conservatively for the embedded
  // HUD's safe-area/font-scaled layout (MarketHud + MarketSimulationScreen).
  // This is a geometry projection, not a pixel-level occlusion measurement.
  const hudLeft = Math.max(0, (presentation.viewport.width - 420) / 2);
  const hudTop = Math.max(112, (presentation.safeArea?.top ?? 0) + 64);
  const fontScale = presentation.fontScale ?? 1;
  const hudBottom = hudTop + Math.max(44, 24 * fontScale)
    + Math.max(62, 56 * fontScale + 13) + 2;
  const mask = { left: hudLeft, right: presentation.viewport.width - hudLeft,
    top: Math.min(100, hudTop), bottom: Math.max(246, hudBottom) };
  const overlap = intersectRect(clipped, mask);
  if (!overlap) return [clipped];
  return [
    { ...clipped, bottom: overlap.top }, { ...clipped, top: overlap.bottom },
    { left: clipped.left, right: overlap.left, top: overlap.top, bottom: overlap.bottom },
    { left: overlap.right, right: clipped.right, top: overlap.top, bottom: overlap.bottom },
  ].filter(piece => piece.right > piece.left && piece.bottom > piece.top);
}

/**
 * Opt-in v2 body cues. v1 labelled stations/anchors are deliberately unchanged.
 * Use the two actual sprite frames rather than the pair's empty aisle or sign
 * centre. A 24px-square visible patch avoids treating an edge sliver as a shelf.
 * The cue never contains a station/category ID, product, coordinate or route.
 */
export function visibleUnlabelledShelfBodies(environment: MarketEnvironment, position: Point, presentation: ReplayPresentation,
  cashiers: Partial<MarketCashierAvailability> = {}): ReplayVisibleStructure[] {
  if (!validateReplayPresentation(presentation)) throw new Error('Invalid replay presentation');
  const labelled = new Set(visibleStations(environment, position, presentation, cashiers).map(station => station.id));
  const camera = getWorldCameraFrame(position, presentation.viewport, presentation.zoom, environment.world);
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
