import { randomUUID } from 'expo-crypto';

import type {
  BehaviorLogRequest,
  BehaviorPriority,
  BehaviorStepOutcome,
} from '../api/behaviorLog';
import type { MarketCart, MarketEvaluation, MarketMission } from '../game/scenarios';
import { getCartQuantity, getMarketCartTotal, getMarketProduct } from '../game/scenarios';
import { enqueueBehaviorEvents, flushBehaviorEventQueue } from './behaviorEventQueue';
import {
  MarketMovementDetector,
  type MarketMovementEventDraft,
  type MarketMovementSample,
  type MarketTelemetryControlMode,
  type MarketTelemetryStation,
} from './marketMovementDetector';

const MARKET_TASK_ID = '30000000-0000-0000-0000-000000000003';
const CONTENT_VERSION = 'market-micro-behavior-v1';
const DETECTION_RULE_VERSION = 'market-detection-rules-v1';
const APP_VERSION = '1.0.0';
const PERSIST_DELAY_MS = 1000;
const UPLOAD_INTERVAL_MS = 10000;
const IDLE_THRESHOLD_MS = 5000;

const MARKET_STATIONS: Record<MarketTelemetryStation, { x: number; y: number }> = {
  checkout: { x: 450, y: 250 },
  fresh: { x: 350, y: 400 },
  produce: { x: 550, y: 400 },
  meal: { x: 350, y: 680 },
  drink: { x: 550, y: 680 },
};

type TrackInput = {
  eventCode: string;
  microActionId: string;
  occurredAt?: string;
  outcome?: BehaviorStepOutcome;
  payload?: Record<string, unknown>;
  priority?: BehaviorPriority;
  error?: BehaviorLogRequest['error'];
  support?: BehaviorLogRequest['support'];
  validity?: BehaviorLogRequest['validity'];
  controlMode?: MarketTelemetryControlMode;
  finalContext?: Pick<BehaviorLogRequest, 'sessionEnd' | 'taskResult'>;
};

type BufferedEvent = { event: BehaviorLogRequest; priority: BehaviorPriority };

export class MarketBehaviorTracker {
  readonly questInstanceId = randomUUID();
  readonly sessionId = randomUUID();

  private buffer: BufferedEvent[] = [];
  private closed = false;
  private controlMode: MarketTelemetryControlMode = 'joystick';
  private firstUserActionAt: number | null = null;
  private interruptionCount = 0;
  private interruptionStartedAt: number | null = null;
  private interruptionTimeMs = 0;
  private idleStartedAt: number | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;
  private readonly startedAt = Date.now();
  private uploadTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly movementDetector = new MarketMovementDetector(MARKET_STATIONS, 105);

  constructor(
    private readonly accessToken: string,
    private readonly mission: MarketMission,
    private readonly difficulty = 2,
  ) {
    this.track({
      eventCode: 'SHOP.SESSION_STARTED',
      microActionId: 'START_MARKET_SESSION',
      payload: {
        budgetAmount: mission.budget,
        objectiveCount: mission.objectives.length,
        objectives: mission.objectives.map(({ productId, quantity }) => {
          const product = getMarketProduct(productId);
          return {
            categoryId: product?.categoryId,
            itemId: productId,
            priceAmount: product?.price,
            requiredQuantity: quantity,
          };
        }),
        thresholdRuleVersion: DETECTION_RULE_VERSION,
      },
      priority: 'critical',
    });
    this.track({
      eventCode: 'SHOP.MISSION_PRESENTED',
      microActionId: 'VIEW_MARKET_MISSION',
      payload: { objectiveCount: mission.objectives.length },
      priority: 'high',
    });
  }

