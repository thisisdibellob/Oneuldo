const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { buildWholeTraceAuthoringGuide } = require('../src/wholeTrace/wholeTraceAuthoring.ts');
const {
  validateWholeTraceChoiceDecisionSyntax, validateWholeTraceCandidate,
  WHOLE_TRACE_BUNDLE_VERSION, WHOLE_TRACE_CANDIDATE_VERSION, WHOLE_TRACE_POLICY_VERSION,
} = require('../src/wholeTrace/wholeTraceContracts.ts');

const identity = { requestId: 'authoring-format-request', inputHash: 'authoring-format-input',
  snapshotId: 'authoring-format-snapshot', seed: 'authoring-format-seed', candidateVersion: '7',
  persona: { id: 'mild-intellectual-disability-adult', version: 'test-version' } };
const guide = options => buildWholeTraceAuthoringGuide(identity, options);
const example = () => structuredClone(guide().examples.completeProductDecisions.add);
function control(choiceId = 'control/pause') {
  return {
    choiceRef: { source: { location: 'start', navigationStateId: 'N0', phase: 'shopping', view: 'world',
      activeStation: null, pageIndex: null }, choiceId },
    delayMs: 1000, reason: '형식 검사를 위한 작성된 행동',
    basis: { intent: choiceId === 'control/giveUp' ? 'finish' : 'check', goalId: null, memoryUses: [] },
    actorState: { activity: choiceId === 'control/giveUp' ? 'finish' : 'check', task: '현재 상태를 살핀다',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' },
  };
}
const candidate = (decisions, candidateVersion = '7') => ({ candidateVersion, requestId: identity.requestId, decisions });
const fullCheck = (decisions, version = '7') => validateWholeTraceCandidate(candidate(decisions, version), identity.requestId);
const decisionErrors = result => result.errors.filter(error => error.startsWith('decisions[0]:'))
  .map(error => error.replace(/^decisions\[0\]:/, 'decision:'));

test('additive authoring revision preserves wire and policy versions and request identity', () => {
  const authored = guide();
  assert.equal(authored.authoringVersion, '2');
  assert.equal(authored.guidanceRevision, 'declaration-preflight-v3');
  assert.equal(WHOLE_TRACE_BUNDLE_VERSION, '8');
  assert.equal(WHOLE_TRACE_CANDIDATE_VERSION, '7');
  assert.equal(WHOLE_TRACE_POLICY_VERSION, 'whole-trace-v3');
  assert.deepEqual(authored.identity, { requestId: identity.requestId, inputHash: identity.inputHash,
    snapshotId: identity.snapshotId, seed: identity.seed, candidateVersion: identity.candidateVersion,
    personaId: identity.persona.id, personaVersion: identity.persona.version });
  assert.deepEqual(authored.syntax.candidate.allowedTopLevelFields, ['candidateVersion', 'requestId', 'decisions']);
  assert.equal(validateWholeTraceCandidate(authored.syntax.candidate.envelope, identity.requestId).valid, false,
    'an example envelope must not become an accepted empty plan');
});

test('source-free authoring example is distinct from the unchanged submitted candidate schema', () => {
  const authored = guide(), draft = structuredClone(authored.sourceAuthoring.draftExample);
  assert.equal(authored.sourceAuthoring.revision, 'source-task-preflight-v3');
  assert.equal(Object.hasOwn(draft.choiceRef, 'source'), false);
  assert.deepEqual(Object.keys(draft).sort(), ['actorState', 'basis', 'choiceRef', 'delayMs', 'reason']);
  assert.equal(validateWholeTraceChoiceDecisionSyntax(draft).valid, false,
    'source-free drafts cannot bypass the full candidate source contract');
  const assembled = { ...draft, choiceRef: { ...draft.choiceRef, source: control().choiceRef.source } };
  assert.deepEqual(validateWholeTraceChoiceDecisionSyntax(assembled), { valid: true, errors: [] });
  assert.equal(fullCheck([assembled]).valid, false, 'no ending is supplied by an example');
});

test('current declaration guide makes nesting and each memoryUse goal reference explicit', () => {
  const authored = guide();
  assert.equal(authored.syntax.taskUpdate.path, 'actorState.taskUpdate');
  assert.match(authored.syntax.taskUpdate.instruction, /decision-level taskUpdate is rejected, never relocated/);
  assert.equal(authored.syntax.memoryUses.path, 'basis.memoryUses');
  assert.deepEqual(authored.syntax.memoryUses.requiredEntryFields, ['goalId', 'field', 'mode', 'value']);
  assert.match(authored.syntax.memoryUses.instruction, /basis.goalId is not inherited/);
  assert.match(authored.syntax.memoryUses.instruction, /never supplied.*or corrected/);
});

test('conditional task declaration examples are complete source-free decisions, not a default plan', () => {
  const examples = guide().sourceAuthoring.taskDeclarationExamples;
  assert.match(examples.scope, /Independent conditional.*not a recommended sequence/);
  for (const [name, example] of Object.entries(examples).filter(([name]) => name !== 'scope')) {
    const input = example.draft, before = structuredClone(input);
    assert.ok(example.precondition.length > 20, name);
    assert.deepEqual(Object.keys(input).sort(), ['actorState', 'basis', 'choiceRef', 'delayMs', 'reason'], name);
    assert.equal(Object.hasOwn(input.choiceRef, 'source'), false, name);
    assert.equal(Object.hasOwn(input, 'taskUpdate'), false, name);
    assert.equal(Object.hasOwn(input.choiceRef, 'quantity'), false, `${name} must not invent a purchase quantity`);
    assert.deepEqual(validateWholeTraceChoiceDecisionSyntax({ ...input,
      choiceRef: { ...input.choiceRef, source: control().choiceRef.source } }), { valid: true, errors: [] }, name);
    assert.deepEqual(input, before, name);
  }
});

test('read then select example keeps the update and resulting held goals in the same next decision', () => {
  const examples = guide().sourceAuthoring.taskDeclarationExamples;
  const first = examples.firstRead.draft, next = examples.selectAfterRead.draft;
  assert.equal(first.choiceRef.choiceId, 'control/readList');
  assert.deepEqual(first.actorState.heldGoalIds, []);
  assert.equal(first.actorState.taskUpdate, undefined);
  assert.equal(first.basis.goalId, null);
  assert.deepEqual(first.basis.memoryUses, []);
  assert.deepEqual(next.actorState.taskUpdate, [{ type: 'select', goalId: 'READ_GOAL_ID' }]);
  assert.deepEqual(next.actorState.heldGoalIds, ['READ_GOAL_ID']);
  assert.match(examples.selectAfterRead.precondition, /previous chosen action is readList/);
  assert.equal(next.basis.goalId, null, 'selecting a pending goal need not turn exploration into goal-directed action');
  assert.deepEqual(next.basis.memoryUses, []);
});

test('task and recover examples bind an open goal while non-goal check and help retain pending declarations', () => {
  const examples = guide().sourceAuthoring.taskDeclarationExamples;
  for (const name of ['taskForOpenGoal', 'recoverOpenGoal']) {
    const input = examples[name].draft;
    assert.equal(input.basis.goalId, 'READ_GOAL_ID');
    assert.deepEqual(input.actorState.heldGoalIds, ['READ_GOAL_ID']);
    assert.equal(input.actorState.focusedGoalId, input.basis.goalId);
    assert.equal(input.actorState.taskUpdate, undefined, 'no repeated select for an already open goal');
    assert.deepEqual(input.basis.memoryUses, [{ goalId: 'READ_GOAL_ID', field: 'name',
      mode: 'remembered', value: 'CURRENT_CLEAR_GOAL_NAME' }]);
  }
  assert.equal(examples.recoverOpenGoal.draft.basis.intent, 'recover');
  for (const name of ['checkWithPending', 'helpWithPending']) {
    const input = examples[name].draft;
    assert.equal(input.basis.goalId, null);
    assert.deepEqual(input.basis.memoryUses, []);
    assert.deepEqual(input.actorState.heldGoalIds, ['READ_GOAL_ID']);
    assert.equal(input.actorState.focusedGoalId, null);
  }
});

test('ending examples preserve the actual giveUp exception and do not prescribe an escape from errors', () => {
  const examples = guide().sourceAuthoring.taskDeclarationExamples;
  for (const name of ['giveUpAfterRead', 'giveUpWithPending']) {
    const input = examples[name].draft;
    assert.equal(input.choiceRef.choiceId, 'control/giveUp');
    assert.equal(input.basis.intent, 'finish');
    assert.equal(input.basis.goalId, null);
    assert.equal(input.actorState.taskUpdate, undefined, 'no automatic completion or abandonment');
  }
  assert.deepEqual(examples.giveUpAfterRead.draft.actorState.heldGoalIds, []);
  assert.deepEqual(examples.giveUpWithPending.draft.actorState.heldGoalIds, ['READ_GOAL_ID']);
  assert.match(examples.giveUpAfterRead.precondition, /actor independently chooses/);
  assert.match(examples.giveUpAfterRead.precondition, /not a suggestion to end a plan to avoid an error/);
});

test('authoring preflight guidance preserves final validator authority and original repair budgets', () => {
  const preflight = guide().sourceAuthoring.taskPreflight;
  assert.equal(preflight.errorCode, 'AUTHORING_TASK_DECLARATION');
  assert.match(preflight.scope, /Only the next decision after an authored readList/);
  assert.match(preflight.scope, /Known IDs never restore goal details or memory values/);
  assert.match(preflight.limitations, /No real observation, cognition pressure\/status, remembered value, purchase success or completion evidence is computed/);
  assert.match(preflight.limitations, /Final unchanged compiler/);
  assert.match(preflight.rejection, /without changing the draft or cursor/);
  assert.match(preflight.rejection, /no repair or regeneration budget/);
  assert.equal(guide().syntax.repair.enabled, false);
});

test('repair guidance distinguishes the default zero budget from an explicit one-repair request', () => {
  const defaultGuide = guide(), zero = guide({ maxRepairs: 0 }), one = guide({ maxRepairs: 1 });
  assert.deepEqual(defaultGuide.syntax.repair, zero.syntax.repair);
  assert.equal(zero.syntax.repair.maxRepairs, 0);
  assert.equal(zero.syntax.repair.enabled, false);
  assert.match(zero.syntax.repair.format, /maxRepairs:0/);
  assert.match(zero.syntax.repair.format, /cannot be repaired, regenerated or rebound/);
  assert.equal(one.syntax.repair.maxRepairs, 1);
  assert.equal(one.syntax.repair.enabled, true);
  assert.match(one.syntax.repair.format, /At most one/);
  assert.match(one.syntax.repair.format, /only when.*canRepair:true/);
  assert.match(one.syntax.repair.scope, /Preserve the accepted prefix and original terminal intent/);
});

test('prepared bundle repair guidance matches its actual generation limits', () => {
  const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
  const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
  const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'authoring-repair-limit', difficulty: 'exact',
    objectives: [{ productId: 'milk', quantity: 2 }] }));
  for (const maxRepairs of [undefined, 0, 1]) {
    const bundle = buildWholeTraceBundle({ snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'authoring-repair-limit',
      ...(maxRepairs === undefined ? {} : { maxRepairs }) }, 'authoring-repair-limit-request');
    assert.equal(bundle.generationLimits.maxRepairs, maxRepairs ?? 0);
    assert.equal(bundle.authoringGuide.syntax.repair.maxRepairs, bundle.generationLimits.maxRepairs);
    assert.equal(bundle.authoringGuide.syntax.repair.enabled, bundle.generationLimits.maxRepairs === 1);
    assert.equal(bundle.generationLimits.acceptedActionHorizon, 100);
  }
});

