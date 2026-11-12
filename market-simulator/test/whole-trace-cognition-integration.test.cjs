const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { validateWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceContracts.ts');
const { WholeTraceSession } = require('../src/wholeTrace/wholeTraceSession.ts');
const { validateTrace } = require('../src/traceValidation.ts');

// Explicit transport/cognition fixtures, never presented as native Luna samples.
function fixture(near = 'fresh') {
  const config = { seed: 'cognition-integration', difficulty: 'exact', stockPerProduct: 5,
    objectives: [{ productId: 'milk', quantity: 2 }], environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'cognition-integration',
    timingProfile: 'original', maxActions: 100, llm: { model: 'gpt-6-luna', maxCalls: 1 } };
  return { settings, bundle: buildWholeTraceBundle(settings, 'cognition-integration-request') };
}
function d(source, choiceId, state = {}, uses = [], quantity) {
  return { choiceRef: { source: structuredClone(source), choiceId, ...(quantity === undefined ? {} : { quantity }) },
    delayMs: 850, reason: '기억 접근 계약을 확인하는 작성된 시험 행동', basis: { intent: 'check', memoryUses: uses },
    actorState: { activity: 'check', task: '화면에서 현재 항목을 확인한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar', ...state } };
}
const plan = (bundle, decisions) => ({ candidateVersion: '6', requestId: bundle.requestId, decisions });
const quit = source => d(source, 'control/giveUp', { activity: 'finish' });
const use = (goal, field = 'name', mode = 'remembered', value = goal.label) => ({ goalId: goal.id, field, mode, value });

test('new default identifies cognition and its source; legacy candidates cannot quietly accept cognitive fields', () => {
  const { bundle } = fixture();
  assert.equal(bundle.bundleVersion, '8'); assert.equal(bundle.candidateVersion, '7');
  assert.deepEqual(bundle.supportedCandidateVersions, ['7', '6', '5', '4', '3']);
  assert.match(bundle.persona.behavior.cognitionSourceHash, /^[a-f0-9]{64}$/);
  assert.ok(bundle.sourceFiles.some(file => file.path.endsWith('wholeTraceCognition.ts')));
  const wire = quit(bundle.initialChoiceFrame.source);
  const candidate = plan(bundle, [wire]);
  assert.equal(validateWholeTraceCandidate(candidate, bundle.requestId).valid, true);
  const missing = structuredClone(candidate); delete missing.decisions[0].basis.memoryUses;
  assert.equal(validateWholeTraceCandidate(missing, bundle.requestId).valid, false);
  for (const version of ['5', '4'])
    assert.equal(validateWholeTraceCandidate({ ...candidate, candidateVersion: version }, bundle.requestId).valid, false);
});

test('v6 remembered goal fields never impose the correct purchase quantity or change the chosen action', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const goal = bundle.worldReference.objectives[0], shelf = { ...source, activeStation: 'fresh', pageIndex: 0 };
  const state = { activity: 'shop', heldGoalIds: [goal.id], focusedGoalId: goal.id };
  const wire = plan(bundle, [d(source, 'control/readList'),
    d(source, 'open/fresh', state, [use(goal)]),
    d(shelf, 'add/milk', { ...state, focusedProductId: 'milk' }, [use(goal), use(goal, 'requiredQuantity', 'remembered', 2)], 1),
    d(shelf, 'control/closeStation'), quit(source)]);
  const original = structuredClone(wire);
  const compiled = await compileWholeTraceCandidate(settings, bundle, wire);
  assert.equal(compiled.acceptedActions, 5);
  assert.deepEqual(wire, original);
  const purchase = compiled.knowledgeAudit.find(entry => entry.action.type === 'add');
  assert.equal(purchase.action.quantity, 1, 'a legal quantity error remains a real action');
  assert.equal(purchase.basis.memoryUses.find(item => item.field === 'requiredQuantity').value, 2);
  assert.ok(purchase.cognition.valid);
  assert.deepEqual(validateTrace(compiled.trace, settings.snapshot), { valid: true, errors: [] });
});

test('archived/auto-derived objective cues cannot refill a deactivated working-goal slot', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const wire = plan(bundle, [d(source, 'control/readList'),
    d(source, 'control/pause', { heldGoalIds: [goal.id] }, [use(goal)]),
    d(source, 'control/pause', { memoryUpdate: [{ type: 'deactivate', goalId: goal.id }] }),
    d(source, 'control/pause', { heldGoalIds: [goal.id], focusedGoalId: goal.id }, [use(goal)]), quit(source)]);
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, wire), error => {
    assert.equal(error.validation.code, 'WORKING_MEMORY');
    assert.equal(error.validation.acceptedPrefixLength, 3);
    assert.ok(error.validation.knowledge.cues.some(cue => cue.cueRef === `objective:${goal.id}`));
    assert.ok(error.validation.workingMemory);
    return true;
  });
});

