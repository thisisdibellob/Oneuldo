'use strict';
require('../runtime.cjs').register();
const test = require('node:test');
const assert = require('node:assert/strict');
const { FeedbackPlanSession } = require('../src/feedbackPlanSession.ts');
const { buildFeedbackActorFrame, emptyFeedbackBeliefMemory } = require('../src/feedbackActor.ts');
const { getPersona } = require('../src/personas.ts');

const persona = getPersona('mild-intellectual-disability-adult');
const observation = (extra = {}) => ({ schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world',
  activeStation: null, visibleStations: [], anchors: [], products: [], shelf: null, listAvailable: true,
  cart: null, cashiers: {}, sequence: 0, elapsedMs: 0, ...extra });
const after = (type = 'pause', extra = {}) => observation({ sequence: 1, elapsedMs: 2400,
  result: { accepted: true, actionType: type }, ...extra });
const request = (frame, overrides = {}) => ({ requestId: 'request-1', revision: frame.revision,
  choiceId: frame.availableChoices.find(choice => choice.action.type === 'pause').id,
  durationMs: 800, reason: '현재 자리에서 잠시 기다린다', memory: emptyFeedbackBeliefMemory(), ...overrides });
async function start(seed = 'feedback-session') {
  const session = new FeedbackPlanSession(seed, 'feedback-choice-v1');
  const decision = session.decide(observation(), [], persona, {}, {});
  const frame = await session.awaitObserve();
  return { session, decision, frame };
}
async function endWaiting(session, decision, id = 'finish') {
  const frame = session.observe();
  const choice = frame.availableChoices.find(item => item.action.type === 'giveUp');
  const response = session.step(request(frame, { requestId: id, choiceId: choice.id, durationMs: 0 }));
  await decision;
  session.recordApplied(after('giveUp'));
  session.complete();
  return response;
}

test('a step waits for actual application and returns the next observation in the same response', async () => {
  const { session, decision, frame } = await start();
  const response = session.step(request(frame));
  let settled = false;
  response.then(() => { settled = true; });
  const selected = await decision;
  assert.equal(selected.action.type, 'pause');
  assert.equal(selected.delayMs, 0);
  assert.equal(selected.action.durationMs, 800);
  assert.deepEqual(selected.feedbackMemory, emptyFeedbackBeliefMemory());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(session.status.acceptedActions, 1);
  assert.equal(session.status.executedActions, 0);
  session.recordApplied(after());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'application alone does not fabricate the next actor frame');
  const nextDecision = session.decide(after(), [], persona, {}, {});
  const result = await response;
  assert.equal(result.executedActions, 1);
  assert.equal(result.complete, false);
  assert.equal(result.nextFrame.revision, 2);
  assert.equal(result.nextFrame.observation.result.actionType, 'pause');
  assert.equal(result.timing.plannedElapsedMs, 2400);
  assert.ok(result.timing.actorWaitingMs >= 0);
  await endWaiting(session, nextDecision);
});

test('pending and completed identical retries reuse one promise and cannot execute twice', async () => {
  const { session, decision, frame } = await start();
  const input = request(frame);
  const first = session.step(input);
  assert.equal(session.step(structuredClone(input)), first);
  await decision;
  await assert.rejects(session.awaitObserve(1), error => error.code === 'FEEDBACK_OBSERVE_TIMEOUT' && error.retryable);
  assert.equal(session.step(structuredClone(input)), first, 'a timed-out observer does not erase the accepted request');
  session.recordApplied(after());
  const nextDecision = session.decide(after(), [], persona, {}, {});
  const result = await first;
  assert.equal(session.step(structuredClone(input)), first);
  assert.equal(await session.step(input), result);
  assert.equal(session.status.submittedActions, 1);
  assert.equal(session.status.acceptedActions, 1);
  assert.equal(session.status.executedActions, 1);
  await endWaiting(session, nextDecision);
});

test('reusing a request ID with changed content rejects before or after application', async () => {
  const { session, decision, frame } = await start();
  const input = request(frame), first = session.step(input);
  await assert.rejects(session.step({ ...input, durationMs: 801 }), error => error.code === 'FEEDBACK_REQUEST_CONFLICT');
  await decision;
  session.recordApplied(after());
  session.complete();
  await first;
  await assert.rejects(session.step({ ...input, reason: '다른 행동 설명' }), error => error.code === 'FEEDBACK_REQUEST_CONFLICT');
  assert.equal(session.status.executedActions, 1);
});

