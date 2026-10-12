const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('../runtime.cjs');
const { generateTrace } = require('../src/simulator.ts');
const { actorChoices, extendedActorChoices } = require('../src/actorChoices.ts');
const { ActorLearningMemory, validateLearning } = require('../src/actorLearning.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const snapshot = () => createMarketReplaySnapshot(createMarketSession({ seed: 'legacy-policy-preservation' }));
const personaId = 'mild-intellectual-disability-adult';
const decision = action => ({ action, delayMs: 100, reason: '기존 정책 경계 검증' });

test('default provider retains the exact v4 prompt, C1 order and input through decision 102', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async (_url, request) => {
    const wire = JSON.parse(request.body), input = JSON.parse(wire.messages[1].content);
    calls++;
    assert.equal(createHash('sha256').update(wire.messages[0].content).digest('hex'),
      'd92fc256c0367539ba047bff4a5865c2114d5553e0ff6a75c6b5375b5371deaf');
    assert.equal(input.activityFeedback, undefined);
    assert.equal(input.experience.previousExperienceRetrieval, undefined);
    assert.equal(input.observation.supportText, undefined);
    assert.deepEqual(input.availableChoices.map(c => c.id), input.availableChoices.map((_, i) => `C${i + 1}`));
    assert.ok(input.availableChoices.every(c => c.label === undefined && c.observedContext?.label === undefined));
    const type = calls === 1 ? 'viewHelp' : calls === 2 ? 'closeView' : calls === 102 ? 'giveUp' : 'pause';
    const choiceId = input.availableChoices.find(c => c.action.type === type).id;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ choiceId, delayMs: 100, reason: '기존 요청 검증' }) } }] }));
  };
  try {
    const trace = await generateTrace({ personaId, seed: 'legacy-http', snapshot: snapshot(), mode: 'llm',
      llm: { model: 'fixture', baseUrl: 'http://127.0.0.1:1/v1' } });
    assert.equal(calls, 102);
    assert.equal(trace.generation.actorPolicyVersion, 'episodic-choice-v4');
    assert.equal(trace.generation.systemCompletion, undefined);
    assert.equal(trace.steps.at(-3).type, 'giveUp');
  } finally { global.fetch = original; }
});

test('default local provider keeps its three arguments and technical action limit', async () => {
  let calls = 0;
  await assert.rejects(generateTrace({ personaId, seed: 'legacy-limit', snapshot: snapshot(), mode: 'llm',
    maxActions: 100, llm: { model: 'fixture' }, actorDecisionProvider: async function () {
      assert.equal(arguments.length, 3); calls++;
      return decision({ type: 'pause', durationMs: 100 });
    } }), /ATTENTION_GENERATION_LIMIT: action-limit/);
  assert.equal(calls, 100);
});

test('legacy choices and guard observations stay unchanged while extended controls are explicit', () => {
  const legacy = new TraceGuard(snapshot(), personaId, '5', 'fixture', true);
  const extended = new TraceGuard(snapshot(), personaId, '5', 'fixture', true, true);
  const step = { id: 'help', type: 'viewHelp', reactionDelayMs: 1, timeoutMs: 1000, reason: '도움 열기' };
  legacy.execute(step); extended.execute(step);
  assert.equal(legacy.observeActor().supportText, undefined);
  assert.ok(extended.observeActor().supportText.length);
  assert.throws(() => legacy.execute(step, true), /explicitly extended actor policy/);
  const cart = { ...legacy.observeActor(), view: 'cart', cart: { sample: 2 }, removableProductIds: [] };
  assert.equal(actorChoices(cart).filter(c => c.action.type === 'remove').length, 2);
  assert.equal(extendedActorChoices(cart).filter(c => c.action.type === 'remove').length, 0);
});

test('v1 confirmed experience retains all 24 episodes and its former validation contract', () => {
  const prior = { version: '1', source: 'confirmed-app-replay', memberId: 'member', sessionId: 'session', replayId: 'replay',
    episodes: Array.from({ length: 24 }, (_, i) => ({ action: `action-${i}`, source: 'executed-app-action', readList: [{ label: '기존 기록', quantity: 0 }] })) };
  assert.doesNotThrow(() => validateLearning(prior));
  const legacy = new ActorLearningMemory(prior).getState();
  assert.deepEqual(legacy.previousExecutedExperience, prior.episodes);
  assert.equal(legacy.previousExperienceRetrieval, undefined);
  assert.equal(new ActorLearningMemory(prior, true).getState().previousExecutedExperience.length, 12);
});
