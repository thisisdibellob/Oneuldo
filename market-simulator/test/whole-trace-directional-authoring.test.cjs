'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { DEFAULT_REPLAY_PRESENTATION } = require('../../frontend/src/game/marketReplayPerception.ts');
const { resolveMarketEnvironmentMovement } = require('../../frontend/src/game/marketMovement.ts');
const { MARKET_DIRECTIONAL_MOVE_SPEED } = require('../../frontend/src/game/marketDirectionalInput.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate, validateWholeTracePrefix } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { wholeTraceContinuousFrame } = require('../src/wholeTrace/wholeTraceMovement.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { startHost, closeHost, hostStatus, callHost } = require('../whole-trace-host.cjs');

// Read the real motor and its UI-independent port helpers without widening the
// production simulator loader's permitted roots.
function loadReplayMotor() {
  const previous = require.extensions['.ts'];
  const allowed = ['motor.ts', 'ports.ts'].map(file => path.resolve(__dirname, '../../frontend/src/replay', file));
  require.extensions['.ts'] = (module, filename) => {
    if (!allowed.includes(filename)) return previous(module, filename);
    const ts = require('../../frontend/node_modules/typescript');
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    module._compile(outputText, filename);
  };
  try { return require('../../frontend/src/replay/motor.ts'); }
  finally { require.extensions['.ts'] = previous; }
}
const { moveDirection, walkToAnchorFixed, createMotionReport } = loadReplayMotor();

// These are authored contract fixtures, not AI samples or previous pilot edits.
function fixture({ seed = 'direction-authoring-v2', spawn, movementVersion = 'directional-v2' } = {}) {
  const config = { seed: 'direction-authoring-world', stockPerProduct: 5, environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  if (spawn) environment.spawn = { ...spawn };
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed,
    timingProfile: 'original', maxActions: 100, maxRepairs: 0, llm: { model: 'gpt-6-luna', maxCalls: 1 },
    ...(movementVersion ? { movementVersion } : {}) };
  return { settings, bundle: buildWholeTraceBundle(settings, 'direction-authoring-v2-request') };
}
function draft(choiceId, durationMs) {
  const terminal = choiceId === 'control/giveUp';
  return { choiceRef: { choiceId, ...(durationMs === undefined ? {} : { durationMs }) },
    delayMs: 731, reason: terminal ? '이번 장보기를 마친다' : '현재 통로에서 선택한 조작을 수행한다',
    basis: { intent: terminal ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: terminal ? 'finish' : 'orient', task: terminal ? '장보기 끝내기' : '매장 통로 이동',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } };
}
const candidate = (bundle, decisions) => ({ candidateVersion: '7', requestId: bundle.requestId, decisions });
const frameFields = source => ({ location: source.location, navigationStateId: source.navigationStateId });
function assertNoPrivateGeometry(value) {
  if (Array.isArray(value)) { for (const item of value) assertNoPrivateGeometry(item); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!['x', 'y', 'dx', 'dy', 'position', 'playerPosition', 'point', 'actualDelta', 'movedDistancePx',
      'environment', 'worldReference', 'stationDetails', 'cashierAvailability'].includes(key), `private field ${key}`);
    assertNoPrivateGeometry(item);
  }
}
function assertOpaqueSource(source) {
  assert.match(source.location, /^P[a-f0-9]{64}$/);
  assert.match(source.navigationStateId, /^nav-v2-[a-f0-9]{64}$/);
  assertNoPrivateGeometry(source);
}

async function replayStep(step, snapshot, position) {
  let driver, current = { ...position }, settled = false, failure;
  const report = createMotionReport(), presentation = snapshot.presentation ?? DEFAULT_REPLAY_PRESENTATION;
  const port = {
    read: () => ({ position: { ...current }, environment: snapshot.environment, cashiers: snapshot.cashierAvailability, locked: false, presentation }),
    drive: callback => { driver = callback; }, stop: () => { driver = undefined; },
  };
  const abort = new AbortController();
  const replay = step.type === 'moveDirection'
    ? moveDirection(port, step.direction, step.durationMs, presentation, step.movement, abort.signal, report, step.timeoutMs)
    : walkToAnchorFixed(port, step.target.anchorId, presentation, step.movement, abort.signal, report, step.timeoutMs);
  void replay.then(() => { settled = true; }, error => { settled = true; failure = error; });
  const frameTimes = [8, 33, 16, 47];
  for (let i = 0; i < 10000 && !settled; i++) {
    await Promise.resolve();
    if (!driver) continue;
    const input = driver(i * 47, frameTimes[i % frameTimes.length] / 1000);
    for (const slice of input.directionalSlices ?? []) current = resolveMarketEnvironmentMovement(snapshot.environment, current, {
      x: slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
      y: slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
    }, snapshot.cashierAvailability).position;
  }
  if (!settled) abort.abort('test motor did not settle');
  assert.equal(settled, true); assert.equal(failure, undefined); await replay;
  assert.equal(report.inputViolations, 0); assert.equal(report.displacementViolations, 0);
  return current;
}

