'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { extractUniversal, actorEvents } = require('../src/validation/personaValidationMetrics.cjs');
const { KINDS, extractFirstPlay } = require('../src/validation/personaValidationFirstPlay.cjs');
const { cliffsDelta, bootstrap, judge } = require('../src/validation/personaValidationStatistics.cjs');
const { summarizeTraitFindings } = require('../src/validation/personaTraitValidationRun.cjs');
const snapshot = { config: { objectives: [{ id: 'milk-goal', productId: 'milk', quantity: 1, match: 'exact' }] } };
const products = [{ id: 'milk', name: '흰 우유', detail: '1 L' }, { id: 'milk-small', name: '흰 우유', detail: '200 mL' }];
const step = (type, extra = {}) => ({ type, ...extra });
const shelf = () => step('openShelf', { stationId: 'fresh' });
const add = extra => step('dragProduct', { productId: 'milk', quantity: 1, gesture: { outcome: 'drop' }, ...extra });
function fixture(rows, bundle) {
  const steps = rows.map((row, index) => ({ id: `s${index}`, ...row }));
  const actionFor = event => event.type === 'dragProduct' ? { type: 'add', productId: event.productId, quantity: event.quantity }
    : event.type === 'openShelf' ? { type: 'interact', station: event.stationId }
      : event.type === 'walkToAnchor' ? { type: 'walkToAnchor', anchorId: event.target.anchorId }
        : { type: event.type, ...(event.type === 'browse' ? { scrollFraction: event.scrollFraction } : {}) };
  const audit = { decisions: steps.map((event, index) => ({ decisionIndex: index, action: actionFor(event),
    before: { sequence: index, ...(event.before ?? {}) }, after: { result: { accepted: true }, ...event.after },
    actorState: event.actorState, basis: event.basis, choiceResolution: event.choiceResolution,
    reason: event.reason, delayMs: event.reactionDelayMs })) };
  return { trace: { experienceMode: 'first-play', steps }, audit, evidence: { bundle } };
}
function extract(value, version = 2) {
  return extractUniversal(value.trace, snapshot, {}, value.audit, value.evidence, { analysisVersion: version });
}
const initial = high => fixture(high ? [step('lookAround'), step('pause'), step('readList'), shelf()] : [shelf()]);
const operation = high => fixture(high ? [shelf(), step('lookAround'), add()] : [shelf(), add()]);
const text = high => fixture(high ? [shelf(), step('lookAround', { before: { products } }), add({ before: { products } })]
  : [shelf(), add({ before: { products } })]);
