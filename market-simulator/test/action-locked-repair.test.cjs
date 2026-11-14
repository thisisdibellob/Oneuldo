'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createActionLock, runLockedAppend, invalidChoicePacket, classifyError, hashJson, buildLockedSchema, buildPromptSuffix, assertRepair } = require('../action-locked-repair.cjs');
// Only the schema's action envelope is interpreted by the harness. The engine
// still validates all cognition semantics; no test artifact is a runtime input.
const one = items => ({ type: 'array', minItems: 1, maxItems: 1, items });
const actorSchema = { type: 'object', additionalProperties: false, properties: {
  choiceIds: one({ type: 'string' }), delayMs: one({ type: 'integer', minimum: 1, maximum: 120000 }),
  reasons: one({ type: 'string' }), currentTasks: one({ anyOf: [{ type: 'string' }, { type: 'null' }] }),
  cognition: { type: 'object', properties: { actorState: { type: 'object' }, basis: { type: 'object' } }, required: ['actorState', 'basis'] }
}, required: ['choiceIds', 'delayMs', 'reasons', 'currentTasks', 'cognition'] };
const clone = x => JSON.parse(JSON.stringify(x));
function frame() { return { sessionId: 'test-session', revision: 4, observation: { visible: 'same visible screen' }, cognition: { workingMemory: { uncertain: true } }, availableChoices: [
  { id: 'close', label: '닫기', action: { type: 'closeView' } },
  { id: 'add2', label: '2개 추가', action: { type: 'add', productId: 'milk', quantity: 2 } },
  { id: 'add1', label: '1개 추가', action: { type: 'add', productId: 'milk', quantity: 1 } },
  { id: 'quit', label: '중단', action: { type: 'giveUp' } }
] }; }
function decision(id = 'close') { return { choiceIds: [id], delayMs: [1500], reasons: ['현재 보이는 화면을 닫으려 해요'], currentTasks: ['화면 닫기'], cognition: { actorState: { activity: 'check', heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, memoryUpdate: [], taskUpdate: [] }, basis: { intent: 'check', goalId: null, memoryUses: [] } } }; }
const declarationError = () => new Error('MCP append_actor_plan: Invalid v11 working/task memory: Goal-directed check action requires a name memoryUse for objective-1; projected uncertainGoalIds=[]');
const code = expected => error => error.code === expected && error.technicalFailure === true && error.actorTermination === false && error.performanceEligible === false;

test('closeView declaration repair freezes choice, delay, currentTask and reason without modifying beliefs', () => {
  const f = frame(), d = decision(), before = clone(d), lock = createActionLock({ frame: f, decision: d, actorSchema });
  const packet = lock.packet(declarationError(), 1);
  for (const field of ['choiceIds', 'delayMs', 'currentTasks', 'reasons']) assert.deepEqual(packet.schema.properties[field].const, d[field]);
  assert.deepEqual(packet.schema.properties.cognition, actorSchema.properties.cognition);
  const repaired = clone(d); repaired.cognition.actorState.uncertainGoalIds = ['self-authored-uncertain'];
  assert.equal(lock.validateRepair(f, repaired).actionFieldsPreserved, true);
  assert.deepEqual(d, before);
  assert.deepEqual(packet.envelope.originalDecision.cognition, before.cognition);
  const changed = clone(repaired); changed.choiceIds = ['quit'];
  assert.throws(() => lock.validateRepair(f, changed), code('ACTION_LOCK_MISMATCH'));
});

test('choice ID binds product and quantity: add2 cannot turn into add1 or mutate action descriptor', () => {
  const f = frame(), d = decision('add2'), lock = createActionLock({ frame: f, decision: d, actorSchema });
  const changed = clone(d); changed.choiceIds = ['add1'];
  assert.throws(() => lock.validateRepair(f, changed), code('ACTION_LOCK_MISMATCH'));
  const changedFrame = clone(f); changedFrame.availableChoices[1].action.quantity = 1;
  assert.throws(() => lock.validateRepair(changedFrame, d), code('FRAME_CHANGED'));
  assert.equal(lock.binding.selectedChoice.action.quantity, 2);
});

