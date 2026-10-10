import { createMarketSession } from '../src/game/marketSession';
import { createMarketEnvironment, isMarketEnvironmentBlocked } from '../src/game/marketEnvironment';
import { isMarketNavigationSegmentClear } from '../src/game/marketNavigation';
import { createMarketReplaySnapshot, marketReplayTraceId, validateMarketReplaySnapshot, validateMarketReplayTrace,
  type MarketReplayTrace } from '../src/game/marketReplayTrace';
import { DEFAULT_REPLAY_PRESENTATION, getReplayShelfPage, replayShelfPageFractions, resolveReplayAnchor,
  replayPresentationKey, visibleAnchors, visibleStations, wholeReplayWaypointCatalog,
  wholeReplayWaypointGraph } from '../src/game/marketReplayPerception';

const environment = () => createMarketEnvironment({ seed: 'replay-motor-test', employeeCount: 1, customerCount: 1,
  employeeSlotIds: ['staff-southwest'], customerSlotIds: ['customer-southeast'], cashierCount: 2, pillarCount: 0, kioskPresent: false });

test('public exploration offers only opaque nearby straight, collision-safe choices, never a map or target coordinates', () => {
  const e = environment(), anchors = visibleAnchors(e, e.spawn, DEFAULT_REPLAY_PRESENTATION);
  expect(anchors.length).toBeGreaterThan(1);
  for (const anchor of anchors) {
    expect(Object.keys(anchor).sort()).toEqual(['direction', 'distanceBand', 'id', 'label']);
    expect(anchor.id).toMatch(/^anchor-[0-9a-f]{8}$/);
    const point = resolveReplayAnchor(e, e.spawn, anchor.id, DEFAULT_REPLAY_PRESENTATION)!;
    expect(point).not.toBeNull();
    expect(Math.hypot(point.x - e.spawn.x, point.y - e.spawn.y)).toBeLessThanOrEqual(180);
    expect(isMarketEnvironmentBlocked(e, point)).toBe(false);
    expect(isMarketNavigationSegmentClear(e, e.spawn, point)).toBe(true);
    expect(resolveReplayAnchor(e, { x: 40, y: 40 }, anchor.id, DEFAULT_REPLAY_PRESENTATION)).toBeNull();
  }
  expect(resolveReplayAnchor(e, e.spawn, 'area:720:1280', DEFAULT_REPLAY_PRESENTATION)).toBeNull();
  expect(visibleAnchors(e, e.spawn, DEFAULT_REPLAY_PRESENTATION)).toEqual(anchors);
});

test('whole-world graph mirrors unranked local movement and nearby controls at the caller current position', () => {
  const e = environment(), p = DEFAULT_REPLAY_PRESENTATION, position = { x: 160, y: 400 };
  const cashiers = { checkout: true, 'checkout-2': true }, catalog = wholeReplayWaypointCatalog(e, cashiers);
  const before = JSON.stringify(e), original = visibleAnchors(e, position, p, cashiers);
  const graph = wholeReplayWaypointGraph(e, position, p, cashiers, catalog);
  const byAnchorId = new Map(catalog.map(waypoint => [waypoint.anchorId, waypoint.waypointId]));
  const expectedMovement = (from: { x: number; y: number }) => visibleAnchors(e, from, p, cashiers)
    .map(anchor => byAnchorId.get(anchor.id)!).sort();
  const expectedControls = (from: { x: number; y: number }) => visibleStations(e, from, p, cashiers)
    .filter(station => station.near).map(({ id, kind, label }) => ({ id, kind, label })).sort((a, b) => a.id.localeCompare(b.id));
  expect(graph).toMatchObject({ schemaVersion: '1', view: 'world', presentationKey: replayPresentationKey(p),
    world: e.world, cashierAvailability: cashiers });
  expect(graph.startAllowedWaypointIds).toEqual(expectedMovement(position));
  expect(graph.startAllowedWaypointIds.length).toBeGreaterThan(1);
  expect(graph.startAllowedWaypointIds).not.toEqual(expectedMovement(e.spawn));
  expect(graph.startNearbyStations).toEqual(expectedControls(position));
  expect(graph.nodes.map(node => node.waypointId)).toEqual(catalog.map(waypoint => waypoint.waypointId).sort());
  let controlCount = 0;
  for (const waypoint of catalog) {
    const node = graph.nodes.find(candidate => candidate.waypointId === waypoint.waypointId)!;
    expect(node.allowedWaypointIds).toEqual(expectedMovement(waypoint.point));
    expect(node.nearbyStations).toEqual(expectedControls(waypoint.point));
    expect(node.allowedWaypointIds).not.toContain(node.waypointId);
    controlCount += node.nearbyStations.length;
  }
  expect(controlCount).toBeGreaterThan(0);
  expect(wholeReplayWaypointGraph(e, position, p, cashiers, [...catalog].reverse())).toEqual(graph);
  expect(visibleAnchors(e, position, p, cashiers)).toEqual(original);
  expect(JSON.stringify(e)).toBe(before);
  expect(() => wholeReplayWaypointGraph(e, position, { viewport: { width: 0, height: 0 }, zoom: 1.3 })).toThrow(/presentation/);
});

