#!/usr/bin/env node
'use strict';
// Read-only pilot analysis: no candidate compilation, replay, or trace generation.
require('../runtime.cjs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { wholeReplayWaypointCatalog, wholeReplayWaypointGraph } = require('../../frontend/src/game/marketReplayPerception.ts');

const repository = path.resolve(__dirname, '../..');
const defaultPilotDirectory = path.join(repository, 'output/persona-pilot-20261028');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const slotKey = slot => JSON.stringify([slot.condition, slot.seed, slot.personaId]);

/** Directed BFS. The synthetic start is excluded from waypoint counts. */
function reachableGraph(graph) {
  const nodes = new Map(graph.nodes.map(node => [node.waypointId, node]));
  assert.equal(nodes.size, graph.nodes.length, 'Duplicate waypoint IDs');
  const visited = new Map(), queue = [], stations = new Map();
  const rememberStations = (nearby, waypointId) => {
    for (const station of nearby) if (!stations.has(station.id)) stations.set(station.id, { ...station, waypointId });
  };
  const visit = (id, previous) => {
    assert.ok(nodes.has(id), `Graph edge references missing waypoint: ${id}`);
    if (visited.has(id)) return;
    visited.set(id, previous);
    queue.push(id);
  };
  rememberStations(graph.startNearbyStations, 'start');
  for (const id of graph.startAllowedWaypointIds) visit(id, 'start');
  for (let i = 0; i < queue.length; i++) {
    const node = nodes.get(queue[i]);
    rememberStations(node.nearbyStations, node.waypointId);
    for (const id of node.allowedWaypointIds) visit(id, node.waypointId);
  }
  const routeTo = id => {
    const route = [];
    while (id !== 'start') { route.push(id); id = visited.get(id); }
    return ['start', ...route.reverse()];
  };
  const shelfStations = [...stations.values()].filter(station => station.kind === 'shelf').sort((a, b) => a.id.localeCompare(b.id));
  const checkoutStations = [...stations.values()].filter(station => station.kind === 'checkout').sort((a, b) => a.id.localeCompare(b.id));
  return {
    reachableWaypoints: visited.size,
    totalWaypoints: graph.nodes.length,
    reachableShelfStations: shelfStations.length,
    shelfStationIds: shelfStations.map(station => station.id),
    checkoutReachable: checkoutStations.length > 0,
    checkoutStationIds: checkoutStations.map(station => station.id),
    reachableWaypointIds: [...visited.keys()].sort(),
    firstShelfPath: shelfStations.length ? routeTo(shelfStations[0].waypointId) : null,
    firstCheckoutPath: checkoutStations.length ? routeTo(checkoutStations[0].waypointId) : null,
  };
}

function diagnosePilot(pilotDirectory = defaultPilotDirectory) {
  const directory = path.resolve(pilotDirectory);
  const manifests = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => path.join(directory, entry.name, 'manifest.json')).filter(file => fs.existsSync(file));
  assert.equal(manifests.length, 1, 'Expected exactly one run manifest under the pilot directory');
  const manifestPath = manifests[0], manifest = read(manifestPath);
  const expectedSlots = new Map(manifest.slots.map(slot => [slotKey(slot), slot]));
  assert.equal(expectedSlots.size, manifest.slots.length, 'Duplicate manifest slots');
  const actorsDirectory = path.join(directory, 'actors');
  const actorIds = fs.readdirSync(actorsDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name)).map(entry => entry.name).sort();
  assert.equal(actorIds.length, manifest.slots.length, 'Actor input count differs from the manifest slot count');
  const seenSlots = new Set(), rows = [];
  for (const actorId of actorIds) {
    const actorDirectory = path.join(actorsDirectory, actorId);
    const requestPath = path.join(actorDirectory, 'request.json'), request = read(requestPath), bundle = request.bundle;
    const provenance = read(path.join(actorDirectory, 'provenance.json')), key = slotKey(provenance.slot);
    const slot = expectedSlots.get(key);
    assert.ok(slot && !seenSlots.has(key), `Unknown or duplicate input slot: ${actorId}`);
    seenSlots.add(key);
    const record = manifest.snapshots[slot.condition];
    // Resolve the original snapshot name inside this pilot so the evidence can be copied intact.
    const snapshotPath = path.join(directory, 'snapshots', path.basename(record.filePath));
    const snapshotText = fs.readFileSync(snapshotPath, 'utf8'), snapshot = JSON.parse(snapshotText);
    assert.equal(hash(snapshotText), record.sha256, `Snapshot changed: ${actorId}`);
    assert.equal(bundle.snapshotId, snapshot.snapshotId, `Snapshot binding mismatch: ${actorId}`);
    assert.equal(bundle.requestId, request.requestId, `Request binding mismatch: ${actorId}`);
    assert.equal(bundle.requestId, provenance.requestId, `Provenance request mismatch: ${actorId}`);
    assert.equal(bundle.inputHash, provenance.inputHash, `Provenance input mismatch: ${actorId}`);
    assert.equal(bundle.seed, slot.seed, `Seed binding mismatch: ${actorId}`);
    assert.equal(bundle.persona.id, slot.personaId, `Persona binding mismatch: ${actorId}`);
    const reference = bundle.worldReference, navigation = reference.navigation;
    assert.deepEqual(reference.world, snapshot.environment, `Environment differs from snapshot: ${actorId}`);
    assert.deepEqual(reference.presentation, snapshot.presentation, `Presentation differs from snapshot: ${actorId}`);
    assert.deepEqual(navigation.startPoint, snapshot.environment.spawn, `Start differs from snapshot spawn: ${actorId}`);
    const initial = navigation.states.find(state => state.stateId === navigation.initialStateId);
    assert.ok(initial, `Missing original navigation initial state: ${actorId}`);
    assert.deepEqual(initial.cashierAvailability, snapshot.cashierAvailability, `Cashiers differ from snapshot: ${actorId}`);
    const catalog = wholeReplayWaypointCatalog(snapshot.environment, snapshot.cashierAvailability);
    assert.deepEqual(catalog, reference.waypoints, `Waypoint/anchor catalog changed: ${actorId}`);
    const beforeGraph = { nodes: initial.nodes, startAllowedWaypointIds: initial.start.allowedWaypointIds,
      startNearbyStations: initial.start.nearbyStations };
    const afterGraph = wholeReplayWaypointGraph(snapshot.environment, navigation.startPoint,
      snapshot.presentation, snapshot.cashierAvailability, catalog);
    rows.push({ actorId, condition: slot.condition, seed: slot.seed, personaId: slot.personaId,
      snapshotId: snapshot.snapshotId, requestPath: path.relative(repository, requestPath),
      requestSha256: hash(fs.readFileSync(requestPath)), snapshotPath: path.relative(repository, snapshotPath), snapshotSha256: record.sha256,
      presentation: snapshot.presentation, startPoint: navigation.startPoint, catalogUnchanged: true,
      before: reachableGraph(beforeGraph), after: reachableGraph(afterGraph) });
  }
  return {
    schema: 'oneuldo.whole-trace-reachability-diagnostic', version: 1,
    pilotDirectory: directory, manifestPath, manifestSha256: hash(fs.readFileSync(manifestPath)),
    baseline: 'Immutable actor request bundle worldReference.navigation initial state (the graph actually supplied to the pilot).',
    current: 'Current wholeReplayWaypointGraph, with the saved snapshot, initial position/cashiers and an identical waypoint catalog.',
    currentSourceFiles: ['frontend/src/game/marketReplayPerception.ts', 'frontend/src/game/marketHudLayout.ts',
      'frontend/src/components/game/MarketHud.tsx', 'frontend/src/screens/MarketSimulationScreen.tsx']
      .map(file => ({ path: file, sha256: hash(fs.readFileSync(path.join(repository, file))) })),
    definitions: { reachableWaypoints: 'Directed BFS from start; excludes the synthetic start node.',
      reachableShelfStations: 'Distinct nearbyStations IDs with kind === shelf at start or a reachable waypoint.',
      checkoutReachable: 'At least one nearbyStations entry with kind === checkout at start or a reachable waypoint.',
      scope: 'Initial cashier state only; this diagnostic does not model cashier-call state transitions or execute an actor.' },
    inputCount: rows.length, uniqueSnapshotCount: new Set(rows.map(row => row.snapshotId)).size,
    summary: Object.fromEntries(['before', 'after'].map(version => [version, {
      inputsWithShelf: rows.filter(row => row[version].reachableShelfStations > 0).length,
      inputsWithCheckout: rows.filter(row => row[version].checkoutReachable).length,
      inputsWithShelfAndCheckout: rows.filter(row => row[version].reachableShelfStations > 0 && row[version].checkoutReachable).length,
    }])),
    exceptions: rows.filter(row => !row.after.reachableShelfStations || !row.after.checkoutReachable)
      .map(row => ({ actorId: row.actorId, condition: row.condition, missingShelf: !row.after.reachableShelfStations,
        missingCheckout: !row.after.checkoutReachable })),
    rows,
  };
}

