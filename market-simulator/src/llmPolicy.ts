import { actorChoices, extendedActorChoices, presentActorChoices } from './actorChoices';
import { ACTOR_PERSONA_INSTRUCTIONS, ACTOR_OBSERVATION_INSTRUCTIONS } from './actorInstructions';
import type { ActorActivityState } from './actorActivity';
import type { ActorLearningMemory } from './actorLearning';
import type { Decision, TraceOptions, Observation, Persona, TraceEntry, ActorObservation } from './types';
import { PersonaContext } from './personaContext';

const actionFields: Record<string, string[]> = {
  walkTo: ['station'], interact: ['station'], add: ['productId', 'quantity'], remove: ['productId', 'quantity'],
  requestReturn: ['productId', 'quantity'], checkout: ['checkoutId'], requestCashier: ['checkoutId'],
  submit: [], giveUp: [], closeStation: [], viewCart: [], viewHelp: [], closeView: [],
  walkToAnchor: ['anchorId'], readList: ['durationMs'], browse: ['durationMs', 'scrollFraction'],
  pause: ['durationMs'], lookAround: ['durationMs'],
  moveDirection: ['direction', 'durationMs'],
};
const legacyActionFields = Object.fromEntries(Object.entries(actionFields).filter(([type]) => !['walkToAnchor', 'readList', 'browse', 'pause', 'lookAround', 'moveDirection'].includes(type)));
export function assertDecision(value: unknown, feedbackTiming = false): asserts value is Decision {
  const d = value as Decision;
  if (!d || typeof d !== 'object' || !d.action || !Object.prototype.hasOwnProperty.call(actionFields, d.action.type)) throw new Error('Decision contains an unsupported agent action.');
  const action = d.action as unknown as Record<string, unknown>;
  const panelTiming = feedbackTiming && ['viewCart', 'viewHelp'].includes(d.action.type);
  for (const key of Object.keys(action)) if (!['type', ...actionFields[d.action.type], ...(panelTiming ? ['durationMs'] : [])].includes(key)) throw new Error(`Unexpected action field: ${key}`);
  if (feedbackTiming ? d.delayMs !== 0 : !Number.isInteger(d.delayMs) || d.delayMs < 1 || d.delayMs > 120000)
    throw new Error(feedbackTiming ? 'Feedback decision delayMs must be 0; use an explicit timed activity.' : 'Decision delayMs must be 1..120000.');
  if (typeof d.reason !== 'string' || !d.reason.trim() || d.reason.length > 1000) throw new Error('Decision reason must be a short string.');
  if ((d.action.type === 'interact' || d.action.type === 'walkTo') && typeof d.action.station !== 'string') throw new Error('interact requires station.');
  if (['add', 'remove', 'requestReturn'].includes(d.action.type) && typeof action.productId !== 'string') throw new Error('Item action requires productId.');
  if (action.quantity !== undefined && (!Number.isInteger(action.quantity) || Number(action.quantity) < 1 || Number(action.quantity) > 99)) throw new Error('quantity must be an integer 1..99.');
  if (d.action.type === 'walkToAnchor' && (typeof action.anchorId !== 'string' || !/^anchor-[a-f0-9]{8}$/.test(action.anchorId))) throw new Error('walkToAnchor requires a visible anchor ID');
  if (d.action.type === 'moveDirection' && (!feedbackTiming
    || !['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'].includes(String(action.direction))
    || !Number.isInteger(action.durationMs) || Number(action.durationMs) < 100 || Number(action.durationMs) > 2000))
    throw new Error('moveDirection requires feedback timing, an eight-way direction and durationMs 100..2000');
  const durationLimit = feedbackTiming ? 120000 : 30000;
  if (['readList', 'browse', 'pause', 'lookAround'].includes(d.action.type)
    && (!Number.isInteger(action.durationMs) || Number(action.durationMs) < (feedbackTiming ? 100 : 1) || Number(action.durationMs) > durationLimit)) throw new Error(`durationMs must be ${feedbackTiming ? 100 : 1}..${durationLimit}`);
  if (panelTiming && action.durationMs !== undefined
    && (!Number.isInteger(action.durationMs) || Number(action.durationMs) < 0 || Number(action.durationMs) > durationLimit)) throw new Error('Panel durationMs must be 0..120000');
  if (d.action.type === 'browse' && (typeof action.scrollFraction !== 'number' || !Number.isFinite(action.scrollFraction) || action.scrollFraction < 0 || action.scrollFraction > 1)) throw new Error('browse requires scrollFraction 0..1');
  if (d.currentTask !== undefined && (typeof d.currentTask !== 'string' || d.currentTask.length > 160)) throw new Error('currentTask must be a short task intention, not reasoning.');
  if (d.dragOutcome !== undefined && (d.action.type !== 'add' || !['drop','miss','cancel'].includes(d.dragOutcome))) throw new Error('dragOutcome requires a supported add gesture');
  if (d.attentionTag !== undefined && (typeof d.attentionTag !== 'string' || d.attentionTag.length > 100)) throw new Error('Invalid attentionTag');
  if (d.cueRefs !== undefined && (!Array.isArray(d.cueRefs) || d.cueRefs.length > 20 || d.cueRefs.some(x => typeof x !== 'string' || !x.length || x.length > 200))) throw new Error('Invalid cueRefs');
}

