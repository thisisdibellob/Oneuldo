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
const { FEEDBACK_ACTOR_POLICY_VERSION, emptyFeedbackBeliefMemory, isFeedbackActorPolicy, isNoGiveUpFeedbackPolicy,
  isShelfChoiceMarkerFeedbackPolicy, isMovementNoteFeedbackPolicy } = require('../src/feedbackActor.ts');
const { FeedbackExperience } = require('../src/feedbackExperience.ts');

// Offline protocol fixtures; no model call and no claim about success rate or human fidelity.
const v11 = 'feedback-choice-v11';
async function begin(t, policy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'movement-feedback-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  t.mock.method(globalThis, 'fetch', () => { throw Error('No model calls in a protocol fixture'); });
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'movement-feedback-fixture' }));
  // No wandering cue: every walking choice in this fixture is the scripted one.
  const began = await service.invokeTool('begin_feedback_plan', { requestId: 'begin', personaId: 'mild-intellectual-disability-adult',
    seed: 'movement-feedback-fixture', actorPolicyVersion: policy, feedbackMovement: { wanderProbability: 0 }, snapshot, outputPath: path.join(dir, 'trace.json') });
  const state = { frame: began.frame };
  const memory = emptyFeedbackBeliefMemory(policy);
  const walk = async (direction, id, durationMs = 300) => {
    const result = await service.invokeTool('step_feedback_plan', { sessionId: began.sessionId, requestId: id, revision: state.frame.revision,
      choiceId: state.frame.availableChoices.find(c => c.action.type === 'moveDirection' && c.action.direction === direction).id,
      durationMs, reason: '계약 검증 동작', memory });
    if (result.nextFrame) state.frame = result.nextFrame;
    return result;
  };
  return { service, snapshot, began, state, walk, memory };
}

test('v11 is explicit, keeps the v10 contract and leaves the default at v7', () => {
  assert.equal(FEEDBACK_ACTOR_POLICY_VERSION, 'feedback-choice-v7');
  for (const check of [isFeedbackActorPolicy, isNoGiveUpFeedbackPolicy, isShelfChoiceMarkerFeedbackPolicy, isMovementNoteFeedbackPolicy])
    assert.equal(check(v11), true);
  assert.equal(isMovementNoteFeedbackPolicy('feedback-choice-v10'), false);
  for (const name of ['begin_feedback_plan', 'generate_trace'])
    assert.ok(definitions.find(x => x.name === name).inputSchema.properties.actorPolicyVersion.enum.includes(v11));
  assert.equal('recentMovement' in new FeedbackExperience({ version: 'bounded-observed-experience-v2' }).snapshot({
    schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world', activeStation: null, listAvailable: true,
    visibleStations: [], anchors: [], products: [], shelf: null, cart: null, cashiers: {} }).exploration, false, 'earlier policies keep their experience shape');
});

test('v11 words only the actor\'s own retained walking: counted directions, directions not walked and returning near the start', async t => {
  const { service, snapshot, began, state, walk } = await begin(t, v11);
  assert.deepEqual(state.frame.movementNotes, []);
  assert.match(state.frame.instructions, /movementNotes/);
  assert.equal(state.frame.availableChoices.some(c => c.action.type === 'giveUp'), false);
  for (const [direction, id] of [['west', 'w1'], ['east', 'e1'], ['west', 'w2']]) {
    await walk(direction, id);
    assert.deepEqual(state.frame.movementNotes, [], 'fewer than four walks are not described');
  }
  await walk('east', 'e2');
  const movement = state.frame.experience.exploration.recentMovement;
  assert.equal(movement.walks, 4);
  assert.deepEqual(movement.byDirection, { west: 2, east: 2 });
  assert.ok(movement.directional.travelledPx > 0 && movement.directional.netPx * 4 <= movement.directional.travelledPx);
  const [counts, returned] = state.frame.movementNotes;
  assert.ok(counts.startsWith('최근 24번의 행동 안에 4번 걸었습니다: '));
  assert.match(counts, /오른쪽 2번/); assert.match(counts, /왼쪽 2번/);
  assert.match(counts, /그동안 걷지 않은 방향: 위쪽, 오른쪽 위, 오른쪽 아래, 아래쪽, 왼쪽 아래, 왼쪽 위\./);
  assert.equal(returned, '그 걸음들은 오간 끝에 처음 자리 가까이에서 끝났습니다.');
  const text = state.frame.movementNotes.join(' ');
  for (const objective of snapshot.mission?.objectives ?? []) assert.equal(text.includes(objective.label), false);
  assert.doesNotMatch(text, /진열대|매대|우유|바나나|가세요|가야/);
  assert.equal(JSON.stringify(state.frame.experience.exploration.recentMovement).includes('"x"'), false, 'no position is exposed');

  // Walking one way removes the "near the start" sentence and the walked direction from the not-walked list.
  for (let i = 0; i < 4; i++) await walk('north', `n${i}`, 600);
  const after = state.frame.movementNotes;
  assert.match(after[0], /위쪽 4번/);
  assert.doesNotMatch(after[0].split('그동안 걷지 않은 방향: ')[1], /위쪽/);
  if (state.frame.experience.exploration.recentMovement.directional.netPx * 4 > state.frame.experience.exploration.recentMovement.directional.travelledPx)
    assert.equal(after.length, 1);
  assert.ok(state.frame.availableChoices.filter(c => c.action.type === 'moveDirection').length >= 1, 'no direction is removed by the notes');
});

test('v10 frames gain no movement notes or movement history', async t => {
  const { state, walk } = await begin(t, 'feedback-choice-v10');
  for (const [direction, id] of [['west', 'w1'], ['east', 'e1'], ['west', 'w2'], ['east', 'e2']]) await walk(direction, id);
  assert.equal('movementNotes' in state.frame, false);
  assert.equal('recentMovement' in state.frame.experience.exploration, false);
  assert.doesNotMatch(state.frame.instructions, /movementNotes/);
});

test('v11 ends an unfinished run with the recorded system checkout and saves a valid version 7 trace', async t => {
  const { service, snapshot, began, state, memory } = await begin(t, v11);
  let last, count = 0;
  do {
    last = await service.invokeTool('step_feedback_plan', { sessionId: began.sessionId, requestId: `p${++count}`, revision: state.frame.revision,
      choiceId: state.frame.availableChoices.find(c => c.action.type === 'pause').id, durationMs: 100, reason: '계약 검증 동작', memory });
    if (last.nextFrame) state.frame = last.nextFrame;
  } while (last.nextFrame);
  assert.equal(count, 100);
  const saved = await service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.equal(trace.generation.actorPolicyVersion, v11);
  assert.equal(trace.generation.feedback.version, '7');
  assert.equal(trace.generation.feedback.movementNoteContract, 'recent-movement-notes-v1');
  assert.equal(trace.generation.feedback.choiceContract, 'recent-shelf-choice-marker-v1');
  assert.equal(trace.generation.systemCompletion.reason, 'action-limit');
  assert.equal(trace.steps.some(s => s.type === 'giveUp'), false);
  assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
});
