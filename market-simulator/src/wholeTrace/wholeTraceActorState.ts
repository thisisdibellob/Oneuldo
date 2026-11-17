import type { ActorObservation, Persona, PolicyAction } from '../types';
import type { WholeTraceBasis, WholeTraceKnowledgeSnapshot } from './wholeTraceKnowledge';
import { matchesObjective, type MarketTaskObjective } from '../../../frontend/src/game/marketSession';
import { validateWholeTraceMemoryUpdate, type WholeTraceMemoryUpdate } from './wholeTraceCognition';
import { validateWholeTraceTaskUpdate, type WholeTraceTaskUpdate } from './wholeTraceTaskMemory';
import { validateWholeTraceThought, type WholeTraceThought } from './wholeTraceWayfinding';

export const WHOLE_TRACE_ACTIVITIES = ['orient', 'shop', 'interest', 'recover', 'check', 'finish', 'rest'] as const;
export const WHOLE_TRACE_ORIENTATIONS = ['unfamiliar', 'recognizing', 'familiar'] as const;

/**
 * A fictional actor's public behavioral summary immediately before an action.
 * This records current attention and stated uncertainty, not private reasoning,
 * diagnosis, objective correctness, or a measured model of human memory.
 * The observed knowledge ledger and the bounded goals held now are separate.
 */
export type WholeTraceActorState = {
  activity: typeof WHOLE_TRACE_ACTIVITIES[number];
  task: string;
  heldGoalIds: string[];
  uncertainGoalIds: string[];
  /** Required nullable in candidate 5; absent in older candidates means unrecorded, not inferred. */
  focusedGoalId?: string | null;
  focusedProductId?: string | null;
  /** Familiarity with the current local task/control, never the entire map. */
  orientation: typeof WHOLE_TRACE_ORIENTATIONS[number];
  triggerCueRefs: string[];
  /** Candidate 6 compact belief changes; archived facts are never a recall source. */
  memoryUpdate?: WholeTraceMemoryUpdate;
  /** Candidate 7 explicit task selection/release; current attention does not delete pending goals. */
  taskUpdate?: WholeTraceTaskUpdate;
  /** wayfinding-v1 free-form judgment (noticed/hypothesis/plan/next), returned verbatim in the next menu. */
  thought?: WholeTraceThought;
};

export type WholeTraceActorStateContext = {
  knowledge?: WholeTraceKnowledgeSnapshot;
  persona?: Pick<Persona, 'attention'>;
  previous?: WholeTraceActorState;
  /** Trusted post-transport composition only; explicit wire/legacy trigger bound stays 12. */
  maximumTriggerCueRefs?: number;
  requireFocusFields?: boolean;
  allowMemoryUpdate?: boolean;
  allowTaskMemory?: boolean;
  /** wayfinding-v1: optional free-form actor judgment, never a cue or knowledge source. */
  allowThought?: boolean;
  thoughtVersion?: import('./wholeTraceWayfinding').WholeTraceWayfindingVersion;
};