function formatMarkdown(report) {
  const lines = [
    '# Whole-trace waypoint reachability', '',
    `${report.inputCount} actor inputs; ${report.uniqueSnapshotCount} shared immutable snapshots.`, '',
    `Before: ${report.baseline}`, '', `After: ${report.current}`, '',
    'Counts exclude the synthetic start. Shelf counts are distinct reachable `nearbyStations` IDs with `kind === "shelf"`.', '',
    '| Input | Load | Seed | Persona | Before points | After points | Before shelves | After shelves | Before checkout | After checkout |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | :---: | :---: |',
  ];
  for (const row of report.rows) lines.push(`| ${row.actorId} | ${row.condition} | ${row.seed} | ${row.personaId} | ${row.before.reachableWaypoints}/${row.before.totalWaypoints} | ${row.after.reachableWaypoints}/${row.after.totalWaypoints} | ${row.before.reachableShelfStations} | ${row.after.reachableShelfStations} | ${row.before.checkoutReachable ? 'yes' : 'no'} | ${row.after.checkoutReachable ? 'yes' : 'no'} |`);
  lines.push('', `Inputs with a reachable shelf: **${report.summary.before.inputsWithShelf}/${report.inputCount} → ${report.summary.after.inputsWithShelf}/${report.inputCount}**.`, '',
    `Inputs with a reachable checkout: **${report.summary.before.inputsWithCheckout}/${report.inputCount} → ${report.summary.after.inputsWithCheckout}/${report.inputCount}**.`, '',
    `Waypoint/anchor catalogs unchanged: ${report.rows.filter(row => row.catalogUnchanged).length}/${report.inputCount}.`, '',
    report.exceptions.length ? `Exceptions: ${JSON.stringify(report.exceptions)}` : 'No inputs lack a reachable shelf or checkout.', '',
    'The JSON report includes BFS witness paths, source hashes and the complete reachable waypoint sets. Existing snapshots, bundles, candidates and traces are never rewritten.', '');
  return lines.join('\n');
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = { pilotDirectory: defaultPilotDirectory };
    for (let i = 0; i < args.length; i += 2) {
      const key = { '--pilot-directory': 'pilotDirectory', '--output-directory': 'outputDirectory' }[args[i]];
      if (!key || !args[i + 1]) throw new Error('Usage: node market-simulator/scripts/diagnose-whole-trace-reachability.cjs [--pilot-directory PATH] [--output-directory NEW_PATH]');
      options[key] = args[i + 1];
    }
    if (options.outputDirectory) {
      const relative = path.relative(path.resolve(options.pilotDirectory), path.resolve(options.outputDirectory));
      assert.ok(relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative), 'Diagnostic output must be outside the original pilot directory');
    }
    const report = diagnosePilot(options.pilotDirectory), markdown = formatMarkdown(report);
    if (options.outputDirectory) {
      fs.mkdirSync(options.outputDirectory, { recursive: false });
      fs.writeFileSync(path.join(options.outputDirectory, 'reachability.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      fs.writeFileSync(path.join(options.outputDirectory, 'reachability.md'), markdown, { flag: 'wx' });
    }
    process.stdout.write(markdown);
    if (report.exceptions.length) process.exitCode = 2;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { diagnosePilot, reachableGraph, formatMarkdown };
