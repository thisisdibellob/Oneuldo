import { randomUUID } from 'node:crypto';
import { marketReplayFingerprint, marketReplayTraceId, type MarketReplayTrace, type MarketReplayStep } from '../../frontend/src/game/marketReplayTrace';
import { AttentionPolicy } from './attentionPolicy';
import { assertDecision, createAttentionLlmPolicy } from './llmPolicy';
import { TraceGuard, validateTrace } from './traceValidation';
import { projectDecision } from './simulator';
import { ActorLearningMemory } from './actorLearning';
import { Random } from './random';
import type { ActorObservation, AttentionExperience, Decision, Persona, TraceEntry, TraceOptions } from './types';

type StepIntent = MarketReplayStep extends infer S ? S extends MarketReplayStep ? Omit<S, 'id' | 'reactionDelayMs' | 'reason' | 'timeoutMs'> : never : never;

/** Whole-trace planner. Raw game facts stay in the guard, not in actor input. */
export async function generateAttentionTrace(options: TraceOptions, persona: Persona, model: string): Promise<MarketReplayTrace> {
  const mode = options.mode ?? 'llm';
  if (options.actorDecisionProvider && mode !== 'llm') throw new Error('actorDecisionProvider requires llm mode; stochastic traces must be seed-reproducible');
  const layoutKey = marketReplayFingerprint(options.snapshot.environment);
  const supplied = options.attentionExperience;
  if (supplied && !['first-play', 'revisit'].includes(supplied.visit)) throw new Error('Invalid attention experience visit');
  if (supplied?.visit === 'first-play' && supplied.memory) throw new Error('First-play cannot import prior gameplay memory');
  if (supplied?.visit === 'revisit' && (!supplied.memory || !supplied.previousLayoutKey)) throw new Error('Revisit requires memory and previousLayoutKey from a previous trace');
  const experience: AttentionExperience = { ...supplied, visit: supplied?.visit ?? 'first-play', layoutKey };
  if (supplied?.learning && (mode !== 'llm' || experience.visit !== 'revisit')) throw new Error('Learning experience requires an AI revisit');
  const policy = mode === 'stochastic' ? new AttentionPolicy(persona, options.seed, experience) : new ActorLearningMemory(supplied?.learning);
  const provider = mode === 'llm' && !options.actorDecisionProvider && !options.decisionProvider ? createAttentionLlmPolicy(options.llm ?? {}) : null;
  if (options.decisionProvider && !options.actorDecisionProvider) throw new Error('Attention personas require actorDecisionProvider; raw game observations are not exposed');
  const guard = new TraceGuard(options.snapshot, persona.id, persona.version, model, true);
  const motor = new Random(`${options.seed}:presentation:${persona.id}:${persona.version}`);
  const history: TraceEntry[] = [], steps: MarketReplayStep[] = [];
  let plannedMs = 0;
  const append = (intent: StepIntent, delayMs: number, reason: string,
    metadata: Pick<Decision, 'attentionTag' | 'cueRefs'> = {}, timeoutMs = 120000) => {
    const step = { ...intent, id: `step-${String(steps.length + 1).padStart(4, '0')}`, reactionDelayMs: Math.round(delayMs), timeoutMs, reason, ...metadata } as MarketReplayStep;
    const applied = guard.execute(step);
    steps.push(step);
    plannedMs += step.reactionDelayMs + applied.movementMs
      + ('durationMs' in step ? step.durationMs : step.type === 'dragProduct' ? (step.gesture.durationMs + step.gesture.hesitationMs) * step.quantity : 0);
    if (options.timeBudgetMs !== undefined && plannedMs > options.timeBudgetMs) throw new Error('ATTENTION_GENERATION_LIMIT: planned-time-budget; incomplete plan was not exported');
  };
  append({ type: 'start' }, persona.parameters.reactionMedianMs, '게임 설명 화면을 한 장씩 확인한다');
  for (;;) {
    // Keep the app bridge's heartbeat responsive while constructing long plans.
    if (history.length && history.length % 20 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    const limit = history.length >= (options.maxActions ?? 1000) ? 'action-limit'
      : mode === 'llm' && history.length >= (options.llm?.maxCalls ?? 300) ? 'model-call-limit'
      : options.timeBudgetMs !== undefined && plannedMs >= options.timeBudgetMs ? 'planned-time-budget' : null;
    if (limit) throw new Error(`ATTENTION_GENERATION_LIMIT: ${limit}; incomplete plan was not exported as a persona outcome`);
    const before = guard.observeActor();
    policy.observe(before);
    const decision = options.actorDecisionProvider ? await options.actorDecisionProvider(before, history, persona)
      : provider ? await provider(before, history, persona, policy.getState()) : (policy as AttentionPolicy).next(before);
    assertDecision(decision);
    assertActorDecision(decision, before);
    assertCueReferences(decision, before, policy);
    if (options.timeBudgetMs !== undefined && plannedMs + decision.delayMs >= options.timeBudgetMs) throw new Error('ATTENTION_GENERATION_LIMIT: planned-time-budget; incomplete plan was not exported');
    // AI mode has no stochastic policy, forced forgetting, or probability-based behavior.
    const raw = guard.observe();
    const activeKind = raw.environment.stationDetails.find(s => s.id === raw.activeStation)?.kind;
    if ((decision.action.type === 'viewHelp' || decision.action.type === 'viewCart' && activeKind !== 'shelf') && raw.activeStation) {
      append({ type: 'closeStation' }, Math.round(persona.parameters.reactionMedianMs * .35), '화면을 닫고 안내 버튼을 확인한다');
    }
    const intent = projectDecision(decision, guard.observe(), persona, options.snapshot, options.seed, steps.length, motor);
    append(intent, decision.delayMs, decision.reason, {
      ...(decision.attentionTag ? { attentionTag: decision.attentionTag } : {}),
      ...(decision.cueRefs ? { cueRefs: decision.cueRefs } : {}),
    });
    history.push(decision);
    policy.record(decision, before, guard.observeActor());
    if (decision.action.type === 'submit') {
      append({ type: 'awaitReviewAccepted' }, 0, '앱의 분석 접수 결과를 기다린다', {}, 180000);
      append({ type: 'leave' }, persona.parameters.reactionMedianMs, '접수된 뒤 장보기를 나간다'); break;
    }
    if (decision.action.type === 'giveUp') {
      append({ type: 'skipRating' }, persona.parameters.reactionMedianMs, '이번 게임의 평가를 건너뛴다');
      append({ type: 'leave' }, persona.parameters.reactionMedianMs, '이번 장보기를 그만하고 나간다'); break;
    }
  }
  const body: Omit<MarketReplayTrace, 'traceId'> = {
    traceSchemaVersion: '2', personaId: persona.id, personaVersion: persona.version, seed: options.seed,
    generationPolicy: mode, policyVersion: '5', experienceMode: experience.visit,
    attentionExperience: { layoutKey, memory: policy.getMemory(), source: 'planned-trace' },
    generation: { model, reproducibility: mode === 'stochastic' ? 'seed-and-snapshot' : 'captured-trace', ...(mode === 'llm' ? { requestId: randomUUID(), actorPolicyVersion: 'episodic-choice-v4' as const } : {}) },
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
  if (a.type === 'walkToAnchor' && !o.anchors.some(x => x.id === a.anchorId)) throw new Error('Unobserved anchor is not an available movement intention');
  if ((a.type === 'walkTo' || a.type === 'interact') && !o.visibleStations.some(x => x.id === a.station && x.near)) throw new Error('The station is not a visible nearby interaction');
  if (a.type === 'add' && !o.products.some(x => x.id === a.productId)) throw new Error('The product must be observed by browsing before selection');
  if (a.type === 'checkout' && o.phase !== 'checkout' && !o.visibleStations.some(x => x.kind === 'checkout' && x.near && (!a.checkoutId || x.id === a.checkoutId))) throw new Error('Checkout is not a visible nearby choice');
  if (a.type === 'readList' && !o.listAvailable) throw new Error('Close the panel before attending to the mission list');
}
