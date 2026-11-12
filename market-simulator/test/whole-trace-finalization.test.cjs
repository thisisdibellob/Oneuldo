'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { WholeTraceSession } = require('../src/wholeTraceSession.ts');
const { createService } = require('../server.cjs');
const run = require('../src/personaValidationRun.cjs');
const BASE = 'mild-intellectual-disability-adult';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-finalization-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'finalization',
    objectives: [{ productId: 'milk', quantity: 1 }], environment: { cashierCount: 2 } }));
  const settings = { snapshot, personaId: BASE, seed: 'finalization', maxActions: 100, maxRepairs: 1,
    outputPath: path.join(directory, 'trace.json') };
  return { directory, settings, session: new WholeTraceSession(settings) };
}
function draft(choiceId) {
  return { choiceRef: { choiceId }, delayMs: 500, reason: '작성자가 선택한 행동의 종료 경계를 확인한다',
    basis: { intent: choiceId === 'control/giveUp' ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: choiceId === 'control/giveUp' ? 'finish' : 'orient', task: '현재 선택한 행동',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } };
}

for (const method of ['finish', 'direct-submit']) test(`${method} of an unfinished accepted walk freezes a technical failure, not a new ending`, async t => {
  const { session, settings } = fixture(t), prepared = session.prepare();
  const beginning = await session.beginAuthoring();
  const walk = beginning.menu.choiceIds.find(id => id.startsWith('walk/'));
  assert.ok(walk);
  const accepted = await session.appendAuthoring(draft(walk));
  assert.equal(accepted.accepted, true);
  const exactPrefix = [accepted.decision];
  const unfinished = { candidateVersion: '7', requestId: prepared.requestId, decisions: exactPrefix };
  if (method === 'finish') assert.throws(() => session.finishAuthoring(),
    error => error.code === 'AUTHORING_INCOMPLETE_FINALIZATION');
  else await assert.rejects(session.submit(unfinished), error => error.code === 'AUTHORING_INCOMPLETE_FINALIZATION');
  const status = session.status();
  assert.equal(status.status, 'failed');
  assert.equal(status.attempts, 0, 'An incomplete finalization never enters compilation');
  assert.equal(status.canRepair, false, 'Final candidate repair budget does not reopen authoring');
  assert.equal(status.result.code, 'AUTHORING_INCOMPLETE_FINALIZATION');
  assert.equal(status.result.completeTrace, false);
  assert.equal(status.authoring.failed, true);
  assert.equal(status.authoring.finalizationContract, 'incomplete-finalization-fails-request-v1');
  assert.equal(status.authoring.decisions.length, 1);
  assert.equal(status.authoring.decisions[0].attempts, 1);
  const receipt = read(status.result.failurePath);
  assert.deepEqual(receipt.acceptedCandidate, unfinished);
  assert.equal(read(path.join(prepared.diagnosticDirectory, 'status.json')).status, 'failed');
  assert.equal(fs.existsSync(settings.outputPath), false);
  const lateEnding = { ...draft('control/giveUp'), choiceRef: {
    choiceId: 'control/giveUp', source: accepted.menu.expectedSource } };
  await assert.rejects(session.appendAuthoring(draft('control/giveUp')), /same unsubmitted prepared request/);
  await assert.rejects(session.beginAuthoring(), /unsubmitted prepared request/);
  await assert.rejects(session.submit({ ...unfinished, decisions: [...exactPrefix, lateEnding] }), /closed/);
  await assert.rejects(session.submitRepair({ decisions: [lateEnding] }), /requires.*invalid/);
  assert.deepEqual(read(status.result.failurePath), receipt, 'Failed prefix and receipt remain unchanged');
});

test('empty finalization fails, while a deliberate ending authored before finalization remains valid', async t => {
  const empty = fixture(t);
  await empty.session.beginAuthoring();
  assert.throws(() => empty.session.finishAuthoring(), error => error.code === 'AUTHORING_INCOMPLETE_FINALIZATION');
  assert.deepEqual(read(empty.session.status().result.failurePath).acceptedCandidate.decisions, []);
  const normal = fixture(t);
  await normal.session.beginAuthoring();
  assert.equal((await normal.session.appendAuthoring(draft('control/giveUp'))).accepted, true);
  const finished = normal.session.finishAuthoring();
  assert.equal(finished.candidate.decisions.at(-1).choiceRef.choiceId, 'control/giveUp');
  assert.equal((await normal.session.submit(finished.candidate)).status, 'complete');
});

test('a pending technical rewrite is not an incomplete-finalization failure and retains its original budget', async t => {
  const { session } = fixture(t);
  await session.beginAuthoring({ maxRewritesPerDecision: 1 });
  assert.equal((await session.appendAuthoring(draft('walk/unavailable'))).accepted, false);
  assert.throws(() => session.finishAuthoring(), error => error.code === 'AUTHORING_REWRITE_PENDING');
  assert.equal(session.status().status, 'prepared');
  assert.equal(session.status().authoring.failed, false);
  assert.equal(session.status().authoring.maxRewritesPerDecision, 1);
  assert.equal((await session.appendAuthoring(draft('control/pause'))).accepted, true);
  assert.equal((await session.appendAuthoring(draft('control/giveUp'))).accepted, true);
  assert.equal((await session.submit(session.finishAuthoring().candidate)).status, 'complete');
});

test('validation readiness records an incomplete finalization as a technical failure instead of an unattempted slot', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finalization-readiness-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotFilePaths = {};
  for (const condition of ['low', 'high']) {
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`);
    fs.writeFileSync(snapshotFilePaths[condition], JSON.stringify(createMarketReplaySnapshot(createMarketSession({
      seed: 'finalization-readiness', objectives: ['milk', 'apple', 'water', 'eggs', 'banana']
        .slice(0, condition === 'low' ? 2 : 5).map(productId => ({ productId, quantity: condition === 'low' ? 1 : 2 })),
    }))));
  }
  const prepared = run.prepare({ runId: 'finalization-readiness', outputDirectory: directory, snapshotFilePaths,
    profiles: ['low', 'high'].map(level => ({ id: `checking-${level}`, basePersonaId: BASE,
      schemaVersion: 'persona-traits-v2', traits: { checking: level } })), seeds: ['s01'] });
  const initial = run.checkReadiness({ runDirectory: prepared.runDirectory });
  const slot = initial.missingSlots[0], args = slot.prepareWholeTrace;
  const service = createService();
  t.after(() => service.close());
  const { requestId } = await service.invokeTool('prepare_whole_trace', args);
  await service.invokeTool('begin_whole_trace_authoring', { requestId });
  assert.equal((await service.invokeTool('append_whole_trace_decision', { requestId, decision: draft('control/pause') })).accepted, true);
  await assert.rejects(service.invokeTool('finish_whole_trace_authoring', { requestId }),
    error => error.code === 'AUTHORING_INCOMPLETE_FINALIZATION');
  const checked = run.checkReadiness({ runDirectory: prepared.runDirectory });
  assert.equal(checked.complete, 0);
  assert.equal(checked.technicalFailures.length, 1);
  assert.equal(checked.technicalFailures[0].tracePath, slot.tracePath);
  assert.equal(checked.technicalFailures[0].reason, 'Generation failed');
  assert.ok(checked.reasons.some(reason => reason.code === 'technical-failures'));
  assert.equal(read(`${slot.tracePath}.whole-trace/status.json`).result.code, 'AUTHORING_INCOMPLETE_FINALIZATION');
});
