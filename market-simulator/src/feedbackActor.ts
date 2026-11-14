import { extendedActorChoices, presentActorChoices, type ExtendedActorChoice } from './actorChoices';
import { ACTOR_PERSONA_INSTRUCTIONS } from './actorInstructions';
import type { ActorObservation, ActorPersona, Decision, PolicyAction } from './types';
import { buildWholeTracePersonaInput } from './wholeTrace/wholeTracePersona';
import type { MarketReplayMovementPolicyDecision } from '../../frontend/src/game/marketReplayTrace';
import type { FeedbackExperienceSnapshot } from './feedbackExperience';

export const FEEDBACK_ACTOR_POLICY_VERSION = 'feedback-choice-v7' as const;
export type FeedbackActorPolicyVersion = 'feedback-choice-v1' | 'feedback-choice-v2' | 'feedback-choice-v3' | 'feedback-choice-v4' | 'feedback-choice-v5' | 'feedback-choice-v6' | 'feedback-choice-v7' | 'feedback-choice-v8' | 'feedback-choice-v9' | 'feedback-choice-v10' | 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13';
export function isFeedbackActorPolicy(value?: string): value is FeedbackActorPolicyVersion {
  return value === 'feedback-choice-v1' || value === 'feedback-choice-v2' || value === 'feedback-choice-v3' || isExperienceFeedbackPolicy(value);
}
export function isExperienceFeedbackPolicy(value?: string): value is 'feedback-choice-v4' | 'feedback-choice-v5' | 'feedback-choice-v6' | 'feedback-choice-v7' | 'feedback-choice-v8' | 'feedback-choice-v9' | 'feedback-choice-v10' | 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13' {
  return value === 'feedback-choice-v4' || isStructuredFeedbackPolicy(value);
}
export function isStructuredFeedbackPolicy(value?: string): value is 'feedback-choice-v5' | 'feedback-choice-v6' | 'feedback-choice-v7' | 'feedback-choice-v8' | 'feedback-choice-v9' | 'feedback-choice-v10' | 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13' {
  return value === 'feedback-choice-v5' || value === 'feedback-choice-v6' || isQuantityBeliefFeedbackPolicy(value);
}
/** Policies whose remembered items separate a wanted total from a remembered in-cart amount. */
export function isQuantityBeliefFeedbackPolicy(value?: string): value is 'feedback-choice-v7' | 'feedback-choice-v8' | 'feedback-choice-v9' | 'feedback-choice-v10' | 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13' {
  return value === 'feedback-choice-v7' || isResultReflectionFeedbackPolicy(value);
}
/** v8+: the controller reports the applied previous action; the actor reflects it, then writes what follows the new choice. */
export function isResultReflectionFeedbackPolicy(value?: string): value is 'feedback-choice-v8' | 'feedback-choice-v9' | 'feedback-choice-v10' | 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13' {
  return value === 'feedback-choice-v8' || isRevisitNoteFeedbackPolicy(value);
}
/** v9: shelves opened repeatedly within the retained experience are restated in words. */
export function isRevisitNoteFeedbackPolicy(value?: string): value is 'feedback-choice-v9' | 'feedback-choice-v10' | 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13' {
  return value === 'feedback-choice-v9' || isShelfChoiceMarkerFeedbackPolicy(value);
}
/** v10: the control that reopens a recently opened shelf says so on the choice itself. */
export function isShelfChoiceMarkerFeedbackPolicy(value?: string): value is 'feedback-choice-v10' | 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13' {
  return value === 'feedback-choice-v10' || isMovementNoteFeedbackPolicy(value);
}
/** v11: the directions this person recently walked, and did not walk, are restated in words. */
export function isMovementNoteFeedbackPolicy(value?: string): value is 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13' {
  return value === 'feedback-choice-v11' || isPassageMarkerFeedbackPolicy(value);
}
/** v12: walk-to-passage choices say whether this person recently walked there, passages carry no ids, and choice ids are short per-frame labels. */
export function isPassageMarkerFeedbackPolicy(value?: string): value is 'feedback-choice-v12' | 'feedback-choice-v13' {
  return value === 'feedback-choice-v12' || isProgressNoteFeedbackPolicy(value);
}
/** v13: the list control says how recently it was read, and the frame restates this person's own item beliefs and how the visit ends. */
export function isProgressNoteFeedbackPolicy(value?: string): value is 'feedback-choice-v13' {
  return value === 'feedback-choice-v13';
}
/** v9+: stopping the visit is not an actor choice; the controller checks out the unchanged basket at the action limit. */
export function isNoGiveUpFeedbackPolicy(value?: string): value is 'feedback-choice-v9' | 'feedback-choice-v10' | 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13' {
  return value === 'feedback-choice-v9' || value === 'feedback-choice-v10' || value === 'feedback-choice-v11' || value === 'feedback-choice-v12' || value === 'feedback-choice-v13';
}

export type FeedbackChoiceParameters = { productId?: string; quantity?: number; dragOutcome?: 'drop' | 'miss' | 'cancel' };

/** The actor's public fictional beliefs, not a factual archive or private reasoning. */
export type FeedbackBeliefMemory = {
  rememberedItems: {
    name: string | null;
    quantity: number | null;
    certainty: 'clear' | 'uncertain';
    status: 'pending' | 'done' | 'abandoned';
    /** v7: the actor's fallible belief about why this item is remembered, not verified provenance. */
    source?: 'list' | 'personal' | 'uncertain';
    /** v7: last remembered in-cart amount. quantity separately means believed desired total. */
    rememberedCartQuantity?: number | null;
  }[];
  /** v1-v7 only. v8 drops it: a description of the chosen action read back as a pending task repeated that action. */
  currentTask?: string | null;
  /** v8: what the actor expects to do after the action chosen now, never that action itself. */
  nextStep?: string | null;
  notes: string[];
  /** v4: omitted updates retain this actor-selected intent; explicit null clears it. */
  ongoingIntent?: string | null;
};

export function emptyFeedbackBeliefMemory(policyVersion?: FeedbackActorPolicyVersion): FeedbackBeliefMemory {
  return { rememberedItems: [], ...(isResultReflectionFeedbackPolicy(policyVersion) ? { nextStep: null } : { currentTask: null }), notes: [],
    ...(isExperienceFeedbackPolicy(policyVersion) ? { ongoingIntent: null } : {}) };
}

function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function shortText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