test('v2 authoring refreshes exact source and current visible controls after a directional append without exposing geometry', async () => {
  const { settings, bundle } = fixture();
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const initial = await cursor.menu();
  assertOpaqueSource(initial.expectedSource);
  assert.equal(initial.currentObservation.kind, 'validated-prefix-observation-v2');
  assertNoPrivateGeometry(initial);
  const supplied = draft('moveDirection/north', 1000), original = structuredClone(supplied);
  const result = await cursor.append(supplied);
  assert.equal(result.accepted, true);
  assert.deepEqual(supplied, original);
  assert.deepEqual(result.decision.choiceRef.source, initial.expectedSource);
  assertOpaqueSource(result.menu.expectedSource);
  assert.notEqual(result.menu.expectedSource.location, initial.expectedSource.location);
  assert.notEqual(result.menu.expectedSource.navigationStateId, initial.expectedSource.navigationStateId);
  assert.deepEqual(result.menu.movementResult, { actualDirection: 'north', progress: 'full', blocked: false });
  assert.equal(result.menu.currentObservation.acceptedDecisionCount, 1);
  assert.equal(result.menu.currentObservation.observation.result.movement, undefined);
  assertNoPrivateGeometry(result);
  const prefix = await validateWholeTracePrefix(settings, bundle, candidate(bundle, [result.decision]));
  assert.deepEqual(result.menu.expectedSource, prefix.choiceFrame.source);
  assert.deepEqual(result.menu.choiceIds, prefix.choiceFrame.availableChoices.map(entry => entry.choiceId));
  const observation = result.menu.currentObservation.observation;
  for (const key of ['anchors', 'visibleStations', 'products', 'readObjectives']) assert.deepEqual(observation[key], prefix.before[key], key);
  assert.deepEqual(await cursor.menu(), result.menu, 're-reading a menu does not execute another movement');
});

test('rejected drafts leave v2 source and observations untouched and do not consume movement randomness', async () => {
  const { settings, bundle } = fixture();
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const clean = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const before = await cursor.menu();
  const invalid = draft('moveDirection/north', 99);
  const rejected = await cursor.append(invalid);
  assert.equal(rejected.accepted, false); assert.equal(rejected.canRetry, true);
  assert.deepEqual(await cursor.menu(), before);
  assert.equal(rejected.menu.decisionCount, 0);
  assertNoPrivateGeometry(rejected);
  const moved = await cursor.append(draft('moveDirection/north', 1007));
  const expected = await clean.append(draft('moveDirection/north', 1007));
  assert.equal(moved.accepted, true); assert.equal(expected.accepted, true);
  assert.deepEqual(moved.decision, expected.decision);
  assert.deepEqual(moved.menu, expected.menu);
  assert.deepEqual(cursor.metrics().decisions.map(row => [row.attempts, row.rewriteCount, row.accepted]), [[2, 1, true]]);
});

test('a pending v2 menu preview retains one prefix snapshot when an append commits concurrently', async t => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const initial = await cursor.menu();
  const compiler = require('../src/wholeTrace/wholeTraceCompiler.ts');
  const executePrefix = compiler.validateWholeTracePrefix;
  let releasePreview, markPreviewStarted;
  const previewGate = new Promise(resolve => { releasePreview = resolve; });
  const previewStarted = new Promise(resolve => { markPreviewStarted = resolve; });
  t.mock.method(compiler, 'validateWholeTracePrefix', async (...args) => {
    if (args[3]?.nextDecision) {
      markPreviewStarted();
      await previewGate;
    }
    return executePrefix(...args);
  });
  const pending = cursor.menu({ actorState: { activity: 'orient' }, delayMs: 1400 });
  await previewStarted;
  let appended;
  try { appended = await cursor.append(draft('moveDirection/north', 1007)); }
  finally { releasePreview(); }
  const preview = await pending;
  assert.equal(appended.accepted, true);
  assert.equal(appended.menu.decisionCount, 1);
  assert.equal(appended.menu.currentObservation.acceptedDecisionCount, 1);
  assert.equal(preview.decisionCount, 0);
  assert.equal(preview.currentObservation.acceptedDecisionCount, 0);
  assert.deepEqual(preview.expectedSource, initial.expectedSource);
  assert.deepEqual(preview.choiceIds, initial.choiceIds);
  assert.deepEqual(preview.currentObservation.observation, initial.currentObservation.observation);
  assert.notEqual(preview.expectedSource.location, appended.menu.expectedSource.location);
  assert.deepEqual(await cursor.menu(), appended.menu, 'completing the old preview never rolls back the accepted append');
});

