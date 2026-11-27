import { marketLocationResponse } from './marketHelp';
import { normalizeMarketTraining, marketIncidentPlan, type MarketTrainingConfig } from './marketTraining';
import { buildMarketTrajectory } from './marketTrajectory';
import { MARKET_ENVIRONMENT_PLAYER_RADIUS, getMarketWrongWayGate, getMarketWrongWayRearm, createMarketEnvironment, isMarketEnvironmentBlocked, isNearMarketStation, MarketEnvironment, MarketEnvironmentConfig, MarketEnvironmentStationId, MarketCashierAvailability, MarketCheckoutId, MarketKioskId } from './marketEnvironment';
import { MarketCategoryId, marketCategories, marketProducts, MarketProduct, getMarketProduct } from './scenarios';
import { Point } from './prototypeWorld';
import type { MarketQuestTiming } from './marketQuestTime';
import { resolveMarketEnvironmentMovement } from './marketMovement';
import { normalizeMarketLearningConfig, type MarketLearningConfig, type MarketLearningState, type MarketStockoutState, type MarketUnavailableReason } from './marketLearning';
import { createMarketCheckoutReview, correctMarketCheckoutReview, evaluateMarketCheckoutReview, getMarketCartFingerprint,
  getMarketCheckoutReview, isStaffedCheckoutReviewReady, type MarketCheckoutReviewState } from './marketCheckoutReview';
import { applyMarketTilemapToConfig, type MarketTilemapV1 } from './marketTilemap';

export type MarketMatchRule = 'family' | 'exact';
export type MarketTaskObjectiveInput = { productId: string; quantity: number; match?: MarketMatchRule };
export type MarketTaskObjective = MarketTaskObjectiveInput & { id: string; match: MarketMatchRule; label: string; familyId: string; quantityUnit?: string };
export type MarketProvenance = { source: 'human' | 'synthetic'; participantId?: string; agentModel?: string; personaId?: string; personaVersion?: string; notes?: string };
export type MarketSessionConfig = {
  training?: Partial<MarketTrainingConfig>;
  seed: string | number;
  difficulty: MarketMatchRule;
  objectives: MarketTaskObjectiveInput[];
  stockPerProduct: number;
  alarmPenaltyPoints: number;
  cashierRequestPenaltyPoints: number;
  /** Separate from unpaid-goods alarms; old config JSON defaults to ten. */
  wrongWayPenaltyPoints: number;
  stockOverrides: Record<string, number>;
  learning?: Partial<MarketLearningConfig>;
  inventoryProductIds?: Partial<Record<MarketCategoryId, string[]>>;
  environment: Partial<MarketEnvironmentConfig>;
  provenance: MarketProvenance;
  /** Explicit clock makes seeded episodes reproducible; the UI supplies wall time. */
  startedAt: string;
  sessionId?: string;
};
export type MarketFeedback = { success: boolean; details?: string[] };
export type MarketRating = { difficulty: number; interest: number };
export type MarketCashierRequestFeedback = { accepted: boolean; message: string; checkoutIds: MarketCheckoutId[]; penaltyPoints: number };
export type MarketEpisodeEvent = { sequence: number; timestamp: string; type: string; payload: Record<string, unknown> };
export type MarketAction = (
  | { type: 'startTraining' | 'trainingTick' | 'endTraining' }
  | { type: 'finishShelfTask' }
  | { type: 'setPosition'; point: Point }
  | { type: 'move'; dx: number; dy: number }
  /** Bounded physical input: collision may stop or slide the player without rejecting the action. */
  | { type: 'moveInput'; dx: number; dy: number }
  | { type: 'interact'; station: MarketEnvironmentStationId }
  | { type: 'add' | 'remove' | 'requestReturn'; productId: string; quantity?: number }
  | { type: 'checkout'; checkoutId?: MarketCheckoutId }
  | { type: 'requestCashier'; /** @deprecated Accepted for old actors; the first checkout is always used. */ checkoutId?: MarketCheckoutId }
  | { type: 'askLocation'; objectiveId: string }
  | { type: 'checkStock'; productId: string }
  | { type: 'requestSubstitution'; productId: string }
  | { type: 'reportUnavailable'; reason: MarketUnavailableReason }
  | { type: 'submitKiosk'; scannedCart: Record<string, number> }
  | { type: 'expireTimeLimit'; timing: MarketQuestTiming }
  | { type: 'requestCheckoutCorrection'; productId: string; quantity: number }
  | { type: 'submit' | 'viewRequester' | 'retry' | 'giveUp' | 'skipRating' | 'closeStation' | 'viewCart' | 'viewCheckoutCart' | 'viewHelp' | 'closeView' }
  | { type: 'rate'; difficulty: number; interest: number }
) & { at?: string };
export type MarketSession = {
  schemaVersion: 1;
  id: string;
  config: MarketSessionConfig;
  environment: MarketEnvironment;
  objectives: MarketTaskObjective[];
  /** Twelve distinct display IDs, one SKU per slot (4 columns × 3 rows). */
  shelfSlots: Record<MarketCategoryId, string[]>;
  /** Total initial stock per SKU, independent of display position. */
  initialStock: Record<string, number>;
  /** Remaining stock, reduced by items currently in the basket. */
  stock: Record<string, number>;
  cart: Record<string, number>;
  playerPosition: Point;
  activeStation: MarketEnvironmentStationId | null;
  cashierAvailable: boolean;
  cashierAvailability: MarketCashierAvailability;
  selectedCheckoutId: MarketCheckoutId | null;
  selectedKioskId: MarketKioskId | null;
  checkoutReview: MarketCheckoutReviewState | null;
  learning: MarketLearningState;
  score: number;
  penaltyPoints: number;
  alarmCount: number;
  alarmArmed: boolean;
  wrongWayEntryCount: number;
  wrongWayEntryArmed: boolean;
  paid: boolean;
  phase: 'shopping' | 'checkout' | 'feedback' | 'finished';
  view: 'world' | 'cart' | 'help' | 'requester';
  attempts: number;
  feedback: MarketFeedback | null;
  outcome: 'success' | 'gave-up' | 'time-limit-expired' | null;
  ratings: MarketRating | null;
  ratingSkipped: boolean;
  lastActionError: string | null;
  events: MarketEpisodeEvent[];
};

export const DEFAULT_MARKET_SESSION_CONFIG: MarketSessionConfig = {
  seed: 'oneuldo-market-1', difficulty: 'family',
  objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 }, { productId: 'curry', quantity: 1 }],
  learning: normalizeMarketLearningConfig(),
  stockPerProduct: 6, alarmPenaltyPoints: 10, cashierRequestPenaltyPoints: 10, wrongWayPenaltyPoints: 10, stockOverrides: {}, environment: {}, provenance: { source: 'human' }, startedAt: '1970-01-01T00:00:00.000Z',
};

