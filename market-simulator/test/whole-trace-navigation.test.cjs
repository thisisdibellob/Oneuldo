const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketEnvironment, isMarketEnvironmentBlocked } = require('../../frontend/src/game/marketEnvironment.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { isMarketNavigationSegmentClear } = require('../../frontend/src/game/marketNavigation.ts');
const { getWorldCameraFrame } = require('../../frontend/src/game/worldZoom.ts');
const { getPersona } = require('../src/personas.ts');
const { actorChoices } = require('../src/actorChoices.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate, WholeTraceCompileError } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');

// Portable reproduction of the world/presentation saved with both failed plans in
// output/trace-speed-comparison-20261008/whole-01/trace.json.whole-trace/bundle.json.
// The tests assert the audited geometry/behavior rather than a generated hash.
const savedEnvironmentConfig = {
  layoutId: 'classic', entranceConstruction: false, seed: 'market-1790906391403-1',
  employeeCount: { min: 1, max: 3 }, customerCount: { min: 1, max: 5 },
  pillarCount: { min: 1, max: 3 }, chairCount: 0, cashierCount: 'random', kioskPresent: 'random',
  shelfOrder: ['produce', 'fresh', 'household', 'meal', 'drink'],
};
const savedPresentation = {
  viewport: { width: 668, height: 853 }, zoom: 1.3, fontScale: 1, safeArea: { top: 0, bottom: 0 },
};
const requestId = 'whole-navigation-regression';
function fixture({ personaId = 'mild-intellectual-disability-adult', environment, presentation = savedPresentation, objectives } = {}) {
  environment ??= createMarketEnvironment(savedEnvironmentConfig);
  const session = createMarketSession({ seed: environment.seed, stockPerProduct: 5, ...(objectives ? { objectives } : {}) }, environment);
  const snapshot = createMarketReplaySnapshot(session, undefined, presentation);
  const settings = { snapshot, personaId, seed: 'whole-navigation-offline', timingProfile: 'original', maxActions: 100,
    llm: { model: 'gpt-6-luna', maxCalls: 1 } };
  return { settings, bundle: buildWholeTraceBundle(settings, requestId) };
}
function decision(bundle, action) {
  let intent = 'check', cueRefs;
  if (action.type === 'walk') {
    const target = bundle.worldReference.waypoints.find(w => w.waypointId === action.waypointId);
    assert.ok(target);
    intent = 'explore'; cueRefs = [`anchor:${target.anchorId}`];
  } else if (action.type === 'readList') cueRefs = ['list'];
  else if (action.type === 'interact') { intent = 'explore'; cueRefs = [`station:${action.station}`]; }
  else if (action.type === 'add') { intent = 'interest'; cueRefs = [`product:${action.productId}`]; }
  else if (action.type === 'requestCashier') { intent = 'help'; cueRefs = [`cashier:${action.checkoutId}`]; }
  else if (action.type === 'giveUp') { intent = 'finish'; cueRefs = ['persona:goal']; }
  else if (['viewHelp', 'closeStation'].includes(action.type)) cueRefs = ['view:world'];
  else throw new Error(`The navigation fixture must provide explicit visible evidence for ${action.type}`);
  return { action, delayMs: 450, reason: '현재 화면에서 확인한 단서로 조작한다', basis: { intent, cueRefs }, actorState: {
    activity: { explore: 'orient', help: 'check' }[intent] ?? intent,
    task: '현재 화면에서 확인한 단서로 조작한다', heldGoalIds: [], uncertainGoalIds: [],
    orientation: 'unfamiliar', triggerCueRefs: [...cueRefs],
  } };
}
const candidate = (bundle, actions) => ({ candidateVersion: '3', requestId, decisions: actions.map(action => decision(bundle, action)) });
const initialState = bundle => bundle.worldReference.navigation.states.find(s => s.stateId === bundle.worldReference.navigation.initialStateId);
const nodeAt = (bundle, state, point) => {
  const waypoint = bundle.worldReference.waypoints.find(w => w.point.x === point.x && w.point.y === point.y);
  assert.ok(waypoint, `Fixture has a waypoint at ${point.x},${point.y}`);
  const node = state.nodes.find(n => n.waypointId === waypoint.waypointId);
  assert.ok(node);
  return { waypoint, node };
};
// A graph search is used only by the test to witness structural reachability.
// Production bundles/compiler do not choose routes or preferred destinations.
function witnessPath(state, accepts) {
  const nodes = new Map(state.nodes.map(n => [n.waypointId, n]));
  const queue = state.start.allowedWaypointIds.map(id => [id]);
  const visited = new Set(state.start.allowedWaypointIds);
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index], node = nodes.get(path.at(-1));
    assert.ok(node, 'Every advertised neighbor has a node');
    if (accepts(node)) return path;
    for (const id of node.allowedWaypointIds) if (!visited.has(id)) {
      visited.add(id); queue.push([...path, id]);
    }
  }
  return null;
}
const walkActions = path => path.map(waypointId => ({ type: 'walk', waypointId }));
function guardFor(settings) {
  const p = getPersona(settings.personaId);
  return new TraceGuard(settings.snapshot, p.id, p.version, 'offline-test', true, true);
}