test('v2 prefix source bindings reject stale locations, tampered navigation and stale accepted counts', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const initial = await cursor.menu();
  const moved = await cursor.append(draft('moveDirection/north', 1000));
  assert.equal(moved.accepted, true);
  const value = candidate(bundle, [moved.decision]);
  const current = moved.menu.expectedSource;
  const valid = await validateWholeTracePrefix(settings, bundle, value, { expectedSource: { acceptedActions: 1, source: current } });
  assert.deepEqual(valid.choiceFrame.source, current);
  for (const expectedSource of [
    { acceptedActions: 1, source: initial.expectedSource },
    { acceptedActions: 0, source: current },
    { acceptedActions: 1, source: { ...current, location: `P${'0'.repeat(64)}` } },
    { acceptedActions: 1, source: { ...current, navigationStateId: `nav-v2-${'0'.repeat(64)}` } },
  ]) await assert.rejects(validateWholeTracePrefix(settings, bundle, value, { expectedSource }),
    error => error.validation?.code === 'CHOICE_SOURCE_MISMATCH');
  const stop = { ...draft('control/giveUp'), choiceRef: { ...draft('control/giveUp').choiceRef, source: initial.expectedSource } };
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(bundle, [moved.decision, stop])),
    error => error.validation?.code === 'CHOICE_SOURCE_MISMATCH');
  assert.deepEqual(await cursor.menu(), moved.menu);
});

test('v2 blocked and partial movement refresh menus without dropping any of the eight motor controls', async () => {
  // The east lobby wall begins at x=1050, and the player radius is 12.
  for (const [spawn, progress, actualDirection] of [[{ x: 1038, y: 1350 }, 'blocked', null], [{ x: 1000, y: 1350 }, 'partial', 'east']]) {
    const { settings, bundle } = fixture({ spawn });
    const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
    const before = await cursor.menu();
    const moved = await cursor.append(draft('moveDirection/east', 2000));
    assert.equal(moved.accepted, true);
    assert.deepEqual(moved.menu.movementResult, { actualDirection, progress, blocked: true });
    assert.equal(moved.menu.choiceIds.filter(id => id.startsWith('moveDirection/')).length, 8);
    assert.equal(moved.menu.currentObservation.acceptedDecisionCount, 1);
    assertNoPrivateGeometry(moved);
    if (progress === 'blocked') assert.deepEqual(moved.menu.expectedSource, before.expectedSource, 'a blocked input retains its exact continuous location');
    else assert.notEqual(moved.menu.expectedSource.location, before.expectedSource.location);
  }
});

test('v2 dynamic menus and failed appends never disclose unseen products or authorize hidden catalog targets', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const moved = await cursor.append(draft('moveDirection/north', 1000));
  assert.equal(moved.accepted, true);
  const before = await cursor.menu(), observation = before.currentObservation.observation;
  const hiddenStation = bundle.choiceCatalog.entries.find(entry => entry.action.type === 'interact'
    && !observation.visibleStations.some(station => station.id === entry.action.station));
  const hiddenProduct = bundle.choiceCatalog.entries.find(entry => entry.action.type === 'add');
  assert.ok(hiddenStation); assert.ok(hiddenProduct);
  const hidden = draft(hiddenStation.choiceId);
  const rejected = await cursor.append(hidden);
  assert.equal(rejected.accepted, false); assert.equal(rejected.canRetry, true);
  assert.deepEqual(await cursor.menu(), before);
  assertNoPrivateGeometry(rejected);
  assert.deepEqual(observation.products, []);
  assert.equal(before.choiceIds.includes(hiddenProduct.choiceId), false);
  const unknown = draft('moveDirection/east', 1000);
  unknown.basis.cueRefs = [`product:${hiddenProduct.action.productId}`];
  const unknownRejected = await cursor.append(unknown);
  assert.equal(unknownRejected.accepted, false); assert.equal(unknownRejected.canRetry, true);
  assert.equal(unknownRejected.code, 'KNOWLEDGE_BASIS');
  assert.deepEqual(await cursor.menu(), before);
  assertNoPrivateGeometry(unknownRejected);
});

