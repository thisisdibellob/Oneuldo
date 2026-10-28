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
const { FEEDBACK_ACTOR_POLICY_VERSION, emptyFeedbackBeliefMemory, isFeedbackActorPolicy, isNoGiveUpFeedbackPolicy,
  isPassageMarkerFeedbackPolicy, isProgressNoteFeedbackPolicy } = require('../src/feedbackActor.ts');

// Offline protocol fixtures; no model call and no claim about success rate or human fidelity.
const v13 = 'feedback-choice-v13';
function snapshotAt(station) {
  const initial = createMarketReplaySnapshot(createMarketSession({ seed: 'progress-feedback-fixture' }));
  if (!station) return initial;
  const environment = structuredClone(initial.environment);
  environment.spawn = getMarketStationApproachPoint(environment, station, environment.spawn);
  return createMarketReplaySnapshot(createMarketSession(initial.config, environment));
}
async function begin(t, policy, station) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-feedback-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  t.mock.method(globalThis, 'fetch', () => { throw Error('No model calls in a protocol fixture'); });
  const snapshot = snapshotAt(station);
  const began = await service.invokeTool('begin_feedback_plan', { requestId: 'begin', personaId: 'mild-intellectual-disability-adult',
    seed: 'progress-feedback-fixture', actorPolicyVersion: policy, feedbackMovement: { wanderProbability: 0 }, snapshot, outputPath: path.join(dir, 'trace.json') });
  const state = { frame: began.frame, memory: emptyFeedbackBeliefMemory(policy) };
  const act = async (type, id, durationMs = 0) => {
    const result = await service.invokeTool('step_feedback_plan', { sessionId: began.sessionId, requestId: id, revision: state.frame.revision,
      choiceId: state.frame.availableChoices.find(c => c.action.type === type).id, durationMs, reason: '계약 검증 동작', memory: state.memory });
    if (result.nextFrame) state.frame = result.nextFrame;
    return result;
  };
  return { service, snapshot, began, state, act };
}
const item = (name, status, source = 'list') => ({ name, quantity: 1, certainty: 'clear', status, source, rememberedCartQuantity: null });
const listChoice = frame => frame.availableChoices.find(c => c.action.type === 'readList');

test('v13 is explicit, keeps the v12 contract and leaves the default at v7', () => {
  assert.equal(FEEDBACK_ACTOR_POLICY_VERSION, 'feedback-choice-v7');
  for (const check of [isFeedbackActorPolicy, isNoGiveUpFeedbackPolicy, isPassageMarkerFeedbackPolicy, isProgressNoteFeedbackPolicy])
    assert.equal(check(v13), true);
  assert.equal(isProgressNoteFeedbackPolicy('feedback-choice-v12'), false);
  for (const name of ['begin_feedback_plan', 'generate_trace'])
    assert.ok(definitions.find(x => x.name === name).inputSchema.properties.actorPolicyVersion.enum.includes(v13));
});

test('v13 marks the list control with when and how often it was read, never with its contents', async t => {
  const { snapshot, state, act } = await begin(t, v13);
  assert.equal('recentRead' in listChoice(state.frame), false, 'an unread list carries no marker');
  await act('readList', 'read-1', 100);
  let choice = listChoice(state.frame);
  assert.deepEqual(choice.recentRead, { actionsAgo: 0, timesRead: 1 });
  assert.match(choice.label, / · 방금 읽음, 최근 24번의 행동 안에 1번 읽음$/);
  await act('pause', 'p1', 100); await act('pause', 'p2', 100);
  choice = listChoice(state.frame);
  assert.deepEqual(choice.recentRead, { actionsAgo: 2, timesRead: 1 });
  assert.match(choice.label, / · 2번의 행동 전에 읽음, 최근 24번의 행동 안에 1번 읽음$/);
  const again = await act('readList', 'read-2', 100);
  assert.equal(again.result.accepted, true, 'the marked control still reads the list');
  assert.deepEqual(listChoice(state.frame).recentRead, { actionsAgo: 0, timesRead: 2 });
  for (const objective of snapshot.mission?.objectives ?? []) assert.equal(listChoice(state.frame).label.includes(objective.label), false);
  for (let i = 0; i < 25; i++) await act('pause', `q${i}`, 100);
  assert.equal('recentRead' in listChoice(state.frame), false, 'the marker expires with the retained experience');
});

