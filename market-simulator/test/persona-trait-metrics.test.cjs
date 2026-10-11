'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { extractUniversal, extract } = require('../src/personaValidationMetrics.cjs');
const { collectionFlags, collectionFindings } = require('../src/personaValidationFlags.cjs');
const spec = require('../validation/persona-trait-validation-spec.json');
const step = (id, type, extra = {}) => ({ id, type, reactionDelayMs: 100, ...extra });
const add = (id, productId, quantity = 1, extra = {}) => step(id, 'dragProduct', { productId, quantity, gesture: { outcome: 'drop' }, ...extra });
const goals = (...ids) => ({ config: { objectives: ids.map(productId => ({ productId, quantity: 1 })) } });
const actionFor = s => s.type === 'dragProduct' ? { type: 'add', productId: s.productId, quantity: s.quantity }
  : s.type === 'openShelf' ? { type: 'interact', station: s.stationId }
    : s.type === 'walkToAnchor' ? { type: 'walkToAnchor', anchorId: s.target.anchorId }
      : s.type === 'submitForReview' ? { type: 'submit' }
        : { type: s.type, ...(s.type === 'browse' ? { scrollFraction: s.scrollFraction } : {}) };
function fixture(steps, rows = []) {
  return { trace: { steps }, audit: { decisions: steps.map((s, index) => ({ decisionIndex: index,
    action: actionFor(s), delayMs: s.reactionDelayMs, before: { sequence: index, ...(rows[index]?.before ?? {}) },
    after: { result: { accepted: true }, ...(rows[index]?.after ?? {}) },
    actorState: { activity: 'goal', ...(rows[index]?.actorState ?? {}) }, basis: rows[index]?.basis,
  })) } };
}
test('universal spec uses traits and opportunity metrics, without person identities or accuracy-failure rules', () => {
  assert.deepEqual(new Set(spec.metrics.map(row => row.traitKey)), new Set(spec.traits));
  for (const metric of spec.metrics) {
    assert.equal(metric.personaId, undefined); assert.equal(metric.traitIndex, undefined);
    assert.ok(['up', 'down'].includes(metric.expectedDirection)); assert.ok(metric.evidenceType);
  }
  assert.ok(!spec.metrics.some(row => ['highLoadMismatchRate', 'correctionRate', 'independentSelectionRate'].includes(row.kind)));
});
test('generic non-curry interests require an exposed profile selector, and spontaneous task resumption counts', () => {
  const { trace, audit } = fixture([
    step('a', 'lookAround'), step('b', 'openShelf', { stationId: 'produce' }),
    add('c', 'apple'), step('d', 'closeStation'), add('e', 'milk'), step('f', 'submitForReview'),
  ], [
    { before: { visibleStations: [{ id: 'produce' }] } },
    { before: { visibleStations: [{ id: 'produce' }] }, actorState: { activity: 'interest' } },
    { before: { products: [{ id: 'apple' }] }, actorState: { activity: 'interest' } },
  ]);
  const result = extractUniversal(trace, goals('milk'), { attention: { interestProductWeights: { apple: 2 } } }, audit);
  assert.equal(result.metrics.interestDetourRate.value, 1);
  assert.equal(result.metrics.interestRecoveryRate.value, 1);
  assert.equal(result.metrics.interestDetourRate.evidenceType, 'observed-action+actor-declaration');
  assert.deepEqual(result.outcome.nonGoalPurchases.map(row => row.productId), ['apple']);
  assert.equal(result.outcome.completionRate, 1);
  const withoutInterest = extractUniversal(trace, goals('milk'), {}, audit);
  assert.equal(withoutInterest.metrics.interestDetourRate.value, null);
  assert.equal(withoutInterest.metrics.interestDetourRate.reason, 'no-profile-interest-selectors');
  assert.equal(withoutInterest.metrics.interestRecoveryRate.value, null);
});
test('interest products seen only after shelf entry do not retroactively prove an interest detour', () => {
  const { trace, audit } = fixture([step('a', 'openShelf', { stationId: 'produce' }), step('b', 'pause')], [
    { actorState: { activity: 'interest' } }, { before: { products: [{ id: 'apple' }] }, actorState: { activity: 'interest' } },
  ]);
  const result = extractUniversal(trace, goals('milk'), { attention: { interestCategoryWeights: { produce: 1 } } }, audit);
  assert.equal(result.metrics.interestDetourRate.denominator, 1);
  assert.equal(result.metrics.interestDetourRate.value, 0);
});
test('full task outcome distinguishes 1/5 early give-up from zero mismatches among the one attempted goal', () => {
  const snapshot = goals('apple', 'milk', 'water', 'banana', 'eggs');
  const trace = { steps: [add('a', 'apple'), step('b', 'giveUp')] };
  const legacy = extract(trace, snapshot, {});
  assert.equal(legacy.highLoadMismatchRate.value, 0); assert.equal(legacy.highLoadMismatchRate.denominator, 1);
  const result = extractUniversal(trace, snapshot, {});
  assert.equal(result.outcome.completionRate, 0.2); assert.equal(result.outcome.completedGoalCount, 1);
  assert.equal(result.outcome.unattemptedGoalCount, 4); assert.equal(result.outcome.missingGoalCount, 4);
  assert.equal(result.outcome.ending, 'giveUp'); assert.equal(result.outcome.actorCompleted, false);
  assert.equal(result.terminationReview.status, 'review');
  assert.equal(result.terminationReview.signals[0].code, 'early-give-up-without-observed-difficulty');
  assert.equal(result.terminationReview.signals[0].severity, 'review');
});
test('system purchase and submit suffix does not complete the actor task', () => {
  const trace = { generation: { systemCompletion: { firstStepId: 'system' } }, steps: [
    add('actor', 'apple'), add('system', 'milk'), step('submit', 'submitForReview'),
  ] };
  const result = extractUniversal(trace, goals('apple', 'milk'), {});
  assert.equal(result.outcome.completedGoalCount, 1); assert.equal(result.outcome.actorCompleted, false);
  assert.equal(result.outcome.ending, 'incomplete'); assert.equal(result.outcome.systemCompletion.present, true);
});
test('interest purchases that physically fulfill a goal also count as relevant attempts in full task outcome', () => {
  const trace = { steps: [add('interest', 'milk', 1, { attentionTag: 'interest' }), step('end', 'submitForReview')] };
  const result = extractUniversal(trace, goals('milk'), {});
  assert.equal(result.outcome.attemptedGoalCount, 1); assert.equal(result.outcome.completedGoalCount, 1);
  assert.equal(result.outcome.unattemptedGoalCount, 0); assert.deepEqual(result.outcome.goals[0].evidence, ['interest']);
  assert.equal(extract(trace, goals('milk'), {}).highLoadMismatchRate.denominator, 0);
});
test('missing opportunities and missing authored timings remain null, not zero or NaN', () => {
  const result = extractUniversal({ steps: [{ id: 'a', type: 'openShelf', stationId: 'fresh' }] }, goals('milk'), {});
  for (const kind of ['helpSeekingRate', 'persistenceResponseRate', 'interestDetourRate', 'interestRecoveryRate', 'comparisonRate', 'newShelfDelayMs']) {
    assert.equal(result.metrics[kind].value, null, kind); assert.equal(result.coverage[kind].opportunityCount, 0, kind);
  }
  assert.equal(result.metrics.newShelfDelayMs.missingTimingCount, 1);
  assert.equal(result.metrics.newShelfDelayMs.evidenceType, 'authored-timing');
});
test('same rejected action repeated after feedback is not a persistence response; accepted strategy change is', () => {
  const walk = (id, anchorId) => step(id, 'walkToAnchor', { target: { anchorId } });
  const rejection = { result: { accepted: false, message: 'blocked' }, lastActionError: 'blocked' };
  const repeated = fixture([walk('a', 'blocked'), walk('b', 'blocked'), step('c', 'giveUp')], [
    { after: rejection }, { before: rejection, after: rejection }, { before: rejection },
  ]);
  const failure = extractUniversal(repeated.trace, goals('milk'), {}, repeated.audit);
  assert.equal(failure.metrics.persistenceResponseRate.numerator, 0);
  assert.ok(failure.metrics.persistenceResponseRate.denominator > 0);
  assert.equal(failure.terminationReview.status, 'clear');
  const changed = fixture([walk('a', 'blocked'), walk('b', 'alternative'), step('c', 'pause')], [
    { after: rejection }, { before: rejection },
  ]);
  const success = extractUniversal(changed.trace, goals('milk'), {}, changed.audit);
  assert.equal(success.metrics.persistenceResponseRate.value, 1);
  assert.equal(success.metrics.persistenceResponseRate.byEvidenceType['observed-feedback'].responses, 1);
  const rejectedHelp = fixture([walk('a', 'blocked'), step('b', 'viewHelp'), step('c', 'giveUp')], [
    { after: rejection }, { before: rejection, after: rejection }, { before: rejection },
  ]);
  const unavailableHelp = extractUniversal(rejectedHelp.trace, goals('milk'), {}, rejectedHelp.audit);
  assert.equal(unavailableHelp.metrics.helpSeekingRate.numerator, 0);
  assert.equal(unavailableHelp.metrics.persistenceResponseRate.numerator, 0);
});
test('declared uncertainty is labeled separately and routine cashier operations do not count as help', () => {
  const uncertain = fixture([step('a', 'viewHelp'), step('b', 'giveUp')], [
    { actorState: { uncertainGoalIds: ['objective-1'] } },
  ]);
  const result = extractUniversal(uncertain.trace, goals('milk'), {}, uncertain.audit);
  assert.equal(result.metrics.helpSeekingRate.value, 1);
  assert.equal(result.metrics.helpSeekingRate.byEvidenceType['actor-declaration'].opportunities, 1);
  assert.equal(result.metrics.helpSeekingRate.evidenceType, 'observed-action+actor-declaration');
  assert.equal(result.terminationReview.observedDifficultyCount, 0);
  assert.equal(result.terminationReview.declaredUncertaintyCount, 1);
  assert.equal(result.terminationReview.status, 'review');
  const cashier = { steps: [step('a', 'talkToStaff', { choice: 'requestCashier' })] };
  assert.equal(extractUniversal(cashier, goals('milk')).metrics.helpSeekingRate.value, null);
});
test('zero error variance preserves legacy code but is informational, never a universal failure', () => {
  const samples = ['a', 'b'].map(tracePath => ({ tracePath, snapshot: goals('milk'), trace: { steps: [add('a', 'milk')] } }));
  assert.ok(collectionFlags(samples).includes('zero-error-variance'));
  const finding = collectionFindings(samples).find(row => row.code === 'zero-error-variance');
  assert.equal(finding.severity, 'info'); assert.match(finding.interpretation, /not evidence/);
});