test('v2 direction, walking shortcut, direction predictions equal replay motor positions across seeds', async () => {
  for (const seed of ['continuous-seed-a', 'continuous-seed-b', 'continuous-seed-c']) {
    const { settings, bundle } = fixture({ seed }), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
    const north = await cursor.append(draft('moveDirection/north', 1007));
    assert.equal(north.accepted, true);
    const shortcut = north.menu.choiceIds.find(choiceId => choiceId.startsWith('walk/'));
    assert.ok(shortcut);
    const walk = await cursor.append(draft(shortcut));
    assert.equal(walk.accepted, true);
    const east = await cursor.append(draft('moveDirection/east', 1217));
    assert.equal(east.accepted, true);
    const stop = await cursor.append(draft('control/giveUp'));
    assert.equal(stop.accepted, true);
    const checkpoints = [];
    const compiled = await compileWholeTraceCandidate(settings, bundle, cursor.finish(), 1, checkpoint => checkpoints.push(checkpoint));
    assert.equal(checkpoints.filter(checkpoint => checkpoint.kind === 'decision').length, 4);
    assertNoPrivateGeometry(checkpoints);
    assertNoPrivateGeometry(compiled.knowledgeAudit);
    assert.deepEqual(validateTrace(compiled.trace, settings.snapshot), { valid: true, errors: [] });
    const steps = compiled.trace.steps.filter(step => step.type === 'moveDirection' || step.type === 'walkToAnchor');
    assert.deepEqual(steps.map(step => step.type), ['moveDirection', 'walkToAnchor', 'moveDirection']);
    const sources = [north, walk, east].map(result => result.menu.expectedSource);
    const guard = new TraceGuard(settings.snapshot, bundle.persona.id, bundle.persona.version, 'continuous-test', true, true, false, true, false, false, false, true);
    let position = { ...settings.snapshot.environment.spawn };
    for (let index = 0; index < steps.length; index++) {
      position = await replayStep(steps[index], settings.snapshot, position);
      guard.execute(steps[index]);
      assert.deepEqual(position, guard.observe().playerPosition, `${seed} step ${index}: real motor and compiler share the exact continuous endpoint`);
      assert.deepEqual(wholeTraceContinuousFrame(bundle, position, guard.observe().cashierAvailability), frameFields(sources[index]), `${seed} step ${index}: predicted source identifies the actual position`);
      assertOpaqueSource(sources[index]);
    }
  }
});

test('v2 movement authoring travels through the standalone host and CLI with one prepared context', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'direction-authoring-v2-cli-'));
  const hostDirectory = path.join(directory, 'host');
  t.after(async () => {
    try { await closeHost(hostDirectory); } catch { /* Startup may have failed. */ }
    for (let i = 0; i < 200; i++) {
      try { if ((await hostStatus(hostDirectory)).endedAt) break; } catch { break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await startHost(hostDirectory);
  const { settings } = fixture();
  const prepared = await callHost(hostDirectory, { operationId: 'prepare', tool: 'prepare_whole_trace', arguments: {
    personaId: settings.personaId, seed: settings.seed, snapshot: settings.snapshot, movementVersion: 'directional-v2',
    outputPath: path.join(directory, 'trace.json'), maxRepairs: 0,
  } });
  const contextFilePath = path.join(directory, 'context.json');
  fs.writeFileSync(contextFilePath, JSON.stringify({ hostDirectory, requestId: prepared.requestId, inputHash: prepared.bundle.inputHash }));
  const invoke = (operationId, tool, arguments_ = {}) => {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../cli.cjs'), 'author-whole', '-'], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024,
      input: JSON.stringify({ contextFilePath, operationId, tool, arguments: arguments_ }),
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const begin = invoke('begin', 'begin-whole-authoring');
  assert.equal(begin.menu.currentObservation.kind, 'validated-prefix-observation-v2');
  const requested = draft('moveDirection/north', 1007);
  const moved = invoke('move', 'append-whole-decision', { decision: requested });
  assert.equal(moved.accepted, true);
  assertOpaqueSource(moved.menu.expectedSource);
  assertNoPrivateGeometry(moved.menu);
  assert.deepEqual(invoke('move', 'append-whole-decision', { decision: requested }), moved, 'transport retry is idempotent');
  assert.equal(invoke('menu', 'whole-authoring-menu').menu.currentObservation.acceptedDecisionCount, 1);
  assert.equal(invoke('quit', 'append-whole-decision', { decision: draft('control/giveUp') }).accepted, true);
  const finished = invoke('finish', 'finish-whole-authoring');
  const submitted = invoke('submit', 'submit-whole', { candidate: finished.candidate });
  assert.equal(submitted.status, 'complete');
  assert.deepEqual(submitted.validation, { valid: true, errors: [] });
  const saved = JSON.parse(fs.readFileSync(submitted.outputPath, 'utf8'));
  assert.equal(saved.generation.wholeTraceMovementVersion, 'directional-v2');
  assert.deepEqual(saved.steps.filter(step => step.type === 'moveDirection').map(step => [step.direction, step.durationMs]), [['north', 1007]]);
});
