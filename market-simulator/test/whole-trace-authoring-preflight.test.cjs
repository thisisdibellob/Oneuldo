const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { createWholeTraceSourceAuthoringCursor } = require('../src/wholeTrace/wholeTraceAuthoringSource.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');

// Minimal, manually authored versions of the eight failure invariants. Tests
// never load/rewrite pilot files or call an AI actor; compiler checks are in-memory.
function fixture() {
  const config = { seed: 'authoring-preflight', stockPerProduct: 5,
    objectives: [{ productId: 'milk', quantity: 2 }], environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'fresh', environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'authoring-preflight',
    maxActions: 100, maxRepairs: 0, timingProfile: 'original' };
  const bundle = buildWholeTraceBundle(settings, 'authoring-preflight-request');
  return { bundle, settings, goal: bundle.worldReference.objectives[0] };
}
function draft(choiceId, { held = [], taskUpdate, goal = null, intent = 'explore', uses = [], quantity,
  focusedGoalId = null, focusedProductId = null } = {}) {
  return { choiceRef: { choiceId, ...(quantity === undefined ? {} : { quantity }) }, delayMs: 850,
    reason: '명시적으로 작성한 행동과 선언을 그대로 검사한다',
    basis: { intent, goalId: goal?.id ?? null, memoryUses: uses },
    actorState: { activity: intent === 'task' ? 'shop' : intent === 'recover' ? 'recover' : intent === 'finish' ? 'finish' : 'orient',
      task: '작성자가 선택한 행동', heldGoalIds: held, uncertainGoalIds: [], focusedGoalId, focusedProductId,
      orientation: 'unfamiliar', ...(taskUpdate ? { taskUpdate } : {}) } };
}
const use = (goal, field = 'name', mode = 'remembered', value = goal.label) => ({ goalId: goal.id, field, mode, value });
const select = (goal, choiceId = 'open/fresh') => draft(choiceId, { goal, held: [goal.id], intent: 'task',
  uses: [use(goal, 'name', 'current-display')], focusedGoalId: goal.id,
  taskUpdate: [{ type: 'select', goalId: goal.id }] });
function rejection(cursor, input, code, paths = []) {
  const before = cursor.snapshot(), menu = cursor.menu(), original = structuredClone(input);
  let failure;
  assert.throws(() => cursor.append(input), error => {
    failure = error; assert.equal(error.code, code);
    for (const path of paths) assert.ok(error.issues?.some(issue => issue.path === path), JSON.stringify(error.issues));
    return true;
  });
  assert.deepEqual(input, original, 'No action, quantity, annotation or field is corrected');
  assert.deepEqual(cursor.snapshot(), before, 'Rejected input cannot advance source or decision count');
  assert.deepEqual(cursor.menu(), menu, 'Rejected input cannot change available controls');
  assert.deepEqual(failure.context, menu, 'Diagnostics describe the unchanged pre-action menu');
  return failure;
}
function readAndSelect(bundle, goal, choiceId = 'open/fresh') {
  const cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('control/readList', { intent: 'check' }));
  cursor.append(select(goal, choiceId));
  return cursor;
}
async function compilerRejects(settings, bundle, candidate, code, index, pattern) {
  const original = structuredClone(candidate);
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate), error => {
    assert.equal(error.validation.code, code);
    assert.equal(error.validation.failedDecisionIndex, index);
    if (pattern) assert.match(error.validation.errors.join('; '), pattern);
    return true;
  });
  assert.deepEqual(candidate, original, 'Final rejection cannot repair the candidate');
}

test('new bundles fingerprint the authoring-only checker and revision without changing wire contracts', () => {
  const { bundle } = fixture();
  const entry = bundle.sourceFiles.find(file => file.path === 'src/wholeTrace/wholeTraceAuthoringTasks.ts');
  assert.ok(entry, 'The new authored-task check is part of fresh bundle provenance');
  assert.equal(entry.sha256, createHash('sha256').update(readFileSync(resolve(__dirname, '../src/wholeTrace/wholeTraceAuthoringTasks.ts'))).digest('hex'));
  assert.equal(bundle.authoringGuide.guidanceRevision, 'declaration-preflight-v3');
  assert.equal(bundle.authoringGuide.sourceAuthoring.revision, 'source-task-preflight-v3');
  assert.equal(bundle.authoringGuide.authoringVersion, '2');
  assert.equal(bundle.bundleVersion, '8');
  assert.equal(bundle.candidateVersion, '7');
  assert.equal(bundle.policyVersion, 'whole-trace-v3');
});

