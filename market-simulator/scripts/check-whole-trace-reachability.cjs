#!/usr/bin/env node
'use strict';
require('../runtime.cjs');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { DEFAULT_REPLAY_PRESENTATION, REPLAY_ANCHOR_MAX_DISTANCE,
  wholeReplayWaypointCatalog, wholeReplayWaypointGraph } = require('../../frontend/src/game/marketReplayPerception.ts');
const { isMarketNavigationSegmentClear } = require('../../frontend/src/game/marketNavigation.ts');
const camera = require('../../frontend/src/game/marketWorldCamera.ts');
const hud = require('../../frontend/src/game/marketHudLayout.ts');
const { reachableGraph } = require('./diagnose-whole-trace-reachability.cjs');
const { buildDirectionalReachability, evaluateDirectionalReachability } = require('./whole-trace-directional-reachability.cjs');
const historical = require('../test/fixtures/whole-trace-reachability-snapshots.json');

const VIEWPORTS = [[360, 640], [390, 600], [390, 844], [430, 932], [768, 1024]];
const FONT_SCALES = [1, 1.3, 2];
const SAFE_AREA_TOPS = [0, 47, 59];
const OLD_HUD_RECT = { left: 0, top: 100, right: 390, bottom: 246 };

function scenarios() {
  // Regenerate the default on every run: a frozen copy would miss layout changes.
  const session = createMarketSession();
  return [{ name: 'default', source: { generator: 'createMarketSession()' },
    environment: session.environment, cashierAvailability: session.cashierAvailability,
    presentation: DEFAULT_REPLAY_PRESENTATION },
  ...Object.entries(historical.snapshots).map(([name, snapshot]) => ({ name, ...snapshot }))];
}

function presentations(full = false) {
  const settings = full ? VIEWPORTS.flatMap(([width, height]) => FONT_SCALES.flatMap(fontScale =>
    SAFE_AREA_TOPS.map(top => ({ viewport: { width, height }, fontScale, safeArea: { top, bottom: 0 } }))))
    : [
      { viewport: { width: 360, height: 640 }, fontScale: 2, safeArea: { top: 59, bottom: 0 } },
      { viewport: { width: 390, height: 600 }, fontScale: 1, safeArea: { top: 0, bottom: 0 } },
      { viewport: { width: 390, height: 844 }, fontScale: 1.3, safeArea: { top: 47, bottom: 0 } },
      { viewport: { width: 430, height: 932 }, fontScale: 2, safeArea: { top: 59, bottom: 0 } },
      { viewport: { width: 768, height: 1024 }, fontScale: 2, safeArea: { top: 0, bottom: 0 } },
    ];
  return settings;
}

/** Diagnostic-only synchronous injection; never adds a field to ReplayPresentation. */
function withHudRect(rect, run) {
  const original = hud.getMarketHudOcclusionRect;
  hud.getMarketHudOcclusionRect = () => ({ ...rect });
  try { return run(); } finally { hud.getMarketHudOcclusionRect = original; }
}

function anchorBoundaries(scenario, presentation, waypoints, reachable) {
  const visited = new Set(reachable.reachableWaypointIds);
  const from = [{ waypointId: 'start', point: scenario.environment.spawn }, ...waypoints.filter(p => visited.has(p.waypointId))];
  const to = waypoints.filter(p => !visited.has(p.waypointId));
  const boundaries = [];
  for (const a of from) for (const b of to) {
    const distance = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y);
    if (distance < 45 || distance > REPLAY_ANCHOR_MAX_DISTANCE) continue;
    const frame = camera.getMarketWorldCameraFrame(a.point, presentation, scenario.environment.world);
    const screen = { x: presentation.viewport.width / 2 + (b.point.x - frame.center.x) * presentation.zoom,
      y: presentation.viewport.height / 2 + (b.point.y - frame.center.y) * presentation.zoom };
    const rect = hud.getMarketHudOcclusionRect(presentation);
    const clear = isMarketNavigationSegmentClear(scenario.environment, a.point, b.point, scenario.cashierAvailability);
    const reason = !clear ? 'collision' : screen.x < 12 || screen.x > presentation.viewport.width - 12
      || screen.y < 12 || screen.y > presentation.viewport.height - 12 ? 'screen-edge'
      : screen.x >= rect.left && screen.x <= rect.right && screen.y >= rect.top && screen.y <= rect.bottom
        ? 'HUD' : 'arrival-margin-or-unoffered';
    boundaries.push({ from: a.waypointId, to: b.waypointId, fromPoint: a.point, toPoint: b.point,
      screenPoint: screen, reason, distance });
  }
  // Prefer physically clear excluded links, which explain HUD disconnections.
  return boundaries.sort((a, b) => Number(a.reason === 'collision') - Number(b.reason === 'collision')
    || a.distance - b.distance || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)).slice(0, 8);
}

