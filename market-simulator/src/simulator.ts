import { randomUUID } from 'node:crypto';
import { marketReplayTraceId, marketReplayFingerprint, validateMarketReplaySnapshot, type MarketReplaySnapshot,
  type MarketReplayStep, type MarketReplayTrace } from '../../frontend/src/game/marketReplayTrace';
import type { MarketEnvironmentStationId } from '../../frontend/src/game/marketEnvironment';
import { getPersona } from './personas';
import { StochasticPolicy } from './stochasticPolicy';
import { assertDecision, createLlmPolicy } from './llmPolicy';
import { Random } from './random';
import { TraceGuard, validateTrace } from './traceValidation';
import type { Decision, TraceOptions, TraceEntry, TraceSummary, Observation, Persona } from './types';
import { generateAttentionTrace } from './attentionSimulator';
import { compactTraceTiming } from './traceTiming';
export { listPersonas } from './personas';
export { generateBatch } from './batch';
export { validateTrace } from './traceValidation';
export type { TraceOptions } from './types';

type StepIntent = MarketReplayStep extends infer S ? S extends MarketReplayStep ? Omit<S, 'id' | 'reactionDelayMs' | 'reason' | 'timeoutMs'> : never : never;

/** Produces intentions only. No BehaviorLogRequest, episode export, HTTP write, or UI process. */
export async function generateTrace(options: TraceOptions): Promise<MarketReplayTrace> {
  const timing = options?.timingProfile ?? 'compact';
  if (!['original', 'compact'].includes(timing)) throw new Error('Unknown timingProfile');
  // Generate all decisions first: faster replay must not change memory, choices or RNG.
  const trace = await generateOriginalTrace(options);
  const result = timing === 'original' ? trace : compactTraceTiming(trace);
  const check = validateTrace(result, options.snapshot);
  if (!check.valid) throw new Error(`Timed trace failed validation: ${check.errors.join('; ')}`);
  return result;
}

