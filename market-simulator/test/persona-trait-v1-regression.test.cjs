'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const run = require('../src/validation/personaTraitValidationRun.cjs');
const { buildSnapshots } = require('../scripts/build-validation-snapshots.cjs');
const { canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
const golden = require('./fixtures/persona-trait-v1-regression.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
const definitions = [
  { id: 'checking-low', basePersonaId: 'neutral-adult-control', presetId: 'deliberate-checker', traits: { checking: 'low' } },
  { id: 'checking-high', basePersonaId: 'neutral-adult-control', presetId: 'deliberate-checker', traits: { checking: 'high' } },
];
function normalize(value, directory) {
  if (typeof value === 'string') return value.replaceAll(directory, '<FIXTURE_DIRECTORY>');
  if (Array.isArray(value)) return value.map(item => normalize(item, directory));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    // A path-dependent cryptographic inventory is tested separately by the evaluator, not replaced by a fake hash.
    .filter(([key]) => key !== 'dataFingerprint').map(([key, item]) => [key, normalize(item, directory)]));
  return value;
}
function fixture(directory, api, snapshots, analysisVersion) {
  const snapshotFilePaths = {};
  for (const [condition, snapshot] of Object.entries(snapshots)) {
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`); write(snapshotFilePaths[condition], snapshot);
  }
  const prepared = api.prepare({ runId: `v1-analysis-${analysisVersion ?? 'none'}`, outputDirectory: directory,
    snapshotFilePaths, seeds: ['s1', 's2'], profiles: definitions, catalogSchemaVersion: 'persona-traits-v1' });
  const manifest = read(prepared.manifestPath);
  if (analysisVersion === undefined) {
    manifest.specHash = digest(require('../validation/archive/persona-trait-validation-spec.v1.json'));
    for (const key of ['analysisVersion', 'specVersion', 'opportunityAudit', 'opportunityAuditHash']) delete manifest[key];
    write(prepared.manifestPath, manifest);
  }
  for (const slot of manifest.slots) {
    const goals = read(snapshotFilePaths[slot.condition]).config.objectives;
    const steps = [{ type: 'readList' }];
    for (const goal of goals) {
      steps.push({ type: 'dragProduct', productId: goal.productId, quantity: goal.quantity, gesture: { outcome: 'drop' } });
      if (slot.personaId === 'checking-high') steps.push({ type: 'readList' });
    }
    if (slot.personaId === 'checking-high') steps.push({ type: 'viewCart' });
    steps.push({ type: 'checkout' }, { type: 'submitForReview' });
    const trace = { traceSchemaVersion: '2', personaId: slot.personaId, personaVersion: manifest.profiles[slot.personaId].persona.version,
      seed: slot.seed, generationPolicy: 'stochastic', target: { snapshotId: slot.snapshotId },
      traceId: `fixture-${slot.condition}-${slot.seed}-${slot.personaId}`,
      steps: steps.map((step, index) => ({ id: `s${index}`, reactionDelayMs: 100, reason: '화면의 조건을 확인한다', ...step })) };
    fs.mkdirSync(path.dirname(slot.tracePath), { recursive: true }); write(slot.tracePath, trace);
  }
  return prepared;
}
for (const analysisVersion of [undefined, 1]) test(`v1 catalog with analysisVersion ${analysisVersion ?? 'absent'} matches frozen pre-change run results`, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-v1-golden-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const prepared = fixture(directory, run, buildSnapshots(), analysisVersion);
  const before = fs.readFileSync(prepared.manifestPath, 'utf8');
  const measured = run.measure({ runDirectory: prepared.runDirectory, allowFixture: true });
  assert.equal(fs.readFileSync(prepared.manifestPath, 'utf8'), before, 'historical manifest bytes must not be rewritten');
  const measurementBytes = fs.readFileSync(measured.measurementsPath, 'utf8');
  const result = run.report({ runDirectory: prepared.runDirectory });
  const expected = golden.runs[analysisVersion ?? 'absent'];
  const measuredValue = normalize(read(measured.measurementsPath), directory);
  assert.equal(digest(measuredValue), expected.measurementsHash, 'all normalized measurement fields must match the pre-change baseline');
  assert.equal(digest(normalize(read(result.reportPath), directory)), expected.reportHash, 'all normalized report fields must match the pre-change baseline');
  assert.deepEqual(Object.fromEntries(Object.entries(read(prepared.manifestPath).profiles).map(([id, profile]) => [id, profile.persona.version])), expected.profileVersions);
  assert.equal(read(prepared.manifestPath).specHash, expected.specHash);
  assert.equal(read(prepared.manifestPath).catalogHash, golden.catalogHash);
  const reportBytes = fs.readFileSync(result.reportPath, 'utf8'), markdownBytes = fs.readFileSync(result.markdownPath, 'utf8');
  run.measure({ runDirectory: prepared.runDirectory, allowFixture: true });
  assert.equal(run.report({ runDirectory: prepared.runDirectory }).historicalArtifactPreserved, true);
  assert.equal(fs.readFileSync(measured.measurementsPath, 'utf8'), measurementBytes);
  assert.equal(fs.readFileSync(result.reportPath, 'utf8'), reportBytes);
  assert.equal(fs.readFileSync(result.markdownPath, 'utf8'), markdownBytes);
  assert.equal(fs.readFileSync(prepared.manifestPath, 'utf8'), before);
});
// Shared only with the one-time baseline capture performed against the recorded pre-change commit.
module.exports = { fixture, normalize, digest };