/** Validate size and syntax only. Incorrect beliefs, omissions and false completion are valid. */
export function validateFeedbackBeliefMemory(value: unknown, policyVersion: FeedbackActorPolicyVersion = FEEDBACK_ACTOR_POLICY_VERSION): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!plain(value)) return { valid: false, errors: ['memory must be a JSON object'] };
  const taskField = isResultReflectionFeedbackPolicy(policyVersion) ? 'nextStep' : 'currentTask';
  if (!onlyKeys(value, ['rememberedItems', taskField, 'notes', ...(isExperienceFeedbackPolicy(policyVersion) ? ['ongoingIntent'] : [])])) errors.push('memory has unknown fields');
  if (Object.prototype.hasOwnProperty.call(value, 'ongoingIntent') && value.ongoingIntent !== null && !shortText(value.ongoingIntent))
    errors.push('memory.ongoingIntent must be null or 1..300 characters');
  if (value[taskField] !== null && !shortText(value[taskField])) errors.push(`memory.${taskField} must be null or 1..300 characters`);
  if (!Array.isArray(value.rememberedItems) || value.rememberedItems.length > 12) {
    errors.push('memory.rememberedItems must be an array of at most 12 items');
  } else value.rememberedItems.forEach((item, index) => {
    const at = `memory.rememberedItems[${index}]`;
    if (!plain(item)) { errors.push(`${at} must be a JSON object`); return; }
    if (!onlyKeys(item, ['name', 'quantity', 'certainty', 'status',
      ...(isQuantityBeliefFeedbackPolicy(policyVersion) ? ['source', 'rememberedCartQuantity'] : [])])) errors.push(`${at} has unknown fields`);
    if (item.name !== null && !shortText(item.name)) errors.push(`${at}.name must be null or 1..300 characters`);
    if (item.quantity !== null && (!Number.isInteger(item.quantity) || Number(item.quantity) < 0 || Number(item.quantity) > 99))
      errors.push(`${at}.quantity must be null or an integer in 0..99`);
    if (!['clear', 'uncertain'].includes(item.certainty as string)) errors.push(`${at}.certainty must be clear or uncertain`);
    if (!['pending', 'done', 'abandoned'].includes(item.status as string)) errors.push(`${at}.status must be pending, done or abandoned`);
    if (Object.prototype.hasOwnProperty.call(item, 'source') && !['list', 'personal', 'uncertain'].includes(item.source as string))
      errors.push(`${at}.source must be list, personal or uncertain`);
    if (Object.prototype.hasOwnProperty.call(item, 'rememberedCartQuantity') && item.rememberedCartQuantity !== null
      && (!Number.isInteger(item.rememberedCartQuantity) || Number(item.rememberedCartQuantity) < 0 || Number(item.rememberedCartQuantity) > 99))
      errors.push(`${at}.rememberedCartQuantity must be null or an integer in 0..99`);
  });
  if (!Array.isArray(value.notes) || value.notes.length > 8 || value.notes.some(note => !shortText(note)))
    errors.push('memory.notes must contain at most 8 strings of 1..300 characters');
  return { valid: errors.length === 0, errors };
}

/** Only intent has patch semantics. Never restore deleted items or correct an actor belief. */
export function carryFeedbackBeliefMemory(previous: FeedbackBeliefMemory, next: FeedbackBeliefMemory,
  policyVersion: FeedbackActorPolicyVersion): FeedbackBeliefMemory {
  const checked = validateFeedbackBeliefMemory(next, policyVersion);
  if (!checked.valid) throw new Error(`Invalid feedback belief memory: ${checked.errors.join('; ')}`);
  return { ...structuredClone(next), ...(isExperienceFeedbackPolicy(policyVersion)
    ? { ongoingIntent: Object.prototype.hasOwnProperty.call(next, 'ongoingIntent') ? next.ongoingIntent! : previous.ongoingIntent ?? null }
    : {}) };
}

function pick<T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]])) as Pick<T, K>;
}

/** Deep allowlist of the current UI projection. Never forward a raw observation or historical archive. */
export function projectFeedbackObservation(observation: ActorObservation, policyVersion: FeedbackActorPolicyVersion = FEEDBACK_ACTOR_POLICY_VERSION): ActorObservation {
  const current: ActorObservation = {
    schemaVersion: 'attention-observation-v1',
    ...pick(observation, ['sequence', 'elapsedMs', 'phase', 'view', 'activeStation', 'listAvailable']),
    visibleStations: observation.visibleStations.map(station => pick(station, ['id', 'kind', 'label', 'direction', 'distanceBand', 'near'])),
    ...(observation.visibleStructures === undefined ? {} : { visibleStructures: observation.visibleStructures.map(body =>
      pick(body, ['kind', 'label', 'direction', 'distanceBand'])) }),
    anchors: observation.anchors.map(anchor => pick(anchor, ['id', 'label', 'direction', 'distanceBand'])),
    products: observation.products.map(product => pick(product, ['id', 'categoryId', 'name', 'detail', 'price', 'stock',
      ...(isResultReflectionFeedbackPolicy(policyVersion) ? ['inCart' as const] : [])])),
    shelf: observation.shelf === null ? null : {
      ...pick(observation.shelf, ['page', 'pageCount', 'scrollFraction']),
      ...(observation.shelf.pageFractions === undefined ? {} : { pageFractions: [...observation.shelf.pageFractions] }),
    },
    cart: observation.cart === null ? null : Object.fromEntries(Object.entries(observation.cart).filter(([, count]) => typeof count === 'number' && Number.isFinite(count))),
    ...(isStructuredFeedbackPolicy(policyVersion) && observation.cart !== null && observation.cartItems !== undefined
      ? { cartItems: observation.cartItems.map(item => pick(item, ['id', 'name', 'detail', 'quantity'])) } : {}),
    cashiers: Object.fromEntries(Object.entries(observation.cashiers).filter(([, available]) => typeof available === 'boolean')),
    ...(observation.readObjectives === undefined ? {} : {
      readObjectives: observation.readObjectives.map(goal => pick(goal, ['id', 'label', 'quantity', 'match'])),
    }),
    ...(observation.instructions === undefined ? {} : {
      instructions: { phase: observation.instructions.phase, lines: [...observation.instructions.lines] },
    }),
    ...(observation.supportText === undefined ? {} : { supportText: [...observation.supportText] }),
    ...(observation.removableProductIds === undefined ? {} : { removableProductIds: [...observation.removableProductIds] }),
    ...pick(observation, ['lastActionError']),
    ...(observation.result === undefined ? {} : {
      result: { ...pick(observation.result, ['accepted', 'actionType', 'productId', 'quantity', 'stationId', 'anchorId', 'message']),
        ...(observation.result.movement === undefined ? {} : { movement: {
          ...pick(observation.result.movement, ['direction', 'durationMs', 'movedDistancePx', 'outcome']),
          actualDelta: pick(observation.result.movement.actualDelta, ['dx', 'dy']),
        } }) },
    }),
  };
  return current;
}

export type FeedbackChoiceCatalogItem = {
  productId: string; name: string; quantity: { minimum: number; maximum: number };
  dragOutcomes?: ('drop' | 'miss' | 'cancel')[];
  /** Failed and cancelled drags preserve the legacy one-item gesture. */
  nonDropQuantity?: 1;
};
export type FeedbackActorChoice = Omit<ExtendedActorChoice, 'observedContext' | 'action'> & {
  action: PolicyAction | { type: 'add' | 'remove' };
  parameterSchema?: {
    type: 'object'; additionalProperties: false; required: string[];
    properties: { productId: { type: 'string'; enum: string[] }; quantity: { type: 'integer'; minimum: number; maximum: number };
      dragOutcome?: { type: 'string'; enum: ('drop' | 'miss' | 'cancel')[] } };
  };
  catalog?: FeedbackChoiceCatalogItem[];
  dragOutcome?: 'miss' | 'cancel';
  /** Actor selects this duration; any action.durationMs in the template is a placeholder. */
  timing?: { minimumMs: number; maximumMs: number; phase: 'during-action' | 'after-panel-open' };
  observedContext?: Pick<NonNullable<ExtendedActorChoice['observedContext']>, 'label' | 'direction' | 'distanceBand'>;
  /** v10: this shelf was already opened within the retained experience. A description, never a prohibition. */
  recentVisit?: { timesOpened: number } | { timesArrived: number };
  /** v13: when the list was last read and how often within the retained experience. Never its contents. */
  recentRead?: { actionsAgo: number; timesRead: number };
};

function activityTiming(type: PolicyAction['type']): FeedbackActorChoice['timing'] {
  if (type === 'moveDirection') return { minimumMs: 100, maximumMs: 2000, phase: 'during-action' };
  if (['pause', 'lookAround', 'readList', 'browse'].includes(type))
    return { minimumMs: 100, maximumMs: 120000, phase: 'during-action' };
  if (['viewCart', 'viewHelp'].includes(type))
    return { minimumMs: 0, maximumMs: 120000, phase: 'after-panel-open' };
  return undefined;
}