test('complete product examples explicitly choose quantity independently of remembered requirement', () => {
  const authored = guide();
  assert.deepEqual(authored.syntax.choiceRef.quantity.requiredFor, ['add/<productId>', 'remove/<productId>']);
  assert.equal(authored.syntax.choiceRef.quantity.hasDefault, false);
  for (const kind of ['add', 'remove']) {
    const chosen = authored.examples.completeProductDecisions[kind], original = structuredClone(chosen);
    assert.deepEqual(Object.keys(chosen).sort(), ['actorState', 'basis', 'choiceRef', 'delayMs', 'reason']);
    assert.equal(chosen.choiceRef.choiceId, `${kind}/OBSERVED_CHOSEN_PRODUCT_ID`);
    assert.equal(chosen.choiceRef.quantity, 1);
    assert.equal(chosen.basis.memoryUses.find(use => use.field === 'requiredQuantity').value, 2);
    assert.deepEqual(validateWholeTraceChoiceDecisionSyntax(chosen), { valid: true, errors: [] });
    assert.deepEqual(fullCheck([chosen, control('control/giveUp')]), { valid: true, errors: [] });
    assert.deepEqual(chosen, original, 'syntax checks never align selected quantity to remembered quantity');
  }
});

const invalidDeclarations = [
  ['missing add quantity', d => { delete d.choiceRef.quantity; }],
  ['missing remove quantity', d => { d.choiceRef.choiceId = 'remove/OBSERVED_CHOSEN_PRODUCT_ID'; delete d.choiceRef.quantity; }],
  ['fractional quantity', d => { d.choiceRef.quantity = 1.5; }],
  ['quantity below bound', d => { d.choiceRef.quantity = 0; }],
  ['quantity above bound', d => { d.choiceRef.quantity = 100; }],
  ['string quantity', d => { d.choiceRef.quantity = '2'; }],
  ['activity supplied as intent', d => { d.basis.intent = 'orient'; }],
  ['intent supplied as activity', d => { d.actorState.activity = 'explore'; }],
  ['object taskUpdate', d => { d.actorState.taskUpdate = { type: 'select', goalId: 'READ_GOAL_ID' }; }],
  ['memory update used as taskUpdate', d => { d.actorState.taskUpdate = [{ type: 'selfRecall', goalId: 'READ_GOAL_ID', values: { name: '우유' } }]; }],
  ['missing explicit goal', d => { delete d.basis.goalId; }],
  ['missing memory array', d => { delete d.basis.memoryUses; }],
  ['missing memoryUse goalId with a valid basis goalId', d => { delete d.basis.memoryUses[0].goalId; }],
  ['every memoryUse goalId omitted despite a valid basis goalId', d => { d.basis.memoryUses.forEach(use => { delete use.goalId; }); }],
  ['taskUpdate mistakenly placed at decision top level', d => { d.taskUpdate = [{ type: 'select', goalId: 'READ_GOAL_ID' }]; }],
  ['unknown decision key', d => { d.action = { type: 'add', productId: 'milk', quantity: 1 }; }],
  ['unknown choice key', d => { d.choiceRef.productId = 'milk'; }],
  ['unknown basis key', d => { d.basis.quantity = 2; }],
  ['unknown actor key', d => { d.actorState.currentTask = 'shop'; }],
  ['unknown source key', d => { d.choiceRef.source.page = 0; }],
  ['missing source key', d => { delete d.choiceRef.source.location; }],
  ['zero delay', d => { d.delayMs = 0; }],
  ['fractional delay', d => { d.delayMs = 1.5; }],
  ['excessive delay', d => { d.delayMs = 120001; }],
  ['empty reason', d => { d.reason = ' '; }],
  ['nontext reason', d => { d.reason = 1; }],
  ['excessive reason', d => { d.reason = 'x'.repeat(1001); }],
];
for (const [label, change] of invalidDeclarations) {
  test(`single-decision syntax matches full schema and preserves the authored ${label}`, () => {
    const chosen = example(); change(chosen);
    const original = structuredClone(chosen), single = validateWholeTraceChoiceDecisionSyntax(chosen);
    const full = fullCheck([chosen, control('control/giveUp')]);
    assert.equal(single.valid, false);
    assert.equal(single.code, 'CANDIDATE_SCHEMA');
    assert.equal(full.valid, false);
    assert.equal(full.code, 'CANDIDATE_SCHEMA');
    assert.deepEqual(single.errors, decisionErrors(full));
    assert.deepEqual(chosen, original, 'format assistance rejects rather than supplying or rewriting actor fields');
  });
}