const stateFields = ['activity', 'task', 'heldGoalIds', 'uncertainGoalIds', 'focusedGoalId', 'focusedProductId', 'orientation', 'triggerCueRefs'];
const uncertaintyTriggerKinds = new Set([
  'read-objective', 'displayed-list-control', 'displayed-cart', 'displayed-cart-item',
  'observed-action-result', 'displayed-action-error', 'displayed-help', 'displayed-instruction',
  'displayed-product', 'visible-station', 'open-station', 'personal-preference',
]);
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function refs(value: unknown, maximum: number, minimum = 0): value is string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum
    && value.every(ref => typeof ref === 'string' && !!ref.trim() && ref.length <= 300)
    && new Set(value).size === value.length;
}
/** Hard checks concern declarations and available information, never behavior quotas. */
export function validateWholeTraceActorState(value: unknown, context: WholeTraceActorStateContext = {}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const maximumTriggerCueRefs = context.maximumTriggerCueRefs ?? 12;
  if (!Number.isInteger(maximumTriggerCueRefs) || maximumTriggerCueRefs < 1)
    return { valid: false, errors: ['maximumTriggerCueRefs must be a positive integer'] };
  if (!plain(value)) return { valid: false, errors: ['actorState must be a JSON object'] };
  if (Object.keys(value).some(field => !stateFields.includes(field) && !(context.allowMemoryUpdate && field === 'memoryUpdate')
    && !(context.allowTaskMemory && field === 'taskUpdate') && !(context.allowThought && field === 'thought'))) errors.push('Unknown actorState field');
  if (context.allowThought) errors.push(...validateWholeTraceThought(value.thought, context.thoughtVersion));
  if (context.allowTaskMemory) errors.push(...validateWholeTraceTaskUpdate(value.taskUpdate).errors);
  if (context.allowMemoryUpdate && value.memoryUpdate !== undefined)
    errors.push(...validateWholeTraceMemoryUpdate(value.memoryUpdate).errors);
  if (!WHOLE_TRACE_ACTIVITIES.includes(value.activity as WholeTraceActorState['activity'])) errors.push(`Unsupported actorState.activity; allowed values: ${WHOLE_TRACE_ACTIVITIES.join(', ')}`);
  if (typeof value.task !== 'string' || !value.task.trim() || value.task.length > 160) errors.push('actorState.task must be a short nonempty behavioral description');
  if (!WHOLE_TRACE_ORIENTATIONS.includes(value.orientation as WholeTraceActorState['orientation'])) errors.push(`Unsupported actorState.orientation; allowed values: ${WHOLE_TRACE_ORIENTATIONS.join(', ')}`);
  for (const field of ['heldGoalIds', 'uncertainGoalIds'] as const)
    if (!refs(value[field], 24)) errors.push(`actorState.${field} must contain 0..24 distinct short references`);
  if (!refs(value.triggerCueRefs, maximumTriggerCueRefs, 1)) errors.push(`actorState.triggerCueRefs must contain 1..${maximumTriggerCueRefs} distinct short references`);
  for (const field of ['focusedGoalId', 'focusedProductId'] as const) {
    if (context.requireFocusFields && !Object.hasOwn(value, field)) errors.push(`actorState.${field} is required (use null when not focused)`);
    if (Object.hasOwn(value, field) && value[field] !== null
      && (typeof value[field] !== 'string' || !(value[field] as string).trim() || (value[field] as string).length > 300))
      errors.push(`actorState.${field} must be a short reference or null`);
  }
  if (errors.length) return { valid: false, errors };

  const state = value as WholeTraceActorState;
  const capacity = context.persona?.attention?.goalMemoryCapacity;
  if (capacity !== undefined && state.heldGoalIds.length > capacity)
    errors.push(`actorState.heldGoalIds exceeds selected persona goalMemoryCapacity (${capacity})`);
  if (context.knowledge) {
    const knownCues = new Set(context.knowledge.cues.map(cue => cue.cueRef));
    // A goal is known only after this visit's actual list read. History and a
    // full world catalogue cannot introduce current objective identifiers.
    const knownGoals = new Set(context.knowledge.cues.filter(cue => cue.kind === 'read-objective'
      && ['current-observation', 'observed-this-visit'].includes(cue.source) && cue.cueRef.startsWith('objective:'))
      .map(cue => cue.cueRef.slice('objective:'.length)));
    for (const field of ['heldGoalIds', 'uncertainGoalIds'] as const)
      for (const goalId of state[field]) if (!knownGoals.has(goalId)) errors.push(`actorState.${field}: unread objective ${goalId}`);
    if (state.focusedGoalId) {
      if (!knownGoals.has(state.focusedGoalId)) errors.push(`actorState.focusedGoalId: unread objective ${state.focusedGoalId}`);
      if (!state.heldGoalIds.includes(state.focusedGoalId)) errors.push('actorState.focusedGoalId must be in heldGoalIds; archive order is not focus');
    }
    if (state.focusedProductId && !context.knowledge.cues.some(cue =>
      ['current-observation', 'observed-this-visit'].includes(cue.source)
      && (cue.kind === 'displayed-product' && cue.cueRef === `product:${state.focusedProductId}`
        || cue.kind === 'displayed-cart-item' && cue.cueRef === `cart:product:${state.focusedProductId}`)))
      errors.push(`actorState.focusedProductId: unobserved product ${state.focusedProductId}`);
    for (const cueRef of state.triggerCueRefs) if (!knownCues.has(cueRef))
      errors.push(`actorState.triggerCueRefs: unobserved cue ${cueRef}`);
    if (context.previous) {
      for (const goalId of state.heldGoalIds.filter(id => !context.previous!.heldGoalIds.includes(id)))
        if (!state.triggerCueRefs.includes(`objective:${goalId}`))
          errors.push(`Newly held goal ${goalId} must declare its actual read objective cue as a transition trigger`);
      const oldUncertain = new Set(context.previous.uncertainGoalIds), newUncertain = new Set(state.uncertainGoalIds);
      const uncertaintyChanged = [...oldUncertain].some(id => !newUncertain.has(id)) || [...newUncertain].some(id => !oldUncertain.has(id));
      if (uncertaintyChanged && !context.allowMemoryUpdate && !context.knowledge.cues.some(cue => state.triggerCueRefs.includes(cue.cueRef)
        && uncertaintyTriggerKinds.has(cue.kind)))
        errors.push('Changed uncertainty must declare an actual objective, list, cart, result, support, instruction, product, station or personal preference cue');
    }
  }
  return { valid: errors.length === 0, errors };
}

