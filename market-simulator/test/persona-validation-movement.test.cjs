'use strict';
require('../runtime.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createService } = require('../server.cjs');
const { buildSnapshots } = require('../scripts/build-validation-snapshots.cjs');
const { canonicalMarketReplayJson, marketReplayTraceId, validateMarketReplayTrace } = require('../../frontend/src/game/marketReplayTrace.ts');
const { REPLAY_ARRIVAL_MARGIN } = require('../../frontend/src/game/marketReplayPerception.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const { wholeTraceContinuousFrame } = require('../src/wholeTraceMovement.ts');
const { getWholeTracePersona } = require('../src/personas.ts');
const { movementOptions, assertMovementEvidence, movementMarkdown } = require('../src/personaValidationMovement.cjs');

// Hand-authored contract fixtures only: these never invoke an AI actor or use
// pilot directories, and must not be treated as persona behavior evidence.
const CONTROL = 'neutral-adult-control';
const IDS = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', CONTROL];
const OPTIONS = { movementValidationVersion: '1', movementVersion: 'directional-v2',
  movementFeedbackVersion: 'recent-movement-v1' };
const ANCHOR_VERSIONS = ['recent-movement-anchor-v1', 'recent-movement-anchor-capacity-v1'];
const ANCHOR_OPTIONS = { movementValidationVersion: '1', movementFeedbackVersion: ANCHOR_VERSIONS[0] };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-movement-contract-'));
  const service = createService({ bridge: { start() { throw new Error('Contract fixture must not contact the app'); }, close() {} } });
  t.mock.method(global, 'fetch', () => { throw new Error('Contract fixture must not contact a model/provider'); });
  t.after(async () => { await service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const snapshotFilePaths = {};
  for (const [condition, snapshot] of Object.entries(buildSnapshots())) {
    snapshotFilePaths[condition] = path.join(directory, `${condition}.snapshot.json`);
    write(snapshotFilePaths[condition], snapshot);
  }
  const args = { runId: 'contract-run', outputDirectory: directory, snapshotFilePaths,
    seeds: ['contract-seed'], personaIds: IDS, validationMode: 'legacy' };
  return { directory, service, args,
    invoke: (tool, args) => service.invokeTool(tool, args),
    prepare: extra => service.invokeTool('prepare_persona_validation', { ...args, ...extra }) };
}
function draft(choiceId, durationMs) {
  const finish = choiceId === 'control/giveUp';
  return { choiceRef: { choiceId, ...(durationMs === undefined ? {} : { durationMs }) }, delayMs: 731,
    reason: finish ? '이번 장보기를 마친다' : '눈앞의 통로에서 북쪽으로 이동한다',
    basis: { intent: finish ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: finish ? 'finish' : 'orient', task: finish ? '장보기 끝내기' : '통로 이동',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } };
}
function assertMarkers(value, expected = OPTIONS) {
  for (const key of Object.keys(OPTIONS)) {
    if (Object.hasOwn(expected, key)) assert.equal(value[key], expected[key], key);
    else assert.equal(Object.hasOwn(value, key), false, key);
  }
}
function assertNoCoordinates(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!['x', 'y', 'dx', 'dy', 'playerPosition', 'position', 'fromPosition', 'toPosition'].includes(key), key);
    assertNoCoordinates(item);
  }
}
async function author(f, slot, { move = true, walk = false } = {}) {
  const prepared = await f.invoke('prepare_whole_trace', slot.prepareWholeTrace);
  const requestId = prepared.requestId;
  const begun = await f.invoke('begin_whole_trace_authoring', { requestId });
  let moved;
  if (move) {
    moved = await f.invoke('append_whole_trace_decision', { requestId, decision: draft('moveDirection/north', 1007) });
    assert.equal(moved.accepted, true, JSON.stringify(moved));
    const menu = await f.invoke('whole_trace_authoring_menu', { requestId });
    assert.deepEqual(menu.menu, moved.menu);
    assert.equal(menu.menu.currentObservation.acceptedDecisionCount, 1);
    assert.notEqual(menu.menu.expectedSource.location, begun.menu.expectedSource.location);
    assertNoCoordinates(menu.menu);
  }
  if (walk) {
    const choiceId = begun.menu.choiceIds.find(id => id.startsWith('walk/'));
    assert.ok(choiceId, 'the comparison fixture must execute a real visible anchor');
    const moved = await f.invoke('append_whole_trace_decision', { requestId, decision: draft(choiceId) });
    assert.equal(moved.accepted, true, JSON.stringify(moved));
  }
  const stopped = await f.invoke('append_whole_trace_decision', { requestId, decision: draft('control/giveUp') });
  assert.equal(stopped.accepted, true, JSON.stringify(stopped));
  const finished = await f.invoke('finish_whole_trace_authoring', { requestId });
  const result = await f.invoke('submit_whole_trace', { requestId, candidate: finished.candidate });
  assert.equal(result.status, 'complete', JSON.stringify(result));
  assert.deepEqual(result.validation, { valid: true, errors: [] });
  return { prepared, begun, moved, finished, result, trace: read(slot.tracePath),
    audit: read(`${slot.tracePath}.knowledge-audit.json`) };
}

for (const movementFeedbackVersion of ANCHOR_VERSIONS) test(`validation feedback checks ${movementFeedbackVersion} against directional and observation contracts`, () => {
  const options = { ...ANCHOR_OPTIONS, movementFeedbackVersion };
  assert.deepEqual(movementOptions(OPTIONS), OPTIONS);
  assert.deepEqual(movementOptions(options), options);
  for (const change of [
    { movementFeedbackVersion: 'recent-movement-v1' },
    { movementVersion: 'directional-v2' },
    { movementVersion: 'directional-v1' },
    { movementFeedbackVersion: 'recent-movement-v2' },
    { observationVersion: 'anchor-observation-v3' },
    { observationVersion: null },
    { trialBinding: {} },
  ]) assert.throws(() => movementOptions({ ...options, ...change }), /movement|anchor-visible-structures/i);
  const observationVersion = 'anchor-visible-structures-v1';
  const persona = getWholeTracePersona(IDS[0]), manifest = { ...options, version: 3,
    personaIds: [persona.id], profiles: { [persona.id]: { persona } } };
  const evidence = { trace: { personaId: persona.id, personaVersion: persona.version, generation: { wholeTraceMovementValidationVersion: '1',
    wholeTraceMovementFeedbackVersion: movementFeedbackVersion, wholeTraceObservationVersion: observationVersion } },
    bundle: { ...options, observationVersion, persona: { id: persona.id, version: persona.version,
      behavior: { behavioralContext: { spatialMemoryCapacity: persona.attention.spatialMemoryCapacity } } } }, audit: { ...options, observationVersion,
      navigationEvidence: { version: 'continuous-route-v1' }, decisions: [] } };
  assert.doesNotThrow(() => assertMovementEvidence(manifest, evidence));
  for (const [part, key] of [['trace', 'wholeTraceObservationVersion'], ['bundle', 'observationVersion'], ['audit', 'observationVersion']]) {
    const changed = structuredClone(evidence);
    delete (part === 'trace' ? changed.trace.generation : changed[part])[key];
    assert.throws(() => assertMovementEvidence(manifest, changed), /anchor-visible-structures-v1/);
  }
  assert.ok(movementMarkdown(options).join('\n').includes(`movementFeedbackVersion=${movementFeedbackVersion}`));
});

for (const validationMode of ['legacy', 'traits']) for (const movementFeedbackVersion of ANCHOR_VERSIONS) test(`${validationMode} ${movementFeedbackVersion} binds manifest and readiness generation options`, async t => {
  const options = { ...ANCHOR_OPTIONS, movementFeedbackVersion };
  const f = fixture(t), selection = validationMode === 'traits' ? { validationMode, personaIds: [IDS[0]] } : { validationMode };
  const run = await f.prepare({ ...selection, ...options });
  assertMarkers(read(run.manifestPath), options);
  for (const slot of run.slots) { assertMarkers(slot, options); assertMarkers(slot.prepareWholeTrace, options); }
  const readiness = await f.invoke('check_persona_validation_readiness', { runDirectory: run.runDirectory });
  assert.deepEqual(readiness.missingSlots.map(slot => slot.prepareWholeTrace), run.slots.map(slot => slot.prepareWholeTrace));
  const authored = await author(f, run.slots[0], { move: false, walk: true });
  assertMarkers(authored.prepared.bundle, options);
  assert.equal(authored.prepared.bundle.observationVersion, 'anchor-visible-structures-v1');
  assert.deepEqual(authored.begun.menu.movementNotes, []);
  assert.equal(authored.begun.menu.availableChoices.some(choice => choice.recentVisit), false);
  assert.equal(authored.trace.generation.wholeTraceMovementFeedbackVersion, movementFeedbackVersion);
  assertMarkers(authored.audit, options);
  const complete = await f.invoke('check_persona_validation_readiness', { runDirectory: run.runDirectory });
  assert.equal(complete.complete, 1);
  assert.deepEqual(complete.technicalFailures, []);
  await f.invoke('measure_persona_validation', { runDirectory: run.runDirectory });
  const report = await f.invoke('persona_validation_report', { runDirectory: run.runDirectory });
  assert.ok(fs.readFileSync(report.markdownPath, 'utf8').includes(`movementFeedbackVersion=${movementFeedbackVersion}`));
});

for (const validationMode of ['legacy', 'traits']) test(`${validationMode} capacity evidence rejects edited bundle memory before recording evidence hashes`, async t => {
  const f = fixture(t), selection = validationMode === 'traits' ? { validationMode, personaIds: [IDS[0]] } : { validationMode };
  const options = { ...ANCHOR_OPTIONS, movementFeedbackVersion: ANCHOR_VERSIONS[1] };
  const run = await f.prepare({ ...selection, ...options }), slot = run.slots[0];
  await author(f, slot, { move: false, walk: true });
  assert.equal(read(run.manifestPath).slots[0].evidenceHashes, undefined, 'exercise evidence before a refresh freezes its hashes');
  const bundlePath = `${slot.tracePath}.whole-trace/bundle.json`, original = fs.readFileSync(bundlePath);
  for (const capacity of [undefined, 4, 95, '96']) {
    const bundle = JSON.parse(original);
    if (capacity === undefined) delete bundle.persona.behavior.behavioralContext.spatialMemoryCapacity;
    else bundle.persona.behavior.behavioralContext.spatialMemoryCapacity = capacity;
    write(bundlePath, bundle);
    const readiness = await f.invoke('check_persona_validation_readiness', { runDirectory: run.runDirectory });
    assert.equal(readiness.complete, 0);
    assert.ok(readiness.technicalFailures.some(row => /canonical validation persona spatialMemoryCapacity/.test(row.reason)));
    await assert.rejects(f.prepare({ ...selection, ...options }), /canonical validation persona spatialMemoryCapacity/);
    assert.equal(read(run.manifestPath).slots[0].evidenceHashes, undefined);
  }
  fs.writeFileSync(bundlePath, original);
  const restored = await f.invoke('check_persona_validation_readiness', { runDirectory: run.runDirectory });
  assert.equal(restored.complete, 1);
  assert.deepEqual(restored.technicalFailures, []);
});

test('bound neutral directional authoring reaches submission and measurement without a provider or app', async t => {
  const f = fixture(t), run = await f.prepare(OPTIONS), manifest = read(run.manifestPath);
  assertMarkers(manifest);
  assert.equal(run.required, 8);
  for (const slot of run.slots) { assertMarkers(slot); assertMarkers(slot.prepareWholeTrace); }
  const initialReadiness = await f.invoke('check_persona_validation_readiness', { runDirectory: run.runDirectory });
  assert.deepEqual(initialReadiness.missingSlots.map(slot => slot.prepareWholeTrace), run.slots.map(slot => slot.prepareWholeTrace));
  const slot = run.slots.find(slot => slot.personaId === CONTROL && slot.condition === 'low');
  const authored = await author(f, slot);
  assertMarkers(authored.prepared.bundle);
  assert.deepEqual(authored.prepared.bundle.supportedCandidateVersions, ['7']);
  assertMarkers(authored.audit);
  assert.equal(authored.trace.personaId, CONTROL);
  assert.equal(authored.trace.generation.wholeTraceMovementValidationVersion, '1');
  assert.equal(authored.trace.generation.wholeTraceMovementVersion, 'directional-v2');
  assert.equal(authored.trace.generation.wholeTraceMovementFeedbackVersion, 'recent-movement-v1');
  assert.equal(authored.trace.generation.learnerIdentity, undefined);
  assert.deepEqual(authored.trace.steps.filter(step => step.type === 'moveDirection').map(step => [step.direction, step.durationMs]), [['north', 1007]]);
  const snapshot = read(f.args.snapshotFilePaths.low), savedTraceBytes = fs.readFileSync(slot.tracePath);
  assert.equal(validateMarketReplayTrace(authored.trace, snapshot).valid, true);
  for (const [name, mutate, expectedError] of [
    ['unknown validation', generation => { generation.wholeTraceMovementValidationVersion = '2'; }, /wholeTraceMovementValidationVersion/],
    ['unknown movement', generation => { generation.wholeTraceMovementVersion = 'directional-v3'; }, /wholeTraceMovementVersion/],
    ['v1 movement', generation => { generation.wholeTraceMovementVersion = 'directional-v1'; }, /Movement validation 1/],
    ['unknown feedback', generation => { generation.wholeTraceMovementFeedbackVersion = 'recent-movement-v2'; }, /wholeTraceMovementFeedbackVersion/],
    ['feedback without validation', generation => { delete generation.wholeTraceMovementValidationVersion; }, /feedback requires validation 1/],
    ['feedback without v2', generation => { delete generation.wholeTraceMovementVersion; }, /feedback requires validation 1/],
  ]) {
    const changed = structuredClone(authored.trace); mutate(changed.generation); changed.traceId = marketReplayTraceId(changed);
    const validation = validateMarketReplayTrace(changed, snapshot);
    assert.equal(validation.valid, false, name);
    assert.match(validation.errors.join('\n'), expectedError, name);
  }
  const earlierDirectionalContract = structuredClone(authored.trace);
  delete earlierDirectionalContract.generation.wholeTraceMovementValidationVersion;
  delete earlierDirectionalContract.generation.wholeTraceMovementFeedbackVersion;
  earlierDirectionalContract.traceId = marketReplayTraceId(earlierDirectionalContract);
  assert.equal(validateMarketReplayTrace(earlierDirectionalContract, snapshot).valid, true, 'the earlier unbound v2 trace contract remains valid');
  assert.deepEqual(fs.readFileSync(slot.tracePath), savedTraceBytes, 'validator copies never alter the saved trace');
  const evidence = authored.audit.decisions[0].navigationEvidence;
  assert.equal(evidence.version, 'continuous-route-v1');
  assert.match(evidence.fromPositionId, /^P[a-f0-9]{64}$/);
  assert.match(evidence.toPositionId, /^P[a-f0-9]{64}$/);
  assert.notEqual(evidence.fromPositionId, evidence.toPositionId);
  assert.ok(Array.isArray(evidence.allowedAnchors));
  assert.equal(evidence.movement.actionType, 'moveDirection');
  assert.equal(evidence.movement.accepted, true);
  assertNoCoordinates(evidence);
  assert.throws(() => getWholeTracePersona(CONTROL), /Unknown persona/, 'validation scope never escapes authoring');
  const readiness = await f.invoke('check_persona_validation_readiness', { runDirectory: run.runDirectory });
  assert.equal(readiness.complete, 1);
  assert.deepEqual(readiness.technicalFailures, []);
  const measured = await f.invoke('measure_persona_validation', { runDirectory: run.runDirectory });
  assert.equal(measured.completed, 1); assert.equal(measured.missing, 7);
  const measurements = read(measured.measurementsPath);
  assertMarkers(measurements);
  const movement = measurements.perTraceMetrics[0].movementOpportunities;
  assert.equal(movement.version, 'continuous-route-v1');
  assert.equal(movement.descriptiveOnly, true);
  const route = movement.metrics.routeRelianceRate;
  assert.equal(route.routeOpportunityVersion, 'continuous-route-v1');
  assert.equal(route.directionalDiagnostics.decisionCount, 1);
  assert.equal(route.denominator, 0);
  assert.equal(route.value, null);
  assert.equal(route.reason, 'directional-destination-not-offered');
  const report = await f.invoke('persona_validation_report', { runDirectory: run.runDirectory });
  assert.equal(report.completed, 1);
  const savedReport = read(report.reportPath);
  assertMarkers(savedReport);
  assert.equal(savedReport.movementOpportunities.version, 'continuous-route-v1');
  assert.equal(savedReport.movementOpportunities.descriptiveOnly, true);
  const reportRow = savedReport.movementOpportunities.perTrace[0];
  assert.equal(reportRow.personaId, CONTROL);
  assert.equal(reportRow.condition, 'low');
  assert.equal(reportRow.seed, slot.seed);
  assert.deepEqual(reportRow.metrics, movement.metrics);
  assert.deepEqual(reportRow.coverage, movement.coverage);
  const expectedKinds = new Set(require('../validation/persona-trait-validation-spec-v2.json').metrics.map(metric => metric.kind));
  for (const kind of expectedKinds) {
    assert.ok(Object.hasOwn(reportRow.metrics, kind), kind);
    assert.ok(Object.hasOwn(reportRow.coverage, kind), kind);
  }
  const markdown = fs.readFileSync(report.markdownPath, 'utf8');
  assert.match(markdown, /movementValidationVersion=1/);
  assert.match(markdown, /movementVersion=directional-v2/);
  assert.match(markdown, /movementFeedbackVersion=recent-movement-v1/);
  assert.match(markdown, /continuous-route-v1/);
  assert.match(markdown, /관찰 기회 합/);
  assert.match(markdown, /별도의 성향 판정이나 성공률이 아니다/);
});

test('opted anchor comparison keeps direction disabled while binding validation evidence', async t => {
  const f = fixture(t), options = { movementValidationVersion: '1' }, run = await f.prepare(options);
  const slot = run.slots.find(slot => slot.personaId === IDS[0] && slot.condition === 'low');
  assertMarkers(read(run.manifestPath), options);
  assertMarkers(slot.prepareWholeTrace, options);
  const result = await author(f, slot, { move: false, walk: true });
  assertMarkers(result.prepared.bundle, options);
  assert.deepEqual(result.prepared.bundle.supportedCandidateVersions, ['7']);
  assertMarkers(result.audit, options);
  assert.equal(result.begun.menu.choiceIds.some(id => id.startsWith('moveDirection/')), false);
  assert.equal(result.trace.generation.wholeTraceMovementValidationVersion, '1');
  assert.equal(Object.hasOwn(result.trace.generation, 'wholeTraceMovementVersion'), false);
  const evidence = result.audit.decisions[0].navigationEvidence;
  assert.equal(evidence.version, 'continuous-route-v1');
  assert.equal(evidence.movement.actionType, 'walkToAnchor');
  assert.equal(evidence.movement.accepted, true);
  assert.ok(evidence.movement.arrivedAnchorIds.includes(evidence.movement.targetAnchorId));
  const snapshot = read(f.args.snapshotFilePaths.low);
  for (const movementFeedbackVersion of ANCHOR_VERSIONS) {
    const marked = structuredClone(result.trace);
    marked.generation.wholeTraceMovementFeedbackVersion = movementFeedbackVersion;
    for (const bound of [true, false]) {
      if (!bound) delete marked.generation.wholeTraceMovementValidationVersion;
      marked.traceId = marketReplayTraceId(marked);
      assert.equal(validateMarketReplayTrace(marked, snapshot).valid, true, 'anchor feedback supports ordinary and validation traces');
    }
    for (const change of [
      { wholeTraceMovementVersion: 'directional-v2' },
      { wholeTraceObservationVersion: undefined },
      { wholeTraceObservationVersion: 'anchor-observation-v3' },
      { wholeTraceMovementFeedbackVersion: 'recent-movement-v1' },
    ]) {
      const invalid = structuredClone(marked);
      Object.assign(invalid.generation, change); invalid.traceId = marketReplayTraceId(invalid);
      const validation = validateMarketReplayTrace(invalid, snapshot);
      assert.equal(validation.valid, false);
      assert.match(validation.errors.join('\n'), /Movement validation feedback|Anchor movement feedback|wholeTraceObservationVersion/);
    }
  }
  const measured = await f.invoke('measure_persona_validation', { runDirectory: run.runDirectory });
  assert.equal(measured.completed, 1);
  assert.ok(read(measured.measurementsPath).perTraceMetrics[0].movementOpportunities);
});

test('mixed directional and offered-anchor actions preserve one continuous audit through measurement', async t => {
  const f = fixture(t), run = await f.prepare(OPTIONS);
  const slot = run.slots.find(slot => slot.personaId === IDS[1] && slot.condition === 'low');
  const prepared = await f.invoke('prepare_whole_trace', slot.prepareWholeTrace), requestId = prepared.requestId;
  const initial = await f.invoke('begin_whole_trace_authoring', { requestId });
  const results = [];
  const append = async decision => {
    const result = await f.invoke('append_whole_trace_decision', { requestId, decision });
    assert.equal(result.accepted, true, JSON.stringify(result)); results.push(result); return result;
  };
  const north = await append(draft('moveDirection/north', 1007));
  const shortcut = north.menu.availableChoices.find(choice => choice.choiceId.startsWith('walk/'));
  assert.ok(shortcut, 'choose a shortcut offered by the actual post-direction menu');
  await append(draft(shortcut.choiceId));
  await append(draft('moveDirection/east', 1217));
  await append(draft('control/giveUp'));
  const finished = await f.invoke('finish_whole_trace_authoring', { requestId });
  const submitted = await f.invoke('submit_whole_trace', { requestId, candidate: finished.candidate });
  assert.equal(submitted.status, 'complete', JSON.stringify(submitted));
  assert.deepEqual(submitted.validation, { valid: true, errors: [] });
  const trace = read(slot.tracePath), audit = read(`${slot.tracePath}.knowledge-audit.json`);
  const evidence = audit.decisions.map(decision => decision.navigationEvidence);
  assert.equal(evidence.length, 4);
  const frame = source => ({ location: source.location, navigationStateId: source.navigationStateId });
  for (let index = 0; index < evidence.length; index++) {
    const row = evidence[index];
    assert.deepEqual(row.from, frame(index ? results[index - 1].menu.expectedSource : initial.menu.expectedSource));
    if (results[index].menu.expectedSource) assert.deepEqual(row.to, frame(results[index].menu.expectedSource));
    else {
      assert.equal(index, 3, 'only the terminal giveUp closes the next-choice menu');
      assert.deepEqual(row.to, row.from);
    }
    assert.deepEqual(row.from, frame(audit.decisions[index].choiceResolution.source));
    assert.equal(row.fromPositionId, row.from.location);
    assert.equal(row.toPositionId, row.to.location);
    assert.match(row.fromPositionId, /^P[a-f0-9]{64}$/);
    assert.match(row.toPositionId, /^P[a-f0-9]{64}$/);
    if (index) assert.equal(row.fromPositionId, evidence[index - 1].toPositionId);
    if (row.movement) assert.equal(row.movement.outcome,
      { full: 'moved', partial: 'partially-blocked', blocked: 'blocked' }[results[index].menu.movementResult.progress]);
    assertNoCoordinates(row);
  }
  const walk = evidence[1], offered = walk.allowedAnchors.find(anchor => anchor.choiceId === shortcut.choiceId);
  assert.ok(offered);
  assert.equal(walk.movement.targetAnchorId, offered.anchorId);
  assert.ok(walk.movement.arrivedAnchorIds.includes(offered.anchorId));
  assert.deepEqual(evidence.map(row => row.movement?.actionType ?? null), ['moveDirection', 'walkToAnchor', 'moveDirection', null]);

  // Reuse the production v2 validator, without duplicating motor slices or a UI
  // harness, to check recorded identities and the shared 1px arrival tolerance.
  const snapshot = read(f.args.snapshotFilePaths.low);
  const guard = new TraceGuard(snapshot, trace.personaId, trace.personaVersion, trace.generation.model,
    true, true, false, true, false, false, false, true);
  const waypoint = prepared.bundle.worldReference.waypoints.find(point => point.anchorId === offered.anchorId);
  assert.ok(waypoint); assert.equal(REPLAY_ARRIVAL_MARGIN, 1);
  let decisionIndex = 0;
  for (const step of trace.steps) {
    const applied = guard.execute(step);
    if (!['moveDirection', 'walkToAnchor', 'giveUp'].includes(step.type)) continue;
    const row = evidence[decisionIndex++];
    assert.deepEqual(row.from, wholeTraceContinuousFrame(prepared.bundle, applied.before.playerPosition, applied.before.cashierAvailability));
    assert.deepEqual(row.to, wholeTraceContinuousFrame(prepared.bundle, applied.after.playerPosition, applied.after.cashierAvailability));
    if (step.type === 'walkToAnchor') {
      assert.equal(step.target.anchorId, offered.anchorId);
      assert.ok(Math.hypot(applied.after.playerPosition.x - waypoint.point.x,
        applied.after.playerPosition.y - waypoint.point.y) <= REPLAY_ARRIVAL_MARGIN);
    }
  }
  assert.equal(decisionIndex, 4);
  const measured = await f.invoke('measure_persona_validation', { runDirectory: run.runDirectory });
  assert.equal(measured.completed, 1);
  const route = read(measured.measurementsPath).perTraceMetrics[0].movementOpportunities.metrics.routeRelianceRate;
  assert.equal(route.routeOpportunityVersion, 'continuous-route-v1');
  assert.equal(route.missingObservationCount, 0);
  assert.deepEqual(route.missingEvidenceReasons, []);
  const directional = evidence.filter(row => row.movement?.actionType === 'moveDirection');
  assert.equal(route.directionalDiagnostics.decisionCount, 2);
  assert.equal(route.directionalDiagnostics.blockedCount, directional.filter(row => row.movement.outcome === 'blocked').length);
  assert.equal(route.directionalDiagnostics.partiallyBlockedCount, directional.filter(row => row.movement.outcome === 'partially-blocked').length);
  assert.equal(route.directionalDiagnostics.confirmedAnchorArrivalCount,
    directional.reduce((total, row) => total + row.movement.arrivedAnchorIds.length, 0));
  assert.deepEqual(route.directionalDiagnostics.excludedEvidence, trace.steps.filter(step => step.type === 'moveDirection').map(step => step.id));
});

test('bound movement options cannot be omitted, mixed or changed for neutral or ordinary slots', async t => {
  const f = fixture(t), run = await f.prepare(OPTIONS);
  const before = fs.readFileSync(run.manifestPath);
  for (const personaId of [CONTROL, IDS[0]]) {
    const slot = run.slots.find(row => row.personaId === personaId && row.condition === 'low');
    const cases = [
      { ...slot.prepareWholeTrace, movementValidationVersion: undefined },
      { ...slot.prepareWholeTrace, movementValidationVersion: '2' },
      { ...slot.prepareWholeTrace, movementVersion: undefined },
      { ...slot.prepareWholeTrace, movementVersion: 'directional-v1' },
      { ...slot.prepareWholeTrace, movementFeedbackVersion: undefined },
      { ...slot.prepareWholeTrace, movementFeedbackVersion: 'recent-movement-v2' },
    ];
    for (const args of cases) {
      await assert.rejects(f.invoke('prepare_whole_trace', args), /movement|version|binding|mixed/i);
      assert.equal(fs.existsSync(`${slot.tracePath}.whole-trace`), false);
      assert.deepEqual(fs.readFileSync(run.manifestPath), before);
    }
  }
  for (const changed of [{}, { movementValidationVersion: '1' }, { ...OPTIONS, movementFeedbackVersion: undefined }]) {
    await assert.rejects(f.prepare(changed), /movement|configuration|version/i);
    assert.deepEqual(fs.readFileSync(run.manifestPath), before);
  }
});

test('movement evidence marker corruption is rejected before measurement and cannot appear complete in readiness', async t => {
  const f = fixture(t), run = await f.prepare(OPTIONS);
  const slot = run.slots.find(slot => slot.personaId === CONTROL && slot.condition === 'low');
  await author(f, slot);
  const files = { trace: slot.tracePath, audit: `${slot.tracePath}.knowledge-audit.json`,
    bundle: path.join(`${slot.tracePath}.whole-trace`, 'bundle.json'), review: `${slot.tracePath}.persona-review.json` };
  const originals = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file)]));
  const manifestBefore = fs.readFileSync(run.manifestPath);
  // Keep linkage hashes valid after each edit: the new binding itself must be
  // checked, rather than relying only on a stale trace or review digest.
  function relink() {
    const trace = read(files.trace), audit = read(files.audit), review = read(files.review);
    trace.traceId = marketReplayTraceId(trace); audit.traceId = trace.traceId;
    review.traceId = trace.traceId; review.knowledgeAuditHash = digest(audit);
    write(files.trace, trace); write(files.audit, audit); write(files.review, review);
  }
  const changes = [
    ['bundle', null, 'movementValidationVersion'], ['bundle', null, 'movementVersion'],
    ['bundle', null, 'movementFeedbackVersion'], ['audit', null, 'movementValidationVersion'],
    ['audit', null, 'movementVersion'], ['audit', null, 'movementFeedbackVersion'],
    ['trace', 'generation', 'wholeTraceMovementValidationVersion'], ['trace', 'generation', 'wholeTraceMovementVersion'],
    ['trace', 'generation', 'wholeTraceMovementFeedbackVersion'],
  ].map(([fileKey, parent, marker]) => ({ fileKey, label: `${fileKey}.${marker}`,
    mutate: value => { delete (parent ? value[parent] : value)[marker]; } }));
  changes.push({ fileKey: 'audit', label: 'audit.navigationEvidence.version', mutate: value => { delete value.navigationEvidence.version; } },
    { fileKey: 'audit', label: 'audit.decisions[0].navigationEvidence.version', mutate: value => { delete value.decisions[0].navigationEvidence.version; } });
  for (const { fileKey, label, mutate } of changes) {
    const value = read(files[fileKey]); mutate(value); write(files[fileKey], value); relink();
    const readiness = await f.invoke('check_persona_validation_readiness', { runDirectory: run.runDirectory });
    assert.equal(readiness.complete, 0, label);
    assert.equal(readiness.technicalFailures.length, 1);
    await assert.rejects(f.invoke('measure_persona_validation', { runDirectory: run.runDirectory }), /movement|version|mixed/i);
    assert.equal(fs.existsSync(path.join(run.runDirectory, 'measurements.json')), false);
    assert.deepEqual(fs.readFileSync(run.manifestPath), manifestBefore);
    for (const [key, file] of Object.entries(files)) fs.writeFileSync(file, originals[key]);
  }
  const measured = await f.invoke('measure_persona_validation', { runDirectory: run.runDirectory });
  assert.equal(measured.completed, 1);
});