test('stale revisions, unknown choices, missing memory and extra batch fields never dispatch', async () => {
  const { session, decision, frame } = await start();
  await assert.rejects(session.step(request(frame, { revision: frame.revision - 1 })), error => error.code === 'FEEDBACK_STALE_REVISION');
  await assert.rejects(session.step(request(frame, { choiceId: 'not-observed' })), error => error.code === 'FEEDBACK_CHOICE');
  await assert.rejects(session.step(request(frame, { memory: undefined })), error => error.code === 'FEEDBACK_MEMORY');
  await assert.rejects(session.step({ ...request(frame), choiceIds: [] }), error => error.code === 'FEEDBACK_STEP_SHAPE');
  assert.equal(session.status.acceptedActions, 0);
  assert.equal(session.status.executedActions, 0);
  assert.equal(session.status.waiting, true);
  await endWaiting(session, decision);
});

test('legacy delay input and nonzero duration for an ordinary action are rejected without dispatch', async () => {
  const { session, decision, frame } = await start('timing-rejection');
  const { durationMs, ...legacy } = request(frame);
  await assert.rejects(session.step({ ...legacy, delayMs: durationMs }), error => error.code === 'FEEDBACK_LEGACY_DELAY');
  const giveUp = frame.availableChoices.find(choice => choice.action.type === 'giveUp');
  await assert.rejects(session.step(request(frame, { choiceId: giveUp.id, durationMs: 1 })), /durationMs|duration/i);
  await assert.rejects(session.step(request(frame, { durationMs: 0 })), /durationMs|duration/i);
  await assert.rejects(session.step(request(frame, { durationMs: 99 })), /durationMs|duration/i);
  await assert.rejects(session.step(request(frame, { durationMs: 120001 })), /durationMs|duration/i);
  assert.equal(session.status.acceptedActions, 0);
  assert.equal(session.status.executedActions, 0);
  assert.equal(session.status.waiting, true);
  const response = session.step(request(frame, { choiceId: giveUp.id, durationMs: 0 }));
  const selected = await decision;
  assert.equal(selected.delayMs, 0);
  assert.deepEqual(selected.action, { type: 'giveUp' });
  session.recordApplied(after('giveUp'));
  session.complete();
  await response;
});

test('timed actions keep their own duration and optional inspection permits both zero and positive duration', async () => {
  for (const [type, durationMs] of [['pause', 100], ['pause', 2310], ['pause', 120000], ['lookAround', 4200], ['readList', 5200],
    ['browse', 6700], ['viewCart', 0], ['viewCart', 3800], ['viewHelp', 0], ['viewHelp', 7100]]) {
    const session = new FeedbackPlanSession(`duration-${type}-${durationMs}`, 'feedback-choice-v1');
    const current = type === 'browse'
      ? observation({ activeStation: 'fresh', shelf: { page: 0, pageCount: 2, scrollFraction: 0, pageFractions: [0, 1] } })
      : observation();
    const decision = session.decide(current, [], persona, {}, {});
    const frame = await session.awaitObserve();
    const choice = frame.availableChoices.find(choice => choice.action.type === type);
    assert.ok(choice, `fixture exposes ${type}`);
    const response = session.step(request(frame, { choiceId: choice.id, durationMs }));
    const selected = await decision;
    assert.equal(selected.delayMs, 0, `${type} has no wait before acting`);
    assert.equal(selected.action.durationMs, durationMs, `${type} duration belongs to the action`);
    session.recordApplied(after(type));
    session.complete();
    await response;
  }
});

test('memory is a full actor-authored replacement; false completion and omitted items are not repaired', async () => {
  const { session, decision, frame } = await start();
  const memory = { rememberedItems: [{ name: '주스', quantity: 7, certainty: 'clear', status: 'done' }],
    currentTask: '담았다고 생각하고 이동한다', notes: [] };
  const input = request(frame, { memory });
  const response = session.step(input);
  memory.rememberedItems[0].quantity = 99;
  assert.equal((await decision).feedbackMemory.rememberedItems[0].quantity, 7);
  session.recordApplied(after());
  const nextDecision = session.decide(after(), [{ hidden: 'history-secret' }], persona,
    { hidden: 'activity-secret' }, { observedThisVisit: { lastReadList: [{ label: 'archive-secret' }] } });
  const result = await response;
  assert.equal(result.nextFrame.memory.rememberedItems[0].quantity, 7);
  const serialized = JSON.stringify(result.nextFrame);
  assert.equal(serialized.includes('history-secret'), false);
  assert.equal(serialized.includes('activity-secret'), false);
  assert.equal(serialized.includes('archive-secret'), false);
  const next = session.step(request(result.nextFrame, { requestId: 'forget', memory: emptyFeedbackBeliefMemory() }));
  await nextDecision;
  session.recordApplied(after());
  const finalDecision = session.decide(after(), [], persona, {}, {});
  assert.deepEqual((await next).nextFrame.memory, emptyFeedbackBeliefMemory());
  await endWaiting(session, finalDecision);
});

