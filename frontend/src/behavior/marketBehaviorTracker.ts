import { randomUUID } from 'expo-crypto';

import type {
  BehaviorLogRequest,
  BehaviorPriority,
  BehaviorSimulationContext,
  BehaviorStepOutcome,
} from '../api/behaviorLog';
import type { MarketCart, MarketEvaluation, MarketMission } from '../game/scenarios';
import { getObjectiveProductIds, getObjectiveQuantity, getMarketCartTotal, getMarketProduct, marketProducts } from '../game/scenarios';
import { MARKET_CATALOG_VERSION, MARKET_SCENARIO_VERSION, MARKET_INITIAL_STOCK, MARKET_SUPPORT_OPTIONS } from '../game/marketContent';
import { enqueueBehaviorEvents, flushBehaviorEventQueue, assertBehaviorEventsAcknowledged } from './behaviorEventQueue';
import { MovementLogReducer, MOVEMENT_SAMPLING } from './movementLogReducer';
import {
  MarketMovementDetector,
  type MarketMovementEventDraft,
  type MarketMovementSample,
  type MarketTelemetryControlMode,
  type MarketTelemetryStation,
} from './marketMovementDetector';

const MARKET_TASK_ID = '30000000-0000-0000-0000-000000000003';
const CONTENT_VERSION = 'market-micro-behavior-v2-content';
const DETECTION_RULE_VERSION = 'market-detection-rules-v1';
const APP_VERSION = '1.0.0';
const PERSIST_DELAY_MS = 1000;
const UPLOAD_INTERVAL_MS = 10000;
const IDLE_THRESHOLD_MS = 5000;

