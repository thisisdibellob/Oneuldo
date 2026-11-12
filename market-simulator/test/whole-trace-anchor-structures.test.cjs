'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
require('../runtime.cjs');
const { buildSnapshots } = require('../scripts/build-validation-snapshots.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, validateMarketReplayTrace } = require('../../frontend/src/game/marketReplayTrace.ts');
const { visibleStations, visibleUnlabelledShelfBodies } = require('../../frontend/src/game/marketReplayPerception.ts');
const { buildWholeTraceBundle, wholeTraceInputHash } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { buildWholeTraceAuthoringGuide } = require('../src/wholeTrace/wholeTraceAuthoring.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { compileWholeTraceCandidate, validateWholeTracePrefix } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { WholeTraceSession } = require('../src/wholeTrace/wholeTraceSession.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { WholeTraceKnowledgeLedger } = require('../src/wholeTrace/wholeTraceKnowledge.ts');
const VERSION = 'anchor-visible-structures-v1';

// Reproduces the r4 W017 geometry, without reading or mutating saved pilot data.
function fixture() {
  const base = buildSnapshots({ environmentSeed: 'trait-v3-pilot-20261111-r2-verified', lowGoalCount: 3 }).low;
  const environment = structuredClone(base.environment);
  environment.spawn = { x: 240, y: 720 };
  const snapshot = createMarketReplaySnapshot(createMarketSession(base.config, environment), undefined, base.presentation);
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'anchor-structure-regression',
    maxActions: 100, maxRepairs: 0, timingProfile: 'original' };
  return { settings, bundle: buildWholeTraceBundle(settings, 'anchor-structure-request') };
}
function draft(choiceId, cueRefs = []) {
  const ending = choiceId === 'control/giveUp';
  return { choiceRef: { choiceId }, delayMs: 500, reason: '현재 표시된 화면에서 선택한 행동을 수행한다',
    basis: { intent: ending ? 'finish' : 'explore', goalId: null, memoryUses: [], cueRefs },
    actorState: { activity: ending ? 'finish' : 'orient', task: '현재 화면의 단서를 살핀다',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null,
      orientation: 'unfamiliar' } };
}
const plan = (bundle, decisions = []) => ({ candidateVersion: '7', requestId: bundle.requestId, decisions });
function archivedBundle(settings, bundle) {
  const old = structuredClone(bundle);
  delete old.observationVersion;
  old.inputHash = wholeTraceInputHash(settings);
  delete old.actorState.initialObservation.visibleStructures;
  old.authoringGuide = buildWholeTraceAuthoringGuide(old);
  return old;
}
async function append(cursor, decision) {
  const result = await cursor.append(decision);
  assert.equal(result.accepted, true, JSON.stringify(result));
  return result;
}

test('new anchor contract exposes only the visible unlabelled body and preserves all legal controls', async () => {
  const { settings, bundle } = fixture(), old = archivedBundle(settings, bundle);
  assert.equal(bundle.observationVersion, VERSION);
  assert.equal(bundle.authoringGuide.executionAuthoring.observationRevision, 'validated-prefix-observation-v4');
  assert.equal(bundle.authoringGuide.executionAuthoring.menuPresentationRevision, 'current-choice-menu-v2');
  assert.notEqual(bundle.inputHash, old.inputHash, 'Perception semantics are part of the prepared input binding');
  const p = settings.snapshot.presentation, env = settings.snapshot.environment;
  const bodies = visibleUnlabelledShelfBodies(env, env.spawn, p, settings.snapshot.cashierAvailability);
  assert.ok(bodies.length > 0);
  assert.deepEqual(visibleStations(env, env.spawn, p, settings.snapshot.cashierAvailability), []);
  for (const body of bodies) assert.deepEqual(Object.keys(body).sort(), ['direction', 'distanceBand', 'kind', 'label']);
  const current = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const legacy = await createWholeTraceExecutionAuthoringCursor(settings, old);
  const menu = await current.menu(), original = await legacy.menu();
  assert.equal(menu.currentObservation.kind, 'validated-prefix-observation-v4');
  assert.equal(original.currentObservation.kind, 'validated-prefix-observation-v3');
  assert.deepEqual(menu.currentObservation.observation.visibleStructures, bodies);
  assert.equal(Object.hasOwn(original.currentObservation.observation, 'visibleStructures'), false);
  assert.deepEqual(menu.choiceIds, original.choiceIds);
  assert.deepEqual(menu.allowedWaypointIds, original.allowedWaypointIds);
  assert.deepEqual(menu.visibleWalkChoices, original.visibleWalkChoices);
  assert.ok(!menu.choiceIds.some(id => id.startsWith('open/')), 'A body does not authorize a shelf interaction');
  assert.deepEqual(menu.currentObservation.observation.products, []);
  const guard = new TraceGuard(settings.snapshot, 'test', '1', 'test', true, true,
    false, false, false, false, true, false, VERSION);
  assert.deepEqual(bundle.actorState.initialObservation, guard.observeActor());
  const prefix = await validateWholeTracePrefix(settings, bundle, plan(bundle));
  assert.deepEqual(menu.currentObservation.observation, prefix.before);
});

test('body cues stay current-only through help panels, prefix checks, final compilation and independent validation', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const before = await validateWholeTracePrefix(settings, bundle, plan(bundle));
  const refs = before.knowledge.visibleCueRefs.filter(ref => ref.startsWith('structure:'));
  assert.ok(refs.length);
  const pause = await append(cursor, draft('control/pause', [refs[0]]));
  const help = await append(cursor, draft('control/viewHelp'));
  assert.deepEqual(help.menu.currentObservation.observation.visibleStructures, []);
  const inHelp = await validateWholeTracePrefix(settings, bundle, plan(bundle, [pause.decision, help.decision]));
  assert.ok(!inHelp.knowledge.cues.some(cue => cue.kind === 'visible-unlabelled-structure'));
  const stale = await cursor.append(draft('control/closeView', [refs[0]]));
  assert.equal(stale.accepted, false);
  assert.equal(stale.code, 'KNOWLEDGE_BASIS');
  assert.deepEqual(stale.menu.currentObservation, help.menu.currentObservation);
  const close = await append(cursor, draft('control/closeView'));
  assert.deepEqual(close.menu.currentObservation.observation.visibleStructures, before.before.visibleStructures);
  await append(cursor, draft('control/giveUp'));
  const result = await compileWholeTraceCandidate(settings, bundle, cursor.finish());
  assert.equal(result.trace.generation.wholeTraceObservationVersion, VERSION);
  assert.deepEqual(result.knowledgeAudit[0].before, before.before);
  assert.deepEqual(result.knowledgeAudit[2].before, inHelp.before);
  assert.equal(validateTrace(result.trace, settings.snapshot).valid, true);
  assert.equal(validateMarketReplayTrace(result.trace, settings.snapshot).valid, true);
  const invalid = structuredClone(result.trace);
  invalid.generation.wholeTraceMovementVersion = 'directional-v2';
  assert.ok(validateMarketReplayTrace(invalid, settings.snapshot).errors.some(e => /Anchor visible structures/.test(e)));
});

