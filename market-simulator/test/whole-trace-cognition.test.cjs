const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { getPersona } = require('../src/personas.ts');
const {
  buildWholeTraceCognitionProfile, WholeTraceCognitionEngine,
  validateWholeTraceMemoryUses, validateWholeTraceMemoryUpdate, WHOLE_TRACE_COGNITION_INSTRUCTIONS,
} = require('../src/wholeTrace/wholeTraceCognition.ts');

const goal = (id = 'objective-1', quantity = 1, specification) => ({ id, label: '흰 우유', quantity, match: 'exact',
  ...(specification ? { specification } : {}) });
const product = (id, name, detail) => ({ id, categoryId: 'fresh', name, detail, price: 2000, stock: 6 });
const observation = (overrides = {}) => ({ schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world',
  activeStation: null, visibleStations: [], anchors: [], products: [], shelf: null,
  listAvailable: true, cart: null, cashiers: {}, ...overrides });
const actor = (heldGoalIds = ['objective-1'], overrides = {}) => ({ activity: 'shop', heldGoalIds,
  uncertainGoalIds: [], focusedGoalId: heldGoalIds[0] ?? null, focusedProductId: null, ...overrides });
const use = (field, value, mode = 'remembered', goalId = 'objective-1') => ({ goalId, field, mode, value });
function profile(overrides = {}) {
  const persona = getPersona('mild-intellectual-disability-adult');
  if (overrides.capacity !== undefined) persona.attention.goalMemoryCapacity = overrides.capacity;
  if (overrides.decay !== undefined) persona.attention.switchMemoryDecay = overrides.decay;
  if (overrides.confusion !== undefined) persona.parameters.confusionProbability = overrides.confusion;
  if (overrides.quantity !== undefined) persona.parameters.quantitySlipProbability = overrides.quantity;
  if (overrides.familiar !== undefined) persona.character.familiarProductIds = overrides.familiar;
  return buildWholeTraceCognitionProfile(persona);
}
function read(engine, goals = [goal()], held = goals.map(g => g.id)) {
  const preview = engine.preview(observation({ readObjectives: goals }), actor(held), [], 1);
  assert.equal(preview.valid, true, preview.errors.join('; '));
  engine.commit();
}
const fieldState = (preview, key = 'requiredQuantity', id = 'objective-1') =>
  preview.state.activeGoals.find(g => g.goalId === id).fields[key];

test('native profile maps original synthetic parameters to deterministic context coefficients', () => {
  const persona = getPersona('mild-intellectual-disability-adult'), original = structuredClone(persona);
  const p = buildWholeTraceCognitionProfile(persona);
  assert.deepEqual(p.sourceParameters, { switchMemoryDecay: persona.attention.switchMemoryDecay,
    confusionProbability: persona.parameters.confusionProbability,
    quantitySlipProbability: persona.parameters.quantitySlipProbability });
  assert.equal(p.goalMemoryCapacity, persona.attention.goalMemoryCapacity);
  assert.equal(p.coefficients.delay, .04 + persona.attention.switchMemoryDecay);
  assert.equal(p.coefficients.interest, 6 * persona.attention.switchMemoryDecay);
  assert.equal(p.coefficients.labelConfusion, persona.parameters.confusionProbability);
  assert.equal(p.coefficients.countTracking, persona.parameters.quantitySlipProbability);
  assert.deepEqual(persona, original);
  assert.match(p.interpretation, /not Bernoulli error rates/);
  assert.match(WHOLE_TRACE_COGNITION_INSTRUCTIONS, /Node recomputes it after the complete candidate/);
  assert.match(WHOLE_TRACE_COGNITION_INSTRUCTIONS, /value is REQUIRED/);
  assert.match(WHOLE_TRACE_COGNITION_INSTRUCTIONS, /full worldReference/);
  assert.match(WHOLE_TRACE_COGNITION_INSTRUCTIONS, /persona.behavior.cognition/);
  assert.match(WHOLE_TRACE_COGNITION_INSTRUCTIONS, /declare a name memoryUse/);
});