// Implementation below deliberately keeps the player observation separate from
// the research export: hidden evaluations belong only in a completed episode.

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function familyOf(product: MarketProduct) { return product.familyId ?? product.id; }
function labelOf(product: MarketProduct, match: MarketMatchRule) { return match === 'family' ? product.familyLabel ?? product.name : product.name; }
function integer(value: number, label: string, min = 0, max = 99) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}: ${min}~${max} 사이 정수여야 합니다.`);
}
function productOrThrow(id: string) {
  const product = getMarketProduct(id);
  if (!product) throw new Error(`등록되지 않은 상품입니다: ${id}`);
  return product;
}
function seededRandom(seed: string | number) {
  let state = 2166136261;
  for (const character of String(seed)) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(values: T[], random: () => number) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function normalizeConfig(input: Partial<MarketSessionConfig>): MarketSessionConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('게임 설정은 JSON 객체여야 합니다.');
  const knownFields = ['training', 'seed', 'difficulty', 'objectives', 'stockPerProduct', 'alarmPenaltyPoints', 'cashierRequestPenaltyPoints', 'wrongWayPenaltyPoints', 'stockOverrides', 'learning', 'inventoryProductIds', 'environment', 'provenance', 'startedAt', 'sessionId'];
  for (const key of Object.keys(input)) if (!knownFields.includes(key)) throw new Error(`지원하지 않는 게임 설정입니다: ${key}`);
  const config = clone({ ...DEFAULT_MARKET_SESSION_CONFIG, ...input,
    environment: { ...DEFAULT_MARKET_SESSION_CONFIG.environment, ...input.environment,
      // Legacy fixed-list callers address both staffed counters by their IDs.
      // Opt-in learning sessions retain the new seeded kiosk placement.
      ...(input.learning === undefined && input.environment?.kioskLane === undefined ? { kioskLane: 'none' as const } : {}) },
    learning: normalizeMarketLearningConfig(input.learning),
    training: normalizeMarketTraining(input.training),
    stockOverrides: { ...input.stockOverrides }, provenance: { ...DEFAULT_MARKET_SESSION_CONFIG.provenance, ...input.provenance },
  });
  if (!['string', 'number'].includes(typeof config.seed) || !String(config.seed).trim() || (typeof config.seed === 'number' && !Number.isFinite(config.seed))) throw new Error('seed가 올바르지 않습니다.');
  if (!['family', 'exact'].includes(config.difficulty)) throw new Error('difficulty는 family 또는 exact여야 합니다.');
  integer(config.stockPerProduct, '기본 재고', 1);
  integer(config.alarmPenaltyPoints, '출입 경보기 감점', 0, 100);
  integer(config.cashierRequestPenaltyPoints, '계산원 확인 감점', 0, 100);
  integer(config.wrongWayPenaltyPoints, '출구 역진입 감점', 0, 100);
  if (!Array.isArray(config.objectives) || config.objectives.length < 1 || config.objectives.length > 36) throw new Error('구매 목록은 1~36개여야 합니다.');
  for (const objective of config.objectives) {
    productOrThrow(objective.productId);
    integer(objective.quantity, '구매 수량', 1);
    if (objective.match !== undefined && objective.match !== 'family' && objective.match !== 'exact') throw new Error('구매 목록 판정 규칙이 올바르지 않습니다.');
  }
  for (const [id, count] of Object.entries(config.stockOverrides)) { productOrThrow(id); integer(count, '상품별 재고'); }
  if (config.inventoryProductIds && Object.keys(config.inventoryProductIds).some((key) => !marketCategories.some((category) => category.id === key))) throw new Error('진열 상품에 등록되지 않은 분류가 있습니다.');
  if (!Number.isFinite(Date.parse(config.startedAt))) throw new Error('startedAt는 ISO 날짜여야 합니다.');
  if (!['human', 'synthetic'].includes(config.provenance.source)) throw new Error('데이터 출처는 human 또는 synthetic이어야 합니다.');
  if (config.provenance.source === 'synthetic' && (!config.provenance.agentModel?.trim() || !config.provenance.personaId?.trim())) throw new Error('합성 데이터에는 agentModel과 personaId를 기록해야 합니다.');
  return config;
}

/** Configuration + seed fully determine layout, stock and objectives. No network or model is called. */
export function createMarketSession(input: Partial<MarketSessionConfig> = {}, environmentOverride?: MarketEnvironment): MarketSession {
  const config = normalizeConfig(input);
  if (environmentOverride && String(environmentOverride.seed) !== String(config.seed)) throw new Error('게임 seed와 전달된 환경의 seed가 다릅니다.');
  const environment = clone(environmentOverride ?? createMarketEnvironment({ ...config.environment, seed: config.seed }));
  config.environment = clone(environment.config);
  const objectives: MarketTaskObjective[] = config.objectives.map((objective, index) => {
    const product = productOrThrow(objective.productId);
    const match = objective.match ?? config.difficulty;
    return { ...objective, id: `objective-${index + 1}`, match, label: labelOf(product, match), familyId: familyOf(product) };
  });
  for (let i = 0; i < objectives.length; i++) for (let j = i + 1; j < objectives.length; j++) {
    const a = objectives[i]; const b = objectives[j];
    if (a.productId === b.productId || (a.familyId === b.familyId && (a.match === 'family' || b.match === 'family'))) {
      throw new Error('같은 상품 또는 겹치는 품목군의 구매 목록은 하나로 합쳐 주세요.');
    }
  }
  const learningConfig = normalizeMarketLearningConfig(config.learning);
  const stockoutObjective = learningConfig.stockoutEnabled ? (learningConfig.stockoutProductId
    ? objectives.find(o => o.productId === learningConfig.stockoutProductId) : objectives[0]) : undefined;
  if(learningConfig.stockoutEnabled && !stockoutObjective) throw new Error('품절 대상이 구매 목표에 없어요.');
  if (stockoutObjective) {
    // A generic family match must not silently bypass the need to ask the requester.
    stockoutObjective.match = 'exact';
    stockoutObjective.label = productOrThrow(stockoutObjective.productId).name;
  }
  const learning: MarketLearningState = {
    stockout: stockoutObjective ? {
      objectiveId: stockoutObjective.id, requestedProductId: stockoutObjective.productId,
      requestedQuantity: stockoutObjective.quantity, shelfVisited: false, staffChecked: false,
      status: 'unresolved', approvedProductId: null, resolutionReason: null,
    } : null,
    choiceTask: learningConfig.budgetChoiceEnabled
      ? { id: 'choice-drink', categoryId: 'drink', label: '내가 고른 음료', quantity: 1, budget: learningConfig.choiceBudget }
      : null,
    visitedCategoryIds: [],
  };
  const isAffordableChoice = (product: MarketProduct) => product.categoryId === 'drink'
    && product.price <= learningConfig.choiceBudget
    && (config.stockOverrides[product.id] ?? config.stockPerProduct) >= 1
    && !objectives.some(objective => matchesObjective(product.id, objective));
  const shelfSlots = {} as Record<MarketCategoryId, string[]>;
  const initialStock: Record<string, number> = {};
  for (const category of marketCategories) {
    const random = seededRandom(`${config.seed}:inventory-v2:${category.id}`);
    const catalog = marketProducts.filter((product) => product.categoryId === category.id);
    if (catalog.length < 24) throw new Error(`${category.label} 상품은 최소 24종이어야 합니다.`);
    const required = objectives.filter((objective) => productOrThrow(objective.productId).categoryId === category.id);
    const forced = config.inventoryProductIds?.[category.id];
    let selected: string[];
    if (forced) {
      if (!Array.isArray(forced) || ![9, 12].includes(forced.length) || new Set(forced).size !== forced.length || forced.some((id) => productOrThrow(id).categoryId !== category.id)) throw new Error(`${category.label} 진열 상품은 해당 분류의 서로 다른 12종이어야 합니다. 기존 9종 설정도 불러올 수 있습니다.`);
      selected = [...forced];
      if (selected.length === 9) {
        // Keep old research presets usable without reintroducing repeated display slots.
        // An invalid preset must not become solvable by accidentally adding its missing goal.
        for (const objective of required) {
          const supply = selected.reduce((sum, id) => sum + (matchesObjective(id, objective) ? config.stockOverrides[id] ?? config.stockPerProduct : 0), 0);
          if (objective.id !== stockoutObjective?.id && supply < objective.quantity) throw new Error(`${objective.label}의 재고가 구매 수량보다 적어 완수할 수 없습니다.`);
        }
        selected.push(...shuffle(catalog.filter(product => !selected.includes(product.id)), random).slice(0, 3).map(product => product.id));
        config.inventoryProductIds![category.id] = [...selected];
      }
    } else {
      const reserved = new Set(required.map((objective) => objective.productId));
      if (reserved.size > 12) throw new Error(`${category.label}의 필수 상품이 12종을 초과합니다.`);
      if (learning.choiceTask && category.id === learning.choiceTask.categoryId) {
        const candidate = shuffle(catalog.filter(isAffordableChoice), random)[0];
        if (!candidate || (reserved.size === 12 && !reserved.has(candidate.id))) throw new Error('선택 구매 예산 안에서 고를 음료 재고가 없습니다.');
        reserved.add(candidate.id);
      }
      // Include a close alternative beside a required SKU whenever there is room.
      for (const objective of required) {
        const alternate = shuffle(catalog.filter((product) => familyOf(product) === objective.familyId && !reserved.has(product.id)), random)[0];
        if (alternate && reserved.size < 12) reserved.add(alternate.id);
      }
      // Even categories without a task expose variants, rather than only unrelated products.
      if (reserved.size < 11) {
        const grouped = shuffle(catalog.filter((product) => catalog.some((other) => other.id !== product.id && familyOf(other) === familyOf(product))), random);
        const anchor = grouped[0];
        if (anchor) for (const product of grouped.filter((item) => familyOf(item) === familyOf(anchor)).slice(0, 2)) if (reserved.size < 12) reserved.add(product.id);
      }
      for (const product of shuffle(catalog, random)) { if (reserved.size >= 12) break; reserved.add(product.id); }
      selected = shuffle([...reserved], random);
    }
    shelfSlots[category.id] = [...selected];
    for (const id of selected) initialStock[id] = id === stockoutObjective?.productId ? 0 : config.stockOverrides[id] ?? config.stockPerProduct;
    if (learning.choiceTask && category.id === learning.choiceTask.categoryId && !selected.some(id => isAffordableChoice(productOrThrow(id)))) {
      throw new Error('진열 상품에 선택 구매 예산 안에서 고를 음료가 없습니다.');
    }
  }
  if (stockoutObjective && !(stockoutObjective.productId in initialStock)) throw new Error('품절을 확인할 목표 상품이 진열 목록에 있어야 합니다.');
  for (const objective of objectives) {
    const supply = Object.entries(initialStock).reduce((sum, [id, quantity]) => sum + (matchesObjective(id, objective) ? quantity : 0), 0);
    if (objective.id !== stockoutObjective?.id && supply < objective.quantity) throw new Error(`${objective.label}의 재고가 구매 수량보다 적어 완수할 수 없습니다.`);
  }
  const session: MarketSession = {
    schemaVersion: 1, id: config.sessionId ?? `market-${config.seed}-${Date.parse(config.startedAt)}`, config, environment, objectives,
    shelfSlots, initialStock, stock: { ...initialStock }, cart: {}, playerPosition: { ...environment.spawn }, activeStation: null,
    cashierAvailable: environment.checkout.cashierPresent,
    cashierAvailability: Object.fromEntries(environment.checkouts.map(checkout => [checkout.id, checkout.cashierPresent])) as MarketCashierAvailability,
    selectedCheckoutId: null, selectedKioskId: null, checkoutReview: null, learning, score: 100, penaltyPoints: 0, alarmCount: 0, alarmArmed: true, wrongWayEntryCount: 0, wrongWayEntryArmed: true, paid: false,
    phase: 'shopping', view: 'world', attempts: 0, feedback: null, outcome: null,
    ratings: null, ratingSkipped: false, lastActionError: null, events: [],
  };
  record(session, 'session_started', { config: clone(config), environment: clone(environment), objectives: clone(objectives), shelfSlots: clone(shelfSlots), initialStock: clone(initialStock), learning: clone(learning) });
  return session;
}

/** Shared game judgement; synthetic post-execution audits use this exact rule too. */
export function matchesObjective(productId: string, objective: MarketTaskObjective) {
  return objective.match === 'exact' ? productId === objective.productId : familyOf(productOrThrow(productId)) === objective.familyId;
}
/** Deliberately reveals the exception only after the player has looked at that shelf. */
export function getStockoutStatus(session: MarketSession): MarketStockoutState | null {
  return session.learning.stockout?.shelfVisited ? clone(session.learning.stockout) : null;
}

function compatibleSubstitutions(session: MarketSession): MarketProduct[] {
  const task = session.learning.stockout;
  if (!task) return [];
  const original = productOrThrow(task.requestedProductId);
  return session.shelfSlots[original.categoryId].map(productOrThrow).filter(product =>
    product.id !== original.id && familyOf(product) === familyOf(original)
    // Stock includes anything already held by this player, which can still be approved.
    && (session.stock[product.id] ?? 0) + (session.cart[product.id] ?? 0) >= task.requestedQuantity
    && !session.objectives.some(objective => objective.id !== task.objectiveId && matchesObjective(product.id, objective)));
}

/** Candidate facts come from the staff stock check, never from a hidden cart evaluation. */
export function getAvailableSubstitutions(session: MarketSession): MarketProduct[] {
  const task = session.learning.stockout;
  if (!task?.staffChecked || task.status !== 'unresolved' || !normalizeMarketLearningConfig(session.config.learning).allowSubstitution) return [];
  return clone(compatibleSubstitutions(session));
}

function isChoiceProduct(session: MarketSession, productId: string) {
  return !!session.learning.choiceTask && productOrThrow(productId).categoryId === session.learning.choiceTask.categoryId
    && !session.objectives.some(objective => matchesObjective(productId, objective));
}

/**
 * Read-only list check shown to the player before AI analysis (AI 검토 장보기의 결과 화면).
 * It records no event and changes no session state, so behaviour logs and AI analysis inputs stay identical.
 * Substitutions approved by the requester and items reported unavailable are already reflected in the objectives.
 */
export function getMarketPurchaseVerdict(session: MarketSession): { success: boolean; details: string[] } {
  const result = evaluate(session);
  return { success: result.success, details: [...(result.details ?? [])] };
}

function evaluate(session: MarketSession): MarketFeedback {
  const details: string[] = [];
  const exception = session.learning.stockout;
  if (exception?.status === 'unresolved') details.push(productOrThrow(exception.requestedProductId).name + '의 재고를 직원에게 확인하고, 부탁한 분에게 대체 구매나 못 산 이유를 알려 주세요.');
  for (const objective of session.objectives) {
    if (objective.id === exception?.objectiveId && exception.status === 'unresolved') continue;
    const count = Object.entries(session.cart).reduce((sum, [id, quantity]) => sum + (matchesObjective(id, objective) ? quantity : 0), 0);
    if (count !== objective.quantity) details.push(`${objective.label}: 필요한 수량은 ${objective.quantity}개, 담은 수량은 ${count}개예요.`);
  }
  for (const [id, quantity] of Object.entries(session.cart)) {
    if (quantity > 0 && !session.objectives.some((objective) => matchesObjective(id, objective)) && !isChoiceProduct(session, id)) details.push(`${productOrThrow(id).name} ${quantity}개는 구매 목록에 없어요.`);
  }
  const choice = session.learning.choiceTask;
  if (choice) {
    const chosen = Object.entries(session.cart).filter(([id]) => isChoiceProduct(session, id));
    const count = chosen.reduce((sum, [, quantity]) => sum + quantity, 0);
    const total = chosen.reduce((sum, [id, quantity]) => sum + productOrThrow(id).price * quantity, 0);
    if (count !== choice.quantity) details.push('직접 고르는 음료는 ' + choice.quantity + '개예요. 담은 수량은 ' + count + '개예요.');
    if (total > choice.budget) details.push('직접 고르는 음료의 예산은 ' + choice.budget.toLocaleString('ko-KR') + '원이에요. 가격표를 보고 다시 골라 주세요.');
  }
  return { success: details.length === 0, details };
}
function record(session: MarketSession, type: string, payload: Record<string, unknown>, at?: string) {
  const previous = session.events.at(-1)?.timestamp ?? session.config.startedAt;
  const timestamp = at && Number.isFinite(Date.parse(at)) && Date.parse(at) >= Date.parse(previous)
    ? new Date(at).toISOString() : new Date(Date.parse(previous) + (session.events.length ? 1 : 0)).toISOString();
  session.events.push({ sequence: session.events.length, timestamp, type, payload });
}
function recordShelfClosed(session: MarketSession, at?: string, station = session.activeStation) {
  if (marketCategories.some(category => category.id === station)) {
    record(session, 'station_closed', { station, playerPosition: clone(session.playerPosition) }, at);
  }
}
function ensureCheckoutReview(session: MarketSession, at?: string) {
  if (!isStaffedCheckoutReviewReady(session)) return;
  if (session.checkoutReview?.cartFingerprint === getMarketCartFingerprint(session.cart)) return;
  session.checkoutReview = createMarketCheckoutReview(session.config.seed, session.cart,
    normalizeMarketLearningConfig(session.config.learning).checkoutReviewMode);
  record(session, 'checkout_bill_generated', { origin: 'system-cashier', checkoutId: session.selectedCheckoutId,
    cart: clone(session.cart), review: clone(session.checkoutReview) }, at);
}
function reject(session: MarketSession, action: MarketAction | null | undefined, reason: string) {
  session.lastActionError = reason;
  record(session, 'action_rejected', { action: clone(action ?? null), reason }, action?.at);
  return session;
}
function pointIsFree(session: MarketSession, point: Point) {
  return !isMarketEnvironmentBlocked(session.environment, point, session.cashierAvailability);
}

function isConstructionBlocked(session: MarketSession, point: Point | undefined) {
  if (!point) return false;
  const radius = MARKET_ENVIRONMENT_PLAYER_RADIUS;
  return session.environment.constructionZones.some(({ rect }) => point.x + radius > rect.x && point.x - radius < rect.x + rect.width
    && point.y + radius > rect.y && point.y - radius < rect.y + rect.height);
}

function soundEntranceAlarm(session: MarketSession, trigger: 'boundary-crossed', at?: string, gateId = 'entrance') {
  if (!session.alarmArmed) return;
  session.alarmArmed = false;
  if (session.paid || !Object.values(session.cart).some(quantity => quantity > 0)) return;
  const delta = Math.min(session.score, session.config.alarmPenaltyPoints);
  session.score -= delta;
  session.penaltyPoints += delta;
  session.alarmCount += 1;
  // Keep the legacy event name for existing episode readers; gateId identifies every exit.
  record(session, 'entrance_alarm', { trigger, gateId, delta: delta ? -delta : 0, configuredPenalty: session.config.alarmPenaltyPoints,
    score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount,
    playerPosition: clone(session.playerPosition), cart: clone(session.cart) }, at);
}

function checkWrongWayEntry(session: MarketSession, previous: Point, next: Point, at?: string) {
  const exit = session.environment.alarmGates.find(gate => gate.id === 'exit');
  if (!exit) return;
  if ((next[exit.axis] - getMarketWrongWayRearm(exit)) * exit.outward >= 0) session.wrongWayEntryArmed = true;
  if (!session.wrongWayEntryArmed || !getMarketWrongWayGate(session.environment, previous, next)) return;
  session.wrongWayEntryArmed = false;
  const delta = Math.min(session.score, session.config.wrongWayPenaltyPoints);
  session.score -= delta;
  session.penaltyPoints += delta;
  session.wrongWayEntryCount += 1;
  const message = session.environment.config.entranceConstruction
    ? '안쪽 입구를 이용해 주세요.' : '입구를 이용해 주세요.';
  record(session, 'wrong_way_entry', { gateId: exit.id, trigger: 'inward-boundary-crossed',
    delta: delta ? -delta : 0, configuredPenalty: session.config.wrongWayPenaltyPoints, message,
    score: session.score, penaltyPoints: session.penaltyPoints, wrongWayEntryCount: session.wrongWayEntryCount,
    playerPosition: clone(session.playerPosition), basketQuantity: Object.values(session.cart).reduce((sum, count) => sum + count, 0) }, at);
}

function checkEntranceCrossing(session: MarketSession, previous: Point, next: Point, at?: string) {
  // Rearm only after a real return onto the sales floor, not while moving around the lobby/corridor.
  if (session.environment.alarmGates.every(gate => (next[gate.axis] - gate.rearm) * gate.outward <= 0)) session.alarmArmed = true;
  for (const alarm of session.environment.alarmGates) {
    const before = previous[alarm.axis]; const after = next[alarm.axis];
    if ((before - alarm.boundary) * alarm.outward >= 0 || (after - alarm.boundary) * alarm.outward < 0) continue;
    const fraction = (alarm.boundary - before) / (after - before);
    const otherAxis = alarm.axis === 'x' ? 'y' : 'x';
    const crossing = previous[otherAxis] + (next[otherAxis] - previous[otherAxis]) * fraction;
    const start = alarm.gate[otherAxis];
    const length = alarm.axis === 'x' ? alarm.gate.height : alarm.gate.width;
    if (crossing >= start && crossing <= start + length) soundEntranceAlarm(session, 'boundary-crossed', at, alarm.id);
  }
}

/** setPosition is a trusted renderer synchronization action. Agents must use the adapter's bounded move action. */
export function applyMarketAction(current: MarketSession, action: MarketAction): MarketSession {
  const session = clone(current);
  session.lastActionError = null;
  if (!action || typeof action.type !== 'string') return reject(session, action, '알 수 없는 행동이에요.');
  if (session.phase === 'finished' && !['rate', 'skipRating'].includes(action.type)) return reject(session, action, '이미 종료된 게임이에요.');
  if (action.type === 'expireTimeLimit') {
    recordShelfClosed(session, action.at);
    session.phase = 'finished'; session.outcome = 'time-limit-expired'; session.activeStation = null; session.view = 'world';
    record(session, 'time_limit_expired', { timing: action.timing, cart: clone(session.cart), objectives: clone(session.objectives) }, action.at);
    record(session, 'session_finished', { outcome: session.outcome, attempts: session.attempts, cart: clone(session.cart),
      reason: 'time_limit_expired', timing: action.timing, score: session.score, penaltyPoints: session.penaltyPoints,
      alarmCount: session.alarmCount, wrongWayEntryCount: session.wrongWayEntryCount, paid: session.paid }, action.at);
    return session;
  }
  if (action.type === 'giveUp') {
    recordShelfClosed(session, action.at);
    session.phase = 'finished'; session.outcome = 'gave-up'; session.activeStation = null; session.view = 'world';
    record(session, 'session_finished', { outcome: session.outcome, attempts: session.attempts, cart: clone(session.cart), reason: 'player_gave_up', score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, wrongWayEntryCount: session.wrongWayEntryCount, paid: session.paid }, action.at);
    return session;
  }
  if (action.type === 'rate' || action.type === 'skipRating') {
    if (session.phase !== 'finished') return reject(session, action, '게임 종료 후 평가할 수 있어요.');
    if (action.type === 'rate') {
      if (![action.difficulty, action.interest].every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) return reject(session, action, '별점은 각각 1~5점으로 선택해 주세요.');
      session.ratings = { difficulty: action.difficulty, interest: action.interest }; session.ratingSkipped = false;
    } else { session.ratings = null; session.ratingSkipped = true; }
    record(session, action.type === 'rate' ? 'ratings_submitted' : 'ratings_skipped', { ratings: session.ratings }, action.at);
    return session;
  }
  if (action.type === 'startTraining') {
    if (session.events.some(e=>e.type==='training_started')) return session;
    record(session,'training_started',{point:clone(session.playerPosition)},action.at); return session;
  }
  if(action.type==='endTraining'){
    if(!session.events.some(e=>e.type==='training_ended'))record(session,'training_ended',{point:clone(session.playerPosition)},action.at);
    return session;
  }
  if (action.type === 'trainingTick') {
    if (session.phase !== 'shopping' && session.phase !== 'checkout') return session;
    if(session.events.some(e=>e.type==='training_ended'))return session;
    const start = session.events.find(e=>e.type==='training_started')?.timestamp ?? session.config.startedAt;
    const seconds = Math.max(0,(Date.parse(action.at ?? new Date().toISOString())-Date.parse(start))/1000);
    for(const incident of marketIncidentPlan(session.environment, session.config.training)) {
      if(seconds>=incident.elapsedSeconds && !session.events.some(e=>e.type==='incident_started'&&e.payload.id===incident.id))
        record(session,'incident_started',{...incident,actualElapsedSeconds:seconds},action.at);
    }
    return session;
  }
  if (action.type === 'finishShelfTask') {
    if (session.phase!=='shopping'||session.activeStation||session.view!=='world'||normalizeMarketTraining(session.config.training).task!=='shelf-finder')
      return reject(session,action,'매대 찾기 과제에서 열린 화면을 닫은 뒤 완료해 주세요.');
    const needed=[...new Set(session.objectives.map(o=>productOrThrow(o.productId).categoryId))];
    if(!needed.every(id=>session.learning.visitedCategoryIds.includes(id)))return reject(session,action,'목록에 있는 물건의 매대를 모두 살펴봐 주세요.');
    session.phase='finished';session.outcome='success';session.feedback={success:true};session.attempts++;
    record(session,'session_finished',{outcome:session.outcome,task:'shelf-finder',visitedCategories:needed},action.at);return session;
  }
  if (action.type === 'moveInput') {
    if (session.phase === 'feedback') return reject(session, action, '다시 시도하거나 그만하기를 선택해 주세요.');
    if (session.view !== 'world') return reject(session, action, '열린 화면을 닫고 이동해 주세요.');
    if (session.phase !== 'shopping' || session.activeStation) return reject(session, action, '대화나 진열대 화면을 닫고 이동해 주세요.');
    const distance = Math.hypot(action.dx, action.dy);
    if (!Number.isFinite(action.dx) || !Number.isFinite(action.dy) || !Number.isFinite(distance) || distance > 32) {
      return reject(session, action, '한 번에 최대 32픽셀 이동할 수 있어요.');
    }
    const previousPosition = session.playerPosition;
    const movement = resolveMarketEnvironmentMovement(session.environment, previousPosition,
      { x: action.dx, y: action.dy }, session.cashierAvailability);
    session.playerPosition = movement.position;
    checkEntranceCrossing(session, previousPosition, movement.position, action.at);
    checkWrongWayEntry(session, previousPosition, movement.position, action.at);
    record(session, 'player_moved', { point: clone(movement.position), input: 'bounded-joystick-input',
      requestedDelta: movement.requestedDelta, actualDelta: movement.actualDelta,
      requestedDistancePx: movement.requestedDistancePx, movedDistancePx: movement.movedDistancePx,
      outcome: movement.outcome }, action.at);
    return session;
  }
  if (action.type === 'setPosition' || action.type === 'move') {
    if (session.phase === 'feedback') return reject(session, action, '다시 시도하거나 그만하기를 선택해 주세요.');
    if (action.type === 'move' && session.view !== 'world') return reject(session, action, '열린 화면을 닫고 이동해 주세요.');
    if (action.type === 'move' && (session.phase !== 'shopping' || session.activeStation)) return reject(session, action, '대화나 진열대 화면을 닫고 이동해 주세요.');
    const point = action.type === 'setPosition' ? action.point : { x: session.playerPosition.x + action.dx, y: session.playerPosition.y + action.dy };
    if (action.type === 'move') {
      const distance = Math.hypot(action.dx, action.dy);
      if (!Number.isFinite(distance) || distance > 32) return reject(session, action, '한 번에 최대 32픽셀 이동할 수 있어요.');
      for (let t = 0; t <= Math.max(1, Math.ceil(distance / 4)); t++) {
        const fraction = t / Math.max(1, Math.ceil(distance / 4));
        const step = { x: session.playerPosition.x + action.dx * fraction, y: session.playerPosition.y + action.dy * fraction };
        if (!pointIsFree(session, step)) return reject(session, action, isConstructionBlocked(session, step) ? '안쪽 입구를 이용해 주세요.' : '장애물이 있어 이동할 수 없어요.');
      }
    }
    if (!point || !pointIsFree(session, point)) return reject(session, action, isConstructionBlocked(session, point) ? '안쪽 입구를 이용해 주세요.' : '이동할 수 없는 위치예요.');
    const previousPosition = session.playerPosition;
    session.playerPosition = { ...point };
    checkEntranceCrossing(session, previousPosition, point, action.at);
    checkWrongWayEntry(session, previousPosition, point, action.at);
    if (session.activeStation && !isNearMarketStation(session.environment, session.activeStation, point, undefined, session.cashierAvailability)) { recordShelfClosed(session, action.at); session.activeStation = null; if (session.phase === 'checkout') session.phase = 'shopping'; }
    record(session, 'player_moved', { point: clone(point), input: action.type === 'move' ? 'bounded-agent-step' : 'trusted-renderer' }, action.at);
    return session;
  }
  if (action.type === 'retry') {
    if (session.phase !== 'feedback') return reject(session, action, '구매 결과 확인 후 다시 시도할 수 있어요.');
    session.phase = 'shopping'; session.feedback = null; session.activeStation = null; session.view = 'world';
    record(session, 'retry_started', { previousAttempts: session.attempts }, action.at);
    return session;
  }
  if (session.phase === 'feedback') return reject(session, action, '다시 시도하거나 그만하기를 선택해 주세요.');
  if (action.type === 'viewRequester') {
    if (session.phase !== 'shopping') return reject(session, action, '장보는 동안 부탁한 분에게 연락할 수 있어요.');
    recordShelfClosed(session, action.at);
    session.view = 'requester'; session.activeStation = null;
    record(session, 'requester_contacted', {}, action.at);
    return session;
  }
  if (action.type === 'viewCart' || action.type === 'viewHelp' || action.type === 'closeView') {
    session.view = action.type === 'viewCart' ? 'cart' : action.type === 'viewHelp' ? 'help' : 'world';
    record(session, action.type === 'viewCart' ? 'cart_viewed' : action.type === 'viewHelp' ? 'help_viewed' : 'view_closed', action.type === 'viewCart' ? { cart: clone(session.cart) } : {}, action.at);
    return session;
  }
  if (action.type === 'closeStation') {
    const station = session.activeStation;
    session.activeStation = null; session.phase = 'shopping'; session.view = 'world';
    if (station) record(session, 'station_closed', { station, playerPosition: clone(session.playerPosition) }, action.at);
    return session;
  }
  if (action.type === 'interact' || action.type === 'checkout') {
    if (session.view !== 'world') return reject(session, action, '열린 화면을 닫고 다가가 주세요.');
    const station = action.type === 'interact' ? action.station : action.checkoutId ?? 'checkout';
    if (station === 'entrance' && session.environment.config.entranceConstruction) return reject(session, action, '안쪽 입구를 이용해 주세요.');
    if (!isNearMarketStation(session.environment, station, session.playerPosition, undefined, session.cashierAvailability)) return reject(session, action, '가까이 다가간 뒤 선택해 주세요.');
    const previousStation = session.activeStation;
    session.activeStation = station;
    const kiosk = session.environment.kiosks?.find(item => item.id === station);
    if (kiosk) {
      session.phase = 'checkout'; session.selectedKioskId = kiosk.id;
      session.selectedCheckoutId = kiosk.laneId; session.cashierAvailable = false;
    } else if (station === 'checkout' || station === 'checkout-2') {
      if (session.environment.checkouts.find(counter => counter.id === station)?.kind === 'kiosk') {
        session.activeStation = null;
        return reject(session, action, '무인 계산대의 키오스크를 선택해 주세요.');
      }
      session.selectedKioskId = null;
      session.phase = 'checkout'; session.selectedCheckoutId = station;
      session.cashierAvailable = session.cashierAvailability[station];
    }
    else session.phase = 'shopping';
    if (previousStation !== station) recordShelfClosed(session, action.at, previousStation);
    record(session, 'station_interacted', { station, playerPosition: clone(session.playerPosition) }, action.at);
    ensureCheckoutReview(session, action.at);
    const category = marketCategories.find(item => item.id === station);
    if (category && !session.learning.visitedCategoryIds.includes(category.id)) session.learning.visitedCategoryIds.push(category.id);
    const stockout = session.learning.stockout;
    if (category && stockout && !stockout.shelfVisited && session.shelfSlots[category.id].includes(stockout.requestedProductId)) {
      stockout.shelfVisited = true;
      record(session, 'stockout_shelf_visited', { objectiveId: stockout.objectiveId, productId: stockout.requestedProductId, categoryId: category.id }, action.at);
    }
    if (station === 'entrance' || station === 'exit') session.activeStation = null;
    if (station === 'common-door') {
      session.phase = 'finished'; session.outcome = 'gave-up'; session.activeStation = null; session.view = 'world';
      record(session, 'session_finished', { outcome: session.outcome, attempts: session.attempts, cart: clone(session.cart), reason: 'player_left_market', station,
        score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, wrongWayEntryCount: session.wrongWayEntryCount, paid: session.paid }, action.at);
    }
    return session;
  }
  if (action.type === 'askLocation' || action.type === 'checkStock') {
    const station = session.activeStation;
    if (session.phase !== 'shopping' || session.view !== 'world' || !station?.startsWith('staff:')
      || !isNearMarketStation(session.environment, station, session.playerPosition, undefined, session.cashierAvailability)) {
      return reject(session, action, '매장 직원에게 다가가 대화를 연 뒤 물어봐 주세요.');
    }
    if (action.type === 'askLocation') {
      const objective = session.objectives.find(item => item.id === action.objectiveId);
      const choice = session.learning.choiceTask?.id === action.objectiveId ? session.learning.choiceTask : null;
      if (!objective && !choice) return reject(session, action, '현재 부탁받은 물품의 위치를 물어봐 주세요.');
      const categoryId = objective ? productOrThrow(objective.productId).categoryId : choice!.categoryId;
      const category = marketCategories.find(item => item.id === categoryId)!;
      record(session, 'product_location_requested', { staffStation: station, objectiveId: action.objectiveId,
        categoryId, message: marketLocationResponse(session.environment, categoryId) }, action.at);
      return session;
    }
    const task = session.learning.stockout;
    if (!task || task.requestedProductId !== action.productId || task.status !== 'unresolved') return reject(session, action, '확인이 필요한 품절 상품을 골라 주세요.');
    if (!task.shelfVisited) return reject(session, action, '먼저 그 상품이 있는 진열대를 살펴봐 주세요.');
    if (session.initialStock[action.productId] !== 0) return reject(session, action, '이 상품은 품절 확인 대상이 아니에요.');
    task.staffChecked = true;
    record(session, 'stock_checked', { staffStation: station, objectiveId: task.objectiveId, productId: action.productId,
      inStock: false, substituteProductIds: compatibleSubstitutions(session).map(product => product.id),
      message: productOrThrow(action.productId).name + '는 오늘 재고가 없어요.' }, action.at);
    return session;
  }
  if (action.type === 'requestSubstitution' || action.type === 'reportUnavailable') {
    if (session.phase !== 'shopping' || session.view !== 'requester') return reject(session, action, '부탁한 분과의 연락 화면에서 이야기해 주세요.');
    const task = session.learning.stockout;
    if (!task?.staffChecked || task.status !== 'unresolved') return reject(session, action, '먼저 진열대를 살펴보고 직원에게 품절인지 확인해 주세요.');
    const policy = normalizeMarketLearningConfig(session.config.learning);
    if (action.type === 'requestSubstitution') {
      const product = getMarketProduct(action.productId);
      if (!product || !compatibleSubstitutions(session).some(item => item.id === product.id)) return reject(session, action, '직원이 재고를 확인한 같은 종류의 대체 상품을 골라 주세요.');
      if (!policy.allowSubstitution) {
        record(session, 'substitution_declined', { objectiveId: task.objectiveId, productId: action.productId,
          reason: 'replacement-not-allowed', message: '이번에는 원래 부탁한 상품이 필요해요. 못 산 이유를 알려 주세요.' }, action.at);
        return session;
      }
      const objective = session.objectives.find(item => item.id === task.objectiveId)!;
      const before = clone(objective);
      Object.assign(objective, { productId: product.id, familyId: familyOf(product), label: product.name, match: 'exact' });
      task.status = 'replacement-approved'; task.approvedProductId = product.id; task.resolutionReason = 'requester-approved-substitute';
      record(session, 'substitution_approved', { originalObjective: before, approvedObjective: clone(objective),
        reason: task.resolutionReason, message: product.name + ' ' + objective.quantity + '개로 바꿔서 사 와 주세요.' }, action.at);
      return session;
    }
    const validReason = action.reason === 'replacement-not-allowed' ? !policy.allowSubstitution
      : action.reason === 'no-substitute-in-stock' && policy.allowSubstitution && compatibleSubstitutions(session).length === 0;
    if (!validReason) return reject(session, action, '직원에게 확인한 재고와 부탁한 분의 요청에 맞는 이유를 알려 주세요.');
    const removed = session.objectives.find(item => item.id === task.objectiveId)!;
    session.objectives = session.objectives.filter(item => item.id !== task.objectiveId);
    task.status = 'waived'; task.resolutionReason = action.reason;
    record(session, 'unavailable_reported', { objectiveId: task.objectiveId, removedObjective: clone(removed),
      productId: task.requestedProductId, reason: action.reason,
      message: '못 산 이유를 알려 줘서 고마워요. ' + removed.label + '는 이번 목록에서 빼도 괜찮아요.' }, action.at);
    return session;
  }
  if (action.type === 'requestCashier') {
    const staffStation = session.activeStation;
    if (session.phase !== 'shopping' || session.view !== 'world' || !staffStation?.startsWith('staff:') || !isNearMarketStation(session.environment, staffStation, session.playerPosition, undefined, session.cashierAvailability)) return reject(session, action, '종업원에게 다가가 대화를 연 뒤 계산을 요청해 주세요.');
    if (action.checkoutId !== undefined && !session.environment.checkouts.some(checkout => checkout.id === action.checkoutId)) return reject(session, action, '등록되지 않은 계산대예요.');
    const legacyRequest = action.checkoutId === undefined ? {} : { legacyRequestedCheckoutId: action.checkoutId };
    const availableCheckoutIds = session.environment.checkouts.filter(checkout => checkout.kind !== 'kiosk' && session.cashierAvailability[checkout.id]).map(checkout => checkout.id);
    if (availableCheckoutIds.length > 0) {
      const deduction = Math.min(session.score, session.config.cashierRequestPenaltyPoints);
      session.score -= deduction;
      session.penaltyPoints += deduction;
      const counters = availableCheckoutIds.map(id => id === 'checkout' ? '1번' : '2번').join(' 또는 ');
      const message = '이미 ' + counters + ' 계산대에 계산원이 있어요. 해당 계산대를 이용해 주세요.';
      // A valid but unnecessary request is a staff response, not an action error.
      record(session, 'cashier_request_declined', { reason: 'cashier-already-available', staffStation, availableCheckoutIds,
        requestedPenaltyPoints: session.config.cashierRequestPenaltyPoints, delta: deduction ? -deduction : 0,
        score: session.score, penaltyPoints: session.penaltyPoints, message, ...legacyRequest, playerPosition: clone(session.playerPosition) }, action.at);
      return session;
    }
    // One request recruits one attendant only when the whole checkout area is unstaffed.
    const checkoutId = session.environment.checkouts.find(checkout => checkout.kind !== 'kiosk')?.id;
    if (!checkoutId) return reject(session, action, '이 매장에는 유인 계산대가 없어요. 키오스크를 이용해 주세요.');
    session.cashierAvailability[checkoutId] = true;
    session.selectedCheckoutId = checkoutId;
    session.cashierAvailable = true;
    record(session, 'cashier_requested', { staffStation, checkoutId, ...legacyRequest,
      message: (checkoutId === 'checkout' ? '1번' : '2번') + ' 계산대로 와 주세요. 계산을 도와드릴게요.', playerPosition: clone(session.playerPosition) }, action.at);
    return session;
  }
  if (action.type === 'add' || action.type === 'remove' || action.type === 'requestReturn') {
    const product = getMarketProduct(action.productId);
    const quantity = action.quantity ?? 1;
    if (!product || !(product.id in session.initialStock)) return reject(session, action, '이번 게임에 진열되지 않은 상품이에요.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return reject(session, action, '수량은 1~99개로 선택해 주세요.');
    if (action.type === 'add') {
      // The shelf's inline basket can stay expanded while the player picks a product.
      // A standalone cart has no active shelf and cannot grant remote shelf access.
      if (session.phase !== 'shopping' || session.view === 'help' || session.activeStation !== product.categoryId || !isNearMarketStation(session.environment, product.categoryId, session.playerPosition, undefined, session.cashierAvailability)) return reject(session, action, '해당 진열대에서 상품을 담아 주세요.');
      if (session.stock[product.id] < quantity) return reject(session, action, '진열대에 남은 수량이 부족해요.');
      session.stock[product.id] -= quantity; session.cart[product.id] = (session.cart[product.id] ?? 0) + quantity;
    } else {
      if (action.type === 'requestReturn') {
        const staffStation = session.activeStation;
        if (session.phase !== 'shopping' || session.view !== 'world' || !staffStation?.startsWith('staff:') || !isNearMarketStation(session.environment, staffStation, session.playerPosition, undefined, session.cashierAvailability)) {
          return reject(session, action, '종업원에게 다가가 대화를 연 뒤 물건을 제자리에 놓는 도움을 요청해 주세요.');
        }
      } else if (session.phase !== 'shopping' || session.view === 'help' || session.activeStation !== product.categoryId || !isNearMarketStation(session.environment, product.categoryId, session.playerPosition, undefined, session.cashierAvailability)) {
        return reject(session, action, '해당 상품의 진열대로 돌아가 내려놓거나 종업원에게 도움을 요청해 주세요.');
      }
      if ((session.cart[product.id] ?? 0) < quantity) return reject(session, action, '장바구니에 담긴 수량보다 많이 뺄 수 없어요.');
      if (action.type === 'requestReturn') record(session, 'return_help_requested', {
        staffStation: session.activeStation, categoryId: product.categoryId, productId: product.id, quantity,
        playerPosition: clone(session.playerPosition),
      }, action.at);
      session.cart[product.id] -= quantity; session.stock[product.id] += quantity;
      if (session.cart[product.id] === 0) delete session.cart[product.id];
    }
    record(session, 'cart_changed', {
      operation: action.type === 'add' ? 'add' : 'remove', method: action.type === 'requestReturn' ? 'employee' : 'shelf',
      ...(action.type === 'requestReturn' ? { staffStation: session.activeStation } : {}),
      categoryId: product.categoryId, productId: product.id, productName: product.name, quantity,
      playerPosition: clone(session.playerPosition), cart: clone(session.cart), stock: clone(session.stock),
    }, action.at);
    // A receipt is tied to the basket, never to the counter or number of retries.
    // Editing the basket invalidates both the old bill and its staff response.
    if (session.checkoutReview && session.checkoutReview.cartFingerprint !== getMarketCartFingerprint(session.cart)) {
      record(session, 'checkout_bill_invalidated', { origin: 'system-cashier', reason: 'cart-changed',
        previousFingerprint: session.checkoutReview.cartFingerprint, cart: clone(session.cart) }, action.at);
      session.checkoutReview = null;
    }
    return session;
  }
  if (action.type === 'viewCheckoutCart') {
    if (!isStaffedCheckoutReviewReady(session)) return reject(session, action, '계산원이 있는 계산대에서 장바구니를 확인해 주세요.');
    record(session, 'checkout_cart_viewed', { origin: 'system-cashier', triggeredBy: 'player',
      checkoutId: session.selectedCheckoutId, cart: clone(session.cart) }, action.at);
    return session;
  }
  if (action.type === 'requestCheckoutCorrection') {
    if (!isStaffedCheckoutReviewReady(session)) return reject(session, action, '계산원이 있는 계산대에서 계산 내역을 확인해 주세요.');
    if (typeof action.productId !== 'string' || !getMarketProduct(action.productId)
      || !Number.isInteger(action.quantity) || action.quantity < 1 || action.quantity > 99) {
      return reject(session, action, '확인할 상품과 수량을 1~99개로 알려 주세요.');
    }
    ensureCheckoutReview(session, action.at);
    const result = correctMarketCheckoutReview(session.checkoutReview!, session.cart, action.productId, action.quantity);
    record(session, 'checkout_correction_requested', { origin: 'system-cashier', triggeredBy: 'player',
      checkoutId: session.selectedCheckoutId, productId: action.productId, claimedQuantity: action.quantity,
      previousChargedQuantity: session.checkoutReview!.chargedCart[action.productId] ?? 0 }, action.at);
    session.checkoutReview = result.review;
    record(session, result.corrected ? 'checkout_bill_corrected' : 'checkout_bill_rechecked', {
      origin: 'system-cashier', checkoutId: session.selectedCheckoutId, productId: action.productId,
      claimedQuantity: action.quantity, claimMatched: result.claimMatched, corrected: result.corrected,
      chargedCart: clone(result.review.chargedCart), message: result.review.response,
    }, action.at);
    return session;
  }
  if (action.type === 'submit' || action.type === 'submitKiosk') {
    const station = session.activeStation;
    const kiosk = session.environment.kiosks?.find(item => item.id === station);
    const checkoutId = kiosk?.laneId ?? station as MarketCheckoutId;
    if (session.phase !== 'checkout' || !station || !isNearMarketStation(session.environment, station, session.playerPosition, undefined, session.cashierAvailability)) return reject(session, action, '계산대에서 최종 구매를 결정해 주세요.');
    if (action.type === 'submitKiosk') {
      if (!kiosk) return reject(session, action, '키오스크에서 구매를 결정해 주세요.');
      const scanned = action.scannedCart;
      if (!scanned || typeof scanned !== 'object' || Array.isArray(scanned)
        || Object.entries(scanned).some(([id, count]) => !getMarketProduct(id) || !Number.isInteger(count) || count < 1 || count !== session.cart[id])
        || Object.entries(session.cart).some(([id, count]) => count !== scanned[id])) return reject(session, action, '담은 물건을 모두 스캔했는지 확인해 주세요.');
      record(session, 'kiosk_scan_confirmed', { kioskId: kiosk.id, checkoutId, scannedCart: clone(scanned) }, action.at);
    } else {
      if (kiosk || (checkoutId !== 'checkout' && checkoutId !== 'checkout-2')
        || session.environment.checkouts.find(counter => counter.id === checkoutId)?.kind === 'kiosk') return reject(session, action, '유인 계산대에서 구매를 결정해 주세요.');
      if (!session.cashierAvailability[checkoutId]) return reject(session, action, '계산원이 있는 계산대를 이용해 주세요. 유인 계산대가 비어 있으면 매장 직원에게 계산을 부탁해요.');
      if (!isStaffedCheckoutReviewReady(session)) return reject(session, action, '계산 내역 화면에서 최종 구매를 결정해 주세요.');
      ensureCheckoutReview(session, action.at);
    }
    session.attempts += 1;
    const evaluation = evaluate(session);
    const checkoutReviewEvaluation = kiosk ? null : evaluateMarketCheckoutReview(session.checkoutReview!, session.cart);
    const success = evaluation.success && (checkoutReviewEvaluation?.success ?? true);
    session.feedback = { success, ...(session.attempts >= 2 && !success
      ? { details: [...evaluation.details!, ...(checkoutReviewEvaluation?.details ?? [])] } : {}) };
    session.phase = success ? 'finished' : 'feedback';
    if (success) { session.outcome = 'success'; session.paid = true; }
    if (checkoutReviewEvaluation) record(session, 'checkout_review_submitted', { origin: 'system-cashier',
      checkoutId, attempt: session.attempts, chargedCart: clone(session.checkoutReview!.chargedCart),
      evaluation: checkoutReviewEvaluation, shoppingSuccess: evaluation.success, purchaseSuccess: success }, action.at);
    // The original evaluation remains a shopping-list assessment. A cashier error
    // has its own audit result and never becomes a player shopping mistake.
    record(session, 'purchase_submitted', { checkoutId, ...(kiosk ? { kioskId: kiosk.id } : {}), attempt: session.attempts,
      cart: clone(session.cart), evaluation, checkoutReviewEvaluation, purchaseSuccess: success, shownFeedback: clone(session.feedback) }, action.at);
    if (success) record(session, 'session_finished', { outcome: session.outcome, attempts: session.attempts, cart: clone(session.cart), score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, wrongWayEntryCount: session.wrongWayEntryCount, paid: session.paid }, action.at);
    return session;
  }
  return reject(session, action, '알 수 없는 행동이에요.');
}

/** Actor-visible data: no evaluation counters, hidden exact target for family tasks, or audit events. */
export function getMarketObservation(session: MarketSession) {
  const activeCategory = session.phase === 'shopping' && session.view !== 'help'
    ? marketCategories.find((category) => category.id === session.activeStation)?.id : undefined;
  const visibleSlots = activeCategory ? session.shelfSlots[activeCategory] : [];
  const visibleProductIds = [...new Set(visibleSlots)];
  const staffConversation = session.phase === 'shopping' && session.view === 'world'
    && session.activeStation?.startsWith('staff:') && isNearMarketStation(session.environment, session.activeStation, session.playerPosition, undefined, session.cashierAvailability);
  const cartVisible = session.view === 'cart' || session.phase === 'checkout' || session.phase === 'finished' || staffConversation;
  const lastEvent = session.events.at(-1);
  const cashierRequestFeedback: MarketCashierRequestFeedback | null = staffConversation && lastEvent
    && (lastEvent.type === 'cashier_requested' || lastEvent.type === 'cashier_request_declined') ? {
      accepted: lastEvent.type === 'cashier_requested', message: String(lastEvent.payload.message),
      checkoutIds: lastEvent.type === 'cashier_requested' ? [lastEvent.payload.checkoutId as MarketCheckoutId] : lastEvent.payload.availableCheckoutIds as MarketCheckoutId[],
      penaltyPoints: lastEvent.type === 'cashier_request_declined' ? -Number(lastEvent.payload.delta) : 0,
    } : null;
  const staffLearningFeedback = staffConversation && lastEvent
    && (lastEvent.type === 'product_location_requested' || lastEvent.type === 'stock_checked') ? {
      kind: lastEvent.type, message: String(lastEvent.payload.message),
      ...(lastEvent.type === 'product_location_requested' ? { categoryId: lastEvent.payload.categoryId as MarketCategoryId }
        : { productId: String(lastEvent.payload.productId), inStock: false }),
    } : null;
  const task = session.learning.stockout;
  const canResolve = session.view === 'requester' && task?.staffChecked && task.status === 'unresolved';
  const allowSubstitution = normalizeMarketLearningConfig(session.config.learning).allowSubstitution;
  const requesterOptions = session.view === 'requester' ? {
    substitutions: getAvailableSubstitutions(session).map(product => ({ id: product.id, name: product.name, detail: product.detail })),
    unavailableReasons: canResolve ? (!allowSubstitution ? ['replacement-not-allowed']
      : compatibleSubstitutions(session).length === 0 ? ['no-substitute-in-stock'] : []) as MarketUnavailableReason[] : [],
  } : null;
  return clone({
    schemaVersion: 1, sessionId: session.id, seed: session.config.seed, phase: session.phase, view: session.view,
    training: normalizeMarketTraining(session.config.training),
    visibleIncidents: session.events.filter(e=>e.type==='incident_started').map(e=>e.payload).filter(i=>{
      const started=session.events.find(e=>e.type==='training_started')?.timestamp??session.config.startedAt;
      const elapsed=(Date.parse(session.events.at(-1)?.timestamp??started)-Date.parse(started))/1000;
      const at=Number(i.actualElapsedSeconds??i.elapsedSeconds);
      return elapsed>=at&&elapsed<at+Number(i.durationSeconds);
    }),
    objectives: session.objectives.map(({ id, label, quantity, match }) => ({ id, label, quantity, match })),
    environment: session.environment, playerPosition: session.playerPosition, activeStation: session.activeStation,
    shelfSlots: activeCategory ? { [activeCategory]: visibleSlots } : {}, products: visibleProductIds.map((id) => {
      const product = productOrThrow(id); return { id, categoryId: product.categoryId, name: product.name, detail: product.detail, price: product.price };
    }),
    stock: Object.fromEntries(visibleProductIds.map((id) => [id, session.stock[id]])), cart: cartVisible ? session.cart : null, cashierAvailable: session.cashierAvailable,
    cashierAvailability: session.cashierAvailability, selectedCheckoutId: session.selectedCheckoutId, cashierRequestFeedback, staffLearningFeedback, requesterOptions,
    score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, alarmArmed: session.alarmArmed, wrongWayEntryCount: session.wrongWayEntryCount, wrongWayEntryArmed: session.wrongWayEntryArmed, paid: session.paid,
    selectedKioskId: session.selectedKioskId,
    checkoutReview: getMarketCheckoutReview(session),
    learning: { stockout: getStockoutStatus(session), choiceTask: session.learning.choiceTask,
      visitedCategoryIds: session.learning.visitedCategoryIds },
    attempts: session.attempts, feedback: session.feedback, outcome: session.outcome,
    ratings: session.ratings, ratingSkipped: session.ratingSkipped, lastActionError: session.lastActionError,
  });
}

/** Research/audit export is deliberately unavailable before completion; never send it as an agent observation. */
export function exportMarketEpisode(session: MarketSession) {
  if (session.phase !== 'finished') throw new Error('게임이 종료된 후 행동 기록을 내보낼 수 있습니다.');
  return clone({ schema: 'oneuldo.market.episode', version: 1, sessionId: session.id, seed: session.config.seed,
    provenance: session.config.provenance, syntheticDataIsNotClinicalEvidence: session.config.provenance.source === 'synthetic',
    config: session.config, environment: session.environment, objectives: session.objectives, shelfSlots: session.shelfSlots,
    initialStock: session.initialStock, finalStock: session.stock, finalCart: session.cart, learning: session.learning, selectedKioskId: session.selectedKioskId,
    cashierAvailability: session.cashierAvailability, selectedCheckoutId: session.selectedCheckoutId, checkoutReview: session.checkoutReview,
    score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, wrongWayEntryCount: session.wrongWayEntryCount, paid: session.paid,
    attempts: session.attempts, outcome: session.outcome, ratings: session.ratings, ratingSkipped: session.ratingSkipped, events: session.events,
    trajectory: buildMarketTrajectory(session.events, session.environment.spawn, normalizeMarketTraining(session.config.training).routeIntervalSeconds),
  });
}
export function serializeMarketEpisode(session: MarketSession) { return JSON.stringify(exportMarketEpisode(session), null, 2); }
export function parseMarketSessionConfig(json: string): MarketSessionConfig { return createMarketSession(JSON.parse(json) as Partial<MarketSessionConfig>).config; }

export type MarketAgentAction = Exclude<MarketAction, { type: 'setPosition' | 'startTraining' | 'trainingTick' | 'endTraining' }>;
/** Local synchronous adapter for next week's agent runner. It owns state, forbids teleport synchronization, and returns only actor-safe observations. */
export function createMarketAgentAdapter(config: Partial<MarketSessionConfig>, environmentOverride?: MarketEnvironment) {
  if (config.provenance?.source !== 'synthetic') throw new Error('Agent episodes must identify synthetic provenance, agentModel, and personaId.');
  let session = createMarketSession(config, environmentOverride);
  return {
    observe: () => getMarketObservation(session),
    act: (action: MarketAgentAction) => {
      if ((action as MarketAction | undefined)?.type === 'setPosition') throw new Error('Agent action setPosition is not allowed; use bounded move.');
      if(['startTraining','endTraining','trainingTick'].includes((action as MarketAction|undefined)?.type??''))throw new Error('Agent action is internal to the training clock.');
      session = applyMarketAction(session, action);
      return getMarketObservation(session);
    },
    exportEpisode: () => exportMarketEpisode(session),
  };
}

export function replaceMarketSessionTilemap(current: MarketSession, tilemap: MarketTilemapV1, at?: string): MarketSession {
  if (current.phase !== 'shopping' || current.view !== 'world' || current.activeStation !== null || current.paid) {
    throw new Error('대화와 계산 화면을 닫고 장보는 중에 배치를 바꿀 수 있어요.');
  }
  // Validate the full replacement before changing any progress or adding an event.
  const environment = createMarketEnvironment(applyMarketTilemapToConfig(current.environment.config, tilemap));
  const originalCashierRects = environment.checkouts.filter(counter => counter.cashierPresent).map(counter => counter.cashierCollider);
  const sameRect = (a: typeof originalCashierRects[number], b: typeof originalCashierRects[number]) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  const cashierAvailability = Object.fromEntries(environment.checkouts.map(counter => [counter.id,
    counter.kind !== 'kiosk' && current.cashierAvailability[counter.id]])) as MarketCashierAvailability;
  // Called cashiers stay at their counter. Changed people counts must not reroll this progress.
  environment.checkouts = environment.checkouts.map(counter => ({ ...counter, cashierPresent: cashierAvailability[counter.id] }));
  environment.checkout = environment.checkouts[0];
  environment.obstacles = [...environment.obstacles.filter(rect => !originalCashierRects.some(cashier => sameRect(rect, cashier))),
    ...environment.checkouts.filter(counter => counter.cashierPresent).map(counter => counter.cashierCollider)];
  const session = clone(current);
  const previousTilemap = clone(current.environment.config.tilemap ?? null);
  session.environment = environment;
  session.config.environment = clone(environment.config);
  session.playerPosition = { ...environment.spawn };
  session.activeStation = null;
  session.selectedCheckoutId = null;
  session.selectedKioskId = null;
  session.checkoutReview = null;
  session.cashierAvailability = cashierAvailability;
  session.cashierAvailable = cashierAvailability.checkout;
  session.lastActionError = null;
  // Relocation is not a gate crossing; score, alarms and prior task progress are retained.
  record(session, 'layout_changed', { previousLayoutId: current.environment.config.layoutId ?? 'classic',
    previousTilemap, tilemap: clone(environment.config.tilemap), environment: clone(environment),
    previousPosition: clone(current.playerPosition), playerPosition: clone(session.playerPosition),
    cashierAvailability: clone(cashierAvailability) }, at);
  return session;
}
