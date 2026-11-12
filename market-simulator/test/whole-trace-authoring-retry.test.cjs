const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { WholeTraceSession } = require('../src/wholeTrace/wholeTraceSession.ts');

// Actor-authored regression inputs run against the actual prepared game. They
// are neither recovered pilot candidates nor automatically repaired decisions.
function fixture(near) {
  const config = { seed: 'authoring-retry', stockPerProduct: 5,
    objectives: [{ productId: 'milk', quantity: 2 }], environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  if (near) environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'authoring-retry',
    maxActions: 100, maxRepairs: 0, timingProfile: 'original' };
  return { settings, bundle: buildWholeTraceBundle(settings, 'authoring-retry-request') };
}
function draft(choiceId, { held = [], intent = 'explore', goal = null, uses = [], taskUpdate,
  focusedGoalId = null } = {}) {
  return { choiceRef: { choiceId }, delayMs: 850, reason: '작성한 결정의 기술적 재제출을 확인한다',
    basis: { intent, goalId: goal?.id ?? null, memoryUses: uses },
    actorState: { activity: intent === 'task' ? 'shop' : intent === 'recover' ? 'recover'
      : intent === 'finish' ? 'finish' : 'orient', task: '작성자가 정한 행동을 수행한다',
      heldGoalIds: held, uncertainGoalIds: [], focusedGoalId, focusedProductId: null, orientation: 'unfamiliar',
      ...(taskUpdate ? { taskUpdate } : {}) } };
}
const use = (goal, mode = 'remembered') => ({ goalId: goal.id, field: 'name', mode, value: goal.label });
async function openTask(cursor, goal) {
  assert.equal((await cursor.append(draft('control/readList'))).accepted, true);
  assert.equal((await cursor.append(draft('control/pause', { goal, intent: 'task', held: [goal.id],
    focusedGoalId: goal.id, uses: [use(goal, 'current-display')],
    taskUpdate: [{ type: 'select', goalId: goal.id }] }))).accepted, true);
}
function sessionFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-authoring-retry-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { settings } = fixture();
  return new WholeTraceSession({ ...settings, outputPath: path.join(directory, 'trace.json') });
}

test('02: recover with no goal rejects only that decision, then an authored retry passes and keeps first-attempt metrics', async () => {
  const { settings, bundle } = fixture(), goal = bundle.worldReference.objectives[0];
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  await openTask(cursor, goal);
  assert.equal((await cursor.append(draft('control/viewHelp', { held: [goal.id], intent: 'help' }))).accepted, true);
  const before = await cursor.menu();
  const invalid = draft('control/closeView', { held: [goal.id], intent: 'recover' }), original = structuredClone(invalid);
  const rejected = await cursor.append(invalid);
  assert.equal(rejected.accepted, false); assert.equal(rejected.canRetry, true);
  assert.equal(rejected.decisionIndex, 3); assert.equal(rejected.decisionNumber, 4);
  assert.equal(rejected.rewrite.status, 'awaiting-rewrite');
  assert.equal(rejected.rewrite.acceptedDecisionCount, 3); assert.equal(rejected.rewrite.remainingRewrites, 3);
  assert.ok(rejected.issues.some(issue => issue.path === 'basis.goalId' && issue.rule === 'bound_intent_requires_goal'));
  assert.equal(rejected.menu.decisionCount, 3);
  assert.deepEqual(rejected.menu.expectedSource, before.expectedSource);
  assert.deepEqual(rejected.menu.advisory, before.advisory, 'A rejected draft does not change computed memory or knowledge');
  assert.deepEqual(invalid, original, 'The aid never replaces recover, fills a goal, or changes actor state');
  const corrected = draft('control/closeView', { held: [goal.id], intent: 'recover', goal,
    focusedGoalId: goal.id, uses: [use(goal)] });
  const correctedCopy = structuredClone(corrected), accepted = await cursor.append(corrected);
  assert.equal(accepted.accepted, true); assert.equal(accepted.decisionIndex, 3);
  assert.deepEqual(corrected, correctedCopy);
  assert.equal(accepted.menu.expectedSource.view, 'world');
  assert.equal((await cursor.append(draft('control/giveUp', { held: [goal.id], intent: 'finish' }))).accepted, true);
  const candidate = cursor.finish(), metrics = cursor.metrics();
  assert.equal(candidate.decisions.length, 5);
  assert.deepEqual(candidate.decisions.map(decision => decision.choiceRef.choiceId),
    ['control/readList', 'control/pause', 'control/viewHelp', 'control/closeView', 'control/giveUp']);
  assert.equal(metrics.failed, false); assert.equal(metrics.maxRewritesPerDecision, 3);
  const retried = metrics.decisions[3];
  assert.equal(retried.attempts, 2); assert.equal(retried.rewriteCount, 1);
  assert.equal(retried.firstAttemptPassed, false); assert.equal(retried.accepted, true);
  assert.ok(retried.rejectedRules.includes('bound_intent_requires_goal'));
  assert.equal(metrics.attemptedDecisionCount, 5); assert.equal(metrics.firstAttemptPassCount, 4);
  assert.equal(metrics.firstAttemptAccuracy, 4 / 5);
  for (const row of metrics.decisions.filter(row => row.decisionIndex !== 3)) {
    assert.equal(row.firstAttemptPassed, true); assert.equal(row.rewriteCount, 0);
    assert.deepEqual(row.rejectedRules, []);
  }
  const compiled = await compileWholeTraceCandidate(settings, bundle, candidate);
  assert.equal(compiled.acceptedActions, 5, 'The corrected prefix still passes the original complete compiler');
  metrics.decisions[3].rejectedRules.splice(0);
  assert.ok(cursor.metrics().decisions[3].rejectedRules.includes('bound_intent_requires_goal'));
});

