'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs').register();
const { createService, definitions } = require('../server.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { createMarketReplaySnapshot, validateMarketReplayTrace } = require('../../frontend/src/game/marketReplayTrace.ts');
const { emptyFeedbackBeliefMemory, feedbackDecisionFromChoice } = require('../src/feedbackActor.ts');
const { validateTrace } = require('../src/traceValidation.ts');
const { generateTrace } = require('../src/simulator.ts');

// Authored protocol fixtures exercise the actual offline simulator, not native model inference or clinical validity.
function setup(t, extra = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-feedback-plan-'));
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'feedback-protocol-fixture', difficulty: 'exact',
    objectives: [{ productId: 'milk', quantity: 2 }], environment: { cashierCount: 2 } }));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Offline feedback protocol must not call a provider, bridge or backend'); });
  const begin = { actorPolicyVersion: 'feedback-choice-v1', requestId: 'begin-fixture', personaId: 'mild-intellectual-disability-adult', seed: 'feedback-fixture',
    snapshot, outputPath: path.join(directory, 'trace.json'), ...extra };
  return { directory, snapshot, service, begin };
}
function stepArgs(sessionId, frame, type, requestId, memory = emptyFeedbackBeliefMemory(),
  durationMs = ['pause', 'lookAround', 'readList', 'browse', 'viewCart', 'viewHelp'].includes(type) ? 1300 : 0) {
  const choice = frame.availableChoices.find(item => item.action.type === type);
  assert.ok(choice, `${type} must be currently offered`);
  return { sessionId, requestId, revision: frame.revision, choiceId: choice.id, durationMs,
    reason: `현재 화면에서 ${type} 동작을 선택한다`, memory };
}
const checkpointRows = outputPath => fs.readFileSync(`${outputPath}.generation/checkpoints.jsonl`, 'utf8')
  .trim().split('\n').filter(Boolean).map(line => JSON.parse(line));