/** Same HTTP contract as the legacy provider, with actor-only input and externally owned memory. */
export const LEGACY_ACTOR_POLICY_VERSION = 'episodic-choice-v4' as const;
export function isExtendedActorPolicy(policy?: string): boolean {
  return ['episodic-choice-v9', 'episodic-choice-v10', 'feedback-choice-v1', 'feedback-choice-v2', 'feedback-choice-v3', 'feedback-choice-v4', 'feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7', 'feedback-choice-v8', 'feedback-choice-v9', 'feedback-choice-v10', 'feedback-choice-v11', 'feedback-choice-v12', 'feedback-choice-v13', 'whole-trace-v3'].includes(policy ?? '');
}
export function attentionActorPolicyVersion(options: Pick<TraceOptions, 'actorPolicyVersion' | 'learnerIdentity' | 'attentionExperience'>) {
  return options.actorPolicyVersion ?? options.learnerIdentity?.policyVersion
    ?? (options.attentionExperience?.learning?.version === '2' ? options.attentionExperience.learning.policyVersion : LEGACY_ACTOR_POLICY_VERSION);
}
export const ACTOR_POLICY_VERSION = 'episodic-choice-v9' as const;
export const LUNA_ACTOR_POLICY_VERSION = 'episodic-choice-v10' as const;

