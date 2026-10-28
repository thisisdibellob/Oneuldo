'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const run = require('../src/personaValidationRun.cjs');
const readiness = require('../src/personaValidationReadiness.cjs');
const { writeSnapshotSet } = require('../scripts/build-validation-snapshots.cjs');
const IDS = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control'];
function setup(t, extra = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-readiness-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { snapshotFilePaths } = writeSnapshotSet({ outputDirectory: path.join(directory, 'snapshots') });
  return run.prepare({ validationMode: 'legacy', runId: 'test', outputDirectory: directory, snapshotFilePaths,
    seeds: ['s1', 's2'], personaIds: IDS, ...extra });
}
function fixture(slot) {
  fs.mkdirSync(path.dirname(slot.tracePath), { recursive: true });
  fs.writeFileSync(slot.tracePath, JSON.stringify({ traceSchemaVersion: '2', traceId: `fixture-${slot.condition}-${slot.seed}-${slot.personaId}`,
    personaId: slot.personaId, personaVersion: slot.personaVersion, seed: slot.seed, generationPolicy: 'stochastic',
    target: { snapshotId: slot.snapshotId }, steps: [{ id: 'end', type: 'giveUp', reactionDelayMs: 100 }] }));
}
test('readiness identifies missing controls and returns the unchanged generation objects without rewriting a manifest', t => {
  const prepared = setup(t), slot = prepared.slots.find(s => s.condition === 'low' && s.personaId === IDS[0]);
  fixture(slot);
  const before = fs.readFileSync(prepared.manifestPath), result = readiness.check({ runDirectory: prepared.runDirectory });
  assert.equal(result.readiness, 'blocked');
  assert.equal(result.complete, 1); assert.equal(result.required, 16);
  assert.deepEqual(result.control, { personaId: IDS[3], required: true, present: false, completed: 0 });
  assert.ok(result.reasons.some(reason => reason.code === 'no-control-traces'));
  assert.ok(result.expectedValidPairs.every(row => row.maximumValidPairs === 0));
  assert.equal(result.missingSlots.length, 15);
  for (const missing of result.missingSlots) assert.deepEqual(missing.prepareWholeTrace, prepared.slots.find(s => s.tracePath === missing.tracePath).prepareWholeTrace);
  assert.equal(result.byPersonaCondition.find(row => row.personaId === IDS[0] && row.condition === 'low').complete, 1);
  assert.equal(result.fixtureOnly, true); assert.equal(result.containsFixture, true);
  assert.deepEqual(fs.readFileSync(prepared.manifestPath), before);
});
test('pair readiness keeps condition and seed together, not merely total control count', t => {
  const prepared = setup(t), actor = prepared.slots.find(s => s.condition === 'low' && s.seed === 's1' && s.personaId === IDS[1]);
  const control = prepared.slots.find(s => s.condition === 'low' && s.seed === 's2' && s.personaId === IDS[3]);
  fixture(actor); fixture(control);
  let result = readiness.check({ runDirectory: prepared.runDirectory });
  assert.equal(result.control.present, true); assert.equal(result.readiness, 'blocked');
  const unmatched = result.unmatchedSlots.find(row => row.actorPersonaId === IDS[1] && row.condition === 'low' && row.seed === 's1');
  assert.deepEqual(unmatched.missingPersonaIds, [IDS[3]]);
  fixture(prepared.slots.find(s => s.condition === 'low' && s.seed === 's1' && s.personaId === IDS[3]));
  result = readiness.check({ runDirectory: prepared.runDirectory });
  assert.equal(result.readiness, 'incomplete');
  assert.ok(result.expectedValidPairs.filter(row => row.actorPersonaId === IDS[1] && row.condition === 'low').every(row => row.maximumValidPairs === 1));
});
test('readiness separates recorded technical failure from unattempted missing slots', t => {
  const prepared = setup(t), [bad, failed, invalid] = prepared.slots;
  fs.mkdirSync(path.dirname(bad.tracePath), { recursive: true }); fs.writeFileSync(bad.tracePath, '{');
  fs.mkdirSync(`${failed.tracePath}.generation`, { recursive: true });
  fs.writeFileSync(`${failed.tracePath}.generation/status.json`, JSON.stringify({ state: 'failed', stage: 'generation' }));
  fs.mkdirSync(`${invalid.tracePath}.whole-trace`, { recursive: true });
  fs.writeFileSync(`${invalid.tracePath}.whole-trace/status.json`, JSON.stringify({ status: 'invalid', canRepair: true }));
  const result = readiness.check({ runDirectory: prepared.runDirectory });
  assert.equal(result.technicalFailures.length, 3);
  assert.equal(result.missingSlots.filter(slot => slot.status === 'technical-failure').length, 3);
  assert.equal(result.missingSlots.find(slot => slot.tracePath === bad.tracePath).generationAction, 'new-run-required');
});
test('traits compare configured reference profiles without requiring a named neutral persona', t => {
  const prepared = setup(t, { validationMode: 'traits', personaIds: undefined, profiles: [
    { id: 'checking-low', basePersonaId: IDS[3], traits: { checking: 'low' } },
    { id: 'checking-high', basePersonaId: IDS[3], traits: { checking: 'high' } },
  ] });
  prepared.slots.filter(slot => slot.condition === 'low').forEach(fixture);
  const result = readiness.check({ runDirectory: prepared.runDirectory });
  assert.equal(result.control.required, false); assert.equal(result.control.present, false);
  assert.equal(result.readiness, 'incomplete');
  assert.equal(result.referenceControls.length, 1); assert.equal(result.referenceControls[0].referencePersonaId, 'checking-low');
  assert.ok(result.expectedValidPairs.filter(row => row.condition === 'low').every(row => row.maximumValidPairs === 2));
  assert.ok(!result.reasons.some(reason => reason.code === 'no-control-traces'));
});
test('old manifests without audit keep unknown structural opportunity instead of false impossibility', t => {
  const prepared = setup(t), m = JSON.parse(fs.readFileSync(prepared.manifestPath));
  delete m.opportunityAudit; prepared.slots.forEach(fixture);
  const result = readiness.fromManifest(m);
  assert.ok(result.expectedValidPairs.every(row => row.structurallyPossible === null && row.maximumValidPairs === 2));
  assert.equal(result.readiness, 'incomplete');
  assert.match(result.powerWarning, /20/);
});