test('declared uncertainty cannot be cleared using archived quantity; fresh real list read can recover it', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const held = { heldGoalIds: [goal.id] };
  const prefix = [d(source, 'control/readList'), d(source, 'control/pause', held, [use(goal)]),
    d(source, 'control/pause', { ...held, uncertainGoalIds: [goal.id],
      memoryUpdate: [{ type: 'uncertain', goalId: goal.id, fields: ['requiredQuantity'] }] }, [use(goal)])];
  const bad = d(source, 'control/pause', held, [use(goal, 'requiredQuantity', 'remembered', 2)]);
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, plan(bundle, [...prefix, bad, quit(source)])),
    error => error.validation.code === 'WORKING_MEMORY' && error.validation.acceptedPrefixLength === 3);
  const reread = d(source, 'control/readList', { ...held, uncertainGoalIds: [goal.id] });
  const restored = d(source, 'control/pause', held, [use(goal, 'requiredQuantity', 'remembered', 2)]);
  const compiled = await compileWholeTraceCandidate(settings, bundle, plan(bundle, [...prefix, reread, restored, quit(source)]));
  assert.equal(compiled.acceptedActions, 6);
  assert.equal(compiled.knowledgeAudit[4].cognition.valid, true);
});

test('self-recall preserves an explicitly guessed quantity rather than copying the archive answer', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const wire = plan(bundle, [d(source, 'control/readList'), d(source, 'control/pause', { heldGoalIds: [goal.id] }),
    d(source, 'control/pause', { memoryUpdate: [{ type: 'deactivate', goalId: goal.id }] }),
    d(source, 'control/pause', { heldGoalIds: [goal.id], uncertainGoalIds: [goal.id],
      memoryUpdate: [{ type: 'selfRecall', goalId: goal.id, values: { name: goal.label, requiredQuantity: 1 } }] },
      [use(goal, 'requiredQuantity', 'guess', 1)]), quit(source)]);
  const compiled = await compileWholeTraceCandidate(settings, bundle, wire);
  assert.equal(compiled.acceptedActions, 5);
  assert.equal(compiled.knowledgeAudit[3].basis.memoryUses[0].value, 1);
});

test('v6 session exports memory provenance and repairs only the rejected tail using the preserved cognition state', async t => {
  const { settings } = fixture('checkout');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-cognition-session-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const session = new WholeTraceSession({ ...settings, outputPath: path.join(directory, 'trace.json'), maxRepairs: 1 });
  const { bundle } = session.prepare(), source = bundle.initialChoiceFrame.source;
  const checked = { ...source, phase: 'checkout', activeStation: 'checkout', view: 'world', pageIndex: null };
  const first = d(source, 'checkout/checkout', { activity: 'finish' });
  const wrong = d(source, 'control/submit', { activity: 'finish' });
  const invalid = await session.submit(plan(bundle, [first, wrong]));
  assert.equal(invalid.status, 'invalid'); assert.equal(invalid.validation.acceptedPrefixLength, 1);
  assert.equal(invalid.memoryContract, 'working-memory-v1');
  assert.ok(invalid.repairContext.workingMemory);
  const fixed = await session.submitRepair({ repairVersion: '1', requestId: bundle.requestId, baseAttempt: 1,
    fromDecisionIndex: 1, candidateVersion: '6', decisions: [d(checked, 'control/submit', { activity: 'finish' })] });
  assert.equal(fixed.status, 'complete'); assert.equal(fixed.appExecuted, false);
  assert.equal(fixed.memoryContract, 'working-memory-v1');
  const audit = JSON.parse(fs.readFileSync(fixed.knowledgeAuditPath, 'utf8'));
  assert.equal(audit.auditVersion, '5'); assert.equal(audit.cognitionVersion, 'context-cognition-v1');
  assert.equal(audit.decisions.length, 2); assert.ok(audit.decisions.every(row => row.cognition.valid));
});

test('prepared cognition content and its initial state cannot diverge from canonical rules while retaining the old hash', async () => {
  const { settings, bundle } = fixture(), wire = plan(bundle, [quit(bundle.initialChoiceFrame.source)]);
  for (const change of [copy => { copy.persona.behavior.cognition.coefficients.interest = 999; },
    copy => { copy.actorState.workingMemory.knownGoalIds = ['objective-1']; }]) {
    const changed = structuredClone(bundle); change(changed);
    await assert.rejects(compileWholeTraceCandidate(settings, changed, wire),
      error => error.validation.code === 'PREPARED_INPUT_MISMATCH');
  }
});

test('rejected recall is diagnostic only and never becomes the accepted repair memory', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  const prefix = [d(source, 'control/readList'), d(source, 'control/pause', { heldGoalIds: [goal.id] })];
  const bad = d(source, 'control/pause', { heldGoalIds: [goal.id], uncertainGoalIds: [goal.id],
    memoryUpdate: [{ type: 'selfRecall', goalId: goal.id, values: { requiredQuantity: 1 } }] },
    [use(goal, 'requiredQuantity', 'remembered', 2)]);
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, plan(bundle, [...prefix, bad, quit(source)])), error => {
    assert.equal(error.validation.code, 'WORKING_MEMORY'); assert.equal(error.validation.acceptedPrefixLength, 2);
    const accepted = error.validation.workingMemory.activeGoals[0].fields.requiredQuantity;
    const rejected = error.validation.proposedWorkingMemory.activeGoals[0].fields.requiredQuantity;
    assert.equal(accepted.value, 2); assert.equal(accepted.status, 'clear');
    assert.equal(rejected.value, 1); assert.equal(rejected.status, 'uncertain');
    return true;
  });
});