test('both audited wall/HUD hops stay excluded, and forged graph hints cannot bypass compilation', async () => {
  const { settings, bundle } = fixture();
  const state = initialState(bundle);
  assert.deepEqual(state.cashierAvailability, { checkout: true, 'checkout-2': true });
  assert.deepEqual(bundle.worldReference.navigation.states.map(s => s.stateId), ['cashiers-11']);
  assert.ok(bundle.worldReference.world.walls.some(w => w.x === 550 && w.y === 1020 && w.width === 300 && w.height === 20));
  for (const x of [720, 800]) {
    const from = nodeAt(bundle, state, { x, y: 1120 }), to = nodeAt(bundle, state, { x, y: 960 });
    // New catalog entries preserve existing geometry and opaque anchor IDs but
    // can shift the sorted W-number vocabulary; never use that rank as identity.
    const fromId = from.waypoint.waypointId, toId = to.waypoint.waypointId;
    assert.equal(Math.hypot(to.waypoint.point.x - from.waypoint.point.x, to.waypoint.point.y - from.waypoint.point.y), 160);
    assert.equal(isMarketEnvironmentBlocked(bundle.worldReference.world, to.waypoint.point, state.cashierAvailability), false);
    assert.equal(isMarketNavigationSegmentClear(bundle.worldReference.world, from.waypoint.point, to.waypoint.point, state.cashierAvailability), false);
    const presentation = bundle.worldReference.presentation;
    const frame = getWorldCameraFrame(from.waypoint.point, presentation.viewport, presentation.zoom, bundle.worldReference.world.world);
    const screenX = presentation.viewport.width / 2 + (to.waypoint.point.x - frame.center.x) * presentation.zoom;
    const screenY = presentation.viewport.height / 2 + (to.waypoint.point.y - frame.center.y) * presentation.zoom;
    assert.ok(screenX >= 124 && screenX <= 544 && screenY >= 100 && screenY <= 246, 'The target is covered by the saved list HUD');
    assert.equal(from.node.allowedWaypointIds.includes(toId), false);
    const path = witnessPath(state, n => n.waypointId === fromId);
    assert.ok(path, 'The rejected edge origin itself remains reachable');
    const forged = structuredClone(bundle);
    initialState(forged).nodes.find(n => n.waypointId === fromId).allowedWaypointIds.push(toId);
    await assert.rejects(compileWholeTraceCandidate(settings, forged,
      candidate(forged, [{ type: 'readList' }, ...walkActions(path), { type: 'walk', waypointId: toId }, { type: 'giveUp' }])), error => {
      assert.ok(error instanceof WholeTraceCompileError);
      assert.equal(error.validation.failedDecisionIndex, path.length + 1);
      assert.equal(error.validation.acceptedPrefixLength, path.length + 1);
      assert.equal(error.validation.before.result.anchorId, from.waypoint.anchorId);
      assert.equal(error.validation.before.anchors.some(a => a.id === to.waypoint.anchorId), false);
      assert.deepEqual(error.validation.validPrefix.slice(1).map(d => d.action.waypointId), path);
      return true;
    });
  }
});

