'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const run = require('../src/validation/personaValidationRun.cjs');
const { createService, definitions } = require('../server.cjs');
const { buildSnapshots } = require('../scripts/build-validation-snapshots.cjs');
const { canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
const ids = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control'];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
function setup(t, mode, seeds = ['s1'], catalogSchemaVersion = 'persona-traits-v2') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-analysis-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotFilePaths = {};
  for (const [condition, snapshot] of Object.entries(buildSnapshots())) {
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`); write(snapshotFilePaths[condition], snapshot);
  }
  const selection = mode === 'legacy' ? { personaIds: ids } : { profiles: [
    { id: 'less-checking', basePersonaId: ids[3], traits: { checking: 'low' } },
    { id: 'more-checking', basePersonaId: ids[3], traits: { checking: 'high' } },
  ] };
  const args = { runId: 'new-run', outputDirectory: directory, snapshotFilePaths, seeds, validationMode: mode, ...(mode === 'traits' ? { catalogSchemaVersion } : {}), ...selection };
  return { args, prepared: run.prepare(args) };
}
for (const mode of ['legacy', 'traits']) test(`${mode}: blocked measurements retain fields and report starts with causes`, async t => {
  const { prepared } = setup(t, mode), manifest = read(prepared.manifestPath);
  assert.equal(manifest.analysisVersion, mode === 'traits' ? 2 : 1);
  assert.equal(prepared.recommendedSeedCount, 20); assert.equal(prepared.powerWarning.provided, 1);
  assert.ok(manifest.opportunityAudit.byPersonaCondition.length);
  const before = fs.readFileSync(prepared.manifestPath, 'utf8');
  const service = createService({ generateTrace: () => { throw new Error('Must never generate'); } });
  t.after(() => service.close());
  const readiness = await service.invokeTool('check_persona_validation_readiness', { runDirectory: prepared.runDirectory });
  assert.equal(readiness.readiness, 'blocked');
  assert.equal(fs.readFileSync(prepared.manifestPath, 'utf8'), before);
  assert.deepEqual(readiness.missingSlots.map(s => s.prepareWholeTrace), prepared.slots.map(s => s.prepareWholeTrace));
  const measured = run.measure({ runDirectory: prepared.runDirectory });
  assert.equal(measured.completed, 0); assert.equal(measured.readiness, 'blocked');
  const data = read(measured.measurementsPath);
  assert.equal(data.sequenceMetrics.descriptiveOnly, true);
  assert.ok(data.pooledAnalysis.every(row => row.delta === null));
  assert.ok(data.powerAnalysis.every(row => row.detectionPower === null));
  const report = run.report({ runDirectory: prepared.runDirectory }), output = read(report.reportPath);
  assert.equal(output.referenceComparison, null); assert.equal(output.readiness, 'blocked');
  assert.deepEqual(output.inabilityCauses.map(row => row.cause), ['표본 부족', '대조군 없음', '기회 미발생', '기술 실패']);
  assert.equal(output.inabilityCauses.find(row => row.cause === '기술 실패').count, 0);
  assert.equal(output.inabilityCauses.find(row => row.cause === '기회 미발생').perTraceCount, 0);
  const markdown = fs.readFileSync(report.markdownPath, 'utf8');
  assert.ok(markdown.indexOf('판정 불가 원인') < markdown.indexOf('Run:'));
  assert.match(markdown, /실수 강제 금지/);
  assert.match(markdown, /\| 기회 미발생 \| 쌍 0 \/ 개별 trace 0 \|/);
});
for (const mode of ['legacy', 'traits']) test(`${mode}: previous spec hashes remain readable without adding new analysis to old manifests`, t => {
  const { prepared } = setup(t, mode, ['s1'], 'persona-traits-v1'), m = read(prepared.manifestPath);
  const archive = require(mode === 'legacy' ? '../validation/archive/persona-validation-spec.v2.json' : '../validation/archive/persona-trait-validation-spec.v1.json');
  m.specHash = digest(archive); delete m.specVersion; delete m.analysisVersion; delete m.opportunityAudit;
  write(prepared.manifestPath, m);
  const before = fs.readFileSync(prepared.manifestPath, 'utf8');
  assert.equal(run.readManifest(prepared.runDirectory).specHash, digest(archive));
  run.checkReadiness({ runDirectory: prepared.runDirectory });
  assert.equal(fs.readFileSync(prepared.manifestPath, 'utf8'), before);
  const measured = read(run.measure({ runDirectory: prepared.runDirectory }).measurementsPath);
  assert.equal(measured.sequenceMetrics, undefined);
  assert.equal(read(prepared.manifestPath).analysisVersion, undefined);
  assert.equal(fs.readFileSync(prepared.manifestPath, 'utf8'), before);
  const measurementPath = path.join(prepared.runDirectory, 'measurements.json');
  const measurementBefore = fs.readFileSync(measurementPath, 'utf8');
  run.measure({ runDirectory: prepared.runDirectory });
  assert.equal(fs.readFileSync(measurementPath, 'utf8'), measurementBefore);
  const report = run.report({ runDirectory: prepared.runDirectory });
  const reportBefore = fs.readFileSync(report.reportPath, 'utf8'), markdownBefore = fs.readFileSync(report.markdownPath, 'utf8');
  assert.equal(run.report({ runDirectory: prepared.runDirectory }).historicalArtifactPreserved, true);
  assert.equal(fs.readFileSync(report.reportPath, 'utf8'), reportBefore);
  assert.equal(fs.readFileSync(report.markdownPath, 'utf8'), markdownBefore);
  const changed = read(measurementPath); changed.completed = 999; write(measurementPath, changed);
  assert.throws(() => run.measure({ runDirectory: prepared.runDirectory }), /Historical measurements would change/);
});
test('new spec primary thresholds and metrics match archived definitions byte for meaning', () => {
  for (const [currentPath, previousPath] of [
    ['../validation/persona-validation-spec.json', '../validation/archive/persona-validation-spec.v2.json'],
    ['../validation/persona-trait-validation-spec.json', '../validation/archive/persona-trait-validation-spec.v1.json'],
  ]) {
    const current = require(currentPath), previous = require(previousPath);
    for (const key of ['metrics', 'minValidPairs', 'minAbsDelta', 'maxFlaggedTraceRate', 'bootstrapReplicates', 'patterns', 'comparisonPolicy'])
      assert.deepEqual(current[key], previous[key], key);
    assert.equal(current.version, previous.version + 1);
  }
});
test('interactive CLI exposes read-only readiness and does not rewrite the manifest', t => {
  const { prepared } = setup(t, 'legacy', Array.from({ length: 20 }, (_, i) => `s${i}`));
  assert.equal(prepared.powerWarning, null);
  const before = fs.readFileSync(prepared.manifestPath, 'utf8');
  const request = { tool: 'check-persona-validation-readiness', arguments: { runDirectory: prepared.runDirectory } };
  const child = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs'), 'interactive'], { input: JSON.stringify(request) + '\n', encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(child.status, 0, child.stderr); assert.equal(child.stderr, '');
  const response = JSON.parse(child.stdout);
  assert.equal(response.required, 160); assert.equal(response.readiness, 'blocked');
  assert.equal(fs.readFileSync(prepared.manifestPath, 'utf8'), before);
  assert.equal(definitions.find(tool => tool.name === 'check_persona_validation_readiness').annotations.readOnlyHint, true);
});
