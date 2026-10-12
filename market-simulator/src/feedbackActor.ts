import { extendedActorChoices, presentActorChoices, type ExtendedActorChoice } from './actorChoices';
import { ACTOR_PERSONA_INSTRUCTIONS } from './actorInstructions';
import type { ActorObservation, Decision, Persona, PolicyAction } from './types';
import { buildWholeTracePersonaInput } from './wholeTracePersona';

export const FEEDBACK_ACTOR_POLICY_VERSION = 'feedback-choice-v1' as const;

/** The actor's public fictional beliefs, not a factual archive or private reasoning. */
export type FeedbackBeliefMemory = {
  rememberedItems: {
    name: string | null;
    quantity: number | null;
    certainty: 'clear' | 'uncertain';
    status: 'pending' | 'done' | 'abandoned';
  }[];
  currentTask: string | null;
  notes: string[];
};

export function emptyFeedbackBeliefMemory(): FeedbackBeliefMemory {
  return { rememberedItems: [], currentTask: null, notes: [] };
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
export function validateFeedbackBeliefMemory(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!plain(value)) return { valid: false, errors: ['memory must be a JSON object'] };
  if (!onlyKeys(value, ['rememberedItems', 'currentTask', 'notes'])) errors.push('memory has unknown fields');
  if (value.currentTask !== null && !shortText(value.currentTask)) errors.push('memory.currentTask must be null or 1..300 characters');
  if (!Array.isArray(value.rememberedItems) || value.rememberedItems.length > 12) {
    errors.push('memory.rememberedItems must be an array of at most 12 items');
  } else value.rememberedItems.forEach((item, index) => {
    const at = `memory.rememberedItems[${index}]`;
    if (!plain(item)) { errors.push(`${at} must be a JSON object`); return; }
    if (!onlyKeys(item, ['name', 'quantity', 'certainty', 'status'])) errors.push(`${at} has unknown fields`);
    if (item.name !== null && !shortText(item.name)) errors.push(`${at}.name must be null or 1..300 characters`);
    if (item.quantity !== null && (!Number.isInteger(item.quantity) || Number(item.quantity) < 0 || Number(item.quantity) > 99))
      errors.push(`${at}.quantity must be null or an integer in 0..99`);
    if (!['clear', 'uncertain'].includes(item.certainty as string)) errors.push(`${at}.certainty must be clear or uncertain`);
    if (!['pending', 'done', 'abandoned'].includes(item.status as string)) errors.push(`${at}.status must be pending, done or abandoned`);
  });
  if (!Array.isArray(value.notes) || value.notes.length > 8 || value.notes.some(note => !shortText(note)))
    errors.push('memory.notes must contain at most 8 strings of 1..300 characters');
  return { valid: errors.length === 0, errors };
}

function pick<T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]])) as Pick<T, K>;
}

/** Deep allowlist of the current UI projection. Never forward a raw observation or historical archive. */
export function projectFeedbackObservation(observation: ActorObservation): ActorObservation {
  const current: ActorObservation = {
    schemaVersion: 'attention-observation-v1',
    ...pick(observation, ['sequence', 'elapsedMs', 'phase', 'view', 'activeStation', 'listAvailable']),
    visibleStations: observation.visibleStations.map(station => pick(station, ['id', 'kind', 'label', 'direction', 'distanceBand', 'near'])),
    anchors: observation.anchors.map(anchor => pick(anchor, ['id', 'label', 'direction', 'distanceBand'])),
    products: observation.products.map(product => pick(product, ['id', 'categoryId', 'name', 'detail', 'price', 'stock'])),
    shelf: observation.shelf === null ? null : {
      ...pick(observation.shelf, ['page', 'pageCount', 'scrollFraction']),
      ...(observation.shelf.pageFractions === undefined ? {} : { pageFractions: [...observation.shelf.pageFractions] }),
    },
    cart: observation.cart === null ? null : Object.fromEntries(Object.entries(observation.cart).filter(([, count]) => typeof count === 'number' && Number.isFinite(count))),
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
      result: pick(observation.result, ['accepted', 'actionType', 'productId', 'quantity', 'stationId', 'anchorId', 'message']),
    }),
  };
  return current;
}

export type FeedbackActorChoice = Omit<ExtendedActorChoice, 'observedContext'> & {
  dragOutcome?: 'miss' | 'cancel';
  /** Actor selects this duration; any action.durationMs in the template is a placeholder. */
  timing?: { minimumMs: number; maximumMs: number; phase: 'during-action' | 'after-panel-open' };
  observedContext?: Pick<NonNullable<ExtendedActorChoice['observedContext']>, 'label' | 'direction' | 'distanceBand'>;
};

