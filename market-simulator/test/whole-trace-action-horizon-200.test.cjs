'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { buildSnapshots } = require('../scripts/build-validation-snapshots.cjs');
const { validateMarketReplayTrace } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { validateWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceContracts.ts');
const { validateTrace } = require('../src/traceValidation.ts');
const { movementOptions, assertMovementBinding } = require('../src/validation/personaValidationMovement.cjs');
const { writeActorInput } = require('../whole-trace-actor-input.cjs');

const snapshot = buildSnapshots({ environmentSeed: 'action-horizon-200', lowGoalCount: 2 }).low;
const settingsFor = extra => ({ snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'action-horizon-200',
  maxRepairs: 0, timingProfile: 'original', movementValidationVersion: '1', wayfindingVersion: 'wayfinding-v4', ...extra });
const pause = () => ({ choiceRef: { choiceId: 'control/pause' }, delayMs: 500,
  reason: '현재 자리에서 잠시 쉬며 다음 행동을 기다린다',
  basis: { intent: 'rest', goalId: null, memoryUses: [] },
  actorState: { activity: 'rest', task: '현재 자리에서 쉬기', heldGoalIds: [], uncertainGoalIds: [],
    focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } });

test('default bundles keep the historical 100-decision horizon and wording', () => {
  const bundle = buildWholeTraceBundle(settingsFor({}), 'horizon-default');
  assert.equal(bundle.generationLimits.acceptedActionHorizon, 100);
  assert.equal(bundle.generationLimits.technicalActionBudget, 100);
  assert.match(bundle.actionContract.ending, /exactly 100 nonterminal decisions/);
  assert.doesNotMatch(JSON.stringify([bundle.instructions, bundle.actionContract, bundle.authoringGuide]), /\b200-action horizon\b/);
});

test('an explicit 200 horizon rewrites every actor-facing horizon phrase and rejects invalid values', () => {
  const bundle = buildWholeTraceBundle(settingsFor({ actionHorizon: 200 }), 'horizon-200');
  assert.equal(bundle.generationLimits.acceptedActionHorizon, 200);
  assert.equal(bundle.generationLimits.technicalActionBudget, 200);
  const text = JSON.stringify([bundle.instructions, bundle.actionContract, bundle.authoringGuide]);
  assert.match(text, /exactly 200 nonterminal decisions/);
  assert.doesNotMatch(text, /exactly 100 nonterminal|100-action horizon|1\.\.100 decisions|below 100 decisions|100행동/);
  assert.throws(() => buildWholeTraceBundle(settingsFor({ actionHorizon: 150 }), 'horizon-150'), /actionHorizon must be 100 or 200/);
});

test('candidate shape follows the prepared horizon', () => {
  // Drafts lack choiceRef.source, so only the horizon-specific errors are inspected here.
  const horizonErrors = (length, options) => (validateWholeTraceCandidate({ candidateVersion: '7', requestId: 'r',
    decisions: Array.from({ length }, pause) }, 'r', options).errors).filter(error => /decisions must contain|shorter than/.test(error));
  assert.deepEqual(horizonErrors(150), ['decisions must contain 1..100 complete actor decisions']);
  assert.deepEqual(horizonErrors(150, { actionHorizon: 200 }), ['A plan shorter than 200 decisions must end with submit or giveUp']);
  assert.deepEqual(horizonErrors(200, { actionHorizon: 200 }), []);
  assert.deepEqual(horizonErrors(201, { actionHorizon: 200 }), ['decisions must contain 1..200 complete actor decisions']);
});

test('under a 200 horizon, finalizing at decision 100 is an unfinished plan', async () => {
  const settings = settingsFor({ actionHorizon: 200, maxActions: 200 });
  const bundle = buildWholeTraceBundle(settings, 'horizon-200-early');
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  for (let index = 0; index < 100; index++) assert.equal((await cursor.append(pause())).accepted, true);
  assert.throws(() => cursor.finish(), /unfinished plan/i);
});

test('wayfinding-v4 authoring accepts 200 decisions and system-completes at 200', async () => {
  const settings = settingsFor({ actionHorizon: 200, maxActions: 200 });
  const bundle = buildWholeTraceBundle(settings, 'horizon-200-run');
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  for (let index = 0; index < 200; index++) {
    const accepted = await cursor.append(pause());
    assert.equal(accepted.accepted, true, JSON.stringify(accepted.issues ?? accepted));
    assert.equal(accepted.menu.decisionCount, index + 1);
  }
  const candidate = cursor.finish();
  assert.equal(candidate.decisions.length, 200);
  const compiled = await compileWholeTraceCandidate(settings, bundle, candidate);
  assert.equal(compiled.acceptedActions, 200);
  assert.equal(compiled.trace.generation.wholeTraceActionHorizon, 200);
  assert.equal(compiled.trace.generation.systemCompletion.afterDecisions, 200);
  assert.equal(compiled.trace.generation.systemCompletion.actionLimit, 200);
  assert.deepEqual(validateTrace(compiled.trace, snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateMarketReplayTrace(compiled.trace, snapshot).errors ?? [], []);
  const mislabeled = structuredClone(compiled.trace);
  delete mislabeled.generation.wholeTraceActionHorizon;
  assert.ok((validateMarketReplayTrace(mislabeled, snapshot).errors ?? []).some(error => /explicit 100-decision bound/.test(error)));
});

test('compiling with settings that differ from the prepared horizon is rejected', async () => {
  const bundle = buildWholeTraceBundle(settingsFor({ actionHorizon: 200 }), 'horizon-mismatch');
  await assert.rejects(compileWholeTraceCandidate(settingsFor({}), bundle,
    { candidateVersion: '7', requestId: 'horizon-mismatch', decisions: [pause()] }), /differs from the prepared/);
});

test('validation binding carries the horizon and the actor template must match it', () => {
  assert.deepEqual(movementOptions({ movementValidationVersion: '1', wayfindingVersion: 'wayfinding-v4', actionHorizon: 200 }),
    { movementValidationVersion: '1', wayfindingVersion: 'wayfinding-v4', actionHorizon: 200 });
  assert.throws(() => movementOptions({ movementValidationVersion: '1', actionHorizon: 100 }), /actionHorizon must be 200/);
  assert.throws(() => assertMovementBinding({ movementValidationVersion: '1', actionHorizon: 200 }, { movementValidationVersion: '1' }), /differs/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-actor-'));
  try {
    const bundle = buildWholeTraceBundle(settingsFor({ actionHorizon: 200 }), 'horizon-actor');
    const slot = path.join(dir, 'slot');
    fs.mkdirSync(path.join(slot, 'owner'), { recursive: true });
    const response = path.join(slot, 'owner', 'prepare-response.json');
    fs.writeFileSync(response, JSON.stringify({ requestId: 'horizon-actor', bundle }));
    assert.throws(() => writeActorInput(response, path.join(slot, 'actor-input.json'), { template: 'authoring-v3' }), /does not match/);
    const summary = writeActorInput(response, path.join(slot, 'actor-input.json'));
    assert.equal(summary.actorInstructions.templateId, 'authoring-v3-h200');
    assert.match(fs.readFileSync(summary.actorInstructions.file, 'utf8'), /200-decision horizon/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
