import type { Decision, TraceOptions, Observation, Persona, TraceEntry, ActorObservation } from './types';
import { PersonaContext } from './personaContext';

const actionFields: Record<string, string[]> = {
  walkTo: ['station'], interact: ['station'], add: ['productId', 'quantity'], remove: ['productId', 'quantity'],
  requestReturn: ['productId', 'quantity'], checkout: ['checkoutId'], requestCashier: ['checkoutId'],
  submit: [], giveUp: [], closeStation: [], viewCart: [], viewHelp: [], closeView: [],
  walkToAnchor: ['anchorId'], readList: ['durationMs'], browse: ['durationMs', 'scrollFraction'],
  pause: ['durationMs'], lookAround: ['durationMs'],
};
const legacyActionFields = Object.fromEntries(Object.entries(actionFields).filter(([type]) => !['walkToAnchor', 'readList', 'browse', 'pause', 'lookAround'].includes(type)));
export function assertDecision(value: unknown): asserts value is Decision {
  const d = value as Decision;
  if (!d || typeof d !== 'object' || !d.action || !Object.prototype.hasOwnProperty.call(actionFields, d.action.type)) throw new Error('Decision contains an unsupported agent action.');
  const action = d.action as unknown as Record<string, unknown>;
  for (const key of Object.keys(action)) if (!['type', ...actionFields[d.action.type]].includes(key)) throw new Error(`Unexpected action field: ${key}`);
  if (!Number.isInteger(d.delayMs) || d.delayMs < 1 || d.delayMs > 120000) throw new Error('Decision delayMs must be 1..120000.');
  if (typeof d.reason !== 'string' || !d.reason.trim() || d.reason.length > 1000) throw new Error('Decision reason must be a short string.');
  if ((d.action.type === 'interact' || d.action.type === 'walkTo') && typeof d.action.station !== 'string') throw new Error('interact requires station.');
  if (['add', 'remove', 'requestReturn'].includes(d.action.type) && typeof action.productId !== 'string') throw new Error('Item action requires productId.');
  if (action.quantity !== undefined && (!Number.isInteger(action.quantity) || Number(action.quantity) < 1 || Number(action.quantity) > 99)) throw new Error('quantity must be an integer 1..99.');
  if (d.action.type === 'walkToAnchor' && (typeof action.anchorId !== 'string' || !/^anchor-[a-f0-9]{8}$/.test(action.anchorId))) throw new Error('walkToAnchor requires a visible anchor ID');
  if (['readList', 'browse', 'pause', 'lookAround'].includes(d.action.type)
    && (!Number.isInteger(action.durationMs) || Number(action.durationMs) < 1 || Number(action.durationMs) > 30000)) throw new Error('durationMs must be 1..30000');
  if (d.action.type === 'browse' && (typeof action.scrollFraction !== 'number' || !Number.isFinite(action.scrollFraction) || action.scrollFraction < 0 || action.scrollFraction > 1)) throw new Error('browse requires scrollFraction 0..1');
  if (d.attentionTag !== undefined && (typeof d.attentionTag !== 'string' || d.attentionTag.length > 100)) throw new Error('Invalid attentionTag');
  if (d.cueRefs !== undefined && (!Array.isArray(d.cueRefs) || d.cueRefs.length > 20 || d.cueRefs.some(x => typeof x !== 'string' || !x.length || x.length > 200))) throw new Error('Invalid cueRefs');
}

/** Same HTTP contract as the legacy provider, with actor-only input and externally owned memory. */
export function createAttentionLlmPolicy(options: NonNullable<TraceOptions['llm']>) {
  const baseUrl = options.baseUrl ?? process.env.MARKET_LLM_BASE_URL;
  const model = options.model ?? process.env.MARKET_LLM_MODEL;
  if (!baseUrl || !model) throw new Error('LLM mode requires llm.baseUrl/model or MARKET_LLM_MODEL.');
  const url = new URL(baseUrl.replace(/\/$/, '') + '/chat/completions');
  if (url.username || url.password || url.search || url.hash) throw new Error('LLM URL must not contain credentials, query, or fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('LLM endpoint requires HTTPS or local HTTP.');
  const token = process.env[options.apiKeyEnv ?? 'MARKET_LLM_API_KEY'];
  if (!token && url.protocol === 'https:') throw new Error('LLM API key environment variable is not set.');
  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120000)) throw new Error('LLM timeoutMs must be 1000..120000.');
  return async (observation: ActorObservation, history: TraceEntry[], persona: Persona, state: unknown): Promise<Decision> => {
    const request = { model, response_format: { type: 'json_object' }, max_completion_tokens: 1200, messages: [
      { role: 'system', content: `${persona.prompt}\nDecide ONE next high-level action for this adult's app replay. The game goal, the person's remembered goal, and current interest can differ. First-play layout and controls are unfamiliar even when products are familiar. Allow orientation search, unrelated interests, lingering, optional purchases, spontaneous recall and missed goals. Never invent a visible cue or automatically fix every off-list purchase. No full map or automatic objective list is provided. readList attends to the actual visible HUD; readObjectives arrives only after that action. Products include only the currently exposed shelf rows. Browse before choosing a product that has not been seen. walkToAnchor selects a currently visible local anchor; no coordinates or paths. interact is only for a visible near station. Close panels before walking. State estimates and reasons are synthetic, not measured cognition. Return a brief observable action description, no private reasoning or diagnosis. submit requests AI review then exits after acceptance; no immediate verdict or retry is available. JSON only: {"action":{...},"delayMs":positive integer,"reason":"short action description","attentionTag":"optional focus label","cueRefs":["optional observed cue IDs"]}. Allowed actions: ${JSON.stringify(actionFields)}.` },
      { role: 'user', content: JSON.stringify({ observation, personaCharacter: persona.character, attentionProfile: persona.attention,
        shoppingStyle: persona.shoppingStyle, behaviorParameters: persona.parameters,
        personalState: state,
        // Do not restore forgotten goals via a perfect transcript of previous purchases/readings.
        recentActions: history.slice(-4).map(({ action }) => ({ type: action.type })),
        cueReferenceFormat: 'list (visible HUD only), station:<id>, product:<id>, anchor:<id>; IDs must be in the current observation or retained personal memory.' }) },
    ] };
    const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 45000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(request) });
    if (!response.ok) throw new Error(`LLM provider returned HTTP ${response.status}; no stochastic fallback.`);
    const body = await response.json() as { choices?: { message?: { content?: string } }[] };
    let decision: unknown;
    try { decision = JSON.parse(body.choices?.[0]?.message?.content ?? ''); } catch { throw new Error('LLM provider returned invalid JSON.'); }
    assertDecision(decision);
    return { ...decision, exchange: { request, response: body } };
  };
}