test('capacity bounds actual active access; unread goals and archived-but-inactive detail uses reject', () => {
  const engine = new WholeTraceCognitionEngine(profile({ capacity: 1 }));
  const unread = engine.preview(observation(), actor(['objective-unread']), [], 1);
  assert.equal(unread.valid, false);
  assert.match(unread.errors.join('; '), /unread goal/);
  assert.deepEqual(engine.snapshot().knownGoalIds, []);
  const malformedReference = engine.preview(observation(), actor(['__proto__']), [], 1);
  assert.equal(malformedReference.valid, false, 'unknown references diagnose cleanly without keyed-metadata access');
  const two = engine.preview(observation({ readObjectives: [goal(), goal('objective-2')] }), actor(['objective-1', 'objective-2']), [], 1);
  assert.match(two.errors.join('; '), /goalMemoryCapacity/);
  read(engine, [goal(), goal('objective-2')], ['objective-1']);
  assert.deepEqual(engine.snapshot().knownGoalIds, ['objective-1', 'objective-2']);
  const archiveUse = engine.preview(observation(), actor(), [use('requiredQuantity', 1, 'remembered', 'objective-2')], 1);
  assert.equal(archiveUse.valid, false);
  assert.match(archiveUse.errors.join('; '), /active working-memory access/);
  const activate = engine.preview(observation(), actor(['objective-2'], { uncertainGoalIds: ['objective-2'] }),
    [use('requiredQuantity', 1, 'remembered', 'objective-2')], 1);
  assert.equal(fieldState(activate, 'requiredQuantity', 'objective-2').status, 'unavailable');
  assert.equal(fieldState(activate, 'requiredQuantity', 'objective-2').value, null);
  assert.match(activate.errors.join('; '), /clear retained matching value/);
});

test('deactivation destroys working values and explicit selfRecall supplies an uncertain belief, never the archived answer', () => {
  const engine = new WholeTraceCognitionEngine(profile());
  read(engine, [goal('objective-1', 3)]);
  const deactivate = engine.preview(observation(), actor([], { memoryUpdate: [{ type: 'deactivate', goalId: 'objective-1' }] }), [], 1);
  assert.equal(deactivate.valid, true);
  engine.commit();
  assert.deepEqual(engine.snapshot().activeGoals, []);
  const recall = engine.preview(observation(), actor(['objective-1'], { uncertainGoalIds: ['objective-1'],
    memoryUpdate: [{ type: 'selfRecall', goalId: 'objective-1', values: { name: '우유', requiredQuantity: 2 } }] }),
  [use('name', '우유', 'guess'), use('requiredQuantity', 2, 'guess')], 1);
  assert.equal(recall.valid, true, recall.errors.join('; '));
  assert.equal(fieldState(recall).value, 2, 'the model belief is not replaced with the original required 3');
  assert.equal(fieldState(recall).status, 'uncertain');
  assert.equal(fieldState(recall).source, 'self-recall');
  engine.commit();
  const claimClear = engine.preview(observation(), actor(['objective-1'], { uncertainGoalIds: ['objective-1'] }),
    [use('requiredQuantity', 2)], 1);
  assert.equal(claimClear.valid, false);
  assert.match(claimClear.errors.join('; '), /clear retained matching value/);
});

test('long interest exposure weakens detail while short interest can retain it, reproducibly without a seed draw', () => {
  function scenario(wait) {
    const engine = new WholeTraceCognitionEngine(profile({ confusion: 0, quantity: 0 }));
    read(engine);
    return engine.preview(observation(), actor(['objective-1'], { activity: 'interest', focusedGoalId: null,
      uncertainGoalIds: wait > 2000 ? ['objective-1'] : [] }), [], wait);
  }
  const short = scenario(2000), long = scenario(60000);
  assert.equal(short.valid, true);
  assert.equal(fieldState(short).status, 'clear');
  assert.equal(long.valid, true);
  assert.equal(fieldState(long).status, 'unavailable');
  assert.equal(fieldState(long).value, null);
  assert.deepEqual(long, scenario(60000));
  assert.ok(fieldState(long).pressure > fieldState(short).pressure);
});

test('quantity/specification are independently unavailable; cart/product/help cannot restore requested fields', () => {
  const engine = new WholeTraceCognitionEngine(profile({ confusion: 0, quantity: 0 }));
  read(engine, [goal('objective-1', 3, '900mL')]);
  const lost = engine.preview(observation(), actor(['objective-1'], { activity: 'interest', uncertainGoalIds: ['objective-1'] }), [], 60000);
  assert.equal(lost.valid, true);
  assert.equal(fieldState(lost).status, 'unavailable');
  assert.equal(fieldState(lost, 'specification').status, 'unavailable');
  engine.commit();
  const support = observation({ cart: { milk: 7 }, products: [product('milk', '흰 우유', '900mL')],
    supportText: ['장바구니의 물건과 개수를 살펴보세요.'] });
  const afterSupport = engine.preview(support, actor(['objective-1'], { uncertainGoalIds: ['objective-1'] }), [], 1000);
  assert.equal(afterSupport.valid, true);
  assert.deepEqual(afterSupport.state.purchasedCounts, { milk: 7 });
  assert.deepEqual(afterSupport.state.displayedProductSpecifications, [{ productId: 'milk', specification: '900mL' }]);
  assert.equal(fieldState(afterSupport).value, null);
  assert.equal(fieldState(afterSupport, 'specification').value, null);
  const fakeDisplay = engine.preview(support, actor(['objective-1'], { uncertainGoalIds: ['objective-1'] }),
    [use('requiredQuantity', 3, 'current-display'), use('specification', '900mL', 'current-display')], 1000);
  assert.equal(fakeDisplay.valid, false);
  assert.match(fakeDisplay.errors.join('; '), /No current displayed list field/);
  const realRead = engine.preview(observation({ readObjectives: [goal('objective-1', 3, '900mL')], cart: { milk: 7 } }),
    actor(), [use('requiredQuantity', 3, 'current-display'), use('specification', '900mL', 'remembered')], 2000);
  assert.equal(realRead.valid, true, realRead.errors.join('; '));
  assert.equal(fieldState(realRead).value, 3);
  assert.equal(fieldState(realRead).status, 'clear');
  assert.deepEqual(realRead.state.purchasedCounts, { milk: 7 });
});

