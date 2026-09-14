import { createMarketEnvironment, isMarketEnvironmentBlocked, isNearMarketStation, MarketEnvironment, MarketEnvironmentConfig, MarketEnvironmentStationId, MarketCashierAvailability, MarketCheckoutId } from './marketEnvironment';
import { MarketCategoryId, marketCategories, marketProducts, MarketProduct, getMarketProduct } from './scenarios';
import { Point } from './prototypeWorld';

export type MarketMatchRule = 'family' | 'exact';
export type MarketTaskObjectiveInput = { productId: string; quantity: number; match?: MarketMatchRule };
export type MarketTaskObjective = MarketTaskObjectiveInput & { id: string; match: MarketMatchRule; label: string; familyId: string };
export type MarketProvenance = { source: 'human' | 'synthetic'; participantId?: string; agentModel?: string; personaId?: string; personaVersion?: string; notes?: string };
export type MarketSessionConfig = {
  seed: string | number;
  difficulty: MarketMatchRule;
  objectives: MarketTaskObjectiveInput[];
  stockPerProduct: number;
  alarmPenaltyPoints: number;
  stockOverrides: Record<string, number>;
  inventoryProductIds?: Partial<Record<MarketCategoryId, string[]>>;
  environment: Partial<MarketEnvironmentConfig>;
  provenance: MarketProvenance;
  /** Explicit clock makes seeded episodes reproducible; the UI supplies wall time. */
  startedAt: string;
  sessionId?: string;
};
export type MarketFeedback = { success: boolean; details?: string[] };
export type MarketRating = { difficulty: number; interest: number };
export type MarketEpisodeEvent = { sequence: number; timestamp: string; type: string; payload: Record<string, unknown> };
export type MarketAction = (
  | { type: 'setPosition'; point: Point }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'interact'; station: MarketEnvironmentStationId }
  | { type: 'add' | 'remove' | 'requestReturn'; productId: string; quantity?: number }
  | { type: 'checkout' | 'requestCashier'; checkoutId?: MarketCheckoutId }
  | { type: 'submit' | 'retry' | 'giveUp' | 'skipRating' | 'closeStation' | 'viewCart' | 'viewHelp' | 'closeView' }
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
  score: number;
  penaltyPoints: number;
  alarmCount: number;
  alarmArmed: boolean;
  paid: boolean;
  phase: 'shopping' | 'checkout' | 'feedback' | 'finished';
  view: 'world' | 'cart' | 'help';
  attempts: number;
  feedback: MarketFeedback | null;
  outcome: 'success' | 'gave-up' | null;
  ratings: MarketRating | null;
  ratingSkipped: boolean;
  lastActionError: string | null;
  events: MarketEpisodeEvent[];
};