/** Resolve only a currently offered product/quantity/gesture. Never use beliefs or a goal answer. */
function resolveChoiceAction(choice: FeedbackActorChoice, parameters?: FeedbackChoiceParameters):
  { action: PolicyAction; dragOutcome?: 'miss' | 'cancel' } {
  if (!choice.parameterSchema) {
    if (parameters !== undefined) throw new Error('choiceParameters are only allowed for parameterized choices');
    return { action: structuredClone(choice.action) as PolicyAction,
      ...(choice.dragOutcome ? { dragOutcome: choice.dragOutcome } : {}) };
  }
  if (!plain(parameters) || !onlyKeys(parameters, choice.parameterSchema.required)
    || !choice.parameterSchema.required.every(key => Object.prototype.hasOwnProperty.call(parameters, key)))
    throw new Error('choiceParameters must contain exactly the required catalog fields');
  const item = choice.catalog?.find(product => product.productId === parameters.productId);
  if (!item) throw new Error('choiceParameters.productId is not in the current visible catalog');
  const quantity = parameters.quantity;
  if (!Number.isInteger(quantity) || quantity! < item.quantity.minimum || quantity! > item.quantity.maximum)
    throw new Error('choiceParameters.quantity is outside this product catalog range');
  if (choice.action.type === 'add') {
    const outcome = parameters.dragOutcome;
    if (!outcome || !item.dragOutcomes?.includes(outcome)
      || (outcome !== 'drop' && quantity !== item.nonDropQuantity))
      throw new Error('choiceParameters.dragOutcome is unavailable for this quantity');
    return { action: { type: 'add', productId: item.productId, quantity: quantity! },
      ...(outcome === 'drop' ? {} : { dragOutcome: outcome }) };
  }
  if (choice.action.type !== 'remove') throw new Error('Unsupported parameterized choice');
  return { action: { type: 'remove', productId: item.productId, quantity: quantity! } };
}

/** Duration belongs to the selected activity, never a reaction wait before an input. */
export function feedbackDecisionFromChoice(choice: FeedbackActorChoice, durationMs: number, reason: string,
  memory: FeedbackBeliefMemory, choiceParameters?: FeedbackChoiceParameters): Decision {
  const timing = activityTiming(choice.action.type);
  if (!Number.isInteger(durationMs) || durationMs < (timing?.minimumMs ?? 0) || durationMs > (timing?.maximumMs ?? 0))
    throw new Error(`durationMs for ${choice.action.type} must be ${timing?.minimumMs ?? 0}..${timing?.maximumMs ?? 0}; ordinary actions require 0`);
  const { action, dragOutcome } = resolveChoiceAction(choice, choiceParameters);
  if (timing) Object.assign(action, { durationMs });
  return { action, delayMs: 0, reason, feedbackMemory: structuredClone(memory),
    ...(dragOutcome ? { dragOutcome } : {}) };
}

/** Changing the activity duration must not allow changing a choice's target or quantity. */
export function feedbackChoiceMatchesDecision(choice: FeedbackActorChoice, decision: Decision, choiceParameters?: FeedbackChoiceParameters): boolean {
  const normalize = (action: PolicyAction) => Object.entries(action)
    .filter(([key]) => key !== 'durationMs' || !activityTiming(action.type))
    .sort(([a], [b]) => a.localeCompare(b));
  try {
    const parameters = choiceParameters ?? (choice.parameterSchema && (decision.action.type === 'add' || decision.action.type === 'remove')
      ? { productId: decision.action.productId, quantity: decision.action.quantity,
        ...(decision.action.type === 'add' ? { dragOutcome: decision.dragOutcome ?? 'drop' } : {}) } : undefined);
    const resolved = resolveChoiceAction(choice, parameters);
    return JSON.stringify(normalize(resolved.action)) === JSON.stringify(normalize(decision.action))
      && (resolved.dragOutcome ?? 'drop') === (decision.dragOutcome ?? 'drop');
  } catch { return false; }
}

function parameterizeProductChoices(choices: FeedbackActorChoice[], observation: ActorObservation,
  policyVersion: FeedbackActorPolicyVersion): FeedbackActorChoice[] {
  const result = choices.filter(choice => choice.action.type !== 'add' && choice.action.type !== 'remove');
  for (const type of ['add', 'remove'] as const) {
    const existing = choices.filter(choice => choice.action.type === type);
    if (!existing.length) continue;
    const byProduct = new Map<string, FeedbackChoiceCatalogItem>();
    for (const choice of existing) {
      const action = choice.action as { type: 'add' | 'remove'; productId: string; quantity?: number };
      const quantity = action.quantity ?? 1;
      const item: FeedbackChoiceCatalogItem = byProduct.get(action.productId) ?? { productId: action.productId,
        name: observation.products.find(product => product.id === action.productId)?.name
          ?? observation.cartItems?.find(product => product.id === action.productId)?.name ?? action.productId,
        quantity: { minimum: quantity, maximum: quantity },
        ...(type === 'add' ? { dragOutcomes: [] } : {}) };
      item.quantity.minimum = Math.min(item.quantity.minimum, quantity);
      item.quantity.maximum = Math.max(item.quantity.maximum, quantity);
      if (type === 'add') {
        const outcome = choice.dragOutcome ?? 'drop';
        if (!item.dragOutcomes!.includes(outcome)) item.dragOutcomes!.push(outcome);
        if (outcome !== 'drop') item.nonDropQuantity = 1;
      }
      byProduct.set(action.productId, item);
    }
    // Product order follows the displayed catalog, not the requested shopping list or a preference score.
    const visibleOrder = (type === 'add' ? observation.products : observation.cartItems ?? []).map(product => product.id);
    const catalog = [...byProduct.values()].sort((a, b) => visibleOrder.indexOf(a.productId) - visibleOrder.indexOf(b.productId));
    for (const item of catalog) if (item.dragOutcomes)
      item.dragOutcomes = (['drop', 'miss', 'cancel'] as const).filter(outcome => item.dragOutcomes!.includes(outcome));
    result.push({ id: `choice-${type}-product`, label: isQuantityBeliefFeedbackPolicy(policyVersion)
      ? (type === 'add' ? '선택한 상품을 해당 수량만큼 추가로 담기' : '선택한 상품을 해당 수량만큼 빼기')
      : type === 'add' ? '상품과 수량을 골라 담기' : '상품과 수량을 골라 내려놓기',
      action: { type }, catalog,
      parameterSchema: { type: 'object', additionalProperties: false,
        required: ['productId', 'quantity', ...(type === 'add' ? ['dragOutcome'] : [])],
        properties: { productId: { type: 'string', enum: catalog.map(item => item.productId) },
          quantity: { type: 'integer', minimum: Math.min(...catalog.map(item => item.quantity.minimum)),
            maximum: Math.max(...catalog.map(item => item.quantity.maximum)) },
          ...(type === 'add' ? { dragOutcome: { type: 'string' as const, enum: ['drop', 'miss', 'cancel'] as ('drop' | 'miss' | 'cancel')[] } } : {}) } },
      effect: isQuantityBeliefFeedbackPolicy(policyVersion) ? (type === 'add'
        ? 'Choose one catalog product, an integer quantity within its own range, and a dragOutcome. quantity is how many MORE units to add, not the desired final cart total. drop adds that quantity; miss releases outside the basket and cancel returns the product without adding. miss/cancel permit quantity 1 only. No product or quantity is recommended. Describe the selected product and actual increment in reason; the next observation, not the choice alone, tells what happened.'
        : 'Choose the exact productId from this currently removable cart catalog and an integer quantity within its own range. quantity is how many units to TAKE OUT of that selected product, not how many should remain. The action will not remove a different product named in reason. No product or quantity is recommended; the next observation tells what happened.')
        : type === 'add'
        ? 'Choose one catalog product, an integer quantity within its own range, and a dragOutcome. drop adds that quantity; miss releases outside the basket and cancel returns the product without adding. miss/cancel permit quantity 1 only. These are the same available gestures, with no recommended product or quantity.'
        : 'Choose one currently removable cart product and an integer quantity within its own range. This does not choose a product or quantity for you.' });
  }
  return result.map(choice => choice.action.type === 'submit' ? { ...choice, label: '구매 확정',
    effect: '구매를 확정하면 이번 시도가 기록되고 결과가 나와요. 이 버튼은 현재 장바구니로 구매를 확정하고 검토를 요청합니다.' }
    : choice.action.type === 'closeStation' ? { ...choice,
      ...(observation.phase === 'checkout' ? { label: '다시 고르기' } : {}),
      effect: observation.phase === 'checkout' ? '계산 화면을 닫고 매장으로 돌아가 다시 고를 수 있습니다.' : '열린 진열대 또는 대화를 닫고 매장 화면으로 돌아갑니다.' }
      : choice);
}

