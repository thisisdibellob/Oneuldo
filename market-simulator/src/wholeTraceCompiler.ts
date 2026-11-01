import { extendedActorChoices as actorChoices } from './actorChoices';
import { canonicalMarketReplayJson } from '../../frontend/src/game/marketReplayTrace';
import { generateTrace } from './simulator';
import { wholeTraceInputHash } from './wholeTraceBundle';
import { WHOLE_TRACE_BUNDLE_VERSION, WHOLE_TRACE_MODEL, WHOLE_TRACE_POLICY_VERSION, validateWholeTraceCandidate,
  validateWholeTraceCandidatePrefix, wholeTraceTerminalIntent,
  type WholeTraceBundle, type WholeTraceCandidate, type WholeTraceDecision, type WholeTraceSettings,
  type WholeTraceValidation, type WholeTraceValidationIssue } from './wholeTraceContracts';
import type { ActorObservation, Decision, GenerationCheckpoint, PolicyAction } from './types';
import { getWholeTracePersona } from './personas';
import { WholeTraceKnowledgeLedger, type WholeTraceKnowledgeSnapshot } from './wholeTraceKnowledge';
import { validateWholeTraceActorState, auditWholeTraceActorFidelity, type WholeTraceActorState } from './wholeTraceActorState';
import { resolveWholeTraceChoice, wholeTraceChoiceFrame } from './wholeTraceChoices';
import { createMarketSession } from '../../frontend/src/game/marketSession';
import { WholeTraceCognitionEngine, WHOLE_TRACE_GOAL_FIELDS, type WholeTraceCognitionState } from './wholeTraceCognition';
import { buildWholeTracePersonaInput } from './wholeTracePersona';
import { WholeTraceTaskMemoryEngine } from './wholeTraceTaskMemory';
import { reviewWholeTraceTaskExpression } from './wholeTraceTaskExpression';

export class WholeTraceCompileError extends Error {
  constructor(readonly validation: WholeTraceValidation) { super(validation.errors.join('; ')); }
}

export type WholeTracePrefixOptions = {
  nextDecision?: { actorState: Pick<WholeTraceActorState, 'activity'>; delayMs: number };
};
export type WholeTraceCalculatedAdvisory = {
  kind: 'reference-calculated-state-v1'; notice: string;
  assumptions: { activity: string; delayMs: number; includesActorMemoryUpdates: false };
  goalFields: { goalId: string; field: typeof WHOLE_TRACE_GOAL_FIELDS[number]; pressure: number;
    status: 'clear' | 'uncertain' | 'unavailable' }[];
  observedProductIds: string[]; openGoalIds: string[];
};
export type WholeTracePrefixResult = {
  valid: true; acceptedActions: number; terminal: boolean; before: ActorObservation;
  knowledge: WholeTraceKnowledgeSnapshot; workingMemory?: WholeTraceCognitionState;
  taskMemory?: ReturnType<WholeTraceTaskMemoryEngine['snapshot']>; advisory: WholeTraceCalculatedAdvisory;
};
class WholeTracePrefixComplete extends Error {
  constructor(readonly result: WholeTracePrefixResult) { super('Whole trace prefix checked'); }
}
/** Replays exactly the supplied decisions through the final compiler's runtime guards. */
export async function validateWholeTracePrefix(settings: WholeTraceSettings, bundle: WholeTraceBundle,
  value: unknown, options: WholeTracePrefixOptions = {}): Promise<WholeTracePrefixResult> {
  const context = options.nextDecision;
  if (context && (!Number.isInteger(context.delayMs) || context.delayMs < 0 || context.delayMs > 120000
    || !context.actorState || typeof context.actorState.activity !== 'string'))
    throw new Error('Prefix advisory requires an actor activity and delayMs in 0..120000');
  try {
    await executeWholeTraceCandidate(settings, bundle, value, 1, undefined, options);
  } catch (error) {
    if (error instanceof WholeTracePrefixComplete) return error.result;
    throw error;
  }
  throw new Error('Whole trace prefix did not produce a validation result');
}
function runtimeIssues(code: string, errors: string[], decisionIndex: number,
  previous?: WholeTraceCognitionState, proposed?: WholeTraceCognitionState,
  thresholds?: { uncertainThreshold: number; unavailableThreshold: number }): WholeTraceValidationIssue[] {
  return errors.map(message => {
    let path = message.match(/(?:actorState|basis|choiceRef)\.[A-Za-z]+(?:\[\d+\])?(?:\.[A-Za-z]+)?/)?.[0]
      ?? (code.startsWith('CHOICE_') ? 'choiceRef' : code === 'KNOWLEDGE_BASIS' ? 'basis.cueRefs'
        : code === 'WORKING_MEMORY' ? 'basis.memoryUses' : code === 'TASK_MEMORY' ? 'actorState.taskUpdate' : '');
    let rule = code;
    let evidence: Record<string, unknown> | undefined;
    if (message.startsWith('actorState.focusedProductId: unobserved product ')) {
      rule = 'focused-product-observed';
      evidence = { productId: message.slice('actorState.focusedProductId: unobserved product '.length), observed: false };
    } else if (message.startsWith('actorState.uncertainGoalIds must include ')) {
      rule = 'uncertain-goal-required'; path = 'actorState.uncertainGoalIds';
      const goalId = message.slice('actorState.uncertainGoalIds must include '.length).split(':')[0];
      const goal = proposed?.activeGoals.find(goal => goal.goalId === goalId);
      const old = previous?.activeGoals.find(goal => goal.goalId === goalId);
      evidence = { goalId, thresholds, fields: goal ? (proposed?.knownGoalFields[goalId] ?? ['name', 'requiredQuantity'])
        .filter(field => goal.fields[field].status !== 'clear').map(field => ({ field,
          previousPressure: old?.fields[field].pressure ?? 0, pressure: goal.fields[field].pressure,
          status: goal.fields[field].status })) : [] };
    }
    return { decisionIndex, decisionNumber: decisionIndex + 1, path: `decisions[${decisionIndex}]${path ? `.${path}` : ''}`, rule, message,
      ...(evidence ? { evidence } : {}) };
  });
}

