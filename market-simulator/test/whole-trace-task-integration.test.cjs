const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { validateWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceContracts.ts');
const { WholeTraceSession } = require('../src/wholeTrace/wholeTraceSession.ts');
const { validateTrace } = require('../src/traceValidation.ts');

// Authored integration scenarios exercise the actual shared game and compiler.
// These fixtures are not model-generated persona samples or clinical evidence.
function fixture(near = 'fresh') {
  const config = { seed: 'task-integration', difficulty: 'exact', stockPerProduct: 5,
    objectives: [{ productId: 'milk', quantity: 2 }], environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'task-integration',
    timingProfile: 'original', maxActions: 100, llm: { model: 'gpt-6-luna', maxCalls: 1 } };
  return { settings, bundle: buildWholeTraceBundle(settings, 'task-integration-request') };
}
function d(source, choiceId, options = {}) {
  const { state = {}, intent = 'check', goalId = null, uses = [], quantity, delayMs = 850 } = options;
  return { choiceRef: { source: structuredClone(source), choiceId, ...(quantity === undefined ? {} : { quantity }) },
    delayMs, reason: '현재 화면과 유지 중인 목표의 관계를 확인하는 작성된 시험 행동',
    basis: { intent, goalId, memoryUses: uses },
    actorState: { activity: 'check', task: '현재 관찰과 목표 기억을 확인한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar', ...state } };
}
const plan = (bundle, decisions, candidateVersion = '7') => ({ candidateVersion, requestId: bundle.requestId, decisions });
const use = (goal, field = 'name', mode = 'remembered', value = goal.label) => ({ goalId: goal.id, field, mode, value });
const hold = (goal, overrides = {}) => ({ heldGoalIds: [goal.id], ...overrides });
const quit = (source, goal) => d(source, 'control/giveUp', { intent: 'finish', state: { activity: 'finish', ...(goal ? hold(goal) : {}) } });
function select(source, goal, choiceId = 'control/pause') {
  return d(source, choiceId, { intent: 'task', goalId: goal.id, uses: [use(goal, 'name', 'current-display')],
    state: hold(goal, { activity: 'shop', focusedGoalId: goal.id, taskUpdate: [{ type: 'select', goalId: goal.id }] }) });
}
const legacy = wire => {
  const copy = structuredClone(wire);
  delete copy.basis.goalId;
  delete copy.actorState.taskUpdate;
  return copy;
};

test('v7 default declares separate task contract while explicit v6 remains unchanged', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  assert.equal(bundle.bundleVersion, '8');
  assert.equal(bundle.candidateVersion, '7');
  assert.deepEqual(bundle.supportedCandidateVersions, ['7', '6', '5', '4', '3']);
  assert.equal(bundle.actorState.taskMemory.taskStateVersion, 'persistent-task-v1');
  assert.deepEqual(bundle.actorState.taskMemory.openGoalIds, []);
  assert.ok(bundle.sourceFiles.some(file => file.path.endsWith('wholeTraceTaskMemory.ts')));
  const oldWire = plan(bundle, [legacy(d(source, 'control/readList')), legacy(d(source, 'control/pause')), legacy(quit(source))], '6');
  const result = await compileWholeTraceCandidate(settings, bundle, oldWire);
  assert.equal(result.acceptedActions, 3, 'legacy zero-held behavior remains compatible only in explicit legacy v6');
  assert.equal(result.taskMemory, undefined);
  assert.ok(result.knowledgeAudit.every(row => row.cognition.valid && row.taskMemory === undefined));
  const goalField = structuredClone(oldWire); goalField.decisions[1].basis.goalId = null;
  const taskField = structuredClone(oldWire); taskField.decisions[1].actorState.taskUpdate = [];
  assert.equal(validateWholeTraceCandidate(goalField, bundle.requestId).valid, false);
  assert.equal(validateWholeTraceCandidate(taskField, bundle.requestId).valid, false);
});

test('original zero-held pattern rejects after the actual list read at accepted prefix 1', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const wire = plan(bundle, [d(source, 'control/readList'), d(source, 'control/pause', { intent: 'explore', state: { activity: 'orient' } }), quit(source)]);
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, wire), error => {
    assert.equal(error.validation.code, 'TASK_MEMORY');
    assert.equal(error.validation.acceptedPrefixLength, 1);
    assert.equal(error.validation.before.result.actionType, 'readList');
    assert.ok(error.validation.before.readObjectives.length);
    assert.match(error.validation.errors.join('; '), /select at least one/);
    assert.deepEqual(error.validation.taskMemory.openGoalIds, []);
    return true;
  });
});

