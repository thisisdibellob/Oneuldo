'use strict';
// Read-only mechanical reachability probes. This module never edits snapshots,
// selects actor behavior, invokes a model, or relaxes any game collision guard.
require('../runtime.cjs');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
const { directionalInputSlices, MARKET_DIRECTIONAL_MOVE_SPEED } = require('../../frontend/src/game/marketDirectionalInput.ts');
const { resolveMarketEnvironmentMovement } = require('../../frontend/src/game/marketMovement.ts');
const { isMarketEnvironmentBlocked, isNearMarketStation } = require('../../frontend/src/game/marketEnvironment.ts');
const { visibleStations, validateReplayPresentation } = require('../../frontend/src/game/marketReplayPerception.ts');

const DIRECTIONS = Object.freeze(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);
const DEFAULT_MOVEMENT = Object.freeze({ speedMultiplier: .7, accelerationMs: 200 });
const EPSILON = 1e-7;
const geometryKey = (environment, cashierAvailability) => createHash('sha256')
  .update(canonicalMarketReplayJson({ environment, cashierAvailability })).digest('hex');
const pointKey = (point, spacingPx) => `${Math.floor(point.x / spacingPx)},${Math.floor(point.y / spacingPx)}`;
const targets = environment => environment.stationDetails.filter(station =>
  (station.kind === 'shelf' || station.kind === 'checkout') && station.available !== false);

/** Every edge is a complete valid motor input, including ramp-up and release.
 * The coordinate is never rounded, projected onto a grid, or moved to a target.
 */
function integrateDirection(environment, cashierAvailability, point, slices) {
  let position = { ...point }, movedDistancePx = 0, constrainedSlices = 0;
  for (const slice of slices) {
    const requested = { x: slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
      y: slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000 };
    const movement = resolveMarketEnvironmentMovement(environment, position, requested, cashierAvailability);
    movedDistancePx += movement.movedDistancePx;
    if (movement.outcome !== 'moved') constrainedSlices++;
    position = movement.position;
  }
  return { point: position, actualDelta: { dx: position.x - point.x, dy: position.y - point.y }, movedDistancePx,
    constrainedSlices, outcome: movedDistancePx < EPSILON ? 'blocked' : constrainedSlices ? 'partially-blocked' : 'moved' };
}

/** Exhaust the finite sampled graph unless the explicit node budget is reached.
 * A cell is only a visited key: all expansions retain one real arrival coordinate
 * and its witnessed parent. Keeping one arrival per cell may miss a route, but
 * cannot manufacture a successful path. "complete" means this sampled search was
 * exhausted, never that continuous free space has been exhaustively proved.
 */
