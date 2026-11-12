const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { buildFeedbackActorFrame, emptyFeedbackBeliefMemory, carryFeedbackBeliefMemory,
  validateFeedbackBeliefMemory } = require('../src/feedbackActor.ts');
const { FeedbackExperience } = require('../src/feedbackExperience.ts');
const { FeedbackMovementPolicy } = require('../src/feedbackMovementPolicy.ts');
const { createFeedbackLlmPolicy } = require('../src/feedbackLlmPolicy.ts');
const { FeedbackPlanSession } = require('../src/legacy/feedbackPlanSession.ts');
const { getPersona } = require('../src/personas.ts');
const { generateTrace } = require('../src/simulator.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');

const persona = getPersona('mild-intellectual-disability-adult');
const snapshot = () => createMarketReplaySnapshot(createMarketSession({ seed: 'direction-contract' }));
const guard = () => new TraceGuard(snapshot(), persona.id, persona.version, 'offline-fixture', true, true, true, true);
const memory = () => emptyFeedbackBeliefMemory();
const response = selection => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(selection) } }] }));
const select = (frame, type, extraMemory = {}) => {
  const choice = frame.availableChoices.find(c => c.action.type === type && (type !== 'moveDirection' || c.action.direction === 'north'));
  assert.ok(choice, `${type} available`);
  return { choiceId: choice.id, durationMs: ['readList', 'pause', 'moveDirection'].includes(type) ? 500 : 0,
    reason: '검증용 관찰 행동', memory: { ...memory(), currentTask: type, ...extraMemory } };
};

test('v4 intent survives a brief check while item forgetting is preserved; explicit switch/clear and legacy rejection work', () => {
  const previous = { ...memory(), ongoingIntent: '통로를 따라 매대 찾기', rememberedItems: [
    { name: '잘못 기억한 상품', quantity: 3, certainty: 'clear', status: 'done' } ] };
  const checking = carryFeedbackBeliefMemory(previous, { ...memory(), currentTask: '목록 확인' }, 'feedback-choice-v4');
  assert.equal(checking.ongoingIntent, previous.ongoingIntent);
  assert.deepEqual(checking.rememberedItems, [], 'intent persistence must not restore forgotten target details');
  assert.equal(carryFeedbackBeliefMemory(checking, { ...memory(), ongoingIntent: '다른 매대 살피기' }, 'feedback-choice-v4').ongoingIntent, '다른 매대 살피기');
  assert.equal(carryFeedbackBeliefMemory(checking, { ...memory(), ongoingIntent: null }, 'feedback-choice-v4').ongoingIntent, null);
  for (const invalid of ['', 'x'.repeat(301), false, {}, undefined])
    assert.equal(validateFeedbackBeliefMemory({ ...memory(), ongoingIntent: invalid }, 'feedback-choice-v4').valid, false);
  for (const policy of ['feedback-choice-v1', 'feedback-choice-v2', 'feedback-choice-v3']) {
    assert.equal(validateFeedbackBeliefMemory(previous, policy).valid, false);
    assert.deepEqual(carryFeedbackBeliefMemory(memory(), memory(), policy), memory());
  }
});

test('a shelf reached by actual directional inputs stays actionable during v4 wandering and recovery', () => {
  const g = guard();
  for (const direction of ['north', 'north', 'west', 'north', 'north']) g.execute({
    id: `move-${direction}`, type: 'moveDirection', direction, durationMs: 1800,
    movement: { speedMultiplier: .7, accelerationMs: 200 }, reactionDelayMs: 0, timeoutMs: 10000, reason: 'fixture',
  });
  const observation = g.observeActor();
  const shelf = observation.visibleStations.find(s => s.kind === 'shelf' && s.near);
  assert.ok(shelf);
  for (const mode of ['random-wander', 'blocked-recovery']) {
    const movement = { version: 'exploration-v2', mode, eligible: true, wanderProbability: 1,
      roll: mode === 'random-wander' ? .1 : null, avoidedDirections: ['west'] };
    const frame = buildFeedbackActorFrame({ observation, persona, memory: memory(), seed: 'shelf-frame', decisionIndex: 5,
      policyVersion: 'feedback-choice-v4', movementPolicy: movement, experience: new FeedbackExperience().snapshot(observation) });
    assert.ok(frame.availableChoices.some(c => c.action.type === 'interact' && c.action.station === shelf.id));
    assert.ok(frame.availableChoices.some(c => c.action.type === 'giveUp'));
    assert.ok(frame.availableChoices.some(c => c.action.type === 'readList'));
    assert.equal(frame.availableChoices.some(c => c.action.type === 'moveDirection' && c.action.direction === 'west'), false);
    const legacy = buildFeedbackActorFrame({ observation, persona, memory: memory(), seed: 'shelf-frame', decisionIndex: 5,
      policyVersion: 'feedback-choice-v3', movementPolicy: { ...movement, version: 'exploration-v1' } });
    assert.ok(legacy.availableChoices.every(c => c.action.type === 'moveDirection'));
  }
});