test('saved failure snapshot graph omits W087 to W086 and W102 to W101 while preserving positive directed choices', () => {
  // This seed reconstructs snapshot-a3017cab8e0f4d19129e659da5ae2813's saved environment.
  const e = createMarketEnvironment({ seed: 'market-1790906391403-1' });
  const p = { viewport: { width: 668, height: 853 }, zoom: 1.3, fontScale: 1, safeArea: { top: 0, bottom: 0 } };
  const cashiers = { checkout: true, 'checkout-2': true }, catalog = wholeReplayWaypointCatalog(e, cashiers);
  const graph = wholeReplayWaypointGraph(e, e.spawn, p, cashiers, catalog);
  const point = (id: string) => catalog.find(waypoint => waypoint.waypointId === id)!.point;
  const neighbors = (id: string) => graph.nodes.find(node => node.waypointId === id)!.allowedWaypointIds;
  expect(point('W087')).toEqual({ x: 720, y: 1120 });
  expect(point('W086')).toEqual({ x: 720, y: 960 });
  expect(point('W102')).toEqual({ x: 800, y: 1120 });
  expect(point('W101')).toEqual({ x: 800, y: 960 });
  expect(neighbors('W087')).not.toContain('W086');
  expect(neighbors('W102')).not.toContain('W101');
  expect(isMarketNavigationSegmentClear(e, point('W087'), point('W086'), cashiers)).toBe(false);
  expect(isMarketNavigationSegmentClear(e, point('W102'), point('W101'), cashiers)).toBe(false);
  expect(neighbors('W087')).toContain('W102');
  expect(neighbors('W102')).toContain('W087');
  expect(neighbors('W102')).toContain('W114');
  expect(graph.startAllowedWaypointIds.length).toBeGreaterThan(1);
  // Both straight segments are clear; the HUD makes only the southward hop visible.
  expect(isMarketNavigationSegmentClear(e, point('W002'), point('W004'), cashiers)).toBe(true);
  expect(isMarketNavigationSegmentClear(e, point('W004'), point('W002'), cashiers)).toBe(true);
  expect(neighbors('W002')).toContain('W004');
  expect(neighbors('W004')).not.toContain('W002');
});

test('cashier occupancy graph variants retain initial IDs and remove choices from newly blocked waypoints', () => {
  const e = createMarketEnvironment({ seed: 'graph-cashier', employeeCount: 1, customerCount: 1,
    pillarCount: 0, chairCount: 0, cashierCount: 0, kioskPresent: false });
  const p = { viewport: { width: 668, height: 853 }, zoom: 1.3 }, called = { 'checkout-2': true };
  const catalog = wholeReplayWaypointCatalog(e), initial = wholeReplayWaypointGraph(e, e.spawn, p, {}, catalog);
  const graph = wholeReplayWaypointGraph(e, e.spawn, p, called, catalog);
  const blocked = catalog.filter(waypoint => isMarketEnvironmentBlocked(e, waypoint.point, called));
  expect(blocked.length).toBeGreaterThan(0);
  expect(wholeReplayWaypointCatalog(e, called).length).toBeLessThan(catalog.length);
  expect(graph.nodes.map(node => node.waypointId)).toEqual(initial.nodes.map(node => node.waypointId));
  expect(initial.cashierAvailability).toEqual({ checkout: false, 'checkout-2': false });
  expect(graph.cashierAvailability).toEqual({ checkout: false, 'checkout-2': true });
  for (const waypoint of blocked) {
    expect(initial.nodes.find(node => node.waypointId === waypoint.waypointId)!.allowedWaypointIds.length).toBeGreaterThan(0);
    expect(graph.nodes.find(node => node.waypointId === waypoint.waypointId)).toEqual({
      waypointId: waypoint.waypointId, allowedWaypointIds: [], nearbyStations: [],
    });
    expect(graph.startAllowedWaypointIds).not.toContain(waypoint.waypointId);
    expect(graph.nodes.every(node => !node.allowedWaypointIds.includes(waypoint.waypointId))).toBe(true);
    const blockedStart = wholeReplayWaypointGraph(e, waypoint.point, p, called, catalog);
    expect(blockedStart.startAllowedWaypointIds).toEqual([]);
    expect(blockedStart.startNearbyStations).toEqual([]);
  }
});