function route(high) {
  const waypoints = ['A', 'B', 'C'].map(anchorId => ({ anchorId, waypointId: `W${anchorId}` }));
  const menus = { start: ['A', 'B'], WA: ['B', 'C'], WB: ['A', 'C'] };
  const walk = (location, target) => step('walkToAnchor', { target: { anchorId: target },
    before: { phase: 'shopping', view: 'world', activeStation: null, anchors: menus[location].map(id => ({ id })) },
    choiceResolution: { source: { location, navigationStateId: 'state' } } });
  return fixture([walk('start', 'A'), walk('WA', 'B'), walk('WB', high ? 'A' : 'C')], {
    worldReference: { waypoints }, choiceCatalog: { navigation: [{ navigationStateId: 'state',
      locations: Object.entries(menus).map(([location, anchors]) => ({ location, choiceIds: anchors.map(id => `walk/W${id}`) })) }] },
  });
}
for (const [axis, build] of Object.entries({ initialCaution: initial, operationLearning: operation, routeReliance: route, textCueLoad: text })) {
  test(`${axis}: eight manually authored high/low traces support the direction; reversing them contradicts it`, () => {
    const kind = KINDS[axis];
    const pairs = Array.from({ length: 8 }, () => [extract(build(true)).metrics[kind].value, extract(build(false)).metrics[kind].value]);
    assert.ok(pairs.every(pair => pair.every(Number.isFinite)));
    const finding = rows => ({ evidenceType: 'observed-action', status: judge(cliffsDelta(rows.map(row => row[0]), rows.map(row => row[1])),
      bootstrap(rows, `fixture-${axis}`, 200), 'up', .33, rows.length, 8) });
    assert.equal(summarizeTraitFindings([finding(pairs)]).status, 'supported');
    assert.equal(summarizeTraitFindings([finding(pairs.map(([higher, lower]) => [lower, higher]))]).status, 'contradicted');
  });
}
test('analysisVersion 2 is opt-in; v1 and unspecified extraction retain precisely the same result', () => {
  const value = text(true);
  const old = extractUniversal(value.trace, snapshot, {}, value.audit, value.evidence);
  assert.deepEqual(extract(value, 1), old);
  for (const kind of Object.values(KINDS)) assert.equal(old.metrics[kind], undefined);
  const current = extract(value);
  for (const [kind, metric] of Object.entries(old.metrics)) assert.deepEqual(current.metrics[kind], metric);
  assert.deepEqual(current.outcome, old.outcome);
});
test('no first-play opportunities and missing display/menu fields remain null with explicit reasons', () => {
  const empty = extract(fixture([]));
  for (const kind of Object.values(KINDS)) {
    assert.equal(empty.metrics[kind].value, null); assert.equal(empty.coverage[kind].status, 'unexercised');
    assert.ok(empty.metrics[kind].reason);
  }
  const value = route(true); delete value.evidence.bundle;
  assert.equal(extract(value).metrics.routeRelianceRate.value, null);
  assert.equal(extract(value).metrics.routeRelianceRate.reason, 'missing-saved-navigation-menu-or-choice-source');
  const absentLabels = fixture([shelf(), add({ before: { products: products.map(({ id }) => ({ id })) } })]);
  assert.equal(extract(absentLabels).metrics.textCueLoadRate.value, null);
  assert.equal(extract(absentLabels).metrics.textCueLoadRate.reason, 'missing-observed-product-labels-or-display');
  const revisit = initial(true); revisit.trace.experienceMode = 'revisit';
  for (const kind of Object.values(KINDS)) assert.equal(extract(revisit).metrics[kind].value, null);
});
test('a second use is not an operation-learning opportunity, and one preparation cannot satisfy two first uses', () => {
  const result = extract(fixture([shelf(), add(), step('lookAround'), add(), step('lookAround'), step('viewCart'), step('checkout')]));
  const metric = result.metrics.operationLearningRate;
  assert.deepEqual(metric.firstUses.map(row => row.operation), ['open', 'add', 'viewCart', 'checkout']);
  assert.equal(metric.denominator, 4); assert.equal(metric.numerator, 1);
  assert.equal(metric.firstUses.find(row => row.operation === 'add').preparationStepId, null);
  assert.equal(metric.firstUses.find(row => row.operation === 'checkout').preparationStepId, null);
});
test('initial caution retains one beginning opportunity when the actor stops before opening or adding', () => {
  const result = extract(fixture([step('lookAround'), step('pause'), step('giveUp')]));
  assert.equal(result.metrics.initialCautionCount.denominator, 1);
  assert.equal(result.metrics.initialCautionCount.value, 2);
  assert.deepEqual(result.metrics.initialCautionCount.manifestationEvidence, ['s0', 's1']);
  assert.equal(result.metrics.operationLearningRate.value, null);
});
test('interest purchases and family members exposed only on different pages are not text-cue opportunities', () => {
  const interest = text(true); interest.audit.decisions.at(-1).actorState = { activity: 'interest' };
  assert.equal(extract(interest).metrics.textCueLoadRate.value, null);
  const separate = fixture([shelf(), step('lookAround', { before: { products: [products[1]] } }), add({ before: { products: [products[0]] } })]);
  assert.equal(extract(separate).metrics.textCueLoadRate.value, null);
});
test('route opportunity needs a previously visited option in both the actual visible set and saved legal menu', () => {
  const invisible = route(true); invisible.audit.decisions[2].before.anchors = [{ id: 'C' }];
  assert.equal(extract(invisible).metrics.routeRelianceRate.value, null);
  const illegal = route(true); illegal.evidence.bundle.choiceCatalog.navigation[0].locations[2].choiceIds = ['walk/WC'];
  assert.equal(extract(illegal).metrics.routeRelianceRate.value, null);
  const freshOnly = route(false); freshOnly.audit.decisions[2].before.anchors = [{ id: 'C' }];
  assert.equal(extract(freshOnly).metrics.routeRelianceRate.value, null);
});
test('C2: existing comparison/help responses own their actions; new axes never reuse those manifestations', () => {
  const compared = extract(fixture([shelf(), step('browse', { scrollFraction: 1, before: { products } }), add({ before: { products } })]));
  assert.equal(compared.metrics.comparisonRate.value, 1);
  assert.equal(compared.metrics.textCueLoadRate.value, 0);
  assert.deepEqual(compared.metrics.textCueLoadRate.excludedOverlapEvidence, ['s1']);
  const helped = extract(fixture([step('walkToAnchor', { target: { anchorId: 'blocked' }, after: { result: { accepted: false } } }),
    step('viewHelp', { before: { lastActionError: 'blocked' } }), step('closeView'), shelf()]));
  assert.equal(helped.metrics.helpSeekingRate.value, 1);
  assert.equal(helped.metrics.initialCautionCount.value, 0);
  assert.equal(helped.metrics.operationLearningRate.value, 0);
  const checkedText = extract(text(true));
  assert.equal(checkedText.metrics.textCueLoadRate.value, 1);
  assert.equal(checkedText.metrics.operationLearningRate.value, 0);
  const caution = extract(initial(true));
  assert.equal(caution.metrics.initialCautionCount.value, 3);
  assert.equal(caution.metrics.operationLearningRate.value, 0);
  for (const result of [compared, helped, checkedText, caution]) {
    const manifestations = Object.values(KINDS).flatMap(kind => result.metrics[kind].manifestationEvidence);
    assert.equal(new Set(manifestations).size, manifestations.length);
  }
});
test('authored reasons, activities and duration do not manufacture first-play behavioral evidence', () => {
  const value = text(false), original = extract(value);
  for (const decision of value.audit.decisions) {
    decision.reason = 'I cautiously compare the text and learn the operation'; decision.delayMs = 999999;
    decision.actorState = { activity: 'compare', orientation: 'unfamiliar', task: 'orient and check' };
  }
  const changed = extract(value);
  for (const kind of Object.values(KINDS)) assert.deepEqual(changed.metrics[kind], original.metrics[kind]);
  const events = actorEvents(route(true).trace, route(true).audit);
  assert.equal(events[0].choiceResolution.source.location, 'start');
});
test('declaration-only difficulty overlap removes the new opportunity instead of manufacturing a zero', () => {
  const initialConflict = extract(fixture([step('viewHelp', { actorState: { uncertainGoalIds: ['milk-goal'] } }),
    step('closeView'), shelf()]));
  assert.equal(initialConflict.metrics.helpSeekingRate.value, 1, 'the original definition is unchanged');
  for (const kind of ['initialCautionCount', 'operationLearningRate']) {
    assert.equal(initialConflict.metrics[kind].value, null);
    assert.equal(initialConflict.metrics[kind].reason, 'declared-only-overlap-unresolvable');
    assert.ok(initialConflict.metrics[kind].excludedOpportunityEvidence.length);
  }
  const textConflict = extract(fixture([shelf(), step('lookAround', { before: { products },
    actorState: { uncertainGoalIds: ['milk-goal'] } }), add({ before: { products } })]));
  assert.equal(textConflict.metrics.textCueLoadRate.value, null);
  assert.equal(textConflict.metrics.textCueLoadRate.reason, 'declared-only-overlap-unresolvable');
  assert.deepEqual(textConflict.metrics.textCueLoadRate.excludedOpportunityEvidence, ['s2']);
  assert.deepEqual(textConflict.coverage.textCueLoadRate.excludedOpportunityEvidence, ['s2']);
  assert.equal(textConflict.coverage.textCueLoadRate.exclusionReason, 'declared-only-overlap-unresolvable');
  assert.equal(textConflict.metrics.operationLearningRate.denominator, 1, 'the independent first open remains eligible');
  assert.deepEqual(textConflict.metrics.operationLearningRate.excludedOpportunityEvidence, ['s2']);
});
test('route visits require recorded arrival outcomes and absent UI fields are missing evidence', () => {
  const unknown = route(true);
  unknown.audit.decisions.forEach(row => { delete row.after; });
  assert.equal(extract(unknown).metrics.routeRelianceRate.value, null);
  assert.equal(extract(unknown).metrics.routeRelianceRate.reason, 'missing-recorded-walk-arrival');
  assert.equal(extract(unknown).coverage.routeRelianceRate.missingArrivalCount, 3);
  assert.deepEqual(extract(unknown).coverage.routeRelianceRate.missingEvidenceReasons, ['missing-recorded-walk-arrival']);
  const incomplete = route(true);
  incomplete.audit.decisions.forEach(row => { delete row.before.phase; });
  assert.equal(extract(incomplete).metrics.routeRelianceRate.value, null);
  assert.equal(extract(incomplete).metrics.routeRelianceRate.reason, 'missing-saved-navigation-menu-or-choice-source');
  assert.deepEqual(extract(route(true)).metrics.routeRelianceRate.choices[0].priorVisitEvidence, ['s0']);
});
test('route declaration-only conflicts exclude the opportunity, while unknown arrivals never imply an unvisited option', () => {
  const declared = route(true), events = actorEvents(declared.trace, declared.audit);
  const metric = extractFirstPlay({ trace: declared.trace, events, goals: [], evidence: declared.evidence,
    reservedEvents: [events[2]], declaredOnlyOverlapEvents: [events[2]], isGoalProduct: () => false }).routeRelianceRate;
  assert.equal(metric.value, null);
  assert.equal(metric.reason, 'declared-only-overlap-unresolvable');
  assert.deepEqual(metric.excludedOpportunityEvidence, ['s2']);
  function missingArrival(choices, target = 'A') {
    const value = route(true);
    value.audit.decisions[1].after = {};
    value.evidence.bundle.choiceCatalog.navigation[0].locations[2].choiceIds = choices.map(id => `walk/W${id}`);
    value.audit.decisions[2].before.anchors = choices.map(id => ({ id }));
    value.trace.steps[2].target.anchorId = target; value.audit.decisions[2].action.anchorId = target;
    return extract(value).metrics.routeRelianceRate;
  }
  const noCertainNew = missingArrival(['A', 'B']);
  assert.equal(noCertainNew.value, null);
  assert.equal(noCertainNew.reason, 'missing-recorded-walk-arrival');
  assert.deepEqual(noCertainNew.unknownVisitExclusionEvidence, ['s2']);
  const certainAlternative = missingArrival(['A', 'B', 'C']);
  assert.equal(certainAlternative.value, 1);
  assert.deepEqual(certainAlternative.choices[0].unvisitedAvailableAnchorIds, ['C']);
  assert.deepEqual(certainAlternative.choices[0].unknownVisitAnchorIds, ['B']);
  const unknownSelected = missingArrival(['A', 'B', 'C'], 'B');
  assert.equal(unknownSelected.value, null);
  assert.deepEqual(unknownSelected.unknownVisitExclusionEvidence, ['s2']);
});
