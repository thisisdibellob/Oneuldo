const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { validateWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceContracts.ts');
const { validateTrace } = require('../src/traceValidation.ts');

// Explicitly authored contract fixtures for the failures observed in the live
// pilot. These are neither model-generated persona samples nor fidelity evidence.
function fixture(near = 'fresh', { objectives = [{ productId: 'milk', quantity: 2 }],
  requestId = 'authoring-regressions-request', personaId = 'mild-intellectual-disability-adult', seed = 'authoring-regressions' } = {}) {
  const config = { seed: 'authoring-regressions', difficulty: 'exact', stockPerProduct: 5,
    objectives, environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  if (near) environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId, seed,
    timingProfile: 'original', maxActions: 100, llm: { model: 'gpt-6-luna', maxCalls: 1 } };
  const bundle = buildWholeTraceBundle(settings, requestId);
  return { settings, bundle, source: bundle.initialChoiceFrame.source, goal: bundle.worldReference.objectives[0] };
}
function decision(source, choiceId, { state = {}, intent = 'check', goalId = null, uses = [], quantity } = {}) {
  return { choiceRef: { source: structuredClone(source), choiceId, ...(quantity === undefined ? {} : { quantity }) },
    delayMs: 850, reason: '작성된 생성 계약 회귀 시험 행동',
    basis: { intent, goalId, memoryUses: uses },
    actorState: { activity: 'check', task: '현재 화면과 목표의 관계를 확인한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar', ...state } };
}
const candidate = (bundle, decisions) => ({ candidateVersion: '7', requestId: bundle.requestId, decisions });
const memoryUse = (goal, field = 'name', mode = 'remembered', value = goal.label) => ({ goalId: goal.id, field, mode, value });
const held = goal => ({ heldGoalIds: [goal.id] });
const quit = (source, goal) => decision(source, 'control/giveUp', {
  intent: 'finish', state: { activity: 'finish', ...(goal ? held(goal) : {}) },
});
const select = (source, goal, choiceId = 'control/pause') => decision(source, choiceId, {
  intent: 'task', goalId: goal.id, uses: [memoryUse(goal, 'name', 'current-display')],
  state: { ...held(goal), activity: 'shop', focusedGoalId: goal.id, taskUpdate: [{ type: 'select', goalId: goal.id }] },
});
async function rejectsAt(settings, bundle, decisions, code, prefix, message) {
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(bundle, decisions)), error => {
    assert.equal(error.validation.code, code);
    assert.equal(error.validation.acceptedPrefixLength, prefix);
    assert.match(error.validation.errors.join('; '), message);
    return true;
  });
}
function purchasePrefix(source, goal) {
  const shelf = { ...source, activeStation: 'fresh', pageIndex: 0 };
  return { shelf, decisions: [decision(source, 'control/readList'), select(source, goal, 'open/fresh'),
    decision(shelf, 'add/milk', { intent: 'task', goalId: goal.id, quantity: 1,
      uses: [memoryUse(goal), memoryUse(goal, 'requiredQuantity', 'remembered', 2)],
      state: { ...held(goal), activity: 'shop', focusedGoalId: goal.id, focusedProductId: 'milk' } })] };
}
function fromGuide(declaration, source, choiceId, goal, otherGoal) {
  const substitutions = { READ_GOAL_ID: goal.id, OTHER_OPEN_GOAL_ID: otherGoal?.id,
    CURRENT_CLEAR_GOAL_NAME: goal.label, OBSERVED_CHOSEN_PRODUCT_ID: 'milk' };
  const actual = JSON.parse(JSON.stringify(declaration, (key, value) =>
    typeof value === 'string' && Object.hasOwn(substitutions, value) ? substitutions[value] : value));
  return { ...decision(source, choiceId), ...actual };
}

test('published read/select and complete examples compile after actual observed goal substitution', async () => {
  const { settings, bundle, source, goal } = fixture();
  const examples = bundle.authoringGuide.examples;
  const read = fromGuide(examples.readListThenSelect.readList, source, 'control/readList', goal);
  const selectGoal = fromGuide(examples.readListThenSelect.nextDecision, source, 'open/fresh', goal);
  const { shelf, decisions: purchase } = purchasePrefix(source, goal);
  const complete = fromGuide(examples.completeAfterAdd.declaration, shelf, 'control/closeStation', goal);
  const decisions = [read, selectGoal, purchase[2], complete, quit(source)];
  const original = structuredClone(decisions);
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, decisions));
  assert.deepEqual(decisions, original, 'The guide declarations do not need compiler rewriting');
  assert.deepEqual(result.knowledgeAudit[0].taskMemory.state.openGoalIds, []);
  assert.deepEqual(result.knowledgeAudit[1].taskMemory.state.openGoalIds, [goal.id]);
  assert.deepEqual(result.knowledgeAudit[3].taskMemory.events.map(event => event.kind), ['purchase-observed', 'completed']);
  assert.deepEqual(result.taskMemory.openGoalIds, []);
  assert.equal(complete.actorState.activity, 'orient', 'Closing after completion no longer teaches a check label');
  assert.equal(result.personaReview.annotationReview.status, 'clear');
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});

