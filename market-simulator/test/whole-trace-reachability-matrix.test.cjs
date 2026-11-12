'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { scenarios, presentations, OLD_HUD_RECT, withHudRect, inspectAnchor, verdict,
  assertReachable, failureMessage, runMatrix, formatMarkdown } = require('../scripts/check-whole-trace-reachability.cjs');
const { buildDirectionalReachability, evaluateDirectionalReachability } = require('../scripts/whole-trace-directional-reachability.cjs');
const hud = require('../../frontend/src/game/marketHudLayout.ts');
const camera = require('../../frontend/src/game/marketWorldCamera.ts');
const { getWorldCameraFrame } = require('../../frontend/src/game/worldZoom.ts');
const { canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');

test('full reachability matrix covers every requested screen setting on live default and frozen low/high', () => {
  const cases = presentations(true);
  assert.equal(cases.length, 45);
  assert.equal(new Set(cases.map(p => JSON.stringify(p))).size, 45);
  for (const [width, height] of [[360, 640], [390, 600], [390, 844], [430, 932], [768, 1024]])
    for (const fontScale of [1, 1.3, 2]) for (const top of [0, 47, 59])
      assert.ok(cases.some(p => p.viewport.width === width && p.viewport.height === height
        && p.fontScale === fontScale && p.safeArea.top === top));
  const worlds = scenarios();
  assert.deepEqual(worlds.map(world => world.name), ['default', 'low', 'high']);
  assert.deepEqual(worlds[0].environment, require('../../frontend/src/game/marketSession.ts').createMarketSession().environment);
  for (const world of worlds.slice(1)) {
    assert.match(world.source.sha256, /^[a-f0-9]{64}$/);
    assert.match(world.source.path, /persona-pilot-20261028\.(low|high)\.snapshot\.json$/);
    // Both original load conditions had identical navigation inputs. The full
    // snapshot source hashes alone cannot detect edits to this extracted copy.
    assert.equal(createHash('sha256').update(canonicalMarketReplayJson({ environment: world.environment,
      cashierAvailability: world.cashierAvailability, presentation: world.presentation })).digest('hex'),
    'd0225d9228de2a47bb822a1a4631ab1fed18996348cdf962edfc26f4153373e0', `${world.name} historical geometry changed`);
  }
});

test('representative screen matrix reaches every shelf and a checkout with both movement models', () => {
  const report = runMatrix();
  assert.equal(report.rows.length, 15);
  for (const row of report.rows) assertReachable(row);
  assert.deepEqual(report.failures, []);
  const table = formatMarkdown(report);
  assert.match(table, /default/); assert.match(table, /low/); assert.match(table, /high/);
  assert.match(table, /768×1024/); assert.match(table, /D points/);
});

test('the historical HUD and player-centred camera regression traps anchors but directional motor still reaches every goal', () => {
  const scenario = scenarios().find(world => world.name === 'low'), presentation = scenario.presentation;
  assert.deepEqual(presentation.viewport, { width: 390, height: 600 });
  const before = verdict(scenario, inspectAnchor(scenario, presentation));
  assert.equal(before.pass, true);
  const originalHud = hud.getMarketHudOcclusionRect;
  const originalCamera = camera.getMarketWorldCameraFrame;
  let row;
  try {
    camera.getMarketWorldCameraFrame = (point, p, bounds) => getWorldCameraFrame(point, p.viewport, p.zoom, bounds);
    row = withHudRect(OLD_HUD_RECT, () => {
      const directionalGraph = buildDirectionalReachability(scenario);
      return { scenario: scenario.name, presentation,
        anchor: verdict(scenario, inspectAnchor(scenario, presentation)),
        directional: verdict(scenario, evaluateDirectionalReachability(directionalGraph, { ...scenario, presentation })) };
    });
  } finally { camera.getMarketWorldCameraFrame = originalCamera; }
  assert.equal(hud.getMarketHudOcclusionRect, originalHud);
  assert.equal(row.anchor.pass, false);
  assert.equal(row.anchor.reachablePoints, 23);
  assert.deepEqual(row.anchor.shelfStationIds, []);
  assert.deepEqual(row.anchor.checkoutStationIds, []);
  assert.equal(row.directional.pass, true);
  assert.equal(row.directional.shelfStationIds.length, 5);
  assert.ok(row.anchor.blockedBoundaries.some(boundary => boundary.reason === 'HUD'));
  assert.throws(() => assertReachable(row), /low 390x600 fontScale=1 safeArea.top=0.*anchor: reached 23\/139.*missing shelves=.*checkout=NONE.*HUD/);
  assert.deepEqual(verdict(scenario, inspectAnchor(scenario, presentation)), before, 'injection restores the actual current HUD');
  assert.throws(() => withHudRect(OLD_HUD_RECT, () => { throw new Error('probe failed'); }), /probe failed/);
  assert.equal(hud.getMarketHudOcclusionRect, originalHud, 'also restore after an exception');
});

test('compact-phone camera prevents the current HUD from isolating anchors at every font and safe area', () => {
  const scenario = scenarios()[0];
  for (const setting of presentations(true).filter(p => p.viewport.width <= 390 && p.viewport.height <= 640)) {
    const presentation = { ...scenario.presentation, ...setting };
    const anchor = verdict(scenario, inspectAnchor(scenario, presentation));
    assert.ok(anchor.pass, failureMessage({ scenario: scenario.name, presentation, anchor }, 'anchor'));
  }
});

test('reachability requires all shelf stations and a checkout, and rejects an exhausted node budget', () => {
  const scenario = scenarios()[0], ids = scenario.environment.stationDetails.filter(s => s.kind === 'shelf').map(s => s.id);
  const result = { reachablePoints: 7, totalPoints: 12, shelfStationIds: ids, checkoutStationIds: ['checkout'], complete: true,
    blockedBoundaries: [{ from: 'A', to: 'B', reason: 'HUD' }] };
  assert.equal(verdict(scenario, result).pass, true);
  const missing = verdict(scenario, { ...result, shelfStationIds: ids.slice(1) });
  assert.equal(missing.pass, false);
  assert.deepEqual(missing.missingShelfStationIds, [ids[0]]);
  assert.equal(verdict(scenario, { ...result, checkoutStationIds: [] }).pass, false);
  assert.equal(verdict(scenario, { ...result, complete: false }).pass, false);
  assert.equal(verdict(scenario, { ...result, trappedWaypointIds: ['W122', 'W134'] }).pass, false,
    'A start-to-checkout path does not excuse a reachable one-way trap');
  const message = failureMessage({ scenario: 'synthetic-cut', presentation: scenario.presentation, anchor: missing }, 'anchor');
  assert.match(message, /reached 7\/12 points/); assert.match(message, new RegExp(ids[0])); assert.match(message, /blocked boundaries=.*HUD/);
});
