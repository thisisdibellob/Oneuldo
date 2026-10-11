const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const {
  WholeTraceTaskMemoryEngine, validateWholeTraceTaskUpdate, WHOLE_TRACE_TASK_MEMORY_INSTRUCTIONS,
} = require('../src/wholeTraceTaskMemory.ts');
const { WholeTraceCognitionEngine, buildWholeTraceCognitionProfile } = require('../src/wholeTraceCognition.ts');
const { getPersona } = require('../src/personas.ts');

const goal = (id = 'goal-milk', quantity = 2) => ({ id, label: '흰 우유', quantity, match: 'exact' });
const observation = (overrides = {}) => ({ schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world',
  activeStation: null, visibleStations: [], anchors: [], products: [], shelf: null,
  listAvailable: true, cart: null, cashiers: {}, ...overrides });
const actor = (held = ['goal-milk'], overrides = {}) => ({ heldGoalIds: held, focusedGoalId: held[0] ?? null, ...overrides });
const use = (field = 'name', value = '흰 우유', goalId = 'goal-milk', mode = 'remembered') => ({ goalId, field, value, mode });
const basis = (intent = 'task', goalId = 'goal-milk', memoryUses = [use()]) => ({ intent, goalId, memoryUses });
const walk = { type: 'walkToAnchor', anchorId: 'visible-anchor' };
function accept(engine, o, state, b, action = walk) {
  const preview = engine.preview(o, state, b, action);
  assert.equal(preview.valid, true, preview.errors.join('; '));
  assert.deepEqual(engine.snapshot().openGoalIds, engine.snapshot().openGoalIds);
  engine.commit();
  return preview;
}
function select(engine, id = 'goal-milk', overrides = {}) {
  return accept(engine, observation({ readObjectives: [goal(id)], sequence: 1 }),
    actor([id], { taskUpdate: [{ type: 'select', goalId: id }], ...overrides }), basis('task', id, [use('name', '흰 우유', id, 'current-display')]));
}

test('task-update schema rejects unbounded, unknown and contradictory declarations', () => {
  assert.equal(validateWholeTraceTaskUpdate(undefined).valid, true);
  assert.equal(validateWholeTraceTaskUpdate([]).valid, true);
  assert.equal(validateWholeTraceTaskUpdate([{ type: 'abandon', goalId: 'goal-milk' }]).valid, true);
  for (const value of [null, {}, Array.from({ length: 25 }, (_, i) => ({ type: 'select', goalId: `${i}` })),
    [{ type: 'forget', goalId: 'goal-milk' }], [{ type: 'select', goalId: '' }],
    [{ type: 'select', goalId: 'goal-milk', value: 'hidden' }],
    [{ type: 'select', goalId: 'goal-milk' }, { type: 'abandon', goalId: 'goal-milk' }]])
    assert.equal(validateWholeTraceTaskUpdate(value).valid, false);
  assert.match(WHOLE_TRACE_TASK_MEMORY_INSTRUCTIONS, /finish activity label alone/);
  assert.match(WHOLE_TRACE_TASK_MEMORY_INSTRUCTIONS, /never means a hidden correct product/);
});

test('the original zero-memory sample pattern rejects immediately after a real list read', () => {
  const engine = new WholeTraceTaskMemoryEngine(2), original = engine.snapshot();
  const ignored = engine.preview(observation({ readObjectives: [goal()] }), actor([], { focusedGoalId: null }),
    basis('explore', null, []), walk);
  assert.equal(ignored.valid, false);
  assert.match(ignored.errors.join('; '), /select at least one currently displayed/);
  assert.deepEqual(engine.snapshot(), original, 'rejected previews never retain even exposed goal IDs');
  assert.throws(() => engine.commit(), /valid preview/);
  const finishLabel = engine.preview(observation({ readObjectives: [goal()] }), actor([]), basis('finish', null, []), walk);
  assert.equal(finishLabel.valid, false, 'a finish label cannot bypass selection using an unrelated walk');
});