test('published observed-product declaration keeps real focus and an independently chosen mistaken quantity', async () => {
  const { settings, bundle, source, goal } = fixture();
  const { shelf, decisions: prefix } = purchasePrefix(source, goal);
  const selection = fromGuide(bundle.authoringGuide.examples.selectObservedProduct.declaration, shelf, 'add/milk', goal);
  selection.choiceRef.quantity = 1;
  const complete = fromGuide(bundle.authoringGuide.examples.completeAfterAdd.declaration, shelf, 'control/closeStation', goal);
  const decisions = [prefix[0], prefix[1], selection, complete, quit(source)], original = structuredClone(decisions);
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, decisions));
  const purchase = result.knowledgeAudit.find(row => row.action.type === 'add');
  assert.equal(purchase.actorState.focusedGoalId, goal.id);
  assert.equal(purchase.actorState.focusedProductId, 'milk');
  assert.equal(purchase.basis.goalId, goal.id);
  assert.equal(purchase.action.quantity, 1, 'The guide must not correct the actor quantity to the goal quantity of two');
  assert.deepEqual(decisions, original);
  assert.equal(result.personaReview.annotationReview.status, 'clear');
  assert.equal(result.trace.steps.some(step => step.type === 'submitForReview'), false, 'Voluntary giveUp stays unchanged');
});

test('published candidate envelope accepts only wire keys; annotation review opts in through new guidance', async () => {
  const { settings, bundle, source } = fixture();
  assert.equal(bundle.authoringGuide.authoringVersion, '2');
  const wire = { ...bundle.authoringGuide.syntax.candidate.envelope, decisions: [quit(source)] };
  assert.deepEqual(Object.keys(wire), bundle.authoringGuide.syntax.candidate.allowedTopLevelFields);
  assert.equal(validateWholeTraceCandidate(wire, bundle.requestId).valid, true);
  assert.match(validateWholeTraceCandidate({ ...wire, inputHash: bundle.inputHash }, bundle.requestId).errors.join('; '), /Unknown candidate field/);
  const current = await compileWholeTraceCandidate(settings, bundle, wire);
  assert.equal(current.personaReview.annotationReview.status, 'clear');
  for (const legacyGuide of [undefined, { ...bundle.authoringGuide, authoringVersion: '1' }]) {
    const legacy = { ...bundle, authoringGuide: legacyGuide };
    const result = await compileWholeTraceCandidate(settings, legacy, wire);
    assert.equal(result.personaReview.annotationReview, undefined, 'Old bundles retain historical review semantics');
  }
});

test('published completion example retains the other actually open task', async () => {
  const { settings, bundle, source, goal } = fixture('fresh', {
    objectives: [{ productId: 'milk', quantity: 2 }, { productId: 'apple', quantity: 1 }],
    personaId: 'careful-checker',
  });
  const otherGoal = bundle.worldReference.objectives[1];
  const examples = bundle.authoringGuide.examples;
  const read = fromGuide(examples.readListThenSelect.readList, source, 'control/readList', goal);
  const selectBoth = fromGuide(examples.readListThenSelect.nextDecision, source, 'open/fresh', goal);
  selectBoth.actorState.taskUpdate.push({ type: 'select', goalId: otherGoal.id });
  selectBoth.actorState.heldGoalIds.push(otherGoal.id);
  const { shelf, decisions: purchase } = purchasePrefix(source, goal);
  purchase[2].actorState.heldGoalIds.push(otherGoal.id);
  const complete = fromGuide(examples.completeWithOtherTask.declaration, shelf, 'control/closeStation', goal, otherGoal);
  const result = await compileWholeTraceCandidate(settings, bundle,
    candidate(bundle, [read, selectBoth, purchase[2], complete, quit(source, otherGoal)]));
  assert.deepEqual(result.knowledgeAudit[2].taskMemory.state.openGoalIds, [goal.id, otherGoal.id]);
  assert.deepEqual(result.knowledgeAudit[3].taskMemory.state.openGoalIds, [otherGoal.id]);
  assert.deepEqual(result.taskMemory.openGoalIds, [otherGoal.id]);
});

