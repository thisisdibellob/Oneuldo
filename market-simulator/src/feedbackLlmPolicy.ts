import { buildFeedbackActorFrame, emptyFeedbackBeliefMemory, feedbackDecisionFromChoice, validateFeedbackBeliefMemory } from './feedbackActor';
import { assertDecision } from './llmPolicy';
import type { ActorObservation, Decision, Persona, TraceEntry, TraceOptions } from './types';

/** One independent request per decision. No conversation ID, prior messages or audit archive. */
export function createFeedbackLlmPolicy(options: NonNullable<TraceOptions['llm']>, seed: string | number) {
  const baseUrl = options.baseUrl ?? process.env.MARKET_LLM_BASE_URL;
  const model = options.model ?? process.env.MARKET_LLM_MODEL;
  if (!baseUrl || !model) throw new Error('Feedback LLM requires an explicit model and endpoint; no stochastic fallback.');
  if (options.protocol !== undefined && !['openai', 'ollama'].includes(options.protocol)) throw new Error('Unsupported LLM protocol');
  const url = new URL(baseUrl.replace(/\/$/, '') + (options.protocol === 'ollama' ? '/api/chat' : '/chat/completions'));
  if (url.username || url.password || url.search || url.hash) throw new Error('LLM URL must not contain credentials, query, or fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('LLM endpoint requires HTTPS or local HTTP.');
  const token = process.env[options.apiKeyEnv ?? 'MARKET_LLM_API_KEY'];
  if (!token && url.protocol === 'https:') throw new Error('LLM API key environment variable is not set.');
  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120000)) throw new Error('LLM timeoutMs must be 1000..120000.');
  let memory = emptyFeedbackBeliefMemory(), calls = 0;
  return async (observation: ActorObservation, history: TraceEntry[], persona: Persona, _archive?: unknown, _activity?: unknown): Promise<Decision> => {
    const frame = buildFeedbackActorFrame({ observation, persona, memory, seed, decisionIndex: history.length });
    if (!frame.availableChoices.length) throw new Error('No supported feedback UI controls in this phase');
    const attempts: unknown[] = [];
    let formatCorrection = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (++calls > (options.maxCalls ?? 300)) throw new Error('ATTENTION_GENERATION_LIMIT: model-call-limit (including format repairs)');
      const messages = [
        { role: 'system', content: 'Choose one available choice for this fictional individual. Return JSON with exactly choiceId, durationMs, reason, memory. There is no waiting before an ordinary action: its durationMs must be 0. For pause, lookAround, readList and browse, durationMs is the action duration in integer milliseconds 100..120000. viewCart and viewHelp allow 0..120000 for optional inspection. memory is a complete replacement of the short belief memory, including rememberedItems, currentTask and notes. Follow the frame instructions. No private reasoning or long explanation. A format repair has not executed any action.' },
        { role: 'user', content: JSON.stringify({ ...frame, ...(formatCorrection ? { formatCorrection } : {}) }) },
      ];
      const wire = options.protocol === 'ollama'
        ? { model, messages, think: false, stream: false, options: { num_ctx: 18432, num_predict: 1600 } }
        : { model, messages, response_format: { type: 'json_object' }, max_completion_tokens: 1600, ...(model === 'gpt-6-luna' ? { reasoning_effort: 'low' } : {}) };
      const started = Date.now();
      const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 45000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(wire) });
      if (!response.ok) throw new Error(`Feedback LLM returned HTTP ${response.status}; no stochastic fallback.`);
      const body = await response.json() as { choices?: { message?: { content?: string } }[]; message?: { content?: string } };
      attempts.push({ request: wire, response: body, providerWallMs: Date.now() - started });
      try {
        const selected = JSON.parse((options.protocol === 'ollama' ? body.message?.content : body.choices?.[0]?.message?.content) ?? '');
        if (!selected || Array.isArray(selected) || Object.keys(selected).length !== 4
          || !['choiceId', 'durationMs', 'reason', 'memory'].every(k => Object.prototype.hasOwnProperty.call(selected, k)))
          throw new Error('Response requires exactly choiceId, durationMs, reason and memory; legacy delayMs is not accepted');
        const choice = frame.availableChoices.find(c => c.id === selected.choiceId);
        if (!choice || !validateFeedbackBeliefMemory(selected.memory).valid) throw new Error('Invalid choice or belief format');
        const decision = feedbackDecisionFromChoice(choice, selected.durationMs, selected.reason, selected.memory);
        assertDecision(decision, true);
        memory = structuredClone(selected.memory);
        return { ...decision, exchange: { request: wire, response: { attempts } } };
      } catch {
        formatCorrection = 'Return exactly choiceId from availableChoices, durationMs, reason short string, and memory in the supplied belief schema. delayMs is not accepted. durationMs must be 0 for ordinary actions; pause/lookAround/readList/browse require integer 100..120000, and viewCart/viewHelp allow integer 0..120000 for optional inspection. Keep your intended choice and beliefs; only repair the format. No action has executed.';
      }
    }
    throw new Error('Feedback LLM returned invalid choice/memory after 3 attempts; no stochastic fallback.');
  };
}