test('an absent list specification stays unavailable without creating invented uncertainty or catalogue knowledge', () => {
  const engine = new WholeTraceCognitionEngine(profile());
  read(engine);
  const stable = engine.preview(observation({ products: [product('milk', '흰 우유', '900mL')] }), actor(), [], 1);
  assert.equal(stable.valid, true);
  assert.equal(fieldState(stable, 'specification').value, null);
  assert.deepEqual(stable.state.uncertainGoalIds, []);
  const invented = engine.preview(observation(), actor(['objective-1'], { uncertainGoalIds: ['objective-1'],
    memoryUpdate: [{ type: 'selfRecall', goalId: 'objective-1', values: { specification: '900mL' } }] }), [], 1);
  assert.equal(invented.valid, false);
  assert.match(invented.errors.join('; '), /Never-displayed goal field/);
});

test('correct and mistaken guesses remain valid beliefs; chosen quantities are never corrected', () => {
  const engine = new WholeTraceCognitionEngine(profile());
  read(engine, [goal('objective-1', 3)]);
  for (const quantity of [2, 3]) {
    const predicted = engine.preview(observation({ sequence: 10,
      result: { accepted: true, actionType: 'add', productId: 'milk-small', quantity: 2 } }),
    actor(['objective-1'], { uncertainGoalIds: ['objective-1'],
      memoryUpdate: [{ type: 'uncertain', goalId: 'objective-1', fields: ['requiredQuantity'] }] }),
    [use('requiredQuantity', quantity, 'guess')], 1000);
    assert.equal(predicted.valid, true, predicted.errors.join('; '));
    assert.equal(fieldState(predicted).value, 3, 'the retained field is not rewritten by a guess or an accepted item action');
    assert.equal(predicted.state.context.unreviewedQuantityChanges, 2);
  }
});

test('real displayed similar labels and original confusion setting influence field pressure', () => {
  const items = [product('milk', '흰 우유', '900mL'), product('small', '작은 흰 우유', '200mL'), product('chocolate', '초코 우유', '200mL')];
  function evaluate(confusion, products, familiar = []) {
    const engine = new WholeTraceCognitionEngine(profile({ decay: 0, confusion, quantity: 0, familiar }));
    read(engine);
    return engine.preview(observation({ products }), actor(['objective-1'], { uncertainGoalIds: ['objective-1'] }), [], 8000);
  }
  const ambiguous = evaluate(1, items), noConfusion = evaluate(0, items), unique = evaluate(1, items.slice(0, 1));
  assert.equal(fieldState(ambiguous, 'name').status, 'unavailable');
  assert.equal(fieldState(noConfusion, 'name').status, 'clear');
  assert.equal(fieldState(unique, 'name').status, 'clear');
  assert.equal(ambiguous.state.context.ambiguityByGoal['objective-1'], 2);
  assert.ok(fieldState(evaluate(1, items, ['milk']), 'name').pressure < fieldState(ambiguous, 'name').pressure);
  assert.equal(fieldState(ambiguous).status, 'clear', 'similar labels do not automatically erase the required count');
});

test('count tracking reacts to multiple quantities and unreviewed changes, not every selection', () => {
  function evaluate(quantitySensitivity, desired, result) {
    const engine = new WholeTraceCognitionEngine(profile({ decay: 0, confusion: 0, quantity: quantitySensitivity }));
    read(engine, [goal('objective-1', desired)]);
    return engine.preview(observation({ sequence: 2, ...(result ? { result } : {}) }),
      actor(['objective-1'], { uncertainGoalIds: ['objective-1'] }), [], 16000);
  }
  assert.equal(fieldState(evaluate(1, 1)).status, 'clear');
  assert.equal(fieldState(evaluate(1, 3)).status, 'uncertain');
  assert.equal(fieldState(evaluate(0, 3)).status, 'clear');
  const changes = evaluate(1, 3, { accepted: true, actionType: 'add', productId: 'milk', quantity: 3 });
  assert.equal(fieldState(changes).status, 'unavailable');
  assert.equal(changes.state.context.unreviewedQuantityChanges, 3);
});

