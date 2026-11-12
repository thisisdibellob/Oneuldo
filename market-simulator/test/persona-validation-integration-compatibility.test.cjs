'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { DEFAULT_REPLAY_PRESENTATION, visibleAnchors, wholeReplayWaypointCatalog, wholeReplayWaypointGraph } = require('../../frontend/src/game/marketReplayPerception.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const { wholeTraceChoiceFrame } = require('../src/wholeTrace/wholeTraceChoices.ts');
const step = (type, extra = {}) => ({ id: type, type, reactionDelayMs: 1, timeoutMs: 120000, reason: 'compatibility fixture', ...extra });

test('requester panel is explicitly unsupported by the imported whole-trace contract', () => {
  const bundle = { worldReference: { navigation: { states: [{ stateId: 'fixture', nodes: [] }] } } };
  assert.throws(() => wholeTraceChoiceFrame({ phase: 'shopping', view: 'requester' }, bundle,
    { location: 'start', navigationStateId: 'fixture' }), /requester view is not supported/);
});

// Existing staff passages are not all on the 80px world grid. The new planning
// vocabulary must describe those current choices without changing their guards.
test('whole-trace graph preserves every existing visible grid and employee-offset anchor', () => {
  for (const seed of ['fidelity-low', 'whole-default']) {
    const session = createMarketSession({ seed });
    const catalog = wholeReplayWaypointCatalog(session.environment, session.cashierAvailability);
    const byAnchor = new Map(catalog.map(waypoint => [waypoint.anchorId, waypoint.waypointId]));
    const graph = wholeReplayWaypointGraph(session.environment, session.playerPosition,
      DEFAULT_REPLAY_PRESENTATION, session.cashierAvailability, catalog);
    let offGridVisible = 0;
    for (const waypoint of [{ waypointId: 'start', point: session.playerPosition }, ...catalog]) {
      const observed = visibleAnchors(session.environment, waypoint.point, DEFAULT_REPLAY_PRESENTATION, session.cashierAvailability);
      const allowed = waypoint.waypointId === 'start' ? graph.startAllowedWaypointIds
        : graph.nodes.find(node => node.waypointId === waypoint.waypointId).allowedWaypointIds;
      for (const anchor of observed) {
        assert.equal(anchor.label, '눈앞의 통로', 'existing actor observation text must stay unchanged');
        assert.ok(byAnchor.has(anchor.id), `${seed}: ${waypoint.waypointId} omitted ${anchor.id}`);
        const target = catalog.find(candidate => candidate.anchorId === anchor.id);
        if (target.point.x % 80 || target.point.y % 80) offGridVisible++;
      }
      assert.deepEqual(allowed, observed.map(anchor => byAnchor.get(anchor.id)).sort());
    }
    assert.ok(offGridVisible > 0, 'fixture must exercise the existing off-grid employee passages');
  }
});

function staffGuard(cashierCount) {
  const session = createMarketSession({ seed: 'visible-staff-reply', cashierRequestPenaltyPoints: 7, environment: {
    cashierCount, kioskLane: 'none', employeeCount: { min: 1, max: 1 },
  } });
  const employee = session.environment.stationDetails.find(station => station.kind === 'employee').id;
  const guard = new TraceGuard(createMarketReplaySnapshot(session), undefined, undefined, undefined, false, true);
  guard.execute(step('walkTo', { target: { stationId: employee }, movement: {
    style: 'steady', speedMultiplier: 1, motorSeed: 'compatibility-fixture',
  } }));
  guard.execute(step('talkToStaff', { stationId: employee, choice: 'open' }));
  return { guard, employee };
}

test('declined cashier request preserves the actual displayed feedback and existing penalty', () => {
  const { guard, employee } = staffGuard(1);
  const before = guard.observe();
  const empty = Object.keys(before.cashierAvailability).find(id => !before.cashierAvailability[id]);
  guard.execute(step('talkToStaff', { stationId: employee, choice: 'requestCashier', checkoutId: empty }));
  const after = guard.observe(), actor = guard.observeActor();
  assert.equal(after.cashierRequestFeedback.accepted, false);
  assert.equal(actor.result.message, after.cashierRequestFeedback.message);
  assert.match(actor.result.message, /이미.+계산원/);
  assert.doesNotMatch(actor.result.message, /계산을 도와드릴게요/);
  assert.equal(after.cashierAvailability[empty], false);
  assert.equal(after.score, before.score - 7);
  assert.equal(after.cashierRequestFeedback.penaltyPoints, 7);
  guard.execute(step('lookAround', { durationMs: 10 }));
  assert.equal(guard.observeActor().result.message, undefined);
});

test('fulfilled cashier request describes the actual counter rather than the legacy requested ID', () => {
  const { guard, employee } = staffGuard(0);
  guard.execute(step('talkToStaff', { stationId: employee, choice: 'requestCashier', checkoutId: 'checkout-2' }));
  const after = guard.observe();
  assert.equal(after.cashierRequestFeedback.accepted, true);
  assert.equal(after.selectedCheckoutId, 'checkout');
  assert.equal(guard.observeActor().result.message, after.cashierRequestFeedback.message);
  assert.match(guard.observeActor().result.message, /1번 계산대/);
});
