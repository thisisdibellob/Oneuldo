'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const run = require('../src/personaValidationRun.cjs');
const readiness = require('../src/personaValidationReadiness.cjs');
const { movementOptions, assertMovementBinding, assertMovementManifest, assertMovementEvidence } = require('../src/personaValidationMovement.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const ids = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control'];
const marker = { movementValidationVersion: '1' };
const directional = { ...marker, movementVersion: 'directional-v2' };
const feedback = { ...directional, movementFeedbackVersion: 'recent-movement-v1' };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
function fixture(t, mode = 'legacy') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-movement-binding-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotFilePaths = {};
  const goals = [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 },
    { productId: 'water', quantity: 1 }, { productId: 'banana', quantity: 1 }, { productId: 'curry', quantity: 1 }];
  for (const [condition, count] of [['low', 2], ['high', 5]]) {
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`);
    write(snapshotFilePaths[condition], createMarketReplaySnapshot(createMarketSession({ seed: `movement-${condition}`,
      difficulty: 'exact', objectives: goals.slice(0, count) })));
  }
  return { directory, args: { runId: 'binding', outputDirectory: directory, snapshotFilePaths, seeds: ['s1'],
    personaIds: ids, validationMode: mode, ...(mode === 'traits' ? { catalogSchemaVersion: 'persona-traits-v1' } : {}) } };
}
function evidence(options) {
  return { trace: { generation: {
    ...(options.movementValidationVersion ? { wholeTraceMovementValidationVersion: options.movementValidationVersion } : {}),
    ...(options.movementVersion ? { wholeTraceMovementVersion: options.movementVersion } : {}),
    ...(options.movementFeedbackVersion ? { wholeTraceMovementFeedbackVersion: options.movementFeedbackVersion } : {}),
  } }, bundle: { ...options }, audit: { ...options,
    ...(options.movementValidationVersion ? { navigationEvidence: { version: 'continuous-route-v1' },
      decisions: [{ navigationEvidence: { version: 'continuous-route-v1' } }] } : {}) } };
}

test('movement binding is explicitly versioned, including its anchor control and feedback switch', () => {
  for (const options of [{}, marker, directional, feedback]) {
    assert.deepEqual(movementOptions(options), options);
    assertMovementBinding(options, { ignored: true, ...options });
    assertMovementEvidence(options, evidence(options));
  }
  for (const options of [{ movementValidationVersion: '2' }, { movementVersion: 'directional-v2' },
    { ...marker, movementVersion: 'directional-v1' }, { ...marker, movementFeedbackVersion: 'recent-movement-v1' },
    { ...directional, movementFeedbackVersion: 'unknown' }]) assert.throws(() => movementOptions(options), /movement/i);
  assert.throws(() => assertMovementBinding({}, marker), /binding/i);
  assert.throws(() => assertMovementBinding(directional, feedback), /binding/i);
  assert.throws(() => assertMovementManifest({ ...feedback, slots: [{ ...directional }] }), /slot movement binding/i);
});

test('trace, bundle, audit and continuous navigation evidence must all match before measurement', () => {
  for (const options of [marker, directional, feedback]) {
    for (const [part, field] of [['trace', 'wholeTraceMovementValidationVersion'], ['bundle', 'movementValidationVersion'],
      ['audit', 'movementValidationVersion']]) {
      const changed = evidence(options);
      delete (part === 'trace' ? changed.trace.generation : changed[part])[field];
      assert.throws(() => assertMovementEvidence(options, changed), /movement/i);
    }
    const changed = evidence(options); changed.audit.navigationEvidence.version = 'unknown';
    assert.throws(() => assertMovementEvidence(options, changed), /navigation evidence/);
    const missingDecision = evidence(options); delete missingDecision.audit.decisions[0].navigationEvidence;
    assert.throws(() => assertMovementEvidence(options, missingDecision), /decision requires/);
    assert.throws(() => assertMovementEvidence({}, evidence(options)), /movement/i);
  }
  const changed = evidence(feedback); delete changed.trace.generation.wholeTraceMovementFeedbackVersion;
  assert.throws(() => assertMovementEvidence(feedback, changed), /movement/i);
  const old = evidence({}); old.audit.navigationEvidence = { version: 'continuous-route-v1' };
  assert.throws(() => assertMovementEvidence({}, old), /Historical validation/);
});

for (const mode of ['legacy', 'traits']) test(`${mode} freezes movement options in manifest, every persona slot and readiness without profile conversion`, t => {
  const f = fixture(t, mode), prepared = run.prepare({ ...f.args, ...feedback });
  const manifest = run.readManifest(prepared.runDirectory);
  assert.equal(manifest.version, mode === 'legacy' ? 2 : 3);
  assert.deepEqual(movementOptions(manifest), feedback);
  assert.deepEqual(movementOptions(prepared), feedback);
  const before = fs.readFileSync(prepared.manifestPath);
  const ready = readiness.check({ runDirectory: prepared.runDirectory });
  assert.deepEqual(fs.readFileSync(prepared.manifestPath), before, 'readiness never rewrites a manifest');
  assert.deepEqual(movementOptions(ready), feedback);
  assert.deepEqual(ready.missingSlots.map(slot => slot.prepareWholeTrace), prepared.slots.map(slot => slot.prepareWholeTrace));
  for (const slot of prepared.slots) {
    assert.deepEqual(movementOptions(slot), feedback);
    assert.deepEqual(movementOptions(slot.prepareWholeTrace), feedback);
    const snapshot = read(f.args.snapshotFilePaths[slot.condition]);
    const bound = run.lookupValidationSlot(slot.prepareWholeTrace, snapshot);
    assert.deepEqual(bound.persona, require(`../personas/${slot.personaId}.json`));
    assert.throws(() => run.lookupValidationSlot({ ...slot.prepareWholeTrace, movementFeedbackVersion: undefined }, snapshot), /movement binding/);
    assert.throws(() => run.lookupValidationSlot({ ...slot.prepareWholeTrace, seed: 'different' }, snapshot), /binding mismatch/);
  }
  for (const options of [{}, marker, directional]) {
    assert.throws(() => run.prepare({ ...f.args, ...options }), /movement binding/);
    assert.deepEqual(fs.readFileSync(prepared.manifestPath), before, 'rejected resume must preserve original bytes');
  }
  const corrupt = structuredClone(manifest); delete corrupt.slots[0].movementFeedbackVersion;
  write(prepared.manifestPath, corrupt);
  assert.throws(() => run.readManifest(prepared.runDirectory), /slot movement binding/);
});

for (const mode of ['legacy', 'traits']) test(`${mode} old runs cannot opt in on resume and failed evidence is not accepted by refresh or readiness`, t => {
  const f = fixture(t, mode), old = run.prepare(f.args);
  const before = fs.readFileSync(old.manifestPath);
  assert.deepEqual(movementOptions(run.readManifest(old.runDirectory)), {});
  assert.ok(old.slots.every(slot => Object.keys(slot.prepareWholeTrace).every(key => !key.startsWith('movement'))));
  assert.throws(() => run.prepare({ ...f.args, ...marker }), /movement binding/);
  for (const slot of old.slots) assert.throws(() => run.lookupValidationSlot({ ...slot.prepareWholeTrace, ...directional },
    read(f.args.snapshotFilePaths[slot.condition])), /movement binding/);
  assert.deepEqual(fs.readFileSync(old.manifestPath), before);
  const prepared = run.prepare({ ...f.args, runId: 'opt-in', ...marker });
  const manifest = run.readManifest(prepared.runDirectory), slot = prepared.slots[0];
  const preparedBytes = fs.readFileSync(prepared.manifestPath);
  write(slot.tracePath, { generationPolicy: 'stochastic', traceId: 'fixture', steps: [], personaId: slot.personaId,
    personaVersion: slot.personaVersion, seed: slot.seed, target: { snapshotId: slot.snapshotId } });
  assert.throws(() => run.refresh(manifest), /movement evidence/);
  assert.throws(() => run.load(manifest, { allowFixture: true }), /movement evidence/);
  const ready = readiness.check({ runDirectory: prepared.runDirectory });
  assert.equal(ready.complete, 0);
  assert.match(ready.technicalFailures[0].reason, /movement evidence/);
  assert.deepEqual(fs.readFileSync(prepared.manifestPath), preparedBytes, 'failed refresh must not freeze corrupted evidence');
});

test('movement options do not change the current explicit traits profile selection', t => {
  const f = fixture(t, 'traits');
  const args = { ...f.args, catalogSchemaVersion: 'persona-traits-v2' };
  const old = run.prepare(args), added = run.prepare({ ...args, runId: 'same-personas', ...directional });
  assert.deepEqual(run.readManifest(added.runDirectory).profiles, run.readManifest(old.runDirectory).profiles);
});

test('a new opted-in v1 trait run reports its contract without treating it as a stored historical artifact', t => {
  const f = fixture(t, 'traits'), prepared = run.prepare({ ...f.args, ...marker });
  const measured = run.measure({ runDirectory: prepared.runDirectory });
  assert.equal(read(measured.measurementsPath).movementValidationVersion, '1');
  for (let pass = 0; pass < 2; pass++) {
    const reported = run.report({ runDirectory: prepared.runDirectory });
    assert.equal(reported.historicalArtifactPreserved, undefined);
    const report = read(reported.reportPath);
    assert.equal(report.movementValidationVersion, '1');
    assert.equal(report.movementOpportunities.descriptiveOnly, true);
    assert.deepEqual(report.movementOpportunities.perTrace, []);
    assert.match(fs.readFileSync(reported.markdownPath, 'utf8'), /명시적 이동 검증 계약/);
    assert.match(fs.readFileSync(reported.markdownPath, 'utf8'), /continuous-route-v1/);
  }
});

test('a marked v1 trait run loads real compiled evidence and keeps its new route statistics supplementary', async t => {
  const f = fixture(t, 'traits'), prepared = run.prepare({ ...f.args, ...directional });
  const service = require('../server.cjs').createService({ bridge: {
    start() { throw new Error('Contract test cannot contact the app'); }, close() {},
  } });
  t.after(() => service.close());
  t.mock.method(global, 'fetch', () => { throw new Error('Contract test cannot contact a model'); });
  const slot = prepared.slots.find(row => row.personaId === 'neutral-adult-control' && row.condition === 'low');
  const request = await service.invokeTool('prepare_whole_trace', slot.prepareWholeTrace);
  const requestId = request.requestId;
  await service.invokeTool('begin_whole_trace_authoring', { requestId });
  // Explicit contract fixtures; no AI actor or behavioral sampling is involved.
  for (const finishing of [false, true]) {
    const appended = await service.invokeTool('append_whole_trace_decision', { requestId, decision: {
      choiceRef: finishing ? { choiceId: 'control/giveUp' } : { choiceId: 'moveDirection/north', durationMs: 300 },
      delayMs: 731, reason: finishing ? '이번 장보기를 마친다' : '통로에서 북쪽으로 이동한다',
      basis: { intent: finishing ? 'finish' : 'explore', goalId: null, memoryUses: [] },
      actorState: { activity: finishing ? 'finish' : 'orient', task: finishing ? '장보기 끝내기' : '통로 이동',
        heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' },
    } });
    assert.equal(appended.accepted, true, JSON.stringify(appended));
  }
  const finished = await service.invokeTool('finish_whole_trace_authoring', { requestId });
  const submitted = await service.invokeTool('submit_whole_trace', { requestId, candidate: finished.candidate });
  assert.equal(submitted.status, 'complete', JSON.stringify(submitted));
  const loaded = run.load(run.readManifest(prepared.runDirectory));
  assert.equal(loaded.samples.length, 1);
  assert.equal(loaded.samples[0].metrics.routeRelianceRate, undefined, 'the original v1 metrics remain unchanged');
  const route = loaded.samples[0].movementOpportunities.metrics.routeRelianceRate;
  assert.equal(route.routeOpportunityVersion, 'continuous-route-v1');
  assert.equal(route.directionalDiagnostics.decisionCount, 1);
  const measured = run.measure({ runDirectory: prepared.runDirectory });
  const measurement = read(measured.measurementsPath);
  assert.equal(measurement.completed, 1);
  assert.deepEqual(measurement.perTrace[0].movementOpportunities.metrics.routeRelianceRate, route);
  assert.ok(run.readManifest(prepared.runDirectory).slots.find(row => row.tracePath === slot.tracePath).evidenceHashes);
  const report = read(run.report({ runDirectory: prepared.runDirectory }).reportPath);
  assert.equal(report.movementOpportunities.perTrace[0].metrics.routeRelianceRate.directionalDiagnostics.decisionCount, 1);
});
