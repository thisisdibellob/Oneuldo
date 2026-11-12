'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { extractUniversal, extract } = require('../src/validation/personaValidationMetrics.cjs');
const { collectionFlags, collectionFindings } = require('../src/validation/personaValidationFlags.cjs');
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

// opportunityRows: per-opportunity records for spec v3 position-stability descriptions.
const metricCases = require('./fixtures/persona-trait-metric-cases.cjs');
const golden = require('./fixtures/persona-trait-metrics-golden.json');
const specV3 = require('../validation/persona-trait-validation-spec-v3.json');
function measureCase(c, opportunityRows) {
  const evidence = c.bundle ? { bundle: c.bundle } : {}, persona = c.persona ?? {}, rows = opportunityRows ? { opportunityRows: true } : {};
  return { extract: extract(c.trace, c.snapshot, persona, c.audit, evidence, rows),
    universal: extractUniversal(c.trace, c.snapshot, persona, c.audit, evidence, rows),
    universalV2: extractUniversal(c.trace, c.snapshot, persona, c.audit, evidence,
      { analysisVersion: 2, ...rows, ...(c.routeOpportunityVersion ? { routeOpportunityVersion: c.routeOpportunityVersion } : {}) }) };
}
const metricMaps = result => [result.extract, result.universal.metrics, result.universalV2.metrics];
function withoutRows(result) {
  const strip = metrics => Object.fromEntries(Object.entries(metrics).map(([kind, { opportunityRows, ...metric }]) => [kind, metric]));
  return { extract: strip(result.extract), universal: { ...result.universal, metrics: strip(result.universal.metrics) },
    universalV2: { ...result.universalV2, metrics: strip(result.universalV2.metrics) } };
}
const NON_RATE = { extract: ['firstShelfOrientationCount', 'interestRunLength', 'newShelfDelayMs', 'familiarSelectionDelayMs', 'highLoadMismatchRate'],
  universal: ['newShelfDelayMs', 'initialCautionCount'] };
test('opportunityRows leave every pre-existing metric field and order unchanged', () => {
  for (const c of metricCases.cases()) {
    assert.equal(JSON.stringify(measureCase(c, false)), JSON.stringify(golden[c.name]), `${c.name} default path`);
    assert.equal(JSON.stringify(withoutRows(measureCase(c, true))), JSON.stringify(golden[c.name]), `${c.name} without opportunityRows`);
    for (const metrics of metricMaps(measureCase(c, false))) assert.ok(Object.values(metrics).every(m => !Object.hasOwn(m, 'opportunityRows')));
  }
});
const allCases = () => [...metricCases.cases(), ...metricCases.extraCases()];
test('opportunityRows match denominator and numerator for every rate metric; non-rate metrics keep null', () => {
  let checkedRows = 0;
  for (const c of allCases()) {
    const result = measureCase(c, true);
    for (const [index, metrics] of metricMaps(result).entries()) for (const [kind, metric] of Object.entries(metrics)) {
      const label = `${c.name} ${['extract', 'universal', 'universalV2'][index]} ${kind}`;
      assert.ok(Object.hasOwn(metric, 'opportunityRows'), label);
      if ((index ? NON_RATE.universal : NON_RATE.extract).includes(kind)) { assert.equal(metric.opportunityRows, null, label); continue; }
      const rows = metric.opportunityRows;
      assert.ok(Array.isArray(rows), label);
      assert.equal(rows.length, metric.denominator, label);
      assert.equal(rows.filter(row => row.hit).length, metric.numerator, label);
      for (const row of rows) {
        assert.deepEqual(Object.keys(row), ['decisionIndex', 'hit', 'stepIds'], label);
        assert.ok(Number.isInteger(row.decisionIndex) && typeof row.hit === 'boolean' && row.stepIds.length > 0, label);
        assert.ok(row.stepIds.every(id => metric.evidence.includes(id) || metric.opportunityEvidence?.includes(id)), label);
      }
      assert.ok(rows.every((row, i) => !i || rows[i - 1].decisionIndex <= row.decisionIndex), `${label} opportunity order`);
      checkedRows += rows.length;
    }
  }
  assert.ok(checkedRows > 40);
  const rows = allCases().flatMap(c => Object.entries(measureCase(c, true).universalV2.metrics)
    .flatMap(([kind, m]) => (m.opportunityRows ?? []).map(row => [kind, row.hit])));
  for (const kind of specV3.metrics.filter(m => m.positionSplit).map(m => m.kind))
    for (const hit of [true, false]) assert.ok(rows.some(row => row[0] === kind && row[1] === hit), `${kind} has ${hit ? 'hit' : 'miss'} rows`);
});
test('opportunityRows identify the counted opportunity and its manifestation', () => {
  const byName = Object.fromEntries(metricCases.cases().map(c => [c.name, measureCase(c, true).universalV2.metrics]));
  assert.deepEqual(byName['checking-sequence'].postSelectionListRate.opportunityRows, [
    { decisionIndex: 1, hit: true, stepIds: ['s1', 's2', 's3'] }, { decisionIndex: 3, hit: false, stepIds: ['s3', 's4'] }]);
  assert.deepEqual(byName['comparison-and-text'].comparisonRate.opportunityRows, [
    { decisionIndex: 3, hit: true, stepIds: ['s2', 's3'] }, { decisionIndex: 6, hit: false, stepIds: ['s6'] }]);
  assert.deepEqual(byName['route-relies'].routeRelianceRate.opportunityRows, [{ decisionIndex: 2, hit: true, stepIds: ['s2'] }]);
  assert.deepEqual(byName['route-explores'].routeRelianceRate.opportunityRows, [{ decisionIndex: 2, hit: false, stepIds: ['s2'] }]);
  assert.deepEqual(byName['continuous-route-missing-evidence'].routeRelianceRate.opportunityRows, []);
  assert.deepEqual(byName.revisit.operationLearningRate.opportunityRows, []);
  assert.equal(byName.revisit.initialCautionCount.opportunityRows, null);
  const difficulty = byName['correction-and-difficulty'];
  assert.deepEqual(difficulty.helpSeekingRate.opportunityRows.map(row => row.decisionIndex),
    difficulty.persistenceResponseRate.opportunityRows.map(row => row.decisionIndex));
});
test('opportunityRows exclude decisions after system completion starts', () => {
  const systemIds = ['sys1', 'sys2', 'sys3', 'sys4', 'sys5', 'sys6'];
  const audited = metricCases.cases().find(c => c.name === 'system-completion');
  const fallback = { ...audited, audit: null };
  const uncut = { ...fallback, trace: { ...fallback.trace, generation: undefined } };
  const rowsOf = c => metricMaps(measureCase(c, true)).flatMap(metrics => Object.values(metrics).flatMap(m => m.opportunityRows ?? []));
  for (const c of [audited, fallback]) {
    const rows = rowsOf(c);
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.stepIds.every(id => !systemIds.includes(id))), 'system suffix leaked into opportunityRows');
    assert.ok(rows.every(row => row.decisionIndex < 2));
  }
  // Without the system boundary the same steps do create opportunities, so the check above is not vacuous.
  assert.ok(rowsOf(uncut).some(row => row.stepIds.some(id => systemIds.includes(id))));
});