function buildDirectionalReachability({ environment, cashierAvailability, spacingPx = 24, durationMs = 400,
  movement = DEFAULT_MOVEMENT, maxNodes = 20000, maximumBoundaryExamples = 32 } = {}) {
  if (!environment?.world || !environment.spawn || !Array.isArray(environment.stationDetails)) throw new Error('A complete environment is required');
  if (!cashierAvailability || typeof cashierAvailability !== 'object' || Array.isArray(cashierAvailability))
    throw new Error('Explicit cashierAvailability is required');
  if (!Number.isFinite(spacingPx) || spacingPx < 1 || spacingPx > 180) throw new Error('spacingPx must be in 1..180');
  if (!Number.isInteger(maxNodes) || maxNodes < 1) throw new Error('maxNodes must be a positive integer');
  if (!Number.isInteger(maximumBoundaryExamples) || maximumBoundaryExamples < 0 || maximumBoundaryExamples > 10000)
    throw new Error('maximumBoundaryExamples must be in 0..10000');
  // The shared validator checks directions, duration and movement bounds.
  const profiles = DIRECTIONS.map(direction => ({ direction, slices: directionalInputSlices(direction, durationMs, movement) }));
  if (isMarketEnvironmentBlocked(environment, environment.spawn, cashierAvailability)) throw new Error('The snapshot spawn is blocked');
  const started = performance.now(), nodes = [], byKey = new Map(), omittedKeys = new Set(), boundaryExamples = [];
  const goalStations = targets(environment);
  let attemptedEdges = 0, blockedEdges = 0, partiallyBlockedEdges = 0, duplicateEndpoints = 0;
  const remember = (point, previous, direction, edge, depth) => {
    const key = pointKey(point, spacingPx);
    const node = { key, point: { ...point }, previous, direction, depth,
      ...(edge ? { edge } : {}),
      // This is a geometry-only superset. Presentation and arrival-margin guards
      // are checked afresh by evaluateDirectionalReachability for every screen.
      nearbyStationIds: goalStations.filter(station => isNearMarketStation(environment, station.id, point, undefined, cashierAvailability))
        .map(station => station.id) };
    nodes.push(node); byKey.set(key, node);
  };
  remember(environment.spawn, null, null, null, 0);
  for (let index = 0; index < nodes.length; index++) {
    const parent = nodes[index];
    for (const { direction, slices } of profiles) {
      attemptedEdges++;
      const result = integrateDirection(environment, cashierAvailability, parent.point, slices);
      const edge = { direction, durationMs, outcome: result.outcome, actualDelta: result.actualDelta,
        movedDistancePx: result.movedDistancePx, constrainedSlices: result.constrainedSlices };
      if (result.outcome === 'blocked') blockedEdges++;
      if (result.outcome === 'partially-blocked') partiallyBlockedEdges++;
      if (result.outcome !== 'moved' && boundaryExamples.length < maximumBoundaryExamples)
        boundaryExamples.push({ fromKey: parent.key, from: { ...parent.point }, to: { ...result.point }, ...edge });
      if (result.movedDistancePx < EPSILON) continue;
      const key = pointKey(result.point, spacingPx);
      if (byKey.has(key)) { duplicateEndpoints++; continue; }
      if (nodes.length >= maxNodes) { omittedKeys.add(key); continue; }
      remember(result.point, parent.key, direction, edge, parent.depth + 1);
    }
  }
  const columns = Math.ceil(environment.world.width / spacingPx), rows = Math.ceil(environment.world.height / spacingPx);
  let totalWalkableCells = 0;
  for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
    const point = { x: Math.min((column + .5) * spacingPx, environment.world.width),
      y: Math.min((row + .5) * spacingPx, environment.world.height) };
    if (!isMarketEnvironmentBlocked(environment, point, cashierAvailability)) totalWalkableCells++;
  }
  const complete = omittedKeys.size === 0;
  return {
    schema: 'whole-trace-directional-reachability-v1', geometryKey: geometryKey(environment, cashierAvailability),
    spacingPx, durationMs, movement: { ...movement }, directions: [...DIRECTIONS],
    startKey: nodes[0].key, startPoint: { ...environment.spawn },
    nodes, reachablePoints: nodes.length, reachedPoints: nodes.length, reachableCells: nodes.length,
    totalPoints: columns * rows, totalWalkableCells,
    attemptedEdges, blockedEdges, partiallyBlockedEdges, duplicateEndpoints,
    blockedBoundaries: { count: blockedEdges + partiallyBlockedEdges, examples: boundaryExamples },
    complete, truncated: !complete, maxNodes, omittedCells: omittedKeys.size,
    elapsedMs: performance.now() - started,
    interpretation: {
      visited: 'Uniform cells deduplicate exact motor endpoints; expansion never snaps a coordinate to a cell centre.',
      complete: 'The finite sampled graph was exhausted within maxNodes; this is not a proof of continuous-space completeness.',
      totalPoints: 'All uniform cells covering the world rectangle, including blocked cells.',
      totalWalkableCells: 'Reference count of cells whose centre is unblocked; a reachable cell may have a blocked centre.',
      missingGoal: 'Not found at the configured spacing, duration, motor profile and budget; not proof of physical unreachability.',
      profile: 'Fixed valid mechanical motor profile; no claim that a persona/seed compiler generated these inputs.',
    },
  };
}

