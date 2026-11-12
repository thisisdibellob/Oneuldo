const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');

// Authored contract fixtures only: no saved pilot candidates, model calls or app replay.
function fixture() {
  const seed = 'objective-cue-contract';
  const settings = {
    snapshot: createMarketReplaySnapshot(createMarketSession({ seed, difficulty: 'exact', stockPerProduct: 5,
      objectives: [{ productId: 'milk', quantity: 2 }] })),
    personaId: 'mild-intellectual-disability-adult', seed, timingProfile: 'original', maxActions: 100,
    llm: { model: 'gpt-6-luna', maxCalls: 1 },
  };
  const bundle = buildWholeTraceBundle(settings, 'objective-cue-contract-request');
  const source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const objectiveRef = `objective:${goal.id}`;
  const decision = (choiceId, { intent = 'check', goalId = null, memoryUses = [], cueRefs, state = {} } = {}) => ({
    choiceRef: { source: structuredClone(source), choiceId }, delayMs: 850,
    reason: '현재 관찰 출처와 목표 세부 사용 선언을 구분하는 작성된 시험 행동',
    basis: { intent, goalId, memoryUses, ...(cueRefs === undefined ? {} : { cueRefs }) },
    actorState: { activity: 'check', task: '현재 화면을 확인한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar', ...state },
  });
  const held = { heldGoalIds: [goal.id] };
  const nameUse = mode => ({ goalId: goal.id, field: 'name', mode, value: goal.label });
  const prefix = () => [decision('control/readList'), decision('control/pause', {
    intent: 'task', goalId: goal.id, memoryUses: [nameUse('current-display')],
    state: { ...held, activity: 'shop', focusedGoalId: goal.id, taskUpdate: [{ type: 'select', goalId: goal.id }] },
  })];
  const quit = () => decision('control/giveUp', { intent: 'finish', state: { ...held, activity: 'finish' } });
  const candidate = decisions => ({ candidateVersion: '7', requestId: bundle.requestId, decisions });
  const compile = decisions => compileWholeTraceCandidate(settings, bundle, candidate(decisions));
  return { settings, bundle, source, goal, objectiveRef, decision, held, nameUse, prefix, quit, candidate, compile };
}

for (const [choiceId, intent, activity] of [
  ['control/lookAround', 'explore', 'orient'],
  ['control/readList', 'check', 'check'],
]) {
  test(`raw objective basis with null goal stays rejected for ${choiceId}, even after reading and selecting`, async () => {
    const f = fixture();
    const attempted = f.decision(choiceId, { intent, cueRefs: [f.objectiveRef], state: { ...f.held, activity } });
    const decisions = [...f.prefix(), attempted, f.quit()], original = structuredClone(decisions);
    await assert.rejects(f.compile(decisions), error => {
      assert.equal(error.validation.code, 'TASK_MEMORY');
      assert.equal(error.validation.acceptedPrefixLength, 2);
      assert.deepEqual(error.validation.errors, ['Goal detail use requires an explicit basis.goalId even when focusedGoalId is null']);
      assert.ok(error.validation.knowledge.cues.some(cue => cue.cueRef === f.objectiveRef));
      assert.deepEqual(error.validation.taskMemory.openGoalIds, [f.goal.id]);
      assert.deepEqual(attempted.basis.memoryUses, []);
      return true;
    });
    assert.deepEqual(decisions, original, 'rejection does not insert a task, delete a cue or replace the selected action');
  });
}

