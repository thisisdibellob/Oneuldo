'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reachableGraph } = require('../scripts/diagnose-whole-trace-reachability.cjs');

test('diagnostic BFS follows directed edges, deduplicates stations and returns witness paths', () => {
  const shelf = { id: 'fresh', kind: 'shelf', label: '신선식품' };
  const result = reachableGraph({ startAllowedWaypointIds: ['W001'], startNearbyStations: [], nodes: [
    { waypointId: 'W001', allowedWaypointIds: ['W002'], nearbyStations: [shelf] },
    { waypointId: 'W002', allowedWaypointIds: ['W001'], nearbyStations: [shelf, { id: 'checkout', kind: 'checkout', label: '계산대' }] },
    // An incoming edge does not make this point reachable from W002.
    { waypointId: 'W003', allowedWaypointIds: ['W002'], nearbyStations: [{ id: 'produce', kind: 'shelf', label: '채소' }] },
  ] });
  assert.equal(result.reachableWaypoints, 2);
  assert.equal(result.totalWaypoints, 3);
  assert.equal(result.reachableShelfStations, 1);
  assert.deepEqual(result.shelfStationIds, ['fresh']);
  assert.equal(result.checkoutReachable, true);
  assert.deepEqual(result.firstShelfPath, ['start', 'W001']);
  assert.deepEqual(result.firstCheckoutPath, ['start', 'W001', 'W002']);
});

test('diagnostic counts nearby start stations without counting start as a waypoint', () => {
  const result = reachableGraph({ startAllowedWaypointIds: [], startNearbyStations: [
    { id: 'fresh', kind: 'shelf', label: '신선식품' }, { id: 'checkout', kind: 'checkout', label: '계산대' },
  ], nodes: [{ waypointId: 'W001', allowedWaypointIds: [], nearbyStations: [] }] });
  assert.equal(result.reachableWaypoints, 0);
  assert.equal(result.totalWaypoints, 1);
  assert.equal(result.reachableShelfStations, 1);
  assert.equal(result.checkoutReachable, true);
  assert.deepEqual(result.firstShelfPath, ['start']);
  assert.deepEqual(result.firstCheckoutPath, ['start']);
});

test('diagnostic rejects dangling edges instead of silently inflating reachability', () => {
  assert.throws(() => reachableGraph({ startAllowedWaypointIds: ['missing'], startNearbyStations: [], nodes: [] }),
    /Graph edge references missing waypoint: missing/);
});