function activityTiming(type: PolicyAction['type']): FeedbackActorChoice['timing'] {
  if (['pause', 'lookAround', 'readList', 'browse'].includes(type))
    return { minimumMs: 100, maximumMs: 120000, phase: 'during-action' };
  if (['viewCart', 'viewHelp'].includes(type))
    return { minimumMs: 0, maximumMs: 120000, phase: 'after-panel-open' };
  return undefined;
}

/** Duration belongs to the selected activity, never a reaction wait before an input. */
export function feedbackDecisionFromChoice(choice: FeedbackActorChoice, durationMs: number, reason: string,
  memory: FeedbackBeliefMemory): Decision {
  const timing = activityTiming(choice.action.type);
  if (!Number.isInteger(durationMs) || durationMs < (timing?.minimumMs ?? 0) || durationMs > (timing?.maximumMs ?? 0))
    throw new Error(`durationMs for ${choice.action.type} must be ${timing?.minimumMs ?? 0}..${timing?.maximumMs ?? 0}; ordinary actions require 0`);
  const action = structuredClone(choice.action);
  if (timing) Object.assign(action, { durationMs });
  return { action, delayMs: 0, reason, feedbackMemory: structuredClone(memory),
    ...(choice.dragOutcome ? { dragOutcome: choice.dragOutcome } : {}) };
}

/** Changing the activity duration must not allow changing a choice's target or quantity. */
export function feedbackChoiceMatchesDecision(choice: FeedbackActorChoice, decision: Decision): boolean {
  const normalize = (action: PolicyAction) => Object.entries(action)
    .filter(([key]) => key !== 'durationMs' || !activityTiming(action.type))
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(normalize(choice.action)) === JSON.stringify(normalize(decision.action))
    && (choice.dragOutcome ?? 'drop') === (decision.dragOutcome ?? 'drop');
}

function currentChoices(observation: ActorObservation, seed: string | number, decisionIndex: number): FeedbackActorChoice[] {
  const choices: (ExtendedActorChoice & {dragOutcome?: 'miss' | 'cancel'})[] = extendedActorChoices(observation);
  for (const choice of [...choices]) if (choice.action.type === 'add' && choice.action.quantity === 1) {
    const name = observation.products.find(p => p.id === (choice.action as {productId:string}).productId)?.name;
    choices.push({ ...choice, id: `${choice.id}-miss`, dragOutcome:'miss', label:`${name}을 장바구니 바깥에 놓는 담기 시도`,
      effect:'Drag this visible product and release outside the basket. The item will not be added; the next observation reports that outcome.' },
    { ...choice, id: `${choice.id}-cancel`, dragOutcome:'cancel', label:`${name}을 끌다가 제자리에 놓기`,
      effect:'Begin a drag and return the visible product to its original position without adding it.' });
  }
  return (presentActorChoices(choices, seed, decisionIndex) as typeof choices).map(choice => ({
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
}

function stablePersona(persona: Persona) {
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

export type FeedbackActorFrame = {
  policyVersion: typeof FEEDBACK_ACTOR_POLICY_VERSION;
  instructions: string;
  observation: ActorObservation;
  memory: FeedbackBeliefMemory;
  persona: ReturnType<typeof stablePersona>;
  availableChoices: FeedbackActorChoice[];
};

export function buildFeedbackActorFrame(args: {
  observation: ActorObservation; persona: Persona; memory: FeedbackBeliefMemory;
  seed: string | number; decisionIndex: number;
}): FeedbackActorFrame {
  const validation = validateFeedbackBeliefMemory(args.memory);
  if (!validation.valid) throw new Error(`Invalid feedback belief memory: ${validation.errors.join('; ')}`);
  if (!Number.isInteger(args.decisionIndex) || args.decisionIndex < 0) throw new Error('decisionIndex must be a nonnegative integer');
  const observation = projectFeedbackObservation(args.observation);
  return {
    policyVersion: FEEDBACK_ACTOR_POLICY_VERSION, instructions: FEEDBACK_ACTOR_INSTRUCTIONS,
    observation, memory: structuredClone(args.memory), persona: stablePersona(args.persona),
    availableChoices: currentChoices(observation, args.seed, args.decisionIndex),
  };
}