test('04: W072 to unavailable W098 keeps the exact menu and accepts the authored W083 then W098 hops', async () => {
  const { settings, bundle: originalBundle } = fixture();
  // Opaque IDs vary with the fixture layout. Rename two IDs only, preserving
  // every real anchor/edge so this reproduces W072 -> W083 -> W098 exactly.
  const replacements = { W085: 'W098', W098: 'W085', 'walk/W085': 'walk/W098', 'walk/W098': 'walk/W085' };
  const bundle = JSON.parse(JSON.stringify(originalBundle, (_key, value) =>
    typeof value === 'string' && Object.hasOwn(replacements, value) ? replacements[value] : value));
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  assert.equal((await cursor.append(draft('walk/W072'))).accepted, true);
  const before = await cursor.menu();
  assert.ok(before.allowedWaypointIds.includes('W083'));
  assert.equal(before.allowedWaypointIds.includes('W098'), false);
  const invalid = draft('walk/W098'), original = structuredClone(invalid);
  const rejected = await cursor.append(invalid);
  assert.equal(rejected.accepted, false); assert.equal(rejected.canRetry, true);
  assert.equal(rejected.code, 'AUTHORING_CHOICE_NOT_AVAILABLE');
  assert.equal(rejected.decisionIndex, 1);
  assert.deepEqual(rejected.menu.allowedWaypointIds, before.allowedWaypointIds);
  assert.deepEqual(rejected.menu.choiceIds, before.choiceIds);
  assert.deepEqual(rejected.menu.expectedSource, before.expectedSource);
  assert.equal(rejected.menu.decisionCount, 1);
  assert.deepEqual(invalid, original, 'No intermediate hop is inserted into a rejected draft');
  assert.equal((await cursor.append(draft('walk/W083'))).accepted, true);
  assert.equal((await cursor.append(draft('walk/W098'))).accepted, true);
  assert.equal((await cursor.append(draft('control/giveUp', { intent: 'finish' }))).accepted, true);
  const candidate = cursor.finish();
  assert.deepEqual(candidate.decisions.map(decision => decision.choiceRef.choiceId),
    ['walk/W072', 'walk/W083', 'walk/W098', 'control/giveUp']);
  const row = cursor.metrics().decisions[1];
  assert.equal(row.rewriteCount, 1); assert.equal(row.firstAttemptPassed, false);
  assert.ok(row.rejectedRules.length, 'Choice rejection has a rule name independent of success on retry');
  assert.equal((await compileWholeTraceCandidate(settings, bundle, candidate)).acceptedActions, 4);
});

