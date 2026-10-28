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
  isRevisitNoteFeedbackPolicy, isShelfChoiceMarkerFeedbackPolicy } = require('../src/feedbackActor.ts');

// Offline protocol fixtures; no model call and no claim about success rate or human fidelity.
const v10 = 'feedback-choice-v10';
function snapshotAtShelf() {
  const initial = createMarketReplaySnapshot(createMarketSession({ seed: 'marker-feedback-fixture' }));
  const environment = structuredClone(initial.environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'fresh', environment.spawn);
  return createMarketReplaySnapshot(createMarketSession(initial.config, environment));
}
async function begin(t, policy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-feedback-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  t.mock.method(globalThis, 'fetch', () => { throw Error('No model calls in a protocol fixture'); });
  const snapshot = snapshotAtShelf();
  const began = await service.invokeTool('begin_feedback_plan', { requestId: 'begin', personaId: 'mild-intellectual-disability-adult',
    seed: 'marker-feedback-fixture', actorPolicyVersion: policy, snapshot, outputPath: path.join(dir, 'trace.json') });
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
const interact = frame => frame.availableChoices.find(c => c.action.type === 'interact');

test('v10 is explicit, keeps the v9 contract and leaves the default at v7', () => {
  assert.equal(FEEDBACK_ACTOR_POLICY_VERSION, 'feedback-choice-v7');
  for (const check of [isFeedbackActorPolicy, isRevisitNoteFeedbackPolicy, isShelfChoiceMarkerFeedbackPolicy]) assert.equal(check(v10), true);
  assert.equal(isShelfChoiceMarkerFeedbackPolicy('feedback-choice-v9'), false);
  for (const name of ['begin_feedback_plan', 'generate_trace'])
    assert.ok(definitions.find(x => x.name === name).inputSchema.properties.actorPolicyVersion.enum.includes(v10));
});

test('v10 marks the reopen control after a visit without changing its id, action or availability', async t => {
  const { service, snapshot, began, state, step } = await begin(t, v10);
  const fresh = interact(state.frame);
  assert.equal('recentVisit' in fresh, false, 'an unvisited shelf carries no marker');
  assert.doesNotMatch(fresh.label, /열어 본/);
  const idsBefore = state.frame.availableChoices.map(c => c.id);
  await step('interact', 'open-1');
  await step('closeStation', 'close-1');
  const once = interact(state.frame);
  assert.deepEqual(once.recentVisit, { timesOpened: 1 });
  assert.equal(once.label, `${fresh.label} · 최근에 1번 열어 본 진열대`);
  assert.equal(once.id, fresh.id);
  assert.deepEqual(once.action, fresh.action);
  // Presentation order is reshuffled per decision by design, so compare the offered set.
  assert.deepEqual(state.frame.availableChoices.map(c => c.id).sort(), [...idsBefore].sort(), 'the marker removes or adds no choice');
  assert.equal(state.frame.availableChoices.filter(c => c.recentVisit).length, 1, 'only the shelf control is marked');
  assert.deepEqual(state.frame.revisitNotes, [], 'the v9 note still needs a second opening');
  await step('interact', 'open-2');
  assert.equal(state.frame.observation.activeStation, 'fresh', 'the marked control still opens the shelf');
  await step('closeStation', 'close-2');
  assert.deepEqual(interact(state.frame).recentVisit, { timesOpened: 2 });
  assert.match(interact(state.frame).label, /최근에 2번 열어 본 진열대$/);
  assert.equal(state.frame.revisitNotes.length, 1);
  // Like v9, v10 offers no giveUp; the 100-action horizon hands the unchanged basket to the controller.
  assert.equal(state.frame.availableChoices.some(c => c.action.type === 'giveUp'), false);
  assert.doesNotMatch(state.frame.instructions, /giveUp/);
  let last, count = 4;
  do {
    const type = state.frame.availableChoices.some(c => c.action.type === 'closeStation') ? 'closeStation' : 'interact';
    last = await step(type, `fill-${++count}`);
  } while (last.nextFrame);
  assert.equal(count, 100);
  const saved = await service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.equal(trace.generation.systemCompletion.reason, 'action-limit');
  assert.equal(trace.steps.some(s => s.type === 'giveUp'), false);
  assert.equal(trace.generation.actorPolicyVersion, v10);
  assert.equal(trace.generation.feedback.version, '6');
  assert.equal(trace.generation.feedback.choiceContract, 'recent-shelf-choice-marker-v1');
  assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
});

test('v9 choices stay unmarked', async t => {
  const { state, step } = await begin(t, 'feedback-choice-v9');
  await step('interact', 'o1'); await step('closeStation', 'c1');
  assert.equal(state.frame.availableChoices.some(c => 'recentVisit' in c || /열어 본/.test(c.label)), false);
  assert.doesNotMatch(state.frame.instructions, /recentVisit/);
});
