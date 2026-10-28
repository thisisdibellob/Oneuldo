'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { auditSnapshot } = require('../src/personaValidationOpportunity.cjs');
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