test('begin is idempotent and supplies the first current-only frame; one step returns applied feedback and the next frame', async t => {
  const f = setup(t);
  for (const name of ['begin_feedback_plan', 'step_feedback_plan', 'observe_feedback_plan', 'finalize_feedback_plan'])
    assert.ok(definitions.some(item => item.name === name));
  const began = await f.service.invokeTool('begin_feedback_plan', f.begin);
  const replayed = await f.service.invokeTool('begin_feedback_plan', structuredClone(f.begin));
  assert.deepEqual(replayed, began);
  assert.equal(began.actorPolicyVersion, 'feedback-choice-v1');
  assert.equal(began.frame.revision, 1);
  assert.equal(began.frame.observation.readObjectives, undefined);
  assert.equal(began.frame.worldReference, undefined);
  assert.equal(began.frame.experience, undefined);
  assert.equal(fs.existsSync(f.begin.outputPath), false);
  assert.equal(fs.readdirSync(f.directory).filter(name => name.endsWith('.generation')).length, 1);
  await assert.rejects(f.service.invokeTool('begin_feedback_plan', { ...f.begin, seed: 'different' }), /reused with different/);
  await assert.rejects(f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId }), /still running/);

  const readArgs = stepArgs(began.sessionId, began.frame, 'readList', 'read');
  const read = await f.service.invokeTool('step_feedback_plan', readArgs);
  assert.equal(read.executedActions, 1);
  assert.equal(read.complete, false);
  assert.equal(read.nextFrame.revision, 2);
  assert.equal(read.nextFrame.observation.result.actionType, 'readList');
  assert.equal(read.nextFrame.observation.readObjectives[0].quantity, 2);
  assert.equal(read.nextFrame.observation.readObjectives[0].productId, undefined);
  assert.deepEqual(await f.service.invokeTool('step_feedback_plan', structuredClone(readArgs)), read);
  await assert.rejects(f.service.invokeTool('step_feedback_plan', { ...readArgs, durationMs: 1700 }), /different payload/);

  const falseBelief = { rememberedItems: [{ name: '주스', quantity: 7, certainty: 'clear', status: 'done' }],
    currentTask: '이미 담았다고 생각한다', notes: ['작성된 시험용 오기억'] };
  const paused = await f.service.invokeTool('step_feedback_plan', stepArgs(began.sessionId, read.nextFrame, 'pause', 'pause', falseBelief, 2345));
  assert.equal(paused.nextFrame.observation.readObjectives, undefined, 'a list read is not automatically repeated in the following frame');
  assert.deepEqual(paused.nextFrame.memory, falseBelief, 'false completion is a belief, not a purchase proof requirement');
  assert.equal(paused.nextFrame.experience, undefined);
  const actualFrame = await f.service.invokeTool('observe_feedback_plan', { sessionId: began.sessionId });
  assert.deepEqual(actualFrame, paused.nextFrame);
  assert.equal(checkpointRows(f.begin.outputPath).length, 2, 'step replay did not execute again');
  assert.deepEqual(checkpointRows(f.begin.outputPath)[1].decision.feedbackMemory, falseBelief);

  const final = await f.service.invokeTool('step_feedback_plan', stepArgs(began.sessionId, paused.nextFrame, 'giveUp', 'give-up'));
  assert.equal(final.complete, true);
  assert.equal(final.nextFrame, undefined);
  assert.deepEqual(final.result, { accepted: true, actionType: 'giveUp' });
  assert.equal(final.feedback, undefined);
  assert.equal(final.evaluation, undefined);
  const saved = await f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  assert.equal(saved.executedActions, 3);
  assert.equal(saved.acceptedActions, 3);
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.equal(trace.generation.actorPolicyVersion, 'feedback-choice-v1');
  assert.equal(trace.generation.model, 'gpt-6-luna');
  assert.equal(trace.generation.timingProfile, 'activity-duration-v1');
  assert.deepEqual(trace.generation.feedback, { version: '1', observationScope: 'current-screen', memory: 'actor-authored',
    contextDelivery: 'external-frame', decisions: 3 });
  assert.equal(trace.generation.systemCompletion, undefined);
  assert.equal(trace.steps.find(item => item.type === 'pause').reactionDelayMs, 0);
  assert.equal(trace.steps.find(item => item.type === 'pause').durationMs, 2345);
  assert.ok(trace.steps.every(step => step.reactionDelayMs === 0), 'no automatic pre-action delays remain');
  assert.deepEqual(trace.steps.map(item => item.type), ['start', 'readList', 'pause', 'giveUp', 'skipRating', 'leave']);
  assert.deepEqual(validateMarketReplayTrace(trace, f.snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateTrace(trace, f.snapshot), { valid: true, errors: [] });
  assert.deepEqual(await f.service.invokeTool('validate_trace', { traceFilePath: saved.outputPath, snapshot: f.snapshot }), { valid: true, errors: [] });
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});

test('invalid choice, stale revision and unknown session do not execute or replace a waiting frame', async t => {
  const f = setup(t), began = await f.service.invokeTool('begin_feedback_plan', f.begin);
  const valid = stepArgs(began.sessionId, began.frame, 'pause', 'valid');
  await assert.rejects(f.service.invokeTool('step_feedback_plan', { ...valid, requestId: 'unknown-choice', choiceId: 'invisible' }), /not available/);
  await assert.rejects(f.service.invokeTool('step_feedback_plan', { ...valid, requestId: 'stale', revision: 2 }), /Stale/);
  await assert.rejects(f.service.invokeTool('step_feedback_plan', { ...valid, sessionId: 'unknown-session' }), /Unknown feedback/);
  assert.equal(checkpointRows(f.begin.outputPath).length, 0);
  assert.deepEqual(await f.service.invokeTool('observe_feedback_plan', { sessionId: began.sessionId }), began.frame);
  const paused = await f.service.invokeTool('step_feedback_plan', valid);
  assert.equal(paused.nextFrame.revision, 2);
  await assert.rejects(f.service.invokeTool('step_feedback_plan', { ...valid, requestId: 'old-frame' }), /Stale/);
  await f.service.invokeTool('step_feedback_plan', stepArgs(began.sessionId, paused.nextFrame, 'giveUp', 'finish'));
  const saved = await f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  assert.equal(saved.executedActions, 2);
  assert.equal(checkpointRows(f.begin.outputPath).length, 2);
});

