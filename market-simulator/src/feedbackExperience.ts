import type { ActorDirection, ActorObservation, Decision, PolicyAction } from './types';

export const FEEDBACK_EXPERIENCE_VERSION = 'bounded-observed-experience-v1' as const;
export const FEEDBACK_EXPERIENCE_V2_VERSION = 'bounded-observed-experience-v2' as const;
export type FeedbackExperienceVersion = typeof FEEDBACK_EXPERIENCE_VERSION | typeof FEEDBACK_EXPERIENCE_V2_VERSION;
export const FEEDBACK_EXPERIENCE_LIMITS = Object.freeze({ recentActions: 6, places: 6,
  productsPerShelf: 12, pagesPerShelf: 12, retentionActions: 24 });

type RecentAction = {
  actionNumber: number;
  action: { type: PolicyAction['type']; direction?: ActorDirection; station?: string; anchorId?: string;
    productId?: string; quantity?: number; durationMs?: number; scrollFraction?: number };
  result: { accepted: boolean; actionType: PolicyAction['type']; productId?: string; quantity?: number;
    stationId?: string; anchorId?: string; message?: string; movement?: { direction: ActorDirection;
      durationMs: number; movedDistancePx: number; outcome: 'moved' | 'partially-blocked' | 'blocked' } } | null;
  cartChanged: boolean | null;
};
type Shelf = { id: string; label: string | null; seenAt: number; openedAt: number[];
  pages: { page: number; seenAt: number }[]; products: { id: string; name: string; seenAt: number }[] };
type Passage = { id: string; label: string; seenAt: number; arrivals: number[] };
type VisibleCart = { items: Record<string, number>; seenAt: number };
/** dx/dy are known only for directional input; walking to a visible passage records its displayed direction alone. */
type Move = { direction: ActorDirection; outcome: 'moved' | 'partially-blocked' | 'blocked' | null; dx: number | null; dy: number | null; at: number };

export type FeedbackExperienceSnapshot = {
  version: FeedbackExperienceVersion;
  /** These are synthetic storage bounds, not a person's measured memory capacity. */
  limits: typeof FEEDBACK_EXPERIENCE_LIMITS;
  recentActions: RecentAction[];
  checks: { listReadActionsAgo: number | null; cartViewedActionsAgo: number | null;
    listReadsInRecentActions: number; cartViewsInRecentActions: number;
    /** null means unknown or the read has expired; false requires no unknown mutation outcome. */
    cartChangedSinceListRead: boolean | null;
    /** v2 only: any known cart change since an accepted visible cart check, not since a list read.
     * null means no retained check or an unknown mutation outcome; false never resolves an unknown outcome. */
    cartChangedSinceLastCartView?: boolean | null;
    /** Opt-in (v13): accepted list reads within the retained window, beyond the six recent actions. */
    listReadsInRetention?: number };
  exploration: {
    recentShelves: { id: string; label: string | null; lastSeenActionsAgo: number; timesOpened: number;
      observedPages: number[]; observedProducts: { id: string; name: string }[] }[];
    recentPassages: { id: string; label: string; lastSeenActionsAgo: number; arrivals: number }[];
    lastMovement: { direction: ActorDirection; outcome: 'moved' | 'partially-blocked' | 'blocked'; actionsAgo: number } | null;
    /** Opt-in (v11): walking within the retained window, from applied results only. No position, map or unseen place. */
    recentMovement?: { walks: number; byDirection: Partial<Record<ActorDirection, number>>; blockedByDirection: Partial<Record<ActorDirection, number>>;
      /** Present only when every retained walk was a directional input with a measured displacement. */
      directional: { travelledPx: number; netPx: number } | null };
    /** Opt-in (v12): accepted walks to a visible passage within the retained window, not capped by the six-place summary. */
    passageArrivals?: { id: string; arrivals: number }[];
    /** Opt-in (v13): the last time a checkout counter was on screen during this visit. Kept for the whole visit as one
     * landmark sighting; the direction is where it was displayed then, not where it is from the current position. */
    lastCheckoutSeen?: { actionsAgo: number; direction: ActorDirection; distanceBand: string } | null;
  };
  /** Historical cart contents are never presented as the currently visible cart. */
  visibleCart: { items: Record<string, number>; changedSincePreviousVisibleObservation: boolean | null } | null;
};

