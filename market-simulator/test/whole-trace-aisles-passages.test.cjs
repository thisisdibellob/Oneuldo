'use strict';
// The 80px replay grid lands inside the shelves on both sides of the aisles layout's
// narrow gaps (between the two middle shelf pairs, and between the east shelves and
// the east wall). The app lets the player walk through them; the replay graph must too.
require('../runtime.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { isMarketNavigationSegmentClear } = require('../../frontend/src/game/marketNavigation.ts');
const P = require('../../frontend/src/game/marketReplayPerception.ts');

function graphFor(layoutId) {
  const session = createMarketSession({ seed: 'aisles-passage-test', difficulty: 'exact', stockPerProduct: 5,
    environment: { layoutId, shelfOrder: ['produce', 'household', 'fresh', 'drink', 'meal'], entranceConstruction: false } });
  const env = session.environment, cashiers = session.cashierAvailability;
  const waypoints = P.wholeReplayWaypointCatalog(env, cashiers);
  const graph = P.wholeReplayWaypointGraph(env, env.spawn, P.DEFAULT_REPLAY_PRESENTATION, cashiers, waypoints);
  const nodes = new Map(graph.nodes.map(n => [n.waypointId, n]));
  nodes.set('START', { allowedWaypointIds: graph.startAllowedWaypointIds, nearbyStations: graph.startNearbyStations });
  const dist = new Map([['START', 0]]), queue = ['START'];
  while (queue.length) {
    const u = queue.shift();
    for (const v of nodes.get(u).allowedWaypointIds) if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); queue.push(v); }
  }
  const best = {};
  for (const [id, node] of nodes) for (const s of node.nearbyStations) if (dist.has(id)) best[s.id] = Math.min(best[s.id] ?? Infinity, dist.get(id));
  const point = new Map(waypoints.map(w => [w.waypointId, w.point]));
  return { env, cashiers, waypoints, nodes, best, point };
}

test('aisles layout: the gap between the middle shelf pairs and the east wall gap are walkable replay passages', () => {
  const { env, cashiers, nodes, best, point } = graphFor('aisles');
  const drink = env.shelves.drink, fresh = env.shelves.fresh;
  // The app's own collision allows a straight crossing of the middle gap.
  const gapX = Math.round((fresh.x + fresh.width + drink.x) / 2);
  assert.ok(isMarketNavigationSegmentClear(env, { x: gapX, y: 400 }, { x: gapX, y: 560 }, cashiers));
  // The replay graph has an edge that crosses the shelf row there.
  const crossing = [...nodes].some(([id, n]) => id !== 'START' && point.get(id).y <= drink.y
    && n.allowedWaypointIds.some(to => point.get(to).y >= drink.y + drink.height
      && Math.abs(point.get(to).x - gapX) < 1 && Math.abs(point.get(id).x - gapX) < 1));
  assert.ok(crossing, 'no replay edge crosses the middle gap');
  // Every shelf is reachable, the household shelf (north-east) no longer only by the far west loop.
  for (const shelf of ['produce', 'household', 'fresh', 'drink', 'meal']) assert.ok(Number.isFinite(best[shelf]), shelf);
  assert.ok(best.household <= 12, `household needs ${best.household} walks`);
});

test('corner layout: every shelf has a reachable standing point (household was off the grid rows)', () => {
  const { best } = graphFor('corner');
  for (const shelf of ['produce', 'household', 'fresh', 'drink', 'meal']) assert.ok(Number.isFinite(best[shelf]), shelf);
});

test('classic layout keeps its exact grid catalog (no passage points added)', () => {
  const { env, waypoints } = graphFor('classic');
  const offGrid = waypoints.filter(w => w.point.x % P.REPLAY_ANCHOR_SPACING !== 0 || w.point.y % P.REPLAY_ANCHOR_SPACING !== 0);
  // Only the existing employee standing-area points are off the grid in classic.
  const employees = env.stationDetails.filter(s => s.kind === 'employee');
  assert.ok(offGrid.every(w => employees.some(e => Math.abs(w.point.x - e.point.x) <= 32 && Math.abs(w.point.y - e.point.y) <= 32)));
});
