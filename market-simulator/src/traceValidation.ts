import { MARKET_GOAL_REMINDER_CONTRACT, MARKET_GOAL_REMINDER_TITLE, marketGoalReminderLines } from '../../frontend/src/game/marketGoalReminder';
import { createMarketAgentAdapter, type MarketAgentAction } from '../../frontend/src/game/marketSession';
import { canonicalMarketReplayJson, isMarketReplaySystemCompletionStep, validateMarketReplaySnapshot, validateMarketReplayTrace, type MarketReplaySnapshot,
  type MarketReplayStep, type MarketReplayTrace } from '../../frontend/src/game/marketReplayTrace';
import { planWalk } from './navigation';
import { Random } from './random';
import { FeedbackMovementPolicy } from './feedbackMovementPolicy';
import { DEFAULT_REPLAY_PRESENTATION, visibleStations, visibleAnchors, visibleUnlabelledShelfBodies, visibleBoundaries, visibleBoundariesV3, replayCurrentArea, visibleGatePassages, resolveReplayAnchor, getReplayShelfPage, replayShelfPageFractions, canApproachVisibleStation } from '../../frontend/src/game/marketReplayPerception';
import { directionalInputSlices, MARKET_DIRECTIONAL_MOVE_SPEED } from '../../frontend/src/game/marketDirectionalInput';
import { localWalkInputSlices } from '../../frontend/src/game/marketLocalInput';
import { getMarketStationApproachPoint } from '../../frontend/src/game/marketEnvironment';
import { getMarketNavigationPath, isMarketNavigationSegmentClear } from '../../frontend/src/game/marketNavigation';
import { getMarketHelpLines, marketCashierResponse, marketReturnResponse } from '../../frontend/src/game/marketHelp';
import { getMarketProduct } from '../../frontend/src/game/scenarios';
import type { ActorObservation, Observation } from './types';
import { feedbackCheckoutScreenLines } from './feedbackScreenText';

