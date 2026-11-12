'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { extractUniversal, actorEvents } = require('../src/personaValidationMetrics.cjs');
const { extractFirstPlay } = require('../src/personaValidationFirstPlay.cjs');
const snapshot = { config: { objectives: [] } };
const point = n => `P${n.toString(16).padStart(64, '0')}`;
const source = n => ({ location: point(n), navigationStateId: `nav-v2-${n.toString(16).padStart(64, '0')}` });
const anchor = id => ({ choiceId: `walk/W${id}`, anchorId: id });
function fixture(rows, { symbolic = false } = {}) {
  const trace = { experienceMode: 'first-play', steps: [] }, audit = { decisions: [] };
  const bundle = { ...(!symbolic ? { movementVersion: 'directional-v2' } : {}),
    worldReference: { waypoints: ['A', 'B', 'C'].map(anchorId => ({ anchorId, waypointId: `W${anchorId}` })) },
    choiceCatalog: { navigation: [], entries: ['A', 'B', 'C'].map(id => ({ choiceId: `walk/W${id}`,
      action: { type: 'walk', waypointId: `W${id}` } })) } };
  let from = 0;
  for (const [index, row] of rows.entries()) {
    const type = row.type ?? 'walkToAnchor', to = row.to ?? from + 1;
    const frame = n => symbolic ? { location: n === 0 ? 'start' : `W${n}`, navigationStateId: 'cashiers-11' } : source(n);
    const menu = row.menu ?? ['A', 'B'], target = row.target ?? 'A';
    const action = type === 'walkToAnchor' ? { type, anchorId: target }
      : type === 'moveDirection' ? { type, direction: row.direction ?? 'north', durationMs: 400 } : { type };
    trace.steps.push({ id: `s${index}`, type,
      ...(type === 'walkToAnchor' ? { target: { anchorId: target } }
        : type === 'moveDirection' ? { direction: action.direction, durationMs: action.durationMs } : {}) });
    const choiceId = type === 'walkToAnchor' ? `walk/W${target}` : `${type === 'moveDirection' ? 'moveDirection' : 'control'}/${type === 'moveDirection' ? action.direction : type}`;
    const choiceSource = { ...frame(from), phase: 'shopping', view: 'world', activeStation: null, pageIndex: null };
    const resolution = { source: choiceSource, choiceRef: { source: choiceSource, choiceId } };
    const movement = ['walkToAnchor', 'moveDirection'].includes(type) ? { actionType: type, accepted: true,
      outcome: row.outcome ?? 'moved', ...(type === 'walkToAnchor' ? { targetAnchorId: target } : {}),
      arrivedAnchorIds: row.arrived ?? (type === 'walkToAnchor' ? [target] : []) } : null;
    audit.decisions.push({ decisionIndex: index, action, choiceResolution: resolution,
      before: { sequence: index, phase: 'shopping', view: 'world', activeStation: null, anchors: menu.map(id => ({ id })) },
      after: { result: { accepted: true, actionType: type } },
      navigationEvidence: { version: 'continuous-route-v1', decisionIndex: index,
        from: frame(from), to: frame(to), fromPositionId: point(from), toPositionId: point(to),
        allowedAnchors: menu.map(anchor), movement } });
    let state = bundle.choiceCatalog.navigation.find(s => s.navigationStateId === frame(from).navigationStateId);
    if (!state) { state = { navigationStateId: frame(from).navigationStateId, locations: [] }; bundle.choiceCatalog.navigation.push(state); }
    state.locations.push({ location: frame(from).location, choiceIds: menu.map(id => `walk/W${id}`) });
    from = to;
  }
  return { trace, audit, evidence: { bundle } };
}
function extract(value, route = true) {
  return extractUniversal(value.trace, snapshot, {}, value.audit, value.evidence,
    { analysisVersion: 2, ...(route ? { routeOpportunityVersion: 'continuous-route-v1' } : {}) });
}
const route = symbolic => fixture([{ target: 'A' }, { target: 'B', menu: ['B', 'C'] },
  { target: 'A', menu: ['A', 'C'] }], { symbolic });

