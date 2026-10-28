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
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { FEEDBACK_ACTOR_POLICY_VERSION, emptyFeedbackBeliefMemory, validateFeedbackBeliefMemory,
  isFeedbackActorPolicy, isStructuredFeedbackPolicy, isQuantityBeliefFeedbackPolicy,
  isResultReflectionFeedbackPolicy } = require('../src/feedbackActor.ts');

// Offline protocol fixtures; no model call and no claim about success rate or human fidelity.
const v8 = 'feedback-choice-v8';
const beliefs = (extra = {}) => ({ rememberedItems: [{ name: '우유', quantity: 1, certainty: 'clear', status: 'pending',
  source: 'list', rememberedCartQuantity: null }], nextStep: null, notes: [], ongoingIntent: '우유 찾기', ...extra });
function snapshotAtShelf() {
  const initial = createMarketReplaySnapshot(createMarketSession({ seed: 'reflection-feedback-fixture' }));
  const environment = structuredClone(initial.environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'fresh', environment.spawn);
  return createMarketReplaySnapshot(createMarketSession(initial.config, environment));
}

test('v8 is explicit; the default stays v7 and memory replaces currentTask with nextStep', () => {
  assert.equal(FEEDBACK_ACTOR_POLICY_VERSION, 'feedback-choice-v7');
  for (const check of [isFeedbackActorPolicy, isStructuredFeedbackPolicy, isQuantityBeliefFeedbackPolicy, isResultReflectionFeedbackPolicy])
    assert.equal(check(v8), true);
  assert.equal(isResultReflectionFeedbackPolicy('feedback-choice-v7'), false);
  assert.deepEqual(emptyFeedbackBeliefMemory(v8), { rememberedItems: [], nextStep: null, notes: [], ongoingIntent: null });
  assert.equal(validateFeedbackBeliefMemory(beliefs(), v8).valid, true);
  assert.equal(validateFeedbackBeliefMemory(beliefs({ nextStep: '장바구니를 닫고 우유 매대를 찾는다' }), v8).valid, true);
  assert.equal(validateFeedbackBeliefMemory(beliefs({ currentTask: '우유 담기' }), v8).valid, false);
  const { nextStep: _dropped, ...withoutNextStep } = beliefs();
  assert.equal(validateFeedbackBeliefMemory(withoutNextStep, v8).valid, false);
  assert.equal(validateFeedbackBeliefMemory(beliefs(), 'feedback-choice-v7').valid, false);
});

