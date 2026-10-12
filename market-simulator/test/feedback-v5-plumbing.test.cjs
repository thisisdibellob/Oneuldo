'use strict';
require('../runtime.cjs').register();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createService, definitions } = require('../server.cjs');
const { validateTrace, TraceGuard } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { createFeedbackLlmPolicy } = require('../src/feedbackLlmPolicy.ts');
const { getPersona } = require('../src/personas.ts');

// Offline protocol fixtures; no model, clinical-validity claim, or browser replay.
const memory = { rememberedItems: [{ name: '틀리게 기억한 상품', quantity: 9, certainty: 'clear', status: 'done' }],
  currentTask: null, notes: [], ongoingIntent: '카레 살펴보기' };
function snapshotAtShelf() {
  const initial = createMarketReplaySnapshot(createMarketSession({ seed: 'structured-feedback-fixture' }));
  const environment = structuredClone(initial.environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'fresh', environment.spawn);
  return createMarketReplaySnapshot(createMarketSession(initial.config, environment));
}

for (const selectedPolicy of ['feedback-choice-v5', 'feedback-choice-v6']) {
  const policy = selectedPolicy ?? 'feedback-choice-v5';
  const label = selectedPolicy ?? 'default feedback-choice-v5';
  test(`${label}: parameterized actions survive RPC, retries, observation and saved replay without correcting beliefs`, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structured-feedback-'));
    const service = createService();
    t.after(async () => { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    t.mock.method(globalThis, 'fetch', () => { throw Error('No model calls in a protocol fixture'); });
    const snapshot = snapshotAtShelf();
    for (const name of ['begin_feedback_plan', 'generate_trace'])
      assert.ok(definitions.find(x => x.name === name).inputSchema.properties.actorPolicyVersion.enum.includes(policy));
    const began = await service.invokeTool('begin_feedback_plan', { requestId: 'begin', personaId: 'mild-intellectual-disability-adult',
      seed: 'structured-feedback-fixture', ...(selectedPolicy ? { actorPolicyVersion: selectedPolicy } : {}),
      snapshot, outputPath: path.join(dir, 'trace.json') });
    assert.equal(began.actorPolicyVersion, policy);
    assert.equal(began.frame.policyVersion, policy);
    let frame = began.frame;
    const request = (type, id, parameters) => ({ sessionId: began.sessionId, requestId: id, revision: frame.revision,
      choiceId: frame.availableChoices.find(c => c.action.type === type).id,
      durationMs: 0, reason: '계약 검증 동작', memory, ...(parameters ? { choiceParameters: parameters } : {}) });
    const opened = await service.invokeTool('step_feedback_plan', request('interact', 'open'));
    frame = opened.nextFrame;
    assert.equal(frame.availableChoices.filter(c => c.action.type === 'add').length, 1);
    const bad = request('add', 'invalid', { productId: 'milk', quantity: 2, dragOutcome: 'miss' });
    await assert.rejects(service.invokeTool('step_feedback_plan', bad), /quantity|Quantity|one|1/);
    assert.deepEqual(await service.invokeTool('observe_feedback_plan', { sessionId: began.sessionId }), frame);
    for (const dragOutcome of ['miss', 'cancel', 'drop']) {
      const args = request('add', dragOutcome, { productId: 'milk', quantity: dragOutcome === 'drop' ? 2 : 1, dragOutcome });
      const result = await service.invokeTool('step_feedback_plan', args);
      assert.equal(result.result.accepted, dragOutcome === 'drop');
      assert.deepEqual(await service.invokeTool('step_feedback_plan', args), result);
      await assert.rejects(service.invokeTool('step_feedback_plan', { ...args, choiceParameters: { ...args.choiceParameters, quantity: 3 } }), /different payload/);
      frame = result.nextFrame;
    }
    frame = (await service.invokeTool('step_feedback_plan', request('viewCart', 'cart'))).nextFrame;
    assert.equal(frame.observation.cart.milk, 2);
    assert.equal(frame.observation.cartItems.find(p => p.id === 'milk').quantity, 2);
    assert.match(frame.observation.cartItems.find(p => p.id === 'milk').name, /우유/);
    assert.deepEqual(frame.memory, memory);
    const removed = await service.invokeTool('step_feedback_plan', request('remove', 'remove', { productId: 'milk', quantity: 1 }));
    frame = removed.nextFrame;
    assert.equal(frame.observation.cart.milk, 1);
    frame = (await service.invokeTool('step_feedback_plan', request('closeView', 'close'))).nextFrame;
    assert.equal(frame.observation.cartItems, undefined);
    await service.invokeTool('step_feedback_plan', request('giveUp', 'stop'));
    const saved = await service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
    const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
    assert.equal(trace.generation.actorPolicyVersion, policy);
    assert.equal(trace.generation.feedback.version, '2');
    assert.equal(trace.generation.systemCompletion, undefined);
    assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
    assert.equal(globalThis.fetch.mock.calls.length, 0);
  });

  test(`${label}: HTTP adapter resolves parameters in one fresh request and does not rank by the hidden goal`, async t => {
    const persona = getPersona('mild-intellectual-disability-adult');
    const guard = new TraceGuard(snapshotAtShelf(), persona.id, persona.version, 'fixture', true, true, true, true, true);
    guard.execute({ id: 'open', type: 'openShelf', stationId: 'fresh', reactionDelayMs: 0, timeoutMs: 120000, reason: 'fixture' });
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      calls++;
      const wire = JSON.parse(init.body);
      assert.equal(wire.messages.length, 2);
      assert.equal(wire.previous_response_id, undefined);
      const frame = JSON.parse(wire.messages[1].content);
      assert.equal(frame.policyVersion, policy);
      const choice = frame.availableChoices.find(c => c.action.type === 'add');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ choiceId: choice.id,
        durationMs: 0, reason: '상품 선택', memory,
        choiceParameters: { productId: 'milk', quantity: 2, dragOutcome: 'drop' } }) } }] }));
    });
    const provider = createFeedbackLlmPolicy({ baseUrl: 'http://127.0.0.1:1/v1', model: 'fixture' }, 'fixture', selectedPolicy);
    const decision = await provider(guard.observeActor(), [], persona);
    assert.deepEqual(decision.action, { type: 'add', productId: 'milk', quantity: 2 });
    assert.equal(calls, 1);
    assert.deepEqual(decision.feedbackMemory, memory);
  });
}
