'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { buildSnapshots } = require('../scripts/build-validation-snapshots.cjs');
const { inspectAnchor, checkoutReturnability } = require('../scripts/check-whole-trace-reachability.cjs');
const camera = require('../../frontend/src/game/marketWorldCamera.ts');
const { getWorldCameraFrame } = require('../../frontend/src/game/worldZoom.ts');
const { getMarketHudOcclusionRect } = require('../../frontend/src/game/marketHudLayout.ts');
const { wholeReplayWaypointCatalog, visibleAnchors, resolveReplayAnchor } = require('../../frontend/src/game/marketReplayPerception.ts');
const { isMarketNavigationSegmentClear } = require('../../frontend/src/game/marketNavigation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { wholeTraceChoiceFrame } = require('../src/wholeTrace/wholeTraceChoices.ts');
const { TraceGuard } = require('../src/traceValidation.ts');

// Regenerate the geometry: no saved output, actor candidate, or trace is edited.
const snapshots = buildSnapshots({ setId: 'checkout-return-regression', environmentSeed: 'trait-v3-pilot-20261111' });
const scenario = snapshot => ({ environment: snapshot.environment, cashierAvailability: snapshot.cashierAvailability,
  presentation: snapshot.presentation });
const at = (catalog, x, y) => catalog.find(w => w.point.x === x && w.point.y === y);

test('the 390x600 old camera admits the W122/W134 trap despite reaching a checkout from start', () => {
  const s = scenario(snapshots.low), original = camera.getMarketWorldCameraFrame;
  try {
    camera.getMarketWorldCameraFrame = (point, p, bounds) => getWorldCameraFrame(point, p.viewport, p.zoom, bounds);
    const result = inspectAnchor(s, s.presentation);
    assert.ok(result.checkoutStationIds.length > 0);
    assert.equal(result.reachablePoints, 133);
    assert.deepEqual(result.trappedWaypointIds, ['W122', 'W134']);
    const catalog = wholeReplayWaypointCatalog(s.environment, s.cashierAvailability);
    const from = at(catalog, 880, 400), to = at(catalog, 800, 320);
    assert.equal(isMarketNavigationSegmentClear(s.environment, from.point, to.point, s.cashierAvailability), true);
    const frame = camera.getMarketWorldCameraFrame(from.point, s.presentation, s.environment.world);
    const y = s.presentation.viewport.height / 2 + (to.point.y - frame.center.y) * s.presentation.zoom;
    const hud = getMarketHudOcclusionRect(s.presentation);
    assert.equal(y, 196);
    assert.ok(y >= hud.top && y <= hud.bottom);
    assert.equal(resolveReplayAnchor(s.environment, from.point, to.anchorId, s.presentation, s.cashierAvailability), null);
  } finally { camera.getMarketWorldCameraFrame = original; }
});

test('new low/high snapshot states can return from every reachable waypoint to a staffed checkout', () => {
  for (const snapshot of Object.values(snapshots)) {
    const s = scenario(snapshot);
    // This fixed snapshot set starts with both counters staffed; its navigation
    // has no cashier-call transition into an empty-first-counter state.
    assert.deepEqual(s.cashierAvailability, { checkout: true, 'checkout-2': true });
    const result = inspectAnchor(s, s.presentation);
    assert.ok(result.reachablePoints > 100);
    assert.deepEqual(result.trappedWaypointIds, []);
    assert.equal(result.checkoutReturnablePoints, result.reachablePoints);
    assert.deepEqual(result.staffedCheckoutTrappedWaypointIds, []);
    assert.equal(result.staffedCheckoutReturnablePoints, result.reachablePoints);
  }
});

test('return analysis does not count an empty checkout as a staffed destination', () => {
  const graph = { cashierAvailability: { checkout: false, 'checkout-2': true }, nodes: [
    { waypointId: 'A', allowedWaypointIds: ['B'], nearbyStations: [] },
    { waypointId: 'B', allowedWaypointIds: ['A'], nearbyStations: [{ id: 'checkout', kind: 'checkout' }] },
    { waypointId: 'C', allowedWaypointIds: [], nearbyStations: [{ id: 'checkout-2', kind: 'checkout' }] },
  ] };
  assert.deepEqual(checkoutReturnability(graph, ['A', 'B', 'C']), { checkoutReturnablePoints: 3, trappedWaypointIds: [] });
  assert.deepEqual(checkoutReturnability(graph, ['A', 'B', 'C'], { staffedOnly: true }),
    { checkoutReturnablePoints: 1, trappedWaypointIds: ['A', 'B'] });
});

test('restored return choices are visible, source-bound, and execute with the shared movement guards', () => {
  for (const startPoint of [{ x: 880, y: 400 }, { x: 960, y: 400 }]) {
    const template = snapshots.low, environment = structuredClone(template.environment);
    environment.spawn = startPoint;
    const snapshot = createMarketReplaySnapshot(createMarketSession(template.config, environment), undefined, template.presentation);
    const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'checkout-return', maxActions: 100, maxRepairs: 0, timingProfile: 'original' };
    const bundle = buildWholeTraceBundle(settings, 'checkout-return-test'), guard = new TraceGuard(snapshot, undefined, undefined, undefined, true, true);
    const graph = bundle.worldReference.navigation.states[0], byId = new Map(graph.nodes.map(n => [n.waypointId, n]));
    const queue = graph.start.allowedWaypointIds.map(id => [id]), seen = new Set(graph.start.allowedWaypointIds);
    let path;
    for (const route of queue) {
      const node = byId.get(route.at(-1));
      if (node.nearbyStations.some(s => s.kind === 'checkout' && graph.cashierAvailability[s.id])) { path = route; break; }
      for (const id of node.allowedWaypointIds) if (!seen.has(id)) { seen.add(id); queue.push([...route, id]); }
    }
    assert.ok(path?.length > 0, 'A test-only search witnesses a return path; actors never receive this path');
    let location = 'start';
    for (const id of path) {
      const waypoint = bundle.worldReference.waypoints.find(w => w.waypointId === id), position = guard.observe().playerPosition;
      const frame = wholeTraceChoiceFrame(guard.observeActor(), bundle, { location, navigationStateId: graph.stateId });
      assert.ok(frame.availableChoices.some(c => c.choiceId === `walk/${id}`));
      assert.ok(visibleAnchors(environment, position, template.presentation).some(a => a.id === waypoint.anchorId));
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1])
        assert.deepEqual(resolveReplayAnchor(environment, { x: position.x + dx, y: position.y + dy }, waypoint.anchorId, template.presentation), waypoint.point);
      const result = guard.execute({ id: `return-${id}`, type: 'walkToAnchor', target: { anchorId: waypoint.anchorId },
        movement: { style: 'steady', speedMultiplier: 1, running: false, motorSeed: 'checkout-return', accelerationMs: 0 },
        timeoutMs: 10000, reactionDelayMs: 0, reason: '계산대 복귀 경로의 실행 회귀 검증' });
      assert.ok(Math.hypot(result.after.playerPosition.x - waypoint.point.x, result.after.playerPosition.y - waypoint.point.y) < 1);
      location = id;
    }
    assert.ok(guard.observeActor().visibleStations.some(s => s.kind === 'checkout' && s.near));
  }
});