test('clear corridor hops retain HUD directionality rather than becoming undirected proximity edges', () => {
  const { bundle } = fixture(), state = initialState(bundle);
  const upper = nodeAt(bundle, state, { x: 160, y: 480 }), lower = nodeAt(bundle, state, { x: 160, y: 640 });
  assert.equal(isMarketNavigationSegmentClear(bundle.worldReference.world, upper.waypoint.point, lower.waypoint.point, state.cashierAvailability), true);
  assert.equal(upper.node.allowedWaypointIds.includes(lower.waypoint.waypointId), true);
  assert.equal(lower.node.allowedWaypointIds.includes(upper.waypoint.waypointId), false);
  assert.deepEqual(bundle.worldReference.navigation.startPoint, bundle.worldReference.world.spawn);
  assert.deepEqual([...state.start.allowedWaypointIds].sort(), bundle.actorState.initialObservation.anchors.map(a =>
    bundle.worldReference.waypoints.find(w => w.anchorId === a.id).waypointId).sort());
});

test('an explicitly selected connected path reaches a usable shelf without changing its chosen hops', async () => {
  const { settings, bundle } = fixture(), state = initialState(bundle);
  const path = witnessPath(state, n => n.nearbyStations.some(s => s.kind === 'shelf'));
  assert.ok(path?.length > 1, 'The real world needs exploration before a shelf becomes nearby');
  const node = state.nodes.find(n => n.waypointId === path.at(-1));
  const station = node.nearbyStations.find(s => s.kind === 'shelf');
  const shelf = bundle.worldReference.shelves.find(s => s.stationId === station.id);
  const productId = shelf.pages[0].visibleProductIds[0];
  const result = await compileWholeTraceCandidate(settings, bundle,
    candidate(bundle, [{ type: 'readList' }, ...walkActions(path), { type: 'interact', station: station.id },
      { type: 'add', productId, quantity: 1 }, { type: 'giveUp' }]));
  assert.equal(result.acceptedActions, path.length + 4);
  assert.deepEqual(result.trace.steps.filter(s => s.type === 'walkToAnchor').map(s => s.target.anchorId),
    path.map(id => bundle.worldReference.waypoints.find(w => w.waypointId === id).anchorId));
  assert.equal(result.trace.steps.some(s => s.type === 'openShelf' && s.stationId === station.id), true);
  assert.equal(result.trace.steps.some(s => s.type === 'dragProduct' && s.productId === productId), true);
  const guard = guardFor(settings);
  for (const step of result.trace.steps) {
    const applied = guard.execute(step);
    for (const move of applied.actions.filter(a => a.type === 'move')) assert.ok(Math.hypot(move.dx, move.dy) <= 32);
  }
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});

test('world graph data does not make movement or a distant station available behind an open view', async () => {
  const { settings, bundle } = fixture(), state = initialState(bundle);
  assert.ok(state.start.allowedWaypointIds.length);
  const farShelf = bundle.worldReference.shelves.find(s => !state.start.nearbyStations.some(n => n.id === s.stationId));
  assert.ok(farShelf);
  for (const [actions, index] of [
    [[{ type: 'viewHelp' }, { type: 'walk', waypointId: state.start.allowedWaypointIds[0] }, { type: 'giveUp' }], 1],
    [[{ type: 'interact', station: farShelf.stationId }, { type: 'giveUp' }], 0],
  ]) await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(bundle, actions)), error => {
    assert.equal(error.validation.failedDecisionIndex, index);
    assert.equal(error.validation.acceptedPrefixLength, index);
    if (index) assert.deepEqual(error.validation.before.anchors, []);
    return true;
  });
});