test('elapsed observation time contributes to list aging and accepted result is counted only once', () => {
  const engine = new WholeTraceCognitionEngine(profile({ decay: 0, confusion: 0, quantity: 0 }));
  read(engine);
  const afterTravel = engine.preview(observation({ elapsedMs: 3600000, sequence: 4,
    result: { accepted: true, actionType: 'add', productId: 'milk', quantity: 2 } }),
  actor(['objective-1'], { uncertainGoalIds: ['objective-1'] }), [], 1);
  assert.equal(afterTravel.valid, true);
  assert.equal(fieldState(afterTravel).status, 'unavailable');
  assert.ok(afterTravel.state.context.listAgeMs >= 3600000);
  engine.commit();
  const repeatedResult = engine.preview(observation({ elapsedMs: 3600000, sequence: 4,
    result: { accepted: true, actionType: 'add', productId: 'milk', quantity: 2 } }),
  actor(['objective-1'], { uncertainGoalIds: ['objective-1'] }), [], 1);
  assert.equal(repeatedResult.state.context.unreviewedQuantityChanges, 2);
});

test('empty uncertainty declaration cannot clear computed uncertainty; active and external current-display uses differ', () => {
  const engine = new WholeTraceCognitionEngine(profile({ capacity: 1, confusion: 0, quantity: 0 }));
  read(engine, [goal(), goal('objective-2')], ['objective-1']);
  const missing = engine.preview(observation(), actor(['objective-1'], { activity: 'interest' }), [], 60000);
  assert.equal(missing.valid, false);
  assert.match(missing.errors.join('; '), /uncertainGoalIds must include objective-1/);
  const external = engine.preview(observation({ readObjectives: [goal(), goal('objective-2')] }), actor(),
    [use('requiredQuantity', 1, 'current-display', 'objective-2')], 1);
  assert.equal(external.valid, true, 'actual external list access does not consume another working-memory slot');
  assert.equal(external.state.activeGoals.length, 1);
});

test('wire schemas reject silent values, certainty injection, conflicting updates and invalid guesses', () => {
  assert.equal(validateWholeTraceMemoryUses([]).valid, true);
  assert.equal(validateWholeTraceMemoryUses([{ goalId: 'objective-1', field: 'requiredQuantity', mode: 'guess' }]).valid, false);
  assert.equal(validateWholeTraceMemoryUses([use('requiredQuantity', 0, 'guess')]).valid, false);
  assert.equal(validateWholeTraceMemoryUses([{ ...use('name', '우유'), source: 'archive' }]).valid, false);
  assert.equal(validateWholeTraceMemoryUses([use('name', '우유'), use('name', '우유', 'guess')]).valid, false);
  assert.equal(validateWholeTraceMemoryUpdate(undefined).valid, true);
  assert.equal(validateWholeTraceMemoryUpdate([{ type: 'selfRecall', goalId: 'objective-1', values: {} }]).valid, false);
  assert.equal(validateWholeTraceMemoryUpdate([{ type: 'selfRecall', goalId: 'objective-1', values: { requiredQuantity: 2 }, status: 'clear' }]).valid, false);
  assert.equal(validateWholeTraceMemoryUpdate([{ type: 'selfRecall', goalId: 'objective-1', values: { requiredQuantity: 2 } },
    { type: 'deactivate', goalId: 'objective-1' }]).valid, false);
});

test('preview is transactional and snapshots, observation values and supplied profile cannot mutate accepted state', () => {
  const supplied = profile(), engine = new WholeTraceCognitionEngine(supplied);
  supplied.coefficients.interest = 999;
  const displayed = observation({ readObjectives: [goal()] });
  const pending = engine.preview(displayed, actor(), [use('requiredQuantity', 1)], 1);
  assert.equal(pending.valid, true);
  assert.equal(engine.snapshot().decisionIndex, -1);
  pending.state.activeGoals[0].fields.requiredQuantity.value = 99;
  displayed.readObjectives[0].quantity = 88;
  const accepted = engine.commit();
  assert.equal(accepted.activeGoals[0].fields.requiredQuantity.value, 1);
  accepted.activeGoals[0].fields.requiredQuantity.value = 77;
  assert.equal(engine.snapshot().activeGoals[0].fields.requiredQuantity.value, 1);
  const before = engine.snapshot();
  const invalid = engine.preview(observation(), actor(), [use('requiredQuantity', 2)], 1);
  assert.equal(invalid.valid, false);
  assert.deepEqual(engine.snapshot(), before);
  assert.throws(() => engine.commit(), /requires a valid preview/);
  assert.equal(engine.profile.coefficients.interest, .48);
  engine.profile.coefficients.interest = 999;
  assert.equal(engine.profile.coefficients.interest, .48, 'public profile contents are immutable too');
});
