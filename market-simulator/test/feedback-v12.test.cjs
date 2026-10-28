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
  isMovementNoteFeedbackPolicy, isPassageMarkerFeedbackPolicy } = require('../src/feedbackActor.ts');

// Offline protocol fixtures; no model call and no claim about success rate or human fidelity.
const v12 = 'feedback-choice-v12';
async function begin(t, policy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'passage-feedback-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  t.mock.method(globalThis, 'fetch', () => { throw Error('No model calls in a protocol fixture'); });
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'passage-feedback-fixture' }));
  const began = await service.invokeTool('begin_feedback_plan', { requestId: 'begin', personaId: 'mild-intellectual-disability-adult',
    seed: 'passage-feedback-fixture', actorPolicyVersion: policy, feedbackMovement: { wanderProbability: 0 }, snapshot, outputPath: path.join(dir, 'trace.json') });
  const state = { frame: began.frame };
  const memory = emptyFeedbackBeliefMemory(policy);
  const choose = async (choice, id, durationMs = 0) => {
    const result = await service.invokeTool('step_feedback_plan', { sessionId: began.sessionId, requestId: id, revision: state.frame.revision,
      choiceId: choice.id, durationMs, reason: '계약 검증 동작', memory });
    if (result.nextFrame) state.frame = result.nextFrame;
    return result;
  };
  return { service, snapshot, began, state, choose, memory };
}
const passages = frame => frame.availableChoices.filter(c => c.action.type === 'walkToAnchor');

test('v12 is explicit, keeps the v11 contract and leaves the default at v7', () => {
  assert.equal(FEEDBACK_ACTOR_POLICY_VERSION, 'feedback-choice-v7');
  for (const check of [isFeedbackActorPolicy, isNoGiveUpFeedbackPolicy, isMovementNoteFeedbackPolicy, isPassageMarkerFeedbackPolicy])
    assert.equal(check(v12), true);
  assert.equal(isPassageMarkerFeedbackPolicy('feedback-choice-v11'), false);
  for (const name of ['begin_feedback_plan', 'generate_trace'])
    assert.ok(definitions.find(x => x.name === name).inputSchema.properties.actorPolicyVersion.enum.includes(v12));
});

test('v12 frames carry short per-frame choice ids and no passage id anywhere', async t => {
  const { state, choose } = await begin(t, v12);
  const check = frame => {
    assert.deepEqual(frame.availableChoices.map(c => c.id), frame.availableChoices.map((_, i) => `c${String(i + 1).padStart(2, '0')}`));
    const text = JSON.stringify(frame);
    assert.doesNotMatch(text, /anchor-[0-9a-f]{6,}|"anchorId"|choice-[0-9a-f]{6,}/);
    assert.ok(frame.observation.anchors.every(anchor => !('id' in anchor) && anchor.direction && anchor.distanceBand));
    assert.ok(frame.experience.exploration.recentPassages.every(passage => !('id' in passage)));
    assert.equal('passageArrivals' in frame.experience.exploration, false);
    for (const choice of passages(frame)) {
      assert.deepEqual(choice.action, { type: 'walkToAnchor' });
      assert.ok(choice.observedContext.direction && choice.observedContext.distanceBand);
    }
  };
  check(state.frame);
  assert.ok(passages(state.frame).length > 0);
  assert.match(state.frame.instructions, /valid for this frame only/);
  await choose(passages(state.frame)[0], 'walk-1');
  check(state.frame);
  assert.deepEqual(state.frame.lastAction.action, { type: 'walkToAnchor' });
  assert.deepEqual(state.frame.lastAction.result, { accepted: true, actionType: 'walkToAnchor' });
});

test('v12 marks only passages this person walked to, and the marked control still walks there', async t => {
  const { service, snapshot, began, state, choose, memory } = await begin(t, v12);
  assert.equal(passages(state.frame).some(c => c.recentVisit), false, 'nothing is marked before any walk');
  // The passage this person stands on is not offered; the marker shows when it is visible again from elsewhere.
  let marked = [], count = 0;
  while (!marked.length && count < 12) {
    const unvisited = passages(state.frame).filter(c => !c.recentVisit);
    assert.ok(unvisited.length > 0);
    const moved = await choose(unvisited[0], `walk-${++count}`);
    assert.equal(moved.result.accepted, true);
    marked = passages(state.frame).filter(c => c.recentVisit);
  }
  assert.ok(marked.length >= 1 && count >= 2, 'a visited passage is marked once it is offered again');
  assert.deepEqual(marked[0].recentVisit, { timesArrived: 1 });
  assert.match(marked[0].label, / · 최근에 1번 간 통로$/);
  assert.ok(marked.length <= count);
  assert.ok(passages(state.frame).some(c => !c.recentVisit), 'passages not walked to stay unmarked');
  const again = await choose(marked[0], `walk-${++count}`);
  assert.equal(again.result.accepted, true, 'the marked control still walks there');
  // A stale or invented id is rejected, never substituted.
  await assert.rejects(service.invokeTool('step_feedback_plan', { sessionId: began.sessionId, requestId: 'bad', revision: state.frame.revision,
    choiceId: 'choice-0b5a978d', durationMs: 0, reason: '계약 검증 동작', memory }), /not available/);
  let last;
  do {
    last = await choose(state.frame.availableChoices.find(c => c.action.type === 'pause'), `p${++count}`, 100);
  } while (last.nextFrame);
  assert.equal(count, 100);
  const saved = await service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.equal(trace.generation.actorPolicyVersion, v12);
  assert.equal(trace.generation.feedback.version, '8');
  assert.equal(trace.generation.feedback.passageContract, 'anonymous-passage-visit-marker-v1');
  assert.equal(trace.generation.feedback.choiceIdContract, 'per-frame-short-ids-v1');
  assert.equal(trace.steps.filter(s => s.type === 'walkToAnchor').length >= 2, true, 'the saved trace keeps the real passage targets');
  assert.ok(trace.steps.filter(s => s.type === 'walkToAnchor').every(s => /^anchor-/.test(s.target.anchorId)));
  assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
});

test('v11 frames keep hash choice ids and passage ids', async t => {
  const { state, choose } = await begin(t, 'feedback-choice-v11');
  await choose(passages(state.frame)[0], 'walk-1');
  assert.ok(state.frame.availableChoices.every(c => /^(choice|move-direction)-/.test(c.id)));
  assert.ok(passages(state.frame).every(c => /^anchor-/.test(c.action.anchorId) && !c.recentVisit));
  assert.ok(state.frame.observation.anchors.every(anchor => /^anchor-/.test(anchor.id)));
  assert.equal('passageArrivals' in state.frame.experience.exploration, false);
});