test('syntax helper retains each older choice version and does not allow v7 fields in older contracts', () => {
  for (const version of ['4', '5', '6', '7']) {
    const chosen = control('control/giveUp');
    if (version !== '7') delete chosen.basis.goalId;
    if (!['6', '7'].includes(version)) delete chosen.basis.memoryUses;
    if (version === '4') { delete chosen.actorState.focusedGoalId; delete chosen.actorState.focusedProductId; }
    assert.deepEqual(validateWholeTraceChoiceDecisionSyntax(chosen, version), { valid: true, errors: [] });
    assert.deepEqual(fullCheck([chosen], version), { valid: true, errors: [] });
    if (version !== '7') {
      chosen.basis.goalId = null;
      assert.equal(validateWholeTraceChoiceDecisionSyntax(chosen, version).valid, false);
      assert.equal(fullCheck([chosen], version).valid, false);
    }
  }
  for (const unsupported of ['3', '8', '', null])
    assert.equal(validateWholeTraceChoiceDecisionSyntax(control(), unsupported).valid, false);
  const legacy = control('control/giveUp');
  delete legacy.choiceRef;
  legacy.action = { type: 'giveUp' };
  legacy.basis = { intent: 'finish', cueRefs: ['control:giveUp'] };
  delete legacy.actorState.focusedGoalId;
  delete legacy.actorState.focusedProductId;
  legacy.actorState.triggerCueRefs = ['control:giveUp'];
  assert.deepEqual(fullCheck([legacy], '3'), { valid: true, errors: [] }, 'explicit legacy direct-action schema stays available');
});