/** An accepted decision with knowledge as it existed BEFORE that action. */
export type WholeTraceActorFidelityEntry = {
  decisionIndex: number;
  actorState: WholeTraceActorState;
  action: PolicyAction;
  delayMs: number;
  knowledge: WholeTraceKnowledgeSnapshot;
  before: ActorObservation;
  basis: WholeTraceBasis;
  reason?: string;
  cognition?: import('./wholeTraceCognition').WholeTraceCognitionPreview;
};
export type WholeTraceActorFidelityFinding = {
  code: 'UNIFORM_REACTION_DELAYS' | 'INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY' | 'NEXT_GOAL_WITHOUT_LIST_RECHECK'
    | 'FOCUS_ACTION_MISMATCH' | 'FOCUS_GOAL_SELECTION_MISMATCH' | 'UNCERTAINTY_CLEARED_WITHOUT_RECORDED_CUE';
  severity: 'warning';
  decisionIndexes: number[];
  message: string;
  selectedTrait?: string;
};
export type WholeTraceActorFidelityOptions = {
  /** Trusted game objectives, used AFTER accepted execution only. Never actor knowledge or choice hints. */
  objectives?: readonly MarketTaskObjective[];
  /** Explicitly versioned opt-in so historical fidelity reviews retain their original meaning. */
  annotationReview?: 'actor-annotation-v1';
};
export type WholeTraceAnnotationFinding = {
  code: 'CHECK_LABEL_WITHOUT_OBSERVABLE_CHECK' | 'FOCUS_ACTION_MISMATCH' | 'FOCUS_GOAL_SELECTION_MISMATCH';
  severity: 'warning';
  decisionIndexes: number[];
  message: string;
  improvementTarget: 'activity-annotation' | 'focus-annotation';
  recommendation: string;
  evidence: {
    decisionIndex: number;
    action: PolicyAction;
    declaredActivity: WholeTraceActorState['activity'];
    focusedGoalId?: string | null;
    focusedProductId?: string | null;
    basisIntent: WholeTraceBasis['intent'];
    cueRefs: string[];
  }[];
};
export type WholeTraceAnnotationReview = {
  reviewVersion: 'actor-annotation-v1';
  status: 'clear' | 'review';
  limitation: string;
  findings: WholeTraceAnnotationFinding[];
};
export type WholeTraceActorFidelityTransition = {
  kind: 'purchase-goal' | 'focus-goal' | 'interest-return' | 'uncertainty-cleared';
  decisionIndexes: number[];
  fromGoalId?: string;
  toGoalId?: string;
  productIds?: string[];
  listRechecked?: boolean;
  selectionFocus?: 'consistent' | 'unrecorded' | 'different-goal' | 'no-goal';
  cueRefs: string[];
  checkDecisionIndexes: number[];
};
export type WholeTraceActorFidelityAudit = {
  auditVersion: 'actor-fidelity-v2';
  status: 'clear' | 'review';
  validationScope: 'declared-behavior-and-observed-transitions';
  limitation: string;
  findings: WholeTraceActorFidelityFinding[];
  annotationReview?: WholeTraceAnnotationReview;
  focusCoverage: { recordedDecisions: number; unrecordedDecisionIndexes: number[] };
  transitions: WholeTraceActorFidelityTransition[];
  situations: {
    unfamiliar: { decisionIndexes: number[]; localCueLinkedDecisionIndexes: number[]; firstSeenStationDecisionIndexes: number[] };
    memoryLoad: { goalMemoryCapacity: number | null; readGoalsOverCapacityDecisionIndexes: number[];
      uncertainDecisionIndexes: number[]; checksDuringUncertaintyDecisionIndexes: number[] };
    interestExposure: { productIds: string[]; categoryIds: string[]; categorySignDecisionIndexes: number[];
      productDecisionIndexes: number[]; interestDecisionIndexes: number[] };
  };
  summary: {
    decisions: number;
    distinctReactionDelays: number;
    activityCounts: Record<WholeTraceActorState['activity'], number>;
    maximumHeldGoals: number;
    /** Actual consecutive goal selections, independent of memory order or activity labels. */
    goalSwitches: number;
    focusGoalSwitches: number;
    productSwitches: number;
    interestReturns: number;
  };
};