/** Translation only: never chooses an alternative waypoint, product, quantity, or route. */
export function resolveWholeTraceDecision(d: WholeTraceDecision, o: ActorObservation, bundle: WholeTraceBundle): Decision {
  const a = d.action;
  let action: PolicyAction;
  if (a.type === 'walk') {
    const target = bundle.worldReference.waypoints.find(w => w.waypointId === a.waypointId);
    if (!target) throw new Error(`Unknown waypoint ${a.waypointId}`);
    action = { type: 'walkToAnchor', anchorId: target.anchorId };
  } else if (a.type === 'browse') {
    const fraction = o.shelf?.pageFractions?.[a.pageIndex];
    if (fraction === undefined) throw new Error(`Page ${a.pageIndex} does not exist in the open shelf`);
    action = { type: 'browse', scrollFraction: fraction, durationMs: 1500 };
  } else if (a.type === 'readList') action = { type: 'readList', durationMs: 2000 };
  else if (a.type === 'pause' || a.type === 'lookAround') action = { type: a.type, durationMs: 1500 };
  else action = structuredClone(a) as PolicyAction;
  if (!actorChoices(o).some(c => canonicalMarketReplayJson(c.action) === canonicalMarketReplayJson(action)))
    throw new Error(`Action ${a.type} is not an available control in the current observation`);
  return { action, delayMs: d.delayMs, reason: d.reason, currentTask: d.actorState.task };
}