test('100 pauses fail technically with all applied actions retained in diagnostics and no automatic checkout or replay file', async t => {
  const f = setup(t, { maxActions: 100 }), began = await f.service.invokeTool('begin_feedback_plan', f.begin);
  let frame = began.frame;
  for (let index = 0; index < 99; index++) {
    const response = await f.service.invokeTool('step_feedback_plan', stepArgs(began.sessionId, frame, 'pause', `pause-${index}`, undefined, 100));
    assert.equal(response.complete, false);
    frame = response.nextFrame;
  }
  const finalRequest = stepArgs(began.sessionId, frame, 'pause', 'pause-99', undefined, 100);
  await assert.rejects(f.service.invokeTool('step_feedback_plan', finalRequest), /action-limit/);
  await assert.rejects(f.service.invokeTool('step_feedback_plan', finalRequest), /action-limit/);
  await assert.rejects(f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId }), /action-limit/);
  assert.equal(fs.existsSync(f.begin.outputPath), false);
  const checkpoints = checkpointRows(f.begin.outputPath);
  assert.equal(checkpoints.length, 100);
  assert.ok(checkpoints.every(row => row.kind === 'decision' && row.decision.action.type === 'pause'));
  const status = JSON.parse(fs.readFileSync(`${f.begin.outputPath}.generation/status.json`, 'utf8'));
  assert.equal(status.state, 'failed');
  assert.equal(status.systemCompletion, undefined);
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});

test('closing the service cancels a pending actor instead of saving an incomplete or silently completed trace', async t => {
  const f = setup(t), began = await f.service.invokeTool('begin_feedback_plan', f.begin);
  await f.service.close();
  await assert.rejects(f.service.invokeTool('observe_feedback_plan', { sessionId: began.sessionId }), /closed before completion/);
  await assert.rejects(f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId }), /closed before completion/);
  assert.equal(fs.existsSync(f.begin.outputPath), false);
  const status = JSON.parse(fs.readFileSync(`${f.begin.outputPath}.generation/status.json`, 'utf8'));
  assert.equal(status.state, 'failed');
  assert.equal(checkpointRows(f.begin.outputPath).length, 0);
});