test('pending goal cannot be erased by attention change or an empty held declaration', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const wire = plan(bundle, [d(source, 'control/readList'), select(source, goal),
    d(source, 'control/pause', { intent: 'interest', state: { activity: 'interest' } }), quit(source)]);
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, wire), error => {
    assert.equal(error.validation.code, 'TASK_MEMORY');
    assert.equal(error.validation.acceptedPrefixLength, 2);
    assert.deepEqual(error.validation.taskMemory.openGoalIds, [goal.id]);
    assert.equal(error.validation.workingMemory.activeGoals[0].goalId, goal.id);
    assert.match(error.validation.errors.join('; '), /must stay in heldGoalIds/);
    return true;
  });
});

test('goal-bound check and movement still need the declared goal name with focus null', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const nav = bundle.choiceCatalog.navigation.find(item => item.navigationStateId === source.navigationStateId);
  const visibleWalk = nav.locations.find(item => item.location === 'start').visibleWalkChoices[0].choiceId;
  for (const choiceId of ['control/pause', visibleWalk]) {
    const bad = d(source, choiceId, { intent: 'check', goalId: goal.id, state: hold(goal) });
    await assert.rejects(compileWholeTraceCandidate(settings, bundle,
      plan(bundle, [d(source, 'control/readList'), select(source, goal), bad, quit(source, goal)])), error => {
      assert.equal(error.validation.code, 'TASK_MEMORY');
      assert.equal(error.validation.acceptedPrefixLength, 2);
      assert.match(error.validation.errors.join('; '), /name memoryUse/);
      return true;
    });
  }
});

test('pending goal keeps contextual memory load during interest; actual read recovers with focus null', async () => {
  const { settings, bundle } = fixture('meal'), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const uncertain = hold(goal, { focusedGoalId: null, uncertainGoalIds: [goal.id] });
  const wire = plan(bundle, [d(source, 'control/readList'), select(source, goal),
    d(source, 'control/pause', { intent: 'interest', delayMs: 60000, state: { ...uncertain, activity: 'interest' } }),
    d(source, 'control/readList', { intent: 'recover', goalId: goal.id, state: { ...uncertain, activity: 'recover' } }),
    d(source, 'control/pause', { intent: 'check', goalId: goal.id,
      uses: [use(goal, 'name', 'current-display'), use(goal, 'requiredQuantity', 'current-display', 2)], state: hold(goal) }),
    quit(source, goal)]);
  const original = structuredClone(wire), result = await compileWholeTraceCandidate(settings, bundle, wire);
  assert.deepEqual(wire, original, 'compiled cognition does not inject or rewrite model decisions');
  const diverted = result.knowledgeAudit[2], recovered = result.knowledgeAudit[4];
  assert.deepEqual(diverted.taskMemory.state.openGoalIds, [goal.id]);
  assert.equal(diverted.actorState.focusedGoalId, null);
  assert.equal(diverted.cognition.state.activeGoals[0].fields.requiredQuantity.status, 'unavailable');
  assert.equal(diverted.cognition.state.activeGoals[0].fields.requiredQuantity.value, null);
  assert.equal(result.knowledgeAudit[3].action.type, 'readList');
  assert.equal(result.knowledgeAudit[3].actorState.focusedGoalId, null);
  assert.equal(recovered.before.result.actionType, 'readList');
  assert.equal(recovered.cognition.state.activeGoals[0].fields.requiredQuantity.status, 'clear');
  assert.equal(recovered.cognition.state.activeGoals[0].fields.requiredQuantity.value, 2);
  assert.ok(result.knowledgeAudit.every(row => row.taskMemory.valid && row.cognition.valid));
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});

test('legal wrong quantity completes only after the accepted goal-bound add and remains uncorrected', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const shelf = { ...source, activeStation: 'fresh', pageIndex: 0 };
  const wire = plan(bundle, [d(source, 'control/readList'), select(source, goal, 'open/fresh'),
    d(shelf, 'add/milk', { intent: 'task', goalId: goal.id, quantity: 1,
      uses: [use(goal), use(goal, 'requiredQuantity', 'remembered', 2)], state: hold(goal, { activity: 'shop', focusedGoalId: goal.id, focusedProductId: 'milk' }) }),
    d(shelf, 'control/closeStation', { state: { taskUpdate: [{ type: 'complete', goalId: goal.id }] } }), quit(source)]);
  const result = await compileWholeTraceCandidate(settings, bundle, wire);
  const purchase = result.knowledgeAudit[2], completion = result.knowledgeAudit[3];
  assert.equal(purchase.action.quantity, 1);
  assert.equal(purchase.basis.memoryUses.find(item => item.field === 'requiredQuantity').value, 2);
  assert.equal(completion.before.result.accepted, true);
  assert.equal(completion.before.result.actionType, 'add');
  assert.deepEqual(completion.taskMemory.events.map(event => event.kind), ['purchase-observed', 'completed']);
  assert.deepEqual(result.taskMemory.openGoalIds, []);
  assert.equal(result.knowledgeAudit.at(-1).action.type, 'giveUp');
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});