test('explicit route option uses actual menus for both symbolic and continuous sources', () => {
  for (const symbolic of [false, true]) {
    const value = route(symbolic);
    // Continuous frames use actual observations rather than stale graph entries.
    // Symbolic controls still require their original graph menu intersection.
    if (!symbolic) value.evidence.bundle.choiceCatalog.navigation = [];
    const result = extract(value), metric = result.metrics.routeRelianceRate;
    assert.equal(metric.routeOpportunityVersion, 'continuous-route-v1');
    assert.equal(metric.value, 1); assert.equal(metric.denominator, 1);
    assert.deepEqual(metric.choices[0].priorVisitEvidence, ['s0']);
    assert.deepEqual(metric.choices[0].availableAnchorIds, ['A', 'C']);
    assert.equal(result.coverage.routeRelianceRate.routeOpportunityVersion, 'continuous-route-v1');
    assert.equal(extract(value, false).metrics.routeRelianceRate.value, symbolic ? 1 : null);
  }
});

test('default analysis outputs ignore new navigation evidence byte for byte', () => {
  const value = route(true), original = structuredClone(value);
  original.audit.decisions.forEach(row => { delete row.navigationEvidence; });
  for (const options of [{}, { analysisVersion: 1 }, { analysisVersion: 2 }]) {
    const run = v => extractUniversal(v.trace, snapshot, {}, v.audit, v.evidence, options);
    assert.equal(JSON.stringify(run(value)), JSON.stringify(run(original)));
  }
  assert.throws(() => extractUniversal(value.trace, snapshot, {}, value.audit, value.evidence,
    { analysisVersion: 1, routeOpportunityVersion: 'continuous-route-v1' }), /analysisVersion 2/);
});

test('the saved anchor menu must be complete, while order has no measurement meaning', () => {
  for (const symbolic of [false, true]) {
    const complete = route(symbolic);
    complete.audit.decisions.forEach(row => row.navigationEvidence.allowedAnchors.reverse());
    assert.equal(extract(complete).metrics.routeRelianceRate.value, 1);
    const removedAlternative = route(symbolic);
    removedAlternative.audit.decisions[2].navigationEvidence.allowedAnchors = [anchor('A')];
    const metric = extract(removedAlternative).metrics.routeRelianceRate;
    assert.equal(metric.value, null);
    assert.ok(metric.missingEvidenceReasons.includes('incomplete-or-expanded-current-anchor-menu'));
  }
});

test('symbolic control menus retain their static legal intersection instead of treating visibility as permission', () => {
  const value = route(true);
  const menu = value.evidence.bundle.choiceCatalog.navigation[0].locations[2];
  menu.choiceIds = ['walk/WA'];
  assert.equal(extract(value).metrics.routeRelianceRate.reason, 'invalid-continuous-navigation-evidence');
  value.audit.decisions[2].navigationEvidence.allowedAnchors = [anchor('A')];
  const metric = extract(value).metrics.routeRelianceRate;
  assert.equal(metric.denominator, 0);
  assert.equal(metric.reason, 'no-visited-and-unvisited-walk-options');
  value.evidence.bundle.choiceCatalog.navigation = [];
  assert.ok(extract(value).metrics.routeRelianceRate.missingEvidenceReasons.includes('missing-static-navigation-menu'));
});

test('continuous source positions match their hashes even if an altered endpoint chain is internally consistent', () => {
  for (const symbolic of [false, true]) {
    const value = route(symbolic);
    value.audit.decisions.forEach((row, index) => {
      row.navigationEvidence.fromPositionId = point(index + 100);
      row.navigationEvidence.toPositionId = point(index + 101);
    });
    const metric = extract(value).metrics.routeRelianceRate;
    if (symbolic) assert.equal(metric.value, 1, 'symbolic waypoints and raw position hashes remain distinct');
    else {
      assert.equal(metric.value, null);
      assert.ok(metric.missingEvidenceReasons.includes('continuous-position-identity-mismatch'));
    }
  }
});

test('recorded movement evidence cannot contradict an available actual after-result', () => {
  for (const mutation of [result => { result.accepted = false; },
    result => { result.actionType = 'moveDirection'; }, result => { result.movement = { outcome: 'blocked' }; },
    result => { result.anchorId = 'C'; }]) {
    const value = route(false);
    mutation(value.audit.decisions[0].after.result);
    const metric = extract(value).metrics.routeRelianceRate;
    assert.equal(metric.value, null);
    assert.ok(metric.missingEvidenceReasons.includes('recorded-movement-result-mismatch'));
  }
});