  track(input: TrackInput) {
    if (this.closed && !input.finalContext) return;
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const occurredAtMs = Date.parse(occurredAt);
    if (input.eventCode !== 'SHOP.IDLE_STARTED'
      && input.eventCode !== 'SHOP.IDLE_ENDED'
      && input.eventCode !== 'SHOP.MOVEMENT_STOPPED') {
      this.endIdleIfNeeded(occurredAtMs, input.eventCode);
    }
    const isUserAction = !input.eventCode.endsWith('_PRESENTED')
      && input.eventCode !== 'SHOP.SESSION_STARTED'
      && input.eventCode !== 'SHOP.MOVEMENT_SEGMENT_SUMMARIZED';
    if (isUserAction && this.firstUserActionAt === null) this.firstUserActionAt = occurredAtMs;
    this.sequence += 1;
    const event: BehaviorLogRequest = {
      metadata: {
        appVersion: APP_VERSION,
        clientEventId: randomUUID(),
        contentVersion: CONTENT_VERSION,
        eventSchemaVersion: 'behavior-event-v1',
        eventSequence: this.sequence,
        occurredAt,
        offlineQueued: false,
      },
      identity: { sessionId: this.sessionId },
      task: {
        difficulty: this.difficulty,
        evidenceContext: 'ASSESSMENT_TASK',
        gameId: 'MARKET_SIMULATION',
        scenarioVariant: 'BASELINE',
        taskId: MARKET_TASK_ID,
        taskVersion: CONTENT_VERSION,
      },
      action: {
        eventCode: input.eventCode,
        firstAction: this.firstUserActionAt === occurredAtMs ? input.microActionId : undefined,
        microActionId: input.microActionId,
        startLatencyMs: this.firstUserActionAt === occurredAtMs
          ? Math.max(0, occurredAtMs - this.startedAt)
          : undefined,
        stepOrder: this.sequence,
        stepOutcome: input.outcome,
      },
      accessibility: {
        audioEnabled: false,
        controllerMode: this.controlMode === 'accessibility' ? 'SWITCH' : 'TOUCH',
        instructionMode: 'TEXT',
        symbolSupport: true,
        textLevel: 'STANDARD',
      },
      error: input.error,
      payload: {
        type: 'SHOPPING',
        thresholdRuleVersion: DETECTION_RULE_VERSION,
        ...input.payload,
      },
      presentation: {
        foregroundDurationMs: Math.max(0, occurredAtMs - this.startedAt - this.interruptionTimeMs),
        instructionContentId: this.mission.id,
        screenId: 'MARKET_SIMULATION',
      },
      simulation: {
        contentSource: 'STATIC',
        questInstanceId: this.questInstanceId,
        simulationStarted: true,
      },
      support: input.support,
      validity: input.validity,
      ...input.finalContext,
    };
    this.buffer.push({ event, priority: input.priority ?? 'normal' });
    if (input.priority === 'critical' || this.buffer.length >= 5) this.persistSafely();
    else this.schedulePersistence();
    this.scheduleUpload();
  }

  observeMovement(sample: MarketMovementSample) {
    this.endIdleIfNeeded(sample.occurredAt ?? Date.now(), 'SHOP.ITEM_SEARCH_STARTED');
    this.controlMode = sample.controlMode;
    this.trackMovementEvents(this.movementDetector.observe({
      ...sample,
      targetZoneIds: this.targetZoneIds(),
    }));
  }

  movementStopped(controlMode: MarketTelemetryControlMode) {
    this.controlMode = controlMode;
    this.trackMovementEvents(this.movementDetector.stop(Date.now(), controlMode));
    this.scheduleIdle();
  }

  shelfOpened(station: Exclude<MarketTelemetryStation, 'checkout'>) {
    this.movementDetector.markShelfOpened(station);
    const target = this.targetZoneIds().has(station);
    this.track({
      eventCode: target ? 'SHOP.SHELF_OPENED' : 'SHOP.NON_TARGET_SHELF_OPENED',
      microActionId: `OPEN_SHELF_${station}`,
      payload: { isTargetZone: target, stationId: station },
      priority: target ? 'high' : 'normal',
    });
  }

  shelfClosed(
    station: Exclude<MarketTelemetryStation, 'checkout'>,
    cart: MarketCart,
    openedAt: number,
  ) {
    const targetItems = this.mission.objectives
      .filter(({ productId }) => getMarketProduct(productId)?.categoryId === station);
    const hasRemainingTarget = targetItems.some(
      ({ productId, quantity }) => getCartQuantity(cart, productId) < quantity,
    );
    this.track({
      eventCode: hasRemainingTarget
        ? 'SHOP.TARGET_SHELF_LEFT_WITHOUT_SELECTION'
        : 'SHOP.SHELF_CLOSED',
      microActionId: `CLOSE_SHELF_${station}`,
      payload: {
        durationMs: Math.max(0, Date.now() - openedAt),
        hasRemainingTarget,
        stationId: station,
      },
      priority: hasRemainingTarget ? 'high' : 'normal',
    });
  }

  briefingAdvanced(index: number, durationMs: number) {
    this.track({
      eventCode: 'SHOP.BRIEFING_ADVANCED',
      microActionId: `ADVANCE_BRIEFING_${index + 1}`,
      payload: { briefingIndex: index, durationMs },
      priority: 'normal',
    });
  }

  cartOpened(cart: MarketCart) {
    this.track({
      eventCode: 'SHOP.CART_OPENED',
      microActionId: 'OPEN_CART',
      payload: this.cartPayload(cart),
      priority: 'normal',
    });
  }

  cartClosed(cart: MarketCart, durationMs: number) {
    this.track({
      eventCode: 'SHOP.CART_CLOSED',
      microActionId: 'CLOSE_CART',
      payload: { ...this.cartPayload(cart), durationMs },
      priority: 'normal',
    });
  }

