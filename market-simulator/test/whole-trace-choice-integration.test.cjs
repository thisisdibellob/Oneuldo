const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTraceBundle.ts');
const { wholeTraceChoiceFrame } = require('../src/wholeTraceChoices.ts');
const { compileWholeTraceCandidate, WholeTraceCompileError } = require('../src/wholeTraceCompiler.ts');
const { WholeTraceSession } = require('../src/wholeTraceSession.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');

// These are authored transport fixtures, not native actor outputs or clinical samples.
function fixture(near) {
  const config = { seed: 'state-choice-integration', stockPerProduct: 5, environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  if (near) environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'state-choice-integration',
    timingProfile: 'original', maxActions: 100, llm: { model: 'gpt-6-luna', maxCalls: 1 } };
  const bundle = buildWholeTraceBundle(settings, 'state-choice-integration-request');
  return { settings, bundle };
}
function decision(source, choiceId, options = {}) {
  return { choiceRef: { source: structuredClone(source), choiceId, ...(options.quantity === undefined ? {} : { quantity: options.quantity }) },
    delayMs: options.delayMs ?? 850, reason: options.reason ?? '현재 화면의 조작을 선택하는 전송 테스트',
    basis: { intent: options.intent ?? 'check', ...(options.cueRefs === undefined ? {} : { cueRefs: options.cueRefs }) },
    actorState: { activity: options.activity ?? 'check', task: '현재 화면의 조작을 확인한다', heldGoalIds: options.heldGoalIds ?? [],
      uncertainGoalIds: [], orientation: 'unfamiliar', ...(options.triggerCueRefs === undefined ? {} : { triggerCueRefs: options.triggerCueRefs }) } };
}
const candidate = (bundle, decisions) => ({ candidateVersion: '4', requestId: bundle.requestId, decisions });
const focusedCandidate = (bundle, decisions) => ({ candidateVersion: '5', requestId: bundle.requestId,
  decisions: decisions.map(wire => ({ ...structuredClone(wire), actorState: { ...structuredClone(wire.actorState), focusedGoalId: null, focusedProductId: null } })) });
const checkoutSource = initial => ({ ...initial, phase: 'checkout', view: 'world', activeStation: 'checkout', pageIndex: null });
const quit = source => decision(source, 'control/giveUp', { activity: 'finish', intent: 'finish', delayMs: 1100 });
function guardFor(settings, bundle) { return new TraceGuard(settings.snapshot, bundle.persona.id, bundle.persona.version, 'authored-integration-fixture', true); }

