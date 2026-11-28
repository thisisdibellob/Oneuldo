import type { MarketEpisodeEvent } from './marketSession';
import { getMarketProduct, marketCategories } from './scenarios';
export type MarketRouteActionKind = 'shelf-opened' | 'shelf-closed' | 'item-added' | 'item-removed' | 'staff-talked';
export type MarketRouteAction = MarketRoutePoint & {
  id: string;
  sequence: number;
  kind: MarketRouteActionKind;
  label: string;
  stationId?: string;
  productId?: string;
  quantity?: number;
  method?: 'employee' | 'shelf';
  positionSource: 'recorded' | 'last-known';
};
export type MarketRoutePoint = {
  x: number;
  y: number;
  elapsedSeconds: number;
  segment: number;
};
export type MarketTrajectory = {
  schema: 'oneuldo.market.trajectory.v1';
  intervalSeconds: number;
  durationSeconds: number;
  distance: number;
  points: MarketRoutePoint[];
  markers: MarketRoutePoint[];
  /** Optional for previously saved v1 trajectories. */
  actions?: MarketRouteAction[];
  actionSchemaVersion?: 2;
};

export function marketRoutePointAt(trajectory: MarketTrajectory, seconds: number): MarketRoutePoint | undefined {
  const points = trajectory.points;
  if (!points.length) return undefined;
  let index = 0;
  while (index + 1 < points.length && points[index + 1].elapsedSeconds <= seconds) index++;
  const a = points[index], b = points[index + 1];
  const ratio = b && b.segment === a.segment && b.elapsedSeconds > a.elapsedSeconds
    ? Math.max(0, Math.min(1, (seconds - a.elapsedSeconds) / (b.elapsedSeconds - a.elapsedSeconds))) : 0;
  return { x: a.x + (b ? b.x - a.x : 0) * ratio, y: a.y + (b ? b.y - a.y : 0) * ratio,
    segment: a.segment, elapsedSeconds: seconds };
}
/** Equal marker positions after a round trip are movement, not a pause. */
export function marketRoutePauseMarkers(
  trajectory: MarketTrajectory
): MarketRoutePoint[] {
  let cursor = 0;
  return trajectory.markers.filter((point, index) => {
    if (index === 0) return false;
    const previous = trajectory.markers[index - 1];
    if (
      previous.segment !== point.segment ||
      Math.hypot(point.x - previous.x, point.y - previous.y) >= 2
    )
      return false;
    while (
      cursor < trajectory.points.length &&
      trajectory.points[cursor].elapsedSeconds < previous.elapsedSeconds
    )
      cursor++;
    for (
      let i = cursor;
      i < trajectory.points.length &&
      trajectory.points[i].elapsedSeconds <= point.elapsedSeconds;
      i++
    ) {
      const sample = trajectory.points[i];
      if (
        sample.segment !== point.segment ||
        Math.hypot(sample.x - previous.x, sample.y - previous.y) >= 2
      )
        return false;
    }
    return true;
  });
}
/** Derived from actual accepted movement events, never from intended routes or model prose. */
export function buildMarketTrajectory(
  events: readonly MarketEpisodeEvent[],
  spawn: { x: number; y: number },
  intervalSeconds = 5
): MarketTrajectory {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0)
    throw new Error('경로 표시 간격은 양수여야 합니다.');
  const started = events.find((e) => e.type === 'training_started');
  const finished = events.find(
    (e) => e.type === 'training_ended' || e.type === 'session_finished'
  );
  const start = Date.parse(
    started?.timestamp ?? events[0]?.timestamp ?? '1970-01-01'
  );
  const initial = (started?.payload.point as typeof spawn | undefined) ?? spawn;
  const points: MarketRoutePoint[] = [
    { ...initial, elapsedSeconds: 0, segment: 0 },
  ];
  let segment = 0,
    distance = 0,
    lastTime = 0;
  const actions: MarketRouteAction[] = [];
  let activeShelf: string | undefined;
  for (const event of events) {
    if (finished && event.sequence > finished.sequence) break;
    const elapsed = (Date.parse(event.timestamp) - start) / 1000;
    if (!Number.isFinite(elapsed) || elapsed < 0) continue;
    const payload = event.payload;
    let action: Pick<MarketRouteAction, 'kind' | 'label' | 'stationId' | 'productId' | 'quantity' | 'method'> | undefined;
    if (event.type === 'station_interacted') {
      const category = marketCategories.find(c => c.id === payload.station);
      activeShelf = category?.id;
      if (category) action = { kind: 'shelf-opened', label: `${category.label} 매대 열기`, stationId: category.id };
      else if (typeof payload.station === 'string' && payload.station.startsWith('staff:')) {
        action = { kind: 'staff-talked', label: '종업원에게 말 걸기', stationId: payload.station };
      }
    } else if (event.type === 'station_closed') {
      const category = marketCategories.find(c => c.id === (payload.station ?? activeShelf));
      if (category) action = { kind: 'shelf-closed', label: `${category.label} 매대 닫기`, stationId: category.id };
      activeShelf = undefined;
    } else if (event.type === 'cart_changed' && (payload.operation === 'add' || payload.operation === 'remove')) {
      const quantity = payload.quantity;
      if (typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 && typeof payload.productId === 'string') {
        const product = getMarketProduct(payload.productId);
        const name = typeof payload.productName === 'string' ? payload.productName : product?.name ?? payload.productId;
        const added = payload.operation === 'add';
        action = { kind: added ? 'item-added' : 'item-removed',
          label: `${name} ${quantity}개 ${added ? '담기' : '내려놓기'}`,
          productId: payload.productId, quantity,
          stationId: payload.method === 'employee' ? String(payload.staffStation ?? '') : product?.categoryId,
          method: payload.method === 'employee' ? 'employee' : 'shelf' };
      }
    }
    if (event.type === 'layout_changed') activeShelf = undefined;
    if (!action && event.type !== 'player_moved' && event.type !== 'layout_changed') continue;
    const p = (
      event.type === 'player_moved' ? payload.point : payload.playerPosition
    ) as { x: number; y: number } | undefined;
    const recorded = !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
    if (!recorded && !action) continue;
    const t = Math.max(lastTime, elapsed);
    const previous = points[points.length - 1];
    if (event.type === 'layout_changed') segment++;
    if (recorded) {
      if (event.type !== 'layout_changed') distance += Math.hypot(p!.x - previous.x, p!.y - previous.y);
      points.push({ x: p!.x, y: p!.y, elapsedSeconds: t, segment });
    }
    if (action) actions.push({ ...action, id: `action-${event.sequence}`, sequence: event.sequence,
      x: recorded ? p!.x : previous.x, y: recorded ? p!.y : previous.y, elapsedSeconds: t, segment,
      positionSource: recorded ? 'recorded' : 'last-known' });
    lastTime = t;
  }
  const end =
    Date.parse(
      finished?.timestamp ?? events[events.length - 1]?.timestamp ?? ''
    ) - start;
  const durationSeconds = Math.max(
    lastTime,
    Number.isFinite(end) ? end / 1000 : 0,
    0
  );
  const markers: MarketRoutePoint[] = [];
  let cursor = 0;
  const count = Math.min(10000, Math.floor(durationSeconds / intervalSeconds));
  const times = Array.from(
    { length: count + 1 },
    (_, i) => i * intervalSeconds
  );
  if (times.at(-1) !== durationSeconds) times.push(durationSeconds);
  for (const t of times) {
    while (cursor + 1 < points.length && points[cursor + 1].elapsedSeconds <= t)
      cursor++;
    const a = points[cursor],
      b = points[cursor + 1];
    const ratio =
      b && b.segment === a.segment && b.elapsedSeconds > a.elapsedSeconds
        ? Math.min(
            1,
            (t - a.elapsedSeconds) / (b.elapsedSeconds - a.elapsedSeconds)
          )
        : 0;
    markers.push({
      x: a.x + (b ? b.x - a.x : 0) * ratio,
      y: a.y + (b ? b.y - a.y : 0) * ratio,
      elapsedSeconds: t,
      segment: a.segment,
    });
  }
  return {
    schema: 'oneuldo.market.trajectory.v1',
    intervalSeconds,
    durationSeconds,
    distance,
    points,
    markers,
    actions,
    actionSchemaVersion: 2,
  };
}
