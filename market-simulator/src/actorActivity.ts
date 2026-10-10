import type { ActorObservation, Decision } from './types';

export const ACTOR_ACTIVITY_WINDOW_SIZE = 12;

export type ActorActivityOutcome = {
  actionType: Decision['action']['type'];
  accepted: true;
  newlyObserved: string[];
  newInformation: boolean;
  firstArrival: boolean;
  destinationAnchorId?: string;
  destinationArrivals?: number;
  returnedToPreviousAnchor: boolean;
  repeatedDirectedEdgeCount: number;
};

export type ActorActivityState = {
  lastOutcome: ActorActivityOutcome | null;
  decisionsWithoutNewObservation: number;
  repetition: {
    recentWindowSize: number;
    repeatedActionsInRecentWindow: number;
    repeatedActionsWithoutNewObservation: number;
    movementReturnsInRecentWindow: number;
  };
};

/** Stable visible content, independent of object key order and observation timestamps. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Describe repeated activity with no new observed information, not poor task performance.
 * No map, mission answer, score, shortest path or persona diagnosis enters this monitor.
 * These diagnostics never request a review, select an action or terminate generation.
 */
export class ActorActivityMonitor {
  private initialized = false;
  private seen = new Set<string>();
  private arrivals = new Map<string, number>();
  private edges = new Map<string, number>();
  private currentAnchor: string | null = null;
  private previousDeparture: string | null = null;
  private recent: { signature: string; returned: boolean }[] = [];
  private stagnationSignatures = new Set<string>();
  private repeatedActionsWithoutNewObservation = 0;
  private lastOutcome: ActorActivityOutcome | null = null;
  private noNewObservation = 0;

  /** Establish the initial visible scene once. Later observations belong to record(). */
  observe(o: ActorObservation): void {
    if (this.initialized) return;
    this.initialized = true;
    this.collect(o);
  }

  record(decision: Decision, before: ActorObservation, after: ActorObservation): void {
    this.observe(before);
    // Rejected or unconfirmed actions do not become fictional visits or accepted practice.
    if (after.result?.accepted !== true) return;
    const action = decision.action;
    const origin = this.currentAnchor;
    const newlyObserved = this.collect(after);
    let firstArrival = false;
    let returnedToPreviousAnchor = false;
    let repeatedDirectedEdgeCount = 0;
    let destination: Pick<ActorActivityOutcome, 'destinationAnchorId' | 'destinationArrivals'> = {};
    if (action.type === 'walkToAnchor') {
      const to = action.anchorId;
      const count = (this.arrivals.get(to) ?? 0) + 1;
      this.arrivals.set(to, count);
      firstArrival = count === 1;
      if (firstArrival) newlyObserved.push(`arrival:${to}`);
      returnedToPreviousAnchor = this.previousDeparture !== null && to === this.previousDeparture && to !== origin;
      const edge = canonical([origin, to]);
      repeatedDirectedEdgeCount = (this.edges.get(edge) ?? 0) + 1;
      this.edges.set(edge, repeatedDirectedEdgeCount);
      this.previousDeparture = origin;
      this.currentAnchor = to;
      destination = { destinationAnchorId: to, destinationArrivals: count };
    }
    const newInformation = newlyObserved.length > 0;
    this.lastOutcome = {
      actionType: action.type, accepted: true, newlyObserved, newInformation, firstArrival,
      ...destination, returnedToPreviousAnchor, repeatedDirectedEdgeCount,
    };
    const signature = this.actionSignature(decision, before, after, origin);
    this.recent.push({ signature, returned: returnedToPreviousAnchor });
    this.recent = this.recent.slice(-ACTOR_ACTIVITY_WINDOW_SIZE);
    if (newInformation) {
      this.noNewObservation = 0;
      this.stagnationSignatures.clear();
      this.repeatedActionsWithoutNewObservation = 0;
    } else {
      this.noNewObservation++;
      if (this.stagnationSignatures.has(signature)) this.repeatedActionsWithoutNewObservation++;
      this.stagnationSignatures.add(signature);
    }
  }

  getState(): ActorActivityState {
    return {
      lastOutcome: this.lastOutcome ? structuredClone(this.lastOutcome) : null,
      decisionsWithoutNewObservation: this.noNewObservation,
      repetition: {
        recentWindowSize: this.recent.length,
        repeatedActionsInRecentWindow: this.repeatedCount(),
        repeatedActionsWithoutNewObservation: this.repeatedActionsWithoutNewObservation,
        movementReturnsInRecentWindow: this.recent.filter(x => x.returned).length,
      },
    };
  }

  private repeatedCount(): number {
    return this.recent.length - new Set(this.recent.map(x => x.signature)).size;
  }

  private collect(o: ActorObservation): string[] {
    const added: string[] = [];
    const remember = (label: string, content: unknown) => {
      const key = canonical([label, content]);
      if (!this.seen.has(key)) { this.seen.add(key); added.push(label); }
    };
    // Relative direction/distance and passage labels change when moving; they are not new cues.
    for (const s of o.visibleStations) remember(`station:${s.id}`, [s.kind, s.label]);
    for (const a of o.anchors) remember(`anchor:${a.id}`, a.id);
    for (const p of o.products) remember(`product:${p.id}`, [p.name, p.detail, p.categoryId, p.price, p.stock]);
    if (o.activeStation) remember(`interaction:${o.activeStation}`, o.activeStation);
    if (o.shelf) remember(`shelf-page:${o.activeStation ?? 'visible'}`, [o.shelf.page, o.shelf.pageCount]);
    if (o.readObjectives) remember('read-list', [...o.readObjectives].sort((a, b) => a.id.localeCompare(b.id)));
    if (o.instructions) remember(`instructions:${o.instructions.phase}`, o.instructions.lines);
    if (o.supportText) remember('help-text', o.supportText);
    if (o.cart !== null) remember('cart-contents', Object.fromEntries(Object.entries(o.cart).filter(([, count]) => count > 0)));
    for (const [id, available] of Object.entries(o.cashiers)) remember(`cashier:${id}`, available);
    if (o.result?.message) remember('displayed-feedback', o.result.message);
    return added;
  }

  private actionSignature(d: Decision, before: ActorObservation, after: ActorObservation, origin: string | null): string {
    const a = d.action;
    if (a.type === 'walkToAnchor') return canonical([a.type, origin, a.anchorId]);
    if (a.type === 'walkTo' || a.type === 'interact') return canonical([a.type, a.station]);
    if (a.type === 'add' || a.type === 'remove') return canonical([a.type, a.productId, a.quantity ?? 1]);
    if (a.type === 'checkout' || a.type === 'requestCashier') return canonical([a.type, a.checkoutId ?? 'checkout']);
    // Different scroll fractions on the same displayed page are the same activity.
    if (a.type === 'browse') return canonical([a.type, after.activeStation, after.shelf?.page ?? null]);
    // Delay, reason, currentTask, attentionTag and cueRefs cannot disguise a repeated action.
    return canonical([a.type, before.activeStation, before.view]);
  }
}