test('a verified directional anchor arrival establishes a visit without inferring its chosen destination', () => {
  const value = fixture([{ type: 'moveDirection', arrived: ['A'] },
    { target: 'B', menu: ['B', 'C'] }, { target: 'A', menu: ['A', 'C'] },
    { type: 'moveDirection', menu: ['B', 'C'] }]);
  const metric = extract(value).metrics.routeRelianceRate;
  assert.equal(metric.denominator, 1); assert.equal(metric.numerator, 1);
  assert.deepEqual(metric.choices[0].priorVisitEvidence, ['s0']);
  assert.deepEqual(metric.directionalDiagnostics, { decisionCount: 2, atMixedAnchorMenuCount: 1,
    returnEndpointCount: 0, blockedCount: 0, partiallyBlockedCount: 0, confirmedAnchorArrivalCount: 1,
    excludedEvidence: ['s0', 's3'] });
});

test('directional-only movement has no scored destination opportunity; exact positive returns stay descriptive', () => {
  const value = fixture([{ type: 'moveDirection', to: 1 }, { type: 'moveDirection', to: 0 },
    { type: 'moveDirection', to: 0, outcome: 'blocked' },
    { type: 'moveDirection', to: 1, outcome: 'partially-blocked' }]);
  const result = extract(value), metric = result.metrics.routeRelianceRate;
  assert.equal(metric.value, null); assert.equal(metric.denominator, 0);
  assert.equal(metric.reason, 'directional-destination-not-offered');
  assert.equal(metric.directionalDiagnostics.returnEndpointCount, 2);
  assert.equal(metric.directionalDiagnostics.blockedCount, 1);
  assert.equal(metric.directionalDiagnostics.partiallyBlockedCount, 1);
  assert.equal(result.metrics.persistenceResponseRate.denominator, 0);
  assert.equal(result.metrics.helpSeekingRate.denominator, 0);
  assert.equal(result.metrics.interestDetourRate.denominator, 0);
});

test('missing navigation evidence leaves route history unknown without changing the other metrics', () => {
  const value = route(false), complete = extract(value);
  delete value.audit.decisions[0].navigationEvidence;
  const result = extract(value), metric = result.metrics.routeRelianceRate;
  assert.equal(metric.value, null); assert.equal(metric.reason, 'missing-continuous-navigation-evidence');
  assert.equal(metric.missingObservationCount, 1);
  assert.equal(metric.directionalDiagnostics.returnEndpointCount, null, 'missing history is not a verified zero');
  for (const [kind, expected] of Object.entries(complete.metrics)) if (kind !== 'routeRelianceRate')
    assert.deepEqual(result.metrics[kind], expected);
});

test('mismatched source, history, menu, arrival or inferred directional target cannot manufacture a route score', () => {
  const mutations = [
    value => { value.audit.decisions[1].navigationEvidence.from.location = point(99); },
    value => { value.audit.decisions[1].navigationEvidence.fromPositionId = point(99); },
    value => { value.audit.decisions[1].navigationEvidence.decisionIndex = 0; },
    value => { value.audit.decisions[1].before.anchors = []; },
    value => { value.audit.decisions[0].navigationEvidence.movement.arrivedAnchorIds = ['C']; },
    value => { value.audit.decisions[1].navigationEvidence.movement.targetAnchorId = 'A'; },
    value => { value.audit.decisions[1].navigationEvidence.allowedAnchors[0].choiceId = 'walk/WA'; },
    value => { value.audit.decisions[1].navigationEvidence.from.x = 10; },
  ];
  for (const mutate of mutations) {
    const value = route(false); mutate(value);
    const metric = extract(value).metrics.routeRelianceRate;
    assert.equal(metric.value, null); assert.equal(metric.denominator, 0);
    assert.equal(metric.reason, 'invalid-continuous-navigation-evidence');
    assert.ok(metric.navigationEvidenceFailures.length);
  }
  const direction = fixture([{ type: 'moveDirection' }]);
  direction.audit.decisions[0].navigationEvidence.movement.targetAnchorId = 'A';
  assert.equal(extract(direction).metrics.routeRelianceRate.value, null);
});

test('existing declaration-only and observed-action ownership exclusions remain in force', () => {
  const value = route(false), events = actorEvents(value.trace, value.audit);
  const metric = extractFirstPlay({ trace: value.trace, events, goals: [], evidence: value.evidence,
    reservedEvents: [events[2]], declaredOnlyOverlapEvents: [events[2]], isGoalProduct: () => false,
    routeOpportunityVersion: 'continuous-route-v1' }).routeRelianceRate;
  assert.equal(metric.value, null); assert.equal(metric.reason, 'declared-only-overlap-unresolvable');
  assert.deepEqual(metric.excludedOpportunityEvidence, ['s2']);
});