/** Scratch game state only. Never exports an episode, log request, or renderer position. */
export class TraceGuard {
  private readonly adapter;
  private time = Date.parse('2000-01-01T00:00:00.000Z');
  private submitted = false;
  private scrollFraction = 0;
  private sequence = 0;
  private staffLocationHelp = false;
  private lastResult?: ActorObservation['result'];
  private readonly presentation;
  private readonly mission;
  private readonly helpLines;
  private readonly initialStock: Record<string, number>;
  constructor(snapshot: MarketReplaySnapshot, personaId = 'trace-validator', personaVersion = '1', model = 'trace-validation/1', private readonly attentionMode = false, private readonly extendedActor = false, private readonly feedbackMode = false, private readonly directionalMovement = false, private readonly richFeedbackObservation = false, private readonly shelfCartCue = false, private readonly observeDirectionalStructures = true, private readonly fixedAnchorMovement = false, private readonly wholeTraceObservationVersion?: 'anchor-visible-structures-v1', private readonly incrementalSpatial = false, private readonly wayfindingVersion?: 'wayfinding-v1' | 'wayfinding-v2' | 'wayfinding-v3') {
    const valid = validateMarketReplaySnapshot(snapshot);
    if (!valid.valid) throw new Error(valid.errors.join('; '));
    this.adapter = createMarketAgentAdapter({ ...snapshot.config,
      provenance: { source: 'synthetic', agentModel: model, personaId, personaVersion },
    }, snapshot.environment);
    this.presentation = snapshot.presentation ?? DEFAULT_REPLAY_PRESENTATION;
    this.mission = snapshot.mission;
    this.initialStock = snapshot.initialStock;
    this.helpLines = getMarketHelpLines(snapshot.config.alarmPenaltyPoints);
  }
  observe(): Observation { return this.adapter.observe(); }
  /** wayfinding-v3: named boundaries, the kind of area the player stands in, and walk choices through a visible door gate. */
  private wayfindingV3(o: Observation, world: boolean): Pick<ActorObservation, 'boundaries' | 'area' | 'gatePassages'> {
    if (!world) return { boundaries: [], gatePassages: [] };
    const anchors = visibleAnchors(o.environment, o.playerPosition, this.presentation, o.cashierAvailability);
    return { boundaries: visibleBoundariesV3(o.environment, o.playerPosition, this.presentation, o.cashierAvailability),
      area: replayCurrentArea(o.environment, o.playerPosition),
      gatePassages: visibleGatePassages(o.environment, o.playerPosition, this.presentation, anchors, o.cashierAvailability) };
  }
  /** This is the only observation sent to attention policies. Raw state remains guard-owned. */
  observeActor(): ActorObservation {
    const o = this.observe();
    const world = o.phase === 'shopping' && o.view === 'world' && !o.activeStation;
    const stations = world ? visibleStations(o.environment, o.playerPosition, this.presentation, o.cashierAvailability).map(station =>
      this.incrementalSpatial ? { ...station, approachable: canApproachVisibleStation(o.environment, o.playerPosition, station.id, this.presentation, o.cashierAvailability) } : station) : [];
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
      ...(this.incrementalSpatial ? { visibleApproachEnabled: true as const } : {}),
      ...(this.directionalMovement && this.observeDirectionalStructures || this.wholeTraceObservationVersion === 'anchor-visible-structures-v1' ? { visibleStructures: world
        ? visibleUnlabelledShelfBodies(o.environment, o.playerPosition, this.presentation, o.cashierAvailability) : [] } : {}),
      ...(this.wayfindingVersion === 'wayfinding-v1' || this.wayfindingVersion === 'wayfinding-v2' ? { boundaries: world
        ? visibleBoundaries(o.environment, o.playerPosition, this.presentation, o.cashierAvailability) : [] } : {}),
      ...(this.wayfindingVersion === 'wayfinding-v3' ? this.wayfindingV3(o, world) : {}),
      // The shelf add control reads "한 개 더 담기" once a product is in the basket; it never shows the amount.
      // The raw observation hides the closed basket, and shelf stock only falls by what was put into it.
      products: shelfOpen ? o.products.filter(p => visible.has(p.id)).map(p => ({ ...p, stock: o.stock[p.id],
        ...(this.shelfCartCue ? { inCart: o.stock[p.id] < (this.initialStock[p.id] ?? o.stock[p.id]) } : {}) })) : [],
      shelf: page ? { page: page.page, pageCount: page.pageCount, scrollFraction: this.scrollFraction,
        pageFractions: replayShelfPageFractions(o.products.map(p => p.id), this.presentation) } : null,
      listAvailable: world, cart: o.view === 'cart' || o.phase === 'checkout' ? o.cart : null,
      // Restore labels already rendered for this exposed cart, not catalog knowledge
      // about unseen products. The existing cart observation covers the whole panel;
      // neither legacy nor rich observation models its scroll-clipped rows.
      ...(this.richFeedbackObservation && o.cart !== null
        && (o.phase === 'shopping' && o.view === 'cart' || o.phase === 'checkout') ? {
          cartItems: Object.entries(o.cart).flatMap(([id, quantity]) => {
            const product = quantity > 0 ? getMarketProduct(id) : undefined;
            return product ? [{ id, name: product.name, quantity,
              // The shelf's horizontal basket omits detail; CartContents renders it.
              ...(o.phase === 'checkout' || !o.activeStation ? { detail: product.detail } : {}),
            }] : [];
          }),
        } : {}),
      ...(this.extendedActor && o.view === 'help' ? { supportText: [...(this.mission?.briefing ?? []), ...this.helpLines] } : {}),
      // Same shared rule the app's cart panels render (frontend/src/game/marketGoalReminder.ts).
      ...(this.incrementalSpatial && o.phase === 'shopping' && o.view === 'cart' && marketGoalReminderLines(o.cart, this.mission) ? {
        goalReminder: { contract: MARKET_GOAL_REMINDER_CONTRACT, title: MARKET_GOAL_REMINDER_TITLE, lines: marketGoalReminderLines(o.cart, this.mission)! } } : {}),
      ...(this.extendedActor && o.view === 'cart' ? { removableProductIds: Object.keys(o.cart ?? {}).filter(id =>
        o.products.some(product => product.id === id && product.categoryId === o.activeStation)) } : {}),
      ...(this.extendedActor && o.activeStation?.startsWith('staff:') ? {
        staffLocationHelp: this.staffLocationHelp,
        ...(this.staffLocationHelp ? { locationChoices: o.objectives.map(({id, label}) => ({id, label})) } : {}),
      } : {}),
      cashiers,
      sequence: this.sequence, elapsedMs: this.time - Date.parse('2000-01-01T00:00:00.000Z'),
      ...(this.lastResult ? { result: { ...this.lastResult } } : {}),
      ...(this.lastResult?.actionType === 'readList' ? { readObjectives: o.objectives.map(x => ({ ...x })) } : {}),
      lastActionError: o.lastActionError,
      ...(this.mission && (this.sequence <= 1 || o.phase === 'checkout') ? {
        instructions: o.phase === 'checkout'
          ? { phase: 'checkout' as const, lines: this.richFeedbackObservation
            ? feedbackCheckoutScreenLines(this.mission.checkoutDialogue, !!(o.cashierAvailable || o.selectedKioskId))
            : [...this.mission.checkoutDialogue] }
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
  execute(step: MarketReplayStep, systemCompletion = false): { before: Observation; after: Observation; actions: MarketAgentAction[]; movementMs: number } {
    if (systemCompletion && !this.extendedActor) throw new Error('System completion requires an explicitly extended actor policy');
    const before = this.observe();
    const actions: MarketAgentAction[] = [];
    let movementMs = 0;
    let movementResult: NonNullable<ActorObservation['result']>['movement'];
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
      case 'moveDirection': {
        if (!this.directionalMovement || before.phase !== 'shopping' || before.view !== 'world' || before.activeStation)
          throw new Error(`${step.id}: directional input requires an unlocked feedback-choice-v2, feedback-choice-v3 or feedback-choice-v4 world`);
        let movedDistancePx = 0, constrained = false;
        for (const slice of directionalInputSlices(step.direction, step.durationMs, step.movement)) {
          const previous = this.observe().playerPosition;
          const dx = slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000;
          const dy = slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000;
          apply({ type: 'moveInput', dx, dy }, slice.durationMs);
          const current = this.observe().playerPosition;
          movedDistancePx += Math.hypot(current.x - previous.x, current.y - previous.y);
          constrained ||= Math.hypot(current.x - previous.x - dx, current.y - previous.y - dy) > 1e-7;
          movementMs += slice.durationMs;
        }
        const current = this.observe().playerPosition;
        movementResult = { direction: step.direction, durationMs: step.durationMs,
          actualDelta: { dx: current.x - before.playerPosition.x, dy: current.y - before.playerPosition.y },
          movedDistancePx, outcome: movedDistancePx < 1e-7 ? 'blocked' : constrained ? 'partially-blocked' : 'moved' };
        break;
      }
      case 'walkToAnchor': {
        if (!this.attentionMode || before.phase !== 'shopping' || before.view !== 'world' || before.activeStation) throw new Error(`${step.id}: anchor walking requires an unobstructed attention world view`);
        const anchor = this.observeActor().anchors.find(anchor => anchor.id === step.target.anchorId);
        if (!anchor) throw new Error(`${step.id}: anchor is not a visible local movement choice with arrival margin`);
        const target = resolveReplayAnchor(before.environment, before.playerPosition, step.target.anchorId, this.presentation, before.cashierAvailability);
        if (!target) throw new Error(`${step.id}: anchor is not a visible local movement choice`);
        if (this.fixedAnchorMovement) {
          let movedDistancePx = 0, constrained = false;
          for (const slice of localWalkInputSlices(before.environment, before.playerPosition, target,
            before.cashierAvailability, step.movement, step.timeoutMs)) {
            const previous = this.observe().playerPosition;
            const dx = slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000;
            const dy = slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000;
            apply({ type: 'moveInput', dx, dy }, slice.durationMs);
            const current = this.observe().playerPosition;
            movedDistancePx += Math.hypot(current.x - previous.x, current.y - previous.y);
            constrained ||= Math.hypot(current.x - previous.x - dx, current.y - previous.y - dy) > 1e-7;
            movementMs += slice.durationMs;
          }
          const current = this.observe().playerPosition;
          movementResult = { direction: anchor.direction, durationMs: movementMs,
            actualDelta: { dx: current.x - before.playerPosition.x, dy: current.y - before.playerPosition.y },
            movedDistancePx, outcome: movedDistancePx < 1e-7 ? 'blocked' : constrained ? 'partially-blocked' : 'moved' };
          break;
        }
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
        const seen = this.observeActor().visibleStations.find(s => s.id === step.target.stationId);
        // visible-travel-v1: a visible but not locally approachable target is walked along the app's floor path (motor walkToVisibleTarget).
        if (this.attentionMode && !systemCompletion && this.incrementalSpatial && seen && seen.approachable === false) {
          const target = getMarketStationApproachPoint(before.environment, step.target.stationId, before.playerPosition, before.cashierAvailability);
          const path = target && getMarketNavigationPath(before.environment, before.playerPosition, target, before.cashierAvailability);
          if (!path) throw new Error(`${step.id}: no floor path to the visible ${step.target.stationId}`);
          let at = { ...before.playerPosition };
          for (const point of path) {
            const dx = point.x - at.x, dy = point.y - at.y, distance = Math.hypot(dx, dy), count = Math.max(1, Math.ceil(distance / 24));
            const delay = Math.max(1, Math.ceil(distance / count / (190 * step.movement.speedMultiplier) * 1000));
            for (let i = 0; i < count; i++) { apply({ type: 'move', dx: dx / count, dy: dy / count }, delay); movementMs += delay; }
            at = { x: point.x, y: point.y };
          }
          break;
        }
        if (this.attentionMode && !systemCompletion && !this.observeActor().visibleStations.some(s => s.id === step.target.stationId && (this.incrementalSpatial ? s.approachable : s.near))) throw new Error(`${step.id}: station approach requires a currently visible reachable station`);
        if (this.attentionMode && !systemCompletion) {
          const target = getMarketStationApproachPoint(before.environment, step.target.stationId, before.playerPosition, before.cashierAvailability);
          if (!target || Math.hypot(target.x - before.playerPosition.x, target.y - before.playerPosition.y) > (this.incrementalSpatial ? 600 : 180)
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
          if (step.choice === 'openLocationHelp') this.staffLocationHelp = true;
          else if (step.choice === 'backToStaff') this.staffLocationHelp = false;
          else if (step.choice === 'askLocation') {
            if (!this.staffLocationHelp) throw new Error('Open the location menu first');
            apply({ type: 'askLocation', objectiveId: step.objectiveId });
          }
          else if (step.choice === 'requestCashier') apply({ type: 'requestCashier', checkoutId: step.checkoutId });
          else if (step.choice === 'returnProduct') apply({ type: 'requestReturn', productId: step.productId!, quantity: step.quantity! });
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
        apply({ type: 'viewHelp' }); this.time += step.durationMs ?? 0; break;
      case 'viewCart':
        if (before.phase !== 'shopping' || before.view !== 'world' || before.activeStation && !before.products.length) throw new Error(`${step.id}: cart requires the world HUD or shelf cart button`);
        apply({ type: 'viewCart' }); this.time += step.durationMs ?? 0; break;
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
    if (step.type === 'closeStation' || step.type === 'talkToStaff' && step.choice === 'open') this.staffLocationHelp = false;
    if (step.type === 'openShelf' || step.type === 'closeStation') this.scrollFraction = 0;
    this.sequence++;
    const actionType = step.type === 'talkToStaff'
      ? step.choice === 'open' ? 'interact' : step.choice === 'returnProduct' ? 'requestReturn' : step.choice
      : ({ openShelf: 'interact', dragProduct: 'add', removeProduct: 'remove', submitForReview: 'submit' } as Record<string, string>)[step.type] ?? step.type;
    const after = this.observe();
    const cashierMessage = step.type === 'talkToStaff' && step.choice === 'requestCashier'
      ? after.cashierRequestFeedback?.message ?? (after.selectedCheckoutId
        && !before.cashierAvailability[after.selectedCheckoutId] && after.cashierAvailability[after.selectedCheckoutId]
        ? marketCashierResponse(after.selectedCheckoutId) : undefined)
      : undefined;
    this.lastResult = { accepted: true, actionType: actionType as NonNullable<ActorObservation['result']>['actionType'],
      ...('productId' in step ? { productId: step.productId } : {}),
      ...('quantity' in step ? { quantity: step.quantity } : {}),
      ...(step.type === 'openShelf' || step.type === 'talkToStaff' ? { stationId: step.stationId } : {}),
      ...(step.type === 'walkTo' ? { stationId: step.target.stationId } : {}),
      ...(step.type === 'walkToAnchor' ? { anchorId: step.target.anchorId } : {}),
      ...(movementResult ? { movement: movementResult } : {}),
      ...(step.type === 'talkToStaff' && step.choice === 'askLocation' ? {
        message: after.staffLearningFeedback?.message,
      } : {}),
      ...(this.extendedActor && cashierMessage !== undefined ? { message: cashierMessage } : {}),
      ...(this.extendedActor && step.type === 'talkToStaff' && step.choice === 'returnProduct'
        ? { message: marketReturnResponse(getMarketProduct(step.productId!)!.name, step.quantity!) } : {}),
    };
    // A valid gesture can fail to add an item. This is observable basket feedback,
    // not an engine exception, hidden goal comparison, or fabricated UI error.
    if (this.feedbackMode && step.type === 'dragProduct' && step.gesture.outcome !== 'drop') {
      this.lastResult.accepted = false;
      this.lastResult.quantity = 0;
      this.lastResult.message = '상품이 장바구니에 담기지 않았어요.';
    }
    return { before, after, actions, movementMs };
  }
}

/** Structural validation is shared with the app; guarded semantic replay stays offline. */
export function validateTrace(value: unknown, snapshot?: MarketReplaySnapshot) {
  const shape = validateMarketReplayTrace(value, snapshot);
  if (!shape.valid || !snapshot) return shape;
  try {
    const trace = value as MarketReplayTrace;
    const wholeTraceDirectionalMovement = trace.generation?.actorPolicyVersion === 'whole-trace-v3'
      && ['directional-v1', 'directional-v2'].includes(trace.generation.wholeTraceMovementVersion ?? '');
    const guard = new TraceGuard(snapshot, trace.personaId, trace.personaVersion, trace.generation?.model, trace.traceSchemaVersion === '2',
      ['episodic-choice-v9', 'episodic-choice-v10', 'episodic-choice-v11', 'feedback-choice-v1', 'feedback-choice-v2', 'feedback-choice-v3', 'feedback-choice-v4', 'feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7', 'feedback-choice-v8', 'feedback-choice-v9', 'feedback-choice-v10', 'feedback-choice-v11', 'feedback-choice-v12', 'feedback-choice-v13', 'whole-trace-v3'].includes(trace.generation?.actorPolicyVersion ?? ''),
      ['feedback-choice-v1', 'feedback-choice-v2', 'feedback-choice-v3', 'feedback-choice-v4', 'feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7', 'feedback-choice-v8', 'feedback-choice-v9', 'feedback-choice-v10', 'feedback-choice-v11', 'feedback-choice-v12', 'feedback-choice-v13'].includes(trace.generation?.actorPolicyVersion ?? ''),
      ['feedback-choice-v2', 'feedback-choice-v3', 'feedback-choice-v4', 'feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7', 'feedback-choice-v8', 'feedback-choice-v9', 'feedback-choice-v10', 'feedback-choice-v11', 'feedback-choice-v12', 'feedback-choice-v13'].includes(trace.generation?.actorPolicyVersion ?? '')
        || wholeTraceDirectionalMovement,
      ['feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7', 'feedback-choice-v8', 'feedback-choice-v9', 'feedback-choice-v10', 'feedback-choice-v11', 'feedback-choice-v12', 'feedback-choice-v13'].includes(trace.generation?.actorPolicyVersion ?? ''),
      ['feedback-choice-v8', 'feedback-choice-v9', 'feedback-choice-v10', 'feedback-choice-v11', 'feedback-choice-v12', 'feedback-choice-v13'].includes(trace.generation?.actorPolicyVersion ?? ''),
      !wholeTraceDirectionalMovement, trace.generation?.wholeTraceMovementVersion === 'directional-v2', trace.generation?.wholeTraceObservationVersion,
      trace.generation?.actorPolicyVersion === 'episodic-choice-v11', trace.generation?.wholeTraceWayfindingVersion);
    const completion = trace.generation?.systemCompletion;
    const movementPolicy = ['feedback-choice-v3', 'feedback-choice-v4', 'feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7', 'feedback-choice-v8', 'feedback-choice-v9', 'feedback-choice-v10', 'feedback-choice-v11', 'feedback-choice-v12', 'feedback-choice-v13'].includes(trace.generation?.actorPolicyVersion ?? '')
      ? new FeedbackMovementPolicy(trace.seed, { wanderProbability: trace.generation!.movementPolicy!.wanderProbability },
        trace.generation!.movementPolicy!.version) : null;
    let movementDecisions = 0;
    for (const step of trace.steps) {
      const systemOwned = isMarketReplaySystemCompletionStep(trace, step.id);
      if (movementPolicy && !systemOwned && !['start', 'awaitReviewAccepted', 'skipRating', 'leave'].includes(step.type)) {
        const expected = movementPolicy.prepare(guard.observeActor(), movementDecisions++);
        if (canonicalMarketReplayJson(step.movementPolicy) !== canonicalMarketReplayJson(expected))
          throw new Error(`${step.id}: movement policy differs from the seeded decision and observed movement feedback`);
      }
      const applied = guard.execute(step, systemOwned);
      if (systemOwned && completion) for (const state of [applied.before, applied.after]) {
        if (state.cart !== null && canonicalMarketReplayJson(state.cart) !== canonicalMarketReplayJson(completion.cartAtStart))
          throw new Error(`${step.id}: system checkout must preserve the actual cart at the action limit`);
      }
    }
    if (movementPolicy && movementDecisions !== trace.generation?.feedback?.decisions)
      throw new Error('Movement policy decision count differs from feedback decisions');
    return { valid: true, errors: [] as string[] };
  } catch (error) { return { valid: false, errors: [(error as Error).message] }; }
}