test('miss and cancel are applied attempts with observable failure; a later wrong quantity remains unchanged', async t => {
  const f = setup(t);
  const environment = structuredClone(f.snapshot.environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'fresh', environment.spawn);
  assert.ok(environment.spawn);
  f.snapshot = createMarketReplaySnapshot(createMarketSession(f.snapshot.config, environment));
  f.begin.snapshot = f.snapshot;
  const began = await f.service.invokeTool('begin_feedback_plan', f.begin);
  const open = began.frame.availableChoices.find(choice => choice.action.type === 'interact' && choice.action.station === 'fresh');
  assert.ok(open);
  const opened = await f.service.invokeTool('step_feedback_plan', { ...stepArgs(began.sessionId, began.frame, 'pause', 'open-shelf'), choiceId: open.id, durationMs: 0 });
  let frame = opened.nextFrame;
  const stock = frame.observation.products.find(product => product.id === 'milk').stock;
  for (const outcome of ['miss', 'cancel']) {
    const choice = frame.availableChoices.find(item => item.action.type === 'add' && item.action.productId === 'milk' && item.dragOutcome === outcome);
    assert.ok(choice, `${outcome} must be an explicit current UI gesture choice`);
    const result = await f.service.invokeTool('step_feedback_plan', { ...stepArgs(began.sessionId, frame, 'pause', outcome), choiceId: choice.id, durationMs: 0 });
    assert.equal(result.executedActions, 1);
    assert.equal(result.result.accepted, false);
    assert.equal(result.result.actionType, 'add');
    assert.equal(result.result.quantity, 0);
    assert.equal(result.nextFrame.observation.products.find(product => product.id === 'milk').stock, stock);
    assert.match(result.nextFrame.observation.result.message, /담기지/);
    frame = result.nextFrame;
  }
  const wrongQuantity = frame.availableChoices.find(item => item.action.type === 'add' && item.action.productId === 'milk'
    && item.action.quantity === 1 && !item.dragOutcome);
  assert.ok(wrongQuantity);
  const mistakenBelief = { rememberedItems: [{ name: '흰 우유', quantity: 2, certainty: 'clear', status: 'done' }],
    currentTask: '우유를 모두 담았다고 생각한다', notes: [] };
  const dropped = await f.service.invokeTool('step_feedback_plan', { ...stepArgs(began.sessionId, frame, 'pause', 'wrong-quantity', mistakenBelief), choiceId: wrongQuantity.id, durationMs: 0 });
  assert.equal(dropped.result.accepted, true);
  assert.equal(dropped.result.quantity, 1);
  const cart = await f.service.invokeTool('step_feedback_plan', stepArgs(began.sessionId, dropped.nextFrame, 'viewCart', 'inspect-cart', mistakenBelief));
  assert.deepEqual(cart.nextFrame.observation.cart, { milk: 1 });
  assert.deepEqual(cart.nextFrame.memory, mistakenBelief);
  await f.service.invokeTool('step_feedback_plan', stepArgs(began.sessionId, cart.nextFrame, 'giveUp', 'finish-wrong-quantity', mistakenBelief));
  const saved = await f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  const drags = trace.steps.filter(item => item.type === 'dragProduct');
  assert.deepEqual(drags.map(item => item.gesture.outcome), ['miss', 'cancel', 'drop']);
  assert.ok(drags.every(item => item.productId === 'milk' && item.quantity === 1));
  const rows = checkpointRows(saved.outputPath);
  assert.deepEqual(rows.filter(row => row.decision.action.type === 'add').map(row => row.after.result.accepted), [false, false, true]);
  assert.deepEqual(validateTrace(trace, f.snapshot), { valid: true, errors: [] });
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});

test('the public feedback policy rejects archive-bearing legacy callbacks before invoking them', async t => {
  const f = setup(t);
  for (const callbackName of ['actorDecisionProvider', 'decisionProvider']) {
    let calls = 0;
    await assert.rejects(generateTrace({ personaId: f.begin.personaId, seed: 'old-callback-rejected', snapshot: f.snapshot,
      actorPolicyVersion: 'feedback-choice-v1', llm: { model: 'protocol-fixture' }, [callbackName]: async () => {
        calls++; return { action: { type: 'giveUp' }, delayMs: 1, reason: '작성된 프로토콜 시험' };
      } }), /requires feedbackDecisionProvider.*raw actorDecisionProvider/);
    assert.equal(calls, 0);
  }
});