for (const validationMode of ['legacy', 'traits']) test(`${validationMode} opt-out preserves stored artifacts and rejects movement opt-in on resume`, async t => {
  const f = fixture(t), selection = validationMode === 'traits' ? { validationMode, personaIds: [IDS[0]] } : { validationMode };
  const run = await f.prepare(selection);
  assertMarkers(read(run.manifestPath), {});
  for (const slot of run.slots) { assertMarkers(slot, {}); assertMarkers(slot.prepareWholeTrace, {}); }
  const slot = run.slots[0], authored = await author(f, slot, { move: false });
  assertMarkers(authored.prepared.bundle, {});
  assert.deepEqual(authored.prepared.bundle.supportedCandidateVersions, ['7', '6', '5', '4', '3']);
  assertMarkers(authored.audit, {});
  assert.equal(Object.hasOwn(authored.trace.generation, 'wholeTraceMovementValidationVersion'), false);
  assert.equal(Object.hasOwn(authored.audit, 'navigationEvidence'), false);
  assert.ok(authored.audit.decisions.every(decision => !Object.hasOwn(decision, 'navigationEvidence')));
  const measured = await f.invoke('measure_persona_validation', { runDirectory: run.runDirectory });
  const report = await f.invoke('persona_validation_report', { runDirectory: run.runDirectory });
  assert.equal(Object.hasOwn(read(measured.measurementsPath), 'movementOpportunities'), false);
  const measuredRows = read(measured.measurementsPath)[validationMode === 'traits' ? 'perTrace' : 'perTraceMetrics'];
  assert.ok(measuredRows.every(row => !Object.hasOwn(row, 'movementOpportunities')));
  assert.equal(Object.hasOwn(read(report.reportPath), 'movementOpportunities'), false);
  const files = [run.manifestPath, measured.measurementsPath, report.reportPath, report.markdownPath,
    slot.tracePath, `${slot.tracePath}.snapshot.json`, `${slot.tracePath}.knowledge-audit.json`,
    `${slot.tracePath}.persona-review.json`, path.join(`${slot.tracePath}.whole-trace`, 'bundle.json')];
  const bytes = files.map(file => fs.readFileSync(file));
  await assert.rejects(f.prepare({ ...selection, ...OPTIONS }), /movement|configuration|version/i);
  await assert.rejects(f.invoke('prepare_whole_trace', { ...slot.prepareWholeTrace, ...OPTIONS }), /movement|version|binding/i);
  for (const movementFeedbackVersion of ANCHOR_VERSIONS)
    await assert.rejects(f.invoke('prepare_whole_trace', { ...slot.prepareWholeTrace,
      movementFeedbackVersion }), /movementFeedbackVersion is frozen/i);
  await f.invoke('check_persona_validation_readiness', { runDirectory: run.runDirectory });
  await f.invoke('measure_persona_validation', { runDirectory: run.runDirectory });
  await f.invoke('persona_validation_report', { runDirectory: run.runDirectory });
  files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), bytes[index], path.basename(file)));
});