test('v8 frames report the applied previous action and the shelf in-cart cue without correcting beliefs', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reflection-feedback-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  t.mock.method(globalThis, 'fetch', () => { throw Error('No model calls in a protocol fixture'); });
  const snapshot = snapshotAtShelf();
  for (const name of ['begin_feedback_plan', 'generate_trace'])
    assert.ok(definitions.find(x => x.name === name).inputSchema.properties.actorPolicyVersion.enum.includes(v8));
  const began = await service.invokeTool('begin_feedback_plan', { requestId: 'begin', personaId: 'mild-intellectual-disability-adult',
    seed: 'reflection-feedback-fixture', actorPolicyVersion: v8, snapshot, outputPath: path.join(dir, 'trace.json') });
  let frame = began.frame;
  assert.equal(frame.policyVersion, v8);
  assert.equal(frame.lastAction, null);
  assert.deepEqual(frame.memory, emptyFeedbackBeliefMemory(v8));
  assert.doesNotMatch(frame.instructions, /currentTask(?! field)/);
  assert.match(frame.instructions, /lastAction/);
  const memory = beliefs();
  const step = async (type, id, parameters) => {
    const result = await service.invokeTool('step_feedback_plan', { sessionId: began.sessionId, requestId: id, revision: frame.revision,
      choiceId: frame.availableChoices.find(c => c.action.type === type).id, durationMs: 0, reason: '계약 검증 동작', memory,
      ...(parameters ? { choiceParameters: parameters } : {}) });
    if (result.nextFrame) frame = result.nextFrame;
    return result;
  };
  await assert.rejects(service.invokeTool('step_feedback_plan', { sessionId: began.sessionId, requestId: 'legacy-memory', revision: frame.revision,
    choiceId: frame.availableChoices.find(c => c.action.type === 'interact').id, durationMs: 0, reason: '계약 검증 동작',
    memory: { rememberedItems: [], currentTask: '매대 보기', notes: [] } }), /unknown fields|nextStep/);

  await step('interact', 'open');
  assert.equal(frame.lastAction.action.type, 'interact');
  assert.equal(frame.lastAction.result.accepted, true);
  assert.equal(frame.observation.cart, null, 'the shelf still does not expose basket amounts');
  assert.ok(frame.observation.products.length > 0);
  assert.ok(frame.observation.products.every(product => product.inCart === false));

  await step('add', 'miss', { productId: 'milk', quantity: 1, dragOutcome: 'miss' });
  assert.equal(frame.lastAction.result.accepted, false);
  assert.equal(frame.observation.products.find(p => p.id === 'milk').inCart, false);

  await step('add', 'drop', { productId: 'milk', quantity: 2, dragOutcome: 'drop' });
  assert.deepEqual(frame.lastAction.action, { type: 'add', productId: 'milk', quantity: 2 });
  assert.equal(frame.lastAction.result.accepted, true);
  assert.equal(frame.lastAction.result.quantity, 2);
  assert.deepEqual(frame.lastAction, frame.experience.recentActions.at(-1));
  assert.equal(frame.observation.products.find(p => p.id === 'milk').inCart, true);
  assert.ok(frame.observation.products.filter(p => p.id !== 'milk').every(p => p.inCart === false));
  assert.equal(JSON.stringify(frame.observation.products).includes('"cartQuantity"'), false);
  assert.deepEqual(frame.memory, memory, 'an observed result never rewrites authored beliefs');

  await step('viewCart', 'cart');
  assert.equal(frame.lastAction.action.type, 'viewCart');
  assert.equal(frame.observation.cart.milk, 2);
  await step('remove', 'remove', { productId: 'milk', quantity: 2 });
  await step('closeView', 'close');
  assert.equal(frame.lastAction.action.type, 'closeView');
  assert.equal(frame.observation.products.find(p => p.id === 'milk').inCart, false);

  await step('giveUp', 'stop');
  const saved = await service.invokeTool('finalize_feedback_plan', { sessionId: began.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath, 'utf8'));
  assert.equal(trace.generation.actorPolicyVersion, v8);
  assert.deepEqual({ ...trace.generation.feedback, decisions: undefined, contextDelivery: undefined }, { version: '4',
    memory: 'actor-authored-with-recent-experience', experienceContract: 'bounded-observed-experience-v2',
    intentContract: 'persistent-intent-v1', beliefContract: 'quantity-source-beliefs-v1',
    reflectionContract: 'result-reflection-next-step-v1', observationContract: 'shelf-in-cart-cue-v1',
    observationScope: 'current-screen', decisions: undefined, contextDelivery: undefined });
  assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});

test('v7 frames keep their shape: no lastAction, no inCart, currentTask memory', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reflection-feedback-v7-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const began = await service.invokeTool('begin_feedback_plan', { requestId: 'begin', personaId: 'mild-intellectual-disability-adult',
    seed: 'reflection-feedback-fixture', actorPolicyVersion: 'feedback-choice-v7', snapshot: snapshotAtShelf(), outputPath: path.join(dir, 'trace.json') });
  let frame = began.frame;
  assert.equal('lastAction' in frame, false);
  assert.deepEqual(frame.memory, { rememberedItems: [], currentTask: null, notes: [], ongoingIntent: null });
  frame = (await service.invokeTool('step_feedback_plan', { sessionId: began.sessionId, requestId: 'open', revision: frame.revision,
    choiceId: frame.availableChoices.find(c => c.action.type === 'interact').id, durationMs: 0, reason: '계약 검증 동작',
    memory: frame.memory })).nextFrame;
  assert.equal('lastAction' in frame, false);
  assert.ok(frame.observation.products.every(product => !('inCart' in product)));
  assert.doesNotMatch(frame.instructions, /lastAction|nextStep|inCart/);
});