test('v4 staffed checkout submits unchanged empty basket naturally, preserving actor delays without system completion', async () => {
  const { settings, bundle } = fixture('checkout'), initial = bundle.initialChoiceFrame.source;
  assert.ok(bundle.initialChoiceFrame.availableChoices.some(choice => choice.choiceId === 'checkout/checkout'));
  const plan = candidate(bundle, [decision(initial, 'checkout/checkout', { intent: 'finish', activity: 'finish', delayMs: 1370 }),
    decision(checkoutSource(initial), 'control/submit', { intent: 'finish', activity: 'finish', delayMs: 2190 })]);
  const result = await compileWholeTraceCandidate(settings, bundle, plan);
  assert.equal(result.acceptedActions, 2);
  assert.equal(result.trace.generation.systemCompletion, undefined);
  assert.deepEqual(result.knowledgeAudit.map(entry => entry.delayMs), [1370, 2190]);
  assert.equal(result.trace.steps.find(step => step.type === 'checkout').reactionDelayMs, 1370);
  assert.equal(result.trace.steps.find(step => step.type === 'submitForReview').reactionDelayMs, 2190);
  assert.deepEqual(result.trace.steps.slice(-3).map(step => step.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});

test('v7 checkout alias completes one whole plan locally and audits authored and resolved references', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Checkout reference binding must not call a model or app'); });
  const { settings, bundle } = fixture('checkout'), initial = bundle.initialChoiceFrame.source;
  const plan = focusedCandidate(bundle, [
    decision(initial, 'open/checkout', { intent: 'finish', activity: 'finish', delayMs: 2400, reason: '이 계산대를 이용한다' }),
    decision(checkoutSource(initial), 'control/submit', { intent: 'finish', activity: 'finish', delayMs: 1900, reason: '장바구니를 제출한다' }),
  ]);
  plan.candidateVersion = '7';
  for (const d of plan.decisions) Object.assign(d.basis, { goalId: null, memoryUses: [] });
  const original = structuredClone(plan);
  const result = await compileWholeTraceCandidate(settings, bundle, plan);
  assert.deepEqual(plan, original);
  assert.equal(result.acceptedActions, 2);
  assert.equal(globalThis.fetch.mock.calls.length, 0);
  assert.equal(result.trace.generation.systemCompletion, undefined);
  assert.deepEqual(result.knowledgeAudit.map(entry => entry.delayMs), [2400, 1900]);
  assert.deepEqual(result.knowledgeAudit.map(entry => entry.reason), plan.decisions.map(d => d.reason));
  const audit = result.knowledgeAudit[0].choiceResolution;
  assert.deepEqual(audit.choiceRef, plan.decisions[0].choiceRef);
  assert.deepEqual(audit.resolvedChoiceRef, { ...plan.decisions[0].choiceRef, choiceId: 'checkout/checkout' });
  assert.deepEqual(audit.normalization, { kind: 'checkout-open-v1', authoredChoiceId: 'open/checkout', canonicalChoiceId: 'checkout/checkout' });
  assert.equal(result.knowledgeAudit[1].choiceResolution.normalization, undefined);
  assert.deepEqual(result.knowledgeAudit[1].choiceResolution.resolvedChoiceRef, plan.decisions[1].choiceRef);
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
  const canonical = structuredClone(plan);
  canonical.decisions[0].choiceRef.choiceId = 'checkout/checkout';
  const exact = await compileWholeTraceCandidate(settings, bundle, canonical);
  assert.deepEqual(result.trace.steps, exact.trace.steps, 'Binding the same checkout preserves every executable step');
});

test('v4 accepted local walk updates its source location and retains guarded actual movement at most 32px', async () => {
  const { settings, bundle } = fixture(), initial = bundle.initialChoiceFrame.source;
  const walk = bundle.initialChoiceFrame.availableChoices.find(choice => choice.action.type === 'walk'); assert.ok(walk);
  const afterWalk = { ...initial, location: walk.action.waypointId };
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, [
    decision(initial, walk.choiceId, { activity: 'orient', intent: 'explore', delayMs: 1610 }),
    decision(afterWalk, 'control/pause', { activity: 'rest', intent: 'rest', delayMs: 1220 }), quit(afterWalk),
  ]));
  assert.deepEqual(result.knowledgeAudit.map(entry => entry.choiceResolution.source.location), ['start', walk.action.waypointId, walk.action.waypointId]);
  const guard = guardFor(settings, bundle), moves = [];
  for (const step of result.trace.steps) moves.push(...guard.execute(step).actions.filter(action => action.type === 'move'));
  assert.ok(moves.length > 1);
  assert.ok(moves.every(action => Math.hypot(action.dx, action.dy) <= 32));
  assert.equal(result.trace.steps.find(step => step.type === 'walkToAnchor').reactionDelayMs, 1610);
});

test('wrong-source and nonlocal failures return exact accepted frame, immutable prefix and a current legal choice menu', async () => {
  const { settings, bundle } = fixture(), initial = bundle.initialChoiceFrame.source;
  const walk = bundle.initialChoiceFrame.availableChoices.find(choice => choice.action.type === 'walk'); assert.ok(walk);
  const prefix = decision(initial, walk.choiceId, { activity: 'orient', intent: 'explore' });
  const afterWalk = { ...initial, location: walk.action.waypointId };
  const state = bundle.choiceCatalog.navigation.find(state => state.navigationStateId === initial.navigationStateId);
  const menu = state.locations.find(location => location.location === afterWalk.location);
  const nonlocal = bundle.choiceCatalog.entries.find(choice => choice.action.type === 'walk' && !menu.choiceIds.includes(choice.choiceId)); assert.ok(nonlocal);
  for (const [bad, code] of [[decision(initial, 'control/pause'), 'CHOICE_SOURCE_MISMATCH'], [decision(afterWalk, nonlocal.choiceId), 'CHOICE_NOT_AVAILABLE']]) {
    await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(bundle, [prefix, bad, quit(afterWalk)])), error => {
      assert.ok(error instanceof WholeTraceCompileError);
      assert.equal(error.validation.code, code);
      assert.equal(error.validation.acceptedPrefixLength, 1);
      assert.deepEqual(error.validation.acceptedFrame, { location: afterWalk.location, navigationStateId: afterWalk.navigationStateId });
      assert.deepEqual(error.validation.validPrefix, [prefix]);
      assert.deepEqual(error.validation.choiceFrame.source, afterWalk);
      assert.ok(error.validation.choiceFrame.availableChoices.some(choice => choice.choiceId === 'control/pause'));
      assert.equal(error.validation.choiceFrame.availableChoices.some(choice => choice.choiceId === nonlocal.choiceId), false);
      return true;
    });
  }
});