test('delay, task, reason and extra action parameters are independently immutable', () => {
  const f = frame(), d = decision(), lock = createActionLock({ frame: f, decision: d, actorSchema });
  for (const [key, value] of [['delayMs', [1]], ['currentTasks', [null]], ['reasons', ['다른 이유']], ['quantity', 1]]) {
    const altered = clone(d); altered[key] = value;
    assert.throws(() => lock.validateRepair(f, altered), code('ACTION_LOCK_MISMATCH'));
  }
});

test('self-selected giveUp remains executable and is preserved during declaration repair', async () => {
  const events = [], d = decision('quit'); let calls = 0;
  const result = await runLockedAppend({ frame: frame(), initialProposal: { decision: d, file: 'initial' }, actorSchema,
    append: async candidate => { assert.deepEqual(candidate.choiceIds, ['quit']); if (++calls === 1) throw declarationError(); return { accepted: true }; },
    requestProposal: async packet => { assert.equal(packet.kind, 'cognition-declaration-repair'); return { decision: clone(d), file: 'repair' }; }, onEvent: e => events.push(e) });
  assert.equal(result.repairs, 1); assert.equal(result.proof.actionFieldsPreserved, true);
  assert.equal(events.at(-1).stage, 'accepted'); assert.equal(events.at(-1).lockedFieldsSha256, hashJson(result.binding.lockedFields));
  assert.equal(events.filter(e => e.stage === 'repair-proposal').length, 1);
});

test('a changed repair action is rejected locally; a later repair still locks the first closeView', async () => {
  const d = decision(), changed = decision('quit'), events = []; let calls = 0, requests = 0;
  const result = await runLockedAppend({ frame: frame(), initialProposal: d, actorSchema,
    append: async candidate => { calls++; assert.deepEqual(candidate.choiceIds, ['close']); if (calls === 1) throw declarationError(); return 'ok'; },
    requestProposal: async () => ++requests === 1 ? changed : clone(d), onEvent: e => events.push(e) });
  assert.equal(calls, 2); assert.equal(requests, 2); assert.equal(result.repairs, 2);
  assert.equal(events.filter(e => e.stage === 'repair-rejected-locally').length, 1);
  const accepted = events.filter(e => e.stage === 'accepted');
  assert.equal(accepted.length, 1); assert.equal(accepted[0].actionFieldsPreserved, true);
  assert.equal(accepted[0].initialProposalSha256, hashJson(d));
});

test('repair exhaustion is a technical failure and never appends a substitute quit', async () => {
  let calls = 0, requests = 0;
  await assert.rejects(runLockedAppend({ frame: frame(), initialProposal: decision(), actorSchema, repairLimit: 2,
    append: async candidate => { calls++; assert.deepEqual(candidate.choiceIds, ['close']); throw declarationError(); },
    requestProposal: async () => { requests++; return decision('quit'); } }), code('COGNITION_REPAIR_EXHAUSTED'));
  assert.equal(calls, 1); assert.equal(requests, 2);
});

test('unavailable initial ID cannot be submitted; explicit invalid-choice recovery is separately logged', async () => {
  const events = [], impossible = decision('not-a-choice'), selected = decision('add2'); let calls = 0;
  assert.throws(() => createActionLock({ frame: frame(), decision: impossible, actorSchema }), code('INVALID_CHOICE'));
  const result = await runLockedAppend({ frame: frame(), initialProposal: impossible, actorSchema,
    append: async candidate => { calls++; assert.deepEqual(candidate.choiceIds, ['add2']); return 'ok'; },
    requestProposal: async packet => { assert.equal(packet.kind, 'invalid-choice-recovery'); assert.equal(packet.envelope.applied, false); assert.equal(packet.envelope.behaviorOutcome, null); assert.ok(packet.schema.properties.choiceIds.items.enum.includes('quit')); return selected; },
    onEvent: e => events.push(e) });
  assert.equal(calls, 1); assert.equal(result.invalidRecoveries, 1); assert.equal(result.repairs, 0);
  assert.equal(result.binding.initialDecisionSha256, hashJson(selected));
  assert.equal(events.at(-1).initialProposalSha256, hashJson(impossible));
  assert.throws(() => invalidChoicePacket({ frame: frame(), decision: selected, actorSchema, attempt: 1 }), code('INVALID_RECOVERY'));
});