const text = (value: string) => value.slice(0, 300);
const within = (now: number, then: number) => now - then <= FEEDBACK_EXPERIENCE_LIMITS.retentionActions;
const cartItems = (o: ActorObservation): Record<string, number> | null => o.cart === null ? null
  : Object.fromEntries(Object.entries(o.cart).filter(([, n]) => Number.isFinite(n) && n >= 0));
const sameCart = (a: Record<string, number>, b: Record<string, number>) => {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...ids].every(id => (a[id] ?? 0) === (b[id] ?? 0));
};

function actionSummary(action: PolicyAction): RecentAction['action'] {
  const summary: RecentAction['action'] = { type: action.type };
  // Never copy actor reason, beliefs, arbitrary nested fields or a raw observation.
  for (const key of ['direction', 'station', 'anchorId', 'productId', 'quantity', 'durationMs', 'scrollFraction'] as const)
    if (key in action) Object.assign(summary, { [key]: (action as unknown as Record<string, unknown>)[key] });
  return summary;
}

function resultSummary(decision: Decision, after: ActorObservation): RecentAction['result'] {
  const result = after.result;
  if (!result || result.actionType !== decision.action.type) return null;
  const summary: NonNullable<RecentAction['result']> = { accepted: result.accepted, actionType: result.actionType };
  for (const key of ['productId', 'quantity', 'stationId', 'anchorId'] as const)
    if (result[key] !== undefined) Object.assign(summary, { [key]: result[key] });
  // A list's contents stay in its current observation only, even if a future UI includes them in a message.
  if (result.message !== undefined && result.actionType !== 'readList') summary.message = text(result.message);
  if (result.movement) summary.movement = { direction: result.movement.direction,
    durationMs: result.movement.durationMs, movedDistancePx: result.movement.movedDistancePx,
    outcome: result.movement.outcome };
  return summary;
}

/** Observable evidence about this applied action only. It does not reconstruct a hidden cart. */
function cartMutationOutcome(decision: Decision, result: RecentAction['result'], visibleChange: boolean | null): boolean | null {
  // A displayed before/after comparison can also establish that a requested mutation was a no-op.
  if (visibleChange !== null) return visibleChange;
  if (!['add', 'remove', 'requestReturn'].includes(decision.action.type)) return false;
  if (decision.action.type === 'add' && (decision.dragOutcome === 'miss' || decision.dragOutcome === 'cancel')) return false;
  if (result?.accepted === false) return false;
  if (result?.accepted && typeof result.quantity === 'number' && Number.isFinite(result.quantity) && result.quantity >= 0)
    return result.quantity > 0;
  return null;
}

/** Bounded evidence from this attempt, separate from the actor's fallible authored beliefs.
 * Call record only after applying an action, including a handled UI rejection. Tool/format retries do not age memory.
 * Only displayed shelf labels/products, visible carts and explicit applied results are used; never objective contents.
 */
export class FeedbackExperience {
  private readonly version: FeedbackExperienceVersion;
  private count = 0;
  private actions: RecentAction[] = [];
  private shelves: Shelf[] = [];
  private passages: Passage[] = [];
  private lastListRead: number | null = null;
  private lastCartView: number | null = null;
  private cartChangedAfterRead: boolean | null = null;
  private cartChangedAfterView: boolean | null = null;
  private lastCart: VisibleCart | null = null;
  private lastCartComparison: boolean | null = null;
  private lastMovement: { direction: ActorDirection; outcome: 'moved' | 'partially-blocked' | 'blocked'; at: number } | null = null;
  private readonly movementHistory: boolean;
  private moves: Move[] = [];
  private readonly passageHistory: boolean;
  private readonly passageCapacity?: number;
  private arrivals: { id: string; at: number }[] = [];
  private readonly progressHistory: boolean;
  private listReads: number[] = [];
  private checkoutSeen: { at: number; direction: ActorDirection; distanceBand: string } | null = null;

  constructor(options: { version?: FeedbackExperienceVersion; movementHistory?: boolean; passageHistory?: boolean; progressHistory?: boolean; passageCapacity?: number } = {}) {
    if (options.passageCapacity !== undefined && (!Number.isInteger(options.passageCapacity) || options.passageCapacity < 4))
      throw new Error('passageCapacity must be an integer of at least 4');
    this.version = options.version ?? FEEDBACK_EXPERIENCE_VERSION;
    this.movementHistory = options.movementHistory === true;
    this.passageHistory = options.passageHistory === true;
    this.passageCapacity = options.passageCapacity;
    this.progressHistory = options.progressHistory === true;
  }

