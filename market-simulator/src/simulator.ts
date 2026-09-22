import { createMarketAgentAdapter, type MarketSessionConfig } from '../../frontend/src/game/marketSession';
import { randomUUID } from 'node:crypto';
import { convertMarketEpisodeToBehaviorLogs } from '../../frontend/src/behavior/marketEpisodeBehaviorLogs';
import { getMarketProduct } from '../../frontend/src/game/scenarios';
import { getPersona } from './personas';
import { StochasticPolicy } from './stochasticPolicy';
import { assertDecision, createLlmPolicy } from './llmPolicy';
import { fingerprint, stableUuid } from './random';
import type { Decision, EpisodeOptions, EpisodeSummary, GeneratedEpisode, TraceEntry, RunContext } from './types';
export { listPersonas } from './personas';
export { generateBatch } from './batch';
export type { EpisodeOptions, GeneratedEpisode } from './types';

export async function generateEpisode(options: EpisodeOptions): Promise<GeneratedEpisode> {
  if (!options || !['string', 'number'].includes(typeof options.seed) || String(options.seed).length === 0 || (typeof options.seed === 'number' && !Number.isFinite(options.seed))) throw new Error('A finite numeric or non-empty string seed is required.');
  const persona = getPersona(options.personaId);
  const mode = options.mode ?? 'stochastic';
  if (!['stochastic', 'llm'].includes(mode)) throw new Error('mode must be stochastic or llm.');
  if (options.difficulty !== undefined && !['family', 'exact'].includes(options.difficulty)) throw new Error('difficulty must be family or exact.');
  const maxActions = options.maxActions ?? 2000;
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 10000) throw new Error('maxActions must be 1..10000.');
  if (options.timeBudgetMs !== undefined && (!Number.isFinite(options.timeBudgetMs) || options.timeBudgetMs < 1000)) throw new Error('timeBudgetMs must be at least 1000.');
  const maxCalls = options.llm?.maxCalls ?? 500;
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 10000) throw new Error('llm.maxCalls must be 1..10000.');
  const run: RunContext = { policyVersion: '2', policySeed: options.seed, mode, maxActions,
    ...(options.timeBudgetMs === undefined ? {} : { timeBudgetMs: options.timeBudgetMs }),
    ...(mode === 'llm' ? { maxCalls } : {}) };
  const model = mode === 'stochastic' ? 'stochastic-policy/2' : options.llm?.model ?? process.env.MARKET_LLM_MODEL;
  if (!model) throw new Error('LLM mode requires an explicit model identifier for provenance.');
  const config: Partial<MarketSessionConfig> = {
    ...options.config,
    seed: options.environmentSeed ?? options.seed,
    environment: { ...options.config?.environment, seed: options.environmentSeed ?? options.seed },
    difficulty: options.difficulty ?? options.config?.difficulty ?? 'family',
    startedAt: options.startedAt ?? options.config?.startedAt ?? '2026-01-01T00:00:00.000Z',
    provenance: { source: 'synthetic', agentModel: model, personaId: persona.id, personaVersion: persona.version },
  };
  if (mode === 'llm' && options.replayTrace && !options.sessionId) throw new Error('LLM replay requires the original episode.sessionId.');
  // Fresh model calls are nondeterministic, so each live LLM run gets its own ID.
  config.sessionId = options.sessionId ?? (mode === 'llm' ? randomUUID() : stableUuid(fingerprint({ config, run })));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.sessionId)) throw new Error('sessionId must be a UUID compatible with the backend.');
  const adapter = createMarketAgentAdapter(config);
  const policy = new StochasticPolicy(persona, options.seed);
  const provider = mode === 'llm' && !options.replayTrace ? options.decisionProvider ?? createLlmPolicy(options.llm ?? {}, options.timeBudgetMs) : null;
  const trace: TraceEntry[] = [];
  const contextHash = fingerprint({ run, sessionId: config.sessionId, provenance: config.provenance });
  let time = Date.parse(config.startedAt!);
  const start = time;
  let termination: EpisodeSummary['termination'] = 'game';
  while (adapter.observe().phase !== 'finished') {
    const before = adapter.observe();
    const observationHash = fingerprint(before);
    let decision: Decision;
    let source: TraceEntry['source'] = mode;
    if (options.replayTrace) {
      const entry = options.replayTrace[trace.length];
      if (!entry || entry.observationHash !== observationHash) throw new Error(`Replay observation mismatch at action ${trace.length}.`);
      if (entry.contextHash !== contextHash) throw new Error('Replay context/provenance mismatch.');
      validateTraceSource(entry, mode);
      decision = entry; source = entry.source;
      if (source === 'limit') termination = entry.reason as EpisodeSummary['termination'];
    } else if (trace.length >= maxActions || (options.timeBudgetMs !== undefined && time - start >= options.timeBudgetMs) || (mode === 'llm' && trace.length >= maxCalls)) {
      termination = trace.length >= maxActions ? 'action-limit' : mode === 'llm' && trace.length >= maxCalls ? 'model-call-limit' : 'time-budget';
      source = 'limit'; decision = { action: { type: 'giveUp' }, delayMs: 1, reason: termination };
    } else {
      decision = provider ? await provider(before, trace, persona) : policy.next(before, options.timeBudgetMs === undefined ? undefined : options.timeBudgetMs - (time - start));
    }
    assertDecision(decision);
    if (!options.replayTrace && options.timeBudgetMs !== undefined && time - start + decision.delayMs >= options.timeBudgetMs) {
      source = 'limit'; termination = 'time-budget';
      decision = { action: { type: 'giveUp' }, delayMs: Math.max(1, options.timeBudgetMs - (time - start)), reason: termination };
    }
    time += Math.round(decision.delayMs);
    if (options.replayTrace && decision.action.at !== new Date(time).toISOString()) throw new Error('Replay action timestamp mismatch.');
    const action = { ...decision.action, at: new Date(time).toISOString() };
    const after = adapter.act(action);
    trace.push({ ...decision, action, observationHash, contextHash, source });
    policy.onResult(action, before, after);
  }
  if (options.replayTrace && trace.length !== options.replayTrace.length) throw new Error('Replay contains actions after session completion.');
  const episode = adapter.exportEpisode();
  const behaviorLogs = convertMarketEpisodeToBehaviorLogs(episode);
  return { run, episode, behaviorLogs, trace, summary: summarize(episode, trace, options.seed, mode, termination) };
}