test('stateless HTTP generation delivers bounded experience and persistent intent without correcting false beliefs', async t => {
  const frames = [];
  const actions = ['readList', 'moveDirection', 'readList', 'viewCart', 'closeView', 'pause', 'giveUp'];
  const falseItems = [{ name: '없는 상품', quantity: 1, certainty: 'clear', status: 'done' }];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const wire = JSON.parse(init.body), frame = JSON.parse(wire.messages[1].content);
    assert.deepEqual(wire.messages.map(m => m.role), ['system', 'user']);
    assert.equal(wire.conversation, undefined);
    assert.equal(wire.previous_response_id, undefined);
    assert.equal(frame.history, undefined);
    assert.equal(frame.experience.version, 'bounded-observed-experience-v1');
    frames.push(frame);
    return response(select(frame, actions[frames.length - 1], { rememberedItems: falseItems,
      ...(frames.length === 1 ? { ongoingIntent: '통로를 둘러본다' } : frames.length === 6 ? { ongoingIntent: null } : {}) }));
  });
  const snap = snapshot();
  const trace = await generateTrace({ personaId: persona.id, snapshot: snap, seed: 'v4-http-memory', actorPolicyVersion: 'feedback-choice-v4',
    feedbackMovement: { wanderProbability: 1 }, llm: { baseUrl: 'http://127.0.0.1:19999/v1', model: 'offline-fixture' } });
  assert.equal(frames.length, 7);
  assert.equal(frames[1].experience.checks.listReadActionsAgo, 0);
  assert.equal(frames[2].experience.checks.listReadActionsAgo, 1);
  assert.equal(frames[2].observation.readObjectives, undefined);
  assert.equal(frames[2].experience.exploration.lastMovement.direction, 'north');
  assert.equal(frames[3].experience.checks.listReadsInRecentActions, 2);
  assert.equal(frames[3].experience.checks.cartChangedSinceListRead, false);
  assert.deepEqual(frames[4].experience.visibleCart.items, {});
  assert.deepEqual(frames[4].memory.rememberedItems, falseItems, 'visible contradiction is supplied but controller must not rewrite actor beliefs');
  for (const frame of frames.slice(1, 6)) assert.equal(frame.memory.ongoingIntent, '통로를 둘러본다');
  assert.equal(frames[6].memory.ongoingIntent, null);
  assert.equal(frames[6].experience.recentActions.length, 6);
  assert.doesNotMatch(JSON.stringify(frames[6].experience), /readObjectives|rememberedItems|ongoingIntent|playerPosition/);
  assert.deepEqual(validateTrace(trace, snap), { valid: true, errors: [] });
});

test('standalone HTTP adapter records an applied result once across a format retry and carries omitted intent', async t => {
  const frames = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const frame = JSON.parse(JSON.parse(init.body).messages[1].content);
    frames.push(frame);
    if (frames.length === 2) return response({ malformed: true });
    return response(select(frame, frames.length === 1 ? 'readList' : 'giveUp', frames.length === 1 ? { ongoingIntent: '매대 탐색' } : {}));
  });
  const policy = createFeedbackLlmPolicy({ baseUrl: 'http://127.0.0.1:19999/v1', model: 'offline-fixture' }, 'v4-standalone', 'feedback-choice-v4');
  const g = guard();
  const first = await policy(g.observeActor(), [], persona);
  await assert.rejects(policy(g.observeActor(), [], persona), /newer applied observation/);
  assert.equal(frames.length, 1, 'an unapplied choice retry cannot add a model call or fictional event');
  g.execute({ id: 'read', type: 'readList', durationMs: 500, reactionDelayMs: 0, timeoutMs: 10000, reason: 'fixture' });
  await policy(g.observeActor(), [first], persona);
  assert.equal(frames[1].memory.ongoingIntent, '매대 탐색');
  assert.equal(frames[1].experience.recentActions.length, 1);
  assert.deepEqual(frames[1].experience, frames[2].experience);
  assert.deepEqual(frames[1].movementPolicy, frames[2].movementPolicy);
});

test('direct session intent and experience survive idempotent step retries without extra applied events', async () => {
  const session = new FeedbackPlanSession('v4-direct', 'feedback-choice-v4', { wanderProbability: 1 });
  const g = guard();
  const firstDecision = session.decide(g.observeActor(), [], persona);
  const firstFrame = session.observe();
  const input = { requestId: 'read-once', revision: firstFrame.revision,
    ...select(firstFrame, 'readList', { ongoingIntent: '진열대 찾아보기' }) };
  const result = session.step(input);
  assert.equal(session.step(input), result);
  const decision = await firstDecision;
  g.execute({ id: 'read', type: 'readList', durationMs: 500, reactionDelayMs: 0, timeoutMs: 10000, reason: 'fixture' });
  session.recordApplied(g.observeActor());
  const secondDecision = session.decide(g.observeActor(), [decision], persona);
  const next = (await result).nextFrame;
  assert.equal(next.memory.ongoingIntent, '진열대 찾아보기');
  assert.equal(next.experience.recentActions.length, 1);
  assert.deepEqual((await session.step(input)).nextFrame, next);
  const stop = session.step({ requestId: 'stop', revision: next.revision, ...select(next, 'giveUp') });
  await secondDecision;
  g.execute({ id: 'stop', type: 'giveUp', reactionDelayMs: 0, timeoutMs: 10000, reason: 'fixture' });
  session.recordApplied(g.observeActor()); session.complete();
  assert.equal((await stop).complete, true);
  assert.equal(session.status.executedActions, 2);
});
