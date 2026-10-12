'use strict';
require('../runtime.cjs').register();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createService, definitions } = require('../server.cjs');
const { validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, marketReplayTraceId, validateMarketReplayTrace } = require('../../frontend/src/game/marketReplayTrace.ts');

// Mechanical fixtures only: no model generation, task-success measurement or web replay.
const memory = { rememberedItems: [], currentTask: null, notes: [] };
const setup = t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-feedback-v4-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Offline fixture must not call a model or backend'); });
  return { service, outputPath: path.join(directory, 'trace.json'),
    snapshot: createMarketReplaySnapshot(createMarketSession({ seed: 'feedback-v4-plumbing' })) };
};
const choiceRequest = (began, frame, type, id, beliefs = memory) => {
  const choice = frame.availableChoices.find(item => item.action.type === type);
  assert.ok(choice, `${type} must remain offered in ${frame.movementPolicy?.mode}`);
  return { sessionId: began.sessionId, requestId: id, revision: frame.revision, choiceId: choice.id,
    durationMs: type === 'readList' ? 1000 : 0, reason: '오프라인 계약 검증', memory: beliefs };
};

test('explicit v4 accepts checking then stopping during random wandering; saved replay keeps its contracts', async t => {
  const f = setup(t);
  for (const name of ['begin_feedback_plan', 'generate_trace'])
    assert.ok(definitions.find(item => item.name === name).inputSchema.properties.actorPolicyVersion.enum.includes('feedback-choice-v4'));
  const began = await f.service.invokeTool('begin_feedback_plan', { requestId: 'v4-default', personaId: 'mild-intellectual-disability-adult',
    seed: 'v4-default', actorPolicyVersion: 'feedback-choice-v4', snapshot: f.snapshot, outputPath: f.outputPath, feedbackMovement: { wanderProbability: 1 } });
  assert.equal(began.actorPolicyVersion, 'feedback-choice-v4');
  assert.equal(began.frame.movementPolicy.version, 'exploration-v2');
  assert.equal(began.frame.movementPolicy.mode, 'random-wander');
  const reading = await f.service.invokeTool('step_feedback_plan', choiceRequest(began, began.frame, 'readList', 'read',
    { ...memory, ongoingIntent: '매대를 둘러본다' }));
  assert.equal(reading.nextFrame.memory.ongoingIntent, '매대를 둘러본다');
  const cart = await f.service.invokeTool('step_feedback_plan', choiceRequest(began, reading.nextFrame, 'viewCart', 'cart'));
  assert.equal(cart.nextFrame.memory.ongoingIntent, '매대를 둘러본다');
  const close = await f.service.invokeTool('step_feedback_plan', choiceRequest(began, cart.nextFrame, 'closeView', 'close'));
  assert.equal(close.nextFrame.memory.ongoingIntent, '매대를 둘러본다', 'omitting intent cannot erase it during a short check');
  assert.equal(close.nextFrame.movementPolicy.mode, 'random-wander');
  await f.service.invokeTool('step_feedback_plan', choiceRequest(began, close.nextFrame, 'giveUp', 'finish'));
  const saved = await f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.deepEqual(trace.generation.feedback, { version: '2', observationScope: 'current-screen',
    memory: 'actor-authored-with-recent-experience', experienceContract: 'bounded-observed-experience-v1',
    intentContract: 'persistent-intent-v1', contextDelivery: 'external-frame', decisions: 4 });
  assert.equal(trace.generation.movementPolicy.version, 'exploration-v2');
  assert.deepEqual(validateTrace(trace, f.snapshot), { valid: true, errors: [] });
  const tampered = structuredClone(trace);
  tampered.steps.find(step => step.type === 'readList').movementPolicy.roll = .123;
  tampered.traceId = marketReplayTraceId(tampered);
  assert.equal(validateMarketReplayTrace(tampered, f.snapshot).valid, true, 'shaped policy still needs seeded semantic verification');
  assert.match(validateTrace(tampered, f.snapshot).errors.join('; '), /movement policy differs/);
});

test('explicit v1, v2 and v3 keep earlier feedback metadata and control contracts', async t => {
  const f = setup(t);
  for (const actorPolicyVersion of ['feedback-choice-v1', 'feedback-choice-v2', 'feedback-choice-v3']) {
    const began = await f.service.invokeTool('begin_feedback_plan', { requestId: actorPolicyVersion,
      personaId: 'mild-intellectual-disability-adult', seed: actorPolicyVersion, actorPolicyVersion,
      ...(actorPolicyVersion === 'feedback-choice-v3' ? { feedbackMovement: { wanderProbability: 0 } } : {}),
      snapshot: f.snapshot, outputPath: `${f.outputPath}.${actorPolicyVersion}` });
    assert.equal(began.actorPolicyVersion, actorPolicyVersion);
    assert.equal(began.frame.memory.ongoingIntent, undefined);
    assert.equal(began.frame.movementPolicy?.version, actorPolicyVersion === 'feedback-choice-v3' ? 'exploration-v1' : undefined);
    await f.service.invokeTool('step_feedback_plan', choiceRequest(began, began.frame, 'giveUp', 'stop'));
    const saved = await f.service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
    const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
    assert.equal(trace.generation.feedback.version, '1');
    assert.equal(trace.generation.feedback.memory, 'actor-authored');
    assert.equal(trace.generation.feedback.experienceContract, undefined);
    assert.deepEqual(validateTrace(trace, f.snapshot), { valid: true, errors: [] });
  }
});
