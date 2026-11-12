const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { buildWholeTraceMemoryAuthoringGuide } = require('../src/wholeTrace/wholeTraceMemoryAuthoringGuide.ts');
const { WholeTraceCognitionEngine, buildWholeTraceCognitionProfile } = require('../src/wholeTrace/wholeTraceCognition.ts');
const { WholeTraceTaskMemoryEngine } = require('../src/wholeTrace/wholeTraceTaskMemory.ts');
const { getPersona } = require('../src/personas.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');

const goal = { id: 'objective-1', label: '흰 우유', quantity: 1, match: 'exact' };
const observation = (overrides = {}) => ({ schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world',
  activeStation: null, visibleStations: [], anchors: [], products: [], shelf: null,
  listAvailable: true, cart: null, cashiers: {}, ...overrides });
const actor = (overrides = {}) => ({ activity: 'orient', heldGoalIds: [goal.id], uncertainGoalIds: [],
  focusedGoalId: null, focusedProductId: null, ...overrides });
const use = (field, value, mode = 'remembered') => ({ goalId: goal.id, field, value, mode });
const profile = () => buildWholeTraceCognitionProfile(getPersona('mild-intellectual-disability-adult'));
const quantity = preview => preview.state.activeGoals[0].fields.requiredQuantity;
function accept(engine, before, state, uses = [], delayMs = 1) {
  const preview = engine.preview(before, state, uses, delayMs);
  assert.equal(preview.valid, true, preview.errors.join('; '));
  engine.commit();
  return preview;
}

// Small deterministic observations reproduce the recorded pressure boundary, not
// the old candidate or a new AI trace. No output/ fixture is read or rewritten.
function pendingInterestBoundary() {
  const engine = new WholeTraceCognitionEngine(profile());
  accept(engine, observation({ elapsedMs: 10249, readObjectives: [goal] }), actor());
  accept(engine, observation({ elapsedMs: 10250 }), actor(), [], 25296);
  accept(engine, observation({ elapsedMs: 35546 }), actor({ activity: 'interest' }), [], 9851);
  accept(engine, observation({ elapsedMs: 45397, sequence: 13,
    result: { accepted: true, actionType: 'add', productId: 'curry', quantity: 1 } }),
  actor({ activity: 'interest' }), [], 3300);
  return engine;
}

test('guide timing example matches unchanged cognition coefficients and rules', () => {
  const guide = buildWholeTraceMemoryAuthoringGuide(), example = guide.pendingAfterInterestExample, p = profile();
  assert.deepEqual(guide.fields, ['name', 'specification', 'requiredQuantity']);
  for (const [key, value] of Object.entries(example.coefficients)) assert.equal(p.coefficients[key], value);
  assert.equal(p.rules.uncertainThreshold, .7);
  assert.equal(p.rules.delayUnitMs, 60000);
  assert.equal(p.rules.interestUnitMs, 12000);
  assert.equal(p.rules.countUnitMs, 16000);
  const engine = pendingInterestBoundary(), before = engine.snapshot();
  assert.equal(before.processedTimeMs, example.before.previousProcessedTimeMs);
  assert.equal(before.activeGoals[0].fields.requiredQuantity.pressure, example.before.requiredQuantityPressure);
  assert.equal(before.context.unreviewedQuantityChanges, example.before.unreviewedQuantityChanges);
  assert.equal(before.context.activity, example.before.previousActivity);
  assert.match(guide.scope, /do not calculate or fill/);
});

test('pending unfocused goal still requires uncertainty after previous interest and elapsed browse time', () => {
  const engine = pendingInterestBoundary(), committed = engine.snapshot();
  const before = observation({ elapsedMs: 50197, sequence: 14, result: { accepted: true, actionType: 'browse' } });
  const state = actor(), untouchedState = structuredClone(state), untouchedObservation = structuredClone(before);
  const rejected = engine.preview(before, state, [], 850);
  assert.equal(rejected.valid, false);
  assert.match(rejected.errors.join('; '), /uncertainGoalIds must include objective-1/);
  assert.equal(quantity(rejected).pressure, .706822);
  assert.equal(quantity(rejected).status, 'uncertain');
  assert.equal(rejected.state.processedTimeMs, 51047);
  assert.equal(rejected.state.context.interestRunMs - committed.context.interestRunMs, 2350,
    '1500 ms of prior action time plus 850 ms current delay remain interest exposure');
  assert.deepEqual(engine.snapshot(), committed, 'rejection changes neither committed fields nor annotations');
  assert.deepEqual(state, untouchedState);
  assert.deepEqual(before, untouchedObservation);
  assert.throws(() => engine.commit(), /valid preview/);
  const declared = engine.preview(before, actor({ uncertainGoalIds: [goal.id] }), [], 850);
  assert.equal(declared.valid, true, declared.errors.join('; '));
  assert.deepEqual(declared.state, rejected.state, 'the annotation acknowledges uncertainty without changing the computation');
});