test('real checkout and submit are allowed with a pending unbought goal', async () => {
  const { settings, bundle } = fixture('checkout'), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const checked = { ...source, phase: 'checkout', activeStation: 'checkout', view: 'world', pageIndex: null };
  const wire = plan(bundle, [d(source, 'control/readList'), select(source, goal),
    d(source, 'checkout/checkout', { intent: 'finish', state: hold(goal, { activity: 'finish' }) }),
    d(checked, 'control/submit', { intent: 'finish', state: hold(goal, { activity: 'finish' }) })]);
  const result = await compileWholeTraceCandidate(settings, bundle, wire);
  assert.equal(result.acceptedActions, 4);
  assert.deepEqual(result.taskMemory.openGoalIds, [goal.id]);
  assert.deepEqual(result.trace.steps.slice(-3).map(step => step.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});

test('completed-list recheck permits cart review and movement without reopening or correcting the purchase', async () => {
  for (const nextAction of ['viewCart', 'walkToAnchor']) {
    const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
    const shelf = { ...source, activeStation: 'fresh', pageIndex: 0 };
    const prefix = [d(source, 'control/readList'), select(source, goal, 'open/fresh'),
      d(shelf, 'add/milk', { intent: 'task', goalId: goal.id, quantity: 1,
        uses: [use(goal), use(goal, 'requiredQuantity', 'remembered', 2)],
        state: hold(goal, { activity: 'shop', focusedGoalId: goal.id, focusedProductId: 'milk' }) }),
      d(shelf, 'control/closeStation', { state: { taskUpdate: [{ type: 'complete', goalId: goal.id }] } }),
      d(source, 'control/readList')];
    let suffix;
    if (nextAction === 'viewCart') {
      suffix = [d(source, 'control/viewCart'), d({ ...source, view: 'cart' }, 'control/closeView'), quit(source)];
    } else {
      const nav = bundle.choiceCatalog.navigation.find(item => item.navigationStateId === source.navigationStateId);
      const choiceId = nav.locations.find(item => item.location === 'start').visibleWalkChoices[0].choiceId;
      suffix = [d(source, choiceId), quit({ ...source, location: choiceId.slice('walk/'.length) })];
    }
    const wire = plan(bundle, [...prefix, ...suffix]), original = structuredClone(wire);
    const result = await compileWholeTraceCandidate(settings, bundle, wire);
    assert.deepEqual(wire, original, 'the compiler does not inject selections or change authored behavior');
    const reviewed = result.knowledgeAudit[5];
    assert.equal(reviewed.before.result.actionType, 'readList');
    assert.equal(reviewed.action.type, nextAction);
    assert.deepEqual(reviewed.taskMemory.state.completedGoalIds, [goal.id]);
    assert.deepEqual(reviewed.taskMemory.state.openGoalIds, []);
    assert.deepEqual(reviewed.taskMemory.events, []);
    assert.deepEqual(reviewed.cognition.state.activeGoals, [], 'completion history never restores working-memory goal details');
    assert.equal(result.knowledgeAudit[2].action.quantity, 1, 'the legal under-purchase remains unchanged');
    assert.equal(result.acceptedActions, wire.decisions.length);
    assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
  }
});

test('v7 suffix repair retains committed task and cognition, never the rejected task proposal', async t => {
  const { settings } = fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-task-session-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const session = new WholeTraceSession({ ...settings, outputPath: path.join(directory, 'trace.json'), maxRepairs: 1 });
  const { bundle } = session.prepare(), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const prefix = [d(source, 'control/readList'), select(source, goal)];
  const rejected = d(source, 'control/pause', { intent: 'rest', state: hold(goal, {
    activity: 'rest', taskUpdate: [{ type: 'abandon', goalId: goal.id }] }) });
  const invalid = await session.submit(plan(bundle, [...prefix, rejected, quit(source, goal)]));
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.validation.code, 'TASK_MEMORY');
  assert.equal(invalid.validation.acceptedPrefixLength, 2);
  assert.equal(invalid.taskContract, 'persistent-task-memory-v1');
  assert.deepEqual(invalid.validation.validPrefix, prefix);
  assert.deepEqual(invalid.repairContext.taskMemory.openGoalIds, [goal.id]);
  assert.deepEqual(invalid.repairContext.rejectedTaskMemoryProposal.openGoalIds, []);
  assert.equal(invalid.repairContext.workingMemory.activeGoals[0].fields.requiredQuantity.value, 2);
  assert.equal(invalid.repairContext.workingMemory.activeGoals[0].fields.requiredQuantity.status, 'clear');
  const repaired = await session.submitRepair({ repairVersion: '1', requestId: bundle.requestId, baseAttempt: 1,
    fromDecisionIndex: 2, candidateVersion: '7', decisions: [quit(source, goal)] });
  assert.equal(repaired.status, 'complete', JSON.stringify(repaired.validation ?? repaired.error));
  assert.equal(repaired.appExecuted, false);
  assert.equal(repaired.taskContract, 'persistent-task-memory-v1');
  assert.equal(repaired.memoryContract, 'working-memory-v1');
  const audit = JSON.parse(fs.readFileSync(repaired.knowledgeAuditPath, 'utf8'));
  assert.equal(audit.auditVersion, '6');
  assert.equal(audit.candidateVersion, '7');
  assert.equal(audit.taskStateVersion, 'persistent-task-v1');
  assert.equal(audit.taskContract, 'persistent-task-memory-v1');
  assert.equal(audit.decisions.length, 3);
  assert.ok(audit.decisions.every(row => row.taskMemory.valid && row.cognition.valid));
  assert.deepEqual(audit.decisions.at(-1).taskMemory.state.openGoalIds, [goal.id]);
  assert.equal(audit.decisions.at(-1).cognition.state.activeGoals[0].fields.requiredQuantity.value, 2);
});

test('initial prepared task memory cannot be changed while retaining the original prepared hash', async () => {
  const { settings, bundle } = fixture();
  const changed = structuredClone(bundle);
  changed.actorState.taskMemory.openGoalIds = [bundle.worldReference.objectives[0].id];
  await assert.rejects(compileWholeTraceCandidate(settings, changed, plan(bundle, [quit(bundle.initialChoiceFrame.source)])),
    error => error.validation.code === 'PREPARED_INPUT_MISMATCH');
});

// Re-submitting a full candidate cannot silently downgrade the memory contract.
test('full resubmission cannot downgrade a rejected v7 candidate to legacy guards', async t => {
  for (const [version, malformedArray] of [['3', false], ['6', false], ['6', true]]) {
    const { settings } = fixture();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'task-version-repair-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const session = new WholeTraceSession({ ...settings, maxRepairs: 1, outputPath: path.join(directory, 'trace.json') });
    const { bundle } = session.prepare();
    const wire = quit(bundle.initialChoiceFrame.source);
    const bad = plan(bundle, [wire]);
    if (malformedArray) bad.decisions = []; else delete bad.decisions[0].basis.memoryUses;
    const failed = await session.submit(bad);
    assert.equal(failed.status, 'invalid');
    let lowered;
    if (version === '6') lowered = plan(bundle, [legacy(quit(bundle.initialChoiceFrame.source))], '6');
    else lowered = { candidateVersion: '3', requestId: bundle.requestId, decisions: [{
      action: { type: 'giveUp' }, delayMs: 850, reason: '작성된 버전 호환 회귀 시험',
      basis: { intent: 'finish', cueRefs: ['control:giveUp'] },
      actorState: { ...wire.actorState, triggerCueRefs: ['control:giveUp'] } }] };
    const result = await session.submit(lowered);
    assert.equal(result.status, 'invalid');
    assert.equal(result.validation.code, 'REPAIR_CHANGED_VERSION');
    assert.equal(fs.existsSync(path.join(directory, 'trace.json')), false);
  }
});

test('empty v7 candidate can be repaired in v7 when no original terminal intent existed', async t => {
  for (const repairKind of ['full', 'suffix']) {
    const { settings } = fixture();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'task-empty-repair-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const session = new WholeTraceSession({ ...settings, maxRepairs: 1, outputPath: path.join(directory, 'trace.json') });
    const { bundle } = session.prepare();
    const failed = await session.submit(plan(bundle, []));
    assert.equal(failed.status, 'invalid');
    assert.equal(failed.canRepair, true);
    const decisions = [quit(bundle.initialChoiceFrame.source)];
    const result = repairKind === 'full' ? await session.submit(plan(bundle, decisions))
      : await session.submitRepair({ repairVersion: '1', requestId: bundle.requestId,
        baseAttempt: 1, fromDecisionIndex: 0, candidateVersion: '7', decisions });
    assert.equal(result.status, 'complete');
    assert.equal(result.candidateVersion, '7');
    assert.equal(result.taskContract, 'persistent-task-memory-v1');
    const audit = JSON.parse(fs.readFileSync(result.knowledgeAuditPath, 'utf8'));
    assert.ok(audit.decisions.every(row => row.taskMemory && row.cognition));
  }
});