  quantityChanged(productId: string, before: number, after: number, cartAfter: MarketCart) {
    const objective = this.mission.objectives.find((item) => item.productId === productId);
    this.track({
      eventCode: 'SHOP.QUANTITY_CHANGED',
      microActionId: `${after > before ? 'ADD' : 'REMOVE'}_${productId}`,
      outcome: objective && after === objective.quantity ? 'SUCCESS' : undefined,
      payload: {
        cartTotalAmount: getMarketCartTotal(cartAfter),
        isObjectiveItem: Boolean(objective),
        itemId: productId,
        quantityAfter: after,
        quantityBefore: before,
        requiredQuantity: objective?.quantity ?? 0,
        selectedQuantity: after,
      },
      priority: 'high',
    });
    if (before === 0 && after > 0) {
      this.track({
        eventCode: objective ? 'SHOP.ITEM_SELECTED' : 'SHOP.WRONG_ITEM_SELECTED',
        microActionId: `SELECT_${productId}`,
        outcome: objective ? 'SUCCESS' : 'FAILURE',
        payload: {
          itemId: productId,
          priceAmount: getMarketProduct(productId)?.price,
          requiredQuantity: objective?.quantity ?? 0,
          selectedQuantity: after,
        },
        priority: 'high',
        error: objective ? undefined : { wrongActionCount: 1 },
      });
    }
    if (objective && after === objective.quantity) {
      this.track({
        eventCode: 'SHOP.QUANTITY_MATCHED',
        microActionId: `MATCH_QUANTITY_${productId}`,
        outcome: 'SUCCESS',
        payload: { itemId: productId, requiredQuantity: objective.quantity, selectedQuantity: after },
        priority: 'high',
      });
    } else if (objective && before <= objective.quantity && after > objective.quantity) {
      this.track({
        eventCode: 'SHOP.QUANTITY_OVERSHOT',
        microActionId: `OVERSHOOT_QUANTITY_${productId}`,
        outcome: 'FAILURE',
        payload: { itemId: productId, requiredQuantity: objective.quantity, selectedQuantity: after },
        priority: 'high',
      });
    }
  }

  checkoutEntered(cart: MarketCart) {
    const missing = this.remainingObjectives(cart);
    this.track({
      eventCode: missing.length > 0 ? 'SHOP.EARLY_CHECKOUT_APPROACH' : 'SHOP.CHECKOUT_ENTERED',
      microActionId: 'ENTER_CHECKOUT',
      payload: { ...this.cartPayload(cart), missingItemIds: missing.map(({ productId }) => productId) },
      priority: 'high',
    });
  }

  checkoutSubmitted(cart: MarketCart, evaluation: MarketEvaluation) {
    this.track({
      eventCode: 'SHOP.CHECKOUT_SUBMITTED',
      microActionId: 'SUBMIT_CHECKOUT',
      outcome: evaluation.success ? 'SUCCESS' : 'FAILURE',
      payload: {
        ...this.cartPayload(cart),
        missingItemIds: evaluation.missing.map(({ productId }) => productId),
        overBudgetAmount: evaluation.overBudget,
        wrongItemIds: evaluation.extra.map(({ productId }) => productId),
      },
      priority: 'critical',
    });
  }

  correctionStarted(cart: MarketCart) {
    this.track({
      eventCode: 'SHOP.CHECKOUT_CORRECTION_STARTED',
      microActionId: 'CORRECT_CART',
      payload: this.cartPayload(cart),
      priority: 'high',
    });
  }

  appBackgrounded() {
    if (this.interruptionStartedAt !== null) return;
    this.interruptionStartedAt = Date.now();
    this.interruptionCount += 1;
    this.track({
      eventCode: 'SHOP.APP_BACKGROUNDED',
      microActionId: 'BACKGROUND_MARKET',
      payload: {},
      priority: 'critical',
    });
    void this.flushNow().catch(() => undefined);
  }

  appForegrounded() {
    if (this.interruptionStartedAt === null) return;
    const durationMs = Date.now() - this.interruptionStartedAt;
    this.interruptionTimeMs += durationMs;
    this.interruptionStartedAt = null;
    this.track({
      eventCode: 'SHOP.APP_FOREGROUNDED',
      microActionId: 'RESUME_MARKET',
      payload: { interruptionDurationMs: durationMs },
      priority: 'high',
    });
  }