function currentChoices(observation: ActorObservation, seed: string | number, decisionIndex: number,
  policyVersion: FeedbackActorPolicyVersion, movementPolicy?: MarketReplayMovementPolicyDecision,
  experience?: FeedbackExperienceSnapshot): FeedbackActorChoice[] {
  const choices: (ExtendedActorChoice & {dragOutcome?: 'miss' | 'cancel'})[] = extendedActorChoices(observation)
    .filter(choice => !(isNoGiveUpFeedbackPolicy(policyVersion) && choice.action.type === 'giveUp'));
  if (policyVersion !== 'feedback-choice-v1' && observation.phase === 'shopping' && observation.view === 'world' && !observation.activeStation) {
    const directions = { north: '위로', northeast: '오른쪽 위로', east: '오른쪽으로', southeast: '오른쪽 아래로',
      south: '아래로', southwest: '왼쪽 아래로', west: '왼쪽으로', northwest: '왼쪽 위로' } as const;
    for (const direction of Object.keys(directions) as (keyof typeof directions)[]) choices.push({
      id: `move-direction-${direction}`, label: `${directions[direction]} 걷기`,
      action: { type: 'moveDirection', direction, durationMs: 0 },
      effect: 'Hold the directional control for your chosen duration, even with no visible destination or shopping purpose. Directions are screen-relative. The camera follows movement, which stops at walls and map boundaries; this control does not find or correct a route. The next observation reports actual movement and what is then visible.',
    });
  }
  for (const choice of [...choices]) if (choice.action.type === 'add' && choice.action.quantity === 1) {
    const name = observation.products.find(p => p.id === (choice.action as {productId:string}).productId)?.name;
    choices.push({ ...choice, id: `${choice.id}-miss`, dragOutcome:'miss', label:`${name}을 장바구니 바깥에 놓는 담기 시도`,
      effect:'Drag this visible product and release outside the basket. The item will not be added; the next observation reports that outcome.' },
    { ...choice, id: `${choice.id}-cancel`, dragOutcome:'cancel', label:`${name}을 끌다가 제자리에 놓기`,
      effect:'Begin a drag and return the visible product to its original position without adding it.' });
  }
  const offered = movementPolicy ? choices.filter(choice => {
    if (choice.action.type === 'moveDirection') return !movementPolicy.avoidedDirections.includes(choice.action.direction);
    // v4 keeps interactions, checking and stopping available during a wandering cue.
    return isExperienceFeedbackPolicy(policyVersion) || movementPolicy.mode === 'actor-choice';
  }) : choices;
  const projected: FeedbackActorChoice[] = (presentActorChoices(offered, seed, decisionIndex) as typeof choices).map(choice => ({
    id: choice.id, label: choice.label, action: {
      ...structuredClone(choice.action),
      ...('durationMs' in choice.action ? { durationMs: 0 } : {}),
    },
    ...(activityTiming(choice.action.type) ? { timing: activityTiming(choice.action.type) } : {}),
    ...(choice.dragOutcome ? {dragOutcome:choice.dragOutcome} : {}),
    ...(choice.effect === undefined ? {} : {
      effect: choice.action.type === 'readList'
        ? 'Read the current shopping list. Its displayed contents appear in the next current observation only; any later memory is authored by you.'
        : choice.effect,
    }),
    ...(choice.observedContext === undefined ? {} : {
      observedContext: pick(choice.observedContext, ['label', 'direction', 'distanceBand']),
    }),
  }));
  // The choice id and order depend only on the action, so marking a choice never reorders or removes it.
  const marked = isShelfChoiceMarkerFeedbackPolicy(policyVersion) ? projected.map(choice => {
    const opened = choice.action.type === 'interact'
      ? experience?.exploration.recentShelves.find(shelf => shelf.id === (choice.action as { station: string }).station)?.timesOpened ?? 0 : 0;
    return opened < 1 ? choice : { ...choice, label: `${choice.label} · 최근에 ${opened}번 열어 본 진열대`,
      recentVisit: { timesOpened: opened },
      effect: 'Opens this shelf again. This person already opened it within the retained recent experience, and it displays the same shelf as before; products seen there are in experience.exploration.recentShelves. The marker describes observed experience and does not forbid or discourage any particular purpose.' };
  }) : projected;
  const visited = isPassageMarkerFeedbackPolicy(policyVersion) ? marked.map(choice => markRecentPassageVisit(choice,
    choice.action.type === 'walkToAnchor' ? choice.action.anchorId : undefined, experience)) : marked;
  const read = experience?.checks.listReadActionsAgo ?? null;
  const listed = isProgressNoteFeedbackPolicy(policyVersion) && read !== null ? visited.map(choice => choice.action.type !== 'readList' ? choice : {
    ...choice, label: `${choice.label} · ${read === 0 ? '방금' : `${read}번의 행동 전에`} 읽음, 최근 ${experience!.limits.retentionActions}번의 행동 안에 ${experience!.checks.listReadsInRetention ?? 1}번 읽음`,
    recentRead: { actionsAgo: read, timesRead: experience!.checks.listReadsInRetention ?? 1 },
    effect: 'Reads the current shopping list again. Nothing this person does in the store changes what the list says, so it shows the same items as the last reading; its contents still appear only in the next observation. The marker describes observed experience and does not forbid reading again when this person is unsure.',
  }) : visited;
  const grouped = isStructuredFeedbackPolicy(policyVersion) ? parameterizeProductChoices(listed, observation, policyVersion) : listed;
  // Hash-like ids were copied wrongly or rebuilt from other ids in the frame. Short labels are valid for this frame only.
  return isPassageMarkerFeedbackPolicy(policyVersion)
    ? grouped.map((choice, index) => ({ ...choice, id: `c${String(index + 1).padStart(2, '0')}` })) : grouped;
}

function stablePersona(persona: ActorPersona) {
  if ('scope' in persona) return {
    ...structuredClone(persona), description: persona.scope,
    individualInstructions: [persona.scope, ...persona.strengths, ...persona.initialSupportNeeds,
      ...persona.preferences, ...persona.learningInstructions].join('\n'),
  };
  const personal = buildWholeTracePersonaInput(persona);
  const character = persona.character;
  return {
    id: persona.id, version: persona.version, name: persona.name, description: persona.description,
    individualInstructions: personal.individualInstructions,
    timingBaseline: { walkSpeed: personal.timingBaseline.walkSpeed },
    ...(character === undefined ? {} : { character: {
      ...pick(character, ['name', 'age', 'goal']),
      selectedTraits: [...character.selectedTraits], strengths: [...character.strengths],
      preferences: [...character.preferences], familiarCategories: [...character.familiarCategories],
      familiarProductIds: [...character.familiarProductIds], practicedStrategies: [...character.practicedStrategies],
      ...(character.learningProfile === undefined ? {} : { learningProfile: {
        baseline: character.learningProfile.baseline,
        practiceFocus: [...character.learningProfile.practiceFocus],
        transferConditions: [...character.learningProfile.transferConditions],
      } }),
    } }),
    // A traitMode:'omitted' baseline has traits:null and sends no trait levels.
    ...(!persona.traitProfile?.traits ? {} : { traits: pick(persona.traitProfile.traits,
      ['deliberation', 'checking', 'exploration', 'persistence', 'helpSeeking']) }),
  };
}