function witnessTo(graph, nodeKey) {
  const byKey = new Map(graph.nodes.map(node => [node.key, node]));
  const path = [], seen = new Set();
  let node = byKey.get(nodeKey);
  if (!node) throw new Error(`Unknown directional witness node ${nodeKey}`);
  while (node) {
    if (seen.has(node.key)) throw new Error('Directional witness contains a parent cycle');
    seen.add(node.key); path.push(node);
    if (node.previous === null) break;
    node = byKey.get(node.previous);
    if (!node) throw new Error('Directional witness has a missing parent');
  }
  path.reverse();
  if (path[0].key !== graph.startKey) throw new Error('Directional witness does not start at spawn');
  return { nodeKey, depth: path.length - 1, endpoint: { ...path.at(-1).point },
    nodeKeys: path.map(node => node.key), points: path.map(node => ({ ...node.point })),
    steps: path.slice(1).map(node => ({ type: 'moveDirection', direction: node.direction,
      durationMs: graph.durationMs, movement: { ...graph.movement } })) };
}

/** Verify a witness independently using the same input integration, without
 * trusting stored endpoints or cell centres. The caller may additionally run
 * these steps and its final openShelf/checkout through TraceGuard.
 */
function replayDirectionalWitness(graph, witness, { environment, cashierAvailability }) {
  if (geometryKey(environment, cashierAvailability) !== graph.geometryKey) throw new Error('Directional graph geometry changed');
  let position = { ...environment.spawn };
  for (const step of witness.steps) position = integrateDirection(environment, cashierAvailability, position,
    directionalInputSlices(step.direction, step.durationMs, step.movement)).point;
  if (position.x !== witness.endpoint.x || position.y !== witness.endpoint.y) throw new Error('Directional witness endpoint differs from actual motor replay');
  return position;
}

/** Evaluate only the live shared visibility/interaction projection. HUD masking
 * affects this goal observation, never BFS transitions or reachable geometry.
 */
function evaluateDirectionalReachability(graph, { environment, cashierAvailability, presentation }) {
  if (graph?.schema !== 'whole-trace-directional-reachability-v1') throw new Error('Unsupported directional reachability graph');
  if (geometryKey(environment, cashierAvailability) !== graph.geometryKey) throw new Error('Directional graph geometry changed');
  if (!validateReplayPresentation(presentation)) throw new Error('Invalid reachability presentation');
  const goalStations = targets(environment), witnesses = {}, observedAt = new Map();
  let observationChecks = 0;
  for (const station of goalStations) {
    for (const node of graph.nodes) {
      if (!node.nearbyStationIds.includes(station.id)) continue;
      let visible = observedAt.get(node.key);
      if (!visible) {
        visible = visibleStations(environment, node.point, presentation, cashierAvailability).filter(candidate => candidate.near);
        observedAt.set(node.key, visible); observationChecks++;
      }
      if (!visible.some(candidate => candidate.id === station.id && candidate.kind === station.kind)) continue;
      const witness = witnessTo(graph, node.key);
      replayDirectionalWitness(graph, witness, { environment, cashierAvailability });
      witnesses[station.id] = { stationId: station.id, kind: station.kind, ...witness };
      break;
    }
  }
  const shelfStationIds = goalStations.filter(station => station.kind === 'shelf' && witnesses[station.id]).map(station => station.id).sort();
  const checkoutStationIds = goalStations.filter(station => station.kind === 'checkout' && witnesses[station.id]).map(station => station.id).sort();
  return { reachablePoints: graph.reachablePoints, totalPoints: graph.totalPoints, totalWalkableCells: graph.totalWalkableCells,
    spacingPx: graph.spacingPx, durationMs: graph.durationMs, movement: { ...graph.movement }, maxNodes: graph.maxNodes,
    attemptedEdges: graph.attemptedEdges,
    shelfStationIds, checkoutStationIds, checkoutReachable: checkoutStationIds.length > 0,
    missingStationIds: goalStations.filter(station => !witnesses[station.id]).map(station => station.id).sort(),
    blockedBoundaries: graph.blockedBoundaries, witnesses, complete: graph.complete, truncated: graph.truncated,
    observationChecks, interpretation: graph.interpretation.missingGoal };
}

module.exports = { DIRECTIONS, DEFAULT_MOVEMENT, buildDirectionalReachability,
  evaluateDirectionalReachability, witnessTo, replayDirectionalWitness };