test('cashier variants preserve waypoint identities and remove a passage when the called cashier occupies it', async () => {
  const environment = createMarketEnvironment({ ...savedEnvironmentConfig, cashierCount: 0 });
  // Synthetic occupancy perturbation: put one initially absent cashier on an
  // otherwise free lobby anchor to expose collision changes on this 80px grid.
  const checkout = environment.checkouts.find(c => c.id === 'checkout');
  checkout.cashierPoint = { x: 720, y: 1280 };
  checkout.cashierCollider = { x: 710, y: 1274, width: 20, height: 12 };
  environment.checkout = structuredClone(checkout);
  const { settings, bundle } = fixture({ environment }), empty = initialState(bundle);
  assert.equal(bundle.worldReference.navigation.initialStateId, 'cashiers-00');
  assert.deepEqual(bundle.worldReference.navigation.states.map(s => s.stateId).sort(), ['cashiers-00', 'cashiers-01', 'cashiers-10', 'cashiers-11']);
  const called = bundle.worldReference.navigation.states.find(s => s.stateId === 'cashiers-10');
  const target = nodeAt(bundle, empty, checkout.cashierPoint).waypoint;
  assert.ok(empty.start.allowedWaypointIds.includes(target.waypointId));
  assert.equal(called.start.allowedWaypointIds.includes(target.waypointId), false);
  assert.equal(isMarketEnvironmentBlocked(bundle.worldReference.world, target.point, empty.cashierAvailability), false);
  assert.equal(isMarketEnvironmentBlocked(bundle.worldReference.world, target.point, called.cashierAvailability), true);
  for (const state of bundle.worldReference.navigation.states) assert.deepEqual(state.nodes.map(n => n.waypointId), empty.nodes.map(n => n.waypointId));
  for (const node of called.nodes) assert.equal(node.allowedWaypointIds.includes(target.waypointId), false);
  const path = witnessPath(empty, n => n.nearbyStations.some(s => s.kind === 'employee'));
  assert.ok(path);
  const staff = empty.nodes.find(n => n.waypointId === path.at(-1)).nearbyStations.find(s => s.kind === 'employee');
  const prefix = [...walkActions(path), { type: 'interact', station: staff.id }, { type: 'requestCashier', checkoutId: 'checkout' }];
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, [...prefix, { type: 'closeStation' }, { type: 'giveUp' }]));
  const guard = guardFor(settings);
  let checkedRequest = false;
  for (const step of result.trace.steps) {
    guard.execute(step);
    if (step.type === 'talkToStaff' && step.choice === 'requestCashier') {
      assert.deepEqual(guard.observe().cashierAvailability, called.cashierAvailability);
      assert.equal(actorChoices(guard.observeActor()).some(c => c.action.type === 'requestCashier' && c.action.checkoutId === 'checkout'), false);
      assert.equal(actorChoices(guard.observeActor()).some(c => c.action.type === 'requestCashier' && c.action.checkoutId === 'checkout-2'), true);
      checkedRequest = true;
    }
  }
  assert.equal(checkedRequest, true);
  await assert.rejects(compileWholeTraceCandidate(settings, bundle,
    candidate(bundle, [...prefix, { type: 'requestCashier', checkoutId: 'checkout' }, { type: 'giveUp' }])), error => {
    assert.equal(error.validation.failedDecisionIndex, prefix.length);
    assert.equal(error.validation.acceptedPrefixLength, prefix.length);
    return true;
  });
});

test('navigation carries no persona preference or newly observed product knowledge', () => {
  const reference = fixture();
  for (const personaId of ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider']) {
    const { settings, bundle } = personaId === reference.settings.personaId ? reference : fixture({ personaId });
    const persona = getPersona(personaId), guard = guardFor(settings);
    const { behavior, ...characterMetadata } = bundle.persona;
    assert.deepEqual(characterMetadata, { id: persona.id, version: persona.version, name: persona.name,
      description: persona.description, character: persona.character });
    assert.equal(behavior.source.personaId, persona.id);
    assert.equal(behavior.source.version, persona.version);
    assert.deepEqual(bundle.worldReference.navigation, reference.bundle.worldReference.navigation);
    assert.deepEqual(bundle.worldReference.waypoints, reference.bundle.worldReference.waypoints);
    assert.deepEqual(bundle.worldReference.shelves, reference.bundle.worldReference.shelves);
    assert.deepEqual(bundle.worldReference.objectives, guard.observe().objectives);
    assert.deepEqual(bundle.actorState.initialObservation, guard.observeActor());
    assert.deepEqual(bundle.actorState.experience.observedThisVisit.discoveries.knownProducts, []);
    assert.deepEqual(bundle.actorState.experience.observedThisVisit.discoveries.anchors.map(a => a.id).sort(), bundle.actorState.initialObservation.anchors.map(a => a.id).sort());
    assert.ok(bundle.worldReference.waypoints.length > bundle.actorState.experience.observedThisVisit.discoveries.anchors.length);
    assert.equal(Object.hasOwn(bundle, 'generatorReference'), false);
    assert.ok(bundle.sourceFiles.length && bundle.sourceFiles.every(f => /^[0-9a-f]{64}$/.test(f.sha256)));
  }
  const differentTask = fixture({ objectives: [{ productId: 'curry', quantity: 3, match: 'exact' }] });
  assert.notDeepEqual(differentTask.bundle.worldReference.objectives, reference.bundle.worldReference.objectives);
  assert.deepEqual(differentTask.bundle.worldReference.navigation, reference.bundle.worldReference.navigation);
});