export const DEFAULT_MARKET_SESSION_CONFIG: MarketSessionConfig = {
  seed: 'oneuldo-market-1', difficulty: 'family',
  objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 }, { productId: 'curry', quantity: 1 }],
  stockPerProduct: 6, alarmPenaltyPoints: 10, stockOverrides: {}, environment: {}, provenance: { source: 'human' }, startedAt: '1970-01-01T00:00:00.000Z',
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
  const knownFields = ['seed', 'difficulty', 'objectives', 'stockPerProduct', 'alarmPenaltyPoints', 'stockOverrides', 'inventoryProductIds', 'environment', 'provenance', 'startedAt', 'sessionId'];
  for (const key of Object.keys(input)) if (!knownFields.includes(key)) throw new Error(`지원하지 않는 게임 설정입니다: ${key}`);
  const config = clone({ ...DEFAULT_MARKET_SESSION_CONFIG, ...input,
    environment: { ...DEFAULT_MARKET_SESSION_CONFIG.environment, ...input.environment },
    stockOverrides: { ...input.stockOverrides }, provenance: { ...DEFAULT_MARKET_SESSION_CONFIG.provenance, ...input.provenance },
  });
  if (!['string', 'number'].includes(typeof config.seed) || !String(config.seed).trim() || (typeof config.seed === 'number' && !Number.isFinite(config.seed))) throw new Error('seed가 올바르지 않습니다.');
  if (!['family', 'exact'].includes(config.difficulty)) throw new Error('difficulty는 family 또는 exact여야 합니다.');
  integer(config.stockPerProduct, '기본 재고', 1);
  integer(config.alarmPenaltyPoints, '출입 경보기 감점', 0, 100);
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
          if (supply < objective.quantity) throw new Error(`${objective.label}의 재고가 구매 수량보다 적어 완수할 수 없습니다.`);
        }
        selected.push(...shuffle(catalog.filter(product => !selected.includes(product.id)), random).slice(0, 3).map(product => product.id));
        config.inventoryProductIds![category.id] = [...selected];
      }
    } else {
      const reserved = new Set(required.map((objective) => objective.productId));
      if (reserved.size > 12) throw new Error(`${category.label}의 필수 상품이 12종을 초과합니다.`);
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
    for (const id of selected) initialStock[id] = config.stockOverrides[id] ?? config.stockPerProduct;
  }
  for (const objective of objectives) {
    const supply = Object.entries(initialStock).reduce((sum, [id, quantity]) => sum + (matchesObjective(id, objective) ? quantity : 0), 0);
    if (supply < objective.quantity) throw new Error(`${objective.label}의 재고가 구매 수량보다 적어 완수할 수 없습니다.`);
  }
  const session: MarketSession = {
    schemaVersion: 1, id: config.sessionId ?? `market-${config.seed}-${Date.parse(config.startedAt)}`, config, environment, objectives,
    shelfSlots, initialStock, stock: { ...initialStock }, cart: {}, playerPosition: { ...environment.spawn }, activeStation: null,
    cashierAvailable: environment.checkout.cashierPresent,
    cashierAvailability: Object.fromEntries(environment.checkouts.map(checkout => [checkout.id, checkout.cashierPresent])) as MarketCashierAvailability,
    selectedCheckoutId: null, score: 100, penaltyPoints: 0, alarmCount: 0, alarmArmed: true, paid: false,
    phase: 'shopping', view: 'world', attempts: 0, feedback: null, outcome: null,
    ratings: null, ratingSkipped: false, lastActionError: null, events: [],
  };
  record(session, 'session_started', { config: clone(config), environment: clone(environment), objectives: clone(objectives), shelfSlots: clone(shelfSlots), initialStock: clone(initialStock) });
  return session;
}