const recoveryChecks = new Set(['readList', 'viewCart', 'viewHelp']);
const visitSources = new Set(['current-observation', 'observed-this-visit']);
function recordedFocus(state: WholeTraceActorState): boolean {
  return Object.hasOwn(state, 'focusedGoalId') && Object.hasOwn(state, 'focusedProductId');
}
function readGoalIds(entry: WholeTraceActorFidelityEntry): Set<string> {
  return new Set(entry.knowledge.cues.filter(cue => cue.kind === 'read-objective'
    && visitSources.has(cue.source) && cue.cueRef.startsWith('objective:')).map(cue => cue.cueRef.slice(10)));
}
function declaredKnownRefs(entry: WholeTraceActorFidelityEntry): string[] {
  return entry.actorState.triggerCueRefs.filter(ref => entry.knowledge.cues.some(cue => cue.cueRef === ref));
}
function recalledGoal(entry: WholeTraceActorFidelityEntry): boolean {
  // Transport-derived links are removed by the compiler before this review.
  const goals = entry.actorState.focusedGoalId === undefined ? entry.actorState.heldGoalIds
    : entry.actorState.focusedGoalId ? [entry.actorState.focusedGoalId] : [];
  if (entry.cognition) return !!entry.cognition.valid && (entry.basis.memoryUses ?? []).some(use =>
    use.field === 'name' && goals.includes(use.goalId));
  return entry.actorState.triggerCueRefs.some(ref => ref.startsWith('objective:')
    && goals.includes(ref.slice('objective:'.length))
    && readGoalIds(entry).has(ref.slice('objective:'.length)));
}
function nextGoalRecheckTrait(persona: Pick<Persona, 'character'>): string | undefined {
  return persona.character?.selectedTraits.find(trait => /다음\s*항목[\s\S]*목록[\s\S]*(?:다시|재확인)/.test(trait)
    || /(?:next|subsequent)\s+(?:goal|item)[\s\S]*(?:recheck|reread|check\s+again)[\s\S]*list/i.test(trait)
    || /(?:recheck|reread)[\s\S]*list[\s\S]*(?:next|subsequent)\s+(?:goal|item)/i.test(trait));
}

/**
 * Reviews annotations against accepted actions, without assigning attention from
 * hidden objectives or changing actions. Deliberate observation may occur on an
 * already visible screen; a check label never requires a particular UI command.
 */