test('an uncertainty annotation alone does not authorize guessing a still-clear field', () => {
  const engine = new WholeTraceCognitionEngine(profile());
  accept(engine, observation({ readObjectives: [goal] }), actor());
  const state = actor({ uncertainGoalIds: [goal.id] });
  const wrongMode = engine.preview(observation(), state, [use('requiredQuantity', 7, 'guess')], 1);
  assert.equal(wrongMode.valid, false);
  assert.equal(quantity(wrongMode).status, 'clear');
  assert.match(wrongMode.errors.join('; '), /requires an uncertain active field/);
  const explicitBelief = { ...state, memoryUpdate: [{ type: 'uncertain', goalId: goal.id, fields: ['requiredQuantity'] }] };
  const guessed = engine.preview(observation(), explicitBelief, [use('requiredQuantity', 7, 'guess')], 1);
  assert.equal(guessed.valid, true, guessed.errors.join('; '));
  assert.equal(quantity(guessed).value, 1, 'the guessed belief does not overwrite the retained quantity or check the hidden answer');
  const remembered = engine.preview(observation(), explicitBelief, [use('requiredQuantity', 1)], 1);
  assert.equal(remembered.valid, false, 'even a correct answer cannot use remembered after uncertainty');
});

test('unavailable fields need explicit recall, and cart/product data do not restore a requested value', () => {
  const engine = new WholeTraceCognitionEngine(profile());
  accept(engine, observation({ readObjectives: [goal] }), actor());
  accept(engine, observation(), actor({ activity: 'interest', uncertainGoalIds: [goal.id] }), [], 60000);
  const current = observation({ cart: { milk: 7 }, products: [
    { id: 'milk', categoryId: 'fresh', name: '흰 우유', detail: '900mL', stock: 8, price: 2200 },
  ] });
  const state = actor({ uncertainGoalIds: [goal.id] });
  for (const mode of ['guess', 'current-display']) {
    const rejected = engine.preview(current, state, [use('requiredQuantity', 1, mode)], 1);
    assert.equal(rejected.valid, false);
    assert.equal(quantity(rejected).status, 'unavailable');
    assert.equal(quantity(rejected).value, null);
  }
  const recalled = engine.preview(current, { ...state,
    memoryUpdate: [{ type: 'selfRecall', goalId: goal.id, values: { name: '우유', requiredQuantity: 2 } }] },
  [use('requiredQuantity', 2, 'guess')], 1);
  assert.equal(recalled.valid, true, recalled.errors.join('; '));
  assert.equal(quantity(recalled).value, 2);
  assert.equal(quantity(recalled).status, 'uncertain');
  assert.deepEqual(recalled.state.purchasedCounts, { milk: 7 });
});

test('task focus changes retain pending memory while a mistaken legal quantity stays actor chosen', () => {
  const task = new WholeTraceTaskMemoryEngine(2), memory = new WholeTraceCognitionEngine(profile());
  const read = observation({ readObjectives: [goal], sequence: 1 });
  const selected = actor({ taskUpdate: [{ type: 'select', goalId: goal.id }] });
  const unbound = { intent: 'explore', goalId: null, memoryUses: [] };
  assert.equal(task.preview(read, selected, unbound, { type: 'pause', durationMs: 1 }).valid, true);
  task.commit(); accept(memory, read, selected);
  const detour = actor({ activity: 'interest', uncertainGoalIds: [goal.id] });
  assert.equal(task.preview(observation(), detour, { ...unbound, intent: 'interest' },
    { type: 'pause', durationMs: 17000 }).valid, true);
  task.commit();
  const decayed = accept(memory, observation(), detour, [], 17000);
  assert.equal(quantity(decayed).status, 'uncertain');
  const state = actor({ activity: 'shop', focusedGoalId: goal.id, uncertainGoalIds: [goal.id] });
  const uses = [use('name', goal.label), use('requiredQuantity', 2, 'guess')];
  const action = { type: 'add', productId: 'wrong-juice', quantity: 7 }, original = structuredClone(action);
  const bound = { intent: 'task', goalId: goal.id, memoryUses: uses };
  assert.equal(task.preview(observation(), state, bound, action).valid, true);
  assert.equal(memory.preview(observation(), state, uses, 1).valid, true);
  assert.deepEqual(action, original);
  assert.deepEqual(task.snapshot().openGoalIds, [goal.id]);
  assert.equal(task.preview(observation(), actor({ heldGoalIds: [] }), unbound, action).valid, false);
});