const FEEDBACK_ACTOR_INSTRUCTIONS = `${ACTOR_PERSONA_INSTRUCTIONS}
Choose exactly one currently available choice, then provide the complete replacement memory to carry to the next decision. Decisions receive only the current displayed observation, this stable individual profile and your previous authored memory. There is no full map, future observation, persistent shopping-list copy, factual visit archive or automatically maintained goal ledger.
Memory is a bounded public fictional behavior summary, never private reasoning. rememberedItems contains what this person currently believes or recalls: name and quantity may be null, incorrect or incomplete; certainty may be clear even when mistaken. pending/done/abandoned describe this person's belief, not verified purchases. An item may be omitted or forgotten and a task may be marked done without buying anything. No goal must be retained, selected, completed or corrected. A list read supplies current displayed information, not guaranteed understanding or permanent perfect recall. A cart shows its current contents, not the forgotten requested answer. Do not copy every visible fact into memory automatically.
Keep at most 12 rememberedItems with {name,quantity,certainty,status}, currentTask as a short observable activity or null, and at most 8 short notes. name/currentTask/each note are at most 300 characters; quantity is null or an integer in 0..99. These are technical storage bounds, not clinical memory capacity. Notes describe brief remembered facts or activity, not reasoning steps. Use no extra memory fields. Your replacement may be empty or unchanged. The controller validates syntax and size only and never compares belief names/counts/completion with hidden answers or restores deleted items.
Use the individual's actual traits and familiar preferences in the current situation. Familiar products do not reveal this store's hidden layout or today's list. Mistakes, uncertainty, checking, support, interest, stopping and successful independent action are all possible; no fixed number of errors, detours, checks or help requests is required. Do not manufacture errors to satisfy a diagnosis, and do not repair the basket merely to achieve a perfect result. Choose from the presented legal controls; ordering is neutral, not a recommendation.
Return choiceId, durationMs, reason and memory. There is no delay before an action. Ordinary actions (walking, opening or closing a shelf, adding or removing, requesting staff, checkout, submit, giveUp) require durationMs:0. For hesitation choose pause explicitly. Only pause, lookAround, readList and browse take an actor-selected activity duration of 100..120000 ms. viewCart and viewHelp allow 0..120000 ms spent inspecting AFTER the panel opens; use 0 for opening without inspection. These bounds are technical limits, not target times. Choice action.durationMs:0 is an unfilled template, not a suggested duration. Choose the duration for this particular activity and individual; do not copy a fixed wait onto every action. Movement, gesture execution, panel transitions and server acceptance have their own real execution time and must not be added to durationMs.`;

const FREE_MOVEMENT_INSTRUCTIONS = `Directional controls are available whenever the world controls are unlocked, even when no object or passage is visible. You may walk, wander, retrace your steps or stop without a destination or a shopping-related reason. A short description of the action is enough. For moveDirection only, durationMs is how long to hold the control (integer 100..2000 ms), not a pre-action wait or extra inspection. Other walking controls still require 0. The input may move fully, partly, or be blocked; use the next current observation and actual movement result. No unseen destination, route or preferred direction is supplied. An unlabelled shelf body only indicates a visible structure, not its category or products.`;

const MOVEMENT_POLICY_INSTRUCTIONS = `The movementPolicy field is an explicit synthetic movement rule, separate from your authored belief memory. Recently fully blocked directions may be temporarily absent based only on actual movement feedback. In blocked-recovery mode, choose another offered direction. In random-wander mode, this decision has been selected for walking without a destination or shopping purpose. In either mode choose one offered direction and its input duration; do not invent a visible target or claim that a different action happened. These two modes intentionally offer only directional movement. In actor-choice mode choose normally from all offered controls. The controller selected the movement mode; your choice of direction and duration remains yours. The rule provides no map, route, hidden products or corrected goal memory.`;

const RECENT_EXPERIENCE_INSTRUCTIONS = `experience is a bounded record of recently applied actions and their observable results, separate from your authored beliefs. It is not a complete history, map, permanent list, route or goal ledger. A shelf's recorded products are only what was actually displayed on recorded pages; an uninspected page may contain something else. Old facts expire. Do not invent visits or infer the contents of unseen shelves.
Use recentActions, check ages and cart changes when deciding whether another check is useful. If you just checked the same information and nothing relevant changed, you can continue your ongoing activity instead of automatically checking again. Rechecking remains possible for uncertainty, a discrepancy, changed contents, or this individual's needs; there is no repeat ban or mandatory success. Compare a currently visible cart or applied add/remove result with your beliefs and update mistaken completion when the individual notices it; the controller never fixes beliefs or purchases for you.
currentTask describes the immediate activity. ongoingIntent is a separate short, actor-selected continuing intention, such as looking for a remembered item or exploring a passage. Checking a list/cart or closing a panel does not by itself abandon it. Omit ongoingIntent to carry it unchanged; set a short string to select or change it, or null to explicitly finish, abandon or forget it. No task is assigned automatically and no hidden goal is restored. Resume the continuing intention after a brief check when appropriate. If exploring, use the recent direction and observed visits to continue along a passage or recognize a revisit; changing direction, interest, wandering and stopping remain available. These summaries are fictional behavior context, not a measurement of human cognition.`;

const V4_MOVEMENT_POLICY_INSTRUCTIONS = `movementPolicy is an explicit synthetic exploration cue. Its random-wander mode suggests walking without a shopping purpose; blocked-recovery suggests trying a different offered direction after an observed block. Neither mode requires walking: nearby shelf interactions and all other legal nonmovement controls, including checks and stopping, remain available. You may interrupt wandering to inspect a newly reached shelf. Only recently fully blocked directional controls are temporarily excluded. Use actual movement results and recent exploration context without inventing a destination or route. The controller selects the cue, while the action, direction and duration are your choices.`;

const V4_ACTOR_INSTRUCTIONS = FEEDBACK_ACTOR_INSTRUCTIONS
  .replace('provide the complete replacement memory to carry to the next decision.', 'provide updated belief memory to carry to the next decision.')
  .replace('Decisions receive only the current displayed observation, this stable individual profile and your previous authored memory.', 'Decisions receive the current displayed observation, this stable individual profile, your previous authored memory and bounded recent observed experience.')
  .replace('factual visit archive', 'unbounded factual visit archive')
  .replace('Use no extra memory fields. Your replacement may be empty or unchanged.', 'v4 also permits ongoingIntent as null or 1..300 characters, with the carry semantics below. Use no other memory fields. rememberedItems, currentTask and notes are replaced; they may be empty or unchanged.')
  + '\n' + RECENT_EXPERIENCE_INSTRUCTIONS;

// Technical presentation changes only. The v4 persona, memory, movement and freedom to err remain intact.
const V5_ACTOR_INSTRUCTIONS = V4_ACTOR_INSTRUCTIONS
  .replace('Return choiceId, durationMs, reason and memory.', 'Return choiceId, durationMs, reason and memory. For a choice with parameterSchema, also return choiceParameters containing exactly its required fields. Choose productId from that choice catalog and quantity from that product\'s own allowed range; for add also choose dragOutcome. miss/cancel are available only with quantity 1. Omit choiceParameters for all other choices. The grouped action type is not a filled action: no product, quantity or outcome is supplied by default.')
  .replace('v4 also permits ongoingIntent', 'This policy also permits ongoingIntent');