  private age(at: number | null): number | null { return at !== null && within(this.count, at) ? this.count - at : null; }

  private observe(o: ActorObservation, shelves: Shelf[], passages: Passage[], at: number): void {
    for (const station of o.visibleStations.filter(s => s.kind === 'shelf')) {
      let shelf = shelves.find(s => s.id === station.id);
      if (!shelf) { shelf = { id: station.id, label: text(station.label), seenAt: at, openedAt: [], pages: [], products: [] }; shelves.push(shelf); }
      shelf.label = text(station.label); shelf.seenAt = at;
    }
    // An open shelf can remain visible when its sign is outside the camera. Its ID is already displayed context.
    if (o.activeStation && o.shelf) {
      let shelf = shelves.find(s => s.id === o.activeStation);
      if (!shelf) { shelf = { id: o.activeStation, label: null, seenAt: at, openedAt: [], pages: [], products: [] }; shelves.push(shelf); }
      shelf.seenAt = at;
      shelf.pages = [...shelf.pages.filter(p => p.page !== o.shelf!.page), { page: o.shelf.page, seenAt: at }]
        .slice(-FEEDBACK_EXPERIENCE_LIMITS.pagesPerShelf);
      for (const product of o.products) shelf.products = [...shelf.products.filter(p => p.id !== product.id),
        { id: product.id, name: text(product.name), seenAt: at }].slice(-FEEDBACK_EXPERIENCE_LIMITS.productsPerShelf);
    }
    for (const anchor of o.anchors) {
      let passage = passages.find(p => p.id === anchor.id);
      if (!passage) { passage = { id: anchor.id, label: text(anchor.label), seenAt: at, arrivals: [] }; passages.push(passage); }
      passage.label = text(anchor.label); passage.seenAt = at;
    }
  }

  private trim(shelves: Shelf[], passages: Passage[]): { shelves: Shelf[]; passages: Passage[] } {
    for (const shelf of shelves) {
      shelf.pages = shelf.pages.filter(p => within(this.count, p.seenAt));
      shelf.products = shelf.products.filter(p => within(this.count, p.seenAt));
      shelf.openedAt = shelf.openedAt.filter(at => within(this.count, at));
    }
    for (const passage of passages) passage.arrivals = passage.arrivals.filter(at => within(this.count, at));
    return { shelves: shelves.filter(s => within(this.count, s.seenAt)).sort((a, b) => b.seenAt - a.seenAt)
      .slice(0, FEEDBACK_EXPERIENCE_LIMITS.places),
    passages: passages.filter(p => within(this.count, p.seenAt)).sort((a, b) => b.seenAt - a.seenAt)
      .slice(0, FEEDBACK_EXPERIENCE_LIMITS.places) };
  }