test('goal references must use exact read objective IDs, not products or objective cue prefixes', () => {
  const engine = new WholeTraceCognitionEngine(profile());
  accept(engine, observation({ readObjectives: [goal] }), actor());
  for (const invalidId of ['milk', '흰 우유', 'objective:objective-1', 'objective-2']) {
    const invalid = engine.preview(observation(), actor({ heldGoalIds: [invalidId], uncertainGoalIds: [invalidId] }), [], 1);
    assert.equal(invalid.valid, false);
    assert.match(invalid.errors.join('; '), /unread goal/);
  }
  const noSpecification = engine.preview(observation(), actor(), [], 1);
  assert.equal(noSpecification.valid, true);
  assert.equal(noSpecification.state.activeGoals[0].fields.specification.status, 'unavailable');
  assert.deepEqual(noSpecification.state.uncertainGoalIds, [], 'an undisplayed specification does not force uncertainty');
});

test('a current readList action cannot pre-clear uncertainty; only its next observation refreshes memory', async () => {
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'memory-guidance-contract', difficulty: 'exact',
    stockPerProduct: 5, objectives: [{ productId: 'milk', quantity: 1 }], environment: { cashierCount: 2 } }));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'memory-guidance-contract',
    timingProfile: 'original', maxActions: 100, llm: { model: 'gpt-6-luna', maxCalls: 1 } };
  const bundle = buildWholeTraceBundle(settings, 'memory-guidance-contract-request');
  const actualGoal = bundle.worldReference.objectives[0], source = bundle.initialChoiceFrame.source;
  const decision = (choiceId, state = {}, uses = []) => ({ choiceRef: { source: structuredClone(source), choiceId },
    delayMs: 1, reason: '작성 안내의 행동 전 기억 계약을 확인하는 결정론적 시험',
    basis: { intent: 'check', goalId: null, memoryUses: uses },
    actorState: { activity: 'check', task: '실제 목록 표시 시점을 확인한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar', ...state } });
  const held = { heldGoalIds: [actualGoal.id] };
  const prefix = [decision('control/readList'),
    decision('control/pause', { ...held, taskUpdate: [{ type: 'select', goalId: actualGoal.id }] }),
    decision('control/pause', { ...held, uncertainGoalIds: [actualGoal.id],
      memoryUpdate: [{ type: 'uncertain', goalId: actualGoal.id, fields: ['requiredQuantity'] }] })];
  const make = decisions => ({ candidateVersion: '7', requestId: bundle.requestId, decisions });
  const ending = decision('control/giveUp', { ...held, activity: 'finish' });
  const invalid = make([...prefix, decision('control/readList', held), ending]), original = structuredClone(invalid);
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, invalid), error => {
    assert.equal(error.validation.code, 'WORKING_MEMORY');
    assert.equal(error.validation.failedDecisionIndex, 3);
    assert.equal(error.validation.proposedWorkingMemory.activeGoals[0].fields.requiredQuantity.status, 'uncertain');
    return true;
  });
  assert.deepEqual(invalid, original);
  const valid = make([...prefix, decision('control/readList', { ...held, uncertainGoalIds: [actualGoal.id] }), ending]);
  const compiled = await compileWholeTraceCandidate(settings, bundle, valid);
  assert.equal(compiled.knowledgeAudit[3].cognition.state.activeGoals[0].fields.requiredQuantity.status, 'uncertain');
  assert.equal(compiled.knowledgeAudit[4].cognition.state.activeGoals[0].fields.requiredQuantity.status, 'clear');
  assert.equal(compiled.knowledgeAudit[4].cognition.state.activeGoals[0].fields.requiredQuantity.pressure, 0);
});
