'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDirectionalReachability, evaluateDirectionalReachability, replayDirectionalWitness } =
  require('../scripts/whole-trace-directional-reachability.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { DEFAULT_REPLAY_PRESENTATION } = require('../../frontend/src/game/marketReplayPerception.ts');
const { directionalInputSlices, MARKET_DIRECTIONAL_MOVE_SPEED } = require('../../frontend/src/game/marketDirectionalInput.ts');
const { resolveMarketEnvironmentMovement } = require('../../frontend/src/game/marketMovement.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const hud = require('../../frontend/src/game/marketHudLayout.ts');

const snapshot = createMarketReplaySnapshot(createMarketSession());
const input = { environment: snapshot.environment, cashierAvailability: snapshot.cashierAvailability };
const screen = { ...input, presentation: DEFAULT_REPLAY_PRESENTATION };
let cachedGraph;
const defaultGraph = () => cachedGraph ??= buildDirectionalReachability(input);

// Re-integrate every retained edge through the production functions, without
// using the helper's private integration implementation or trusting its points.
test('BFS parent chains retain exact collision endpoints and never snap onto the visited grid', () => {
  const before = JSON.stringify(input), graph = defaultGraph();
  const nodes = new Map(graph.nodes.map(node => [node.key, node]));
  assert.equal(nodes.size, graph.nodes.length);
  assert.equal(graph.complete, true); assert.equal(graph.truncated, false);
  assert.equal(graph.attemptedEdges, graph.nodes.length * 8);
  assert.deepEqual(nodes.get(graph.startKey).point, snapshot.environment.spawn);
  let nonGridCentreEndpoints = 0;
  for (const node of graph.nodes) {
    const [column, row] = node.key.split(',').map(Number);
    assert.equal(Math.floor(node.point.x / graph.spacingPx), column);
    assert.equal(Math.floor(node.point.y / graph.spacingPx), row);
    if (node.point.x !== (column + .5) * graph.spacingPx || node.point.y !== (row + .5) * graph.spacingPx) nonGridCentreEndpoints++;
    if (node.previous === null) { assert.equal(node.depth, 0); continue; }
    const parent = nodes.get(node.previous);
    assert.ok(parent); assert.equal(node.depth, parent.depth + 1);
    let actual = { ...parent.point };
    for (const slice of directionalInputSlices(node.direction, graph.durationMs, graph.movement)) actual =
      resolveMarketEnvironmentMovement(snapshot.environment, actual, {
        x: slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
        y: slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
      }, snapshot.cashierAvailability).position;
    assert.deepEqual(node.point, actual, `exact incoming motor endpoint for ${node.key}`);
    assert.deepEqual(node.edge.actualDelta, { dx: actual.x - parent.point.x, dy: actual.y - parent.point.y });
  }
  assert.ok(nonGridCentreEndpoints > graph.nodes.length / 2);
  assert.equal(JSON.stringify(input), before, 'diagnosis never changes the supplied environment or cashier state');
});

test('directional geometry BFS never reads the HUD while goal perception continues to use it', t => {
  const baseline = defaultGraph();
  t.mock.method(hud, 'getMarketHudOcclusionRect', () => { throw new Error('HUD must not filter a motor edge'); });
  const graph = buildDirectionalReachability(input);
  assert.deepEqual(graph.nodes, baseline.nodes);
  assert.equal(graph.complete, baseline.complete);
  assert.equal(graph.attemptedEdges, baseline.attemptedEdges);
  assert.throws(() => evaluateDirectionalReachability(graph, screen), /HUD must not filter a motor edge/,
    'goal observations retain the existing visibility boundary');
});

test('a bounded search reports incomplete coverage and preserves replayable evidence in serialized graphs', () => {
  const graph = buildDirectionalReachability({ ...input, maxNodes: 5 });
  assert.equal(graph.nodes.length, 5); assert.equal(graph.complete, false); assert.equal(graph.truncated, true);
  assert.ok(graph.omittedCells > 0); assert.equal(graph.attemptedEdges, 40);
  const copied = JSON.parse(JSON.stringify(graph));
  const result = evaluateDirectionalReachability(copied, screen);
  assert.equal(result.complete, false); assert.equal(result.truncated, true);
  assert.ok(result.missingStationIds.length > 0);
  for (const field of ['spacingPx', 'durationMs', 'movement', 'maxNodes', 'attemptedEdges']) assert.deepEqual(result[field], graph[field]);
  assert.throws(() => evaluateDirectionalReachability(graph, { ...screen, cashierAvailability: {} }), /geometry changed/);
  assert.throws(() => buildDirectionalReachability({ ...input, maxNodes: 0 }), /positive integer/);
});

test('all default shelf and checkout witnesses replay from spawn and pass actual interaction guards', () => {
  const graph = JSON.parse(JSON.stringify(defaultGraph())), result = evaluateDirectionalReachability(graph, screen);
  const targetIds = snapshot.environment.stationDetails.filter(station => station.kind === 'shelf' || station.kind === 'checkout')
    .map(station => station.id).sort();
  assert.deepEqual(Object.keys(result.witnesses).sort(), targetIds);
  assert.deepEqual(result.missingStationIds, []);
  assert.equal(result.shelfStationIds.length, 5); assert.equal(result.checkoutStationIds.length, 2);
  for (const witness of Object.values(result.witnesses)) {
    assert.deepEqual(replayDirectionalWitness(graph, witness, input), witness.endpoint);
    const guard = new TraceGuard(snapshot, 'mechanical-reachability-probe', '1', 'test-fixture', true, true, false, true, false, false, false);
    for (const [index, step] of witness.steps.entries()) guard.execute({ ...step, id: `walk-${index}`,
      reactionDelayMs: 0, reason: 'Replay the recorded mechanical reachability witness' });
    assert.deepEqual(guard.observe().playerPosition, witness.endpoint, witness.stationId);
    assert.ok(guard.observeActor().visibleStations.some(station => station.id === witness.stationId && station.near));
    guard.execute({ id: 'interact', type: witness.kind === 'shelf' ? 'openShelf' : 'checkout',
      ...(witness.kind === 'shelf' ? { stationId: witness.stationId } : { checkoutId: witness.stationId }),
      reactionDelayMs: 0, reason: 'Verify the actual near-station interaction' });
    assert.equal(guard.observe().activeStation, witness.stationId);
    assert.equal(guard.observe().phase, witness.kind === 'shelf' ? 'shopping' : 'checkout');
  }
});