test('holding a hidden goal before list reading fails, while a real read supplies canonical objective links for subsequent state', async () => {
  const { settings, bundle } = fixture(), initial = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0].id;
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(bundle, [
    decision(initial, 'control/readList', { heldGoalIds: [goal] }), quit(initial),
  ])), error => error.validation.code === 'ACTOR_STATE' && error.validation.acceptedPrefixLength === 0
    && error.validation.errors.some(message => message.includes('unread objective')));
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, [
    decision(initial, 'control/readList', { delayMs: 1520 }),
    decision(initial, 'control/pause', { heldGoalIds: [goal], activity: 'shop', intent: 'task', delayMs: 1230 }), quit(initial),
  ]));
  assert.equal(result.knowledgeAudit[0].choiceResolution.derivedCueRefs.includes(`objective:${goal}`), false);
  assert.ok(result.knowledgeAudit[1].choiceResolution.derivedCueRefs.includes(`objective:${goal}`));
  assert.ok(result.knowledgeAudit[1].actorState.triggerCueRefs.includes(`objective:${goal}`));
  assert.deepEqual(result.knowledgeAudit[1].choiceResolution.declaredTriggerCueRefs, []);
});

test('cart button controls do not expose unopened cart contents, which become known only after the real view action', async () => {
  const { settings, bundle } = fixture(), initial = bundle.initialChoiceFrame.source;
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(bundle, [
    decision(initial, 'control/viewCart', { cueRefs: ['cart'] }), quit(initial),
  ])), error => error.validation.code === 'KNOWLEDGE_BASIS' && error.validation.acceptedPrefixLength === 0
    && error.validation.errors.some(message => /Unobserved.*cart/.test(message)));
  const cartSource = { ...initial, view: 'cart' };
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, [
    decision(initial, 'control/viewCart'), decision(cartSource, 'control/closeView', { cueRefs: ['cart'], delayMs: 1230 }), quit(initial),
  ]));
  assert.ok(result.knowledgeAudit[0].basis.cueRefs.includes('control:viewCart'));
  assert.equal(result.knowledgeAudit[0].knowledge.cues.some(cue => cue.cueRef === 'cart'), false);
  assert.ok(result.knowledgeAudit[1].knowledge.cues.some(cue => cue.cueRef === 'cart'));
  assert.ok(result.knowledgeAudit[1].choiceResolution.declaredBasisCueRefs.includes('cart'));
});

test('compiler-derived held-goal proof cannot silently clear interest-to-shopping recovery warnings', async () => {
  const { settings, bundle } = fixture(), initial = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0].id;
  const prefix = [decision(initial, 'control/readList', { delayMs: 1650 }),
    decision(initial, 'control/pause', { heldGoalIds: [goal], activity: 'interest', intent: 'interest', delayMs: 1890 })];
  const withoutRecall = decision(initial, 'control/pause', { heldGoalIds: [goal], activity: 'shop', intent: 'task', delayMs: 1270 });
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, [...prefix, withoutRecall, quit(initial)]));
  assert.ok(result.knowledgeAudit[2].actorState.triggerCueRefs.includes(`objective:${goal}`));
  assert.deepEqual(result.knowledgeAudit[2].choiceResolution.declaredTriggerCueRefs, []);
  assert.ok(result.personaReview.findings.some(finding => finding.code === 'INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY'));
  const withRecall = structuredClone(withoutRecall); withRecall.actorState.triggerCueRefs = [`objective:${goal}`];
  const recalled = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, [...prefix, withRecall, quit(initial)]));
  assert.equal(recalled.personaReview.findings.some(finding => finding.code === 'INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY'), false);
});

