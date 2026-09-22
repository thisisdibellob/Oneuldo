import type { BehaviorLogRequest } from '../api/behaviorLog';
import type { exportMarketEpisode, MarketEpisodeEvent } from '../game/marketSession';
import { MARKET_CATALOG_VERSION, MARKET_SCENARIO_VERSION } from '../game/marketContent';
import { getMarketProduct, marketCategories, marketMission, marketProducts } from '../game/scenarios';
import type { MarketCart, MarketCategoryId, MarketMission } from '../game/scenarios';
import { MarketBehaviorTrackerCore } from './marketBehaviorTrackerCore';

export type MarketEpisode = ReturnType<typeof exportMarketEpisode>;
export type MarketEpisodeBehaviorOptions = {
  sessionId?: string;
  questInstanceId?: string;
  createEventId?: (sequence: number) => string;
  difficulty?: number;
  mission?: MarketMission;
};

/** A portable, stable identifier; no randomness, platform APIs, or wall clock. */
export function marketBehaviorReplayId(value: string): string {
  const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let i = 0; i < value.length; i += 1) {
    for (let j = 0; j < words.length; j += 1) {
      words[j] = Math.imul(words[j] ^ (value.charCodeAt(i) + j * 257), 0x01000193);
      words[j] ^= words[j] >>> 13;
    }
  }
  const hex = words.map(word => (word >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

class ReplayClock {
  private sequence = 0;
  private pending = new Map<number, { at: number; callback: () => void }>();

  constructor(public time: number) {}

  setTimeout = (callback: () => void, delayMs: number) => {
    const id = ++this.sequence;
    this.pending.set(id, { at: this.time + delayMs, callback });
    return id;
  };

  clearTimeout = (handle: unknown) => { this.pending.delete(handle as number); };

  advance(time: number) {
    if (!Number.isFinite(time) || time < this.time) throw new Error('Episode timestamps must be valid and chronological.');
    for (;;) {
      const next = [...this.pending].filter(([, timer]) => timer.at <= time)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.pending.delete(next[0]);
      this.time = next[1].at;
      next[1].callback();
    }
    this.time = time;
  }
}

/** Reconstruct the same scene-backed mission used by the UI, with family acceptance intact. */
export function createMarketEpisodeBehaviorMission(
  episode: MarketEpisode,
  questInstanceId: string,
  original: MarketMission = marketMission,
): MarketMission {
  const { scene: _scene, ...base } = original;
  const products = Object.values(episode.shelfSlots).flat().map(id => ({
    ...getMarketProduct(id)!, initialStock: episode.initialStock[id],
  }));
  const objectives = episode.objectives.map(objective => ({
    productId: objective.productId,
    quantity: objective.quantity,
    label: objective.label,
    acceptedProductIds: objective.match === 'exact' ? [objective.productId]
      : marketProducts.filter(product => (product.familyId ?? product.id) === objective.familyId).map(product => product.id),
  }));
  const mission = { ...base, objectives };
  return { ...mission, scene: {
    schemaVersion: 'market-scene-v1', questInstanceId, seed: episode.seed,
    layoutVersion: 'market-retail-layout-v3',
    catalogVersion: base.catalogVersion ?? MARKET_CATALOG_VERSION,
    scenarioVersion: base.scenarioVersion ?? MARKET_SCENARIO_VERSION,
    mission, products,
    slots: Object.entries(episode.shelfSlots).flatMap(([stationId, ids]) => ids.map((productId, index) => ({
      slotId: `${stationId}-${index}`, stationId, productId, storage: getMarketProduct(productId)!.storage,
    }))),
    startingConditions: {
      cart: {}, player: episode.environment.spawn,
      supportOptions: ['목록 다시 보기', '직원 도움', '거절/중단'],
      geometry: JSON.stringify(episode.environment),
      exposureMeaning: '진열 목록과 실제 배치이며 열람·이해를 뜻하지 않는다.',
    },
  } };
}

const isShelf = (station: string | null): station is MarketCategoryId => marketCategories.some(category => category.id === station);
const isCheckout = (station: string | null) => station === 'checkout' || station === 'checkout-2';

/**
 * Replay raw episode events through the very same tracker mapping used by the app.
 * Persistence is an in-memory sink. Timers run on event time, never on wall time.
 * Ratings and game-only audit events stay in the raw episode: they have no UI log mapping.
 */
export function convertMarketEpisodeToBehaviorLogs(
  episode: MarketEpisode,
  options: MarketEpisodeBehaviorOptions = {},
): BehaviorLogRequest[] {
  if (episode.events[0]?.type !== 'session_started' || !episode.events.some(event => event.type === 'session_finished')) {
    throw new Error('Only complete market episodes can be converted.');
  }
  const clock = new ReplayClock(Date.parse(episode.config.startedAt));
  if (!Number.isFinite(clock.time)) throw new Error('Episode startedAt must be a valid timestamp.');
  const namespace = `oneuldo.market.behavior:${episode.sessionId}`;
  const questInstanceId = options.questInstanceId ?? marketBehaviorReplayId(`${namespace}:quest`);
  const sessionId = options.sessionId ?? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(episode.sessionId)
    ? episode.sessionId : marketBehaviorReplayId(`${namespace}:session`));
  const mission = createMarketEpisodeBehaviorMission(episode, questInstanceId, options.mission);
  const events: BehaviorLogRequest[] = [];
  let eventSequence = 0;
  const tracker = new MarketBehaviorTrackerCore({
    now: () => clock.time,
    randomUUID: () => {
      eventSequence += 1;
      return options.createEventId?.(eventSequence) ?? marketBehaviorReplayId(`${namespace}:event:${eventSequence}`);
    },
    sessionId,
    provenance: { ...episode.provenance },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    persist: async () => undefined,
    flush: async () => undefined,
    assertAcknowledged: async () => undefined,
    onEvent: event => events.push(event),
  }, mission, options.difficulty ?? 2, { questInstanceId, contentSource: 'STATIC' }, episode.environment.stations);

  let cart: MarketCart = {};
  let activeStation: string | null = null;
  let shelfOpenedAt = clock.time;
  let cartOpenedAt = clock.time;
  let view = 'world';
  let moving = false;
  let position = episode.environment.spawn;
  let submitted = false;
  let finished = false;

  const changeStation = (station: string | null) => {
    if (station === activeStation) return;
    if (isShelf(activeStation)) tracker.shelfClosed(activeStation, cart, shelfOpenedAt);
    if (isShelf(station)) {
      shelfOpenedAt = clock.time;
      tracker.shelfOpened(station);
    }
    if (isCheckout(station) && !isCheckout(activeStation)) tracker.checkoutEntered(cart);
    activeStation = station;
  };
  const rejectedMove = (event: MarketEpisodeEvent) => event.type === 'action_rejected'
    && (event.payload.action as { type?: string } | null)?.type === 'move';

  for (const event of episode.events) {
    if (finished) break;
    const time = Date.parse(event.timestamp);
    const movement = event.type === 'player_moved' || rejectedMove(event);
    // A gap between bounded steps is a pause; stop at the last observed position.
    if (moving && (!movement || time - clock.time > 1000)) {
      tracker.movementStopped('touch');
      moving = false;
    }
    clock.advance(time);
    const payload = event.payload;
    switch (event.type) {
      case 'player_moved':
        position = payload.point as typeof position;
        tracker.observeMovement({ point: position, occurredAt: time, controlMode: 'touch', targetZoneIds: new Set() });
        moving = true;
        break;
      case 'action_rejected':
        if (rejectedMove(event)) {
          tracker.observeMovement({ point: position, occurredAt: time, blocked: true, controlMode: 'touch', targetZoneIds: new Set() });
          moving = true;
        }
        break;
      case 'station_interacted': {
        const station = String(payload.station);
        changeStation(station);
        if (station.startsWith('staff:')) tracker.staffHelpRequested({ type: 'interact', station });
        if (station === 'entrance' || station === 'exit') changeStation(null);
        break;
      }
      case 'station_closed':
        changeStation(null);
        view = 'world';
        break;
      case 'cart_changed': {
        const productId = String(payload.productId);
        const before = cart[productId] ?? 0;
        cart = { ...(payload.cart as MarketCart) };
        tracker.updateCart(cart);
        tracker.quantityChanged(productId, before, cart[productId] ?? 0, cart);
        if (payload.method === 'employee') tracker.staffHelpRequested({
          type: 'requestReturn', productId, quantity: payload.quantity,
        });
        break;
      }
      case 'cart_viewed':
        cartOpenedAt = time;
        view = 'cart';
        tracker.cartOpened(cart);
        break;
      case 'view_closed':
        if (view === 'cart') tracker.cartClosed(cart, time - cartOpenedAt);
        view = 'world';
        break;
      case 'help_viewed':
        view = 'help';
        tracker.staffHelpRequested({ type: 'viewHelp' });
        break;
      case 'cashier_requested':
        tracker.staffHelpRequested({ type: 'requestCashier', checkoutId: payload.checkoutId });
        break;
      case 'purchase_submitted':
        submitted = true;
        tracker.checkoutSubmitted(cart);
        break;
      case 'retry_started':
        changeStation(null);
        view = 'world';
        tracker.correctionStarted(cart);
        break;
      case 'session_finished':
        if (payload.outcome !== 'success') changeStation(null);
        tracker.finishSession(cart, payload.outcome === 'success' ? 'FLOW_FINISHED'
          : submitted ? 'EXIT_AFTER_SUBMISSION' : 'USER_ABORTED');
        finished = true;
        break;
    }
  }
  // Match the JSON transport representation and detach snapshots from the input episode.
  return JSON.parse(JSON.stringify(events)) as BehaviorLogRequest[];
}
