'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { extractSequenceMetrics, summarizeSequenceMetrics } = require('../src/validation/personaValidationSequence.cjs');
const snapshot = { config: { objectives: [{ id: 'milk-goal', productId: 'milk', quantity: 2 }] } };
const add = (productId, quantity = 1, extra = {}) => ({ type: 'dragProduct', productId, quantity, gesture: { outcome: 'drop' }, ...extra });
function measure(rows, target = snapshot) {
  const steps = [{ id: 'automatic-start', type: 'start', reactionDelayMs: 900000 },
    ...rows.map((row, index) => ({ id: `s${index}`, reactionDelayMs: 100, ...row })),
    { id: 'system-completion', type: 'submitForReview', reactionDelayMs: 900000 }];
  const decisions = steps.slice(1, -1).map((step, index) => ({ decisionIndex: index, before: { sequence: index + 1, ...step.before },
    after: step.after, delayMs: step.reactionDelayMs,
    action: step.type === 'dragProduct' ? { type: 'add', productId: step.productId, quantity: step.quantity }
      : step.type === 'removeProduct' ? { type: 'remove', productId: step.productId, quantity: step.quantity }
      : { type: step.type }, actorState: { activity: step.interest ? 'interest' : 'shop' },
    basis: { intent: step.interest ? 'interest' : 'task', goalId: step.goalId ?? null } }));
  return extractSequenceMetrics({ steps, generation: { systemCompletion: { firstStepId: 'system-completion' } } }, target, {}, { decisions });
}
const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-10, `${value} != ${expected}`);

test('sequence timing uses actor choices and describes variability and upper tail', () => {
  const result = measure([100, 200, 300, 400].map(reactionDelayMs => ({ type: 'pause', reactionDelayMs })));
  assert.equal(result.descriptiveOnly, true); assert.equal(result.usedForPrimaryVerdict, false);
  const timing = result.delayDistribution;
  assert.equal(timing.n, 4); assert.equal(timing.median, 250); assert.equal(timing.iqr, 150);
  close(timing.coefficientOfVariation, Math.sqrt(50000 / 3) / 250);
  assert.deepEqual(timing.upperTenPercent, { p90: 370, n: 1, mean: 400, maximum: 400 });
  assert.deepEqual(timing.observations[0].stepIds, ['s0']);
  assert.equal(measure([{ type: 'pause', reactionDelayMs: 0 }]).delayDistribution.coefficientOfVariation, null);
});

test('automatic replay closes between actor choices do not add timings or transitions', () => {
  const trace = { steps: [{ id: 'a', type: 'viewCart', reactionDelayMs: 40 },
    { id: 'auto', type: 'closeView', reactionDelayMs: 10000 }, { id: 'b', type: 'readList', reactionDelayMs: 60 }] };
  const audit = { decisions: [{ before: { sequence: 0 }, action: { type: 'viewCart' } },
    { before: { sequence: 1 }, action: { type: 'readList' } }] };
  const result = extractSequenceMetrics(trace, snapshot, {}, audit);
  assert.equal(result.delayDistribution.n, 2); assert.equal(result.delayDistribution.mean, 50);
  assert.deepEqual(result.actionTransitions.bigrams.map(({ from, to, count }) => ({ from, to, count })),
    [{ from: 'viewCart', to: 'readList', count: 1 }]);
});

test('no opportunities stay null and are not converted to zero observations', () => {
  const empty = measure([]);
  assert.equal(empty.delayDistribution.status, 'unexercised'); assert.equal(empty.delayDistribution.median, null);
  assert.equal(empty.actionTransitions.entropyBits, null); assert.equal(empty.actionTransitions.counts, null);
  assert.equal(empty.errorTaxonomy.counts.quantityOmission.count, null);
  assert.equal(empty.recovery.recovered, null); assert.equal(empty.perseveration.count, null);
  const missing = measure([{ type: 'pause', reactionDelayMs: undefined }]);
  assert.equal(missing.delayDistribution.n, 0); assert.equal(missing.delayDistribution.missingTimingCount, 1);
});

test('transition entropy and grouped bigrams respect trace boundaries', () => {
  const sequenceMetrics = measure(['readList', 'viewCart', 'readList', 'pause'].map(type => ({ type })));
  close(sequenceMetrics.actionTransitions.entropyBits, 2 / 3);
  assert.equal(sequenceMetrics.actionTransitions.counts.readList.viewCart, 1);
  assert.equal(sequenceMetrics.actionTransitions.probabilities.readList.pause, .5);
  const grouped = summarizeSequenceMetrics([{ personaId: 'a', condition: 'low', sequenceMetrics },
    { personaId: 'a', condition: 'low', sequenceMetrics }]);
  assert.equal(grouped.groups[0].actionTransitions.n, 6);
  close(grouped.groups[0].actionTransitions.entropyBits, 2 / 3);
  assert.equal(grouped.groups[0].actionTransitions.counts.pause.readList, 0);
});

