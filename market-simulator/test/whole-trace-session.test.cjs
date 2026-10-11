const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createHash } = require('node:crypto');
require('../runtime.cjs');
const { WholeTraceSession } = require('../src/wholeTraceSession.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
function fixture(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-session-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const session = new WholeTraceSession({ personaId: 'careful-checker', seed: 'whole-session',
    snapshot: createMarketReplaySnapshot(createMarketSession({ seed: 'whole-session' })), outputPath: path.join(dir, 'trace.json'), ...extra });
  return { session, dir, requestId: session.prepare().requestId };
}
const d = type => {
  const basis = type === 'pause' ? { intent: 'rest', cueRefs: ['phase:shopping'] }
    : type === 'lookAround' ? { intent: 'explore', cueRefs: ['phase:shopping'] }
    : type === 'giveUp' ? { intent: 'finish', cueRefs: ['persona:goal'] }
      : type === 'readList' ? { intent: 'check', cueRefs: ['list'] }
        : { intent: 'interest', cueRefs: ['product:not-visible'] };
  return { action: { type }, delayMs: 450, reason: '화면의 단서를 확인해 동작한다', basis,
    actorState: { activity: basis.intent === 'explore' ? 'orient' : basis.intent, task: '화면의 단서를 확인해 동작한다', heldGoalIds: [], uncertainGoalIds: [],
      orientation: 'unfamiliar', triggerCueRefs: [...basis.cueRefs] } };
};
const input = (id, decisions) => ({ candidateVersion: '3', requestId: id, decisions });
const choice = (source, choiceId, intent, activity) => ({ choiceRef: { source, choiceId }, delayMs: 520,
  reason: '현재 화면에서 고른 동작을 진행한다', basis: { intent, cueRefs: ['phase:shopping'] },
  actorState: { activity, task: '현재 화면의 단서를 확인하며 장보기 진행하기', heldGoalIds: [], uncertainGoalIds: [],
    orientation: 'unfamiliar', triggerCueRefs: ['phase:shopping'] } });
const bad = id => input(id, [d('pause'), { ...d('add'), action: { type: 'add', productId: 'not-visible', quantity: 1 } }, d('giveUp')]);
test('v5 session preflight combines invalid source and goal-reference diagnostics before beginning execution', async t => {
  const { session, dir, requestId } = fixture(t, { maxRepairs: 1 });
  const wire = choice({ ...session.prepare().bundle.initialChoiceFrame.source, view: 'checkout' }, 'control/giveUp', 'finish', 'finish');
  Object.assign(wire.actorState, { focusedGoalId: 'not-an-objective', focusedProductId: null,
    heldGoalIds: ['not-an-objective'], triggerCueRefs: ['objective:not-an-objective'] });
  const rejected = await session.submit({ candidateVersion: '5', requestId, decisions: [wire] });
  assert.equal(rejected.status, 'invalid');
  assert.equal(rejected.validation.code, 'CANDIDATE_SCHEMA');
  for (const fragment of ['invalid source view', 'focusedGoalId has unknown objective ID',
    'heldGoalIds has unknown objective ID', 'triggerCueRefs has unknown objective reference'])
    assert.ok(rejected.validation.errors.some(error => error.includes(fragment)), fragment);
  assert.equal(fs.existsSync(path.join(dir, 'trace.json.whole-trace', 'attempt-1.generation')), false);
  // Schema-invalid submissions remain preserved and counted within the same
  // bounded original-plus-one-repair budget; preflight is not a free resample.
  assert.equal(session.status().attempts, 1);
  assert.equal(rejected.canRepair, true);
  assert.ok(fs.existsSync(path.join(dir, 'trace.json.whole-trace', 'attempt-1.candidate.json')));
});
test('technical repair preserves the accepted prefix and counts complete submissions separately', async t => {
  const { session, requestId } = fixture(t, { maxRepairs: 1 });
  const rejected = await session.submit(bad(requestId));
  assert.equal(rejected.validation.acceptedPrefixLength, 1);
  assert.equal(rejected.canRepair, true);
  const fixed = await session.submit(input(requestId, [d('pause'), d('giveUp')]));
  assert.equal(fixed.status, 'complete');
  assert.equal(fixed.metrics.planningSubmissions, 2);
  assert.equal(fixed.metrics.repairSubmissions, 1);
  const trace = JSON.parse(fs.readFileSync(fixed.outputPath, 'utf8'));
  assert.equal(trace.steps[1].type, 'pause');
  assert.equal(trace.generation.repairSubmissions, 1);
});
test('suffix repair rejects stale attempt metadata without consuming the repair budget', async t => {
  const { session, requestId } = fixture(t, { maxRepairs: 1 });
  const rejected = await session.submit(bad(requestId));
  assert.equal(rejected.validation.acceptedPrefixLength, 1);
  await assert.rejects(session.submitRepair({ repairVersion: '1', requestId, baseAttempt: 0, fromDecisionIndex: 1,
    candidateVersion: '3', decisions: [d('giveUp')] }), /baseAttempt/);
  assert.equal(session.status().attempts, 1);
  assert.equal(session.status().canRepair, true);
});
test('suffix repair appends after the immutable accepted prefix and keeps original and suffix diagnostics', async t => {
  const { session, requestId } = fixture(t, { maxRepairs: 1 });
  const original = bad(requestId);
  const rejected = await session.submit(original);
  const suffix = { repairVersion: '1', requestId, baseAttempt: 1, fromDecisionIndex: rejected.validation.acceptedPrefixLength,
    candidateVersion: '3', decisions: [d('giveUp')] };
  const fixed = await session.submitRepair(suffix);
  assert.equal(fixed.status, 'complete');
  const originalFile = JSON.parse(fs.readFileSync(path.join(fixed.diagnosticDirectory, 'attempt-1.candidate.json'), 'utf8'));
  const assembled = JSON.parse(fs.readFileSync(path.join(fixed.diagnosticDirectory, 'attempt-2.candidate.json'), 'utf8'));
  const suffixFile = JSON.parse(fs.readFileSync(path.join(fixed.diagnosticDirectory, 'attempt-2.repair-suffix.json'), 'utf8'));
  assert.deepEqual(originalFile, original);
  assert.deepEqual(assembled.decisions.slice(0, rejected.validation.acceptedPrefixLength), original.decisions.slice(0, rejected.validation.acceptedPrefixLength));
  assert.deepEqual(assembled.decisions.slice(rejected.validation.acceptedPrefixLength), suffix.decisions);
  assert.deepEqual(suffixFile, suffix);
});
test('duplicate successful suffix repair returns the cached result idempotently', async t => {
  const { session, requestId } = fixture(t, { maxRepairs: 1 });
  const rejected = await session.submit(bad(requestId));
  const suffix = { repairVersion: '1', requestId, baseAttempt: 1, fromDecisionIndex: rejected.validation.acceptedPrefixLength,
    candidateVersion: '3', decisions: [d('giveUp')] };
  const first = await session.submitRepair(suffix);
  const duplicate = await session.submitRepair(suffix);
  assert.deepEqual(duplicate, first);
  assert.equal(session.status().attempts, 2);
});
test('same-candidate repair retry returns the cached invalid attempt before reserving a suffix path', async t => {
  const { session, requestId, dir } = fixture(t, { maxRepairs: 1 });
  const original = bad(requestId);
  const first = await session.submit(original);
  const noOpRepair = { repairVersion: '1', requestId, baseAttempt: 1,
    fromDecisionIndex: first.repairContext.fromDecisionIndex, candidateVersion: '3',
    decisions: original.decisions.slice(first.repairContext.fromDecisionIndex) };

  const retry = await session.submitRepair(noOpRepair);
  assert.deepEqual(retry, first);
  assert.equal(session.status().status, 'invalid');
  assert.equal(session.status().attempts, 1);
  assert.equal(session.status().canRepair, true);
  assert.equal(fs.existsSync(path.join(dir, 'trace.json.whole-trace', 'attempt-2.repair-suffix.json')), false);

  const validRepair = { ...noOpRepair, decisions: [d('giveUp')] };
  const completed = await session.submitRepair(validRepair);
  assert.equal(completed.status, 'complete');
  assert.equal(completed.metrics.planningSubmissions, 2);
  assert.equal(session.status().attempts, 2);
  const duplicate = await session.submitRepair(validRepair);
  assert.deepEqual(duplicate, completed);
  assert.equal(session.status().attempts, 2);
});
test('suffix repair cannot introduce a give-up terminal choice', async t => {
  const { session, requestId } = fixture(t, { maxRepairs: 1 });
  const first = await session.submit(input(requestId, [d('pause'), { ...d('add'), action: { type: 'add', productId: 'not-visible', quantity: 1 } },
    { ...d('giveUp'), action: { type: 'submit' } }]));
  const rejected = await session.submitRepair({ repairVersion: '1', requestId, baseAttempt: 1,
    fromDecisionIndex: first.validation.acceptedPrefixLength, candidateVersion: '3', decisions: [d('giveUp')] });
  assert.equal(rejected.status, 'invalid');
  assert.equal(rejected.validation.code, 'REPAIR_CHANGED_ENDING');
  assert.equal(rejected.canRepair, false);
});
test('suffix repair cannot change original give-up intent to submit', async t => {
  const { session, requestId } = fixture(t, { maxRepairs: 1 });
  const first = await session.submit(input(requestId, [d('pause'), { ...d('add'), action: { type: 'add', productId: 'not-visible', quantity: 1 } }, d('giveUp')]));
  assert.equal(first.status, 'invalid');
  const rejected = await session.submitRepair({ repairVersion: '1', requestId, baseAttempt: 1,
    fromDecisionIndex: first.repairContext.fromDecisionIndex, candidateVersion: '3', decisions: [d('submit')] });
  assert.equal(rejected.validation.code, 'REPAIR_CHANGED_ENDING');
  assert.match(rejected.validation.errors[0], /preserve the original terminal intent/);
});
test('suffix repair cannot change original submit intent to system horizon', async t => {
  const { session, requestId } = fixture(t, { maxRepairs: 1 });
  const first = await session.submit(input(requestId, [d('pause'), { ...d('add'), action: { type: 'add', productId: 'not-visible', quantity: 1 } },
    { ...d('giveUp'), action: { type: 'submit' } }]));
  assert.equal(first.status, 'invalid');
  const rejected = await session.submitRepair({ repairVersion: '1', requestId, baseAttempt: 1,
    fromDecisionIndex: first.repairContext.fromDecisionIndex, candidateVersion: '3', decisions: Array.from({ length: 99 }, () => d('pause')) });
  assert.equal(rejected.validation.code, 'REPAIR_CHANGED_ENDING');
});
test('suffix repair cannot change original system horizon intent to submit', async t => {
  const { session, requestId } = fixture(t, { maxRepairs: 1 });
  const initial = [d('pause'), { ...d('add'), action: { type: 'add', productId: 'not-visible', quantity: 1 } },
    ...Array.from({ length: 98 }, () => d('pause'))];
  const first = await session.submit(input(requestId, initial));
  assert.equal(first.status, 'invalid');
  const suffix = [...Array.from({ length: 98 }, () => d('pause')), { ...d('giveUp'), action: { type: 'submit' } }];
  const rejected = await session.submitRepair({ repairVersion: '1', requestId, baseAttempt: 1,
    fromDecisionIndex: first.repairContext.fromDecisionIndex, candidateVersion: '3', decisions: suffix });
  assert.equal(rejected.validation.code, 'REPAIR_CHANGED_ENDING');
});
test('v4 repair resolves original terminal intent through the choice catalog', async t => {
  const { session, requestId } = fixture(t, { maxRepairs: 1 });
  const source = session.prepare().bundle.initialChoiceFrame.source;
  const first = await session.submit({ candidateVersion: '4', requestId, decisions: [
    choice(source, 'control/pause', 'rest', 'rest'),
    { ...choice(source, 'add/milk', 'task', 'shop'), choiceRef: { source, choiceId: 'add/milk', quantity: 1 } },
    choice(source, 'control/submit', 'finish', 'finish'),
  ] });
  assert.equal(first.status, 'invalid');
  assert.equal(first.candidateVersion, '4');
  assert.equal(first.actionBinding, 'state-bound-choice-v1');
  assert.equal(first.repairContext.originalCandidateVersion, '4');
  assert.equal(first.repairContext.acceptedFrame.location, 'start');
  assert.ok(first.repairContext.choiceFrame.availableChoices.length > 0);
  const blocked = await session.submitRepair({ repairVersion: '1', requestId, baseAttempt: 1,
    fromDecisionIndex: first.repairContext.fromDecisionIndex, candidateVersion: '4',
    decisions: [choice(source, 'control/giveUp', 'finish', 'finish')] });
  assert.equal(blocked.status, 'invalid');
  assert.equal(blocked.validation.code, 'REPAIR_CHANGED_ENDING');
  assert.equal(blocked.repairContext.originalCandidateVersion, '4');
});
test('v4 completion writes versioned action-binding audit provenance', async t => {
  const { session, requestId } = fixture(t);
  const source = session.prepare().bundle.initialChoiceFrame.source;
  const result = await session.submit({ candidateVersion: '4', requestId, decisions: [
    choice(source, 'control/pause', 'rest', 'rest'), choice(source, 'control/giveUp', 'finish', 'finish')
  ] });
  assert.equal(result.status, 'complete');
  assert.equal(result.candidateVersion, '4');
  assert.equal(result.actionBinding, 'state-bound-choice-v1');
  const audit = JSON.parse(fs.readFileSync(result.knowledgeAuditPath, 'utf8'));
  assert.equal(audit.auditVersion, '3');
  assert.equal(audit.candidateVersion, '4');
  assert.equal(audit.actionBinding, 'state-bound-choice-v1');
});
test('repair cannot optimize away the previously accepted behavior', async t => {
  const { session, requestId, dir } = fixture(t, { maxRepairs: 1 });
  await session.submit(bad(requestId));
  const rejected = await session.submit(input(requestId, [d('readList'), d('giveUp')]));
  assert.equal(rejected.status, 'invalid');
  assert.equal(rejected.validation.code, 'REPAIR_CHANGED_PREFIX');
  assert.equal(rejected.canRepair, false);
  assert.equal(fs.existsSync(path.join(dir, 'trace.json')), false);
});
test('technical repair cannot replace a shopping plan with a newly introduced give-up', async t => {
  const { session, requestId, dir } = fixture(t, { maxRepairs: 1 });
  const intendedCheckout = input(requestId, [d('pause'), { ...d('add'), action: { type: 'add', productId: 'not-visible', quantity: 1 } },
    { ...d('giveUp'), action: { type: 'submit' } }]);
  const first = await session.submit(intendedCheckout);
  assert.equal(first.status, 'invalid');
  assert.equal(first.validation.acceptedPrefixLength, 1);
  const rejected = await session.submit(input(requestId, [d('pause'), d('giveUp')]));
  assert.equal(rejected.status, 'invalid');
  assert.equal(rejected.validation.code, 'REPAIR_CHANGED_ENDING');
  assert.equal(rejected.canRepair, false);
  assert.equal(fs.existsSync(path.join(dir, 'trace.json')), false);
});
test('a schema failure cannot erase the original checkout intent before a repair', async t => {
  const { session, requestId, dir } = fixture(t, { maxRepairs: 1 });
  const malformed = { ...d('giveUp'), action: { type: 'submit' }, actorState: { ...d('giveUp').actorState, triggerCueRefs: [] } };
  const first = await session.submit(input(requestId, [malformed]));
  assert.equal(first.validation.code, 'CANDIDATE_SCHEMA');
  const rejected = await session.submit(input(requestId, [d('giveUp')]));
  assert.equal(rejected.validation.code, 'REPAIR_CHANGED_ENDING');
  assert.equal(fs.existsSync(path.join(dir, 'trace.json')), false);
});
test('status-write failure closes as persistence failure, never a stuck compiling or persona repair', async t => {
  const { session, requestId, dir } = fixture(t, { maxRepairs: 1 });
  const original = fs.writeFileSync;
  let failed = false;
  t.mock.method(fs, 'writeFileSync', (file, ...rest) => {
    if (!failed && String(file).endsWith('status.partial.json')) {
      failed = true; throw Object.assign(new Error('Fixture disk failure'), { code: 'ENOSPC' });
    }
    return original(file, ...rest);
  });
  const candidate = input(requestId, [d('giveUp')]);
  const result = await session.submit(candidate);
  assert.equal(result.status, 'failed');
  assert.equal(result.stage, 'persistence');
  assert.equal(result.canRepair, false);
  assert.equal(session.status().status, 'failed');
  assert.equal(fs.existsSync(path.join(dir, 'trace.json')), false);
  assert.deepEqual(await session.submit(candidate), result);
});
test('bundle reports technical limits and remains immutable after the caller edits its copy', t => {
  const { session } = fixture(t, { maxActions: 5, timeBudgetMs: 20000 });
  const prepared = session.prepare();
  assert.deepEqual(prepared.bundle.generationLimits, { acceptedActionHorizon: 100, technicalActionBudget: 5, maxRepairs: 0, plannedTimeBudgetMs: 20000 });
  prepared.bundle.persona.character.selectedTraits = [];
  assert.ok(session.prepare().bundle.persona.character.selectedTraits.length > 0);
});
test('default whole timing preserves candidate delays and writes independently matched knowledge and persona review sidecars', async t => {
  const { session, requestId } = fixture(t);
  const decisions = [...Array.from({ length: 8 }, (_, i) => d(i % 2 ? 'pause' : 'lookAround')), d('giveUp')];
  const result = await session.submit(input(requestId, decisions));
  assert.equal(result.status, 'complete');
  assert.equal(result.validation.valid, true);
  assert.equal(result.personaReview.status, 'review');
  assert.equal(result.personaReviewPath, `${result.outputPath}.persona-review.json`);
  const trace = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  const audit = JSON.parse(fs.readFileSync(result.knowledgeAuditPath, 'utf8'));
  const review = JSON.parse(fs.readFileSync(result.personaReviewPath, 'utf8'));
  const hash = value => createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
  assert.equal(trace.generation.timingProfile, 'actor-preserved-v1');
  assert.equal(audit.auditVersion, '2');
  assert.equal(audit.traceId, trace.traceId);
  assert.equal(audit.requestId, requestId);
  assert.equal(result.knowledgeAuditHash, hash(audit));
  assert.equal(review.traceId, trace.traceId);
  assert.equal(review.requestId, requestId);
  assert.equal(review.knowledgeAuditHash, result.knowledgeAuditHash);
  assert.equal(result.personaReviewHash, hash(review));
  assert.equal(review.status, 'review');
  assert.ok(review.findings.some(finding => finding.code === 'UNIFORM_REACTION_DELAYS'));
  assert.match(review.limitation, /not a fidelity or clinical pass/);
  assert.deepEqual(audit.decisions.map(entry => entry.actorState), decisions.map(decision => decision.actorState));
  assert.deepEqual(audit.decisions.map(entry => entry.delayMs), decisions.map(decision => decision.delayMs));
  assert.deepEqual(trace.steps.filter(step => ['pause', 'lookAround', 'giveUp'].includes(step.type)).map(step => step.reactionDelayMs), Array(9).fill(450));
  assert.ok(trace.steps.filter(step => ['pause', 'lookAround'].includes(step.type)).every(step => step.durationMs === 1500));
});
test('new whole sessions reject compact timing before reserving an output directory', t => {
  assert.throws(() => fixture(t, { timingProfile: 'compact' }), /preserves actor judgment timing/);
});
test('a partially written persona review is removed and the attempt reports persistence failure', async t => {
  const { session, requestId, dir } = fixture(t);
  const originalOpen = fs.openSync, originalWrite = fs.writeFileSync;
  let reviewFd;
  t.mock.method(fs, 'openSync', (file, ...rest) => {
    const fd = originalOpen(file, ...rest);
    if (String(file).endsWith('.persona-review.json')) reviewFd = fd;
    return fd;
  });
  t.mock.method(fs, 'writeFileSync', (file, ...rest) => {
    if (file === reviewFd) {
      originalWrite(file, '{"partial":');
      throw Object.assign(new Error('Fixture partial review failure'), { code: 'ENOSPC' });
    }
    return originalWrite(file, ...rest);
  });
  const result = await session.submit(input(requestId, [d('giveUp')]));
  assert.equal(result.status, 'failed');
  assert.equal(result.stage, 'persistence');
  for (const suffix of ['', '.snapshot.json', '.knowledge-audit.json', '.persona-review.json'])
    assert.equal(fs.existsSync(path.join(dir, `trace.json${suffix}`)), false);
  const journal = JSON.parse(fs.readFileSync(path.join(result.diagnosticDirectory, 'attempt-1.generation/status.json'), 'utf8'));
  assert.equal(journal.state, 'failed');
});
test('a late session status failure cannot leave a completed attempt for a removed trace', async t => {
  const { session, requestId, dir } = fixture(t);
  const originalWrite = fs.writeFileSync;
  let writes = 0;
  t.mock.method(fs, 'writeFileSync', (file, ...rest) => {
    if (String(file).endsWith('status.partial.json') && ++writes === 2)
      throw Object.assign(new Error('Fixture final status failure'), { code: 'ENOSPC' });
    return originalWrite(file, ...rest);
  });
  const result = await session.submit(input(requestId, [d('giveUp')]));
  assert.equal(result.status, 'failed');
  assert.equal(result.stage, 'persistence');
  assert.equal(result.candidateVersion, '3');
  assert.equal(result.actionBinding, 'explicit-legacy-v3');
  assert.equal(fs.existsSync(path.join(dir, 'trace.json')), false);
  const journal = JSON.parse(fs.readFileSync(path.join(result.diagnosticDirectory, 'attempt-1.generation/status.json'), 'utf8'));
  assert.equal(journal.state, 'failed');
  const status = JSON.parse(fs.readFileSync(path.join(result.diagnosticDirectory, 'status.json'), 'utf8'));
  assert.equal(status.status, 'failed');
});
test('a failed journal completion is downgraded to persistence failure with no replay output', async t => {
  const { session, requestId, dir } = fixture(t);
  const originalOpen = fs.openSync, originalWrite = fs.writeFileSync;
  const journalFds = new Set();
  let failed = false;
  t.mock.method(fs, 'openSync', (file, ...rest) => {
    const fd = originalOpen(file, ...rest);
    if (String(file).endsWith('attempt-1.generation/status.json.partial')) journalFds.add(fd);
    else journalFds.delete(fd);
    return fd;
  });
  t.mock.method(fs, 'writeFileSync', (file, ...rest) => {
    if (!failed && journalFds.has(file) && String(rest[0]).includes('"state": "complete"')) {
      failed = true;
      originalWrite(file, '{"partial":');
      throw Object.assign(new Error('Fixture journal completion failure'), { code: 'ENOSPC' });
    }
    return originalWrite(file, ...rest);
  });
  const result = await session.submit(input(requestId, [d('giveUp')]));
  assert.equal(result.status, 'failed');
  assert.equal(result.stage, 'persistence');
  assert.equal(fs.existsSync(path.join(dir, 'trace.json')), false);
  const journal = JSON.parse(fs.readFileSync(path.join(result.diagnosticDirectory, 'attempt-1.generation/status.json'), 'utf8'));
  assert.equal(journal.state, 'failed');
});