test('every published syntax enum and task update example is accepted by the candidate schema', () => {
  const { bundle, source, goal } = fixture();
  const syntax = bundle.authoringGuide.syntax;
  for (const [section, key] of [['actorState', 'activity'], ['basis', 'intent'], ['actorState', 'orientation']]) {
    assert.ok(syntax[key].length > 0);
    for (const value of syntax[key]) {
      const wire = quit(source);
      wire[section][key] = value;
      const validation = validateWholeTraceCandidate(candidate(bundle, [wire]), bundle.requestId);
      assert.equal(validation.valid, true, `${section}.${key}=${value}: ${validation.errors.join('; ')}`);
    }
  }
  for (const updates of syntax.taskUpdate.examples) {
    assert.ok(Array.isArray(updates));
    const wire = quit(source);
    wire.actorState.taskUpdate = updates.map(update => ({ ...update, goalId: goal.id }));
    const validation = validateWholeTraceCandidate(candidate(bundle, [wire]), bundle.requestId);
    assert.equal(validation.valid, true, validation.errors.join('; '));
  }
});

test('guide identity follows each request, condition, persona and seed without reusing another bundle identity', () => {
  const low = fixture('fresh', { requestId: 'guide-low', objectives: [{ productId: 'milk', quantity: 1 }] }).bundle;
  const high = fixture('fresh', { requestId: 'guide-high', seed: 'guide-high-seed', personaId: 'careful-checker',
    objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 }, { productId: 'water', quantity: 2 },
      { productId: 'banana', quantity: 1 }, { productId: 'eggs', quantity: 1 }] }).bundle;
  for (const bundle of [low, high]) {
    assert.deepEqual(bundle.authoringGuide.identity, { requestId: bundle.requestId, inputHash: bundle.inputHash,
      snapshotId: bundle.snapshotId, personaId: bundle.persona.id, personaVersion: bundle.persona.version,
      seed: bundle.seed, candidateVersion: bundle.candidateVersion });
  }
  assert.notEqual(low.inputHash, high.inputHash);
  assert.notEqual(low.snapshotId, high.snapshotId);
  assert.notDeepEqual(low.worldReference.objectives, high.worldReference.objectives);
  assert.notDeepEqual(low.authoringGuide.identity, high.authoringGuide.identity);
});

test('authoring uses array task updates and distinguishes explore intent from orient activity', async () => {
  const { settings, bundle, source, goal } = fixture();
  const wrongUpdate = select(source, goal);
  wrongUpdate.actorState.taskUpdate = { type: 'select', goalId: goal.id };
  await rejectsAt(settings, bundle, [decision(source, 'control/readList'), wrongUpdate, quit(source, goal)],
    'CANDIDATE_SCHEMA', undefined, /taskUpdate.*array/i);
  const wrongActivity = decision(source, 'control/pause', { intent: 'explore', state: { activity: 'explore' } });
  await rejectsAt(settings, bundle, [wrongActivity, quit(source)], 'CANDIDATE_SCHEMA', undefined, /actorState.activity/);
  const correct = decision(source, 'control/pause', { intent: 'explore', state: { activity: 'orient' } });
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, [correct, quit(source)]));
  assert.equal(result.knowledgeAudit[0].basis.intent, 'explore');
  assert.equal(result.knowledgeAudit[0].actorState.activity, 'orient');
});

test('a list read exposes goals only to the next decision, which may select a goal', async () => {
  const { settings, bundle, source, goal } = fixture();
  await rejectsAt(settings, bundle, [select(source, goal, 'control/readList'), quit(source, goal)],
    'ACTOR_STATE', 0, /unread objective/);
  const decisions = [decision(source, 'control/readList'), select(source, goal), quit(source, goal)];
  const original = structuredClone(decisions);
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, decisions));
  assert.deepEqual(decisions, original, 'The compiler does not move the authored selection to another action');
  assert.deepEqual(result.knowledgeAudit[0].taskMemory.state.openGoalIds, []);
  assert.equal(result.knowledgeAudit[1].before.result.actionType, 'readList');
  assert.deepEqual(result.knowledgeAudit[1].taskMemory.state.openGoalIds, [goal.id]);
});

test('a goal from another condition cannot be selected in the current bundle', async () => {
  const { settings, bundle, source, goal } = fixture();
  const foreignGoal = { ...goal, id: 'objective-3' };
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(bundle,
    [decision(source, 'control/readList'), select(source, foreignGoal), quit(source, foreignGoal)])), error => {
    assert.equal(error.validation.code, 'CANDIDATE_SCHEMA');
    assert.equal(error.validation.acceptedPrefixLength, undefined);
    assert.match(error.validation.errors.join('; '), /objective-3/);
    return true;
  });
});

test('an accepted walk requires its destination as the next source location', async () => {
  const { settings, bundle, source } = fixture(null);
  const walk = bundle.initialChoiceFrame.availableChoices.find(choice => choice.action.type === 'walk');
  assert.ok(walk, 'This fixture exposes a real nearby walk choice');
  const first = decision(source, walk.choiceId, { intent: 'explore', state: { activity: 'orient' } });
  const arrived = { ...source, location: walk.action.waypointId };
  await rejectsAt(settings, bundle, [first, decision(source, 'control/pause'), quit(arrived)],
    'CHOICE_SOURCE_MISMATCH', 1, /source/i);
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle,
    [first, decision(arrived, 'control/pause'), quit(arrived)]));
  assert.deepEqual(result.knowledgeAudit.map(row => row.choiceResolution.source.location),
    [source.location, arrived.location, arrived.location]);
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});