  record(decision: Decision, before: ActorObservation, after: ActorObservation): void {
    this.observe(before, this.shelves, this.passages, this.count);
    const beforeCart = cartItems(before), afterCart = cartItems(after);
    const previousVisibleCart = this.lastCart && within(this.count, this.lastCart.seenAt) ? this.lastCart : null;
    if (beforeCart !== null) this.lastCart = { items: beforeCart, seenAt: this.count };
    this.count += 1;
    const result = resultSummary(decision, after);
    const changed = beforeCart !== null && afterCart !== null ? !sameCart(beforeCart, afterCart) : null;
    this.actions.push({ actionNumber: this.count, action: actionSummary(decision.action), result, cartChanged: changed });
    this.actions = this.actions.slice(-FEEDBACK_EXPERIENCE_LIMITS.recentActions);
    if (this.age(this.lastListRead) !== null) {
      if (changed === true) this.cartChangedAfterRead = true;
      if (decision.action.type === 'add' || decision.action.type === 'remove') {
        if (result?.accepted && typeof result.quantity === 'number' && result.quantity >= 0) {
          if (result.quantity > 0) this.cartChangedAfterRead = true;
        }
        else if (changed === null && result?.accepted !== false && this.cartChangedAfterRead !== true) this.cartChangedAfterRead = null;
      }
    }
    if (decision.action.type === 'readList' && result?.accepted) {
      this.lastListRead = this.count; this.cartChangedAfterRead = false;
    }
    if (this.version === FEEDBACK_EXPERIENCE_V2_VERSION && this.age(this.lastCartView) !== null) {
      const nextVisibleCart = beforeCart ?? afterCart;
      const changedFromPreviousObservation = previousVisibleCart !== null && nextVisibleCart !== null
        && !sameCart(previousVisibleCart.items, nextVisibleCart);
      const mutation = cartMutationOutcome(decision, result, changed);
      if (changedFromPreviousObservation || mutation === true) this.cartChangedAfterView = true;
      else if (mutation === null && this.cartChangedAfterView !== true) this.cartChangedAfterView = null;
    }
    if (decision.action.type === 'viewCart' && result?.accepted && afterCart !== null) {
      this.lastCartView = this.count;
      if (this.version === FEEDBACK_EXPERIENCE_V2_VERSION) this.cartChangedAfterView = false;
    }
    this.observe(after, this.shelves, this.passages, this.count);
    if (result?.accepted && decision.action.type === 'interact' && after.activeStation === decision.action.station && after.shelf)
      this.shelves.find(s => s.id === after.activeStation)?.openedAt.push(this.count);
    if (result?.accepted && decision.action.type === 'walkToAnchor' && result.anchorId === decision.action.anchorId)
      this.passages.find(p => p.id === result.anchorId)?.arrivals.push(this.count);
    if (result?.accepted && result.movement) this.lastMovement = { direction: result.movement.direction,
      outcome: result.movement.outcome, at: this.count };
    if (this.progressHistory) {
      if (decision.action.type === 'readList' && result?.accepted) this.listReads.push(this.count);
      this.listReads = this.listReads.filter(at => within(this.count, at));
      this.checkoutSeen = this.sightedCheckout(after, this.count) ?? this.sightedCheckout(before, this.count - 1) ?? this.checkoutSeen;
    }
    if (this.passageHistory) {
      if (result?.accepted && decision.action.type === 'walkToAnchor' && result.anchorId === decision.action.anchorId)
        this.arrivals.push({ id: decision.action.anchorId, at: this.count });
      this.arrivals = this.arrivals.filter(arrival => within(this.count, arrival.at));
      if (this.passageCapacity !== undefined) {
        // Only accepted arrivals refresh place recency. Eviction deletes every
        // retained visit to that place, so seeing or returning cannot restore it.
        const retained = [...new Set(this.arrivals.map(arrival => arrival.id).reverse())].slice(0, this.passageCapacity);
        this.arrivals = this.arrivals.filter(arrival => retained.includes(arrival.id));
      }
    }
    if (this.movementHistory && result?.accepted) {
      const delta = after.result?.movement?.actualDelta;
      if (result.movement) this.moves.push({ direction: result.movement.direction, outcome: result.movement.outcome,
        dx: delta && Number.isFinite(delta.dx) ? delta.dx : null, dy: delta && Number.isFinite(delta.dy) ? delta.dy : null, at: this.count });
      else if (decision.action.type === 'walkToAnchor') {
        const anchorId = decision.action.anchorId;
        const anchor = before.anchors.find(a => a.id === anchorId);
        if (anchor) this.moves.push({ direction: anchor.direction, outcome: null, dx: null, dy: null, at: this.count });
      }
      this.moves = this.moves.filter(move => within(this.count, move.at));
    }
    if (afterCart !== null) {
      this.lastCartComparison = this.lastCart && within(this.count, this.lastCart.seenAt) ? !sameCart(this.lastCart.items, afterCart) : null;
      this.lastCart = { items: afterCart, seenAt: this.count };
    }
    const trimmed = this.trim(this.shelves, this.passages);
    this.shelves = trimmed.shelves; this.passages = trimmed.passages;
    if (this.lastCart && !within(this.count, this.lastCart.seenAt)) this.lastCart = null;
    if (this.lastMovement && !within(this.count, this.lastMovement.at)) this.lastMovement = null;
  }

  private sightedCheckout(o: ActorObservation, at: number): { at: number; direction: ActorDirection; distanceBand: string } | null {
    const order = ['near', 'medium', 'far'];
    const seen = o.visibleStations.filter(station => station.kind === 'checkout')
      .sort((a, b) => order.indexOf(a.distanceBand) - order.indexOf(b.distanceBand))[0];
    return seen && (!this.checkoutSeen || at >= this.checkoutSeen.at) ? { at, direction: seen.direction, distanceBand: seen.distanceBand } : null;
  }