test('07: readList after the twentieth shelf action awaits a rewrite of decision 21 without ending the request', async () => {
  const { settings, bundle } = fixture('fresh');
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle), acceptedPrefix = [];
  const append = async input => {
    const result = await cursor.append(input);
    assert.equal(result.accepted, true, JSON.stringify(result.issues));
    acceptedPrefix.push(result.decision);
    return result;
  };
  await append(draft('open/fresh'));
  for (let i = 0; i < 18; i++) await append(draft('control/pause'));
  const purchase = draft('add/milk', { intent: 'interest' });
  purchase.choiceRef.quantity = 1; purchase.actorState.activity = 'interest';
  await append(purchase);
  const before = await cursor.menu(), prefix = structuredClone(acceptedPrefix);
  assert.equal(before.decisionCount, 20);
  assert.equal(before.expectedSource.view, 'world'); assert.equal(before.expectedSource.activeStation, 'fresh');
  assert.equal(before.interactionContext.kind, 'shelf');
  assert.equal(before.choiceIds.includes('control/readList'), false);
  assert.ok(before.choiceIds.includes('control/closeStation'));
  const invalid = draft('control/readList', { intent: 'check' }), original = structuredClone(invalid);
  const rejected = await cursor.append(invalid);
  assert.equal(rejected.accepted, false); assert.equal(rejected.code, 'AUTHORING_CHOICE_NOT_AVAILABLE');
  assert.equal(rejected.canRetry, true);
  assert.deepEqual(rejected.rewrite, { status: 'awaiting-rewrite', decisionIndex: 20, decisionNumber: 21,
    acceptedDecisionCount: 20, remainingRewrites: 3, message: rejected.rewrite.message });
  assert.match(rejected.rewrite.message, /21번 결정/); assert.match(rejected.rewrite.message, /앞 20개 결정은 유지/);
  assert.match(rejected.rewrite.message, /같은 결정을 최대 3회/);
  assert.doesNotMatch(rejected.rewrite.message, /closeStation|readList/);
  assert.deepEqual(rejected.menu, before); assert.deepEqual(await cursor.menu(), before);
  assert.deepEqual(invalid, original);
  assert.equal(cursor.metrics().failed, false);
  const invalidCandidate = { candidateVersion: '7', requestId: bundle.requestId, decisions: [...prefix,
    { ...invalid, choiceRef: { ...invalid.choiceRef, source: before.expectedSource } },
    { ...draft('control/giveUp', { intent: 'finish' }), choiceRef: { choiceId: 'control/giveUp', source: before.expectedSource } }] };
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, invalidCandidate), error =>
    error.validation?.code === 'CHOICE_NOT_AVAILABLE' && error.validation.failedDecisionIndex === 20);
  // This correction is an explicit actor input, never a suggested or inserted action.
  const correction = draft('control/closeStation'), correctionCopy = structuredClone(correction);
  const corrected = await append(correction);
  assert.equal(corrected.decisionIndex, 20); assert.equal(corrected.decisionNumber, 21);
  assert.equal(corrected.menu.interactionContext.kind, 'world');
  assert.ok(corrected.menu.choiceIds.includes('control/readList'));
  assert.deepEqual(correction, correctionCopy);
  await append(draft('control/readList', { intent: 'check' }));
  // The unchanged task contract permits an explicit ending immediately after a list read.
  await append(draft('control/giveUp', { intent: 'finish' }));
  const candidate = cursor.finish();
  assert.deepEqual(candidate.decisions.slice(0, 20), prefix);
  assert.deepEqual(candidate.decisions.slice(20).map(decision => decision.choiceRef.choiceId),
    ['control/closeStation', 'control/readList', 'control/giveUp']);
  assert.equal(candidate.decisions[19].choiceRef.quantity, 1);
  assert.equal(cursor.metrics().decisions[20].attempts, 2);
  assert.equal(cursor.metrics().decisions[20].rewriteCount, 1);
  assert.equal(cursor.metrics().decisions[20].firstAttemptPassed, false);
  assert.equal((await compileWholeTraceCandidate(settings, bundle, candidate)).acceptedActions, 23);
});

test('the default allows exactly three rewrites and records the rejected rule when they are exhausted', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const invalid = draft('control/pause', { intent: 'recover' }), original = structuredClone(invalid);
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await cursor.append(invalid);
    assert.equal(result.accepted, false);
    assert.equal(result.canRetry, attempt < 3);
    assert.equal(result.decisionIndex, 0);
    assert.equal(result.rewrite.status, attempt < 3 ? 'awaiting-rewrite' : 'exhausted');
    assert.equal(result.rewrite.decisionIndex, 0); assert.equal(result.rewrite.decisionNumber, 1);
    assert.equal(result.rewrite.acceptedDecisionCount, 0); assert.equal(result.rewrite.remainingRewrites, 3 - attempt);
    assert.match(result.rewrite.message, attempt < 3 ? /같은 결정/ : /전체 작성 요청이 실패/);
    assert.ok(result.issues.some(issue => issue.rule === 'bound_intent_requires_goal'));
    assert.equal(result.menu.decisionCount, 0);
  }
  const metrics = cursor.metrics(), row = metrics.decisions[0];
  assert.equal(metrics.failed, true); assert.equal(row.attempts, 4); assert.equal(row.rewriteCount, 3);
  assert.equal(row.firstAttemptPassed, false); assert.equal(row.accepted, false);
  assert.ok(row.rejectedRules.includes('bound_intent_requires_goal'));
  assert.equal(metrics.firstAttemptPassCount, 0); assert.equal(metrics.firstAttemptAccuracy, 0);
  await assert.rejects(cursor.append(draft('control/giveUp', { intent: 'finish' })),
    error => error.code === 'AUTHORING_REWRITE_LIMIT');
  assert.equal(cursor.metrics().decisions[0].attempts, 4, 'A closed cursor does not create extra technical attempts');
  assert.throws(() => cursor.finish());
  assert.deepEqual(invalid, original);
});