export function createAttentionLlmPolicy(options: NonNullable<TraceOptions['llm']>, presentationSeed: string | number = 'actor-choice-presentation', extendedPolicy = false) {
  const baseUrl = options.baseUrl ?? process.env.MARKET_LLM_BASE_URL;
  const model = options.model ?? process.env.MARKET_LLM_MODEL;
  if (!baseUrl || !model) throw new Error('LLM mode requires llm.baseUrl/model or MARKET_LLM_MODEL.');
  if (options.protocol !== undefined && !['openai', 'ollama'].includes(options.protocol)) throw new Error('Unsupported LLM protocol');
  const url = new URL(baseUrl.replace(/\/$/, '') + (options.protocol === 'ollama' ? '/api/chat' : '/chat/completions'));
  if (url.username || url.password || url.search || url.hash) throw new Error('LLM URL must not contain credentials, query, or fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('LLM endpoint requires HTTPS or local HTTP.');
  const token = process.env[options.apiKeyEnv ?? 'MARKET_LLM_API_KEY'];
  if (!token && url.protocol === 'https:') throw new Error('LLM API key environment variable is not set.');
  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120000)) throw new Error('LLM timeoutMs must be 1000..120000.');
  let calls = 0;
  return async (observation: ActorObservation, history: TraceEntry[], persona: Persona, state: unknown, activity?: ActorActivityState): Promise<Decision> => {
    const observed=(state as Partial<ReturnType<ActorLearningMemory['getState']>> | null)?.observedThisVisit;
    const memory = observed ? {anchors:observed.discoveries.anchors,currentAnchor:observed.currentAnchor} : undefined;
    const choices = extendedPolicy ? presentActorChoices(extendedActorChoices(observation, memory), presentationSeed, history.length) : actorChoices(observation, memory);
    if (!choices.length) throw new Error('No supported UI controls in this phase');
    const attempts: unknown[] = [];
    let feedback = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (++calls > (options.maxCalls ?? 300)) throw new Error('ATTENTION_GENERATION_LIMIT: model-call-limit (including format repairs)');
      const messages = [
        { role:'system', content: extendedPolicy ? `${ACTOR_PERSONA_INSTRUCTIONS}\n${ACTOR_OBSERVATION_INSTRUCTIONS}\nChoose ONE next high-level action for a fictional adult shopping in an app. This is one individual, not a representative of intellectual disability. Use the stable personal traits supplied. practicedStrategies and learningProfile describe initial personal history, not skills learned in this experiment. practiceFocus names areas to observe, not required actions or improvement targets. Keep personality and preferences stable; decide whether a relevant previous experience applies to this situation. Retrieved experiences are historical, may include unsuccessful choices, and do not establish understanding. A displayed correction or help text is available support, not proof that it was learned. Do not force mistakes, helplessness, improvement or perfect performance. Use only displayed cues and provided experience; no hidden map or correct-answer feedback exists. Learn from concrete observations and any actually displayed help, but do not assume that seeing instructions means understanding or mastery. Past choices may have been wrong. Previous task items are not the current shopping list. Experience can guide a choice but does not guarantee transfer. lookAround and pause only wait; they do not reveal a new aisle. Movement is necessary to see another area. Reading the list exposes its contents. The lastReadList and instructions in observedThisVisit remain available after movement; absence from the current screen does not erase that recorded information. You may consult them or read again if you choose. Use current visible cues together with your recorded sightings and traveled edges; unseen areas remain unknown. submit requests analysis; it does not reveal a verdict. Choose exactly one ID from availableChoices. The program only translates that ID into the corresponding UI action. Return JSON: {"choiceId":"an exact availableChoices ID","delayMs":500,"reason":"brief observable action description","currentTask":"short current activity, not an explanation"}. Maintain or revise currentTask yourself; it is a provisional intention and may be mistaken. Do not return an action object, diagnosis, ability score or private reasoning.` : `Choose ONE next high-level action for a fictional adult shopping in an app. This is one individual, not a representative of intellectual disability. Use the stable personal traits supplied. Do not force mistakes, helplessness, improvement or perfect performance. Use only displayed cues and provided experience; no hidden map or correct-answer feedback exists. Learn from concrete observations and any actually displayed help, but do not assume that seeing instructions means understanding or mastery. Past choices may have been wrong. Previous task items are not the current shopping list. Experience can guide a choice but does not guarantee transfer. lookAround and pause only wait; they do not reveal a new aisle. Movement is necessary to see another area. Reading the list exposes its contents. The lastReadList and instructions in observedThisVisit remain available after movement; absence from the current screen does not erase that recorded information. You may consult them or read again if you choose. Use current visible cues together with your recorded sightings and traveled edges; unseen areas remain unknown. submit requests analysis; it does not reveal a verdict. Choose exactly one ID from availableChoices. The program only translates that ID into the corresponding UI action. Return JSON: {"choiceId":"C1","delayMs":500,"reason":"brief observable action description","currentTask":"short current activity, not an explanation"}. Maintain or revise currentTask yourself; it is a provisional intention and may be mistaken. Do not return an action object, diagnosis, ability score or private reasoning.` },
        { role:'user', content:JSON.stringify({observation, personaCharacter:persona.character ?? {description:persona.description},
          experience:state, ...(extendedPolicy && activity ? {activityFeedback:activity}:{}), availableChoices:choices, ...(feedback ? {formatCorrection:feedback}:{} )}) },
      ];
      const wire = options.protocol === 'ollama'
        ? { model,messages,think:false,stream:false,options:{num_ctx:18432,num_predict:500,temperature:0.2} }
        : {model,messages,response_format:{type:'json_object'},max_completion_tokens:500};
      const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(options.timeoutMs??45000),
        headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(wire)});
      if(!response.ok) throw new Error(`LLM provider returned HTTP ${response.status}; no stochastic fallback.`);
      const body=await response.json() as {choices?:{message?:{content?:string}}[];message?:{content?:string}};
      attempts.push({request:wire,response:body});
      try {
        const selection=JSON.parse((options.protocol==='ollama'?body.message?.content:body.choices?.[0]?.message?.content)??'');
        const choice=choices.find(c=>c.id===selection.choiceId);
        if(!choice || Object.keys(selection).some(k=>!['choiceId','delayMs','reason','currentTask'].includes(k))) throw new Error('invalid choice');
        const decision={action:choice.action,delayMs:selection.delayMs,reason:selection.reason,...(selection.currentTask !== undefined ? {currentTask:selection.currentTask}:{})};
        assertDecision(decision);
        return {...decision,exchange:{request:wire,response:{attempts}}};
      } catch {
        feedback='Invalid JSON or choice format. Return ONLY choiceId from availableChoices, delayMs (integer 1..120000), reason (short string), and optional currentTask (string up to 160 characters). No action object. No game action has executed for this invalid response.';
      }
    }
    throw new Error('LLM provider returned invalid JSON/choice after 3 attempts; no stochastic fallback.');
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
        && action.type !== 'moveDirection' && action.type !== 'browse' && action.type !== 'pause' && action.type !== 'lookAround') context.record(action, previous, observation);
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