test('clearing focus during interest preserves the open task and prevents silent deactivation', () => {
  const engine = new WholeTraceTaskMemoryEngine(2);
  select(engine);
  const before = engine.snapshot();
  const interest = engine.preview(observation({ sequence: 2 }), actor(['goal-milk'], { focusedGoalId: null }), basis('interest', null, []),
    { type: 'pause', durationMs: 20000 });
  assert.equal(interest.valid, true);
  assert.deepEqual(interest.state.openGoalIds, ['goal-milk']);
  assert.deepEqual(engine.snapshot(), before, 'preview does not mutate committed task state');
  engine.commit();
  const dropped = engine.preview(observation({ sequence: 3 }), actor([], { focusedGoalId: null }), basis('interest', null, []), walk);
  assert.equal(dropped.valid, false);
  assert.match(dropped.errors.join('; '), /must stay in heldGoalIds/);
  const deactivated = engine.preview(observation({ sequence: 3 }), actor(['goal-milk'], { focusedGoalId: null,
    memoryUpdate: [{ type: 'deactivate', goalId: 'goal-milk' }] }), basis('rest', null, []), walk);
  assert.match(deactivated.errors.join('; '), /Cannot deactivate/);
});

test('held goals have an explicit lifecycle and capacity is shared with persistent tasks', () => {
  const engine = new WholeTraceTaskMemoryEngine(1);
  const unselected = engine.preview(observation({ readObjectives: [goal()] }), actor(), basis(), walk);
  assert.match(unselected.errors.join('; '), /unselected task/);
  const two = engine.preview(observation({ readObjectives: [goal(), goal('goal-banana')] }), actor(['goal-milk', 'goal-banana'],
    { taskUpdate: [{ type: 'select', goalId: 'goal-milk' }, { type: 'select', goalId: 'goal-banana' }] }), basis(), walk);
  assert.equal(two.valid, false);
  assert.match(two.errors.join('; '), /goalMemoryCapacity/);
  assert.deepEqual(engine.snapshot().openGoalIds, []);
  select(engine);
  const refresh = engine.preview(observation({ readObjectives: [goal(), goal('goal-banana')] }), actor(), basis(), walk);
  assert.equal(refresh.valid, true, 'list refresh with an open task does not force another selection');
  assert.deepEqual(refresh.state.openGoalIds, ['goal-milk']);
});

test('legitimate abandonment explicitly releases a task without requiring a purchase or mistake', () => {
  const engine = new WholeTraceTaskMemoryEngine(2);
  select(engine);
  const abandoned = accept(engine, observation({ sequence: 2 }), actor([], { taskUpdate: [{ type: 'abandon', goalId: 'goal-milk' }] }),
    basis('explore', null, []));
  assert.equal(abandoned.events[0].kind, 'abandoned');
  assert.deepEqual(engine.snapshot().openGoalIds, []);
  assert.deepEqual(engine.snapshot().completedGoalIds, [], 'abandonment never records completion');
  assert.deepEqual(engine.snapshot().purchaseEvidence, []);
  accept(engine, observation({ sequence: 3 }), actor([]), basis('interest', null, []));
  const reread = engine.preview(observation({ sequence: 4, readObjectives: [goal()] }), actor([]), basis('check', null, []),
    { type: 'viewCart' });
  assert.match(reread.errors.join('; '), /select at least one currently displayed/);
});

test('selecting a previously seen but inactive goal requires a real new display or explicit own recall belief', () => {
  const engine = new WholeTraceTaskMemoryEngine(2);
  select(engine);
  accept(engine, observation({ sequence: 2 }), actor([], { taskUpdate: [{ type: 'abandon', goalId: 'goal-milk' }] }), basis('rest', null, []));
  const archived = engine.preview(observation({ sequence: 3 }), actor(['goal-milk'],
    { taskUpdate: [{ type: 'select', goalId: 'goal-milk' }] }), basis(), walk);
  assert.match(archived.errors.join('; '), /current displayed goal or explicit selfRecall/);
  const ownRecall = accept(engine, observation({ sequence: 3 }), actor(['goal-milk'], {
    taskUpdate: [{ type: 'select', goalId: 'goal-milk' }],
    memoryUpdate: [{ type: 'selfRecall', goalId: 'goal-milk', values: { name: '초코 우유', requiredQuantity: 1 } }],
  }), basis('recover', 'goal-milk', [use('name', '초코 우유', 'goal-milk', 'guess')]));
  assert.deepEqual(ownRecall.state.openGoalIds, ['goal-milk']);
  assert.equal(Object.hasOwn(ownRecall.state, 'goalValues'), false, 'the task engine never copies archived goal details');
});