test('the per-decision rewrite limit is configurable and is independent of complete-candidate maxRepairs', async () => {
  const { settings, bundle } = fixture();
  assert.equal(settings.maxRepairs, 0);
  for (const maxRewritesPerDecision of [0, 1]) {
    const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle, { maxRewritesPerDecision });
    const rejected = await cursor.append(draft('control/pause', { intent: 'recover' }));
    assert.equal(rejected.canRetry, maxRewritesPerDecision === 1);
    assert.equal(rejected.rewrite.status, maxRewritesPerDecision ? 'awaiting-rewrite' : 'exhausted');
    assert.equal(rejected.rewrite.remainingRewrites, maxRewritesPerDecision);
    if (maxRewritesPerDecision) {
      assert.equal((await cursor.append(draft('control/pause'))).accepted, true);
      assert.equal((await cursor.append(draft('control/giveUp', { intent: 'finish' }))).accepted, true);
      assert.equal(cursor.finish().decisions.length, 2);
      assert.equal(cursor.metrics().decisions[0].rewriteCount, 1);
    } else {
      assert.equal(cursor.metrics().failed, true);
      assert.throws(() => cursor.finish());
    }
    assert.equal(cursor.metrics().maxRewritesPerDecision, maxRewritesPerDecision);
  }
});

test('a rejected checkout-bound walk cannot become giveUp or submit even with the same finish intent', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const accepted = await cursor.append(draft('control/pause'));
  assert.equal(accepted.accepted, true);
  const before = await cursor.menu(), prefix = structuredClone(accepted.decision);
  const rejected = await cursor.append(draft('walk/unavailable', { intent: 'finish' }));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, 'AUTHORING_CHOICE_NOT_AVAILABLE');
  for (const choiceId of ['control/giveUp', 'control/submit']) {
    const input = draft(choiceId, { intent: 'finish' }), original = structuredClone(input);
    const changed = await cursor.append(input);
    assert.equal(changed.accepted, false);
    assert.equal(changed.code, 'AUTHORING_REWRITE_CHANGED_ENDING');
    assert.equal(changed.issues[0].path, 'choiceRef.choiceId');
    assert.equal(changed.metrics.decisions[1].originalEnding, 'nonterminal');
    assert.deepEqual(changed.menu, before);
    assert.deepEqual(input, original);
    assert.throws(() => cursor.finish(), error => error.code === 'AUTHORING_REWRITE_PENDING');
  }
  // Only the actor chooses a corrected reference; the guard inserts no route.
  const corrected = await cursor.append(draft(`walk/${before.allowedWaypointIds[0]}`, { intent: 'finish' }));
  assert.equal(corrected.accepted, true, JSON.stringify(corrected.issues));
  assert.equal(corrected.metrics.decisions[1].attempts, 4);
  assert.equal(corrected.metrics.failed, false);
  assert.equal((await cursor.append(draft('control/giveUp', { intent: 'finish' }))).accepted, true,
    'A new decision remains free to end voluntarily after the pending correction is resolved');
  const candidate = cursor.finish();
  assert.deepEqual(candidate.decisions[0], prefix);
  assert.equal(candidate.decisions[1].choiceRef.choiceId, `walk/${before.allowedWaypointIds[0]}`);
  assert.equal(candidate.decisions[2].choiceRef.choiceId, 'control/giveUp');
  assert.equal(cursor.metrics().rewriteContract, 'terminal-intent-preserved-v1');
  assert.equal((await compileWholeTraceCandidate(settings, bundle, candidate)).acceptedActions, 3);
});