async function generateOriginalTrace(options: TraceOptions): Promise<MarketReplayTrace> {
  if (!options || !['string', 'number'].includes(typeof options.seed) || !String(options.seed).trim()
    || String(options.seed).length > 200 || (typeof options.seed === 'number' && !Number.isFinite(options.seed))) throw new Error('A finite numeric or non-empty string seed is required.');
  const snapshotCheck = validateMarketReplaySnapshot(options.snapshot);
  if (!snapshotCheck.valid) throw new Error(snapshotCheck.errors.join('; '));
  const persona = getPersona(options.personaId);
  const mode = options.mode ?? 'llm';
  if (!['stochastic', 'llm'].includes(mode)) throw new Error('mode must be stochastic or llm.');
  const maxActions = options.maxActions ?? 1000;
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 2000) throw new Error('maxActions must be 1..2000 high-level decisions.');
  if (options.timeBudgetMs !== undefined && (!Number.isInteger(options.timeBudgetMs) || options.timeBudgetMs < 1000 || options.timeBudgetMs > 3600000)) throw new Error('timeBudgetMs must be 1000..3600000.');
  const maxCalls = options.llm?.maxCalls ?? 300;
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 2000) throw new Error('llm.maxCalls must be 1..2000.');
  const model = mode === 'stochastic' ? 'stochastic-policy/3' : options.llm?.model ?? process.env.MARKET_LLM_MODEL;
  if (!model) throw new Error('LLM mode requires an explicit model identifier.');
  if (persona.attention) return generateAttentionTrace(options, persona, mode === 'stochastic' ? 'stochastic-policy/5' : model);
  const guard = new TraceGuard(options.snapshot, persona.id, persona.version, model);
  const policy = mode === 'stochastic' ? new StochasticPolicy(persona, options.seed) : null;
  const provider = mode === 'llm' ? options.decisionProvider ?? createLlmPolicy(options.llm ?? {}, options.timeBudgetMs) : null;
  // Gesture and presentation sampling must not consume the persona decision RNG.
  const motor = new Random(`${options.seed}:presentation:${persona.id}:${persona.version}`);
  const history: TraceEntry[] = [];
  const steps: MarketReplayStep[] = [];
  let plannedMs = 0;
  let resumeAfterView: MarketEnvironmentStationId | null = null;
  const append = (intent: StepIntent, delayMs: number, reason: string, timeoutMs = 120000) => {
    const step = { ...intent, id: `step-${String(steps.length + 1).padStart(4, '0')}`,
      reactionDelayMs: Math.round(delayMs), timeoutMs, reason } as MarketReplayStep;
    const applied = guard.execute(step);
    steps.push(step);
    plannedMs += step.reactionDelayMs + applied.movementMs
      + ('durationMs' in step ? step.durationMs : step.type === 'dragProduct' ? (step.gesture.durationMs + step.gesture.hesitationMs) * step.quantity : 0);
    return applied;
  };
  append({ type: 'start' }, Math.round(persona.parameters.reactionMedianMs), 'read-mission-one-page-at-a-time');
  for (;;) {
    const before = guard.observe();
    let decision: Decision;
    const limit = history.length >= maxActions ? 'action-limit'
      : mode === 'llm' && history.length >= maxCalls ? 'model-call-limit'
      : options.timeBudgetMs !== undefined && plannedMs >= options.timeBudgetMs ? 'planned-time-budget' : null;
    if (limit && mode === 'llm') throw new Error(`ATTENTION_GENERATION_LIMIT: ${limit}`);
    if (limit) decision = { action: { type: 'giveUp' }, delayMs: 1, reason: limit };
    else decision = provider ? await provider(before, history, persona)
      : policy!.next(before, options.timeBudgetMs === undefined ? undefined : options.timeBudgetMs - plannedMs);
    assertDecision(decision);
    if (options.timeBudgetMs !== undefined && plannedMs + decision.delayMs >= options.timeBudgetMs) {
      if (mode === 'llm') throw new Error('ATTENTION_GENERATION_LIMIT: planned-time-budget');
      decision = { action: { type: 'giveUp' }, delayMs: 1, reason: 'planned-time-budget' };
    }
    if (decision.action.type === 'walkTo' && decision.reason.startsWith('look-around-before')) {
      append({ type: 'lookAround', durationMs: Math.round(motor.between(600, 1800)) }, 0, 'look-for-a-familiar-shelf-before-choosing-a-route');
    }
    // Help exists on the world HUD; the cart exists there and inside shelves. The state
    // machine permits broader view changes, so normalize these decisions into visible UI.
    const stationKind = before.environment.stationDetails.find(s => s.id === before.activeStation)?.kind;
    const opensHudView = decision.action.type === 'viewHelp'
      || decision.action.type === 'viewCart' && Boolean(before.activeStation) && stationKind !== 'shelf';
    if (opensHudView) {
      if (before.view !== 'world') throw new Error('Close the current view before opening another HUD view.');
      if (before.activeStation) {
        resumeAfterView = before.activeStation;
        append({ type: 'closeStation' }, Math.round(persona.parameters.reactionMedianMs * .35), 'return-to-world-to-use-the-visible-hud-button');
      }
    }
    const intent = projectDecision(decision, before, persona, options.snapshot, options.seed, steps.length, motor);
    const applied = append(intent, decision.delayMs, decision.reason);
    history.push(decision);
    if (decision.action.type === 'submit') {
      append({ type: 'awaitReviewAccepted' }, 0, 'wait-for-the-app-to-confirm-review-acceptance', 180000);
      append({ type: 'leave' }, Math.round(persona.parameters.reactionMedianMs), 'leave-after-review-is-accepted');
      break;
    }
    if (decision.action.type === 'giveUp') {
      append({ type: 'skipRating' }, Math.round(persona.parameters.reactionMedianMs), 'skip-the-existing-post-quit-rating-screen');
      append({ type: 'leave' }, Math.round(persona.parameters.reactionMedianMs), 'leave-after-giving-up');
      break;
    }
    // One observed semantic transition updates memory. Rendering ticks do not count as decisions.
    const actual = applied.actions.at(-1);
    if (actual) policy?.onResult(actual, applied.before, applied.after);
    if (decision.action.type === 'closeView' && resumeAfterView) {
      const resume = { action: { type: 'interact' as const, station: resumeAfterView }, delayMs: Math.round(persona.parameters.reactionMedianMs * .35),
        reason: 'return-to-the-previous-station-after-checking-the-hud-view' };
      const restored = append(projectDecision(resume, guard.observe(), persona, options.snapshot, options.seed, steps.length, motor), resume.delayMs, resume.reason);
      const reopened = restored.actions.at(-1);
      if (reopened) policy?.onResult(reopened, restored.before, restored.after);
      resumeAfterView = null;
    }
    if (intent.type === 'openShelf') append({ type: 'browse', durationMs: Math.round(motor.between(.35, .75) * persona.parameters.reactionMedianMs + 300), scrollFraction: 0 }, 0, 'look-over-the-visible-products-before-selecting');
  }
  const body: Omit<MarketReplayTrace, 'traceId'> = {
    traceSchemaVersion: '1', personaId: persona.id, personaVersion: persona.version, seed: options.seed,
    generationPolicy: mode, policyVersion: '3', generation: { model,
      reproducibility: mode === 'stochastic' ? 'seed-and-snapshot' : 'captured-trace',
      ...(mode === 'llm' ? { requestId: randomUUID() } : {}) },
    target: { snapshotId: options.snapshot.snapshotId, completionMode: 'ai-review',
      ...(options.snapshot.mission?.id ? { missionId: options.snapshot.mission.id } : {}),
      ...(options.snapshot.mission?.scenarioId ? { scenarioId: options.snapshot.mission.scenarioId } : {}) }, steps,
  };
  const trace = { ...body, traceId: marketReplayTraceId(body) };
  const validation = validateTrace(trace, options.snapshot);
  if (!validation.valid) throw new Error(`Generated trace failed validation: ${validation.errors.join('; ')}`);
  return trace;
}