test('task-directed action binds a current goal and cannot skip name or purchase quantity declarations', () => {
  const engine = new WholeTraceTaskMemoryEngine(2);
  select(engine);
  assert.match(engine.preview(observation(), actor(), basis('task', null, []), walk).errors.join('; '), /requires basis.goalId/);
  assert.match(engine.preview(observation(), actor(), basis('task', 'goal-milk', []), walk).errors.join('; '), /name memoryUse/);
  assert.match(engine.preview(observation(), actor(), basis(), { type: 'add', productId: 'milk', quantity: 1 }).errors.join('; '), /requiredQuantity memoryUse/);
  assert.match(engine.preview(observation(), actor(['goal-milk'], { focusedGoalId: null }), basis('explore', 'goal-milk', []), walk).errors.join('; '), /must use basis.goalId=null/);
  assert.match(engine.preview(observation(), actor(), basis('check', null, []), walk).errors.join('; '), /focusedGoalId must match/);
  const recovery = engine.preview(observation(), actor(['goal-milk'], { focusedGoalId: null }), basis('recover', 'goal-milk', []),
    { type: 'readList', durationMs: 4000 });
  assert.equal(recovery.valid, true, 'a recovery control can seek actual external cues when name memory is unavailable');
});

test('complete requires a prior accepted goal-bound add, yet permits incorrect product and quantity', () => {
  const engine = new WholeTraceTaskMemoryEngine(2);
  select(engine);
  const notPurchased = engine.preview(observation({ sequence: 2 }), actor([], { taskUpdate: [{ type: 'complete', goalId: 'goal-milk' }] }),
    basis('check', null, []), walk);
  assert.equal(notPurchased.valid, false);
  assert.match(notPurchased.errors.join('; '), /earlier accepted add bound to that goal/);
  const add = { type: 'add', productId: 'wrong-juice', quantity: 7 };
  accept(engine, observation({ sequence: 2 }), actor(), basis('task', 'goal-milk', [use(), use('requiredQuantity', 2)]), add);
  const completed = accept(engine, observation({ sequence: 3, result: { accepted: true, actionType: 'add', productId: 'wrong-juice', quantity: 7 } }),
    actor([], { taskUpdate: [{ type: 'complete', goalId: 'goal-milk' }] }), basis('check', null, []));
  assert.deepEqual(completed.events.map(e => e.kind), ['purchase-observed', 'completed']);
  assert.equal(completed.events[0].quantity, 7);
  assert.deepEqual(completed.state.openGoalIds, []);
  assert.deepEqual(completed.state.completedGoalIds, ['goal-milk'], 'completion records the declaration without judging product or quantity');
  assert.deepEqual(completed.state.purchaseEvidence, [], 'evidence is consumed when completing');
  for (const action of [{ type: 'viewCart' }, walk]) {
    const reread = engine.preview(observation({ sequence: 4, readObjectives: [goal()] }), actor([]), basis('check', null, []), action);
    assert.equal(reread.valid, true, reread.errors.join('; '));
    assert.deepEqual(reread.state.openGoalIds, [], 'a completed-list review never reselects a goal automatically');
    assert.deepEqual(reread.events, []);
  }
  const unfinished = engine.preview(observation({ sequence: 4, readObjectives: [goal(), goal('goal-banana')] }), actor([]),
    basis('check', null, []), { type: 'viewCart' });
  assert.match(unfinished.errors.join('; '), /select at least one currently displayed/,
    'one completed goal cannot bypass selection when another displayed goal is unresolved');
});