test('terminal responses expose the applied action and never a hypothetical correctness verdict', async () => {
  const { session, decision, frame } = await start();
  const response = session.step(request(frame));
  await decision;
  session.recordApplied(after('pause', { phase: 'feedback', feedback: { success: false },
    result: { accepted: true, actionType: 'pause', message: 'hidden verdict' } }));
  const observer = session.awaitObserve();
  session.complete();
  const result = await response, terminal = await observer;
  assert.equal(result.complete, true);
  assert.equal(result.nextFrame, undefined);
  assert.deepEqual(result.result, { accepted: true, actionType: 'pause' });
  assert.deepEqual(terminal, { status: 'complete', result: { accepted: true, actionType: 'pause' } });
  assert.equal(JSON.stringify(result).includes('hidden verdict'), false);
  assert.equal(JSON.stringify(result).includes('feedback'), false);
});

test('legitimate unsuccessful attempts count as executed and feed their observed result forward', async () => {
  const { session, decision, frame } = await start();
  const response = session.step(request(frame));
  await decision;
  const rejected = after('pause', { result: { accepted: false, actionType: 'pause' }, lastActionError: '현재 행동을 완료하지 못했어요.' });
  session.recordApplied(rejected);
  const nextDecision = session.decide(rejected, [], persona, {}, {});
  const result = await response;
  assert.equal(result.executedActions, 1);
  assert.equal(result.result.accepted, false);
  assert.equal(result.nextFrame.observation.lastActionError, rejected.lastActionError);
  await endWaiting(session, nextDecision);
});

test('technical failures before and after application reject retained request promises with accurate counts', async () => {
  for (const applied of [false, true]) {
    const { session, decision, frame } = await start(`failure-${applied}`);
    const input = request(frame), response = session.step(input);
    await decision;
    if (applied) session.recordApplied(after());
    const observer = session.awaitObserve();
    const failure = Object.assign(new Error('technical write failed'), { code: 'DISK_FAILURE' });
    session.fail(failure);
    await assert.rejects(response, error => error === failure);
    await assert.rejects(observer, error => error === failure);
    assert.equal(session.step(input), response);
    await assert.rejects(session.step(input), error => error === failure);
    assert.equal(session.status.executedActions, Number(applied));
    assert.equal(session.status.acceptedActions, 1);
    assert.equal(session.status.failed, true);
    assert.equal(session.status.complete, false);
  }
});

test('closing while awaiting a decision rejects the actor and observer without an undefined decision', async () => {
  const session = new FeedbackPlanSession('closed-before-frame', 'feedback-choice-v1');
  const observer = session.awaitObserve();
  session.close();
  await assert.rejects(observer, error => error.code === 'FEEDBACK_SESSION_CLOSED');
  const active = await start();
  active.session.close();
  await assert.rejects(active.decision, error => error.code === 'FEEDBACK_SESSION_CLOSED');
  await assert.rejects(active.session.awaitObserve(), error => error.code === 'FEEDBACK_SESSION_CLOSED');
});

test('completion or next decision without application is a technical error, not successful execution', async () => {
  for (const operation of ['complete', 'decide']) {
    const { session, decision, frame } = await start(operation);
    const response = session.step(request(frame));
    await decision;
    if (operation === 'complete') session.complete();
    else await assert.rejects(session.decide(after(), [], persona, {}, {}), error => error.code === 'FEEDBACK_APPLICATION_MISSING');
    await assert.rejects(response, error => error.code === (operation === 'complete' ? 'FEEDBACK_UNAPPLIED_COMPLETION' : 'FEEDBACK_APPLICATION_MISSING'));
    assert.equal(session.status.executedActions, 0);
    assert.equal(session.status.failed, true);
  }
});

test('duplicate application callbacks cannot inflate execution counts', async () => {
  const { session, decision, frame } = await start();
  const response = session.step(request(frame));
  await decision;
  session.recordApplied(after());
  assert.throws(() => session.recordApplied(after()), error => error.code === 'FEEDBACK_APPLICATION_STATE');
  session.complete();
  await response;
  assert.equal(session.status.executedActions, 1);
});

test('the dedicated frame entrypoint clones all caller-owned frame fields before awaiting a decision', async () => {
  const session = new FeedbackPlanSession('frame-boundary', 'feedback-choice-v1');
  const input = buildFeedbackActorFrame({ observation: observation(), persona, memory: emptyFeedbackBeliefMemory(),
    seed: 'frame-boundary', decisionIndex: 0, policyVersion: 'feedback-choice-v1' });
  const expected = structuredClone(input);
  const decision = session.decideFrame(input);
  input.memory.notes.push('caller mutation');
  input.observation.phase = 'finished';
  input.availableChoices.length = 0;
  const frame = await session.awaitObserve();
  assert.deepEqual(frame.memory, expected.memory);
  assert.deepEqual(frame.observation, expected.observation);
  assert.deepEqual(frame.availableChoices, expected.availableChoices);
  await endWaiting(session, decision);
});