test('invalid-choice recovery exhaustion is technical, with zero applied actions', async () => {
  let calls = 0;
  await assert.rejects(runLockedAppend({ frame: frame(), initialProposal: decision('invalid'), actorSchema, invalidChoiceLimit: 1,
    requestProposal: async () => decision('still-invalid'), append: async () => { calls++; } }), code('INVALID_CHOICE_EXHAUSTED'));
  assert.equal(calls, 0);
});

test('full original frame, session/revision and choice parameters must remain identical', async () => {
  const f = frame(), d = decision(), lock = createActionLock({ frame: f, decision: d, actorSchema });
  for (const mutate of [x => x.revision++, x => x.sessionId = 'other', x => x.observation.visible = 'new', x => x.cognition.workingMemory.uncertain = false]) {
    const changed = clone(f); mutate(changed);
    assert.throws(() => lock.packet(declarationError(), 1, changed), code('FRAME_CHANGED'));
  }
  let calls = 0;
  await assert.rejects(runLockedAppend({ frame: f, initialProposal: d, actorSchema,
    append: async () => { calls++; throw declarationError(); }, requestProposal: async () => { f.revision++; return clone(d); } }), code('FRAME_CHANGED'));
  assert.equal(calls, 1);
});

test('transport, stale revision and server invalid-choice after a valid lock never trigger reselection', async () => {
  for (const message of ['Native actor transport failed: 1', 'revision mismatch', 'MCP append_actor_plan: Choice is not available in revision 4', 'unexpected server failure']) {
    let requests = 0;
    await assert.rejects(runLockedAppend({ frame: frame(), initialProposal: decision(), actorSchema, append: async () => { throw new Error(message); }, requestProposal: async () => { requests++; return decision('quit'); } }), code('APPEND_TECHNICAL_FAILURE'));
    assert.equal(requests, 0);
  }
  assert.equal(classifyError(declarationError()).kind, 'cognition-declaration');
  assert.equal(classifyError(new Error('MCP append_actor_plan: Choice is not available in revision 4')).kind, 'invalid-choice');
});

test('accepted-event persistence failure cannot cause duplicate application or repair', async () => {
  let calls = 0, requests = 0;
  await assert.rejects(runLockedAppend({ frame: frame(), initialProposal: decision(), actorSchema, append: async () => { calls++; return 'ok'; }, requestProposal: async () => { requests++; }, onEvent: event => { if (event.stage === 'accepted') throw new Error('audit write failed'); } }), /audit write failed/);
  assert.equal(calls, 1); assert.equal(requests, 0);
});

test('standalone schema/prompt/assert APIs preserve the same lock contract', () => {
  const f = frame(), d = decision(), lock = createActionLock({ frame: f, decision: d, actorSchema });
  assert.deepEqual(buildLockedSchema({ frame: f, decision: d, actorSchema }), lock.buildLockedSchema());
  const suffix = buildPromptSuffix(lock, declarationError(), 1, f);
  const envelope = JSON.parse(suffix.slice(suffix.indexOf('\n') + 1));
  assert.equal(envelope.binding.frameSha256, hashJson(f));
  assert.deepEqual(envelope.lockedFields.choiceIds, ['close']);
  assert.equal(assertRepair(lock, f, d).actionFieldsPreserved, true);
});
