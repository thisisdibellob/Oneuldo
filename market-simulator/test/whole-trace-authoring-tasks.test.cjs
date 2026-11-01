const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createWholeTraceAuthoringTaskState, previewWholeTraceAuthoringTasks } = require('../src/wholeTraceAuthoringTasks.ts');

// Hand-authored declarative fixtures only. No historical candidate is rewritten,
// no runtime/cognition engine is called, and no new AI trace is generated.
const ids = ['objective-1', 'objective-2'];
const state = initial => createWholeTraceAuthoringTaskState(initial);
const declaration = (held = [], changes = {}) => ({
  basis: { intent: 'explore', goalId: null, memoryUses: [] },
  actorState: { activity: 'orient', task: '작성자가 선택한 행동', heldGoalIds: [...held], uncertainGoalIds: [],
    focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar', ...changes },
});
const select = (held = [ids[0]], updates = [{ type: 'select', goalId: ids[0] }]) => declaration(held, { taskUpdate: updates });
function bound(held = [ids[0]], intent = 'task', goalId = ids[0]) {
  const d = declaration(held);
  d.basis = { intent, goalId, memoryUses: [{ goalId, field: 'name', mode: 'remembered', value: '작성자가 기억한 이름' }] };
  d.actorState.focusedGoalId = goalId;
  return d;
}
function preview(previous, decision, actionType = 'walk', options = {}) {
  return previewWholeTraceAuthoringTasks({ state: previous, decision, actionType,
    objectiveIds: ids, phase: 'shopping', goalMemoryCapacity: 2, ...options });
}
function accepted(previous, decision, actionType = 'walk', options = {}) {
  const p = preview(previous, decision, actionType, options);
  assert.deepEqual(p.issues, []);
  return p.nextState;
}
function read() { return accepted(state(), declaration(), 'readList'); }
function opened() { return accepted(read(), select()); }
function rejected(previous, decision, rule, actionType = 'walk', options = {}) {
  const before = structuredClone(previous), draft = structuredClone(decision);
  const result = preview(previous, decision, actionType, options);
  assert.ok(result.issues.some(issue => issue.rule === rule), JSON.stringify(result.issues));
  assert.deepEqual(result.nextState, before, 'A rejected draft cannot change symbolic lifecycle state');
  assert.deepEqual(previous, before);
  assert.deepEqual(decision, draft, 'No actor-authored declaration is repaired');
  return result;
}

test('initial task state copies IDs only, and returned preview copies cannot mutate caller state', () => {
  const initial = { knownGoalIds: [...ids], openGoalIds: [ids[0]], completedGoalIds: [ids[1]] };
  const first = state(initial);
  assert.deepEqual(Object.keys(first).sort(), ['completedGoalIds', 'kind', 'knownGoalIds', 'openGoalIds', 'previousActionType']);
  initial.openGoalIds.splice(0);
  assert.deepEqual(first.openGoalIds, [ids[0]]);
  const next = accepted(first, declaration([ids[0]]));
  next.openGoalIds.splice(0); next.knownGoalIds.splice(0); next.completedGoalIds.splice(0);
  assert.deepEqual(first.openGoalIds, [ids[0]]);
  assert.deepEqual(first.knownGoalIds, ids);
  assert.deepEqual(first.completedGoalIds, [ids[1]]);
});

test('first readList cannot select its own future display; the next decision may select a chosen goal', () => {
  rejected(state(), select(), 'select_requires_display_or_recall', 'readList');
  const afterRead = read();
  assert.deepEqual(afterRead.knownGoalIds, [], 'A draft read is not a pre-action observation');
  assert.deepEqual(afterRead.openGoalIds, []);
  const next = accepted(afterRead, select([ids[1]], [{ type: 'select', goalId: ids[1] }]));
  assert.deepEqual(next.knownGoalIds, ids);
  assert.deepEqual(next.openGoalIds, [ids[1]], 'No default/first objective is selected');
});

for (const label of ['04', '07']) {
  test(`slot ${label} regression: readList followed by empty taskUpdate is rejected before a walk`, () => {
    const result = rejected(read(), declaration(), 'selection_after_list');
    const issue = result.issues.find(issue => issue.rule === 'selection_after_list');
    assert.equal(issue.path, 'actorState.taskUpdate');
    assert.match(issue.message, /No goal is chosen automatically/);
  });
}

test('slot 05 regression: selecting a task and declaring heldGoalIds=[] is rejected atomically', () => {
  const previous = read();
  const invalid = select([]);
  const result = rejected(previous, invalid, 'held_missing_open', 'lookAround');
  assert.equal(result.issues.find(issue => issue.rule === 'held_missing_open').path, 'actorState.heldGoalIds');
  const retry = accepted(previous, select());
  assert.deepEqual(retry.openGoalIds, [ids[0]], 'Failed preview never opened the task or consumed the display');
});

test('slot 08 regression: recover on help close needs an explicit open basis goal', () => {
  const pending = accepted(opened(), declaration([ids[0]]), 'viewHelp');
  const invalid = declaration([ids[0]]); invalid.basis.intent = 'recover'; invalid.actorState.activity = 'recover';
  const result = rejected(pending, invalid, 'bound_intent_requires_goal', 'closeView');
  assert.equal(result.issues.find(issue => issue.rule === 'bound_intent_requires_goal').path, 'basis.goalId');
  assert.equal(invalid.basis.intent, 'recover'); assert.equal(invalid.basis.goalId, null);
  accepted(pending, bound([ids[0]], 'recover'), 'closeView');
});

test('a finish activity/intent does not waive selection on a non-ending action', () => {
  const d = declaration(); d.basis.intent = 'finish'; d.actorState.activity = 'finish';
  rejected(read(), d, 'selection_after_list', 'walk');
});

for (const actionType of ['checkout', 'submit', 'requestCashier', 'giveUp']) {
  test(`existing ${actionType} action exception remains allowed after a list read without task selection`, () => {
    const d = declaration(); d.basis.intent = 'finish'; d.actorState.activity = 'finish';
    const next = accepted(read(), d, actionType);
    assert.deepEqual(next.openGoalIds, []);
    assert.equal(next.previousActionType, actionType);
  });
}

test('empty list needs no selection and checkout phase keeps its existing exception boundary', () => {
  assert.deepEqual(accepted(read(), declaration(), 'pause', { objectiveIds: [] }).openGoalIds, []);
  assert.deepEqual(accepted(read(), declaration(), 'pause', { phase: 'checkout' }).openGoalIds, []);
});

test('display lasts only one drafted transition; later select needs explicit recall of a previously read ID', () => {
  const prior = accepted(opened(), declaration([ids[0]]), 'pause');
  const d = select(ids, [{ type: 'select', goalId: ids[1] }]);
  rejected(prior, d, 'select_requires_display_or_recall');
  d.actorState.memoryUpdate = [{ type: 'selfRecall', goalId: ids[1], values: { name: '틀릴 수도 있는 작성자 믿음' } }];
  const original = structuredClone(d);
  assert.deepEqual(accepted(prior, d).openGoalIds, ids);
  assert.deepEqual(d, original, 'No recall value is compared with or replaced by an objective answer');
  const unread = select(['not-read'], [{ type: 'select', goalId: 'not-read' }]);
  unread.actorState.memoryUpdate = [{ type: 'selfRecall', goalId: 'not-read', values: { name: '알 수 없는 이름' } }];
  rejected(prior, unread, 'select_requires_display_or_recall');
});

test('pending goals survive interest/rest/exploration while focus and uncertainty remain authored', () => {
  const prior = opened();
  for (const intent of ['interest', 'rest', 'explore', 'finish', 'check', 'help']) {
    const d = declaration([ids[0]], { uncertainGoalIds: [ids[0]], focusedProductId: 'chosen-other-product' });
    d.basis.intent = intent;
    const original = structuredClone(d);
    assert.deepEqual(accepted(prior, d, 'pause').openGoalIds, [ids[0]]);
    assert.deepEqual(d, original);
  }
  rejected(prior, declaration(), 'held_missing_open', 'pause');
});

test('explicit abandon releases only the chosen task and cannot masquerade as completion history', () => {
  const prior = state({ knownGoalIds: ids, openGoalIds: ids });
  const d = declaration([ids[1]], { taskUpdate: [{ type: 'abandon', goalId: ids[0] }] });
  const next = accepted(prior, d);
  assert.deepEqual(next.openGoalIds, [ids[1]]);
  assert.deepEqual(next.completedGoalIds, []);
  const empty = accepted(next, declaration([], { taskUpdate: [{ type: 'abandon', goalId: ids[1] }] }));
  rejected(accepted(empty, declaration(), 'readList'), declaration(), 'selection_after_list');
});

test('complete declaration tracks lifecycle without inventing actual purchase-result evidence', () => {
  const prior = state({ knownGoalIds: ids, openGoalIds: ids });
  const d = declaration([ids[1]], { taskUpdate: [{ type: 'complete', goalId: ids[0] }] });
  const next = accepted(prior, d);
  assert.deepEqual(next.openGoalIds, [ids[1]]);
  assert.deepEqual(next.completedGoalIds, [ids[0]]);
  assert.equal('purchaseEvidence' in next, false, 'Actual accepted add/result remains a final-validator requirement');
  const wrongHeld = declaration(ids, { taskUpdate: [{ type: 'complete', goalId: ids[0] }] });
  rejected(prior, wrongHeld, 'held_unselected');
  const wrongBasis = bound([ids[1]]); wrongBasis.actorState.taskUpdate = [{ type: 'complete', goalId: ids[0] }];
  rejected(prior, wrongBasis, 'basis_requires_open');
});

test('all-completed re-read may remain unbound; explicit reopen clears that goal completion', () => {
  const completed = state({ knownGoalIds: ids, completedGoalIds: ids, previousActionType: 'readList' });
  const recheck = declaration(); recheck.basis.intent = 'check';
  assert.deepEqual(accepted(completed, recheck).openGoalIds, []);
  const reopened = accepted(completed, select());
  assert.deepEqual(reopened.openGoalIds, [ids[0]]);
  assert.deepEqual(reopened.completedGoalIds, [ids[1]]);
  const partial = state({ knownGoalIds: ids, completedGoalIds: [ids[0]], previousActionType: 'readList' });
  rejected(partial, recheck, 'selection_after_list');
});

test('unopened release, duplicate select and memory deactivation cannot silently rewrite pending goals', () => {
  rejected(state(), declaration([], { taskUpdate: [{ type: 'abandon', goalId: ids[0] }] }), 'release_requires_open');
  rejected(opened(), select(), 'select_already_open');
  rejected(opened(), declaration([ids[0]], { memoryUpdate: [{ type: 'deactivate', goalId: ids[0] }] }), 'deactivate_open');
});

test('basis/focus/name/quantity-use requirements are enforced without authoring remembered values', () => {
  const prior = opened();
  const noName = bound(); noName.basis.memoryUses = [];
  rejected(prior, noName, 'goal_name_use_required');
  for (const action of ['readList', 'viewCart', 'viewHelp']) accepted(prior, noName, action);
  const differentGoal = bound(); differentGoal.basis.memoryUses[0].goalId = ids[1];
  rejected(prior, differentGoal, 'memory_goal_binding');
  const focus = bound(); focus.actorState.focusedGoalId = ids[1];
  rejected(prior, focus, 'focus_goal_binding');
  const unbound = bound(); unbound.basis.intent = 'interest';
  rejected(prior, unbound, 'unbound_intent_requires_null');
  for (const action of ['add', 'remove']) {
    rejected(prior, bound(), 'goal_quantity_use_required', action);
    const d = bound(); d.basis.memoryUses.push({ goalId: ids[0], field: 'requiredQuantity', mode: 'guess', value: 97 });
    const original = structuredClone(d);
    accepted(prior, d, action);
    assert.deepEqual(d, original, 'Remembered quantity is neither an answer check nor an action quantity');
  }
});

test('capacity rejects declared excess without dropping any held or selected task', () => {
  const d = select(ids, ids.map(goalId => ({ type: 'select', goalId })));
  const result = rejected(read(), d, 'open_capacity', 'walk', { goalMemoryCapacity: 1 });
  assert.ok(result.issues.some(issue => issue.rule === 'held_capacity'));
  assert.deepEqual(d.actorState.heldGoalIds, ids);
  assert.deepEqual(accepted(read(), d, 'walk', { goalMemoryCapacity: undefined }).openGoalIds, ids);
});