// Restore the individual's stated motivation and concrete strategies without adding a reminder, goal slot or success gate.
const V6_ACTOR_INSTRUCTIONS = V5_ACTOR_INSTRUCTIONS
  .replace('An item may be omitted or forgotten and a task may be marked done without buying anything. No goal must be retained, selected, completed or corrected.',
    'The person may forget an item, change their mind, stop, or mistakenly believe a task is done. These are permitted outcomes, not activities to produce. Preserve this individual\'s stated wishes and strengths as well as their difficulties: pursue what they currently remember and understand in their own way, including their shopping purpose and personal interests. There is no requirement to retain every goal, choose the correct item, or complete the shopping.')
  .replace('Do not manufacture errors to satisfy a diagnosis, and do not repair the basket merely to achieve a perfect result.',
    'Do not manufacture errors to satisfy a diagnosis or optimize the basket for a perfect score. Familiar choices, checking concrete displayed information and self-correction noticed by this individual are also part of the profile; do not suppress them merely because an error or distraction occurred.')
  + '\nDescribe the immediate activity and any continuing intention in the existing currentTask and ongoingIntent fields, at the level this person currently chooses. A remembered item or observed shelf can be named when it is actually part of that activity; uncertainty, exploration, an interest and stopping are also valid. Do not invent a concrete goal when the person is unsure, construct a full task plan, or automatically return to shopping after every distraction. No new memory or forced goal restoration is provided.';

// Disambiguate existing fallible beliefs and observed checking context without adding a goal ledger.
const V7_ACTOR_INSTRUCTIONS = V6_ACTOR_INSTRUCTIONS
  .replace('Keep at most 12 rememberedItems with {name,quantity,certainty,status},',
    'Keep at most 12 rememberedItems with {name,quantity,certainty,status} and optional source and rememberedCartQuantity,')
  .replace('No new memory or forced goal restoration is provided.',
    'No hidden goal or forced goal restoration is provided; the optional item fields below separate kinds of fallible belief without increasing the number of stored items or notes.')
  + `
In v7 rememberedItems.quantity is the desired TOTAL quantity this person currently believes they want, not a command to add that many more units. rememberedCartQuantity is the last in-cart amount this person believes they observed or understood from an applied result; it may be omitted, null, stale or wrong. It is null or an integer in 0..99. Do not automatically fill it from an unseen cart or treat an old value as current fact. Neither quantity is a verified target or stock ledger. When this individual notices a difference between a believed desired total and an actually observed or remembered cart amount, they may choose an increment or decrement, continue another activity, or recheck. No subtraction, correction or purchase is forced by the controller.
Optional source describes the person's belief about this remembered item's origin: list means they believe it came from the shopping list; personal means their own interest or preference; uncertain means they are unsure. A personally interesting product is not evidence that it was on the list. Source itself can be mistaken, uncertain, omitted or forgotten; no validator checks it against a hidden list. Keep both quantities, source, certainty and pending/done/abandoned as authored beliefs. Omitting an item still forgets it and omitted optional fields are not reconstructed.
experience.checks.cartChangedSinceLastCartView refers to observed cart changes AFTER the most recent successful cart opening within the bounded retention window. It is separate from cartChangedSinceListRead: a change after reading the list can remain true even after that change has already been checked in the cart. false means no subsequent change was observed, true means a change was observed, and null means unknown or expired. Use this distinction together with current visible information and recentActions when deciding whether another cart check is useful. A recent unchanged check may let this person continue what they were doing; rechecking, uncertainty and changing their mind remain possible. This cue supplies no desired product or correct quantity.
A brief list/cart check or closing its panel need not replace ongoingIntent with another check. Keep the already chosen continuing activity when that is still this person's intention, and describe a concrete next activity only when they currently choose one. currentTask may describe the immediate check while ongoingIntent remains the activity to return to. There is no automatic return, mandatory plan, or default shopping goal; choosing a new interest, forgetting, pausing and stopping remain valid.
Memory in this response is written from the current observation and already applied recent results BEFORE the selected action executes. Selecting add/remove/viewCart/readList does not mean its outcome has already occurred or been seen. The next actual observation may support updating the person's beliefs; do not treat a carried pre-action count or a planned outcome as an observed post-action count. For grouped add/remove choices, choiceParameters.quantity is the action increment/decrement, never a final target total. Choose the productId from that action's offered catalog and describe that exact selected product and amount in reason. The reason is a brief public action description, not private reasoning; it cannot redirect or silently correct the selected action.`;

// Same observation, beliefs and freedom to err as v7. Only the order of reflecting a result and naming what follows changes.
const V8_ACTOR_INSTRUCTIONS = V7_ACTOR_INSTRUCTIONS
  .replace('currentTask describes the immediate activity. ongoingIntent is a separate short,',
    'nextStep describes what this person expects to do after the action chosen now. ongoingIntent is a separate short,')
  .replace('currentTask may describe the immediate check while ongoingIntent remains the activity to return to.',
    'nextStep may name what follows the check while ongoingIntent remains the activity to return to.')
  .replace('Describe the immediate activity and any continuing intention in the existing currentTask and ongoingIntent fields,',
    'Describe what follows the chosen action and any continuing intention in the nextStep and ongoingIntent fields,')
  .replace('currentTask as a short observable activity or null', 'nextStep as a short observable activity or null')
  .replaceAll('currentTask', 'nextStep')
  + `
In v8 the frame adds lastAction: the controller-recorded previous applied action and its observable result, or null before the first action. It states what has already been done. It is not an instruction and not a task to repeat. There is no currentTask field.
Work in this order. First, reflect lastAction's result and the current observation in memory. An accepted add means that many units went into the basket, so this person's rememberedCartQuantity for that product can rise by that amount; an accepted remove lowers it; accepted:false means the basket did not change. The memory you received was written before lastAction ran, so do not carry its pre-action count forward merely because it was written that way. This person can still overlook or misjudge a result. Second, choose one action for now. Third, write nextStep: what this person expects to do AFTER the action chosen now has been carried out, or null when undecided. nextStep never restates the action chosen now; the controller records that action and returns it as the next frame's lastAction. In the next frame treat the carried nextStep as an earlier plan that the new result may confirm, change or cancel.
In an open shelf each displayed product has inCart. The shelf's own add control shows whether at least one of that product is already in the basket; it does not show how many, and the opened basket shows amounts. This is displayed screen information about the basket, not a comparison with any list. When this person believes the wanted amount of an item is in the basket they may mark it done and turn to another remembered item or activity. Marking, forgetting, rechecking and changing their mind remain this person's choice; the controller never marks or corrects an item.`;

// v8 plus a worded restatement of experience the frame already carries as numbers, and no giveUp choice.
const V9_ACTOR_INSTRUCTIONS = V8_ACTOR_INSTRUCTIONS.replace('checkout, submit, giveUp)', 'checkout, submit)') + `
In v9 the frame adds revisitNotes: short controller-written sentences about shelves this person opened more than once within the retained recent experience, with the products that were displayed there. They restate experience.exploration.recentShelves in words and add no other information. They are bounded and expire like that experience, an unseen shelf page may hold something else, and they never compare a shelf with the shopping list or with your remembered items. When what this person is looking for was not among the products they saw at a shelf, opening that shelf again shows the same products; they can look at another visible shelf or walk somewhere they have not been. Reopening a shelf out of interest or uncertainty remains this person's choice, and an empty list means no such revisit is retained.
In v9 there is no choice that ends the visit without checkout. Pausing, looking around, wandering, asking staff and leaving items out remain this person's choice. The visit ends when this person confirms the purchase at a checkout; if 100 actions pass first, the controller takes the basket exactly as it is to a checkout, and that ending is recorded as the controller's, not this person's.`;