function reviewAnnotations(entries: readonly WholeTraceActorFidelityEntry[],
  fidelityFindings: readonly WholeTraceActorFidelityFinding[]): WholeTraceAnnotationReview {
  const evidence = (entry: WholeTraceActorFidelityEntry): WholeTraceAnnotationFinding['evidence'][number] => ({
    decisionIndex: entry.decisionIndex, action: structuredClone(entry.action),
    declaredActivity: entry.actorState.activity,
    ...(Object.hasOwn(entry.actorState, 'focusedGoalId') ? { focusedGoalId: entry.actorState.focusedGoalId } : {}),
    ...(Object.hasOwn(entry.actorState, 'focusedProductId') ? { focusedProductId: entry.actorState.focusedProductId } : {}),
    basisIntent: entry.basis.intent, cueRefs: [...declaredKnownRefs(entry)],
  });
  const findings: WholeTraceAnnotationFinding[] = [];
  for (const entry of entries) {
    if (entry.actorState.activity === 'check' && ['closeStation', 'closeView'].includes(entry.action.type)) {
      findings.push({ code: 'CHECK_LABEL_WITHOUT_OBSERVABLE_CHECK', severity: 'warning',
        decisionIndexes: [entry.decisionIndex], improvementTarget: 'activity-annotation',
        message: 'The check label accompanies only a closing operation. Closing alone does not establish what information was checked; an implicit review of the already visible display is still possible.',
        recommendation: 'Describe the actual current activity and the observed information being reviewed. Do not add a check action merely to satisfy this warning or claim that closing a display itself rechecks its contents.',
        evidence: [evidence(entry)] });
    }
  }
  for (const finding of fidelityFindings) {
    if (finding.code !== 'FOCUS_ACTION_MISMATCH' && finding.code !== 'FOCUS_GOAL_SELECTION_MISMATCH') continue;
    findings.push({ code: finding.code, severity: 'warning', decisionIndexes: [...finding.decisionIndexes],
      improvementTarget: 'focus-annotation', message: finding.message,
      recommendation: 'Review the declared attention against the actor’s actually known goal and observed product at that moment. Preserve an intentional interest purchase or a mistaken selection; do not fill focus from hidden objectives or change the action to match the annotation.',
      evidence: entries.filter(entry => finding.decisionIndexes.includes(entry.decisionIndex)).map(evidence) });
  }
  return { reviewVersion: 'actor-annotation-v1', status: findings.length ? 'review' : 'clear', findings,
    limitation: 'Soft post-execution annotation diagnostics only. These findings do not prove a personality failure, infer private attention, require extra checking, reject a mistaken action, or modify the trace. Clear means no supported annotation issue was detected.' };
}

/**
 * Descriptive post-execution review; no action selection, cart correction,
 * resampling, clinical scoring, required detour, mistake or forgetting quota.
 * Archive order and natural-language task/reason are NEVER inferred focus.
 */