test('the dedicated public callback receives only one current frame and requires actor-authored replacement memory', async t => {
  const f = setup(t), received = [], checkpoints = [];
  const falseBelief = { rememberedItems: [{ name: '다른 물품', quantity: 99, certainty: 'clear', status: 'done' }],
    currentTask: '잘못 기억한 항목을 마쳤다고 생각한다', notes: [] };
  const trace = await generateTrace({ personaId: f.begin.personaId, seed: 'safe-callback', snapshot: f.snapshot,
    actorPolicyVersion: 'feedback-choice-v1', llm: { model: 'protocol-fixture' },
    onCheckpoint: item => checkpoints.push(item), feedbackDecisionProvider: async (...args) => {
      assert.equal(args.length, 1, 'no history, activity or observedThisVisit argument is delivered');
      const [frame] = args;
      assert.equal(frame.history, undefined);
      assert.equal(frame.experience, undefined);
      assert.equal(frame.activity, undefined);
      assert.equal(frame.observedThisVisit, undefined);
      assert.equal(frame.worldReference, undefined);
      received.push(structuredClone(frame));
      const type = ['readList', 'pause', 'giveUp'][received.length - 1];
      const choice = frame.availableChoices.find(item => item.action.type === type);
      return feedbackDecisionFromChoice(choice, type === 'giveUp' ? 0 : 100, '현재 프레임만 사용하는 작성된 시험',
        received.length === 2 ? falseBelief : emptyFeedbackBeliefMemory());
    } });
  assert.equal(received.length, 3);
  assert.ok(received[1].observation.readObjectives.length);
  assert.equal(received[2].observation.readObjectives, undefined);
  assert.deepEqual(received[2].memory, falseBelief);
  assert.deepEqual(checkpoints[1].decision.feedbackMemory, falseBelief);
  assert.equal(trace.generation.feedback.contextDelivery, 'external-frame');
  assert.deepEqual(validateTrace(trace, f.snapshot), { valid: true, errors: [] });
  const rejectedCheckpoints = [];
  await assert.rejects(generateTrace({ personaId: f.begin.personaId, seed: 'missing-belief', snapshot: f.snapshot,
    actorPolicyVersion: 'feedback-choice-v1', llm: { model: 'protocol-fixture' },
    onCheckpoint: item => rejectedCheckpoints.push(item), feedbackDecisionProvider: async frame => {
      const decision = feedbackDecisionFromChoice(frame.availableChoices.find(item => item.action.type === 'giveUp'),
        0, '기억 필드를 누락한 시험', emptyFeedbackBeliefMemory());
      delete decision.feedbackMemory;
      return decision;
    } }), /Invalid feedback belief memory/);
  assert.deepEqual(rejectedCheckpoints, []);
});

test('start and terminal steps add no automatic behavioral waits to a 5000 ms budget', async t => {
  const f = setup(t, { timeBudgetMs: 5000 });
  const began = await f.service.invokeTool('begin_feedback_plan', f.begin);
  const input = stepArgs(began.sessionId, began.frame, 'giveUp', 'terminal-budget');
  const completed = await f.service.invokeTool('step_feedback_plan', input);
  assert.equal(completed.complete, true);
  const saved = await f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.deepEqual(trace.steps.map(step => step.type), ['start', 'giveUp', 'skipRating', 'leave']);
  assert.ok(trace.steps.every(step => step.reactionDelayMs === 0));
  assert.ok(saved.timing.plannedElapsedMs <= 5000);
  assert.deepEqual(validateTrace(trace, f.snapshot), { valid: true, errors: [] });
  const rows = checkpointRows(f.begin.outputPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].decision.action.type, 'giveUp');
  assert.equal(rows[0].after.result.accepted, true);
});

test('an explicit 6000 ms pause still exceeds a 5000 ms planned time budget', async t => {
  const f = setup(t, { timeBudgetMs: 5000 });
  const began = await f.service.invokeTool('begin_feedback_plan', f.begin);
  const input = stepArgs(began.sessionId, began.frame, 'pause', 'pause-budget', undefined, 6000);
  await assert.rejects(f.service.invokeTool('step_feedback_plan', input), /time.*budget|budget.*exceed/i);
  await assert.rejects(f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId }), /time.*budget|budget.*exceed/i);
  assert.equal(fs.existsSync(f.begin.outputPath), false);
  const status = JSON.parse(fs.readFileSync(`${f.begin.outputPath}.generation/status.json`, 'utf8'));
  assert.equal(status.state, 'failed');
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});