const V10_ACTOR_INSTRUCTIONS = V9_ACTOR_INSTRUCTIONS + `
In v10 a choice that opens a shelf this person already opened within the retained recent experience carries recentVisit.timesOpened and says so in its label. It is the same control as before with the same effect; only the description is added. A choice without the marker opens a shelf not opened within that retained experience. Use the marker together with what this person is currently looking for: reopening is still available for interest, uncertainty or an uninspected page, and no choice is recommended or removed.`;

const V11_ACTOR_INSTRUCTIONS = V10_ACTOR_INSTRUCTIONS + `
In v11 the frame adds movementNotes: short controller-written sentences about where this person walked within the retained recent experience, restating experience.exploration.recentMovement in words. They count this person's own applied walking by screen direction, name the directions not walked in that window, and, when every retained walk was a directional input, say whether the walking ended close to where it began. They contain no map, position, destination or shelf location, and a direction not walked is only a direction not tried recently: it may be open, blocked or lead nowhere new. When this person keeps looking for something they have not found where they have been, a direction not yet walked is somewhere they have not looked. Walking back and forth, staying, and changing their mind remain this person's choice. An empty list means too little recent walking to describe.`;

const V12_ACTOR_INSTRUCTIONS = V11_ACTOR_INSTRUCTIONS + `
In v12 every choice id is a short label such as c07 that is valid for this frame only; return it exactly as written and never build an id from other text. Passages carry no ids anywhere in the frame: a walk-to-passage choice is described by its direction and distance, and one that this person walked to within the retained recent experience carries recentVisit.timesArrived and says so in its label. A passage choice without that marker leads somewhere this person has not walked to within that window; it may still be a place they saw or passed. The marker is observed experience, not a prohibition or a recommendation, and walking back to a visited passage remains this person's choice.`;

const V13_ACTOR_INSTRUCTIONS = V12_ACTOR_INSTRUCTIONS + `
In v13 the read-list choice carries recentRead and says in its label how many actions ago the list was read and how often within the retained recent experience. Reading again shows the same list; when this person still remembers what it said, they can go on with what they were doing instead. Reading again remains their choice when they are unsure.
The frame also adds progressNotes: short controller-written sentences. The first restates the memory you received, naming which remembered items this person has marked done, still pending or abandoned, and whether every item they believe came from the list is marked done. It repeats your own beliefs, which may be mistaken; nothing is checked against the list or the basket and no item is marked for you. The next states how this visit ends: the purchase has not been confirmed yet, and shopping is finished only by confirming the purchase at a checkout counter. The last says when a checkout counter was last on screen during this visit and where it was displayed then; that direction was true from where this person stood at that time. When this person believes they have what they came for, going to a checkout counter and confirming the purchase is the next part of shopping. Looking at more shelves, buying something else, or leaving items out before that remain this person's choice.`;

const MOVEMENT_NOTE_MINIMUM_WALKS = 4;
const DIRECTION_WORDS = { north: '위쪽', northeast: '오른쪽 위', east: '오른쪽', southeast: '오른쪽 아래',
  south: '아래쪽', southwest: '왼쪽 아래', west: '왼쪽', northwest: '왼쪽 위' } as const;

/** Words for the actor's own retained walking only; never a route, a position or a recommended direction. */
export function recentMovementNotes(experience: FeedbackExperienceSnapshot): string[] {
  const movement = experience.exploration.recentMovement;
  if (!movement || movement.walks < MOVEMENT_NOTE_MINIMUM_WALKS) return [];
  const directions = Object.keys(DIRECTION_WORDS) as (keyof typeof DIRECTION_WORDS)[];
  const walked = directions.filter(direction => movement.byDirection[direction])
    .sort((a, b) => movement.byDirection[b]! - movement.byDirection[a]!);
  const notWalked = directions.filter(direction => !movement.byDirection[direction]);
  const blocked = directions.filter(direction => movement.blockedByDirection[direction]);
  const notes = [`최근 ${experience.limits.retentionActions}번의 행동 안에 ${movement.walks}번 걸었습니다: `
    + walked.map(direction => `${DIRECTION_WORDS[direction]} ${movement.byDirection[direction]}번`).join(', ') + '.'
    + (notWalked.length ? ` 그동안 걷지 않은 방향: ${notWalked.map(direction => DIRECTION_WORDS[direction]).join(', ')}.` : '')
    + (blocked.length ? ` 막혔던 방향: ${blocked.map(direction => `${DIRECTION_WORDS[direction]} ${movement.blockedByDirection[direction]}번`).join(', ')}.` : '')];
  // Only measured directional input can say this; a passage walk has no displacement in the actor's experience.
  if (movement.directional && movement.directional.travelledPx > 0 && movement.directional.netPx * 4 <= movement.directional.travelledPx)
    notes.push('그 걸음들은 오간 끝에 처음 자리 가까이에서 끝났습니다.');
  return notes;
}

/** The v12 label is applied only to an already available control; it never changes availability or order. */
export function markRecentPassageVisit<T extends { label: string }>(choice: T, anchorId: string | undefined,
  experience?: FeedbackExperienceSnapshot): T | (T & { recentVisit: { timesArrived: number } }) {
  const arrived = anchorId === undefined ? 0
    : experience?.exploration.passageArrivals?.find(passage => passage.id === anchorId)?.arrivals ?? 0;
  return arrived < 1 ? choice : { ...choice, label: `${choice.label} · 최근에 ${arrived}번 간 통로`, recentVisit: { timesArrived: arrived } };
}

const DISTANCE_WORDS: Record<string, string> = { near: '가까이', medium: '조금 떨어진 곳', far: '멀리' };

/** The actor's own beliefs and the visit's ending, in words. No list, basket or goal comparison and no completed step. */
function progressNotes(memory: FeedbackBeliefMemory, experience: FeedbackExperienceSnapshot, observation: ActorObservation): string[] {
  const notes: string[] = [];
  const named = memory.rememberedItems.filter(item => item.name !== null);
  const names = (status: string) => named.filter(item => item.status === status).map(item => item.name).join(', ');
  if (named.length) {
    const fromList = named.filter(item => item.source === 'list');
    notes.push(`지금 기억에 남긴 물건 ${named.length}가지:`
      + (names('done') ? ` 끝난 것으로 표시한 물건은 ${names('done')}.` : '')
      + (names('pending') ? ` 아직 남은 것으로 표시한 물건은 ${names('pending')}.` : '')
      + (names('abandoned') ? ` 그만둔 것으로 표시한 물건은 ${names('abandoned')}.` : '')
      + (fromList.length && fromList.every(item => item.status === 'done') ? ' 목록에서 왔다고 기억한 물건은 모두 끝난 것으로 표시되어 있습니다.' : ''));
  }
  notes.push(observation.phase === 'checkout'
    ? '지금 계산대 화면입니다. 아직 구매를 확정하지 않았습니다. 구매를 확정하면 이번 장보기가 끝납니다.'
    : '아직 구매를 확정하지 않았습니다. 이번 장보기는 고른 물건을 가지고 계산대에서 구매를 확정해야 끝납니다.');
  const seen = experience.exploration.lastCheckoutSeen;
  if (observation.phase !== 'checkout') notes.push(!seen ? '이번 방문에서 아직 계산대를 화면에서 본 적이 없습니다.'
    : seen.actionsAgo === 0 ? `지금 화면의 ${DIRECTION_WORDS[seen.direction]} ${DISTANCE_WORDS[seen.distanceBand] ?? ''}에 계산대가 보입니다.`.replace('  ', ' ')
      : `계산대를 마지막으로 화면에서 본 것은 ${seen.actionsAgo}번의 행동 전이고, 그때 서 있던 자리에서 ${DIRECTION_WORDS[seen.direction]} ${DISTANCE_WORDS[seen.distanceBand] ?? ''}에 있었습니다.`.replace('  ', ' '));
  return notes;
}

