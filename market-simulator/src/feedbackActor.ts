import { extendedActorChoices, presentActorChoices, type ExtendedActorChoice } from './actorChoices';
import { ACTOR_PERSONA_INSTRUCTIONS } from './actorInstructions';
import type { ActorObservation, ActorPersona, Decision, PolicyAction } from './types';
import { buildWholeTracePersonaInput } from './wholeTracePersona';
import type { MarketReplayMovementPolicyDecision } from '../../frontend/src/game/marketReplayTrace';
import type { FeedbackExperienceSnapshot } from './feedbackExperience';

export const FEEDBACK_ACTOR_POLICY_VERSION = 'feedback-choice-v7' as const;
export type FeedbackActorPolicyVersion = 'feedback-choice-v1' | 'feedback-choice-v2' | 'feedback-choice-v3' | 'feedback-choice-v4' | 'feedback-choice-v5' | 'feedback-choice-v6' | 'feedback-choice-v7';
export function isFeedbackActorPolicy(value?: string): value is FeedbackActorPolicyVersion {
  return value === 'feedback-choice-v1' || value === 'feedback-choice-v2' || value === 'feedback-choice-v3' || isExperienceFeedbackPolicy(value);
}
export function isExperienceFeedbackPolicy(value?: string): value is 'feedback-choice-v4' | 'feedback-choice-v5' | 'feedback-choice-v6' | 'feedback-choice-v7' {
  return value === 'feedback-choice-v4' || isStructuredFeedbackPolicy(value);
}
export function isStructuredFeedbackPolicy(value?: string): value is 'feedback-choice-v5' | 'feedback-choice-v6' | 'feedback-choice-v7' {
  return value === 'feedback-choice-v5' || value === 'feedback-choice-v6' || value === 'feedback-choice-v7';
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
  currentTask: string | null;
  notes: string[];
  /** v4: omitted updates retain this actor-selected intent; explicit null clears it. */
  ongoingIntent?: string | null;
};

export function emptyFeedbackBeliefMemory(policyVersion?: FeedbackActorPolicyVersion): FeedbackBeliefMemory {
  return { rememberedItems: [], currentTask: null, notes: [],
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
  if (!onlyKeys(value, ['rememberedItems', 'currentTask', 'notes', ...(isExperienceFeedbackPolicy(policyVersion) ? ['ongoingIntent'] : [])])) errors.push('memory has unknown fields');
  if (Object.prototype.hasOwnProperty.call(value, 'ongoingIntent') && value.ongoingIntent !== null && !shortText(value.ongoingIntent))
    errors.push('memory.ongoingIntent must be null or 1..300 characters');
  if (value.currentTask !== null && !shortText(value.currentTask)) errors.push('memory.currentTask must be null or 1..300 characters');
  if (!Array.isArray(value.rememberedItems) || value.rememberedItems.length > 12) {
    errors.push('memory.rememberedItems must be an array of at most 12 items');
  } else value.rememberedItems.forEach((item, index) => {
    const at = `memory.rememberedItems[${index}]`;
    if (!plain(item)) { errors.push(`${at} must be a JSON object`); return; }
    if (!onlyKeys(item, ['name', 'quantity', 'certainty', 'status',
      ...(policyVersion === 'feedback-choice-v7' ? ['source', 'rememberedCartQuantity'] : [])])) errors.push(`${at} has unknown fields`);
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
    products: observation.products.map(product => pick(product, ['id', 'categoryId', 'name', 'detail', 'price', 'stock'])),
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
    result.push({ id: `choice-${type}-product`, label: policyVersion === 'feedback-choice-v7'
      ? (type === 'add' ? '선택한 상품을 해당 수량만큼 추가로 담기' : '선택한 상품을 해당 수량만큼 빼기')
      : type === 'add' ? '상품과 수량을 골라 담기' : '상품과 수량을 골라 내려놓기',
      action: { type }, catalog,
      parameterSchema: { type: 'object', additionalProperties: false,
        required: ['productId', 'quantity', ...(type === 'add' ? ['dragOutcome'] : [])],
        properties: { productId: { type: 'string', enum: catalog.map(item => item.productId) },
          quantity: { type: 'integer', minimum: Math.min(...catalog.map(item => item.quantity.minimum)),
            maximum: Math.max(...catalog.map(item => item.quantity.maximum)) },
          ...(type === 'add' ? { dragOutcome: { type: 'string' as const, enum: ['drop', 'miss', 'cancel'] as ('drop' | 'miss' | 'cancel')[] } } : {}) } },
      effect: policyVersion === 'feedback-choice-v7' ? (type === 'add'
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
  policyVersion: FeedbackActorPolicyVersion, movementPolicy?: MarketReplayMovementPolicyDecision): FeedbackActorChoice[] {
  const choices: (ExtendedActorChoice & {dragOutcome?: 'miss' | 'cancel'})[] = extendedActorChoices(observation);
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
  return isStructuredFeedbackPolicy(policyVersion) ? parameterizeProductChoices(projected, observation, policyVersion) : projected;
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
    ...(persona.traitProfile === undefined ? {} : { traits: pick(persona.traitProfile.traits,
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

export type FeedbackActorFrame = {
  policyVersion: FeedbackActorPolicyVersion;
  instructions: string;
  observation: ActorObservation;
  memory: FeedbackBeliefMemory;
  persona: ReturnType<typeof stablePersona>;
  availableChoices: FeedbackActorChoice[];
  movementPolicy?: MarketReplayMovementPolicyDecision;
  experience?: FeedbackExperienceSnapshot;
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
  if (policyVersion === 'feedback-choice-v7' && args.experience?.version !== 'bounded-observed-experience-v2')
    throw new Error('feedback-choice-v7 requires bounded-observed-experience-v2');
  const movementPolicy = args.movementPolicy === undefined ? undefined : structuredClone(args.movementPolicy);
  const instructions = policyVersion === 'feedback-choice-v7' ? V7_ACTOR_INSTRUCTIONS
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
    availableChoices: currentChoices(observation, args.seed, args.decisionIndex, policyVersion, movementPolicy),
    ...(movementPolicy ? { movementPolicy } : {}),
    ...(args.experience ? { experience: structuredClone(args.experience) } : {}),
  };
}