  private recentMovement(): NonNullable<FeedbackExperienceSnapshot['exploration']['recentMovement']> {
    const moves = this.moves.filter(move => within(this.count, move.at));
    const byDirection: Partial<Record<ActorDirection, number>> = {}, blockedByDirection: Partial<Record<ActorDirection, number>> = {};
    for (const move of moves) {
      byDirection[move.direction] = (byDirection[move.direction] ?? 0) + 1;
      if (move.outcome === 'blocked') blockedByDirection[move.direction] = (blockedByDirection[move.direction] ?? 0) + 1;
    }
    const measured = moves.length > 0 && moves.every(move => move.dx !== null && move.dy !== null);
    return { walks: moves.length, byDirection, blockedByDirection, directional: measured ? {
      travelledPx: Math.round(moves.reduce((sum, move) => sum + Math.hypot(move.dx!, move.dy!), 0)),
      netPx: Math.round(Math.hypot(moves.reduce((sum, move) => sum + move.dx!, 0), moves.reduce((sum, move) => sum + move.dy!, 0))) } : null };
  }

  snapshot(currentObservation: ActorObservation): FeedbackExperienceSnapshot {
    const shelves = structuredClone(this.shelves), passages = structuredClone(this.passages);
    this.observe(currentObservation, shelves, passages, this.count);
    const trimmed = this.trim(shelves, passages);
    const currentCart = cartItems(currentObservation);
    const comparison = this.lastCart && within(this.count, this.lastCart.seenAt)
      ? this.lastCart.seenAt === this.count && currentCart && sameCart(currentCart, this.lastCart.items)
        ? this.lastCartComparison : currentCart && !sameCart(currentCart, this.lastCart.items) : null;
    const changedSinceCartView = this.age(this.lastCartView) === null ? null
      : currentCart !== null && this.lastCart && within(this.count, this.lastCart.seenAt)
        && !sameCart(currentCart, this.lastCart.items) ? true : this.cartChangedAfterView;
    return structuredClone({ version: this.version, limits: FEEDBACK_EXPERIENCE_LIMITS,
      recentActions: this.actions,
      checks: { listReadActionsAgo: this.age(this.lastListRead), cartViewedActionsAgo: this.age(this.lastCartView),
        listReadsInRecentActions: this.actions.filter(a => a.action.type === 'readList').length,
        cartViewsInRecentActions: this.actions.filter(a => a.action.type === 'viewCart').length,
        cartChangedSinceListRead: this.age(this.lastListRead) === null ? null : this.cartChangedAfterRead,
        ...(this.version === FEEDBACK_EXPERIENCE_V2_VERSION ? { cartChangedSinceLastCartView: changedSinceCartView } : {}),
        ...(this.progressHistory ? { listReadsInRetention: this.listReads.filter(at => within(this.count, at)).length } : {}) },
      exploration: {
        recentShelves: trimmed.shelves.map(s => ({ id: s.id, label: s.label, lastSeenActionsAgo: this.count - s.seenAt,
          timesOpened: s.openedAt.length, observedPages: s.pages.map(p => p.page),
          observedProducts: s.products.map(p => ({ id: p.id, name: p.name })) })),
        recentPassages: trimmed.passages.map(p => ({ id: p.id, label: p.label, lastSeenActionsAgo: this.count - p.seenAt,
          arrivals: p.arrivals.length })),
        lastMovement: this.lastMovement ? { direction: this.lastMovement.direction, outcome: this.lastMovement.outcome,
          actionsAgo: this.count - this.lastMovement.at } : null,
        ...(this.movementHistory ? { recentMovement: this.recentMovement() } : {}),
        ...(this.progressHistory ? { lastCheckoutSeen: (() => {
          const seen = this.sightedCheckout(currentObservation, this.count) ?? this.checkoutSeen;
          return seen ? { actionsAgo: this.count - seen.at, direction: seen.direction, distanceBand: seen.distanceBand } : null;
        })() } : {}),
        ...(this.passageHistory ? { passageArrivals: [...new Set(this.arrivals.filter(a => within(this.count, a.at)).map(a => a.id))]
          .map(id => ({ id, arrivals: this.arrivals.filter(a => a.id === id && within(this.count, a.at)).length })) } : {}) },
      visibleCart: currentCart === null ? null : { items: currentCart, changedSincePreviousVisibleObservation: comparison },
    });
  }
}
