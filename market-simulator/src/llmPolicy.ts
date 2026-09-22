import type { Decision, EpisodeOptions, Observation, Persona, TraceEntry } from './types';
import { isMarketNavigationSegmentClear } from '../../frontend/src/game/marketNavigation';
import { PersonaContext } from './personaContext';

const actionFields: Record<string, string[]> = {
  move: ['dx', 'dy'], interact: ['station'], add: ['productId', 'quantity'], remove: ['productId', 'quantity'],
  requestReturn: ['productId', 'quantity'], checkout: ['checkoutId'], requestCashier: ['checkoutId'],
  submit: [], retry: [], giveUp: [], skipRating: [], closeStation: [], viewCart: [], viewHelp: [], closeView: [], rate: ['difficulty', 'interest'],
};
export function assertDecision(value: unknown): asserts value is Decision {
  const d = value as Decision;
  if (!d || typeof d !== 'object' || !d.action || !(d.action.type in actionFields)) throw new Error('Decision contains an unsupported agent action.');
  const action = d.action as unknown as Record<string, unknown>;
  for (const key of Object.keys(action)) if (!['type', 'at', ...actionFields[d.action.type]].includes(key)) throw new Error(`Unexpected action field: ${key}`);
  if (!Number.isFinite(d.delayMs) || d.delayMs < 1 || d.delayMs > 120000) throw new Error('Decision delayMs must be 1..120000.');
  if (typeof d.reason !== 'string' || d.reason.length > 1000) throw new Error('Decision reason must be a short string.');
  if (d.action.type === 'move' && (!Number.isFinite(d.action.dx) || !Number.isFinite(d.action.dy) || Math.hypot(d.action.dx, d.action.dy) > 32)) throw new Error('Agent move must be finite and at most 32 pixels.');
  if (d.action.type === 'move' && d.delayMs < Math.ceil(Math.hypot(d.action.dx, d.action.dy) / 180 * 1000)) throw new Error('Movement duration is too short (maximum 180 pixels/second).');
  if (d.action.type === 'interact' && typeof d.action.station !== 'string') throw new Error('interact requires station.');
  if (['add', 'remove', 'requestReturn'].includes(d.action.type) && typeof action.productId !== 'string') throw new Error('Item action requires productId.');
  if (action.quantity !== undefined && (!Number.isInteger(action.quantity) || Number(action.quantity) < 1 || Number(action.quantity) > 99)) throw new Error('quantity must be an integer 1..99.');
}

/** Explicit opt-in network adapter; stochastic generation never instantiates this provider. */
export function createLlmPolicy(options: NonNullable<EpisodeOptions['llm']>, timeBudgetMs?: number) {
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
    if (previous && history.length > historyLength) context.record(history.at(-1)!.action, previous, observation);
    previous = observation; historyLength = history.length;
    const remainingMs = timeBudgetMs === undefined ? undefined : timeBudgetMs - history.reduce((sum, step) => sum + step.delayMs, 0);
    for (const product of observation.products) knownProducts.set(product.id, product);
    const moves = [[24, 0], [-24, 0], [0, 24], [0, -24], [16, 16], [-16, 16], [16, -16], [-16, -16]]
      .filter(([dx, dy]) => isMarketNavigationSegmentClear(observation.environment, observation.playerPosition,
        { x: observation.playerPosition.x + dx, y: observation.playerPosition.y + dy }, observation.cashierAvailability))
      .map(([dx, dy]) => ({ type: 'move', dx, dy }));
    const contextRules = 'Keep the supplied individual and selected traits stable across this session. Situation values are synthetic estimates based on observed outcomes, not measured emotions or clinical facts. Use remembered feedback and actual support to adapt; do not force errors or repetitions. The game has no spoken dialogue, leading questions, social coercion, or yes/no interview responses: never invent these or simulate an acquiescence rate. Explain each action with a brief observable cue and intent, without private reasoning or disability labels.';
    const request = {
      model, response_format: { type: 'json_object' }, max_completion_tokens: 1200,
      messages: [
        { role: 'system', content: `${persona.prompt}\n${contextRules}\nYou play a headless shopping game. Decide ONE next primitive action using only observed information. No hidden catalog, evaluation or target IDs are available. Never teleport. move dx/dy length must be <=32; walking typically 80..155 pixels/second. Respect walls and close views/stations before moving. Use feedback to reconsider. Return JSON only: {"action":{...},"delayMs":positive integer,"reason":"short observable intent"}. delayMs is simulated time, including movement or reaction time; not a request to sleep. Available actions and their fields: ${JSON.stringify(actionFields)}. If you cannot continue, giveUp is allowed. Do not supply at; the runner owns time.` },
        { role: 'user', content: JSON.stringify({ observation, personaCharacter: persona.character ?? null,
          situation: context.snapshot(observation, remainingMs), experience: context.memory(),
          previouslySeenProducts: [...knownProducts.values()], recentActions: history.slice(-16).map(({ action, reason }) => ({ action, reason })), collisionFreeLocalMoves: moves }) },
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
