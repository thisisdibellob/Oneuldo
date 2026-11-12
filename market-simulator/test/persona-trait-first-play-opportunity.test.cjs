'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { auditSnapshot, auditManifestSnapshots } = require('../src/validation/personaValidationOpportunity.cjs');
const { buildSnapshots, writeSnapshotSet } = require('../scripts/build-validation-snapshots.cjs');
const run = require('../src/validation/personaValidationRun.cjs');
const readiness = require('../src/validation/personaValidationReadiness.cjs');
const KINDS = ['initialCautionCount', 'operationLearningRate', 'routeRelianceRate', 'textCueLoadRate'];
const TRAITS = ['initialCaution', 'operationLearning', 'routeReliance', 'textCueLoad'];

test('analysis v2 audits all first-play opportunities while v1 audit output remains unchanged', () => {
  for (const snapshot of Object.values(buildSnapshots())) {
    const before = JSON.stringify(snapshot), v1 = auditSnapshot(snapshot), v2 = auditSnapshot(snapshot, { analysisVersion: 2 });
    assert.equal(JSON.stringify(snapshot), before);
    assert.deepEqual(auditSnapshot(snapshot, { analysisVersion: 1 }), v1);
    for (const kind of KINDS) {
      assert.equal(v1.metrics[kind], undefined);
      assert.equal(v2.metrics[kind].possible, true);
      assert.equal(v2.metrics[kind].requiresObservedExposure, true);
    }
    for (const [kind, metric] of Object.entries(v1.metrics)) assert.deepEqual(v2.metrics[kind], metric);
    const route = v2.metrics.routeRelianceRate.evidence;
    assert.ok(route.reachableBranchCount > 0);
    assert.ok(route.witness.path.includes(route.witness.visitedChoiceId));
    assert.ok(!route.witness.path.includes(route.witness.unvisitedChoiceId));
    assert.ok(v2.metrics.textCueLoadRate.evidence.goals.every(goal => goal.simultaneousPages.length > 0));
  }
});

test('first-play audit warns for no reachable branch and no simultaneous similar products', () => {
  const snapshot = buildSnapshots().low;
  snapshot.presentation = { viewport: { width: 240, height: 240 }, zoom: 2, fontScale: 4, safeArea: { top: 200, bottom: 200 } };
  const audit = auditManifestSnapshots({ snapshots: { low: snapshot }, personaIds: ['neutral-adult-control'], validationMode: 'traits', analysisVersion: 2 });
  const metrics = audit.byPersonaCondition[0].metrics;
  assert.equal(metrics.routeRelianceRate.possible, false);
  assert.equal(metrics.routeRelianceRate.evidence.reason, 'no-reachable-branch');
  assert.equal(metrics.textCueLoadRate.possible, false);
  for (const kind of ['routeRelianceRate', 'textCueLoadRate']) assert.ok(audit.warnings.some(warning => warning.kind === kind && warning.code === 'structurally-impossible'));
});

test('same-family alternatives must be simultaneously displayed with an available goal candidate', () => {
  const snapshot = buildSnapshots().low;
  snapshot.config.objectives = [{ productId: 'milk', quantity: 1 }];
  snapshot.config.inventoryProductIds.fresh = ['milk', 'eggs', 'yogurt', 'cheese', 'butter', 'tofu', 'milk-small'];
  snapshot.presentation = { viewport: { width: 240, height: 400 }, zoom: 1.3, fontScale: 1, safeArea: { top: 0, bottom: 0 } };
  assert.equal(auditSnapshot(snapshot, { analysisVersion: 2 }).metrics.textCueLoadRate.possible, false);
  snapshot.config.inventoryProductIds.fresh = ['milk', 'milk-small'];
  assert.equal(auditSnapshot(snapshot, { analysisVersion: 2 }).metrics.textCueLoadRate.possible, true);
  snapshot.initialStock.milk = 0;
  assert.equal(auditSnapshot(snapshot, { analysisVersion: 2 }).metrics.textCueLoadRate.possible, false);
  const unknown = auditSnapshot({ config: { objectives: [{ productId: 'milk', quantity: 1 }] } }, { analysisVersion: 2 });
  assert.equal(unknown.metrics.routeRelianceRate.possible, null);
  assert.equal(unknown.metrics.textCueLoadRate.possible, null);
  const noShelf = structuredClone(snapshot);
  noShelf.config.inventoryProductIds = {};
  const earlyEnding = auditSnapshot(noShelf, { analysisVersion: 2 }).metrics.initialCautionCount;
  assert.equal(earlyEnding.possible, true);
  assert.deepEqual(earlyEnding.requires, ['observed-actor-actions']);
  assert.match(earlyEnding.reason, /관찰 종료까지/);
});

test('v2 readiness includes each new trait contrast and preserves impossible-opportunity warnings', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-first-play-ready-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { snapshotFilePaths } = writeSnapshotSet({ outputDirectory: path.join(directory, 'snapshots') });
  const profiles = [{ id: 'baseline', basePersonaId: 'neutral-adult-control' }, ...TRAITS.map(key => ({ id: key.toLowerCase(), basePersonaId: 'neutral-adult-control', traits: { [key]: 'high' } }))];
  const prepared = run.prepare({ validationMode: 'traits', runId: 'first-play', outputDirectory: directory, snapshotFilePaths, seeds: ['s1', 's2'], profiles });
  const manifest = JSON.parse(fs.readFileSync(prepared.manifestPath));
  assert.equal(manifest.analysisVersion, 2);
  const before = fs.readFileSync(prepared.manifestPath), result = readiness.check({ runDirectory: prepared.runDirectory });
  for (const traitKey of TRAITS) assert.ok(result.expectedValidPairs.some(row => row.traitKey === traitKey && row.structurallyPossible === true));
  assert.deepEqual(fs.readFileSync(prepared.manifestPath), before);
  const profileVersionOnly = structuredClone(manifest);
  delete profileVersionOnly.catalogSchemaVersion;
  assert.deepEqual(readiness.fromManifest(profileVersionOnly).expectedValidPairs, result.expectedValidPairs);
  for (const row of manifest.opportunityAudit.byPersonaCondition) row.metrics.routeRelianceRate.possible = false;
  manifest.opportunityAudit.warnings.push({ personaId: 'baseline', condition: 'low', kind: 'routeRelianceRate', code: 'structurally-impossible', message: '갈림길 없음' });
  const impossible = readiness.fromManifest(manifest);
  assert.ok(impossible.expectedValidPairs.filter(row => row.traitKey === 'routeReliance').every(row => row.plannedMaximumValidPairs === 0));
  assert.ok(impossible.reasons.some(reason => reason.kind === 'routeRelianceRate' && reason.code === 'structurally-impossible'));
});