test('v13 progress notes restate only the authored beliefs, always state the checkout ending and report checkout sightings', async t => {
  const { state, act } = await begin(t, v13);
  // No remembered items: no belief sentence, but the ending rule is always present.
  assert.equal(state.frame.progressNotes.some(n => n.startsWith('지금 기억에 남긴 물건')), false);
  assert.ok(state.frame.progressNotes.includes('아직 구매를 확정하지 않았습니다. 이번 장보기는 고른 물건을 가지고 계산대에서 구매를 확정해야 끝납니다.'));
  assert.match(state.frame.instructions, /progressNotes/);
  assert.equal(state.frame.availableChoices.some(c => c.action.type === 'giveUp'), false);
  // The beliefs below are deliberately wrong: nothing was bought. The note repeats them without checking.
  state.memory = { ...state.memory, rememberedItems: [item('틀리게 기억한 우유', 'done'), item('바나나', 'pending'), item('순한 카레', 'abandoned', 'personal'), item(null, 'pending')] };
  await act('pause', 'p1', 100);
  let belief = state.frame.progressNotes.find(n => n.startsWith('지금 기억에 남긴 물건'));
  assert.equal(belief, '지금 기억에 남긴 물건 3가지: 끝난 것으로 표시한 물건은 틀리게 기억한 우유. 아직 남은 것으로 표시한 물건은 바나나. 그만둔 것으로 표시한 물건은 순한 카레.');
  assert.deepEqual(state.frame.memory.rememberedItems, state.memory.rememberedItems, 'beliefs are never rewritten');
  state.memory = { ...state.memory, rememberedItems: [item('틀리게 기억한 우유', 'done'), item('바나나', 'done'), item('순한 카레', 'pending', 'personal')] };
  await act('pause', 'p2', 100);
  belief = state.frame.progressNotes.find(n => n.startsWith('지금 기억에 남긴 물건'));
  assert.ok(belief.endsWith('목록에서 왔다고 기억한 물건은 모두 끝난 것으로 표시되어 있습니다.'));
  assert.match(belief, /아직 남은 것으로 표시한 물건은 순한 카레\./);
  const sighting = state.frame.progressNotes.at(-1);
  assert.match(sighting, /계산대/);
  const seen = state.frame.experience.exploration.lastCheckoutSeen;
  if (seen === null) assert.equal(sighting, '이번 방문에서 아직 계산대를 화면에서 본 적이 없습니다.');
  else assert.ok(seen.actionsAgo === 0 ? sighting.startsWith('지금 화면의 ') : sighting.includes(`${seen.actionsAgo}번의 행동 전`));
});

test('v13 remembers a checkout sighting for the visit and changes the ending sentence at the counter', async t => {
  // Only a staffed counter offers the purchase confirmation.
  const staffed = Object.entries(snapshotAt().cashierAvailability).find(([, available]) => available)[0];
  const { service, snapshot, began, state, act } = await begin(t, v13, staffed);
  assert.equal(state.frame.experience.exploration.lastCheckoutSeen.actionsAgo, 0);
  assert.ok(state.frame.progressNotes.at(-1).startsWith('지금 화면의 '));
  for (let i = 0; i < 30; i++) await act('viewHelp', `h${i}`).then(() => act('closeView', `c${i}`));
  // Panels hide the store; the sighting is one landmark kept beyond the 24-action window.
  const seen = state.frame.experience.exploration.lastCheckoutSeen;
  assert.ok(seen && seen.actionsAgo === 0, 'the counter is on screen again once the panel closes');
  await act('checkout', 'counter');
  assert.equal(state.frame.observation.phase, 'checkout');
  assert.ok(state.frame.progressNotes.includes('지금 계산대 화면입니다. 아직 구매를 확정하지 않았습니다. 구매를 확정하면 이번 장보기가 끝납니다.'));
  const done = await act('submit', 'confirm');
  assert.equal(done.complete, true);
  const saved = await service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.equal(trace.generation.actorPolicyVersion, v13);
  assert.equal(trace.generation.feedback.version, '9');
  assert.equal(trace.generation.feedback.listMarkerContract, 'recent-list-read-marker-v1');
  assert.equal(trace.generation.feedback.progressNoteContract, 'belief-progress-checkout-notes-v1');
  assert.equal(trace.generation.systemCompletion, undefined, 'an actor-confirmed purchase is not a system checkout');
  assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
});

test('v12 frames gain no list marker or progress notes', async t => {
  const { state, act } = await begin(t, 'feedback-choice-v12');
  await act('readList', 'read-1', 100);
  assert.equal('progressNotes' in state.frame, false);
  assert.equal('recentRead' in listChoice(state.frame), false);
  assert.equal('lastCheckoutSeen' in state.frame.experience.exploration, false);
  assert.equal('listReadsInRetention' in state.frame.experience.checks, false);
});
