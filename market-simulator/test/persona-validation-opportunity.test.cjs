'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { auditSnapshot } = require('../src/validation/personaValidationOpportunity.cjs');
const { buildSnapshots, writeSnapshotSet } = require('../scripts/build-validation-snapshots.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, validateMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const persona = require('../personas/neutral-adult-control.json');
test('validation snapshot sets bind opportunities, fresh identities, and the same load-independent environment', () => {
  const snapshots = buildSnapshots(), again = buildSnapshots(), changed = buildSnapshots({ setId: 'another-validation-set' });
  assert.deepEqual(snapshots, again); assert.notEqual(snapshots.low.snapshotId, snapshots.high.snapshotId);
  assert.notEqual(snapshots.low.snapshotId, changed.low.snapshotId);
  assert.deepEqual(snapshots.low.environment, snapshots.high.environment);
  assert.deepEqual(snapshots.low.config.inventoryProductIds, snapshots.high.config.inventoryProductIds);
  for (const [condition, snapshot] of Object.entries(snapshots)) {
    assert.equal(validateMarketReplaySnapshot(snapshot).valid, true);
    const before = JSON.stringify(snapshot), audit = auditSnapshot(snapshot, { condition, persona });
    assert.equal(JSON.stringify(snapshot), before); assert.equal(audit.seedInvariant, true);
    assert.equal(audit.metrics.curryDetourRate.possible, true);
    assert.equal(audit.metrics.curryDetourRate.evidence.mealIsGoal, false);
    assert.equal(audit.metrics.curryDetourRate.evidence.mealSignOnReferenceRoute, true);
    assert.ok(audit.metrics.curryDetourRate.evidence.initiallyVisibleCurryProductIds.includes('curry'));
    assert.ok(audit.metrics.comparisonRate.evidence.goals.every(row => row.candidateProductIds.length >= 2 && row.pageCount > 1));
    assert.equal(audit.metrics.firstShelfOrientationCount.possible, true);
    assert.equal(audit.metrics.correctionRate.possible, true);
    assert.equal(audit.metrics.helpSeekingRate.possible, true);
    if (condition === 'high') assert.ok(audit.metrics.highLoadMismatchRate.evidence.quantityGoals.length > 0);
  }
});
test('static audit distinguishes impossible, unknown, and conditional exposure without simulating mistakes', () => {
  const snapshot = buildSnapshots().low;
  const mealGoal = structuredClone(snapshot); mealGoal.config.objectives[1] = { productId: 'curry', quantity: 1 };
  assert.equal(auditSnapshot(mealGoal, { persona }).metrics.curryDetourRate.status, 'impossible');
  const noCurry = structuredClone(snapshot); noCurry.config.inventoryProductIds.meal = ['ramen'];
  assert.equal(auditSnapshot(noCurry, { persona }).metrics.curryDetourRate.possible, false);
  assert.equal(auditSnapshot(snapshot).metrics.interestDetourRate.possible, false);
  assert.equal(auditSnapshot({ config: { objectives: [{ productId: 'milk', quantity: 1 }] } }, { persona }).metrics.comparisonRate.status, 'unknown');
  const single = { config: { difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 1 }], inventoryProductIds: { fresh: ['milk'] } }, initialStock: { milk: 1 } };
  const audit = auditSnapshot(single, { persona });
  assert.equal(audit.metrics.comparisonRate.possible, false); assert.equal(audit.metrics.postSelectionListRate.possible, false);
  assert.equal(audit.metrics.persistenceResponseRate.possible, true); // Declared uncertainty is still possible.
  assert.equal(audit.metrics.interestDetourRate.requiresObservedExposure, true);
});
test('fixed snapshots do not lose offered opportunities across actor seeds and source snapshots remain untouched', () => {
  const source = createMarketReplaySnapshot(createMarketSession({ seed: 'previous-low', difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 1 }] }));
  const sourceBefore = JSON.stringify(source), snapshots = buildSnapshots();
  assert.notEqual(source.snapshotId, snapshots.low.snapshotId); assert.equal(JSON.stringify(source), sourceBefore);
  const baseline = auditSnapshot(snapshots.high, { persona });
  for (let actorSeed = 0; actorSeed < 20; actorSeed++) {
    const slot = { seed: actorSeed, snapshot: snapshots.high };
    assert.deepEqual(auditSnapshot(slot.snapshot, { persona }), baseline);
  }
});
test('snapshot writer refuses overwrite and records byte hashes and audit warnings', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-snapshots-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const directory = path.join(parent, 'new-set'), result = writeSnapshotSet({ outputDirectory: directory });
  for (const record of Object.values(result.snapshots)) assert.equal(record.sha256, crypto.createHash('sha256').update(fs.readFileSync(record.filePath)).digest('hex'));
  const before = fs.readFileSync(result.snapshots.low.filePath);
  assert.throws(() => writeSnapshotSet({ outputDirectory: directory }), /EEXIST/);
  assert.deepEqual(fs.readFileSync(result.snapshots.low.filePath), before);
  assert.deepEqual(result.opportunityAudit.warnings, []);
});
test('a three-goal low condition adds two ordinary goal transitions without changing geometry or high load', () => {
  const options = { setId: 'three-goal-check', environmentSeed: 'fixed-three-goal-check' };
  const original = buildSnapshots(options), revised = buildSnapshots({ ...options, lowGoalCount: 3 });
  assert.equal(original.low.config.objectives.length, 2, 'The historical default remains reproducible');
  assert.deepEqual(revised.low.config.objectives, [
    { productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 1 }, { productId: 'water', quantity: 1 },
  ]);
  assert.deepEqual(revised.high, original.high);
  assert.deepEqual(revised.low.environment, original.low.environment);
  assert.deepEqual(revised.low.initialStock, original.low.initialStock);
  assert.deepEqual(revised.low.presentation, original.low.presentation);
  assert.notEqual(revised.low.snapshotId, original.low.snapshotId);
  assert.equal(validateMarketReplaySnapshot(revised.low).valid, true);
  assert.equal(auditSnapshot(revised.low, { persona }).metrics.postSelectionListRate.evidence.goalCount, 3);
  const { extract } = require('../src/validation/personaValidationMetrics.cjs');
  const sequentialSelections = snapshot => ({ steps: snapshot.config.objectives.flatMap((goal, index) => [
    { id: `add-${index}`, type: 'dragProduct', productId: goal.productId, quantity: 1, gesture: { outcome: 'drop' } },
    { id: `read-${index}`, type: 'readList' },
  ]) });
  const oldMetric = extract(sequentialSelections(original.low), original.low, persona, null, {}, { opportunityRows: true }).postSelectionListRate;
  const newMetric = extract(sequentialSelections(revised.low), revised.low, persona, null, {}, { opportunityRows: true }).postSelectionListRate;
  assert.equal(oldMetric.opportunityRows.length, 1);
  assert.equal(newMetric.opportunityRows.length, 2, 'Three distinct selections allow two next-goal intervals under the unchanged metric');
  assert.equal(newMetric.denominator, 2, 'The last selection still has no fabricated next-goal interval');
  for (const lowGoalCount of [1, 5, 2.5, NaN, '3'])
    assert.throws(() => buildSnapshots({ ...options, lowGoalCount }), /lowGoalCount/);
});
test('CLI records the explicit three-goal design and rejects invalid counts before creating output', t => {
  const { spawnSync } = require('node:child_process');
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-three-goals-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const cli = path.resolve(__dirname, '../scripts/build-validation-snapshots.cjs');
  const directory = path.join(parent, 'fresh');
  const result = spawnSync(process.execPath, [cli, '--output-directory', directory, '--low-goal-count', '3'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout), metadata = JSON.parse(fs.readFileSync(output.metadataPath, 'utf8'));
  assert.equal(output.design.lowGoalCount, 3);
  assert.deepEqual(metadata.design.singleSelectionGoalTransitions, { low: 2, high: 4 });
  assert.equal(JSON.parse(fs.readFileSync(output.snapshotFilePaths.low, 'utf8')).config.objectives.length, 3);
  const invalid = path.join(parent, 'invalid');
  assert.equal(spawnSync(process.execPath, [cli, '--output-directory', invalid, '--low-goal-count', 'wrong']).status, 1);
  assert.equal(fs.existsSync(invalid), false);
});