test('passage labels use screen directions and only already visible local signs, with no goal-dependent ordering', () => {
  const e = environment();
  const hidden = e.stationDetails.filter(s => !visibleStations(e, e.spawn, DEFAULT_REPLAY_PRESENTATION).some(c => c.id === s.id));
  const original = visibleAnchors(e, e.spawn, DEFAULT_REPLAY_PRESENTATION);
  const mutated = { ...e, stationDetails: e.stationDetails.map(s => hidden.some(h => h.id === s.id) ? { ...s, categoryId: 'meal' as const } : s) };
  expect(visibleAnchors(mutated, e.spawn, DEFAULT_REPLAY_PRESENTATION)).toEqual(original);
  for (const anchor of original) {
    expect(anchor.label).toMatch(/화면.+통로/);
    const point = resolveReplayAnchor(e, e.spawn, anchor.id, DEFAULT_REPLAY_PRESENTATION)!;
    expect(Math.hypot(point.x - e.spawn.x, point.y - e.spawn.y)).toBeGreaterThanOrEqual(45);
  }
});

test('planning excludes a HUD-edge anchor lost after a valid 0.55px arrival residual, without expanding actual visibility', () => {
  const e = environment(), p = { viewport: { width: 390, height: 701 }, zoom: 1.3 };
  const planned = { x: 160, y: 400 }, actual = { x: 160, y: 400.55 }, id = 'anchor-5db7b70d';
  expect(resolveReplayAnchor(e, planned, id, p)).toEqual({ x: 160, y: 320 });
  expect(resolveReplayAnchor(e, actual, id, p)).toBeNull();
  expect(visibleAnchors(e, planned, p).some(a => a.id === id)).toBe(false);
  const choices = visibleAnchors(e, planned, p);
  expect(choices.length).toBeGreaterThan(0);
  for (const choice of choices) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
    expect(resolveReplayAnchor(e, { x: planned.x + dx, y: planned.y + dy }, choice.id, p)).not.toBeNull();
  }
});