/** Explicit opt-in network adapter; stochastic generation never instantiates this provider. */
export function createLlmPolicy(options: NonNullable<TraceOptions['llm']>, timeBudgetMs?: number) {
  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120000)) throw new Error('LLM timeoutMs must be 1000..120000.');
  const baseUrl = options.baseUrl ?? process.env.MARKET_LLM_BASE_URL;
  const model = options.model ?? process.env.MARKET_LLM_MODEL;
  if (!baseUrl || !model) throw new Error('LLM mode requires llm.baseUrl/model or MARKET_LLM_BASE_URL/MARKET_LLM_MODEL.');
  const url = new URL(baseUrl.replace(/\/$/, '') + '/chat/completions');
  if (url.username || url.password || url.search || url.hash) throw new Error('LLM URL must not contain credentials, query, or fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('LLM endpoint requires HTTPS or local HTTP.');
  const token = process.env[options.apiKeyEnv ?? 'MARKET_LLM_API_KEY'];
  if (!token && url.protocol === 'https:') throw new Error('LLM API key environment variable is not set.');
  const knownProducts = new Map<string, Observation['products'][number]>();
  let context: PersonaContext | undefined;
  let previous: Observation | undefined;
  let historyLength = 0;
  return async (observation: Observation, history: TraceEntry[], persona: Persona): Promise<Decision> => {
    if (!context || previous?.sessionId !== observation.sessionId) {
      context = new PersonaContext(persona); knownProducts.clear(); previous = undefined; historyLength = 0;
    }
    if (previous && history.length > historyLength) {
      const action = history.at(-1)!.action;
      if (action.type !== 'walkTo' && action.type !== 'walkToAnchor' && action.type !== 'readList'
        && action.type !== 'browse' && action.type !== 'pause' && action.type !== 'lookAround') context.record(action, previous, observation);
    }
    previous = observation; historyLength = history.length;
    const remainingMs = timeBudgetMs === undefined ? undefined : timeBudgetMs - history.reduce((sum, step) => sum + step.delayMs, 0);
    for (const product of observation.products) knownProducts.set(product.id, product);
    const contextRules = 'Keep the supplied individual and selected traits stable across this session. Situation values are synthetic estimates based on observed outcomes, not measured emotions or clinical facts. Use remembered feedback and actual support to adapt; do not force errors or repetitions. The game has no spoken dialogue, leading questions, social coercion, or yes/no interview responses: never invent these or simulate an acquiescence rate. Explain each action with a brief observable cue and intent, without private reasoning or disability labels.';
    const request = {
      model, response_format: { type: 'json_object' }, max_completion_tokens: 1200,
      messages: [
        { role: 'system', content: `${persona.prompt}\n${contextRules}\nYou choose intentions for a real-time shopping app replay. Decide ONE next high-level action using only observed information. No hidden catalog, evaluation or target IDs are available. walkTo station names a destination; the app computes its own path and applies normal joystick movement. No coordinates, movement paths, teleport, input events, or log events may be returned. Walking does not automatically open the destination: follow it with interact. Close views/stations before walking. Close the basket before choosing another product to drag from the shelf. submit means request the app's AI review and then exit after acceptance; it does not reveal an immediate success/failure verdict, retry screen or rating. Use visible feedback to reconsider. Return JSON only: {"action":{...},"delayMs":positive integer,"reason":"short observable intent"}. delayMs is a reaction wait before the intention, excluding travel/gesture/network time. Available actions and their fields: ${JSON.stringify(legacyActionFields)}. If you cannot continue, giveUp is allowed. Do not supply at; the app owns wall time.` },
        { role: 'user', content: JSON.stringify({ observation, personaCharacter: persona.character ?? null,
          situation: context.snapshot(observation, remainingMs), experience: context.memory(),
          previouslySeenProducts: [...knownProducts.values()], recentActions: history.slice(-16).map(({ action, reason }) => ({ action, reason })) }) },
      ],
    };
    const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 45000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(request) });
    if (!response.ok) throw new Error(`LLM provider returned HTTP ${response.status}; episode was not silently replaced by stochastic output.`);
    const body = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM provider did not return a decision.');
    let decision: unknown;
    try { decision = JSON.parse(content); } catch { throw new Error('LLM provider returned invalid JSON.'); }
    assertDecision(decision);
    return { ...decision, exchange: { request, response: body } };
  };
}