function summarize(episode: GeneratedEpisode['episode'], trace: TraceEntry[], seed: string | number, mode: string, termination: EpisodeSummary['termination']): EpisodeSummary {
  const moving = trace.filter(t => t.action.type === 'move');
  const distances = moving.map(t => t.action.type === 'move' ? Math.hypot(t.action.dx, t.action.dy) : 0);
  const reactions = trace.filter(t => t.action.type !== 'move' && t.source !== 'limit').map(t => t.delayMs).sort((a, b) => a - b);
  const picked: Record<string, number> = {};
  let selections = 0, wrongSelections = 0;
  for (const event of episode.events) {
    if (event.type !== 'cart_changed' || event.payload.operation !== 'add') continue;
    selections++;
    const product = getMarketProduct(String(event.payload.productId))!;
    picked[product.id] = (picked[product.id] ?? 0) + Number(event.payload.quantity);
    const objective = episode.objectives.find(obj => obj.match === 'exact' ? obj.productId === product.id : obj.familyId === (product.familyId ?? product.id));
    const cart = event.payload.cart as Record<string, number>;
    const quantity = objective && Object.entries(cart).reduce((sum, [id, q]) => {
      const item = getMarketProduct(id)!;
      return sum + ((objective.match === 'exact' ? id === objective.productId : (item.familyId ?? id) === objective.familyId) ? q : 0);
    }, 0);
    if (!objective || (quantity ?? 0) > objective.quantity) wrongSelections++;
  }
  return {
    personaId: episode.provenance.personaId!, seed, mode, outcome: episode.outcome,
    actionCount: trace.length, moveCount: moving.length, pathDistance: distances.reduce((a, b) => a + b, 0), maxMoveDistance: Math.max(0, ...distances),
    elapsedMs: Date.parse(episode.events.at(-1)!.timestamp) - Date.parse(episode.config.startedAt),
    decisionMeanMs: reactions.reduce((a, b) => a + b, 0) / Math.max(1, reactions.length),
    decisionP50Ms: reactions[Math.floor(reactions.length * .5)] ?? 0, decisionP90Ms: reactions[Math.floor(reactions.length * .9)] ?? 0,
    cartChecks: trace.filter(t => t.action.type === 'viewCart').length,
    helpRequests: trace.filter(t => ['requestCashier', 'requestReturn', 'viewHelp'].includes(t.action.type)).length,
    retries: trace.filter(t => t.action.type === 'retry').length,
    rejectedActions: episode.events.filter(e => e.type === 'action_rejected').length,
    wrongSelections, selections, selectedItemCounts: picked,
    actionFingerprint: fingerprint(trace.map(t => { const { at, ...action } = t.action; return action; })), termination,
  };
}

