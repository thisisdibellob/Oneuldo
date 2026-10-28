'use strict';
require('../runtime.cjs').register();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createService, definitions } = require('../server.cjs');
const { validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { FEEDBACK_ACTOR_POLICY_VERSION, emptyFeedbackBeliefMemory, isFeedbackActorPolicy,
  isResultReflectionFeedbackPolicy, isRevisitNoteFeedbackPolicy } = require('../src/feedbackActor.ts');

// Offline protocol fixtures; no model call and no claim about success rate or human fidelity.
const v9 = 'feedback-choice-v9';
function snapshotAtShelf() {
  const initial = createMarketReplaySnapshot(createMarketSession({ seed: 'revisit-feedback-fixture' }));
  const environment = structuredClone(initial.environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'fresh', environment.spawn);
  return createMarketReplaySnapshot(createMarketSession(initial.config, environment));
}
async function begin(t, policy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revisit-feedback-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  t.mock.method(globalThis, 'fetch', () => { throw Error('No model calls in a protocol fixture'); });
  const snapshot = snapshotAtShelf();
  const began = await service.invokeTool('begin_feedback_plan', { requestId: 'begin', personaId: 'mild-intellectual-disability-adult',
    seed: 'revisit-feedback-fixture', actorPolicyVersion: policy, snapshot, outputPath: path.join(dir, 'trace.json') });
  const state = { frame: began.frame };
  const memory = emptyFeedbackBeliefMemory(policy);
  const step = async (type, id) => {
    const result = await service.invokeTool('step_feedback_plan', { sessionId: began.sessionId, requestId: id, revision: state.frame.revision,
      choiceId: state.frame.availableChoices.find(c => c.action.type === type).id, durationMs: 0, reason: '계약 검증 동작', memory });
    if (result.nextFrame) state.frame = result.nextFrame;
    return result;
  };
  return { service, snapshot, began, state, step };
}

test('v9 is explicit, keeps the v8 contract and leaves the default at v7', () => {
  assert.equal(FEEDBACK_ACTOR_POLICY_VERSION, 'feedback-choice-v7');
  for (const check of [isFeedbackActorPolicy, isResultReflectionFeedbackPolicy, isRevisitNoteFeedbackPolicy]) assert.equal(check(v9), true);
  assert.equal(isRevisitNoteFeedbackPolicy('feedback-choice-v8'), false);
  assert.deepEqual(emptyFeedbackBeliefMemory(v9), { rememberedItems: [], nextStep: null, notes: [], ongoingIntent: null });
  for (const name of ['begin_feedback_plan', 'generate_trace'])
    assert.ok(definitions.find(x => x.name === name).inputSchema.properties.actorPolicyVersion.enum.includes(v9));
});

test('v9 words a shelf only after it is reopened, from displayed products and without a goal comparison', async t => {
  const { service, snapshot, began, state, step } = await begin(t, v9);
  assert.equal(state.frame.policyVersion, v9);
  assert.deepEqual(state.frame.revisitNotes, []);
  assert.equal(state.frame.lastAction, null);
  assert.match(state.frame.instructions, /revisitNotes/);
  await step('interact', 'open-1');
  const displayed = state.frame.observation.products.map(product => product.name);
  assert.ok(displayed.length > 0 && state.frame.observation.products.every(product => product.inCart === false));
  assert.deepEqual(state.frame.revisitNotes, [], 'a first visit is not a revisit');
  await step('closeStation', 'close-1');
  assert.deepEqual(state.frame.revisitNotes, []);
  await step('interact', 'open-2');
  assert.equal(state.frame.revisitNotes.length, 1);
  const shelf = state.frame.experience.exploration.recentShelves.find(s => s.id === 'fresh');
  assert.equal(shelf.timesOpened, 2);
  const note = state.frame.revisitNotes[0];
  assert.ok(note.includes(`'${shelf.label}' 진열대를 최근 24번의 행동 안에 2번 열었습니다.`));
  for (const name of displayed) assert.ok(note.includes(name));
  assert.deepEqual(note.split('거기서 본 상품: ')[1].replace(/\.$/, '').split(', '), shelf.observedProducts.map(p => p.name));
  for (const objective of snapshot.mission?.objectives ?? []) assert.equal(note.includes(objective.label), false);
  assert.doesNotMatch(note, /목록|없습니다|찾/);
  await step('closeStation', 'close-2');
  assert.equal(state.frame.revisitNotes.length, 1, 'the note stays while the visits are retained');
  await step('interact', 'open-3');
  assert.match(state.frame.revisitNotes[0], /3번 열었습니다/);
  // v9 has no giveUp: keep acting until the 100-action horizon hands the unchanged basket to the controller.
  assert.equal(state.frame.availableChoices.some(c => c.action.type === 'giveUp'), false);
  assert.match(state.frame.instructions, /no choice that ends the visit without checkout/);
  assert.doesNotMatch(state.frame.instructions, /giveUp/);
  let last, count = 5;
  do {
    const type = state.frame.availableChoices.some(c => c.action.type === 'closeStation') ? 'closeStation' : 'interact';
    last = await step(type, `fill-${++count}`);
    if (last.nextFrame) assert.equal(last.nextFrame.availableChoices.some(c => c.action.type === 'giveUp'), false);
  } while (last.nextFrame);
  assert.equal(count, 100);
  const saved = await service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.equal(trace.generation.actorPolicyVersion, v9);
  assert.equal(trace.generation.feedback.version, '5');
  assert.equal(trace.generation.feedback.revisitContract, 'shelf-revisit-notes-v1');
  assert.equal(trace.generation.feedback.reflectionContract, 'result-reflection-next-step-v1');
  assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
  assert.equal(trace.generation.feedback.decisions, 100);
  const completion = trace.generation.systemCompletion;
  assert.deepEqual({ reason: completion.reason, afterDecisions: completion.afterDecisions, cartAtStart: completion.cartAtStart },
    { reason: 'action-limit', afterDecisions: 100, cartAtStart: {} });
  const first = trace.steps.findIndex(s => s.id === completion.firstStepId);
  assert.equal(trace.steps.some(s => ['giveUp', 'skipRating'].includes(s.type)), false);
  assert.deepEqual(trace.steps.slice(-3).map(s => s.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
  assert.ok(trace.steps.slice(first).every(s => s.movementPolicy === undefined && s.reactionDelayMs === 0));
  const quit = structuredClone(trace);
  quit.steps.splice(first, quit.steps.length, ...['giveUp', 'skipRating', 'leave'].map(type => ({ ...trace.steps.at(-1), id: `quit-${type}`, type })));
  delete quit.generation.systemCompletion;
  assert.ok(validateTrace(quit).errors.some(e => /feedback-choice-v9 offers no giveUp/.test(e)));
});

test('v8 still offers giveUp', async t => {
  const { state } = await begin(t, 'feedback-choice-v8');
  assert.ok(state.frame.availableChoices.some(c => c.action.type === 'giveUp'));
  assert.match(state.frame.instructions, /submit, giveUp\)/);
});

test('v8 frames gain no revisit notes', async t => {
  const { state, step } = await begin(t, 'feedback-choice-v8');
  for (const [type, id] of [['interact', 'o1'], ['closeStation', 'c1'], ['interact', 'o2']]) await step(type, id);
  assert.equal('revisitNotes' in state.frame, false);
  assert.doesNotMatch(state.frame.instructions, /revisitNotes/);
});