test('unbound interest purchases and stale or mismatched results cannot satisfy an open task', () => {
  const engine = new WholeTraceTaskMemoryEngine(2);
  select(engine);
  accept(engine, observation({ sequence: 2 }), actor(['goal-milk'], { focusedGoalId: null }), basis('interest', null, []),
    { type: 'add', productId: 'curry', quantity: 1 });
  const interestOnly = engine.preview(observation({ sequence: 3, result: { accepted: true, actionType: 'add', productId: 'curry', quantity: 1 } }),
    actor([], { taskUpdate: [{ type: 'complete', goalId: 'goal-milk' }] }), basis('check', null, []), walk);
  assert.equal(interestOnly.valid, false);
  accept(engine, observation({ sequence: 3 }), actor(), basis('task', 'goal-milk', [use(), use('requiredQuantity', 2)]),
    { type: 'add', productId: 'milk', quantity: 1 });
  for (const [sequence, result] of [[3, { accepted: true, actionType: 'add', productId: 'milk', quantity: 1 }],
    [4, { accepted: false, actionType: 'add', productId: 'milk', quantity: 1 }],
    [4, { accepted: true, actionType: 'add', productId: 'banana', quantity: 1 }],
    [4, { accepted: true, actionType: 'remove', productId: 'milk', quantity: 1 }]]) {
    const invalid = engine.preview(observation({ sequence, result }), actor([], { taskUpdate: [{ type: 'complete', goalId: 'goal-milk' }] }),
      basis('check', null, []), walk);
    assert.equal(invalid.valid, false);
    assert.match(invalid.errors.join('; '), /requires an earlier accepted add/);
  }
});

test('completion evidence is scoped to the selection lifecycle and cannot be reused after reselection', () => {
  const engine = new WholeTraceTaskMemoryEngine(2);
  select(engine);
  accept(engine, observation({ sequence: 2 }), actor(), basis('task', 'goal-milk', [use(), use('requiredQuantity', 2)]),
    { type: 'add', productId: 'milk', quantity: 1 });
  accept(engine, observation({ sequence: 3, result: { accepted: true, actionType: 'add', productId: 'milk', quantity: 1 } }),
    actor([], { taskUpdate: [{ type: 'complete', goalId: 'goal-milk' }] }), basis('check', null, []));
  accept(engine, observation({ sequence: 4, readObjectives: [goal()] }), actor(['goal-milk'],
    { taskUpdate: [{ type: 'select', goalId: 'goal-milk' }] }), basis());
  assert.deepEqual(engine.snapshot().completedGoalIds, [], 'reselection invalidates the old completion declaration');
  const reused = engine.preview(observation({ sequence: 5 }), actor([], { taskUpdate: [{ type: 'complete', goalId: 'goal-milk' }] }),
    basis('check', null, []), walk);
  assert.match(reused.errors.join('; '), /earlier accepted add/);
  accept(engine, observation({ sequence: 5 }), actor([], { taskUpdate: [{ type: 'abandon', goalId: 'goal-milk' }] }),
    basis('check', null, []));
  const reread = engine.preview(observation({ sequence: 6, readObjectives: [goal()] }), actor([]), basis('check', null, []), walk);
  assert.match(reread.errors.join('; '), /select at least one currently displayed/,
    'abandoning a reopened task must not restore its old completed status');
});