test('error taxonomy retains evidence and excludes interest and intermediate quantity drags', () => {
  const good = measure([add('milk'), add('milk'), { type: 'viewCart' }, add('milk', 1, { interest: true }), add('curry', 1, { interest: true })]);
  assert.equal(good.errorTaxonomy.counts.quantityOmission.count, 0);
  assert.equal(good.errorTaxonomy.counts.quantityExcess.count, 0);
  assert.deepEqual(good.errorTaxonomy.errors, []);
  const wrong = measure([add('milk-small'), { type: 'viewCart' }, add('milk', 3), { type: 'viewCart' }, add('curry')]);
  assert.equal(wrong.errorTaxonomy.counts.specificationMismatch.count, 1);
  assert.equal(wrong.errorTaxonomy.counts.quantityExcess.count, 1);
  assert.equal(wrong.errorTaxonomy.counts.nonTargetPurchase.count, 1);
  assert.deepEqual(wrong.errorTaxonomy.errors.find(error => error.kind === 'specificationMismatch').stepIds, ['s0']);
  assert.deepEqual(wrong.errorTaxonomy.errors.find(error => error.kind === 'quantityExcess').stepIds, ['s2', 's3']);
  const omitted = measure([add('milk'), { type: 'viewCart' }]);
  assert.equal(omitted.errorTaxonomy.counts.quantityOmission.count, 1);
  const confused = measure([add('eggs', 1, { goalId: 'milk-goal' })]);
  assert.equal(confused.errorTaxonomy.counts.similarProductConfusion.count, 1);
});

test('feedback recovery counts actor actions until full correction and preserves unresolved nulls', () => {
  const rows = [{ type: 'readList' }, add('milk', 4), { type: 'viewCart', before: { cart: { milk: 4 } } },
    { type: 'removeProduct', productId: 'milk', quantity: 1 }, { type: 'readList' },
    { type: 'removeProduct', productId: 'milk', quantity: 1 }];
  const recovery = measure(rows).recovery;
  assert.equal(recovery.opportunityCount, 1); assert.equal(recovery.recovered, 1);
  assert.equal(recovery.episodes[0].actionsToFirstImprovement, 2);
  assert.equal(recovery.episodes[0].actionsToRecovery, 4);
  assert.deepEqual(recovery.episodes[0].recoveryStepIds, ['s5']);
  const unresolved = measure(rows.slice(0, 5)).recovery;
  assert.equal(unresolved.unresolved, 1); assert.equal(unresolved.episodes[0].actionsToRecovery, null);
  assert.equal(unresolved.actionsToRecovery.median, null);
});

test('perseveration requires the same demonstrably wrong selection after observed difficulty', () => {
  const failed = { result: { accepted: false, message: '거절' }, lastActionError: '거절' };
  const result = measure([add('milk-small', 1, { after: failed }),
    { type: 'viewCart', before: failed }, add('milk-small', 1, { after: failed }),
    { type: 'viewCart', before: failed }, add('milk-small', 1, { after: failed })]);
  assert.equal(result.perseveration.count, 2);
  assert.deepEqual(result.perseveration.repeats.map(row => row.repeatedStepIds), [['s2'], ['s4']]);
  assert.equal(measure([add('milk'), add('milk')]).perseveration.count, null);
  assert.equal(measure([add('curry', 1, { interest: true, after: failed }),
    { type: 'viewCart', before: failed }, add('curry', 1, { interest: true, after: failed })]).perseveration.count, null);
});

test('legacy traces without sidecars remain readable and extraction is source-independent', () => {
  const trace = { steps: [{ id: 'start', type: 'start', reactionDelayMs: 50000 },
    { id: 'list', type: 'readList', reactionDelayMs: 50 }] };
  const original = JSON.stringify(trace);
  const first = extractSequenceMetrics(trace, snapshot);
  const second = extractSequenceMetrics({ ...trace, source: 'future-reference', generation: { provider: 'unspecified' } }, snapshot);
  assert.deepEqual(first, second); assert.equal(first.delayDistribution.n, 1);
  assert.equal(JSON.stringify(trace), original);
});