test('schema repair preserves an originally chosen ending and cannot switch or remove it', async () => {
  for (const ending of ['giveUp', 'submit']) {
    const { settings, bundle } = fixture(ending === 'submit' ? 'checkout' : undefined);
    const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
    if (ending === 'submit') assert.equal((await cursor.append(draft('checkout/checkout', { intent: 'finish' }))).accepted, true);
    const correct = draft(`control/${ending}`, { intent: 'finish' }), malformed = structuredClone(correct);
    delete malformed.actorState.uncertainGoalIds;
    assert.equal((await cursor.append(malformed)).code, 'AUTHORING_SCHEMA');
    const before = await cursor.menu();
    for (const choiceId of [ending === 'submit' ? 'control/giveUp' : 'control/submit', 'control/pause']) {
      const rejected = await cursor.append(draft(choiceId, { intent: 'finish' }));
      assert.equal(rejected.accepted, false);
      assert.equal(rejected.code, 'AUTHORING_REWRITE_CHANGED_ENDING');
      assert.deepEqual(rejected.menu, before);
    }
    assert.equal((await cursor.append(correct)).accepted, true);
    assert.equal(cursor.finish().decisions.at(-1).choiceRef.choiceId, `control/${ending}`);
    assert.equal(cursor.metrics().decisions.at(-1).originalEnding, ending);
    await compileWholeTraceCandidate(settings, bundle, cursor.finish());
  }
});

test('unknown and malformed original choice references cannot acquire a terminal intent during repair', async () => {
  for (const choiceRef of [{}, null, { choiceId: 42 }, { choiceId: 'control/giveup' }]) {
    const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
    const malformed = { ...draft('control/pause'), choiceRef };
    assert.equal((await cursor.append(malformed)).accepted, false);
    const changed = await cursor.append(draft('control/giveUp', { intent: 'finish' }));
    assert.equal(changed.accepted, false);
    assert.equal(changed.code, 'AUTHORING_REWRITE_CHANGED_ENDING');
    assert.equal(changed.metrics.decisions[0].originalEnding, 'nonterminal');
    assert.equal((await cursor.append(draft('control/pause'))).accepted, true);
    assert.equal((await cursor.append(draft('control/giveUp', { intent: 'finish' }))).accepted, true);
  }
});

