import { createHash, randomUUID } from 'node:crypto';
import { canonicalMarketReplayJson, marketReplayFingerprint, marketReplayTraceId, type MarketReplayTrace, type MarketReplayStep } from '../../frontend/src/game/marketReplayTrace';
import { AttentionPolicy } from './attentionPolicy';
import { ACTOR_POLICY_VERSION, attentionActorPolicyVersion, isExtendedActorPolicy, assertDecision, createAttentionLlmPolicy } from './llmPolicy';
import { TraceGuard, validateTrace } from './traceValidation';
import { projectDecision } from './simulator';
import { ActorLearningMemory, validateLearning, validateLearnerIdentity, assertLearnerIdentity, learnerIdentityFrom, type LearnerIdentity } from './actorLearning';
import { Random } from './random';
import { ActorActivityMonitor } from './actorActivity';
import { appendCheckoutCompletion } from './checkoutCompletion';
import { createFeedbackLlmPolicy } from './feedbackLlmPolicy';
import { buildFeedbackActorFrame, feedbackChoiceMatchesDecision, emptyFeedbackBeliefMemory, validateFeedbackBeliefMemory, carryFeedbackBeliefMemory, isFeedbackActorPolicy, isExperienceFeedbackPolicy, isStructuredFeedbackPolicy, isQuantityBeliefFeedbackPolicy, isResultReflectionFeedbackPolicy, isNoGiveUpFeedbackPolicy, isMovementNoteFeedbackPolicy, isPassageMarkerFeedbackPolicy, isProgressNoteFeedbackPolicy, projectFeedbackObservation } from './feedbackActor';
import { FeedbackMovementPolicy } from './feedbackMovementPolicy';
import { FeedbackExperience } from './feedbackExperience';
import { wholeTraceHasAnchorMovementFeedback } from './wholeTraceMovementFeedback';
import type { ActorObservation, AttentionExperience, Decision, Persona, TraceEntry, TraceOptions } from './types';

type StepIntent = MarketReplayStep extends infer S ? S extends MarketReplayStep ? Omit<S, 'id' | 'reactionDelayMs' | 'reason' | 'timeoutMs'> : never : never;

/** Observation horizon, counted in accepted model decisions, not UI or motor steps. */
export const ACTOR_ACTION_LIMIT = 100;