export async function compileWholeTraceCandidate(settings: WholeTraceSettings, bundle: WholeTraceBundle,
  value: unknown, submissions = 1, onCheckpoint?: (entry: GenerationCheckpoint) => void) {
  return executeWholeTraceCandidate(settings, bundle, value, submissions, onCheckpoint);
}
async function executeWholeTraceCandidate(settings: WholeTraceSettings, bundle: WholeTraceBundle,
  value: unknown, submissions: number, onCheckpoint?: (entry: GenerationCheckpoint) => void,
  prefix?: WholeTracePrefixOptions) {
  settings = structuredClone(settings); bundle = structuredClone(bundle); value = structuredClone(value);
  if (bundle.bundleVersion !== WHOLE_TRACE_BUNDLE_VERSION || bundle.inputHash !== wholeTraceInputHash(settings) || bundle.snapshotId !== settings.snapshot.snapshotId
    || bundle.persona.id !== settings.personaId || bundle.model !== WHOLE_TRACE_MODEL || bundle.policyVersion !== WHOLE_TRACE_POLICY_VERSION)
    throw new WholeTraceCompileError({ valid: false, code: 'PREPARED_INPUT_MISMATCH', errors: ['Candidate input differs from the prepared bundle'] });
  const structure = (prefix ? validateWholeTraceCandidatePrefix : validateWholeTraceCandidate)(value, bundle.requestId,
    { objectiveIds: bundle.worldReference.objectives.map(goal => goal.id) });
  if (!structure.valid) throw new WholeTraceCompileError({ ...structure, issues: structure.errors.map(message => {
    const decisionIndex = Number(message.match(/^decisions\[(\d+)\]/)?.[1] ?? 0);
    return runtimeIssues(structure.code ?? 'CANDIDATE_SCHEMA', [message], decisionIndex)[0];
  }) });
  const candidate = value as WholeTraceCandidate;
  const persona = getWholeTracePersona(settings.personaId);
  const persistent = candidate.candidateVersion === '7';
  const cognitive = candidate.candidateVersion === '6' || persistent;
  const personaInput = cognitive ? buildWholeTracePersonaInput(persona) : undefined;
  if (personaInput && (personaInput.cognitionSourceHash !== bundle.persona.behavior.cognitionSourceHash
    || canonicalMarketReplayJson(personaInput.cognition) !== canonicalMarketReplayJson(bundle.persona.behavior.cognition)))
    throw new WholeTraceCompileError({ valid: false, code: 'PREPARED_INPUT_MISMATCH', errors: ['Cognition profile differs from the prepared persona source'] });
  const cognition = personaInput ? new WholeTraceCognitionEngine(personaInput.cognition) : undefined;
  const taskMemory = persistent ? new WholeTraceTaskMemoryEngine(persona.attention?.goalMemoryCapacity ?? 2) : undefined;
  if (taskMemory && canonicalMarketReplayJson(taskMemory.snapshot()) !== canonicalMarketReplayJson(bundle.actorState.taskMemory))
    throw new WholeTraceCompileError({ valid: false, code: 'PREPARED_INPUT_MISMATCH', errors: ['Initial task memory differs from the prepared empty state'] });
  if (cognition && canonicalMarketReplayJson(cognition.snapshot()) !== canonicalMarketReplayJson(bundle.actorState.workingMemory))
    throw new WholeTraceCompileError({ valid: false, code: 'PREPARED_INPUT_MISMATCH', errors: ['Initial working memory differs from the prepared empty state'] });
  let proposedWorkingMemory: ReturnType<WholeTraceCognitionEngine['snapshot']> | undefined;
  let proposedTaskMemory: ReturnType<WholeTraceTaskMemoryEngine['snapshot']> | undefined;
  const ledger = new WholeTraceKnowledgeLedger(persona, settings.attentionExperience?.learning);
  let previousState: WholeTraceActorState = structuredClone(bundle.actorState.initialState);
  const knowledgeAudit: { decisionIndex: number; before: ActorObservation; newCueRefs: string[];
    knowledge: WholeTraceKnowledgeSnapshot; basis: WholeTraceDecision['basis']; actorState: WholeTraceActorState;
    action: PolicyAction; delayMs: number; reason: string; currentTask: string;
    cognition?: ReturnType<WholeTraceCognitionEngine['preview']>;
    taskMemory?: ReturnType<WholeTraceTaskMemoryEngine['preview']>;
    choiceResolution?: { choiceRef: import('./wholeTraceContracts').WholeTraceChoiceDecision['choiceRef'];
      resolvedChoiceRef: import('./wholeTraceContracts').WholeTraceChoiceDecision['choiceRef'];
      normalization?: import('./wholeTraceChoices').WholeTraceChoiceNormalization;
      derivedCueRefs: string[]; declaredBasisCueRefs: string[]; declaredTriggerCueRefs: string[];
      source: import('./wholeTraceContracts').WholeTraceChoiceDecision['choiceRef']['source'] } }[] = [];
  let pending: typeof knowledgeAudit[number] | undefined;
  let acceptedFrame = { location: 'start', navigationStateId: bundle.worldReference.navigation.initialStateId };
  let accepted = 0, activeIndex = 0, before: ActorObservation | undefined;
  let checkpointFailure: unknown, lastApplied: ActorObservation | undefined;
  const capturePrefix = (observation: ActorObservation, terminal: boolean): never => {
    const knowledge = ledger.observe(observation).knowledge;
    const context = prefix?.nextDecision;
    const workingMemory = cognition?.project(observation, context ? {
      activity: context.actorState.activity, delayMs: context.delayMs,
    } : undefined);
    const taskState = taskMemory?.snapshot();
    const observedProductIds = [...new Set(knowledge.cues.filter(cue =>
      cue.source === 'current-observation' || cue.source === 'observed-this-visit').flatMap(cue =>
      cue.kind === 'displayed-product' ? [cue.cueRef.slice('product:'.length)]
        : cue.kind === 'displayed-cart-item' ? [cue.cueRef.slice('cart:product:'.length)] : []))].sort();
    throw new WholeTracePrefixComplete({ valid: true, acceptedActions: accepted, terminal,
      before: structuredClone(observation), knowledge,
      ...(workingMemory ? { workingMemory } : {}), ...(taskState ? { taskMemory: taskState } : {}),
      advisory: { kind: 'reference-calculated-state-v1',
        notice: '참고용 계산값. 보조기는 행동이나 상태 값을 채우거나 고치지 않으며, 선언은 계속 AI가 한다.',
        assumptions: { activity: context?.actorState.activity ?? cognition?.snapshot().context.activity ?? 'orient',
          delayMs: context?.delayMs ?? 0, includesActorMemoryUpdates: false },
        goalFields: workingMemory?.activeGoals.flatMap(goal => WHOLE_TRACE_GOAL_FIELDS.map(field => ({
          goalId: goal.goalId, field, pressure: Math.round(goal.fields[field].pressure * 1000000) / 1000000,
          status: goal.fields[field].status }))) ?? [], observedProductIds, openGoalIds: taskState?.openGoalIds ?? [] } });
  };
  try {
    const trace = await generateTrace({
      ...settings, mode: 'llm', planningMode: 'whole-trace', tracePolicyVersion: '6',
      actorPolicyVersion: WHOLE_TRACE_POLICY_VERSION, reasoningEffort: 'low',
      planningSubmissions: submissions, repairSubmissions: submissions - 1,
      maxActions: settings.maxActions ?? 100,
      llm: { ...settings.llm, model: WHOLE_TRACE_MODEL, maxCalls: settings.llm?.maxCalls ?? 100 },
      actorDecisionProvider: async o => {
        activeIndex = accepted; before = structuredClone(o);
        if (prefix && !candidate.decisions.length) capturePrefix(o, false);
        proposedWorkingMemory = undefined;
        proposedTaskMemory = undefined;
        const observation = ledger.observe(o);
        const wire = candidate.decisions[accepted];
        if (!wire) throw new Error('Candidate exhausted before natural termination or the 100-action horizon');
        const binding = candidate.candidateVersion !== '3'
          ? resolveWholeTraceChoice(wire as import('./wholeTraceContracts').WholeTraceChoiceDecision, o, bundle, acceptedFrame, observation.knowledge)
          : undefined;
        const d = binding?.decision ?? wire as WholeTraceDecision;
        const decision = resolveWholeTraceDecision(d, o, bundle);
        // The wire was already checked at 24/12. Exact generated control/read-goal
        // proofs must not displace any declared reference or make a valid wire overflow.
        const composedBounds = binding ? {
          maximumCueRefs: ((wire as import('./wholeTraceContracts').WholeTraceChoiceDecision).basis.cueRefs?.length ?? 0) + binding.derivedCueRefs.length,
          maximumTriggerCueRefs: ((wire as import('./wholeTraceContracts').WholeTraceChoiceDecision).actorState.triggerCueRefs?.length ?? 0) + binding.derivedCueRefs.length,
        } : undefined;
        try { ledger.assertBasis(d.basis, decision.action, { ...composedBounds, allowMemoryUses: cognitive, allowTaskMemory: persistent }); }
        catch (error) { throw Object.assign(new Error((error as Error).message), { code: 'KNOWLEDGE_BASIS' }); }
        const stateCheck = validateWholeTraceActorState(d.actorState, { knowledge: observation.knowledge, persona, previous: previousState,
          requireFocusFields: candidate.candidateVersion === '5' || cognitive, allowMemoryUpdate: cognitive, allowTaskMemory: persistent,
          ...(composedBounds ? { maximumTriggerCueRefs: composedBounds.maximumTriggerCueRefs } : {}) });
        if (!stateCheck.valid) throw Object.assign(new Error(stateCheck.errors.join('; ')), { code: 'ACTOR_STATE', errors: stateCheck.errors });
        const rawBasis = (wire as import('./wholeTraceContracts').WholeTraceTaskChoiceDecision).basis;
        const taskCheck = taskMemory?.preview(o, wire.actorState, rawBasis as import('./wholeTraceTaskMemory').WholeTraceTaskBasis, decision.action);
        if (taskCheck) {
          proposedTaskMemory = taskCheck.state;
          if (!taskCheck.valid) throw Object.assign(new Error(taskCheck.errors.join('; ')), { code: 'TASK_MEMORY', errors: taskCheck.errors });
          if (rawBasis.goalId === null && (rawBasis.cueRefs?.some(ref => ref.startsWith('objective:')) || rawBasis.memoryUses.length))
            throw Object.assign(new Error('Goal detail use requires an explicit basis.goalId even when focusedGoalId is null'), { code: 'TASK_MEMORY' });
          if ((decision.action.type === 'add' || decision.action.type === 'remove') && rawBasis.goalId === null
            && (rawBasis.intent !== 'interest' || wire.actorState.activity !== 'interest'))
            throw Object.assign(new Error('A purchase/return needs a declared goal or an explicit personal-interest decision'), { code: 'TASK_MEMORY' });
          if (rawBasis.memoryUses.some(use => use.goalId !== rawBasis.goalId))
            throw Object.assign(new Error('memoryUses must belong to the declared basis.goalId, independently of momentary focus'), { code: 'TASK_MEMORY' });
        }
        // Only the raw actor declarations enter cognition. Auto-generated objective
        // provenance and the factual ledger never restore precise goal beliefs.
        const memoryCheck = cognition?.preview(o, wire.actorState,
          (wire as import('./wholeTraceContracts').WholeTraceCognitiveChoiceDecision).basis.memoryUses, d.delayMs);
        if (memoryCheck) {
          proposedWorkingMemory = memoryCheck.state;
          if (!memoryCheck.valid) throw Object.assign(new Error(memoryCheck.errors.join('; ')), { code: 'WORKING_MEMORY', errors: memoryCheck.errors });
          const focus = wire.actorState.focusedGoalId;
          const uses = (wire as import('./wholeTraceContracts').WholeTraceCognitiveChoiceDecision).basis.memoryUses;
          if (!persistent && focus && wire.actorState.activity !== 'interest') {
            const required = decision.action.type === 'add' || decision.action.type === 'remove'
              ? ['name', 'requiredQuantity'] : ['name'];
            const missing = required.filter(field => !uses.some(use => use.goalId === focus && use.field === field));
            if (missing.length) throw Object.assign(new Error(`Focused goal ${focus} requires declared memoryUses for ${missing.join(', ')}; declared provenance alone is not working memory`), { code: 'WORKING_MEMORY' });
          }
        }
        pending = { decisionIndex: accepted, before, ...observation, basis: structuredClone(d.basis),
          actorState: structuredClone(d.actorState), action: structuredClone(decision.action), delayMs: d.delayMs,
          reason: d.reason, currentTask: d.actorState.task,
          ...(memoryCheck ? { cognition: structuredClone(memoryCheck) } : {}),
          ...(taskCheck ? { taskMemory: structuredClone(taskCheck) } : {}),
          ...(binding ? { choiceResolution: { choiceRef: structuredClone((wire as import('./wholeTraceContracts').WholeTraceChoiceDecision).choiceRef),
            resolvedChoiceRef: structuredClone(binding.resolvedChoiceRef),
            ...(binding.normalization ? { normalization: structuredClone(binding.normalization) } : {}),
            derivedCueRefs: [...binding.derivedCueRefs],
            declaredBasisCueRefs: [...((wire as import('./wholeTraceContracts').WholeTraceChoiceDecision).basis.cueRefs ?? [])],
            declaredTriggerCueRefs: [...((wire as import('./wholeTraceContracts').WholeTraceChoiceDecision).actorState.triggerCueRefs ?? [])],
            source: structuredClone(binding.source) } } : {}) };
        return decision;
      },
      onActorDecisionAccepted: () => {
        if (pending) {
          if (pending.action.type === 'walkToAnchor') {
            const anchorId = pending.action.anchorId;
            const target = bundle.worldReference.waypoints.find(w => w.anchorId === anchorId);
            if (!target) throw new Error('Accepted anchor is missing from the prepared waypoint catalogue');
            acceptedFrame = { ...acceptedFrame, location: target.waypointId };
          } else if (pending.action.type === 'requestCashier') {
            const previous = bundle.worldReference.navigation.states.find(s => s.stateId === acceptedFrame.navigationStateId)!;
            const cashiers = { ...previous.cashierAvailability, [pending.action.checkoutId ?? 'checkout']: true };
            const next = bundle.worldReference.navigation.states.find(s => canonicalMarketReplayJson(s.cashierAvailability) === canonicalMarketReplayJson(cashiers));
            if (!next) throw new Error('Accepted cashier change is missing from the prepared navigation states');
            acceptedFrame = { ...acceptedFrame, navigationStateId: next.stateId };
          }
          knowledgeAudit.push(pending); previousState = structuredClone(pending.actorState);
          cognition?.commit();
          taskMemory?.commit();
        }
        pending = undefined; accepted++;
      },
      onActorDecisionApplied: after => {
        lastApplied = structuredClone(after);
        if (prefix && accepted === candidate.decisions.length && accepted < 100
          && !wholeTraceTerminalIntent(candidate.decisions.at(-1))) capturePrefix(after, false);
      },
      onCheckpoint: onCheckpoint ? entry => {
        try { onCheckpoint(entry); }
        catch (error) { checkpointFailure = error; throw error; }
      } : undefined,
    });
    if (accepted !== candidate.decisions.length) throw new Error('Candidate contains unused actions after termination');
    // Proof links produced by the transport are not model-declared recall cues.
    // Keep them for hard provenance checks, but do not let them clear role warnings.
    const roleEntries = knowledgeAudit.map(entry => entry.choiceResolution ? {
      ...entry, actorState: { ...entry.actorState, triggerCueRefs: entry.choiceResolution.declaredTriggerCueRefs },
    } : entry);
    const personaReview = auditWholeTraceActorFidelity(roleEntries, persona, {
      objectives: createMarketSession(settings.snapshot.config, settings.snapshot.environment).objectives,
      ...(bundle.authoringGuide?.authoringVersion === '2' ? { annotationReview: 'actor-annotation-v1' as const } : {}),
    });
    const taskExpression = persistent ? reviewWholeTraceTaskExpression(roleEntries) : undefined;
    if (prefix) capturePrefix(lastApplied ?? before!, true);
    return { trace, acceptedActions: accepted, knowledgeAudit,
      ...(cognition ? { workingMemory: cognition.snapshot() } : {}),
      ...(taskMemory ? { taskMemory: taskMemory.snapshot() } : {}),
      personaReview: { ...personaReview,
        ...(taskExpression ? { taskExpression,
          status: personaReview.findings.length || taskExpression.findings.length ? 'review' as const : 'clear' as const,
          findings: [...personaReview.findings, ...taskExpression.findings] } : {}) } };
  } catch (error) {
    if (error instanceof WholeTracePrefixComplete) throw error;
    if (checkpointFailure) throw Object.assign(new Error('Whole trace diagnostic write failed', { cause: checkpointFailure }),
      { stage: 'persistence', code: (checkpointFailure as NodeJS.ErrnoException).code ?? 'WHOLE_TRACE_DIAGNOSTIC_WRITE_FAILED' });
    const code = (error as { code?: string }).code;
    throw new WholeTraceCompileError({ valid: false, code: code === 'KNOWLEDGE_BASIS' || code === 'ACTOR_STATE' || code === 'WORKING_MEMORY' || code === 'TASK_MEMORY' || code?.startsWith('CHOICE_') ? code : 'CANDIDATE_EXECUTION',
      errors: [(error as Error).message], failedDecisionIndex: activeIndex,
      issues: runtimeIssues(code ?? 'CANDIDATE_EXECUTION', (error as { errors?: string[] }).errors ?? [(error as Error).message],
        activeIndex, cognition?.snapshot(), proposedWorkingMemory, cognition?.profile.rules),
      acceptedPrefixLength: accepted, ...(before ? { before } : {}), knowledge: ledger.snapshot(),
      ...(cognition ? { workingMemory: cognition.snapshot(), ...(proposedWorkingMemory ? { proposedWorkingMemory } : {}) } : {}),
      ...(taskMemory ? { taskMemory: taskMemory.snapshot(), ...(proposedTaskMemory ? { proposedTaskMemory } : {}) } : {}),
      validPrefix: structuredClone(candidate.decisions.slice(0, accepted)), acceptedFrame: structuredClone(acceptedFrame),
      ...(before ? { choiceFrame: wholeTraceChoiceFrame(before, bundle, acceptedFrame) } : {}) });
  }
}
