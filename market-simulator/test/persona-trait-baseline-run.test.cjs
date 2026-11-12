'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const run = require('../src/personaValidationRun.cjs');
const { matchedContrasts, baselineContrasts } = require('../src/personaTraitValidationRun.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const BASE = 'mild-intellectual-disability-adult';
function setup(t, profiles) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-baseline-run-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotFilePaths = {}, goals = ['milk', 'apple', 'water', 'banana', 'eggs'].map((productId, index) => ({ productId, quantity: index === 2 ? 2 : 1 }));
  for (const [condition, n] of [['low', 2], ['high', 5]]) {
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`);
    write(snapshotFilePaths[condition], createMarketReplaySnapshot(createMarketSession({ seed: `base-${condition}`, difficulty: 'exact', objectives: goals.slice(0, n) })));
  }
  return { runId: 'baseline-fixture', outputDirectory: directory, snapshotFilePaths, profiles, seeds: Array.from({ length: 8 }, (_, i) => `s${i}`) };
}
function writeTraces(prepared) {
  for (const slot of prepared.slots) {
    const kinds = ['openShelf', ...(slot.personaId === 'operation-high' ? ['lookAround'] : []), 'dragProduct', 'viewCart', 'checkout'];
    const steps = kinds.map((type, i) => ({ id: `s${i}`, type, ...(type === 'openShelf' ? { stationId: 'fresh' } : {}),
      ...(type === 'dragProduct' ? { productId: 'milk', quantity: 1, gesture: { outcome: 'drop' } } : {}) }));
    const decisions = steps.map((step, index) => ({ decisionIndex: index, before: { sequence: index }, after: { result: { accepted: true } },
      action: step.type === 'openShelf' ? { type: 'interact', station: 'fresh' } : step.type === 'dragProduct' ? { type: 'add', productId: 'milk', quantity: 1 } : { type: step.type } }));
    fs.mkdirSync(path.dirname(slot.tracePath), { recursive: true });
    write(slot.tracePath, { traceSchemaVersion: '2', traceId: `fixture-${slot.personaId}-${slot.condition}-${slot.seed}`, generationPolicy: 'stochastic',
      experienceMode: 'first-play', personaId: slot.personaId, personaVersion: slot.personaVersion, seed: slot.seed, target: { snapshotId: slot.snapshotId }, steps });
    write(`${slot.tracePath}.knowledge-audit.json`, { decisions });
  }
}
test('baseline profiles join the slot grid and readiness but not trait contrasts, groups or blind panels', t => {
  const profiles = [
    { id: 'operation-low', basePersonaId: BASE, traits: { operationLearning: 'low' } },
    { id: 'operation-high', basePersonaId: BASE, traits: { operationLearning: 'high' } },
    { id: 'baseline', basePersonaId: BASE, traitMode: 'omitted' },
    { id: 'other-baseline', basePersonaId: 'quick-decider', traitMode: 'omitted' }];
  const args = setup(t, profiles), prepared = run.prepare(args), manifest = read(prepared.manifestPath);
  assert.equal(manifest.slots.length, 4 * 2 * 8);
  assert.deepEqual(prepared.profiles.find(p => p.id === 'baseline'), { id: 'baseline', presetId: null, traits: null, traitMode: 'omitted',
    contextHash: manifest.profiles['operation-low'].contextHash });
  assert.ok(!Object.hasOwn(prepared.profiles.find(p => p.id === 'operation-low'), 'traitMode'));

  const contrasts = matchedContrasts(manifest.profiles);
  assert.deepEqual(contrasts.map(c => c.id), ['operationLearning:operation-high:operation-low']);
  assert.deepEqual(baselineContrasts(manifest.profiles).map(({ id, baselineProfileId, profileId }) => ({ id, baselineProfileId, profileId })), [
    { id: 'baseline:baseline:operation-low', baselineProfileId: 'baseline', profileId: 'operation-low' },
    { id: 'baseline:baseline:operation-high', baselineProfileId: 'baseline', profileId: 'operation-high' }]);
  assert.deepEqual(baselineContrasts(manifest.profiles)[0].traits, manifest.profiles['operation-low'].traits);

  const before = run.checkReadiness({ runDirectory: prepared.runDirectory });
  assert.equal(before.required, 64);
  const baselineMissing = before.missingSlots.filter(slot => slot.personaId === 'baseline');
  assert.equal(baselineMissing.length, 16);
  assert.ok(baselineMissing.every(slot => slot.status === 'missing' && slot.prepareWholeTrace.personaId === 'baseline'));
  assert.equal(before.control.required, false);
  assert.ok(before.referenceControls.every(row => !['baseline', 'other-baseline'].includes(row.referencePersonaId)));
  assert.ok([...before.expectedValidPairs, ...before.unmatchedSlots].every(row => ![row.actorPersonaId, row.referencePersonaId].includes('baseline')));

  writeTraces(prepared);
  const after = run.checkReadiness({ runDirectory: prepared.runDirectory });
  assert.equal(after.complete, 64); assert.equal(after.missingSlots.length, 0);
  const data = read(run.measure({ runDirectory: prepared.runDirectory, allowFixture: true }).measurementsPath);
  assert.equal(data.completed, 64);
  assert.deepEqual(data.findings.map(f => f.id), Array(2).fill('operationLearning:operation-high:operation-low'));
  assert.ok(data.findings.every(f => f.status === 'pass'));
  assert.ok(data.groups.every(group => !group.personaIds.includes('baseline') && !group.personaIds.includes('other-baseline')));
  const baselineRows = data.perTrace.filter(row => row.personaId === 'baseline');
  assert.equal(baselineRows.length, 16);
  assert.ok(baselineRows.every(row => row.traits === null && row.traitMode === 'omitted' && row.presetId === null));
  assert.ok(data.perTrace.filter(row => row.personaId === 'operation-low').every(row => !Object.hasOwn(row, 'traitMode')));
  assert.equal(data.flags.baseline.traces, 16);

  const blind = run.prepareBlind({ runDirectory: prepared.runDirectory, allowFixture: true });
  assert.equal(blind.excludedBaselineTraces, 32);
  assert.equal(blind.bundle.panels.A.length, 32);
  const key = read(path.join(prepared.runDirectory, 'blind-key.json'));
  assert.equal(key.length, 64);
  assert.ok(key.every(row => ['operation-low', 'operation-high'].includes(row.personaId)));

  const report = run.report({ runDirectory: prepared.runDirectory }), output = read(report.reportPath);
  assert.equal(output.excludedBaselineTraces, 32);
  assert.deepEqual(output.baselineProfileIds, ['baseline', 'other-baseline']);
  assert.equal(output.baselineContrasts.length, 2);
  assert.equal(output.axes.traitExpression.operationLearning.status, 'supported');
  assert.match(fs.readFileSync(report.markdownPath, 'utf8'), /기준 프로필\(성향 지침 생략\) baseline, other-baseline의 trace는 .*제외했다: 32건/);
});
test('runs without baselines report no baseline fields and blind exclusion count 0', t => {
  const args = setup(t, [{ id: 'operation-low', basePersonaId: BASE, traits: { operationLearning: 'low' } },
    { id: 'operation-high', basePersonaId: BASE, traits: { operationLearning: 'high' } }]);
  const prepared = run.prepare(args); writeTraces(prepared);
  run.measure({ runDirectory: prepared.runDirectory, allowFixture: true });
  const blind = run.prepareBlind({ runDirectory: prepared.runDirectory, allowFixture: true });
  assert.equal(blind.excludedBaselineTraces, 0);
  assert.ok(!Object.hasOwn(read(path.join(prepared.runDirectory, 'blind-state.json')), 'excludedBaselineTraces'));
  const output = read(run.report({ runDirectory: prepared.runDirectory }).reportPath);
  for (const key of ['baselineProfileIds', 'baselineContrasts', 'excludedBaselineTraces']) assert.ok(!Object.hasOwn(output, key), key);
});