function matchesObjective(productId: string, objective: MarketTaskObjective) {
  return objective.match === 'exact' ? productId === objective.productId : familyOf(productOrThrow(productId)) === objective.familyId;
}
function evaluate(session: MarketSession): MarketFeedback {
  const details: string[] = [];
  for (const objective of session.objectives) {
    const count = Object.entries(session.cart).reduce((sum, [id, quantity]) => sum + (matchesObjective(id, objective) ? quantity : 0), 0);
    if (count !== objective.quantity) details.push(`${objective.label}: 필요한 수량은 ${objective.quantity}개, 담은 수량은 ${count}개예요.`);
  }
  for (const [id, quantity] of Object.entries(session.cart)) {
    if (quantity > 0 && !session.objectives.some((objective) => matchesObjective(id, objective))) details.push(`${productOrThrow(id).name} ${quantity}개는 구매 목록에 없어요.`);
  }
  return { success: details.length === 0, details };
}
function record(session: MarketSession, type: string, payload: Record<string, unknown>, at?: string) {
  const previous = session.events.at(-1)?.timestamp ?? session.config.startedAt;
  const timestamp = at && Number.isFinite(Date.parse(at)) && Date.parse(at) >= Date.parse(previous)
    ? new Date(at).toISOString() : new Date(Date.parse(previous) + (session.events.length ? 1 : 0)).toISOString();
  session.events.push({ sequence: session.events.length, timestamp, type, payload });
}
function reject(session: MarketSession, action: MarketAction | null | undefined, reason: string) {
  session.lastActionError = reason;
  record(session, 'action_rejected', { action: clone(action ?? null), reason }, action?.at);
  return session;
}
function pointIsFree(session: MarketSession, point: Point) {
  return !isMarketEnvironmentBlocked(session.environment, point, session.cashierAvailability);
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
  if (action.type === 'giveUp') {
    session.phase = 'finished'; session.outcome = 'gave-up'; session.activeStation = null; session.view = 'world';
    record(session, 'session_finished', { outcome: session.outcome, attempts: session.attempts, cart: clone(session.cart), reason: 'player_gave_up', score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, paid: session.paid }, action.at);
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
        if (!pointIsFree(session, { x: session.playerPosition.x + action.dx * fraction, y: session.playerPosition.y + action.dy * fraction })) return reject(session, action, '장애물이 있어 이동할 수 없어요.');
      }
    }
    if (!point || !pointIsFree(session, point)) return reject(session, action, '이동할 수 없는 위치예요.');
    const previousPosition = session.playerPosition;
    session.playerPosition = { ...point };
    checkEntranceCrossing(session, previousPosition, point, action.at);
    if (session.activeStation && !isNearMarketStation(session.environment, session.activeStation, point, undefined, session.cashierAvailability)) { session.activeStation = null; if (session.phase === 'checkout') session.phase = 'shopping'; }
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
  if (action.type === 'viewCart' || action.type === 'viewHelp' || action.type === 'closeView') {
    session.view = action.type === 'viewCart' ? 'cart' : action.type === 'viewHelp' ? 'help' : 'world';
    record(session, action.type === 'viewCart' ? 'cart_viewed' : action.type === 'viewHelp' ? 'help_viewed' : 'view_closed', action.type === 'viewCart' ? { cart: clone(session.cart) } : {}, action.at);
    return session;
  }
  if (action.type === 'closeStation') { session.activeStation = null; session.phase = 'shopping'; session.view = 'world'; record(session, 'station_closed', {}, action.at); return session; }
  if (action.type === 'interact' || action.type === 'checkout') {
    if (session.view !== 'world') return reject(session, action, '열린 화면을 닫고 다가가 주세요.');
    const station = action.type === 'interact' ? action.station : action.checkoutId ?? 'checkout';
    if (!isNearMarketStation(session.environment, station, session.playerPosition, undefined, session.cashierAvailability)) return reject(session, action, '가까이 다가간 뒤 선택해 주세요.');
    session.activeStation = station;
    if (station === 'checkout' || station === 'checkout-2') {
      session.phase = 'checkout'; session.selectedCheckoutId = station;
      session.cashierAvailable = session.cashierAvailability[station];
    }
    else session.phase = 'shopping';
    record(session, 'station_interacted', { station, playerPosition: clone(session.playerPosition) }, action.at);
    if (station === 'entrance' || station === 'exit') session.activeStation = null;
    if (station === 'common-door') {
      session.phase = 'finished'; session.outcome = 'gave-up'; session.activeStation = null; session.view = 'world';
      record(session, 'session_finished', { outcome: session.outcome, attempts: session.attempts, cart: clone(session.cart), reason: 'player_left_market', station,
        score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, paid: session.paid }, action.at);
    }
    return session;
  }
  if (action.type === 'requestCashier') {
    const staffStation = session.activeStation;
    if (session.view !== 'world' || !staffStation?.startsWith('staff:') || !isNearMarketStation(session.environment, staffStation, session.playerPosition, undefined, session.cashierAvailability)) return reject(session, action, '종업원에게 다가가 대화를 연 뒤 계산을 요청해 주세요.');
    const selected = session.selectedCheckoutId;
    const checkoutId = action.checkoutId ?? (selected && !session.cashierAvailability[selected] ? selected
      : session.environment.checkouts.find(checkout => !session.cashierAvailability[checkout.id])?.id);
    if (!checkoutId || !session.environment.checkouts.some(checkout => checkout.id === checkoutId)) return reject(session, action, '호출할 빈 계산대가 없어요.');
    if (session.cashierAvailability[checkoutId]) return reject(session, action, '이 계산대에는 이미 계산원이 있어요.');
    session.cashierAvailability[checkoutId] = true;
    session.selectedCheckoutId = checkoutId;
    session.cashierAvailable = true;
    record(session, 'cashier_requested', { staffStation, checkoutId, playerPosition: clone(session.playerPosition) }, action.at);
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
      categoryId: product.categoryId, productId: product.id, quantity, cart: clone(session.cart), stock: clone(session.stock),
    }, action.at);
    return session;
  }
  if (action.type === 'submit') {
    const checkoutId = session.activeStation;
    if (session.phase !== 'checkout' || (checkoutId !== 'checkout' && checkoutId !== 'checkout-2') || !isNearMarketStation(session.environment, checkoutId, session.playerPosition, undefined, session.cashierAvailability)) return reject(session, action, '계산대에서 최종 구매를 결정해 주세요.');
    if (!session.cashierAvailability[checkoutId]) return reject(session, action, '종업원을 찾아 계산을 요청해 주세요.');
    session.attempts += 1;
    const evaluation = evaluate(session);
    session.feedback = { success: evaluation.success, ...(session.attempts >= 2 && !evaluation.success ? { details: evaluation.details } : {}) };
    session.phase = evaluation.success ? 'finished' : 'feedback';
    if (evaluation.success) { session.outcome = 'success'; session.paid = true; }
    record(session, 'purchase_submitted', { checkoutId, attempt: session.attempts, cart: clone(session.cart), evaluation, shownFeedback: clone(session.feedback) }, action.at);
    if (evaluation.success) record(session, 'session_finished', { outcome: session.outcome, attempts: session.attempts, cart: clone(session.cart), score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, paid: session.paid }, action.at);
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
  return clone({
    schemaVersion: 1, sessionId: session.id, seed: session.config.seed, phase: session.phase, view: session.view,
    objectives: session.objectives.map(({ id, label, quantity, match }) => ({ id, label, quantity, match })),
    environment: session.environment, playerPosition: session.playerPosition, activeStation: session.activeStation,
    shelfSlots: activeCategory ? { [activeCategory]: visibleSlots } : {}, products: visibleProductIds.map((id) => {
      const product = productOrThrow(id); return { id, categoryId: product.categoryId, name: product.name, detail: product.detail, price: product.price };
    }),
    stock: Object.fromEntries(visibleProductIds.map((id) => [id, session.stock[id]])), cart: cartVisible ? session.cart : null, cashierAvailable: session.cashierAvailable,
    cashierAvailability: session.cashierAvailability, selectedCheckoutId: session.selectedCheckoutId,
    score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, alarmArmed: session.alarmArmed, paid: session.paid,
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
    initialStock: session.initialStock, finalStock: session.stock, finalCart: session.cart,
    cashierAvailability: session.cashierAvailability, selectedCheckoutId: session.selectedCheckoutId,
    score: session.score, penaltyPoints: session.penaltyPoints, alarmCount: session.alarmCount, paid: session.paid,
    attempts: session.attempts, outcome: session.outcome, ratings: session.ratings, ratingSkipped: session.ratingSkipped, events: session.events,
  });
}
export function serializeMarketEpisode(session: MarketSession) { return JSON.stringify(exportMarketEpisode(session), null, 2); }
export function parseMarketSessionConfig(json: string): MarketSessionConfig { return createMarketSession(JSON.parse(json) as Partial<MarketSessionConfig>).config; }

export type MarketAgentAction = Exclude<MarketAction, { type: 'setPosition' }>;
/** Local synchronous adapter for next week's agent runner. It owns state, forbids teleport synchronization, and returns only actor-safe observations. */
export function createMarketAgentAdapter(config: Partial<MarketSessionConfig>) {
  if (config.provenance?.source !== 'synthetic') throw new Error('Agent episodes must identify synthetic provenance, agentModel, and personaId.');
  let session = createMarketSession(config);
  return {
    observe: () => getMarketObservation(session),
    act: (action: MarketAgentAction) => {
      if ((action as MarketAction | undefined)?.type === 'setPosition') throw new Error('Agent action setPosition is not allowed; use bounded move.');
      session = applyMarketAction(session, action);
      return getMarketObservation(session);
    },
    exportEpisode: () => exportMarketEpisode(session),
  };
}