for (const [slot, fields] of [[1, ['name']], [9, ['name', 'requiredQuantity']]]) {
  test(`slot ${slot}: each missing memoryUses.goalId is diagnosed exactly and never inherited`, () => {
    const { bundle, goal } = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
    cursor.append(draft('control/readList'));
    const invalid = select(goal, 'control/pause');
    invalid.basis.memoryUses = fields.map(field => ({ field, mode: 'current-display', value: field === 'name' ? goal.label : 2 }));
    const paths = fields.map((_, i) => `basis.memoryUses[${i}].goalId`);
    const error = rejection(cursor, invalid, 'AUTHORING_SCHEMA', paths);
    assert.deepEqual(error.issues.map(issue => issue.path), paths);
    assert.ok(invalid.basis.memoryUses.every(item => !Object.hasOwn(item, 'goalId')));
    cursor.append(select(goal, 'control/pause'));
    assert.equal(cursor.snapshot().decisionCount, 2, 'Rejected syntax did not consume the previous list exposure');
  });
}

test('slot 03: top-level taskUpdate is rejected at its exact path and never relocated', () => {
  const { bundle, goal } = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('control/readList'));
  const invalid = draft('control/pause'); invalid.taskUpdate = [{ type: 'select', goalId: goal.id }];
  const error = rejection(cursor, invalid, 'AUTHORING_SCHEMA', ['decision.taskUpdate']);
  assert.match(error.message, /actorState\.taskUpdate/);
  assert.equal(Object.hasOwn(invalid.actorState, 'taskUpdate'), false);
  assert.deepEqual(invalid.taskUpdate, [{ type: 'select', goalId: goal.id }]);
});

for (const slot of [4, 7]) {
  test(`slot ${slot}: a list read followed by no task selection fails during authorship`, () => {
    const { bundle } = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
    cursor.append(draft('control/readList'));
    const nextWalk = cursor.menu().choiceIds.find(id => id.startsWith('walk/'));
    assert.ok(nextWalk);
    const error = rejection(cursor, draft(nextWalk), 'AUTHORING_TASK_DECLARATION', ['actorState.taskUpdate']);
    assert.ok(error.issues.some(issue => issue.rule === 'selection_after_list'));
  });
}

test('slot 05: select and empty heldGoalIds fail before lookAround without selecting for the actor', () => {
  const { bundle, goal } = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('control/readList'));
  const invalid = draft('control/lookAround', { taskUpdate: [{ type: 'select', goalId: goal.id }] });
  const error = rejection(cursor, invalid, 'AUTHORING_TASK_DECLARATION', ['actorState.heldGoalIds']);
  assert.ok(error.issues.some(issue => issue.rule === 'held_missing_open'));
  cursor.append(draft('control/lookAround', { held: [goal.id], taskUpdate: [{ type: 'select', goalId: goal.id }] }));
  assert.equal(cursor.snapshot().decisionCount, 2, 'Failed select did not commit a hidden pending task');
});

test('slot 08: recover with null goal when closing help keeps the panel, task and draft unchanged', () => {
  const { bundle, goal } = fixture(), cursor = readAndSelect(bundle, goal, 'control/pause');
  cursor.append(draft('control/viewHelp', { held: [goal.id], intent: 'help' }));
  const invalid = draft('control/closeView', { held: [goal.id], intent: 'recover' });
  const error = rejection(cursor, invalid, 'AUTHORING_TASK_DECLARATION', ['basis.goalId']);
  assert.ok(error.issues.some(issue => issue.rule === 'bound_intent_requires_goal'));
  assert.equal(cursor.snapshot().expectedSource.view, 'help');
  assert.equal(invalid.basis.intent, 'recover'); assert.equal(invalid.basis.goalId, null);
  cursor.append(draft('control/closeView', { held: [goal.id], goal, intent: 'recover', uses: [use(goal)], focusedGoalId: goal.id }));
  assert.equal(cursor.snapshot().expectedSource.view, 'world');
});

test('slot 06: W088 to W091 remains unavailable even though the saved multi-hop path exists', () => {
  const { bundle } = fixture(), allowed = ['W077', 'W089', 'W090', 'W102'];
  for (const waypointId of [...allowed, 'W088', 'W091']) {
    if (!bundle.choiceCatalog.entries.some(entry => entry.choiceId === `walk/${waypointId}`))
      bundle.choiceCatalog.entries.push({ choiceId: `walk/${waypointId}`, label: '수동 회귀 통로', cueRefs: [],
        action: { type: 'walk', waypointId } });
  }
  for (const state of bundle.worldReference.navigation.states) {
    state.start.allowedWaypointIds = ['W088'];
    state.nodes.find(node => node.waypointId === 'W088').allowedWaypointIds = allowed;
    state.nodes.find(node => node.waypointId === 'W089').allowedWaypointIds = ['W091'];
  }
  for (const state of bundle.choiceCatalog.navigation) {
    state.locations.find(node => node.location === 'start').choiceIds = ['walk/W088'];
    const node = state.locations.find(node => node.location === 'W088');
    node.choiceIds = [...allowed.map(id => `walk/${id}`), 'open/drink'];
    node.visibleWalkChoices = [];
    state.locations.find(node => node.location === 'W089').choiceIds = ['walk/W091'];
  }
  const cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('walk/W088'));
  const error = rejection(cursor, draft('walk/W091'), 'AUTHORING_CHOICE_NOT_AVAILABLE');
  assert.deepEqual(error.context.allowedWaypointIds, allowed);
  assert.equal(error.context.expectedSource.location, 'W088');
  assert.ok(error.context.choiceIds.includes('open/drink'));
  assert.equal(cursor.snapshot().decisionCount, 1, 'No W089 hop or substitute action is inserted');
});