/** Words only for shelves opened at least twice; never a goal comparison or a count beyond the retained window. */
function shelfRevisitNotes(experience: FeedbackExperienceSnapshot): string[] {
  return experience.exploration.recentShelves.filter(shelf => shelf.timesOpened >= 2).map(shelf => {
    const name = shelf.label === null ? '이름을 보지 못한 진열대' : `'${shelf.label}' 진열대`;
    const products = shelf.observedProducts.map(product => product.name);
    return `${name}를 최근 ${experience.limits.retentionActions}번의 행동 안에 ${shelf.timesOpened}번 열었습니다. `
      + (products.length ? `거기서 본 상품: ${products.join(', ')}.` : '거기서 본 상품은 기록에 없습니다.');
  });
}

export type FeedbackActorFrame = {
  policyVersion: FeedbackActorPolicyVersion;
  instructions: string;
  observation: ActorObservation;
  memory: FeedbackBeliefMemory;
  persona: ReturnType<typeof stablePersona>;
  availableChoices: FeedbackActorChoice[];
  movementPolicy?: MarketReplayMovementPolicyDecision;
  experience?: FeedbackExperienceSnapshot;
  /** v8: the previous applied action and its observable result, recorded by the controller. Never a goal or instruction. */
  lastAction?: FeedbackExperienceSnapshot['recentActions'][number] | null;
  /** v9: worded restatement of repeatedly opened shelves from the bounded experience. */
  revisitNotes?: string[];
  /** v11: worded restatement of the actor's own retained walking by direction. */
  movementNotes?: string[];
  /** v13: worded restatement of the actor's own item beliefs, the visit's ending rule and the last checkout sighting. */
  progressNotes?: string[];
};

export function buildFeedbackActorFrame(args: {
  observation: ActorObservation; persona: ActorPersona; memory: FeedbackBeliefMemory;
  seed: string | number; decisionIndex: number;
  policyVersion?: FeedbackActorPolicyVersion;
  movementPolicy?: MarketReplayMovementPolicyDecision;
  experience?: FeedbackExperienceSnapshot;
}): FeedbackActorFrame {
  const policyVersion = args.policyVersion ?? FEEDBACK_ACTOR_POLICY_VERSION;
  const validation = validateFeedbackBeliefMemory(args.memory, policyVersion);
  if (!validation.valid) throw new Error(`Invalid feedback belief memory: ${validation.errors.join('; ')}`);
  if (!Number.isInteger(args.decisionIndex) || args.decisionIndex < 0) throw new Error('decisionIndex must be a nonnegative integer');
  const observation = projectFeedbackObservation(args.observation, policyVersion);
  const exploration = policyVersion === 'feedback-choice-v3' || isExperienceFeedbackPolicy(policyVersion);
  if (exploration !== (args.movementPolicy !== undefined))
    throw new Error('Only feedback-choice-v3/v4 require a prepared movement policy context');
  if (args.movementPolicy && args.movementPolicy.version !== (isExperienceFeedbackPolicy(policyVersion) ? 'exploration-v2' : 'exploration-v1'))
    throw new Error('Feedback frame movement policy version mismatch');
  if (isExperienceFeedbackPolicy(policyVersion) !== (args.experience !== undefined))
    throw new Error('Only feedback-choice-v4 requires bounded recent experience');
  if (isQuantityBeliefFeedbackPolicy(policyVersion) && args.experience?.version !== 'bounded-observed-experience-v2')
    throw new Error(`${policyVersion} requires bounded-observed-experience-v2`);
  const movementPolicy = args.movementPolicy === undefined ? undefined : structuredClone(args.movementPolicy);
  const instructions = policyVersion === 'feedback-choice-v13' ? V13_ACTOR_INSTRUCTIONS
    : policyVersion === 'feedback-choice-v12' ? V12_ACTOR_INSTRUCTIONS
    : policyVersion === 'feedback-choice-v11' ? V11_ACTOR_INSTRUCTIONS
    : policyVersion === 'feedback-choice-v10' ? V10_ACTOR_INSTRUCTIONS
    : policyVersion === 'feedback-choice-v9' ? V9_ACTOR_INSTRUCTIONS
    : policyVersion === 'feedback-choice-v8' ? V8_ACTOR_INSTRUCTIONS
    : policyVersion === 'feedback-choice-v7' ? V7_ACTOR_INSTRUCTIONS
    : policyVersion === 'feedback-choice-v6' ? V6_ACTOR_INSTRUCTIONS
      : policyVersion === 'feedback-choice-v5' ? V5_ACTOR_INSTRUCTIONS
      : policyVersion === 'feedback-choice-v4' ? V4_ACTOR_INSTRUCTIONS : FEEDBACK_ACTOR_INSTRUCTIONS;
  return {
    policyVersion, instructions: policyVersion !== 'feedback-choice-v1'
      ? instructions.replace('Ordinary actions (walking,', 'Ordinary actions (anchor walking,')
        .replace('Only pause,', 'The stationary activities pause,').replace('Movement, gesture execution,', 'Anchor movement, gesture execution,') + '\n' + FREE_MOVEMENT_INSTRUCTIONS
        + (movementPolicy ? '\n' + (isExperienceFeedbackPolicy(policyVersion) ? V4_MOVEMENT_POLICY_INSTRUCTIONS : MOVEMENT_POLICY_INSTRUCTIONS) : '')
      : FEEDBACK_ACTOR_INSTRUCTIONS,
    observation, memory: structuredClone(args.memory), persona: stablePersona(args.persona),
    availableChoices: currentChoices(observation, args.seed, args.decisionIndex, policyVersion, movementPolicy, args.experience),
    ...(movementPolicy ? { movementPolicy } : {}),
    ...(args.experience ? { experience: structuredClone(args.experience) } : {}),
    ...(isResultReflectionFeedbackPolicy(policyVersion)
      ? { lastAction: structuredClone(args.experience!.recentActions.at(-1) ?? null) } : {}),
    ...(isRevisitNoteFeedbackPolicy(policyVersion) ? { revisitNotes: shelfRevisitNotes(args.experience!) } : {}),
    ...(isMovementNoteFeedbackPolicy(policyVersion) ? { movementNotes: recentMovementNotes(args.experience!) } : {}),
    ...(isProgressNoteFeedbackPolicy(policyVersion) ? { progressNotes: progressNotes(args.memory, args.experience!, observation) } : {}),
  };
}

/** The complete frame resolves a chosen control; this is the form an actor may read.
 * v12 removes passage ids everywhere so no id-like text can be mistaken for a choice id. Earlier policies are returned unchanged. */
export function presentFeedbackActorFrame<T extends FeedbackActorFrame>(frame: T): T {
  const presented = structuredClone(frame);
  if (!isPassageMarkerFeedbackPolicy(frame.policyVersion)) return presented;
  const strip = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(strip); return; }
    if (!plain(value)) return;
    delete value.anchorId;
    Object.values(value).forEach(strip);
  };
  strip(presented);
  for (const anchor of presented.observation.anchors) delete (anchor as { id?: string }).id;
  if (presented.experience) {
    for (const passage of presented.experience.exploration.recentPassages) delete (passage as { id?: string }).id;
    delete presented.experience.exploration.passageArrivals;
  }
  return presented;
}
