'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { createService } = require('../server.cjs');
const { getPersona } = require('../src/personas.ts');
const { generateTrace } = require('../src/simulator.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { FeedbackMovementPolicy } = require('../src/feedbackMovementPolicy.ts');
const { createFeedbackLlmPolicy } = require('../src/feedbackLlmPolicy.ts');
const { buildFeedbackActorFrame, emptyFeedbackBeliefMemory, feedbackDecisionFromChoice } = require('../src/feedbackActor.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, marketReplayTraceId, validateMarketReplayTrace } = require('../../frontend/src/game/marketReplayTrace.ts');

// Authored mechanical fixtures only. These are not model samples or success-rate evidence.
const persona = getPersona('mild-intellectual-disability-adult');
const snapshot = () => createMarketReplaySnapshot(createMarketSession({ seed: 'direction-contract' }));
const observe = () => new TraceGuard(snapshot(), persona.id, persona.version, 'fixture', true, true, true, true).observeActor();
const beliefs = { rememberedItems: [{ name: '주스', quantity: 7, certainty: 'uncertain', status: 'done' }],
  currentTask: null, notes: ['시험용 잘못된 기억'] };
const choose = (frame, type, direction) => {
  const choice = frame.availableChoices.find(c => c.action.type === type && (!direction || c.action.direction === direction));
  assert.ok(choice, `${type} ${direction ?? ''} must be offered in ${frame.movementPolicy?.mode}`);
  return choice;
};
const request = (sessionId, frame, choice, id, durationMs = 0) => ({ sessionId, requestId: id, revision: frame.revision,
  choiceId: choice.id, durationMs, reason: '작성된 동작 검증', memory: beliefs });
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-exploration-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { directory, service, outputPath: path.join(directory, 'trace.json') };
}

test('v3 frames wander without visible objects, preserve beliefs and leave direction/duration to the actor', () => {
  const observation = { ...observe(), visibleStations: [], visibleStructures: [], anchors: [], instructions: undefined };
  for (const probability of [0, 1]) {
    const policy = new FeedbackMovementPolicy('no-targets', { wanderProbability: probability });
    const frame = buildFeedbackActorFrame({ observation, persona, memory: beliefs, seed: 'no-targets', decisionIndex: 0,
      movementPolicy: policy.prepare(observation, 0), policyVersion: 'feedback-choice-v3' });
    assert.equal(frame.policyVersion, 'feedback-choice-v3');
    assert.deepEqual(frame.memory, beliefs);
    assert.equal(frame.availableChoices.filter(c => c.action.type === 'moveDirection').length, 8);
    assert.equal(frame.availableChoices.every(c => c.action.type === 'moveDirection'), Boolean(probability));
    const decision = feedbackDecisionFromChoice(choose(frame, 'moveDirection', 'southwest'), 1373, '그냥 걷는다', beliefs);
    assert.deepEqual(decision.action, { type: 'moveDirection', direction: 'southwest', durationMs: 1373 });
    assert.deepEqual(decision.feedbackMemory, beliefs);
    assert.equal(decision.delayMs, 0);
    assert.equal(frame.observation.environment, undefined);
  }
});

test('explicit v3 keeps 20 percent wandering, retries and failed-run diagnostics', async t => {
  const { service, outputPath } = setup(t);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Offline fixture must not call an LLM or backend'); });
  const base = { personaId: persona.id, snapshot: snapshot(), seed: 'default-exploration', actorPolicyVersion: 'feedback-choice-v3' };
  const defaults = await service.invokeTool('begin_feedback_plan', { ...base, requestId: 'default', outputPath: `${outputPath}.default` });
  assert.equal(defaults.actorPolicyVersion, 'feedback-choice-v3');
  assert.equal(defaults.frame.movementPolicy.wanderProbability, .2);
  const begin = await service.invokeTool('begin_feedback_plan', { ...base, requestId: 'always', outputPath,
    feedbackMovement: { wanderProbability: 1 }, maxActions: 2 });
  let frame = begin.frame;
  assert.equal(frame.movementPolicy.mode, 'random-wander');
  assert.ok(frame.availableChoices.every(c => c.action.type === 'moveDirection'));
  const first = request(begin.sessionId, frame, choose(frame, 'moveDirection', 'west'), 'first', 1107);
  const applied = await service.invokeTool('step_feedback_plan', first);
  assert.deepEqual(await service.invokeTool('step_feedback_plan', first), applied);
  assert.equal(applied.nextFrame.observation.elapsedMs, 1107);
  assert.deepEqual(applied.nextFrame.memory, beliefs);
  frame = applied.nextFrame;
  const second = request(begin.sessionId, frame, choose(frame, 'moveDirection', 'east'), 'second', 100);
  await assert.rejects(service.invokeTool('step_feedback_plan', second), /action-limit/);
  assert.equal(fs.existsSync(outputPath), false);
  const options = JSON.parse(fs.readFileSync(`${outputPath}.generation/options.json`, 'utf8')).options;
  assert.deepEqual(options.feedbackMovement, { wanderProbability: 1 });
  const entries = fs.readFileSync(`${outputPath}.generation/checkpoints.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(entries.length, 2);
  assert.ok(entries.every(row => row.decision.movementPolicy.mode === 'random-wander'));
  assert.deepEqual(entries[0].decision.movementPolicy, begin.frame.movementPolicy);
  assert.deepEqual(entries[0].decision.feedbackMemory, beliefs);
});

test('actual collision forces a different direction, then displacement restores choices and trace provenance replays', async t => {
  const { service, outputPath } = setup(t), snap = snapshot();
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Offline fixture must not call an LLM or backend'); });
  const begin = await service.invokeTool('begin_feedback_plan', { requestId: 'blocked', personaId: persona.id,
    seed: 'blocked-exploration', actorPolicyVersion: 'feedback-choice-v3', snapshot: snap, feedbackMovement: { wanderProbability: 0 }, outputPath });
  let frame = begin.frame, count = 0, blocked = false;
  while (count < 30) {
    const applied = await service.invokeTool('step_feedback_plan', request(begin.sessionId, frame,
      choose(frame, 'moveDirection', 'north'), `north-${count++}`, 2000));
    frame = applied.nextFrame;
    if (applied.result.movement.outcome === 'blocked') { blocked = true; break; }
  }
  assert.equal(blocked, true);
  assert.equal(frame.movementPolicy.mode, 'blocked-recovery');
  assert.equal(frame.movementPolicy.roll, null);
  assert.ok(frame.movementPolicy.avoidedDirections.includes('north'));
  assert.ok(frame.availableChoices.every(c => c.action.type === 'moveDirection' && c.action.direction !== 'north'));
  assert.deepEqual(await service.invokeTool('observe_feedback_plan', { sessionId: begin.sessionId }), frame);
  const recovery = await service.invokeTool('step_feedback_plan', request(begin.sessionId, frame,
    choose(frame, 'moveDirection', 'west'), 'recover', 1800));
  assert.ok(recovery.result.movement.movedDistancePx >= 24);
  frame = recovery.nextFrame;
  assert.equal(frame.movementPolicy.mode, 'actor-choice');
  assert.deepEqual(frame.movementPolicy.avoidedDirections, []);
  assert.deepEqual(frame.memory, beliefs);
  await service.invokeTool('step_feedback_plan', request(begin.sessionId, frame, choose(frame, 'giveUp'), 'finish'));
  const saved = await service.invokeTool('finalize_feedback_plan', { sessionId: begin.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.equal(trace.generation.movementPolicy.wanderProbability, 0);
  assert.equal(trace.generation.feedback.decisions, count + 2);
  assert.equal(trace.steps.filter(s => s.movementPolicy).length, count + 2);
  const recoveryStep = trace.steps.find(s => s.movementPolicy?.mode === 'blocked-recovery');
  assert.equal(recoveryStep.direction, 'west');
  assert.equal(trace.steps.find(s => s.type === 'moveDirection').durationMs, 2000);
  assert.equal(trace.generation.systemCompletion, undefined);
  assert.deepEqual(validateTrace(trace, snap), { valid: true, errors: [] });

  const tampered = structuredClone(trace);
  tampered.steps[1].movementPolicy.roll = (tampered.steps[1].movementPolicy.roll + .5) % 1;
  tampered.traceId = marketReplayTraceId(tampered);
  assert.equal(validateMarketReplayTrace(tampered, snap).valid, true, 'a well-shaped forged roll needs semantic replay');
  assert.match(validateTrace(tampered, snap).errors.join('; '), /movement policy differs/);
  const missing = structuredClone(trace);
  delete missing.steps.find(s => s.type === 'giveUp').movementPolicy;
  missing.traceId = marketReplayTraceId(missing);
  assert.equal(validateTrace(missing, snap).valid, false);
});

test('HTTP format repair keeps the same seeded movement frame and actor-selected direction and duration', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const wire = JSON.parse(request.body), frame = JSON.parse(wire.messages[1].content);
    requests.push(wire);
    const choice = choose(frame, 'moveDirection', 'southeast');
    const content = requests.length === 1 ? '{}' : JSON.stringify({ choiceId: choice.id, durationMs: 917,
      reason: '그냥 걷는다', memory: beliefs });
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  });
  const policy = createFeedbackLlmPolicy({ baseUrl: 'http://127.0.0.1:19999/v1', model: 'authored-fixture' },
    'http-exploration', 'feedback-choice-v3', { wanderProbability: 1 });
  const decision = await policy(observe(), [], persona);
  assert.deepEqual(decision.action, { type: 'moveDirection', direction: 'southeast', durationMs: 917 });
  assert.equal(requests.length, 2);
  const frames = requests.map(wire => JSON.parse(wire.messages[1].content));
  assert.deepEqual(frames[0].movementPolicy, frames[1].movementPolicy);
  assert.deepEqual(frames[0].availableChoices, frames[1].availableChoices);
  assert.deepEqual(decision.movementPolicy, frames[0].movementPolicy);
  assert.ok(requests.every(wire => wire.messages.length === 2));
  assert.deepEqual(decision.feedbackMemory, beliefs);
});

test('v3 full HTTP generation stamps the actual offered movement mode and preserves the next actor-authored memory', async t => {
  const frames = [], seed = 'http-full-exploration-6';
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const frame = JSON.parse(JSON.parse(request.body).messages[1].content); frames.push(frame);
    const moving = frame.movementPolicy.mode !== 'actor-choice';
    const choice = choose(frame, moving ? 'moveDirection' : 'giveUp', moving ? 'south' : undefined);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ choiceId: choice.id,
      durationMs: moving ? 100 : 0, reason: '시험 동작', memory: beliefs }) } }] }) };
  });
  const snap = snapshot();
  const trace = await generateTrace({ personaId: persona.id, snapshot: snap, seed, actorPolicyVersion: 'feedback-choice-v3',
    llm: { baseUrl: 'http://127.0.0.1:19999/v1', model: 'authored-fixture' }, maxActions: 20 });
  assert.equal(trace.generation.feedback.contextDelivery, 'stateless-http');
  assert.deepEqual(frames.map(f => f.movementPolicy.mode), ['random-wander', 'actor-choice']);
  assert.equal(trace.steps.find(s => s.type === 'moveDirection').direction, 'south');
  assert.deepEqual(trace.steps.filter(s => s.movementPolicy).map(s => s.movementPolicy), frames.map(f => f.movementPolicy));
  for (const frame of frames.slice(1)) assert.deepEqual(frame.memory, beliefs);
  assert.deepEqual(validateTrace(trace, snap), { valid: true, errors: [] });
});

test('invalid HTTP responses do not execute a random fallback move or fabricate a completed trace', async t => {
  const checkpoints = [];
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true,
    json: async () => ({ choices: [{ message: { content: '{}' } }] }) }));
  await assert.rejects(generateTrace({ personaId: persona.id, snapshot: snapshot(), seed: 'broken-provider',
    actorPolicyVersion: 'feedback-choice-v3', feedbackMovement: { wanderProbability: 1 },
    llm: { baseUrl: 'http://127.0.0.1:19999/v1', model: 'authored-fixture' }, onCheckpoint: row => checkpoints.push(row) }),
  /invalid choice\/memory after 3 attempts; no stochastic fallback/);
  assert.equal(globalThis.fetch.mock.calls.length, 3);
  assert.deepEqual(checkpoints, []);
});

test('invalid v3 choice or legacy exploration options fail explicitly without substituting movement', async () => {
  const options = { personaId: persona.id, snapshot: snapshot(), seed: 'invalid', actorPolicyVersion: 'feedback-choice-v3',
    feedbackMovement: { wanderProbability: 1 }, llm: { model: 'fixture' }, feedbackDecisionProvider: async () => ({
      action: { type: 'pause', durationMs: 1000 }, delayMs: 0, reason: 'offered control 위반 시험', feedbackMemory: emptyFeedbackBeliefMemory() }) };
  await assert.rejects(generateTrace(options), /not a current visible choice/);
  for (const actorPolicyVersion of ['feedback-choice-v1', 'feedback-choice-v2', undefined])
    await assert.rejects(generateTrace({ ...options, actorPolicyVersion }), /feedbackMovement requires/);
  for (const wanderProbability of [-1, 2, NaN, '0.2'])
    await assert.rejects(generateTrace({ ...options, feedbackMovement: { wanderProbability } }), /0\.\.1/);
});
