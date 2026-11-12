'use strict';
// Legacy provider/stochastic incremental trace generation (frozen).
// Handler bodies were moved verbatim from server.cjs.
const { string, seed, object, llm, schema, feedbackMovement } = require('../schema.cjs');
const definitions = [
  { name: 'generate_trace', description: 'AI is the default; stochastic is explicit regression-only. Generate an intent-level trace for a registered tab mission or explicit snapshot. Default AI attention retains episodic-choice-v4 and fails on technical limits. Explicit feedback-choice-v7 adds changes since the last basket view and actor-authored quantity/source beliefs without forced corrections. Explicit feedback-choice-v5 adds screen basket text and grouped action parameters; v6 also balances individual task motivation. Explicit feedback-choice-v4 adds bounded recent observed experience, persistent intent and seeded wandering that retains available interactions. Explicit feedback-choice-v3 preserves directional-only wandering and observed blocked-direction avoidance. Both record controller-selected movement modes. feedback-choice-v2 preserves unrestricted directional choices; feedback-choice-v1 preserves legacy anchor controls. All feedback versions use stateless per-action model requests with current-screen observations and actor-authored beliefs, original timing, no automatic checkout, and no legacy learner import. Explicit actorPolicyVersion episodic-choice-v9 or a v9 learnerFile observes at most 100 model decisions; natural termination wins, otherwise the system walks to checkout and submits the unchanged current basket, including an empty basket, then waits for acceptance and exits. The controller suffix is marked separately from actor choices. Repetition alone does not stop generation. Smaller maxActions/maxCalls/time budgets remain technical errors. learnerFile loads verified personal experience and locks the actor identity. Saves JSON; never uploads gameplay logs.', inputSchema: schema({ personaId: string, seed, tabId: string, snapshot: object, snapshotFilePath: string, outputPath: string, learnerFile: string, actorPolicyVersion: { enum: ['episodic-choice-v9','feedback-choice-v1','feedback-choice-v2','feedback-choice-v3','feedback-choice-v4', 'feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7', 'feedback-choice-v8', 'feedback-choice-v9', 'feedback-choice-v10', 'feedback-choice-v11', 'feedback-choice-v12', 'feedback-choice-v13'] }, feedbackMovement, mode: { enum: ['stochastic', 'llm'] }, timingProfile: { enum: ['original', 'compact'] }, maxActions: { type: 'integer', minimum: 1, maximum: 2000 }, timeBudgetMs: { type: 'integer', minimum: 1000, maximum: 3600000 }, attentionExperience: schema({ visit: { enum: ['first-play', 'revisit'] }, previousLayoutKey: string, memory: object, learning: object }, ['visit']), llm }, ['personaId', 'seed']) },
];
async function invoke(name, args, ctx) {
  const { getSnapshot, getBridge, generateAndSave } = ctx;
  if (name === 'generate_trace') {
    const snapshot = await getSnapshot(args);
    const { tabId, snapshot: supplied, snapshotFilePath, outputPath, learnerFile, ...settings } = args;
    if (learnerFile) {
      if (settings.attentionExperience) throw new Error('learnerFile cannot be combined with manual experience');
      if (settings.mode && settings.mode !== 'llm') throw new Error('Persistent learners require AI mode');
      const store = require('../../learner-store.cjs'), state = store.readLearner(learnerFile), identity = state.identity;
      const persona = require('../../src/personas.ts').getPersona(settings.personaId);
      const model = settings.llm?.model ?? process.env.MARKET_LLM_MODEL ?? identity.model;
      if (identity.personaId !== persona.id || identity.personaVersion !== persona.version || identity.model !== model
        || identity.policyVersion !== require('../../src/llmPolicy.ts').ACTOR_POLICY_VERSION) throw new Error('Learner actor identity changed; start a new experiment');
      if (tabId) {
        const session = (await getBridge()).list().sessions.find(s => s.tabId === tabId);
        if (identity.memberId !== session?.memberId) throw new Error('Learner cannot cross test accounts');
      }
      settings.llm = { ...settings.llm, model }; settings.mode = 'llm';
      settings.learnerIdentity = identity;
      settings.attentionExperience = store.getLearnerExperience(learnerFile);
    }
    if (tabId && settings.attentionExperience?.learning) {
      const session=(await getBridge()).list().sessions.find(s=>s.tabId===tabId);
      if(settings.attentionExperience.learning.memberId!==session?.memberId) throw new Error('Learning cannot cross test accounts');
    }
    return generateAndSave(settings, snapshot, outputPath);
  }
  throw new Error('Unsupported tool.');
}
module.exports = { definitions, invoke };