export function auditWholeTraceActorFidelity(entries: readonly WholeTraceActorFidelityEntry[],
  persona: Pick<Persona, 'character' | 'attention'>, options: WholeTraceActorFidelityOptions = {}): WholeTraceActorFidelityAudit {
  const findings: WholeTraceActorFidelityFinding[] = [];
  const transitions: WholeTraceActorFidelityTransition[] = [];
  const activityCounts = Object.fromEntries(WHOLE_TRACE_ACTIVITIES.map(activity => [activity, 0])) as WholeTraceActorFidelityAudit['summary']['activityCounts'];
  for (const entry of entries) activityCounts[entry.actorState.activity]++;
  const delays = new Set(entries.map(entry => entry.delayMs));
  if (entries.length >= 8 && delays.size === 1 && new Set(entries.map(entry => entry.action.type)).size >= 2)
    findings.push({ code: 'UNIFORM_REACTION_DELAYS', severity: 'warning', decisionIndexes: entries.map(entry => entry.decisionIndex),
      message: 'Different actions all use the same reaction delay; review whether the selected actor’s timing is represented.' });

  const capacity = persona.attention?.goalMemoryCapacity ?? null;
  const productIds = Object.entries(persona.attention?.interestProductWeights ?? {}).filter(([, weight]) => weight > 0).map(([id]) => id);
  const categoryIds = Object.entries(persona.attention?.interestCategoryWeights ?? {}).filter(([, weight]) => weight > 0).map(([id]) => id);
  const situations: WholeTraceActorFidelityAudit['situations'] = {
    unfamiliar: { decisionIndexes: [], localCueLinkedDecisionIndexes: [], firstSeenStationDecisionIndexes: [] },
    memoryLoad: { goalMemoryCapacity: capacity, readGoalsOverCapacityDecisionIndexes: [], uncertainDecisionIndexes: [], checksDuringUncertaintyDecisionIndexes: [] },
    interestExposure: { productIds, categoryIds, categorySignDecisionIndexes: [], productDecisionIndexes: [], interestDecisionIndexes: [] },
  };
  const checkIndexesBetween = (start: number, end: number) => entries.slice(start + 1, end)
    .filter(entry => recoveryChecks.has(entry.action.type)).map(entry => entry.decisionIndex);
  const addFinding = (code: WholeTraceActorFidelityFinding['code'], decisionIndexes: number[], message: string, selectedTrait?: string) =>
    findings.push({ code, severity: 'warning', decisionIndexes, message, ...(selectedTrait ? { selectedTrait } : {}) });
  const recheckTrait = nextGoalRecheckTrait(persona);
  let interestStart: number | undefined, recoveryRecorded = false;
  let previousSelection: { at: number; goalId: string; productId: string; habitEligible: boolean } | undefined;
  let previousFocus: { at: number; goalId: string } | undefined;
  let previousProductId: string | undefined;
  let goalSwitches = 0, focusGoalSwitches = 0, productSwitches = 0, interestReturns = 0;
  const seenStations = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i], state = entry.actorState, refs = declaredKnownRefs(entry);
    let selectedPurchaseGoal: string | undefined;
    if (state.orientation === 'unfamiliar') {
      situations.unfamiliar.decisionIndexes.push(entry.decisionIndex);
      if (entry.knowledge.cues.some(cue => refs.includes(cue.cueRef) && visitSources.has(cue.source)
        && ['visible-station', 'open-station', 'visible-passage', 'displayed-product', 'displayed-instruction', 'displayed-help'].includes(cue.kind)))
        situations.unfamiliar.localCueLinkedDecisionIndexes.push(entry.decisionIndex);
    }
    let newStation = false;
    for (const station of entry.before.visibleStations) if (!seenStations.has(station.id)) { seenStations.add(station.id); newStation = true; }
    if (newStation) situations.unfamiliar.firstSeenStationDecisionIndexes.push(entry.decisionIndex);
    if (capacity !== null && readGoalIds(entry).size > capacity)
      situations.memoryLoad.readGoalsOverCapacityDecisionIndexes.push(entry.decisionIndex);
    if (state.uncertainGoalIds.length) {
      situations.memoryLoad.uncertainDecisionIndexes.push(entry.decisionIndex);
      if (recoveryChecks.has(entry.action.type)) situations.memoryLoad.checksDuringUncertaintyDecisionIndexes.push(entry.decisionIndex);
    }
    if (entry.before.visibleStations.some(station => categoryIds.includes(station.id)))
      situations.interestExposure.categorySignDecisionIndexes.push(entry.decisionIndex);
    if (entry.before.products.some(product => productIds.includes(product.id)))
      situations.interestExposure.productDecisionIndexes.push(entry.decisionIndex);
    if (state.activity === 'interest' || entry.basis.intent === 'interest') situations.interestExposure.interestDecisionIndexes.push(entry.decisionIndex);

    if (recordedFocus(state) && state.focusedGoalId) {
      if (previousFocus && previousFocus.goalId !== state.focusedGoalId) {
        focusGoalSwitches++;
        transitions.push({ kind: 'focus-goal', decisionIndexes: [entries[previousFocus.at].decisionIndex, entry.decisionIndex],
          fromGoalId: previousFocus.goalId, toGoalId: state.focusedGoalId, cueRefs: refs,
          checkDecisionIndexes: checkIndexesBetween(previousFocus.at, i) });
      }
      previousFocus = { at: i, goalId: state.focusedGoalId };
    }
    if ((entry.action.type === 'add' || entry.action.type === 'remove') && recordedFocus(state)
      && state.focusedProductId !== entry.action.productId)
      addFinding('FOCUS_ACTION_MISMATCH', [entry.decisionIndex],
        'The selected product differs from the separately recorded focus product. Review the annotation or a possible mistaken selection; do not replace the action with a correct product.');

    // Selection facts use the game's own exact/family rule and only goals read
    // this visit. They remain post-hoc evidence, not a hint returned to the actor.
    // This detects real banana→milk even if both goals stay held in one order.
    if (entry.action.type === 'add') {
      if (previousProductId && previousProductId !== entry.action.productId) productSwitches++;
      previousProductId = entry.action.productId;
      const productId = entry.action.productId;
      const knownGoals = readGoalIds(entry);
      const matching = (options.objectives ?? []).filter(goal => knownGoals.has(goal.id) && matchesObjective(productId, goal));
      // Ambiguous family goals cannot identify a task without a declared focus.
      const selectedGoal = matching.length === 1 ? matching[0].id
        : matching.find(goal => goal.id === state.focusedGoalId)?.id;
      selectedPurchaseGoal = selectedGoal;
      const selectionFocus = state.focusedGoalId === undefined ? 'unrecorded' : state.focusedGoalId === null ? 'no-goal'
        : selectedGoal === state.focusedGoalId ? 'consistent' : 'different-goal';
      const habitEligible = selectionFocus === 'consistent' || selectionFocus === 'unrecorded';
      if (state.focusedGoalId && state.focusedProductId === productId && options.objectives
        && !matching.some(goal => goal.id === state.focusedGoalId))
        addFinding('FOCUS_GOAL_SELECTION_MISMATCH', [entry.decisionIndex],
          'The selected product does not match the separately declared goal under the game rule. This may record a mistaken choice; review the annotation without correcting the product, quantity or goal.');
      if (state.focusedGoalId === null && selectedGoal && state.activity !== 'interest' && entry.basis.intent !== 'interest'
        && (state.activity === 'shop' || entry.basis.intent === 'task'))
        addFinding('FOCUS_GOAL_SELECTION_MISMATCH', [entry.decisionIndex],
          'A stated task purchase selects a read goal product while its explicit focus goal is null. Review the missing focus annotation; do not infer focus from memory order or replace the action.');
      if (selectedGoal) {
        if (previousSelection && previousSelection.goalId !== selectedGoal) {
          goalSwitches++;
          const listRechecked = entries.slice(previousSelection.at + 1, i).some(row => row.action.type === 'readList');
          transitions.push({ kind: 'purchase-goal', decisionIndexes: [entries[previousSelection.at].decisionIndex, entry.decisionIndex],
            fromGoalId: previousSelection.goalId, toGoalId: selectedGoal, productIds: [previousSelection.productId, productId],
            listRechecked, selectionFocus, cueRefs: refs, checkDecisionIndexes: checkIndexesBetween(previousSelection.at, i) });
          if (recheckTrait && !listRechecked && habitEligible && previousSelection.habitEligible) addFinding('NEXT_GOAL_WITHOUT_LIST_RECHECK',
            [entries[previousSelection.at].decisionIndex, entry.decisionIndex],
            'The actual selected product advances a different read shopping goal without a new list read after the previous selection, although this individual’s selected trait describes that strategy.', recheckTrait);
        }
        previousSelection = { at: i, goalId: selectedGoal, productId, habitEligible };
      }
    }

    if (state.activity === 'interest' || entry.basis.intent === 'interest') {
      if (interestStart === undefined) { interestStart = i; recoveryRecorded = false; }
    } else if (interestStart !== undefined) {
      // A recover label alone does not establish a check or remembered cue.
      if (recalledGoal(entry) || recoveryChecks.has(entry.action.type)) recoveryRecorded = true;
      if (state.activity === 'shop' || selectedPurchaseGoal
        || state.focusedGoalId && entry.basis.intent === 'task' && !recoveryChecks.has(entry.action.type)) {
        interestReturns++;
        transitions.push({ kind: 'interest-return', decisionIndexes: [entries[interestStart].decisionIndex, entry.decisionIndex],
          cueRefs: refs, checkDecisionIndexes: checkIndexesBetween(interestStart, i) });
        if (!recoveryRecorded) addFinding('INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY',
          [entries[interestStart].decisionIndex, entry.decisionIndex],
          'Shopping resumes after personal interest without an actual check or model-declared known goal recall. A recovery activity label alone is insufficient.');
        interestStart = undefined;
      }
    }
    if (interestStart !== undefined && recoveryChecks.has(entry.action.type)) recoveryRecorded = true;

    const previous = entries[i - 1];
    // Dropping an active slot does not claim that its uncertainty was resolved.
    const cleared = previous?.actorState.uncertainGoalIds.filter(id => !state.uncertainGoalIds.includes(id)
      && (!entry.cognition || entry.cognition.state.activeGoals.some(goal => goal.goalId === id))) ?? [];
    if (cleared.length) {
      const checked = recoveryChecks.has(previous.action.type);
      const resolvingCue = entry.cognition ? entry.cognition.events.some(event => event.kind === 'list-read' && cleared.includes(event.goalId))
        : entry.knowledge.cues.some(cue => refs.includes(cue.cueRef) && visitSources.has(cue.source)
        && (cue.kind === 'read-objective' && cleared.includes(cue.cueRef.slice(10))
          || (cue.kind === 'displayed-product' || cue.kind === 'displayed-cart-item')
            && (options.objectives ?? []).some(goal => cleared.includes(goal.id)
              && matchesObjective(cue.cueRef.replace(/^(?:cart:)?product:/, ''), goal))
          || ['displayed-cart', 'displayed-help', 'displayed-instruction',
            'observed-action-result', 'displayed-action-error'].includes(cue.kind)));
      transitions.push({ kind: 'uncertainty-cleared', decisionIndexes: [previous.decisionIndex, entry.decisionIndex],
        cueRefs: refs, checkDecisionIndexes: checked ? [previous.decisionIndex] : [] });
      if (!checked && !resolvingCue) addFinding('UNCERTAINTY_CLEARED_WITHOUT_RECORDED_CUE',
        [previous.decisionIndex, entry.decisionIndex], 'Stated uncertainty disappears without a preceding check or a declared observed result/product/list/support cue; review the state-to-behavior continuity.');
    }
  }
  const unrecordedDecisionIndexes = entries.filter(entry => !recordedFocus(entry.actorState)).map(entry => entry.decisionIndex);
  return {
    auditVersion: 'actor-fidelity-v2', status: findings.length ? 'review' : 'clear',
    validationScope: 'declared-behavior-and-observed-transitions',
    limitation: 'Clear means no machine-detected pattern was flagged, not a fidelity or clinical pass. Missing legacy focus is unrecorded, never inferred from archive order. Exposure and load describe opportunities, not required behaviors or proof of understanding. This synthetic review cannot establish private reasoning, absence of implicit whole-world influence, clinical validity, or real-person behavior.',
    findings,
    ...(options.annotationReview === 'actor-annotation-v1' ? { annotationReview: reviewAnnotations(entries, findings) } : {}),
    focusCoverage: { recordedDecisions: entries.length - unrecordedDecisionIndexes.length, unrecordedDecisionIndexes },
    transitions, situations, summary: { decisions: entries.length, distinctReactionDelays: delays.size, activityCounts,
      maximumHeldGoals: Math.max(0, ...entries.map(entry => entry.actorState.heldGoalIds.length)),
      goalSwitches, focusGoalSwitches, productSwitches, interestReturns },
  };
}
