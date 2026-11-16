'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { createMarketReplaySnapshot, validateMarketReplayTrace, marketReplayTraceId,
  isMarketReplaySystemCompletionStep } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { WholeTraceSession } = require('../src/wholeTrace/wholeTraceSession.ts');
const { validateTrace } = require('../src/traceValidation.ts');

const VERSION = 'wayfinding-v1';
function fixture(extra = {}) {
  const config = { seed: 'wayfinding-finalization-store', objectives: [{ productId: 'milk', quantity: 1 }],
    stockPerProduct: 5, environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'checkout', environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'wayfinding-finalization',
    maxActions: 100, maxRepairs: 0, timingProfile: 'original',
    movementValidationVersion: '1', wayfindingVersion: VERSION, ...extra };
  return { settings, bundle: buildWholeTraceBundle(settings, 'wayfinding-finalization-request') };
}
function draft(choiceId, { delayMs = 800, wayfinding = true } = {}) {
  const ending = choiceId === 'control/giveUp' || choiceId === 'control/submit';
  return { choiceRef: { choiceId }, delayMs, reason: '현재 표시된 조작으로 종료와 저장 계약을 확인한다',
    basis: { intent: ending ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: ending ? 'finish' : 'orient', task: '현재 화면에서 선택한 조작을 수행한다',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null,
      orientation: 'unfamiliar', ...(wayfinding ? { thought: { plan: ending
        ? '지금까지 확인한 상태로 이번 장보기를 마친다' : '현재 위치에서 다음 조작을 확인한다' } } : {}) } };
}
async function append(cursor, decision) {
  const result = await cursor.append(decision);
  assert.equal(result.accepted, true, JSON.stringify(result.issues));
  return result;
}
async function compile(settings, bundle, cursor) {
  const candidate = cursor.finish();
  assert.equal(candidate.candidateVersion, '7');
  const result = await compileWholeTraceCandidate(settings, bundle, candidate);
  assert.equal(result.trace.generation.wholeTraceWayfindingVersion, VERSION);
  assert.deepEqual(validateMarketReplayTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
  return result;
}
async function reachGiveUpTime(appendDecision) {
  // Test-only virtual delays reach the real profile's permission threshold without
  // changing that profile or the production stopping rule. No wall-clock sleep.
  await appendDecision(draft('control/pause', { delayMs: 120000 }));
  return appendDecision(draft('control/pause', { delayMs: 120000 }));
}

test('wayfinding candidate 7 can finish an allowed giveUp and pass the app and offline validators', async () => {
  const { settings, bundle } = fixture();
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  assert.equal((await cursor.menu()).spatialMemory.giveUp.available, false);
  const ready = await reachGiveUpTime(decision => append(cursor, decision));
  assert.equal(ready.menu.spatialMemory.giveUp.available, true);
  await append(cursor, draft('control/giveUp'));
  const result = await compile(settings, bundle, cursor);
  assert.equal(result.acceptedActions, 3);
  assert.equal(result.trace.generation.systemCompletion, undefined);
  assert.deepEqual(result.trace.steps.slice(-3).map(step => step.type), ['giveUp', 'skipRating', 'leave']);
});

test('wayfinding candidate 7 can submit at checkout without being labelled system-assisted', async () => {
  const { settings, bundle } = fixture();
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  assert.ok((await cursor.menu()).choiceIds.includes('checkout/checkout'));
  const opened = await append(cursor, draft('checkout/checkout'));
  assert.ok(opened.menu.choiceIds.includes('control/submit'));
  await append(cursor, draft('control/submit'));
  const result = await compile(settings, bundle, cursor);
  assert.equal(result.acceptedActions, 2);
  assert.equal(result.trace.generation.systemCompletion, undefined);
  assert.deepEqual(result.trace.steps.slice(-3).map(step => step.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
  // This fixture deliberately submits an empty basket: trace validity and a
  // successful shopping outcome are separate contracts.
  assert.equal(result.trace.steps.some(step => step.type === 'dragProduct'), false);
});

test('wayfinding candidate 7 preserves 100 nonterminal decisions and the unchanged system-checkout basket', async () => {
  const { settings, bundle } = fixture();
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  for (let i = 0; i < 100; i++) await append(cursor, draft('control/pause'));
  const result = await compile(settings, bundle, cursor);
  assert.equal(result.acceptedActions, 100);
  const completion = result.trace.generation.systemCompletion;
  assert.equal(completion.afterDecisions, 100);
  assert.deepEqual(completion.cartAtStart, {});
  const systemSteps = result.trace.steps.filter(step => isMarketReplaySystemCompletionStep(result.trace, step.id));
  assert.ok(systemSteps.length > 0);
  assert.equal(systemSteps.some(step => ['dragProduct', 'removeProduct', 'giveUp'].includes(step.type)), false);
  assert.deepEqual(systemSteps.slice(-3).map(step => step.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
});

test('wayfinding session completes and persists trace, snapshot and audit through the public submit boundary', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wayfinding-finalization-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { settings } = fixture(), outputPath = path.join(directory, 'trace.json');
  const session = new WholeTraceSession({ ...settings, outputPath });
  const prepared = session.prepare();
  await session.beginAuthoring();
  const appendDecision = async decision => {
    const result = await session.appendAuthoring(decision);
    assert.equal(result.accepted, true, JSON.stringify(result.issues));
    return result;
  };
  await reachGiveUpTime(appendDecision);
  await appendDecision(draft('control/giveUp'));
  const candidate = session.finishAuthoring().candidate;
  const result = await session.submit(candidate);
  assert.equal(result.status, 'complete');
  assert.equal(session.status().status, 'complete');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const trace = read(outputPath), snapshot = read(`${outputPath}.snapshot.json`);
  const audit = read(`${outputPath}.knowledge-audit.json`);
  assert.equal(trace.generation.wholeTraceWayfindingVersion, VERSION);
  assert.equal(audit.wayfindingVersion, VERSION);
  assert.equal(audit.inputHash, prepared.bundle.inputHash);
  assert.deepEqual(snapshot, settings.snapshot);
  assert.deepEqual(validateMarketReplayTrace(trace, snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
});

test('wayfinding stays optional while unknown versions, unknown metadata and missing observation contracts reject', async () => {
  const { settings, bundle } = fixture({ wayfindingVersion: undefined, movementValidationVersion: undefined });
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  await append(cursor, draft('control/giveUp', { wayfinding: false }));
  const { trace } = await compileWholeTraceCandidate(settings, bundle, cursor.finish());
  assert.equal(Object.hasOwn(trace.generation, 'wholeTraceWayfindingVersion'), false);
  assert.deepEqual(validateMarketReplayTrace(trace, settings.snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateTrace(trace, settings.snapshot), { valid: true, errors: [] });
  assert.throws(() => fixture({ wayfindingVersion: 'wayfinding-v4' }), /wayfindingVersion wayfinding-v1\/v2 requires/);
  const changed = change => {
    const copy = structuredClone(trace);
    change(copy.generation);
    copy.traceId = marketReplayTraceId(copy);
    return validateMarketReplayTrace(copy, settings.snapshot);
  };
  const unknownVersion = changed(generation => { generation.wholeTraceWayfindingVersion = 'wayfinding-v4'; });
  assert.equal(unknownVersion.valid, false);
  assert.ok(unknownVersion.errors.some(error => /wholeTraceWayfindingVersion: unsupported value/.test(error)));
  const unknownField = changed(generation => { generation.wholeTraceFutureVersion = 'future'; });
  assert.equal(unknownField.valid, false);
  assert.ok(unknownField.errors.some(error => /wholeTraceFutureVersion: unsupported field/.test(error)));
  const missingObservation = changed(generation => {
    generation.wholeTraceWayfindingVersion = VERSION;
    delete generation.wholeTraceObservationVersion;
  });
  assert.equal(missingObservation.valid, false);
  assert.ok(missingObservation.errors.some(error => /Wayfinding v1 requires/.test(error)));
});

test('wayfinding-v2 session persists a valid trace and audit with memory events after help and the time floor', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wayfinding-v2-finalization-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { settings } = fixture({ wayfindingVersion: 'wayfinding-v2' }), outputPath = path.join(directory, 'trace.json');
  const session = new WholeTraceSession({ ...settings, outputPath });
  session.prepare();
  await session.beginAuthoring();
  const appendDecision = async decision => {
    const result = await session.appendAuthoring(decision);
    assert.equal(result.accepted, true, JSON.stringify(result.issues));
    return result;
  };
  await appendDecision(draft('control/viewHelp'));
  await appendDecision(draft('control/closeView'));
  const ready = await reachGiveUpTime(appendDecision);
  assert.equal(ready.menu.spatialMemory.giveUp.available, true, ready.menu.spatialMemory.giveUp.notice);
  await appendDecision(draft('control/giveUp'));
  const result = await session.submit(session.finishAuthoring().candidate);
  assert.equal(result.status, 'complete');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const trace = read(outputPath), snapshot = read(`${outputPath}.snapshot.json`), audit = read(`${outputPath}.knowledge-audit.json`);
  assert.equal(trace.generation.wholeTraceWayfindingVersion, 'wayfinding-v2');
  assert.equal(audit.wayfindingVersion, 'wayfinding-v2');
  assert.ok(Array.isArray(audit.wayfindingMemoryEvents));
  assert.deepEqual(validateMarketReplayTrace(trace, snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
});