const MARKET_STATIONS: Partial<Record<MarketTelemetryStation, { x: number; y: number }>> = {
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
  readonly questInstanceId: string;
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
  private readonly contentSource: BehaviorSimulationContext['contentSource'];
  private uploadTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly movementDetector: MarketMovementDetector;
  private readonly movementLogs = new MovementLogReducer<TrackInput>((event, span) => ({
    ...event, payload: { ...event.payload, marketContent: {
      ...(event.payload?.marketContent as object ?? {}), movementSpan: span,
    } },
  }));

  constructor(
    private readonly accessToken: string,
    private readonly mission: MarketMission,
    private readonly difficulty = 2,
    simulation?: Omit<BehaviorSimulationContext, 'simulationStarted'>,
    private readonly stations = MARKET_STATIONS,
  ) {
    this.movementDetector = new MarketMovementDetector(stations, 105);
    this.questInstanceId = mission.scene?.questInstanceId ?? simulation?.questInstanceId ?? randomUUID();
    this.contentSource = simulation?.contentSource ?? 'STATIC';
    this.track({
      eventCode: 'SHOP.SESSION_STARTED',
      microActionId: 'START_MARKET_SESSION',
      payload: {
        budgetAmount: mission.budget,
        marketContent: {
          sceneSnapshot: mission.scene,
          title: mission.title,
          description: mission.description,
          objectiveConstraints: mission.objectives.map((objective) => ({
            productId: objective.productId, quantity: objective.quantity,
            label: objective.label ?? `${this.product(objective.productId)?.name} ${this.product(objective.productId)?.detail}`,
            acceptedProductIds: getObjectiveProductIds(objective),
            salesUnit: this.product(objective.productId)?.salesUnit,
          })),
          availableProductIds: this.products.map((product) => product.id),
          initialStockPerSku: MARKET_INITIAL_STOCK,
          supportedOptions: MARKET_SUPPORT_OPTIONS,
        },
        objectiveCount: mission.objectives.length,
        objectives: mission.objectives.map(({ productId, quantity }) => {
          const product = this.product(productId);
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

  private get products() { return this.mission.scene?.products ?? marketProducts; }
  private product(id: string) { return getMarketProduct(id, this.products); }

  track(input: TrackInput) {
    if (this.closed && !input.finalContext) return;
    const payload = input.payload;
    const reading = input.eventCode === 'SHOP.MOVEMENT_SAMPLED' && typeof payload?.x === 'number' && typeof payload?.y === 'number'
      ? { time: Date.parse(input.occurredAt!), x: payload.x, y: payload.y,
        blocked: payload.blocked === true, controlMode: String(payload.controlMode) } : null;
    this.movementLogs.push(input, reading).forEach(event => this.record(event));
  }

  private record(input: TrackInput) {
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
        contentVersion: this.mission.catalogVersion ?? MARKET_CATALOG_VERSION,
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
        scenarioVariant: this.mission.scenarioId ?? 'CUSTOM',
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
        
      },
      accessibility: {
        audioEnabled: false,
        controllerMode: this.controlMode === 'accessibility' ? 'SWITCH' : 'TOUCH',
        instructionMode: 'TEXT',
        symbolSupport: true,
        textLevel: 'STANDARD',
      },

      payload: {
        type: 'SHOPPING',
        catalogVersion: this.mission.catalogVersion ?? MARKET_CATALOG_VERSION,
        scenarioId: this.mission.scenarioId ?? 'CUSTOM',
        scenarioVersion: this.mission.scenarioVersion ?? MARKET_SCENARIO_VERSION,
        thresholdRuleVersion: DETECTION_RULE_VERSION,
        ...input.payload,
        marketContent: { ...(input.payload?.marketContent as object ?? {}), sceneRef: this.questInstanceId, layoutVersion: this.mission.scene?.layoutVersion, seed: this.mission.scene?.seed,
          movementContext: { coordinateSpace: 'market-world', stations: this.stations, interactionRadius: 105,
            ...MOVEMENT_SAMPLING } },
      },
      presentation: {
        foregroundDurationMs: Math.max(0, occurredAtMs - this.startedAt - this.interruptionTimeMs),
        instructionContentId: this.mission.id,
        screenId: 'MARKET_SIMULATION',
      },
      simulation: {
        contentSource: this.contentSource,
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
      eventCode: 'SHOP.SHELF_OPENED',
      microActionId: `OPEN_SHELF_${station}`,
      payload: {
        stationId: station,
        marketContent: { displayedProducts: this.products.filter((product) => product.categoryId === station).map(
          ({ id, name, detail, price, salesUnit, attributes, initialStock }) => ({
            id, name, detail, price, salesUnit, attributes, remainingStock: initialStock - (this.latestCart[id] ?? 0),
          })),
        },
      },
      priority: target ? 'high' : 'normal',
    });
  }

  shelfClosed(
    station: Exclude<MarketTelemetryStation, 'checkout'>,
    cart: MarketCart,
    openedAt: number,
  ) {
    const targetItems = this.mission.objectives
      .filter(({ productId }) => this.product(productId)?.categoryId === station);
    const hasRemainingTarget = targetItems.some(
      (objective) => getObjectiveQuantity(cart, objective) < objective.quantity,
    );
    this.track({
      eventCode: 'SHOP.SHELF_CLOSED',
      microActionId: `CLOSE_SHELF_${station}`,
      payload: {
        durationMs: Math.max(0, Date.now() - openedAt),
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
    const objective = this.mission.objectives.find((item) => getObjectiveProductIds(item).includes(productId));
    const selectedForObjective = objective ? getObjectiveQuantity(cartAfter, objective) : after;
    const beforeForObjective = selectedForObjective - after + before;
    this.track({
      eventCode: 'SHOP.QUANTITY_CHANGED',
      microActionId: `${after > before ? 'ADD' : 'REMOVE'}_${productId}`,
      outcome: objective && selectedForObjective === objective.quantity ? 'SUCCESS' : undefined,
      payload: {
        cartTotalAmount: getMarketCartTotal(cartAfter, this.products),
        itemId: productId,
        marketContent: { item: this.product(productId), purchaseUnit: this.product(productId)?.salesUnit },
        quantityAfter: after,
        quantityBefore: before,
        requiredQuantity: objective?.quantity ?? 0,
        selectedQuantity: after,
      },
      priority: 'high',
    });
  }

  checkoutEntered(cart: MarketCart) {
    const missing = this.remainingObjectives(cart);
    this.track({
      eventCode: 'SHOP.CHECKOUT_ENTERED',
      microActionId: 'ENTER_CHECKOUT',
      payload: this.cartPayload(cart),
      priority: 'high',
    });
  }

  checkoutSubmitted(cart: MarketCart, _legacyEvaluation?: MarketEvaluation) {
    this.track({ eventCode: 'SHOP.CHECKOUT_SUBMITTED', microActionId: 'SUBMIT_CHECKOUT',
      payload: this.cartPayload(cart), priority: 'critical' });
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
    this.trackMovementEvents(this.movementDetector.stop(this.interruptionStartedAt, this.controlMode));
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

  async complete(cart: MarketCart, _legacyEvaluation?: MarketEvaluation) { await this.abort(cart); }

  async abort(cart: MarketCart) {
    if (this.closed) return;
    this.trackMovementEvents(this.movementDetector.finish(this.targetZoneIds()));
    this.closed = true;
    this.track({ eventCode: 'SHOP.SESSION_ENDED', microActionId: 'EXIT_MARKET',
      payload: this.cartPayload(cart), priority: 'critical',
      finalContext: { sessionEnd: { interruptionCount: this.interruptionCount,
        interruptionTimeMs: this.interruptionTimeMs, reason: 'USER_ABORTED' } } });
    this.clearTimers();
    await this.flushNow();
  }

  async flushConfirmed() {
    await this.flushNow();
    await assertBehaviorEventsAcknowledged(this.accessToken, this.sessionId, this.sequence);
  }

  async flushNow() {
    await this.persist();
    await flushBehaviorEventQueue(this.accessToken);
  }

  private trackMovementEvents(events: MarketMovementEventDraft[]) {
    const derivedOnly = new Set(['SHOP.TARGET_SHELF_APPROACHED', 'SHOP.WRONG_AISLE_ENTERED', 'SHOP.TARGET_PASSED', 'SHOP.OFF_TARGET_DWELL']);
    // Raw movement/proximity events remain. Do not publish additional target-based judgments.
    events.filter(event => !derivedOnly.has(event.eventCode)).forEach((event) => this.track({
      ...event,
      eventCode: event.eventCode === 'SHOP.TARGET_SHELF_REVISITED' ? 'SHOP.SHELF_REVISITED' : event.eventCode,
      priority: event.priority ?? 'normal',
    }));
  }

  private targetZoneIds() {
    const zones = this.mission.objectives
      .filter((objective) => getObjectiveQuantity(this.latestCart, objective) < objective.quantity)
      .map(({ productId }) => this.product(productId)?.categoryId)
      .filter((zone): zone is NonNullable<typeof zone> => zone !== undefined);
    return new Set<MarketTelemetryStation>(zones);
  }

  private latestCart: MarketCart = {};

  updateCart(cart: MarketCart) {
    this.latestCart = cart;
  }

  private remainingObjectives(cart: MarketCart) {
    return this.mission.objectives.filter(
      (objective) => getObjectiveQuantity(cart, objective) < objective.quantity,
    );
  }

  private cartPayload(cart: MarketCart) {
    const total = getMarketCartTotal(cart, this.products);
    return {
      cartItemCount: Object.values(cart).reduce((sum, quantity) => sum + quantity, 0),
      cartTotalAmount: total,
      remainingBudgetAmount: this.mission.budget - total,
      marketContent: { cart: { ...cart } },
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
    this.movementLogs.flush().forEach(event => this.record(event));
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