test('archived anchor bundles and directional contracts retain their original observations', async () => {
  const { settings, bundle } = fixture(), old = archivedBundle(settings, bundle);
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, old);
  await append(cursor, draft('control/pause'));
  await append(cursor, draft('control/giveUp'));
  const result = await compileWholeTraceCandidate(settings, old, cursor.finish());
  assert.equal(Object.hasOwn(result.trace.generation, 'wholeTraceObservationVersion'), false);
  assert.ok(result.knowledgeAudit.every(row => !Object.hasOwn(row.before, 'visibleStructures')));
  assert.equal(validateTrace(result.trace, settings.snapshot).valid, true);
  for (const version of ['directional-v1', 'directional-v2']) {
    const directional = { ...settings, movementVersion: version }, prepared = buildWholeTraceBundle(directional, `test-${version}`);
    assert.equal(Object.hasOwn(prepared, 'observationVersion'), false);
    const prefix = await validateWholeTracePrefix(directional, prepared, plan(prepared));
    assert.equal(Object.hasOwn(prefix.before, 'visibleStructures'), false);
  }
  const legacyLedger = new WholeTraceKnowledgeLedger({ id: 'test', version: '1' });
  const observation = (await validateWholeTracePrefix(settings, bundle, plan(bundle))).before;
  assert.ok(!legacyLedger.observe(observation).knowledge.cues.some(c => c.kind === 'visible-unlabelled-structure'));
});

test('removing or changing a prepared observation contract rejects before any action', async () => {
  const { settings, bundle } = fixture();
  for (const marker of [undefined, 'unrecognized', 'anchor-visible-structures-v2']) {
    const changed = structuredClone(bundle);
    if (marker === undefined) delete changed.observationVersion;
    else changed.observationVersion = marker;
    await assert.rejects(validateWholeTracePrefix(settings, changed, plan(changed)), error =>
      error.validation?.code === 'PREPARED_INPUT_MISMATCH');
  }
  const legacy = archivedBundle(settings, bundle); legacy.observationVersion = VERSION;
  await assert.rejects(validateWholeTracePrefix(settings, legacy, plan(legacy)), error =>
    error.validation?.code === 'PREPARED_INPUT_MISMATCH');
});

test('session persists the bound observation version and its exact audited decisions', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-body-contract-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { settings } = fixture(), outputPath = path.join(directory, 'trace.json');
  const session = new WholeTraceSession({ ...settings, outputPath });
  const prepared = session.prepare();
  const begun = await session.beginAuthoring();
  assert.equal(begun.menu.currentObservation.kind, 'validated-prefix-observation-v4');
  await session.appendAuthoring(draft('control/pause'));
  await session.appendAuthoring(draft('control/giveUp'));
  const candidate = session.finishAuthoring().candidate;
  const result = await session.submit(candidate);
  assert.equal(result.status, 'complete');
  const trace = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const audit = JSON.parse(fs.readFileSync(`${outputPath}.knowledge-audit.json`, 'utf8'));
  assert.equal(audit.observationVersion, VERSION);
  assert.equal(audit.inputHash, prepared.bundle.inputHash);
  assert.equal(trace.generation.wholeTraceObservationVersion, VERSION);
  assert.deepEqual(audit.decisions[0].before, begun.menu.currentObservation.observation);
  assert.equal(validateTrace(trace, settings.snapshot).valid, true);
});