/** A start-to-checkout witness alone misses reachable one-way dead ends. */
function checkoutReturnability(graph, reachableWaypointIds, { staffedOnly = false } = {}) {
  const predecessors = new Map(graph.nodes.map(node => [node.waypointId, []]));
  for (const node of graph.nodes) for (const target of node.allowedWaypointIds) {
    assert.ok(predecessors.has(target), `Graph edge references missing waypoint: ${target}`);
    predecessors.get(target).push(node.waypointId);
  }
  const returnable = new Set(graph.nodes.filter(node => node.nearbyStations.some(station =>
    station.kind === 'checkout' && (!staffedOnly || graph.cashierAvailability[station.id] === true))).map(node => node.waypointId));
  const queue = [...returnable];
  for (const target of queue) for (const source of predecessors.get(target)) if (!returnable.has(source)) {
    returnable.add(source); queue.push(source);
  }
  const trappedWaypointIds = reachableWaypointIds.filter(id => !returnable.has(id)).sort();
  return { checkoutReturnablePoints: reachableWaypointIds.length - trappedWaypointIds.length, trappedWaypointIds };
}

function inspectAnchor(scenario, presentation) {
  const waypoints = wholeReplayWaypointCatalog(scenario.environment, scenario.cashierAvailability);
  const graph = wholeReplayWaypointGraph(scenario.environment, scenario.environment.spawn,
    presentation, scenario.cashierAvailability, waypoints);
  const result = reachableGraph(graph);
  const staffed = checkoutReturnability(graph, result.reachableWaypointIds, { staffedOnly: true });
  return { reachablePoints: result.reachableWaypoints, totalPoints: result.totalWaypoints,
    shelfStationIds: result.shelfStationIds, checkoutStationIds: result.checkoutStationIds,
    ...checkoutReturnability(graph, result.reachableWaypointIds),
    staffedCheckoutReturnablePoints: staffed.checkoutReturnablePoints,
    staffedCheckoutTrappedWaypointIds: staffed.trappedWaypointIds,
    complete: true, blockedBoundaries: anchorBoundaries(scenario, presentation, waypoints, result),
    witnesses: { firstShelf: result.firstShelfPath, firstCheckout: result.firstCheckoutPath } };
}

function verdict(scenario, result) {
  const required = scenario.environment.stationDetails.filter(station => station.kind === 'shelf').map(station => station.id).sort();
  const missingShelfStationIds = required.filter(id => !result.shelfStationIds.includes(id));
  return { ...result, requiredShelfStationIds: required, missingShelfStationIds,
    pass: result.complete && missingShelfStationIds.length === 0 && result.checkoutStationIds.length > 0
      && (result.trappedWaypointIds === undefined || result.trappedWaypointIds.length === 0) };
}

function settingLabel(row) {
  const p = row.presentation;
  return `${row.scenario} ${p.viewport.width}x${p.viewport.height} fontScale=${p.fontScale} safeArea.top=${p.safeArea.top} zoom=${p.zoom}`;
}

function failureMessage(row, model) {
  const result = row[model];
  return `${settingLabel(row)} ${model}: reached ${result.reachablePoints}/${result.totalPoints} points; `
    + `missing shelves=[${result.missingShelfStationIds.join(', ')}]; checkout=${result.checkoutStationIds.join(', ') || 'NONE'}; `
    + `trapped waypoints=${result.trappedWaypointIds ? JSON.stringify(result.trappedWaypointIds) : 'not evaluated'}; `
    + `searchComplete=${result.complete}; blocked boundaries=${JSON.stringify(result.blockedBoundaries)}`;
}

function assertReachable(row) {
  for (const model of ['anchor', 'directional']) assert.ok(row[model].pass, failureMessage(row, model));
}