test('rejected and uncommitted completion previews never grant completed-list review', () => {
  const engine = new WholeTraceTaskMemoryEngine(2);
  select(engine);
  accept(engine, observation({ sequence: 2 }), actor(), basis('task', 'goal-milk', [use(), use('requiredQuantity', 2)]),
    { type: 'add', productId: 'milk', quantity: 1 });
  const before = engine.snapshot();
  const added = observation({ sequence: 3, result: { accepted: true, actionType: 'add', productId: 'milk', quantity: 1 } });
  const complete = { taskUpdate: [{ type: 'complete', goalId: 'goal-milk' }] };
  const rejected = engine.preview(added, actor([], { ...complete, focusedGoalId: 'goal-milk' }), basis('check', null, []), walk);
  assert.equal(rejected.valid, false);
  assert.deepEqual(rejected.state.completedGoalIds, ['goal-milk'], 'the rejected proposal contains only a tentative completion');
  assert.deepEqual(engine.snapshot(), before);
  assert.throws(() => engine.commit(), /valid preview/);
  const uncommitted = engine.preview(added, actor([], complete), basis('check', null, []), walk);
  assert.equal(uncommitted.valid, true);
  assert.deepEqual(engine.snapshot(), before, 'valid previews also await acceptance and commit');
  const dropped = engine.preview(observation({ sequence: 3, readObjectives: [goal()] }), actor([]), basis('check', null, []), walk);
  assert.equal(dropped.valid, false);
  assert.match(dropped.errors.join('; '), /must stay in heldGoalIds/);
  assert.deepEqual(engine.snapshot(), before);
  assert.throws(() => engine.commit(), /valid preview/);
});

test('actual checkout or giveUp remains possible with open unfinished tasks or immediately after list read', () => {
  for (const action of [{ type: 'checkout' }, { type: 'giveUp' }, { type: 'submit' }, { type: 'requestCashier' }]) {
    const engine = new WholeTraceTaskMemoryEngine(2);
    const noTask = engine.preview(observation({ readObjectives: [goal()] }), actor([]), basis('finish', null, []), action);
    assert.equal(noTask.valid, true, noTask.errors.join('; '));
  }
  const engine = new WholeTraceTaskMemoryEngine(2);
  select(engine);
  const finish = accept(engine, observation({ sequence: 2 }), actor(['goal-milk'], { focusedGoalId: null }), basis('finish', null, []),
    { type: 'checkout' });
  assert.deepEqual(finish.state.openGoalIds, ['goal-milk']);
});

test('pending tasks retain actual cognition load during attention loss, then recover only through real list read', () => {
  const persona = getPersona('mild-intellectual-disability-adult');
  const task = new WholeTraceTaskMemoryEngine(persona.attention.goalMemoryCapacity);
  const memory = new WholeTraceCognitionEngine(buildWholeTraceCognitionProfile(persona));
  const firstObservation = observation({ readObjectives: [goal()], sequence: 1 });
  const firstActor = actor(['goal-milk'], { activity: 'shop', uncertainGoalIds: [], taskUpdate: [{ type: 'select', goalId: 'goal-milk' }] });
  accept(task, firstObservation, firstActor, basis('task', 'goal-milk', [use('name', '흰 우유', 'goal-milk', 'current-display')]));
  assert.equal(memory.preview(firstObservation, firstActor, [], 1).valid, true);
  memory.commit();
  const divertedActor = actor(['goal-milk'], { activity: 'interest', focusedGoalId: null, uncertainGoalIds: ['goal-milk'] });
  accept(task, observation({ sequence: 2 }), divertedActor, basis('interest', null, []), { type: 'pause', durationMs: 60000 });
  const burden = memory.preview(observation({ sequence: 2 }), divertedActor, [], 60000);
  assert.equal(burden.valid, true, burden.errors.join('; '));
  assert.equal(burden.state.activeGoals[0].fields.requiredQuantity.status, 'unavailable');
  memory.commit();
  const recoveryActor = actor(['goal-milk'], { activity: 'recover', focusedGoalId: null, uncertainGoalIds: ['goal-milk'] });
  accept(task, observation({ sequence: 3 }), recoveryActor, basis('recover', 'goal-milk', []), { type: 'readList', durationMs: 3000 });
  const reread = observation({ readObjectives: [goal()], sequence: 4 });
  const restored = memory.preview(reread, actor(['goal-milk'], { activity: 'shop', uncertainGoalIds: [] }), [], 1);
  assert.equal(restored.valid, true);
  assert.equal(restored.state.activeGoals[0].fields.requiredQuantity.status, 'clear');
  assert.equal(restored.state.activeGoals[0].fields.requiredQuantity.value, 2);
  assert.deepEqual(task.snapshot().openGoalIds, ['goal-milk']);
});