test('a planned nearby station remains inside the real interaction range across arrival residuals', () => {
  const e = environment(), p = { viewport: { width: 1280, height: 900 }, zoom: 1.3 };
  let checked = 0;
  for (const station of e.stationDetails) {
    const position = station.point;
    for (const cue of visibleStations(e, position, p).filter(s => s.near)) {
      checked++;
      for (const dx of [-.6, .6]) for (const dy of [-.6, .6]) {
        expect(visibleStations(e, { x: position.x + dx, y: position.y + dy }, p, {}, 0).some(s => s.id === cue.id && s.near)).toBe(true);
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
});

test('a visible employee standing area remains reachable when the coarse grid misses the interaction space', () => {
  const e = createMarketSession({ seed: 'same-store' }).environment;
  const from = { x: 640, y: 160 }, target = { x: 680, y: 206 };
  expect(visibleStations(e, from, DEFAULT_REPLAY_PRESENTATION).some(s => s.id === 'staff:employee-1')).toBe(true);
  const choice = visibleAnchors(e, from, DEFAULT_REPLAY_PRESENTATION).find(a => {
    const point = resolveReplayAnchor(e, from, a.id, DEFAULT_REPLAY_PRESENTATION);
    return point?.x === target.x && point?.y === target.y;
  });
  expect(choice).toBeDefined();
  expect(Object.keys(choice!).sort()).toEqual(['direction', 'distanceBand', 'id', 'label']);
  for (const dx of [-.6, 0, .6]) for (const dy of [-.6, 0, .6]) {
    expect(resolveReplayAnchor(e, { x: from.x + dx, y: from.y + dy }, choice!.id, DEFAULT_REPLAY_PRESENTATION)).toEqual(target);
    expect(visibleStations(e, { x: target.x + dx, y: target.y + dy }, DEFAULT_REPLAY_PRESENTATION, {}, 0)
      .some(s => s.id === 'staff:employee-1' && s.near)).toBe(true);
  }
  expect(resolveReplayAnchor(e, e.spawn, choice!.id, DEFAULT_REPLAY_PRESENTATION)).toBeNull();
});

test('visible station cues expose neither geometry nor off-screen global station availability', () => {
  const e = environment(), stations = visibleStations(e, e.spawn, DEFAULT_REPLAY_PRESENTATION);
  expect(stations.length).toBeLessThan(e.stationDetails.length);
  for (const station of stations) expect(Object.keys(station).sort()).toEqual(['direction', 'distanceBand', 'id', 'kind', 'label', 'near']);
  const zoomed = visibleStations(e, e.spawn, { ...DEFAULT_REPLAY_PRESENTATION, zoom: 2 });
  expect(zoomed.length).toBeLessThanOrEqual(stations.length);
});

test('shelf observation changes through actual row-sized page fractions and never exposes a partial row', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `item-${i}`);
  const p = { viewport: { width: 320, height: 568 }, zoom: 1.3 };
  const fractions = replayShelfPageFractions(ids, p), first = getReplayShelfPage(ids, p, 0);
  expect(first.visibleProductIds.length).toBeGreaterThan(0);
  expect(first.visibleProductIds.length).toBeLessThan(ids.length);
  expect(first.visibleProductIds.length % 4).toBe(0);
  const seen = new Set(fractions.flatMap(f => getReplayShelfPage(ids, p, f).visibleProductIds));
  expect([...seen].sort()).toEqual([...ids].sort());
  expect(getReplayShelfPage(ids, p, 1).visibleProductIds).not.toEqual(first.visibleProductIds);
});

test('snapshot identity binds viewport, zoom and accessibility presentation while legacy snapshots remain valid', () => {
  const s = createMarketSession({ seed: 'perception-snapshot' });
  const legacy = createMarketReplaySnapshot(s), actual = createMarketReplaySnapshot(s, undefined, DEFAULT_REPLAY_PRESENTATION);
  expect(validateMarketReplaySnapshot(legacy).valid).toBe(true);
  expect(validateMarketReplaySnapshot(actual).valid).toBe(true);
  expect(actual.snapshotId).not.toBe(legacy.snapshotId);
  expect(validateMarketReplaySnapshot({ ...actual, presentation: { ...DEFAULT_REPLAY_PRESENTATION, zoom: 2 } }).valid).toBe(false);
  expect(() => createMarketReplaySnapshot(s, undefined, { viewport: { width: 0, height: 0 }, zoom: 1.3 })).toThrow(/presentation/);
});

test('v2 schema allows attention intentions but rejects their use in a legacy trace', () => {
  const s = createMarketReplaySnapshot(createMarketSession({ seed: 'schema-attention' }), undefined, DEFAULT_REPLAY_PRESENTATION);
  const body: Omit<MarketReplayTrace, 'traceId'> = { traceSchemaVersion: '2', personaId: 'test', personaVersion: '3', seed: 5,
    generationPolicy: 'stochastic', policyVersion: '4', experienceMode: 'first-play', target: { snapshotId: s.snapshotId, completionMode: 'ai-review' },
    steps: [
      { type: 'start' }, { type: 'readList', durationMs: 900, attentionTag: 'read-goal', cueRefs: ['shopping-list'] },
      { type: 'giveUp' }, { type: 'skipRating' }, { type: 'leave' },
    ].map((step, i) => ({ ...step, id: `step-${i}`, reactionDelayMs: 0, timeoutMs: 10000, reason: 'visible action' })) as MarketReplayTrace['steps'] };
  const v2 = { ...body, traceId: marketReplayTraceId(body) };
  expect(validateMarketReplayTrace(v2, s)).toEqual({ valid: true, errors: [] });
  const legacy = { ...v2, traceSchemaVersion: '1' as const, policyVersion: '3' as const };
  legacy.traceId = marketReplayTraceId(legacy);
  expect(validateMarketReplayTrace(legacy, s).errors.join(' ')).toMatch(/require trace schema 2/);
});