test('single-decision syntax never grants full-candidate identity, objective, terminal or horizon approval', () => {
  const pause = control(), ending = control('control/giveUp');
  assert.equal(validateWholeTraceChoiceDecisionSyntax(pause).valid, true);
  assert.equal(fullCheck([pause]).valid, false);
  assert.equal(fullCheck(Array.from({ length: 99 }, () => structuredClone(pause))).valid, false);
  assert.equal(fullCheck(Array.from({ length: 100 }, () => structuredClone(pause))).valid, true);
  assert.equal(fullCheck(Array.from({ length: 101 }, () => structuredClone(pause))).valid, false);
  assert.equal(fullCheck([]).valid, false);
  assert.equal(fullCheck([ending, pause, ending]).valid, false);
  assert.equal(validateWholeTraceCandidate(candidate([ending]), 'a-different-request').valid, false);
  const unexpected = candidate([ending]); unexpected.inputHash = identity.inputHash;
  assert.equal(validateWholeTraceCandidate(unexpected, identity.requestId).valid, false);
  const unreadSpelling = control('control/giveUp'); unreadSpelling.basis.cueRefs = ['objective:UNKNOWN_GOAL'];
  assert.equal(validateWholeTraceChoiceDecisionSyntax(unreadSpelling).valid, true);
  const full = validateWholeTraceCandidate(candidate([unreadSpelling]), identity.requestId, { objectiveIds: ['KNOWN_GOAL'] });
  assert.equal(full.valid, false);
  assert.match(full.errors.join('; '), /unknown objective reference/);
});