export function projectDecision(d: Decision, o: Observation, persona: Persona, snapshot: MarketReplaySnapshot,
  seed: string | number, stepIndex: number, motor: Random): StepIntent {
  const a = d.action;
  const rawMotorSeed = `${seed}:motor:${persona.id}:${persona.version}:${stepIndex}`;
  const motorSeed = rawMotorSeed.length <= 200 ? rawMotorSeed : `motor-${marketReplayFingerprint(rawMotorSeed)}`;
  switch (a.type) {
    case 'walkToAnchor': return { type: 'walkToAnchor', target: { anchorId: a.anchorId }, movement: {
      style: persona.parameters.walkSpeed < 110 ? 'careful' : persona.parameters.walkSpeed < 140 ? 'steady' : 'brisk',
      speedMultiplier: Math.round(Math.max(.4, Math.min(1, persona.parameters.walkSpeed / 190)) * 1000) / 1000,
      running: false, motorSeed, accelerationMs: Math.round(motor.between(160, 280)),
    } };
    case 'readList': case 'pause': case 'lookAround': return { type: a.type, durationMs: a.durationMs };
    case 'browse': return { type: 'browse', durationMs: a.durationMs, scrollFraction: a.scrollFraction };
    case 'walkTo': return { type: 'walkTo', target: { stationId: a.station }, movement: {
      style: persona.parameters.walkSpeed < 110 ? 'careful' : persona.parameters.walkSpeed < 140 ? 'steady' : 'brisk',
      speedMultiplier: Math.round(Math.max(.4, Math.min(1, persona.parameters.walkSpeed / 190)) * 1000) / 1000,
      running: false, motorSeed, accelerationMs: Math.round(motor.between(160, 280)),
    } };
    case 'interact': {
      const station = snapshot.environment.stationDetails.find(s => s.id === a.station);
      if (station?.kind === 'shelf') return { type: 'openShelf', stationId: a.station };
      if (station?.kind === 'employee') return { type: 'talkToStaff', stationId: a.station, choice: 'open' };
      if (a.station === 'checkout' || a.station === 'checkout-2') return { type: 'checkout', checkoutId: a.station };
      throw new Error(`Station interaction has no supported UI intention: ${a.station}`);
    }
    case 'checkout': return { type: 'checkout', checkoutId: a.checkoutId ?? 'checkout' };
    case 'add': return { type: 'dragProduct', productId: a.productId, quantity: a.quantity ?? 1, gesture: {
      durationMs: Math.round(Math.max(450, Math.min(2400, persona.parameters.reactionMedianMs * motor.between(.35, .55)))),
      hesitationMs: d.reason.includes('pause-before-next-step') ? Math.round(motor.between(150, 700)) : 0,
      outcome: 'drop', motorSeed,
    } };
    case 'remove': return { type: 'removeProduct', productId: a.productId, quantity: a.quantity ?? 1 };
    case 'requestReturn': return { type: 'talkToStaff', stationId: requireStaff(o), choice: 'returnProduct', productId: a.productId, quantity: a.quantity ?? 1 };
    case 'requestCashier': {
      // The real dialogue has one button per empty counter, so resolve the choice
      // from the public observation instead of relying on the state's implicit default.
      const selected = o.selectedCheckoutId;
      const checkoutId = a.checkoutId ?? (selected && !o.cashierAvailability[selected] ? selected
        : o.environment.checkouts.find(counter => !o.cashierAvailability[counter.id])?.id);
      if (!checkoutId) throw new Error('No empty checkout has a visible employee request button.');
      return { type: 'talkToStaff', stationId: requireStaff(o), choice: 'requestCashier', checkoutId };
    }
    case 'submit': return { type: 'submitForReview' };
    case 'viewCart': case 'viewHelp': case 'closeView': case 'closeStation': case 'giveUp': return { type: a.type };
    default: throw new Error(`Action ${a.type} is unavailable in the AI-review app flow.`);
  }
}
function requireStaff(o: Observation): MarketEnvironmentStationId {
  if (!o.activeStation?.startsWith('staff:')) throw new Error('An employee conversation must be open.');
  return o.activeStation;
}
export function summarizeTrace(trace: MarketReplayTrace): TraceSummary {
  return { personaId: trace.personaId, steps: trace.steps.length,
    walkingIntentions: trace.steps.filter(s => s.type === 'walkTo' || s.type === 'walkToAnchor').length,
    cartChecks: trace.steps.filter(s => s.type === 'viewCart').length,
    helpRequests: trace.steps.filter(s => s.type === 'viewHelp' || (s.type === 'talkToStaff' && s.choice !== 'open')).length,
    productsDragged: trace.steps.reduce((sum, s) => sum + (s.type === 'dragProduct' && s.gesture.outcome === 'drop' ? s.quantity : 0), 0),
    plannedReactionMs: trace.steps.reduce((sum, s) => sum + s.reactionDelayMs, 0),
    ending: trace.steps.some(s => s.type === 'submitForReview') ? 'review-requested' : 'gave-up' };
}