function sessionFixture(t) {
  const { settings } = fixture('checkout'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'choice-suffix-integration-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const session = new WholeTraceSession({ ...settings, maxRepairs: 1, outputPath: path.join(directory, 'trace.json') });
  const { bundle } = session.prepare();
  return { session, bundle };
}
function brokenCheckoutCandidate(bundle) {
  const initial = bundle.initialChoiceFrame.source;
  const prefix = decision(initial, 'control/pause', { activity: 'rest', intent: 'rest', delayMs: 1430 });
  return candidate(bundle, [prefix,
    decision({ ...initial, view: 'cart' }, 'checkout/checkout', { activity: 'finish', intent: 'finish', delayMs: 1790 }),
    decision(checkoutSource(initial), 'control/submit', { activity: 'finish', intent: 'finish', delayMs: 2220 })]);
}
test('v4 suffix repair preserves the original accepted prefix and submit ending while correcting only the failed suffix', async t => {
  const { session, bundle } = sessionFixture(t), original = brokenCheckoutCandidate(bundle), initial = bundle.initialChoiceFrame.source;
  const failed = await session.submit(original);
  assert.equal(failed.status, 'invalid'); assert.equal(failed.validation.code, 'CHOICE_SOURCE_MISMATCH');
  assert.equal(failed.validation.acceptedPrefixLength, 1); assert.equal(failed.repairContext.originalCandidateVersion, '4');
  assert.deepEqual(failed.repairContext.choiceFrame.source, initial);
  const suffix = [decision(initial, 'checkout/checkout', { activity: 'finish', intent: 'finish', delayMs: 1790 }), original.decisions[2]];
  const fixed = await session.submitRepair({ repairVersion: '1', requestId: bundle.requestId, baseAttempt: 1,
    fromDecisionIndex: 1, candidateVersion: '4', decisions: suffix });
  assert.equal(fixed.status, 'complete'); assert.equal(fixed.candidateVersion, '4');
  assert.equal(fixed.systemCompletion, null); assert.equal(fixed.appExecuted, false);
  const assembled = JSON.parse(fs.readFileSync(path.join(fixed.diagnosticDirectory, 'attempt-2.candidate.json'), 'utf8'));
  assert.deepEqual(assembled.decisions[0], original.decisions[0]);
  assert.equal(assembled.decisions.at(-1).choiceRef.choiceId, 'control/submit');
  assert.equal(fixed.metrics.repairSubmissions, 1);
});
test('v4 suffix repair cannot change an original submit ending into technical give-up', async t => {
  const { session, bundle } = sessionFixture(t), initial = bundle.initialChoiceFrame.source;
  const failed = await session.submit(brokenCheckoutCandidate(bundle)); assert.equal(failed.status, 'invalid');
  const bypass = await session.submitRepair({ repairVersion: '1', requestId: bundle.requestId, baseAttempt: 1,
    fromDecisionIndex: 1, candidateVersion: '4', decisions: [quit(initial)] });
  assert.equal(bypass.status, 'invalid'); assert.equal(bypass.validation.code, 'REPAIR_CHANGED_ENDING');
  assert.equal(bypass.completeTrace, false); assert.equal(bypass.appExecuted, false);
});

test('v5 compile and suffix repair preserve required nullable focus and emit focused wire audit provenance', async t => {
  const { session, bundle } = sessionFixture(t), initial = bundle.initialChoiceFrame.source;
  const wrongSource = { ...initial, view: 'cart' };
  const original = focusedCandidate(bundle, [
    decision(wrongSource, 'checkout/checkout', { activity: 'finish', intent: 'finish' }),
    decision(checkoutSource(initial), 'control/submit', { activity: 'finish', intent: 'finish' }),
  ]);
  const failed = await session.submit(original);
  assert.equal(failed.status, 'invalid'); assert.equal(failed.candidateVersion, '5');
  assert.equal(failed.validation.code, 'CHOICE_SOURCE_MISMATCH');
  const repaired = await session.submitRepair({ repairVersion: '1', requestId: bundle.requestId, baseAttempt: 1,
    fromDecisionIndex: 0, candidateVersion: '5', decisions: focusedCandidate(bundle, [
      decision(initial, 'checkout/checkout', { activity: 'finish', intent: 'finish' }),
      decision(checkoutSource(initial), 'control/submit', { activity: 'finish', intent: 'finish' }),
    ]).decisions });
  assert.equal(repaired.status, 'complete'); assert.equal(repaired.candidateVersion, '5');
  assert.equal(repaired.actionBinding, 'state-bound-choice-v1');
  const audit = JSON.parse(fs.readFileSync(`${repaired.outputPath}.knowledge-audit.json`, 'utf8'));
  assert.equal(audit.auditVersion, '4'); assert.equal(audit.candidateVersion, '5');
  assert.equal(audit.actionBinding, 'state-bound-choice-v1'); assert.equal(audit.focusContract, 'explicit-focus-v1');
  assert.ok(audit.decisions.every(entry => entry.actorState.focusedGoalId === null && entry.actorState.focusedProductId === null));
});

function maximalDeclaredRefs(bundle) {
  const profiles = bundle.actorState.knowledge.profileCueRefs;
  assert.ok(profiles.length >= 23, 'The real selected profile supplies enough known declared cues');
  const basis = [...profiles.slice(0, 23), 'view:world'];
  const triggers = profiles.slice(0, 12);
  assert.equal(new Set(basis).size, 24); assert.equal(new Set(triggers).size, 12);
  return { basis, triggers };
}
test('v4 composition preserves all 24 known basis and 12 known trigger declarations plus generated controls and read-goal proofs', async () => {
  const { settings, bundle } = fixture(), initial = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0].id;
  const explicit = maximalDeclaredRefs(bundle);
  const selected = decision(initial, 'control/pause', { heldGoalIds: [goal], activity: 'shop', intent: 'task',
    cueRefs: explicit.basis, triggerCueRefs: explicit.triggers, delayMs: 1570 });
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(bundle, [
    decision(initial, 'control/readList'), selected, quit(initial),
  ]));
  const accepted = result.knowledgeAudit[1];
  assert.equal(accepted.basis.cueRefs.length, 26);
  assert.equal(accepted.actorState.triggerCueRefs.length, 14);
  for (const reference of explicit.basis) assert.ok(accepted.basis.cueRefs.includes(reference));
  for (const reference of explicit.triggers) assert.ok(accepted.actorState.triggerCueRefs.includes(reference));
  for (const reference of ['control:pause', `objective:${goal}`]) {
    assert.ok(accepted.basis.cueRefs.includes(reference));
    assert.ok(accepted.actorState.triggerCueRefs.includes(reference));
  }
  assert.deepEqual(accepted.choiceResolution.declaredBasisCueRefs, explicit.basis);
  assert.deepEqual(accepted.choiceResolution.declaredTriggerCueRefs, explicit.triggers);
  // Defaults still represent the old wire bounds, rather than silently relaxing all callers.
  const { validateWholeTraceBasis } = require('../src/wholeTraceKnowledge.ts');
  const { validateWholeTraceActorState } = require('../src/wholeTraceActorState.ts');
  assert.equal(validateWholeTraceBasis(accepted.basis).valid, false);
  assert.equal(validateWholeTraceActorState(accepted.actorState).valid, false);
  assert.equal(result.acceptedActions, 3);
});
test('v4 explicit over-limit references and legacy v3 over-limit references remain strict schema failures', async () => {
  const { settings, bundle } = fixture(), initial = bundle.initialChoiceFrame.source;
  const explicit = maximalDeclaredRefs(bundle);
  const extraBasis = bundle.actorState.knowledge.cues.map(cue => cue.cueRef).find(ref => !explicit.basis.includes(ref));
  const extraTrigger = bundle.actorState.knowledge.cues.map(cue => cue.cueRef).find(ref => !explicit.triggers.includes(ref));
  assert.ok(extraBasis); assert.ok(extraTrigger);
  for (const [cueRefs, triggerCueRefs] of [[explicit.basis.concat(extraBasis), explicit.triggers], [explicit.basis, explicit.triggers.concat(extraTrigger)]]) {
    const wire = decision(initial, 'control/giveUp', { cueRefs, triggerCueRefs, activity: 'finish', intent: 'finish' });
    await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(bundle, [wire])), error => error.validation.code === 'CANDIDATE_SCHEMA');
    const legacy = { candidateVersion: '3', requestId: bundle.requestId, decisions: [{
      action: { type: 'giveUp' }, delayMs: wire.delayMs, reason: wire.reason, basis: { intent: 'finish', cueRefs }, actorState: wire.actorState,
    }] };
    await assert.rejects(compileWholeTraceCandidate(settings, bundle, legacy), error => error.validation.code === 'CANDIDATE_SCHEMA');
  }
});
test('larger canonical proof bounds never filter or admit unknown explicit basis and trigger references', async () => {
  const { settings, bundle } = fixture(), initial = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0].id;
  const explicit = maximalDeclaredRefs(bundle);
  for (const [field, code] of [['basis', 'KNOWLEDGE_BASIS'], ['triggers', 'ACTOR_STATE']]) {
    const cueRefs = [...explicit.basis], triggerCueRefs = [...explicit.triggers];
    if (field === 'basis') cueRefs[0] = 'product:unseen-transport-fixture';
    else triggerCueRefs[0] = 'anchor:unseen-transport-fixture';
    const selected = decision(initial, 'control/pause', { cueRefs, triggerCueRefs, heldGoalIds: [goal], activity: 'shop', intent: 'task' });
    await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(bundle, [
      decision(initial, 'control/readList'), selected, quit(initial),
    ])), error => error.validation.code === code && error.validation.acceptedPrefixLength === 1
      && error.validation.errors.some(message => /(?:Unobserved|unobserved)/.test(message)));
  }
});