/** Offline replay verifies state-machine outcomes, every bounded move, observations and shared log mapping. */
export function validateEpisodeReplay(result: GeneratedEpisode): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    if (!Array.isArray(result.trace) || result.trace.length > 10001) throw new Error('Missing or excessive action trace.');
    if (!result.run || !['1', '2'].includes(result.run.policyVersion) || !['stochastic', 'llm'].includes(result.run.mode)
      || !['string', 'number'].includes(typeof result.run.policySeed) || !Number.isInteger(result.run.maxActions)
      || result.run.maxActions < 1 || result.run.maxActions > 10000) throw new Error('Missing or invalid run context.');
    const contextHash = fingerprint({ run: result.run, sessionId: result.episode.sessionId, provenance: result.episode.provenance });
    const adapter = createMarketAgentAdapter(result.episode.config);
    let time = Date.parse(result.episode.config.startedAt);
    for (let i = 0; i < result.trace.length; i++) {
      const step = result.trace[i];
      assertDecision(step);
      validateTraceSource(step, result.run.mode);
      if (step.contextHash !== contextHash) throw new Error(`Trace context/provenance mismatch at ${i}.`);
      if (fingerprint(adapter.observe()) !== step.observationHash) throw new Error(`Observation mismatch at ${i}.`);
      time += Math.round(step.delayMs);
      if (step.action.at !== new Date(time).toISOString()) throw new Error(`Action clock mismatch at ${i}.`);
      adapter.act(step.action);
    }
    const replayed = adapter.exportEpisode();
    if (fingerprint(replayed) !== fingerprint(result.episode)) throw new Error('Episode differs from state-machine replay.');
    if (fingerprint(convertMarketEpisodeToBehaviorLogs(replayed)) !== fingerprint(result.behaviorLogs)) throw new Error('Behavior logs differ from shared tracker mapping.');
    const last = result.trace.at(-1);
    const termination = last?.source === 'limit' ? last.reason as EpisodeSummary['termination'] : 'game';
    const summary = summarize(replayed, result.trace, result.run.policySeed, result.run.mode, termination);
    if (fingerprint(summary) !== fingerprint(result.summary)) throw new Error('Summary differs from verified episode and trace.');
  } catch (error) { errors.push((error as Error).message); }
  return { valid: errors.length === 0, errors };
}

function validateTraceSource(step: TraceEntry, mode: RunContext['mode']) {
  if (step.source !== mode && step.source !== 'limit') throw new Error('Trace source differs from run mode.');
  if (step.source === 'limit' && (step.action.type !== 'giveUp' || !['action-limit', 'time-budget', 'model-call-limit'].includes(step.reason))) throw new Error('Invalid limit decision.');
}
