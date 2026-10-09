import { createMarketAgentAdapter, type MarketAgentAction } from '../../frontend/src/game/marketSession';
import { validateMarketReplaySnapshot, validateMarketReplayTrace, type MarketReplaySnapshot,
  type MarketReplayStep, type MarketReplayTrace } from '../../frontend/src/game/marketReplayTrace';
import { planWalk } from './navigation';
import { Random } from './random';
import { DEFAULT_REPLAY_PRESENTATION, visibleStations, visibleAnchors, resolveReplayAnchor, getReplayShelfPage, replayShelfPageFractions } from '../../frontend/src/game/marketReplayPerception';
import { getMarketStationApproachPoint } from '../../frontend/src/game/marketEnvironment';
import { isMarketNavigationSegmentClear } from '../../frontend/src/game/marketNavigation';
import type { ActorObservation, Observation } from './types';

/** Scratch game state only. Never exports an episode, log request, or renderer position. */
export class TraceGuard {
  private readonly adapter;
  private time = Date.parse('2000-01-01T00:00:00.000Z');
  private submitted = false;
  private scrollFraction = 0;
  private sequence = 0;
  private lastResult?: ActorObservation['result'];
  private readonly presentation;
  private readonly mission;
  constructor(snapshot: MarketReplaySnapshot, personaId = 'trace-validator', personaVersion = '1', model = 'trace-validation/1', private readonly attentionMode = false) {
    const valid = validateMarketReplaySnapshot(snapshot);
    if (!valid.valid) throw new Error(valid.errors.join('; '));
    this.adapter = createMarketAgentAdapter({ ...snapshot.config,
      provenance: { source: 'synthetic', agentModel: model, personaId, personaVersion },
    }, snapshot.environment);
    this.presentation = snapshot.presentation ?? DEFAULT_REPLAY_PRESENTATION;
    this.mission = snapshot.mission;
  }
  observe(): Observation { return this.adapter.observe(); }
  /** This is the only observation sent to attention policies. Raw state remains guard-owned. */
  observeActor(): ActorObservation {
    const o = this.observe();
    const world = o.phase === 'shopping' && o.view === 'world' && !o.activeStation;
    const stations = world ? visibleStations(o.environment, o.playerPosition, this.presentation, o.cashierAvailability) : [];
    const shelfOpen = o.phase === 'shopping' && o.view === 'world' && o.products.length > 0;
    const page = shelfOpen ? getReplayShelfPage(o.products.map(p => p.id), this.presentation, this.scrollFraction) : null;
    const visible = new Set(page?.visibleProductIds ?? []);
    const cashiers: ActorObservation['cashiers'] = Object.fromEntries(stations
      .filter(s => s.kind === 'checkout' && /계산 가능|직원 호출/.test(s.label))
      .map(s => [s.id, o.cashierAvailability[s.id as 'checkout' | 'checkout-2']]));
    // The opened staff dialogue explicitly names these staffed counters. This is
    // displayed feedback, not permission to expose the rest of the hidden map.
    if (o.activeStation?.startsWith('staff:')) {
      for (const id of o.cashierRequestFeedback?.checkoutIds ?? []) cashiers[id] = true;
    }
    const result: ActorObservation = {
      schemaVersion: 'attention-observation-v1', phase: o.phase, view: o.view, activeStation: o.activeStation,
      visibleStations: stations, anchors: world ? visibleAnchors(o.environment, o.playerPosition, this.presentation, o.cashierAvailability) : [],
      products: shelfOpen ? o.products.filter(p => visible.has(p.id)).map(p => ({ ...p, stock: o.stock[p.id] })) : [],
      shelf: page ? { page: page.page, pageCount: page.pageCount, scrollFraction: this.scrollFraction,
        pageFractions: replayShelfPageFractions(o.products.map(p => p.id), this.presentation) } : null,
      listAvailable: world, cart: o.view === 'cart' || o.phase === 'checkout' ? o.cart : null,
      cashiers,
      sequence: this.sequence, elapsedMs: this.time - Date.parse('2000-01-01T00:00:00.000Z'),
      ...(this.lastResult ? { result: { ...this.lastResult } } : {}),
      ...(this.lastResult?.actionType === 'readList' ? { readObjectives: o.objectives.map(x => ({ ...x })) } : {}),
      lastActionError: o.lastActionError,
      ...(this.mission && (this.sequence <= 1 || o.phase === 'checkout') ? {
        instructions: o.phase === 'checkout'
          ? { phase: 'checkout' as const, lines: [...this.mission.checkoutDialogue] }
          : { phase: 'entry' as const, lines: [this.mission.description, ...this.mission.briefing] },
      } : {}),
    };
    if (o.phase === 'checkout' && o.selectedCheckoutId) result.cashiers[o.selectedCheckoutId] = o.cashierAvailability[o.selectedCheckoutId];
    // These empty-counter request buttons are actually displayed by the staff dialogue.
    if (o.view === 'world' && o.activeStation?.startsWith('staff:')) {
      for (const [id, available] of Object.entries(o.cashierAvailability)) if (!available) result.cashiers[id] = false;
    }
    return result;
  }
  execute(step: MarketReplayStep): { before: Observation; after: Observation; actions: MarketAgentAction[]; movementMs: number } {
    const before = this.observe();
    const actions: MarketAgentAction[] = [];
    let movementMs = 0;
    this.time += step.reactionDelayMs;
    const apply = (action: MarketAgentAction, delay = 1) => {
      this.time += delay;
      const timed = { ...action, at: new Date(this.time).toISOString() };
      const after = this.adapter.act(timed);
      if (after.lastActionError) throw new Error(`${step.id} (${step.type}): ${after.lastActionError}`);
      actions.push(action);
    };
    switch (step.type) {
      case 'start': break;
      case 'walkToAnchor': {
        if (!this.attentionMode || before.phase !== 'shopping' || before.view !== 'world' || before.activeStation) throw new Error(`${step.id}: anchor walking requires an unobstructed attention world view`);
        if (!this.observeActor().anchors.some(anchor => anchor.id === step.target.anchorId)) throw new Error(`${step.id}: anchor is not a visible local movement choice with arrival margin`);
        const target = resolveReplayAnchor(before.environment, before.playerPosition, step.target.anchorId, this.presentation, before.cashierAvailability);
        if (!target) throw new Error(`${step.id}: anchor is not a visible local movement choice`);
        const dx = target.x - before.playerPosition.x, dy = target.y - before.playerPosition.y;
        const distance = Math.hypot(dx, dy), count = Math.max(1, Math.ceil(distance / 24));
        const delay = Math.max(1, Math.ceil(distance / count / (190 * step.movement.speedMultiplier) * 1000));
        for (let i = 0; i < count; i++) { apply({ type: 'move', dx: dx / count, dy: dy / count }, delay); movementMs += delay; }
        break;
      }
      case 'readList':
        if (!this.attentionMode || !this.observeActor().listAvailable) throw new Error(`${step.id}: the mission list is not visible`);
        this.time += step.durationMs; break;
      case 'walkTo': {
        if (this.attentionMode && !this.observeActor().visibleStations.some(s => s.id === step.target.stationId && s.near)) throw new Error(`${step.id}: station approach requires a visible nearby station; explore with anchors first`);
        if (this.attentionMode) {
          const target = getMarketStationApproachPoint(before.environment, step.target.stationId, before.playerPosition, before.cashierAvailability);
          if (!target || Math.hypot(target.x - before.playerPosition.x, target.y - before.playerPosition.y) > 180
            || !isMarketNavigationSegmentClear(before.environment, before.playerPosition, target, before.cashierAvailability)) throw new Error(`${step.id}: station approach is not a local clear segment`);
          const dx = target.x - before.playerPosition.x, dy = target.y - before.playerPosition.y;
          const distance = Math.hypot(dx, dy), count = Math.max(1, Math.ceil(distance / 24));
          const delay = Math.max(1, Math.ceil(distance / count / (190 * step.movement.speedMultiplier) * 1000));
          for (let i = 0; i < count; i++) { apply({ type: 'move', dx: dx / count, dy: dy / count }, delay); movementMs += delay; }
          break;
        }
        const plan = planWalk(before, step.target.stationId, new Random(step.movement.motorSeed), 190 * step.movement.speedMultiplier);
        if (!plan) throw new Error(`${step.id}: no guarded route to ${step.target.stationId}`);
        for (const decision of plan) if (decision.action.type === 'move') { apply(decision.action, decision.delayMs); movementMs += decision.delayMs; }
        break;
      }
      case 'openShelf': {
        if (!before.environment.stationDetails.some(s => s.id === step.stationId && s.kind === 'shelf')) throw new Error(`${step.id}: unknown shelf`);
        apply({ type: 'interact', station: step.stationId }); break;
      }
      case 'checkout': apply({ type: 'checkout', checkoutId: step.checkoutId }); break;
      case 'talkToStaff': {
        if (!before.environment.stationDetails.some(s => s.id === step.stationId && s.kind === 'employee')) throw new Error(`${step.id}: unknown employee`);
        if (step.choice === 'open') apply({ type: 'interact', station: step.stationId });
        else {
          if (before.activeStation !== step.stationId) throw new Error(`${step.id}: employee conversation is not open`);
          if (step.choice === 'requestCashier') apply({ type: 'requestCashier', checkoutId: step.checkoutId });
          else apply({ type: 'requestReturn', productId: step.productId!, quantity: step.quantity! });
        }
        break;
      }
      case 'dragProduct':
        if (before.view !== 'world') throw new Error(`${step.id}: close the cart or help view before dragging from the visible shelf`);
        if (!before.products.some(p => p.id === step.productId) || !(before.stock[step.productId] >= step.quantity)) throw new Error(`${step.id}: drag product is not visible or is out of stock`);
        if (this.attentionMode && !this.observeActor().products.some(p => p.id === step.productId)) throw new Error(`${step.id}: scroll to observe the product before dragging`);
        if (step.gesture.outcome === 'drop') apply({ type: 'add', productId: step.productId, quantity: step.quantity });
        this.time += (step.gesture.durationMs + step.gesture.hesitationMs) * step.quantity;
        break;
      case 'removeProduct': apply({ type: 'remove', productId: step.productId, quantity: step.quantity }); break;
      case 'browse':
        if (before.view !== 'world') throw new Error(`${step.id}: close the cart or help view before browsing the visible shelf`);
        if (!before.products.length) throw new Error(`${step.id}: browsing requires an open shelf`);
        this.scrollFraction = step.scrollFraction;
        this.time += step.durationMs; break;
      case 'pause': case 'lookAround': this.time += step.durationMs; break;
      case 'viewHelp':
        if (before.phase !== 'shopping' || before.view !== 'world' || before.activeStation) throw new Error(`${step.id}: help requires the visible world HUD button`);
        apply({ type: 'viewHelp' }); break;
      case 'viewCart':
        if (before.phase !== 'shopping' || before.view !== 'world' || before.activeStation && !before.products.length) throw new Error(`${step.id}: cart requires the world HUD or shelf cart button`);
        apply({ type: 'viewCart' }); break;
      case 'closeView':
        if (before.view === 'world') throw new Error(`${step.id}: there is no visible view to close`);
        apply({ type: 'closeView' }); break;
      case 'closeStation':
        if (!before.activeStation || before.view !== 'world') throw new Error(`${step.id}: close the view before leaving an open station`);
        apply({ type: 'closeStation' }); break;
      case 'giveUp': case 'skipRating': apply({ type: step.type }); break;
      case 'submitForReview':
        // The existing submit guard verifies proximity and staffing. Its hypothetical feedback
        // is never sent to the policy, never exported, and never treated as real app analysis.
        apply({ type: 'submit' }); this.submitted = true; break;
      case 'awaitReviewAccepted': if (!this.submitted) throw new Error(`${step.id}: no review request to await`); break;
      case 'leave': break;
    }
    if (step.type === 'openShelf' || step.type === 'closeStation') this.scrollFraction = 0;
    this.sequence++;
    const actionType = step.type === 'talkToStaff'
      ? step.choice === 'open' ? 'interact' : step.choice === 'requestCashier' ? 'requestCashier' : 'requestReturn'
      : ({ openShelf: 'interact', dragProduct: 'add', removeProduct: 'remove', submitForReview: 'submit' } as Record<string, string>)[step.type] ?? step.type;
    this.lastResult = { accepted: true, actionType: actionType as NonNullable<ActorObservation['result']>['actionType'],
      ...('productId' in step ? { productId: step.productId } : {}),
      ...('quantity' in step ? { quantity: step.quantity } : {}),
      ...(step.type === 'openShelf' || step.type === 'talkToStaff' ? { stationId: step.stationId } : {}),
      ...(step.type === 'walkTo' ? { stationId: step.target.stationId } : {}),
      ...(step.type === 'walkToAnchor' ? { anchorId: step.target.anchorId } : {}),
    };
    return { before, after: this.observe(), actions, movementMs };
  }
}

/** Structural validation is shared with the app; guarded semantic replay stays offline. */
export function validateTrace(value: unknown, snapshot?: MarketReplaySnapshot) {
  const shape = validateMarketReplayTrace(value, snapshot);
  if (!shape.valid || !snapshot) return shape;
  try {
    const trace = value as MarketReplayTrace;
    const guard = new TraceGuard(snapshot, trace.personaId, trace.personaVersion, trace.generation?.model, trace.traceSchemaVersion === '2');
    for (const step of trace.steps) guard.execute(step);
    return { valid: true, errors: [] as string[] };
  } catch (error) { return { valid: false, errors: [(error as Error).message] }; }
}