function runMatrix({ full = false, onRow = () => {} } = {}) {
  const started = performance.now(), rows = [], anchorCache = new Map(), directionalCache = new Map();
  for (const scenario of scenarios()) {
    const geometryKey = JSON.stringify([scenario.environment, scenario.cashierAvailability]);
    if (!directionalCache.has(geometryKey)) directionalCache.set(geometryKey, buildDirectionalReachability(scenario));
    const directionalGraph = directionalCache.get(geometryKey);
    for (const setting of presentations(full)) {
      const presentation = { ...scenario.presentation, ...setting };
      const anchorKey = JSON.stringify([geometryKey, presentation]);
      if (!anchorCache.has(anchorKey)) anchorCache.set(anchorKey, inspectAnchor(scenario, presentation));
      const row = { scenario: scenario.name, source: scenario.source, presentation,
        anchor: verdict(scenario, anchorCache.get(anchorKey)),
        directional: verdict(scenario, evaluateDirectionalReachability(directionalGraph, { ...scenario, presentation })) };
      rows.push(row); onRow(row);
    }
  }
  return { schema: 'oneuldo.whole-trace-reachability-check', version: 2, mode: full ? 'full' : 'representative',
    elapsedMs: Math.round(performance.now() - started),
    currentSourceFiles: ['frontend/src/game/marketReplayPerception.ts', 'frontend/src/game/marketHudLayout.ts',
      'frontend/src/game/marketWorldCamera.ts', 'frontend/src/game/worldZoom.ts', 'frontend/src/game/marketEnvironment.ts',
      'frontend/src/game/marketDirectionalInput.ts', 'frontend/src/game/marketMovement.ts',
      'frontend/src/screens/GamePrototypeScreen.tsx',
      'market-simulator/test/fixtures/whole-trace-reachability-snapshots.json'].map(file => ({ path: file,
      sha256: createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../..', file))).digest('hex') })),
    definitions: {
      anchor: 'Directed wholeReplayWaypointGraph BFS plus reverse reachability to a checkout from every reachable waypoint; points exclude synthetic start. Current visibility, HUD, camera and arrival margin apply.',
      directional: 'Uniform-cell visited keys retain actual motor endpoints; eight directions use shared 10ms directionalInputSlices and resolveMarketEnvironmentMovement. No HUD or screen edge filters movement.',
      target: 'Every shelf station and at least one checkout must occur as near in the existing visibleStations perception. Anchor movement must also permit returning to a checkout from every reached waypoint.',
      staffedCheckoutReturnability: 'Reported separately under the fixed initial cashier state. The movement-only matrix does not simulate staff calls or assert completion at an empty checkout. Pilot preflight must require this count to equal reachablePoints for its frozen cashier states.',
      scope: 'Initial cashier state; fixed explicit motor profile; no persona strategy, shopping actions, automatic navigation or proof of impossibility from a finite search.',
    }, rows,
    failures: rows.flatMap(row => ['anchor', 'directional'].filter(model => !row[model].pass)
      .map(model => ({ setting: settingLabel(row), model, message: failureMessage(row, model) }))) };
}

function formatMarkdown(report) {
  const lines = ['# Whole-trace reachability matrix', '',
    `${report.mode}: ${report.rows.length} screen/layout combinations, two movement models. ${report.elapsedMs} ms.`, '',
    'A = walkToAnchor reachable/catalog points (synthetic start excluded). D = directional reached/total uniform cells (start included; denominator includes blocked cells).',
    'Shelves = reachable/required; checkout = at least one near, perceived checkout. A return = points with a path to a checkout / reached points. A staffed = the stricter staffed-only count, reported separately without simulated staff calls. Result tests movement reachability, not checkout completion. FAIL is never allowlisted.', '',
    '| Layout | Viewport | Font | Safe top | A points | A shelves | A checkout | A return | A staffed | D points | D shelves | D checkout | Result |',
    '| --- | --- | ---: | ---: | ---: | ---: | :---: | ---: | ---: | ---: | ---: | :---: | --- |'];
  for (const row of report.rows) {
    const p = row.presentation, a = row.anchor, d = row.directional;
    lines.push(`| ${row.scenario} | ${p.viewport.width}×${p.viewport.height} | ${p.fontScale} | ${p.safeArea.top} | ${a.reachablePoints}/${a.totalPoints} | ${a.shelfStationIds.length}/${a.requiredShelfStationIds.length} | ${a.checkoutStationIds.length ? 'yes' : 'NO'} | ${a.checkoutReturnablePoints}/${a.reachablePoints} | ${a.staffedCheckoutReturnablePoints}/${a.reachablePoints} | ${d.reachablePoints}/${d.totalPoints} | ${d.shelfStationIds.length}/${d.requiredShelfStationIds.length} | ${d.checkoutStationIds.length ? 'yes' : 'NO'} | ${a.pass && d.pass ? 'pass' : ['anchor', 'directional'].filter(model => !row[model].pass).join(', ') + ' FAIL'} |`);
  }
  lines.push('', `Failures: ${report.failures.length}.`, '');
  for (const failure of report.failures) lines.push(`- ${failure.message}`);
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  try {
    let full = false, outputDirectory;
    for (let index = 2; index < process.argv.length; index++) {
      const arg = process.argv[index];
      if (arg === '--full') full = true;
      else if (arg === '--output-directory' && process.argv[index + 1]) outputDirectory = path.resolve(process.argv[++index]);
      else throw new Error('Usage: check-whole-trace-reachability.cjs [--full] [--output-directory PATH]');
    }
    // Never replace saved pilot/validation evidence, even if an old output path is supplied.
    if (outputDirectory) fs.mkdirSync(outputDirectory, { recursive: false });
    const report = runMatrix({ full, onRow: row => process.stderr.write(`${settingLabel(row)}: anchor=${row.anchor.pass ? 'pass' : 'FAIL'}, directional=${row.directional.pass ? 'pass' : 'FAIL'}\n`) });
    if (outputDirectory) {
      fs.writeFileSync(path.join(outputDirectory, 'reachability.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      fs.writeFileSync(path.join(outputDirectory, 'reachability.md'), formatMarkdown(report), { flag: 'wx' });
    }
    process.stdout.write(formatMarkdown(report));
    if (report.failures.length) process.exitCode = 2;
  } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}

module.exports = { VIEWPORTS, FONT_SCALES, SAFE_AREA_TOPS, OLD_HUD_RECT, scenarios, presentations,
  withHudRect, checkoutReturnability, inspectAnchor, verdict, settingLabel, failureMessage, assertReachable, runMatrix, formatMarkdown };