test('pending rewrite cannot be skipped with finish or direct submit, and an ending violation exhausts the existing budget', async t => {
  const session = sessionFixture(t), { bundle, diagnosticDirectory } = session.prepare();
  await session.beginAuthoring({ maxRewritesPerDecision: 1 });
  const first = await session.appendAuthoring(draft('control/pause'));
  assert.equal(first.accepted, true);
  assert.equal((await session.appendAuthoring(draft('walk/unavailable', { intent: 'finish' }))).accepted, false);
  assert.throws(() => session.finishAuthoring(), error => error.code === 'AUTHORING_REWRITE_PENDING');
  const bypass = { candidateVersion: '7', requestId: bundle.requestId, decisions: [first.decision,
    { ...draft('control/giveUp', { intent: 'finish' }),
      choiceRef: { choiceId: 'control/giveUp', source: first.menu.expectedSource } }] };
  await assert.rejects(session.submit(bypass), error => error.code === 'AUTHORING_REWRITE_PENDING');
  assert.equal(session.status().attempts, 0);
  const exhausted = await session.appendAuthoring(draft('control/giveUp', { intent: 'finish' }));
  assert.equal(exhausted.code, 'AUTHORING_REWRITE_CHANGED_ENDING');
  assert.equal(exhausted.canRetry, false); assert.equal(exhausted.rewrite.remainingRewrites, 0);
  assert.equal(session.status().status, 'failed');
  assert.equal(session.status().authoring.decisions[1].attempts, 2);
  await assert.rejects(session.submit(bypass), /closed/);
  assert.equal(fs.existsSync(diagnosticDirectory.replace(/\.whole-trace$/, '')), false);
  const events = fs.readFileSync(path.join(diagnosticDirectory, 'authoring.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 3);
  assert.equal(events.at(-1).code, 'AUTHORING_REWRITE_CHANGED_ENDING');
  assert.equal(events.at(-1).decision.choiceRef.choiceId, 'control/giveUp', 'Rejected actor input remains in the audit');
  assert.equal(events.at(-1).authoring.decisions[1].originalEnding, 'nonterminal');
});

test('a rejected extra append cannot reopen an accepted terminal candidate or block its exact submission', async t => {
  const session = sessionFixture(t);
  await session.beginAuthoring();
  assert.equal((await session.appendAuthoring(draft('control/giveUp', { intent: 'finish' }))).accepted, true);
  const original = session.finishAuthoring().candidate;
  const rejected = await session.appendAuthoring(draft('control/pause'));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, 'AUTHORING_TERMINAL');
  assert.equal(rejected.menu.terminal, true);
  assert.deepEqual(session.finishAuthoring().candidate, original);
  assert.equal((await session.submit(original)).status, 'complete');
});

test('invalid initialization can be corrected before any decision, while an initialized budget remains frozen', async t => {
  const session = sessionFixture(t);
  await assert.rejects(session.beginAuthoring({ maxRewritesPerDecision: -1 }), /nonnegative integer/);
  assert.equal(session.status().status, 'prepared'); assert.equal(session.status().authoring, undefined);
  const started = await session.beginAuthoring({ maxRewritesPerDecision: 1 });
  assert.equal(started.authoring.maxRewritesPerDecision, 1);
  assert.equal(started.authoring.attemptedDecisionCount, 0);
  await assert.rejects(session.beginAuthoring({ maxRewritesPerDecision: 3 }), /cannot be changed/);
  assert.equal(session.status().authoring.maxRewritesPerDecision, 1);
});

test('accepted authoring decisions cannot be replaced at complete-candidate submission', async t => {
  const session = sessionFixture(t);
  await session.beginAuthoring();
  assert.equal((await session.appendAuthoring(draft('control/giveUp', { intent: 'finish' }))).accepted, true);
  const { candidate } = session.finishAuthoring(), changed = structuredClone(candidate);
  changed.decisions[0].reason = '수락된 결정을 뒤에서 바꾸려는 입력';
  await assert.rejects(session.submit(changed), /exact finished authoring candidate/);
  assert.equal(session.status().attempts, 0); assert.equal(session.status().status, 'prepared');
  const result = await session.submit(candidate);
  assert.equal(result.status, 'complete'); assert.equal(result.metrics.planningSubmissions, 1);
  assert.equal(result.metrics.authoring.firstAttemptAccuracy, 1);
});

test('an unexpected authoring failure closes and journals the request without silently consuming an unrecorded retry', async t => {
  const session = sessionFixture(t);
  await session.beginAuthoring();
  const input = draft('control/pause'); let reads = 0;
  // Simulate a local caller/transport failure, not a rejected JSON declaration.
  Object.defineProperty(input, 'reason', { enumerable: true, get() {
    if (!reads++) throw new Error('fixture authoring transport failure');
    return '실패 기록을 확인하는 입력';
  } });
  await assert.rejects(session.appendAuthoring(input), error => error.code === 'AUTHORING_CHECK_FAILED');
  const status = session.status();
  assert.equal(status.status, 'failed'); assert.equal(status.attempts, 0);
  assert.equal(status.authoring.failed, true);
  assert.equal(status.authoring.decisions[0].attempts, 1);
  assert.deepEqual(status.authoring.decisions[0].rejectedRules, ['AUTHORING_CHECK_FAILED']);
  const events = fs.readFileSync(path.join(status.diagnosticDirectory, 'authoring.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 1); assert.equal(events[0].status, 'failed');
  assert.equal(events[0].code, 'AUTHORING_CHECK_FAILED');
  assert.deepEqual(events[0].authoring, status.authoring);
  const saved = JSON.parse(fs.readFileSync(path.join(status.diagnosticDirectory, 'status.json'), 'utf8'));
  assert.equal(saved.status, 'failed'); assert.deepEqual(saved.authoring, status.authoring);
  await assert.rejects(session.appendAuthoring(draft('control/giveUp', { intent: 'finish' })), /unsubmitted prepared request/);
  assert.equal(session.status().authoring.decisions[0].attempts, 1);
});

test('a concurrent append is rejected without closing the pending request or adding a retry', async t => {
  const session = sessionFixture(t);
  await session.beginAuthoring();
  const first = session.appendAuthoring(draft('control/pause'));
  await assert.rejects(session.appendAuthoring(draft('control/giveUp', { intent: 'finish' })),
    error => error.code === 'AUTHORING_BUSY');
  assert.equal((await first).accepted, true);
  assert.equal(session.status().status, 'prepared');
  assert.equal(session.status().authoring.attemptedDecisionCount, 1);
  assert.equal(session.status().authoring.decisions[0].attempts, 1);
  assert.equal((await session.appendAuthoring(draft('control/giveUp', { intent: 'finish' }))).accepted, true);
  assert.equal(session.finishAuthoring().candidate.decisions.length, 2);
});