test('task preview success followed by quantity failure commits neither release nor stock/source changes', () => {
  const { bundle, goal } = fixture(), cursor = readAndSelect(bundle, goal);
  // Local complete is declaration-only; here its preview succeeds before stock
  // validation rejects the chosen six. Neither declaration nor quantity commits.
  const invalid = draft('add/milk', { quantity: 6, intent: 'interest', taskUpdate: [{ type: 'complete', goalId: goal.id }] });
  rejection(cursor, invalid, 'AUTHORING_CHOICE_NOT_AVAILABLE');
  cursor.append(draft('add/milk', { held: [goal.id], quantity: 5, intent: 'interest' }));
  assert.equal(cursor.snapshot().decisionCount, 3, 'Original five-stock remains available and original task stays open');
  cursor.append(draft('control/closeStation', { held: [goal.id] }));
  cursor.append(draft('control/giveUp', { held: [goal.id], intent: 'finish' }));
  const candidate = cursor.finish();
  assert.equal(candidate.decisions[2].choiceRef.quantity, 5);
  assert.deepEqual(candidate.decisions.at(-1).actorState.heldGoalIds, [goal.id]);
  assert.equal(candidate.decisions.some(d => d.actorState.taskUpdate?.some(u => u.type === 'complete')), false);
});

test('declarative completion without actual prior purchase still fails the unchanged final task validator', async () => {
  const { bundle, settings, goal } = fixture(), cursor = readAndSelect(bundle, goal);
  cursor.append(draft('control/closeStation', { taskUpdate: [{ type: 'complete', goalId: goal.id }] }));
  cursor.append(draft('control/giveUp', { intent: 'finish' }));
  await compilerRejects(settings, bundle, cursor.finish(), 'TASK_MEMORY', 2, /earlier accepted add/);
});

test('a wrong remembered value is never silently repaired and still fails final working-memory validation', async () => {
  const { bundle, settings, goal } = fixture(), cursor = readAndSelect(bundle, goal);
  const wrong = draft('add/milk', { held: [goal.id], goal, intent: 'task', quantity: 1,
    focusedGoalId: goal.id, focusedProductId: 'milk',
    uses: [use(goal, 'name', 'remembered', '실제로 기억에 없는 이름'), use(goal, 'requiredQuantity', 'remembered', 2)] });
  const original = structuredClone(wrong);
  cursor.append(wrong); cursor.append(draft('control/giveUp', { held: [goal.id], intent: 'finish' }));
  assert.deepEqual(wrong, original);
  await compilerRejects(settings, bundle, cursor.finish(), 'WORKING_MEMORY', 2, /name/);
});

test('invented knowledge remains subject to the final guard after source/task preflight', async () => {
  const { bundle, settings } = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const invalid = draft('control/giveUp', { intent: 'finish' }); invalid.basis.cueRefs = ['product:not-observed'];
  cursor.append(invalid);
  await compilerRejects(settings, bundle, cursor.finish(), 'KNOWLEDGE_BASIS', 0);
  assert.deepEqual(invalid.basis.cueRefs, ['product:not-observed']);
});

test('legal chosen product/quantity different from the target survive both preflight and final validation', async () => {
  const { bundle, settings, goal } = fixture(), cursor = readAndSelect(bundle, goal);
  assert.ok(cursor.menu().choiceIds.includes('add/eggs'));
  const chosen = draft('add/eggs', { held: [goal.id], goal, intent: 'task', quantity: 1,
    focusedGoalId: goal.id, focusedProductId: 'eggs',
    uses: [use(goal), use(goal, 'requiredQuantity', 'remembered', 2)] });
  const original = structuredClone(chosen);
  cursor.append(chosen);
  cursor.append(draft('control/closeStation', { taskUpdate: [{ type: 'complete', goalId: goal.id }] }));
  cursor.append(draft('control/giveUp', { intent: 'finish' }));
  const candidate = cursor.finish(), saved = structuredClone(candidate);
  const result = await compileWholeTraceCandidate(settings, bundle, candidate);
  assert.equal(result.acceptedActions, 5);
  const add = result.knowledgeAudit.find(row => row.action.type === 'add');
  assert.equal(add.action.productId, 'eggs', 'Target milk cannot replace the actor-chosen eggs');
  assert.equal(add.action.quantity, 1, 'Target/remembered quantity two cannot replace chosen one');
  assert.equal(add.basis.memoryUses.find(use => use.field === 'requiredQuantity').value, 2);
  assert.deepEqual(candidate, saved); assert.deepEqual(chosen, original);
  assert.equal(candidate.decisions.at(-1).choiceRef.choiceId, 'control/giveUp');
});