/** Executes bounded actor observations; whole-trace reference context is built separately. */
export async function generateAttentionTrace(options: TraceOptions, persona: Persona, model: string): Promise<MarketReplayTrace> {
  const mode = options.mode ?? 'llm';
  if (options.actorDecisionProvider && mode !== 'llm') throw new Error('actorDecisionProvider requires llm mode; stochastic traces must be seed-reproducible');
  const wholeTrace = options.planningMode === 'whole-trace';
  const actorPolicyVersion = attentionActorPolicyVersion(options);
  const feedbackActor = isFeedbackActorPolicy(actorPolicyVersion);
  const wholeTraceDirectionalMovement = ['directional-v1', 'directional-v2'].includes(options.wholeTraceMovementVersion ?? '');
  const fixedAnchorMovement = options.wholeTraceMovementVersion === 'directional-v2';
  if (options.wholeTraceMovementVersion !== undefined
    && (!wholeTraceDirectionalMovement || !wholeTrace || actorPolicyVersion !== 'whole-trace-v3'))
    throw new Error(`wholeTraceMovementVersion requires whole-trace-v3 and ${options.wholeTraceMovementVersion === 'directional-v2' ? 'directional-v2' : 'directional-v1'}`);
  const directionalMovement = feedbackActor && actorPolicyVersion !== 'feedback-choice-v1' || wholeTraceDirectionalMovement;
  // v9 offers no giveUp, so its action limit ends in the controller-owned checkout instead of a technical failure.
  const systemCheckout = isNoGiveUpFeedbackPolicy(actorPolicyVersion);
  const exploration = actorPolicyVersion === 'feedback-choice-v3' || isExperienceFeedbackPolicy(actorPolicyVersion);
  if (options.feedbackMovement !== undefined && !exploration)
    throw new Error('feedbackMovement requires feedback-choice-v3 or feedback-choice-v4');
  const movementPolicy = exploration ? new FeedbackMovementPolicy(options.seed, options.feedbackMovement,
    isExperienceFeedbackPolicy(actorPolicyVersion) ? 'exploration-v2' : 'exploration-v1') : null;
  const recentExperience = isExperienceFeedbackPolicy(actorPolicyVersion) ? new FeedbackExperience({ version: isQuantityBeliefFeedbackPolicy(actorPolicyVersion) ? 'bounded-observed-experience-v2' : 'bounded-observed-experience-v1',
    movementHistory: isMovementNoteFeedbackPolicy(actorPolicyVersion), passageHistory: isPassageMarkerFeedbackPolicy(actorPolicyVersion),
    progressHistory: isProgressNoteFeedbackPolicy(actorPolicyVersion) }) : null;
  if (feedbackActor && (options.actorDecisionProvider || options.decisionProvider)) {
    throw new Error('feedback-choice-v1 requires feedbackDecisionProvider with a current-only frame; raw actorDecisionProvider is not allowed');
  }
  if (options.feedbackDecisionProvider && (!feedbackActor || mode !== 'llm')) throw new Error('feedbackDecisionProvider requires feedback-choice-v1 LLM mode');
  if (feedbackActor && (mode !== 'llm' || options.planningMode || options.learnerIdentity
    || options.attentionExperience && (options.attentionExperience.visit !== 'first-play'
      || options.attentionExperience.memory || options.attentionExperience.learning))) {
    throw new Error('feedback-choice-v1 requires a fresh first-play actor; legacy exact experience cannot be imported as belief memory');
  }
  const extendedActor = mode === 'llm' && isExtendedActorPolicy(actorPolicyVersion);
  const hasWholeOptions = options.planningMode !== undefined || options.planningSubmissions !== undefined
    || options.repairSubmissions !== undefined || ['whole-trace-v1', 'whole-trace-v2', 'whole-trace-v3'].includes(options.actorPolicyVersion ?? '');
  const planningSubmissions = options.planningSubmissions === undefined ? 1 : options.planningSubmissions;
  const repairSubmissions = options.repairSubmissions === undefined ? 0 : options.repairSubmissions;
  if (hasWholeOptions && (!wholeTrace || options.actorPolicyVersion !== 'whole-trace-v3' || mode !== 'llm'
    || model !== 'gpt-6-luna' || options.reasoningEffort !== 'low' || options.tracePolicyVersion !== '6'
    || !options.actorDecisionProvider || !Number.isSafeInteger(planningSubmissions) || planningSubmissions < 1
    || !Number.isSafeInteger(repairSubmissions) || repairSubmissions < 0 || repairSubmissions >= planningSubmissions)) {
    throw new Error('Whole-trace planning requires the Luna low whole-trace-v3 policy, schema policy 6, a local decision provider and valid submission counts');
  }
  const layoutKey = marketReplayFingerprint(options.snapshot.environment);
  const supplied = options.attentionExperience;
  if (supplied?.learning) validateLearning(supplied.learning);
  const identity = options.learnerIdentity ?? (supplied?.learning?.version === '2'
    ? learnerIdentityFrom(supplied.learning as any) : undefined);
  if (identity) {
    validateLearnerIdentity(identity);
    if (mode !== 'llm' || identity.personaId !== persona.id || identity.personaVersion !== persona.version
      || identity.model !== model || (identity.policyVersion !== ACTOR_POLICY_VERSION
        && !(identity.policyVersion === 'episodic-choice-v10' && model === 'gpt-6-luna' && identity.reasoningEffort === 'low')
        && !(identity.policyVersion === 'whole-trace-v3' && wholeTrace && model === 'gpt-6-luna' && identity.reasoningEffort === 'low'))
      || identity.policyVersion !== actorPolicyVersion || wholeTrace && identity.policyVersion !== 'whole-trace-v3')
      throw new Error('Learner actor identity changed');
    if (identity.arm === 'C' && (supplied?.learning || supplied?.memory || supplied?.visit === 'revisit')) throw new Error('Memory-free arm C cannot import prior experience');
    if (supplied?.learning) {
      if (supplied.learning.version !== '2') throw new Error('Persistent learner requires identity-bound v2 learning');
      assertLearnerIdentity(learnerIdentityFrom(supplied.learning as any), identity);
    }
  }
  if (options.trialBinding && (!identity || options.trialBinding.arm !== identity.arm
    || options.trialBinding.trialId !== identity.experimentId)) throw new Error('Trial binding differs from learner identity');
  if (options.trialBinding) {
    const actualRequest = { personaId: persona.id, mode: 'llm', seed: options.seed,
      maxActions: options.maxActions ?? 1000, timingProfile: options.timingProfile ?? (wholeTrace ? 'original' : 'compact'),
      ...(options.timeBudgetMs === undefined ? {} : { timeBudgetMs: options.timeBudgetMs }),
      snapshot: options.snapshot, llm: { model, maxCalls: options.llm?.maxCalls ?? 300 },
      learnerIdentity: identity, attentionExperience: supplied ?? { visit: 'first-play' },
      ...(wholeTrace ? { planningMode: 'whole-trace' } : {}) };
    const actualHash = createHash('sha256').update(canonicalMarketReplayJson(actualRequest)).digest('hex');
    if (actualHash !== options.trialBinding.requestHash) throw new Error('Prepared trial request changed: actor, memory, snapshot or generation limits');
  }
  if (supplied && !['first-play', 'revisit'].includes(supplied.visit)) throw new Error('Invalid attention experience visit');
  if (supplied?.visit === 'first-play' && supplied.memory) throw new Error('First-play cannot import prior gameplay memory');
  if (supplied?.visit === 'revisit' && (!supplied.memory || !supplied.previousLayoutKey)) throw new Error('Revisit requires memory and previousLayoutKey from a previous trace');
  const experience: AttentionExperience = { ...supplied, visit: supplied?.visit ?? 'first-play', layoutKey };
  if (supplied?.learning && (mode !== 'llm' || experience.visit !== 'revisit')) throw new Error('Learning experience requires an AI revisit');
  const policy = mode === 'stochastic' ? new AttentionPolicy(persona, options.seed, experience) : new ActorLearningMemory(supplied?.learning, extendedActor);
  const needsProvider = mode === 'llm' && !options.actorDecisionProvider && !options.decisionProvider && !options.feedbackDecisionProvider;
  const feedbackProvider = needsProvider && feedbackActor
    ? createFeedbackLlmPolicy(options.llm ?? {}, options.seed, actorPolicyVersion as import('./feedbackActor').FeedbackActorPolicyVersion, options.feedbackMovement) : null;
  const provider = needsProvider && !feedbackActor ? createAttentionLlmPolicy(options.llm ?? {}, options.seed, extendedActor) : null;
  const activity = new ActorActivityMonitor();
  let systemCompletion: NonNullable<MarketReplayTrace['generation']>['systemCompletion'];
  if (options.decisionProvider && !options.actorDecisionProvider) throw new Error('Attention personas require actorDecisionProvider; raw game observations are not exposed');
  const guard = new TraceGuard(options.snapshot, persona.id, persona.version, model, true, extendedActor, feedbackActor, directionalMovement, isStructuredFeedbackPolicy(actorPolicyVersion), isResultReflectionFeedbackPolicy(actorPolicyVersion), !wholeTraceDirectionalMovement, fixedAnchorMovement, options.wholeTraceObservationVersion);
  const motor = new Random(`${options.seed}:presentation:${persona.id}:${persona.version}`);
  const history: TraceEntry[] = [], steps: MarketReplayStep[] = [];
  let plannedMs = 0;
  let feedbackMemory = emptyFeedbackBeliefMemory(feedbackActor ? actorPolicyVersion : undefined);
  const append = (intent: StepIntent, delayMs: number, reason: string,
    metadata: Pick<Decision, 'attentionTag' | 'cueRefs' | 'movementPolicy'> = {}, timeoutMs = 120000, systemOwned = false) => {
    // The execution deadline also needs room for panel transitions and timer scheduling.
    if (feedbackActor && 'durationMs' in intent) timeoutMs = Math.max(timeoutMs, (intent.durationMs ?? 0) + 5000);
    const step = { ...intent, id: `step-${String(steps.length + 1).padStart(4, '0')}`, reactionDelayMs: Math.round(delayMs), timeoutMs, reason, ...metadata } as MarketReplayStep;
    const applied = guard.execute(step, systemOwned);
    steps.push(step);
    plannedMs += step.reactionDelayMs + applied.movementMs
      + (step.type === 'moveDirection' ? 0 : 'durationMs' in step ? (step.durationMs ?? 0) : step.type === 'dragProduct' ? (step.gesture.durationMs + step.gesture.hesitationMs) * step.quantity : 0);
    if (!feedbackActor && options.timeBudgetMs !== undefined && plannedMs > options.timeBudgetMs) throw new Error('ATTENTION_GENERATION_LIMIT: planned-time-budget; incomplete plan was not exported');
  };
  append({ type: 'start' }, feedbackActor ? 0 : persona.parameters.reactionMedianMs, '게임 설명 화면을 한 장씩 확인한다');
  for (;;) {
    // Keep the app bridge's heartbeat responsive while constructing long plans.
    if (history.length && history.length % 20 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    const limit = history.length >= (options.maxActions ?? 1000) ? 'action-limit'
      : mode === 'llm' && !wholeTrace && history.length >= (options.llm?.maxCalls ?? 300) ? 'model-call-limit'
      : options.timeBudgetMs !== undefined && plannedMs >= options.timeBudgetMs ? 'planned-time-budget' : null;
    const before = guard.observeActor();
    policy.observe(before);
    activity.observe(before);
    const feedback = activity.getState();
    if (feedbackActor && !systemCheckout && history.length >= ACTOR_ACTION_LIMIT) {
      throw new Error('ATTENTION_GENERATION_LIMIT: action-limit; no system checkout or completed persona outcome was fabricated');
    }
    if (extendedActor && history.length >= ACTOR_ACTION_LIMIT) {
      // Natural submit/giveUp below already ended the loop, including decision 100.
      // Repetition is diagnostic only. This fixed observation horizon is not failure.
      options.onCheckpoint?.({ kind: 'system-completion', index: history.length, activity: feedback });
      systemCompletion = appendCheckoutCompletion(guard, `step-${String(steps.length + 1).padStart(4, '0')}`, options.seed,
        (intent, reason, timeoutMs) => append(intent, feedbackActor ? 0 : 300, reason, {}, timeoutMs, true));
      break;
    }
    if (limit) throw new Error(`ATTENTION_GENERATION_LIMIT: ${limit}; incomplete plan was not exported as a persona outcome`);
    const actorFrame = feedbackActor ? buildFeedbackActorFrame({ observation: before, persona, memory: feedbackMemory,
      seed: options.seed, decisionIndex: history.length, policyVersion: actorPolicyVersion as import('./feedbackActor').FeedbackActorPolicyVersion,
      ...(movementPolicy ? { movementPolicy: movementPolicy.prepare(projectFeedbackObservation(before, feedbackActor ? actorPolicyVersion : undefined), history.length) } : {}),
      ...(recentExperience ? { experience: recentExperience.snapshot(projectFeedbackObservation(before, feedbackActor ? actorPolicyVersion : undefined)) } : {}) }) : null;
    const decision = options.feedbackDecisionProvider ? await options.feedbackDecisionProvider(structuredClone(actorFrame!)) : options.actorDecisionProvider ? extendedActor
      ? await options.actorDecisionProvider(before, history, persona, feedback, policy.getState())
      : await (options.actorDecisionProvider as (o: ActorObservation, h: TraceEntry[], p: Persona) => Promise<Decision>)(before, history, persona)
      : feedbackProvider ? await feedbackProvider(before, history, persona, undefined, undefined, actorFrame!)
      : provider ? await provider(before, history, persona, policy.getState(), feedback) : (policy as AttentionPolicy).next(before);
    assertDecision(decision, feedbackActor, { directionalMovement: wholeTraceDirectionalMovement });
    if (feedbackActor) {
      const checked = validateFeedbackBeliefMemory(decision.feedbackMemory, actorPolicyVersion);
      if (!checked.valid) throw new Error(`Invalid feedback belief memory: ${checked.errors.join('; ')}`);
      if (actorFrame && !actorFrame.availableChoices.some(choice =>
        feedbackChoiceMatchesDecision(choice, decision))) throw new Error('Feedback decision is not a current visible choice');
      feedbackMemory = carryFeedbackBeliefMemory(feedbackMemory, decision.feedbackMemory!, actorPolicyVersion);
    }
    if (movementPolicy) decision.movementPolicy = structuredClone(actorFrame!.movementPolicy!);
    else if (decision.movementPolicy !== undefined) throw new Error('Movement policy decisions require feedback-choice-v3 or feedback-choice-v4');
    if (decision.dragOutcome !== undefined && !feedbackActor) throw new Error('Explicit actor drag outcomes require feedback-choice-v1');
    if (decision.action.type === 'moveDirection' && !directionalMovement) throw new Error('Directional input requires feedback-choice-v2/v3/v4');
    assertActorDecision(decision, before);
    assertCueReferences(decision, before, policy);
    if (options.timeBudgetMs !== undefined && plannedMs + decision.delayMs >= options.timeBudgetMs) throw new Error('ATTENTION_GENERATION_LIMIT: planned-time-budget; incomplete plan was not exported');
    // Only v3's explicitly recorded movement mode constrains AI choice; beliefs and shopping answers are never repaired.
    const raw = guard.observe();
    const activeKind = raw.environment.stationDetails.find(s => s.id === raw.activeStation)?.kind;
    if ((decision.action.type === 'viewHelp' || decision.action.type === 'viewCart' && activeKind !== 'shelf') && raw.activeStation) {
      append({ type: 'closeStation' }, feedbackActor ? 0 : Math.round(persona.parameters.reactionMedianMs * .35), '화면을 닫고 안내 버튼을 확인한다');
    }
    const intent = projectDecision(decision, guard.observe(), persona, options.snapshot, options.seed, steps.length, motor);
    append(intent, decision.delayMs, decision.reason, {
      ...(decision.attentionTag ? { attentionTag: decision.attentionTag } : {}),
      ...(decision.cueRefs ? { cueRefs: decision.cueRefs } : {}),
      ...(decision.movementPolicy ? { movementPolicy: structuredClone(decision.movementPolicy) } : {}),
    });
    history.push(decision);
    const after = guard.observeActor();
    recentExperience?.record(decision, projectFeedbackObservation(before, feedbackActor ? actorPolicyVersion : undefined), projectFeedbackObservation(after, feedbackActor ? actorPolicyVersion : undefined));
    policy.record(decision, before, after);
    activity.record(decision, before, after);
    options.onActorDecisionAccepted?.();
    if (options.onActorDecisionApplied) {
      const applied = guard.observe();
      options.onActorDecisionApplied(after, {
        position: { ...applied.playerPosition }, cashierAvailability: { ...applied.cashierAvailability },
      });
    }
    const { exchange: _exchange, ...recordedDecision } = decision;
    options.onCheckpoint?.({ kind: 'decision', index: history.length, before, decision: recordedDecision, after, activity: activity.getState() });
    if (feedbackActor && options.timeBudgetMs !== undefined && plannedMs > options.timeBudgetMs) {
      throw new Error('ATTENTION_GENERATION_LIMIT: planned-time-budget; applied attempt was recorded but incomplete plan was not exported');
    }
    if (decision.action.type === 'submit') {
      append({ type: 'awaitReviewAccepted' }, 0, '앱의 분석 접수 결과를 기다린다', {}, 180000);
      append({ type: 'leave' }, feedbackActor ? 0 : persona.parameters.reactionMedianMs, '접수된 뒤 장보기를 나간다'); break;
    }
    if (decision.action.type === 'giveUp') {
      append({ type: 'skipRating' }, feedbackActor ? 0 : persona.parameters.reactionMedianMs, '이번 게임의 평가를 건너뛴다');
      append({ type: 'leave' }, feedbackActor ? 0 : persona.parameters.reactionMedianMs, '이번 장보기를 그만하고 나간다'); break;
    }
  }
  if (feedbackActor && options.timeBudgetMs !== undefined && plannedMs > options.timeBudgetMs) {
    throw new Error('ATTENTION_GENERATION_LIMIT: planned-time-budget; terminal UI steps exceed the budget and no completed trace was exported');
  }
  const body: Omit<MarketReplayTrace, 'traceId'> = {
    traceSchemaVersion: '2', personaId: persona.id, personaVersion: persona.version, seed: options.seed,
    generationPolicy: mode, policyVersion: options.tracePolicyVersion ?? (feedbackActor ? '6' : '5'), experienceMode: experience.visit,
    attentionExperience: { layoutKey, memory: policy.getMemory(), source: 'planned-trace' },
    generation: { model, reproducibility: mode === 'stochastic' ? 'seed-and-snapshot' : 'captured-trace', ...(mode === 'llm' ? {
      requestId: randomUUID(), actorPolicyVersion: actorPolicyVersion as NonNullable<MarketReplayTrace['generation']>['actorPolicyVersion'],
      ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
      ...(wholeTrace ? { planningMode: 'whole-trace' as const, observationScope: 'whole-world' as const, actorKnowledgeScope: 'observed-and-remembered' as const, actorStateVersion: '1' as const, timingProfile: 'actor-preserved-v1' as const,
        planningSubmissions, repairSubmissions } : {}),
      ...(wholeTraceDirectionalMovement ? { wholeTraceMovementVersion: options.wholeTraceMovementVersion,
        movementContract: 'joystick-direction-v1' as const } : {}),
      ...(options.wholeTraceObservationVersion ? { wholeTraceObservationVersion: options.wholeTraceObservationVersion } : {}),
      ...(options.wholeTraceMovementValidationVersion ? { wholeTraceMovementValidationVersion: options.wholeTraceMovementValidationVersion,
        ...(options.wholeTraceMovementFeedbackVersion ? { wholeTraceMovementFeedbackVersion: options.wholeTraceMovementFeedbackVersion } : {}) } : {}),
      ...(wholeTraceHasAnchorMovementFeedback(options.wholeTraceMovementFeedbackVersion)
        ? { wholeTraceMovementFeedbackVersion: options.wholeTraceMovementFeedbackVersion } : {}),
      ...(feedbackActor ? { timingProfile: directionalMovement ? 'activity-duration-v2' as const : 'activity-duration-v1' as const,
        ...(directionalMovement ? { movementContract: 'joystick-direction-v1' as const } : {}),
        ...(movementPolicy ? { movementPolicy: movementPolicy.configuration } : {}),
        feedback: { ...(actorPolicyVersion === 'feedback-choice-v13'
          ? { version: '9' as const, memory: 'actor-authored-with-recent-experience' as const,
            experienceContract: 'bounded-observed-experience-v2' as const, intentContract: 'persistent-intent-v1' as const,
            beliefContract: 'quantity-source-beliefs-v1' as const, reflectionContract: 'result-reflection-next-step-v1' as const,
            observationContract: 'shelf-in-cart-cue-v1' as const, revisitContract: 'shelf-revisit-notes-v1' as const,
            choiceContract: 'recent-shelf-choice-marker-v1' as const, movementNoteContract: 'recent-movement-notes-v1' as const,
            passageContract: 'anonymous-passage-visit-marker-v1' as const, choiceIdContract: 'per-frame-short-ids-v1' as const,
            listMarkerContract: 'recent-list-read-marker-v1' as const, progressNoteContract: 'belief-progress-checkout-notes-v1' as const }
          : actorPolicyVersion === 'feedback-choice-v12'
          ? { version: '8' as const, memory: 'actor-authored-with-recent-experience' as const,
            experienceContract: 'bounded-observed-experience-v2' as const, intentContract: 'persistent-intent-v1' as const,
            beliefContract: 'quantity-source-beliefs-v1' as const, reflectionContract: 'result-reflection-next-step-v1' as const,
            observationContract: 'shelf-in-cart-cue-v1' as const, revisitContract: 'shelf-revisit-notes-v1' as const,
            choiceContract: 'recent-shelf-choice-marker-v1' as const, movementNoteContract: 'recent-movement-notes-v1' as const,
            passageContract: 'anonymous-passage-visit-marker-v1' as const, choiceIdContract: 'per-frame-short-ids-v1' as const }
          : actorPolicyVersion === 'feedback-choice-v11'
          ? { version: '7' as const, memory: 'actor-authored-with-recent-experience' as const,
            experienceContract: 'bounded-observed-experience-v2' as const, intentContract: 'persistent-intent-v1' as const,
            beliefContract: 'quantity-source-beliefs-v1' as const, reflectionContract: 'result-reflection-next-step-v1' as const,
            observationContract: 'shelf-in-cart-cue-v1' as const, revisitContract: 'shelf-revisit-notes-v1' as const,
            choiceContract: 'recent-shelf-choice-marker-v1' as const, movementNoteContract: 'recent-movement-notes-v1' as const }
          : actorPolicyVersion === 'feedback-choice-v10'
          ? { version: '6' as const, memory: 'actor-authored-with-recent-experience' as const,
            experienceContract: 'bounded-observed-experience-v2' as const, intentContract: 'persistent-intent-v1' as const,
            beliefContract: 'quantity-source-beliefs-v1' as const, reflectionContract: 'result-reflection-next-step-v1' as const,
            observationContract: 'shelf-in-cart-cue-v1' as const, revisitContract: 'shelf-revisit-notes-v1' as const,
            choiceContract: 'recent-shelf-choice-marker-v1' as const }
          : actorPolicyVersion === 'feedback-choice-v9'
          ? { version: '5' as const, memory: 'actor-authored-with-recent-experience' as const,
            experienceContract: 'bounded-observed-experience-v2' as const, intentContract: 'persistent-intent-v1' as const,
            beliefContract: 'quantity-source-beliefs-v1' as const, reflectionContract: 'result-reflection-next-step-v1' as const,
            observationContract: 'shelf-in-cart-cue-v1' as const, revisitContract: 'shelf-revisit-notes-v1' as const }
          : isResultReflectionFeedbackPolicy(actorPolicyVersion)
          ? { version: '4' as const, memory: 'actor-authored-with-recent-experience' as const,
            experienceContract: 'bounded-observed-experience-v2' as const, intentContract: 'persistent-intent-v1' as const,
            beliefContract: 'quantity-source-beliefs-v1' as const, reflectionContract: 'result-reflection-next-step-v1' as const,
            observationContract: 'shelf-in-cart-cue-v1' as const }
          : actorPolicyVersion === 'feedback-choice-v7'
          ? { version: '3' as const, memory: 'actor-authored-with-recent-experience' as const,
            experienceContract: 'bounded-observed-experience-v2' as const, intentContract: 'persistent-intent-v1' as const,
            beliefContract: 'quantity-source-beliefs-v1' as const }
          : isExperienceFeedbackPolicy(actorPolicyVersion)
          ? { version: '2' as const, memory: 'actor-authored-with-recent-experience' as const,
            experienceContract: 'bounded-observed-experience-v1' as const, intentContract: 'persistent-intent-v1' as const }
          : { version: '1' as const, memory: 'actor-authored' as const }), observationScope: 'current-screen' as const,
          contextDelivery: options.feedbackDecisionProvider ? 'external-frame' as const : 'stateless-http' as const, decisions: history.length } } : {}),
      ...(systemCompletion ? { systemCompletion } : {}),
      ...(extendedActor ? { experienceFingerprint: marketReplayFingerprint(supplied ?? { visit: 'first-play' }) } : {}),
      ...(identity ? { learnerIdentity: structuredClone(identity) } : {}),
      ...(options.trialBinding ? { trialBinding: structuredClone(options.trialBinding) } : {}),
    } : {}) },
    target: { snapshotId: options.snapshot.snapshotId, completionMode: 'ai-review',
      ...(options.snapshot.mission ? { missionId: options.snapshot.mission.id,
        ...(options.snapshot.mission.scenarioId ? { scenarioId: options.snapshot.mission.scenarioId } : {}) } : {}) }, steps,
  };
  const trace = { ...body, traceId: marketReplayTraceId(body) };
  const validated = validateTrace(trace, options.snapshot);
  if (!validated.valid) throw new Error(`Generated attention trace failed validation: ${validated.errors.join('; ')}`);
  return trace;
}

function assertCueReferences(d: Decision, o: ActorObservation, policy: Pick<AttentionPolicy, 'getMemory'>) {
  const memory = policy.getMemory();
  const available = new Set([
    ...(o.listAvailable ? ['list'] : []),
    ...[...o.visibleStations, ...memory.stations].map(s => `station:${s.id}`),
    ...(o.activeStation ? [`station:${o.activeStation}`] : []),
    ...[...o.products, ...memory.knownProducts].map(p => `product:${p.id}`),
    ...[...o.anchors, ...memory.anchors].map(a => `anchor:${a.id}`),
  ]);
  for (const cue of d.cueRefs ?? []) if (!available.has(cue)) throw new Error(`Unobserved cue reference: ${cue}`);
}

function assertActorDecision(d: Decision, o: ActorObservation) {
  const a = d.action;
  if (a.type === 'moveDirection' && (o.phase !== 'shopping' || o.view !== 'world' || o.activeStation)) throw new Error('Close the panel before directional movement');
  if (a.type === 'walkToAnchor' && !o.anchors.some(x => x.id === a.anchorId)) throw new Error('Unobserved anchor is not an available movement intention');
  if ((a.type === 'walkTo' || a.type === 'interact') && !o.visibleStations.some(x => x.id === a.station && x.near)) throw new Error('The station is not a visible nearby interaction');
  if (a.type === 'add' && !o.products.some(x => x.id === a.productId)) throw new Error('The product must be observed by browsing before selection');
  if (a.type === 'checkout' && o.phase !== 'checkout' && !o.visibleStations.some(x => x.kind === 'checkout' && x.near && (!a.checkoutId || x.id === a.checkoutId))) throw new Error('Checkout is not a visible nearby choice');
  if (a.type === 'readList' && !o.listAvailable) throw new Error('Close the panel before attending to the mission list');
}