test('an open shelf is page zero, not a null page, on the following decision', async () => {
  const { settings, bundle, source, goal } = fixture();
  const shelf = { ...source, activeStation: 'fresh', pageIndex: 0 };
  const prefix = [decision(source, 'control/readList'), select(source, goal, 'open/fresh')];
  await rejectsAt(settings, bundle, [...prefix,
    decision({ ...shelf, pageIndex: null }, 'control/closeStation', { state: held(goal) }), quit(source, goal)],
  'CHOICE_SOURCE_MISMATCH', 2, /source/i);
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle,
    [...prefix, decision(shelf, 'control/closeStation', { state: held(goal) }), quit(source, goal)]));
  assert.equal(result.knowledgeAudit[2].choiceResolution.source.pageIndex, 0);
  assert.equal(result.knowledgeAudit[3].choiceResolution.source.pageIndex, null);
});

test('completion releases the goal from held state, goal binding and focus in that same decision', async () => {
  const { settings, bundle, source, goal } = fixture();
  const { shelf, decisions: prefix } = purchasePrefix(source, goal);
  const complete = decision(shelf, 'control/closeStation', { state: { taskUpdate: [{ type: 'complete', goalId: goal.id }] } });
  const heldCompletion = structuredClone(complete);
  heldCompletion.actorState.heldGoalIds = [goal.id];
  const boundCompletion = structuredClone(complete);
  boundCompletion.basis.goalId = goal.id;
  boundCompletion.basis.memoryUses = [memoryUse(goal)];
  const focusedCompletion = structuredClone(complete);
  focusedCompletion.actorState.focusedGoalId = goal.id;
  for (const [invalid, code, message] of [[heldCompletion, 'TASK_MEMORY', /heldGoalIds contains unselected task/],
    [boundCompletion, 'TASK_MEMORY', /basis.goalId.*must refer to an open task/],
    [focusedCompletion, 'ACTOR_STATE', /focusedGoalId/]]) {
    await rejectsAt(settings, bundle, [...prefix, invalid, quit(source)], code, 3, message);
  }
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, [...prefix, complete, quit(source)]));
  assert.deepEqual(result.knowledgeAudit[3].taskMemory.events.map(event => event.kind), ['purchase-observed', 'completed']);
  assert.deepEqual(result.taskMemory.openGoalIds, []);
});

test('completion can use an earlier observed add without changing the chosen quantity or ending', async () => {
  const { settings, bundle, source, goal } = fixture();
  const { shelf, decisions: prefix } = purchasePrefix(source, goal);
  const observePurchase = decision(shelf, 'control/pause', { state: held(goal) });
  const complete = decision(shelf, 'control/closeStation', { state: { taskUpdate: [{ type: 'complete', goalId: goal.id }] } });
  const decisions = [...prefix, observePurchase, complete, quit(source)];
  const original = structuredClone(decisions);
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, decisions));
  assert.deepEqual(decisions, original, 'Authored product, quantity, memory and ending remain unchanged');
  assert.deepEqual(result.knowledgeAudit[3].taskMemory.events.map(event => event.kind), ['purchase-observed']);
  assert.equal(result.knowledgeAudit[4].before.result.actionType, 'pause');
  assert.deepEqual(result.knowledgeAudit[4].taskMemory.events.map(event => event.kind), ['completed']);
  assert.deepEqual(result.knowledgeAudit.filter(row => row.action.type === 'add').map(row => row.action),
    [{ type: 'add', productId: 'milk', quantity: 1 }], 'The required quantity of two does not correct the actor quantity of one');
  assert.equal(result.knowledgeAudit.at(-1).action.type, 'giveUp');
  assert.equal(result.trace.steps.some(step => step.type === 'submitForReview'), false);
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});

test('voluntary giveUp remains legal before shopping and with an unfinished selected task', async () => {
  const { settings, bundle, source, goal } = fixture();
  for (const decisions of [[quit(source)], [decision(source, 'control/readList'), select(source, goal), quit(source, goal)]]) {
    const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, decisions));
    assert.equal(result.acceptedActions, decisions.length);
    assert.equal(result.knowledgeAudit.at(-1).action.type, 'giveUp');
    assert.equal(result.knowledgeAudit.some(row => row.action.type === 'add'), false, 'No shopping quota fills the cart');
    assert.deepEqual(result.taskMemory.openGoalIds, decisions.length === 1 ? [] : [goal.id]);
  }
});