  async complete(cart: MarketCart, evaluation: MarketEvaluation) {
    if (this.closed) return;
    this.trackMovementEvents(this.movementDetector.finish(this.targetZoneIds()));
    this.closed = true;
    this.track({
      eventCode: 'SHOP.SESSION_COMPLETED',
      microActionId: 'COMPLETE_MARKET_SESSION',
      outcome: 'SUCCESS',
      payload: this.cartPayload(cart),
      priority: 'critical',
      finalContext: {
        sessionEnd: {
          interruptionCount: this.interruptionCount,
          interruptionTimeMs: this.interruptionTimeMs,
          reason: 'COMPLETED',
        },
        taskResult: {
          completionQuality: evaluation.success ? 100 : 0,
          completionTimeMs: Date.now() - this.startedAt - this.interruptionTimeMs,
          taskCompleted: evaluation.success,
        },
      },
    });
    this.clearTimers();
    await this.flushNow();
  }

  async abort(cart: MarketCart) {
    if (this.closed) return;
    this.trackMovementEvents(this.movementDetector.finish(this.targetZoneIds()));
    this.closed = true;
    this.track({
      eventCode: 'COMMON.ABORT',
      microActionId: 'EXIT_MARKET',
      outcome: 'INCOMPLETE',
      payload: this.cartPayload(cart),
      priority: 'critical',
      error: { postErrorAction: 'ABORT_AFTER_ERROR' },
      finalContext: {
        sessionEnd: {
          interruptionCount: this.interruptionCount,
          interruptionTimeMs: this.interruptionTimeMs,
          reason: 'USER_ABORTED',
        },
        taskResult: {
          completionQuality: 0,
          completionTimeMs: Date.now() - this.startedAt - this.interruptionTimeMs,
          taskCompleted: false,
        },
      },
    });
    this.clearTimers();
    await this.flushNow();
  }

  async flushNow() {
    await this.persist();
    await flushBehaviorEventQueue(this.accessToken);
  }

  private trackMovementEvents(events: MarketMovementEventDraft[]) {
    events.forEach((event) => this.track({
      ...event,
      priority: event.priority ?? 'normal',
    }));
  }

  private targetZoneIds() {
    const zones = this.mission.objectives
      .filter(({ productId, quantity }) => getCartQuantity(this.latestCart, productId) < quantity)
      .map(({ productId }) => getMarketProduct(productId)?.categoryId)
      .filter((zone): zone is NonNullable<typeof zone> => zone !== undefined);
    return new Set<MarketTelemetryStation>(zones);
  }

  private latestCart: MarketCart = {};

  updateCart(cart: MarketCart) {
    this.latestCart = cart;
  }

  private remainingObjectives(cart: MarketCart) {
    return this.mission.objectives.filter(
      ({ productId, quantity }) => getCartQuantity(cart, productId) < quantity,
    );
  }

  private cartPayload(cart: MarketCart) {
    const total = getMarketCartTotal(cart);
    return {
      cartItemCount: Object.values(cart).reduce((sum, quantity) => sum + quantity, 0),
      cartTotalAmount: total,
      remainingBudgetAmount: this.mission.budget - total,
      remainingObjectiveCount: this.remainingObjectives(cart).length,
    };
  }

  private schedulePersistence() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistSafely();
    }, PERSIST_DELAY_MS);
  }

  private scheduleUpload() {
    if (this.uploadTimer) return;
    this.uploadTimer = setTimeout(() => {
      this.uploadTimer = null;
      void this.flushNow().catch(() => undefined);
    }, UPLOAD_INTERVAL_MS);
  }

  private async persist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.buffer.length === 0) return;
    const events = this.buffer.splice(0, this.buffer.length);
    try {
      await enqueueBehaviorEvents(this.accessToken, events);
    } catch (error) {
      this.buffer.unshift(...events);
      throw error;
    }
  }

  private persistSafely() {
    void this.persist().catch(() => undefined);
  }

  private clearTimers() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    if (this.uploadTimer) clearTimeout(this.uploadTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.persistTimer = null;
    this.uploadTimer = null;
    this.idleTimer = null;
  }

  private scheduleIdle() {
    if (this.idleTimer || this.idleStartedAt !== null || this.closed) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.idleStartedAt = Date.now();
      this.track({
        eventCode: 'SHOP.IDLE_STARTED',
        microActionId: 'IDLE_IN_MARKET',
        payload: { idleThresholdMs: IDLE_THRESHOLD_MS },
        priority: 'normal',
      });
    }, IDLE_THRESHOLD_MS);
  }

  private endIdleIfNeeded(occurredAt: number, resumedByEventCode: string) {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.idleStartedAt === null) return;
    const startedAt = this.idleStartedAt;
    this.idleStartedAt = null;
    this.track({
      eventCode: 'SHOP.IDLE_ENDED',
      microActionId: 'RESUME_AFTER_IDLE',
      occurredAt: new Date(occurredAt).toISOString(),
      payload: {
        idleDurationMs: Math.max(0, occurredAt - startedAt),
        resumedByEventCode,
      },
      priority: 'normal',
      error: {
        idleCount: 1,
        idleTimeMs: Math.max(0, occurredAt - startedAt),
      },
    });
  }
}