test('unbound exploration and list checking retain open tasks with only compiler-derived objective proof', async () => {
  const f = fixture();
  const decisions = [...f.prefix(),
    f.decision('control/lookAround', { intent: 'explore', state: { ...f.held, activity: 'orient' } }),
    f.decision('control/readList', { state: f.held }), f.quit()];
  const original = structuredClone(decisions), result = await f.compile(decisions);
  assert.equal(result.acceptedActions, decisions.length);
  assert.deepEqual(decisions, original, 'the compiler does not convert an unbound action to goal-directed behavior');
  for (const row of result.knowledgeAudit.slice(2, 4)) {
    assert.equal(row.basis.goalId, null);
    assert.deepEqual(row.basis.memoryUses, []);
    assert.deepEqual(row.choiceResolution.declaredBasisCueRefs, []);
    assert.deepEqual(row.choiceResolution.declaredTriggerCueRefs, []);
    assert.ok(row.choiceResolution.derivedCueRefs.includes(f.objectiveRef));
    assert.ok(row.basis.cueRefs.includes(f.objectiveRef));
    assert.deepEqual(row.actorState.heldGoalIds, [f.goal.id]);
    assert.equal(row.actorState.focusedGoalId, null);
    assert.deepEqual(row.taskMemory.state.openGoalIds, [f.goal.id]);
    assert.equal(row.taskMemory.valid, true);
    assert.equal(row.cognition.valid, true);
  }
});

test('known raw objective basis is permitted with an open goal and an explicit valid name memory use', async () => {
  const f = fixture();
  const bound = f.decision('control/lookAround', { goalId: f.goal.id, cueRefs: [f.objectiveRef],
    memoryUses: [f.nameUse('remembered')], state: f.held });
  const decisions = [...f.prefix(), bound, f.quit()], original = structuredClone(decisions);
  const result = await f.compile(decisions), row = result.knowledgeAudit[2];
  assert.equal(result.acceptedActions, decisions.length);
  assert.deepEqual(row.choiceResolution.declaredBasisCueRefs, [f.objectiveRef]);
  assert.equal(row.basis.goalId, f.goal.id);
  assert.deepEqual(row.basis.memoryUses, [f.nameUse('remembered')]);
  assert.equal(row.actorState.focusedGoalId, null, 'goal binding and momentary focus remain separate');
  assert.deepEqual(decisions, original);
});

test('a known objective trigger may explain an unbound state without becoming a memory use', async () => {
  const f = fixture();
  const unbound = f.decision('control/lookAround', { intent: 'explore',
    state: { ...f.held, activity: 'orient', triggerCueRefs: [f.objectiveRef] } });
  const decisions = [...f.prefix(), unbound, f.quit()], original = structuredClone(decisions);
  const result = await f.compile(decisions), row = result.knowledgeAudit[2];
  assert.equal(row.basis.goalId, null);
  assert.deepEqual(row.basis.memoryUses, []);
  assert.deepEqual(row.choiceResolution.declaredBasisCueRefs, []);
  assert.deepEqual(row.choiceResolution.declaredTriggerCueRefs, [f.objectiveRef]);
  assert.deepEqual(row.taskMemory.state.openGoalIds, [f.goal.id]);
  assert.deepEqual(decisions, original);
});

test('an objective trigger does not substitute for required memory use on a goal-directed action', async () => {
  const f = fixture();
  const bound = f.decision('control/lookAround', { goalId: f.goal.id,
    state: { ...f.held, triggerCueRefs: [f.objectiveRef] } });
  await assert.rejects(f.compile([...f.prefix(), bound, f.quit()]), error => {
    assert.equal(error.validation.code, 'TASK_MEMORY');
    assert.equal(error.validation.acceptedPrefixLength, 2);
    assert.match(error.validation.errors.join('; '), /requires a name memoryUse/);
    return true;
  });
});

for (const [placement, expectedCode] of [['basis', 'KNOWLEDGE_BASIS'], ['trigger', 'ACTOR_STATE']]) {
  test(`an unread objective remains unavailable as a ${placement} reference`, async () => {
    const f = fixture();
    const unread = f.decision('control/lookAround', {
      intent: 'explore', ...(placement === 'basis' ? { cueRefs: [f.objectiveRef] } : {}),
      state: { activity: 'orient', ...(placement === 'trigger' ? { triggerCueRefs: [f.objectiveRef] } : {}) },
    });
    const quit = f.decision('control/giveUp', { intent: 'finish', state: { activity: 'finish' } });
    await assert.rejects(f.compile([unread, quit]), error => {
      assert.equal(error.validation.code, expectedCode);
      assert.equal(error.validation.acceptedPrefixLength, 0);
      assert.ok(!error.validation.knowledge.cues.some(cue => cue.cueRef === f.objectiveRef));
      return true;
    });
  });
}
