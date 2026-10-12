const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createFeedbackLlmPolicy } = require('../src/feedbackLlmPolicy.ts');
const { emptyFeedbackBeliefMemory } = require('../src/feedbackActor.ts');
const { getPersona } = require('../src/personas.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const { generateTrace } = require('../src/simulator.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');

// Intercepted HTTP bodies exercise the adapter; these tests never contact a model or a browser.
const options = { model: 'intercepted-fixture-model', baseUrl: 'http://127.0.0.1:1/v1' };
const persona = getPersona('mild-intellectual-disability-adult');
const snapshot = () => createMarketReplaySnapshot(createMarketSession({ seed: 'feedback-provider-fixture' }));
const guard = (attentionMode = true) => new TraceGuard(snapshot(), persona.id, persona.version, 'fixture', attentionMode, true);
const step = (type, extra = {}) => ({ id: type, type, reactionDelayMs: 1, timeoutMs: 120000, reason: 'fixture', ...extra });
const response = (selection, protocol = 'openai') => new Response(JSON.stringify(protocol === 'ollama'
  ? { message: { content: JSON.stringify(selection) } }
  : { choices: [{ message: { content: JSON.stringify(selection) } }] }));
const choose = (frame, type, memory = emptyFeedbackBeliefMemory()) => ({
  choiceId: frame.availableChoices.find(choice => choice.action.type === type).id,
  durationMs: ['pause', 'lookAround', 'readList', 'browse'].includes(type) ? 450 : 0, reason: '현재 화면의 선택', memory,
});
const wrongMemory = () => ({ rememberedItems: [
  { name: '이번 목록과 다른 기억', quantity: 97, certainty: 'clear', status: 'done' },
], currentTask: '다 했다고 생각하고 주변 보기', notes: ['내가 고른 것 같음'] });
const sentinel = 'PRIVATE_AUDIT_ARCHIVE_MUST_NOT_REACH_ACTOR';

for (const protocol of ['openai', 'ollama']) test(`${protocol}: each intercepted decision has fresh messages, transient list and only actor-authored retained beliefs`, async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const requests = [];
  global.fetch = async (_url, init) => {
    const wire = JSON.parse(init.body), current = JSON.parse(wire.messages[1].content);
    requests.push({ wire, current });
    assert.deepEqual(wire.messages.map(message => message.role), ['system', 'user']);
    assert.equal(wire.previous_response_id, undefined);
    assert.equal(wire.conversation, undefined);
    assert.doesNotMatch(init.body, new RegExp(sentinel));
    assert.equal(current.history, undefined);
    assert.equal(current.observedThisVisit, undefined);
    assert.equal(current.activityFeedback, undefined);
    assert.equal(current.observation.expectedAnswer, undefined);
    assert.doesNotMatch(JSON.stringify(current.availableChoices), /recordedArrivals|currentLocation|observedThisVisit|lastReadList/);
    if (requests.length === 1) {
      assert.equal(current.observation.readObjectives, undefined);
      assert.deepEqual(current.memory, emptyFeedbackBeliefMemory());
      return response(choose(current, 'readList'), protocol);
    }
    if (requests.length === 2) {
      assert.ok(current.observation.readObjectives.length > 0);
      assert.deepEqual(current.memory, emptyFeedbackBeliefMemory());
      return response(choose(current, 'pause', wrongMemory()), protocol);
    }
    assert.equal(current.observation.readObjectives, undefined);
    assert.deepEqual(current.memory, wrongMemory());
    return response(choose(current, 'giveUp'), protocol);
  };
  const policy = createFeedbackLlmPolicy({ ...options, protocol }, 'fresh-requests');
  const g = guard(), history = [{ action: { type: 'pause', durationMs: 1 }, delayMs: 1, reason: sentinel,
    exchange: { request: { entirePriorConversation: sentinel }, response: { rawSnapshot: sentinel } } }];
  const source = () => ({ ...g.observeActor(), expectedAnswer: sentinel, history: [sentinel],
    observedThisVisit: { lastReadList: [{ label: sentinel, quantity: 1 }] } });
  const first = await policy(source(), history, persona, { rawSnapshot: sentinel }, { completedTasks: sentinel });
  assert.equal(first.action.type, 'readList');
  assert.equal(first.delayMs, 0);
  assert.equal(first.action.durationMs, 450);
  g.execute(step('readList', { durationMs: first.action.durationMs }));
  history.push(first);
  const second = await policy(source(), history, persona, { lastReadList: sentinel }, { fullActivityHistory: sentinel });
  assert.deepEqual(second.feedbackMemory, wrongMemory());
  g.execute(step('pause', { durationMs: second.action.durationMs }));
  history.push(second);
  const third = await policy(source(), history, persona, { observedThisVisit: sentinel }, { raw: sentinel });
  assert.equal(third.action.type, 'giveUp');
  assert.equal(third.delayMs, 0);
  assert.equal(third.action.durationMs, undefined);
  assert.deepEqual(third.feedbackMemory, emptyFeedbackBeliefMemory(), 'actor may drop its previous beliefs entirely');
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.current.policyVersion === 'feedback-choice-v1'));
});

test('all currently legal quantities survive the wire and applied add feedback reaches the next independent request', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  // Fixture setup uses the existing unrestricted offline guard to open a shelf;
  // only its projected current shelf is ever sent to the provider.
  const g = guard(false);
  g.execute(step('walkTo', { target: { stationId: 'fresh' }, movement: { style: 'steady', speedMultiplier: 1, motorSeed: 'fixture' } }));
  g.execute(step('openShelf', { stationId: 'fresh' }));
  const product = g.observeActor().products.find(item => item.stock >= 2);
  assert.ok(product);
  const quantity = Math.min(99, product.stock);
  let calls = 0;
  global.fetch = async (_url, init) => {
    const wire = JSON.parse(init.body), current = JSON.parse(wire.messages[1].content);
    assert.equal(wire.messages.length, 2);
    calls++;
    if (calls === 1) {
      const choices = current.availableChoices.filter(choice => choice.action.type === 'add' && choice.action.productId === product.id && !choice.dragOutcome);
      assert.deepEqual(choices.map(choice => choice.action.quantity).sort((a, b) => a - b), Array.from({ length: quantity }, (_, i) => i + 1));
      return response({ ...choose(current, 'viewCart', wrongMemory()),
        choiceId: choices.find(choice => choice.action.quantity === quantity).id });
    }
    assert.deepEqual(current.observation.result, { accepted: true, actionType: 'add', productId: product.id, quantity });
    assert.equal(current.observation.products.find(item => item.id === product.id).stock, product.stock - quantity);
    assert.deepEqual(current.memory, wrongMemory(), 'the actual add must not correct a contrary belief or its completion flag');
    return response(choose(current, 'viewCart', current.memory));
  };
  const policy = createFeedbackLlmPolicy(options, 'quantities');
  const selected = await policy(g.observeActor(), [], persona);
  assert.deepEqual(selected.action, { type: 'add', productId: product.id, quantity });
  g.execute(step('dragProduct', { productId: selected.action.productId, quantity: selected.action.quantity,
    gesture: { outcome: 'drop', durationMs: 100, hesitationMs: 0 } }));
  const next = await policy(g.observeActor(), [selected], persona);
  assert.equal(next.action.type, 'viewCart');
  assert.equal(calls, 2);
});

test('an explicitly chosen missed drag reaches the next request as failed application without correcting the actor belief', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const g = new TraceGuard(snapshot(), persona.id, persona.version, 'fixture', false, true, true);
  g.execute(step('walkTo', { target: { stationId: 'fresh' }, movement: { style: 'steady', speedMultiplier: 1, motorSeed: 'fixture' } }));
  g.execute(step('openShelf', { stationId: 'fresh' }));
  const product = g.observeActor().products.find(item => item.stock > 0);
  const beforeCart = structuredClone(g.observe().cart);
  let calls = 0;
  global.fetch = async (_url, init) => {
    const wire = JSON.parse(init.body), current = JSON.parse(wire.messages[1].content);
    calls++;
    if (calls === 1) {
      const miss = current.availableChoices.find(choice => choice.action.productId === product.id && choice.dragOutcome === 'miss');
      assert.ok(miss);
      return response({ choiceId: miss.id, durationMs: 0, reason: '바구니 옆에 내려놓는다', memory: wrongMemory() });
    }
    assert.equal(wire.messages.length, 2);
    assert.deepEqual(current.observation.result, { accepted: false, actionType: 'add', productId: product.id,
      quantity: 0, message: '상품이 장바구니에 담기지 않았어요.' });
    assert.deepEqual(current.memory, wrongMemory());
    assert.equal(current.observation.products.find(item => item.id === product.id).stock, product.stock);
    return response(choose(current, 'viewCart', current.memory));
  };
  const policy = createFeedbackLlmPolicy(options, 'failed-gesture');
  const miss = await policy(g.observeActor(), [], persona);
  assert.equal(miss.dragOutcome, 'miss');
  assert.equal(miss.action.quantity, 1);
  g.execute(step('dragProduct', { productId: miss.action.productId, quantity: miss.action.quantity,
    gesture: { outcome: miss.dragOutcome, durationMs: 100, hesitationMs: 0 } }));
  assert.deepEqual(g.observe().cart, beforeCart);
  const next = await policy(g.observeActor(), [miss], persona);
  assert.equal(next.action.type, 'viewCart');
  assert.equal(calls, 2);
});

test('terminal observations never trigger a model request or expose a hypothetical verdict', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('terminal data must never be sent'); };
  const g = guard();
  g.execute(step('giveUp'));
  const terminal = { ...g.observeActor(), evaluation: { correct: sentinel }, feedback: { expectedAnswer: sentinel } };
  await assert.rejects(createFeedbackLlmPolicy(options, 'terminal')(terminal, [], persona), /No supported feedback UI controls/);
  assert.equal(calls, 0);
});

test('three invalid belief/selection formats execute no actor action and do not fall back to another policy', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0;
  const checkpoints = [], currentFrames = [];
  global.fetch = async (_url, init) => {
    const wire = JSON.parse(init.body), current = JSON.parse(wire.messages[1].content);
    currentFrames.push(current);
    assert.deepEqual(wire.messages.map(message => message.role), ['system', 'user']);
    assert.deepEqual(current.memory, emptyFeedbackBeliefMemory());
    assert.equal(current.observation.sequence, currentFrames[0].observation.sequence);
    calls++;
    const selection = choose(current, 'pause');
    if (calls === 1) selection.memory.rememberedItems = [{ name: '틀린 형식', quantity: 100, certainty: 'clear', status: 'done' }];
    if (calls === 2) selection.choiceId = 'not-an-available-choice';
    if (calls === 3) selection.memory.snapshot = sentinel;
    return response(selection);
  };
  await assert.rejects(generateTrace({ personaId: persona.id, seed: 'invalid-schema', snapshot: snapshot(), mode: 'llm',
    actorPolicyVersion: 'feedback-choice-v1', llm: options, onCheckpoint: checkpoint => checkpoints.push(checkpoint) }),
  /invalid choice\/memory after 3 attempts; no stochastic fallback/);
  assert.equal(calls, 3);
  assert.deepEqual(checkpoints, [], 'no model-selected action reached the simulator');
  assert.equal(currentFrames[0].formatCorrection, undefined);
  assert.match(currentFrames[1].formatCorrection, /No action has executed/);
  assert.match(currentFrames[2].formatCorrection, /Keep your intended choice and beliefs/);
});

test('a schema repair repeats the unchanged frame without importing the rejected response as memory', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0;
  const g = guard(), before = g.observeActor();
  global.fetch = async (_url, init) => {
    const wire = JSON.parse(init.body), current = JSON.parse(wire.messages[1].content);
    calls++;
    assert.equal(wire.messages.length, 2);
    assert.deepEqual(current.memory, emptyFeedbackBeliefMemory());
    const selection = choose(current, 'pause', wrongMemory());
    if (calls < 3) selection.durationMs = 0;
    return response(selection);
  };
  const policy = createFeedbackLlmPolicy(options, 'repair');
  const selected = await policy(before, [], persona);
  assert.equal(calls, 3);
  assert.equal(selected.action.type, 'pause');
  assert.equal(selected.delayMs, 0);
  assert.equal(selected.action.durationMs, 450);
  assert.deepEqual(selected.feedbackMemory, wrongMemory());
  assert.deepEqual(g.observeActor(), before, 'the HTTP provider has no game action executor');
  assert.equal(selected.exchange.response.attempts.length, 3);
});

test('legacy delay and nonzero ordinary duration are format failures rather than silently removed waits', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  for (const legacy of [false, true]) {
    let calls = 0;
    global.fetch = async (_url, init) => {
      const wire = JSON.parse(init.body), current = JSON.parse(wire.messages[1].content);
      calls++;
      const selection = choose(current, 'giveUp', wrongMemory());
      if (legacy) {
        delete selection.durationMs;
        selection.delayMs = 800;
      } else selection.durationMs = 800;
      if (calls > 1) {
        assert.match(current.formatCorrection, /delayMs is not accepted/);
        assert.match(current.formatCorrection, /must be 0 for ordinary actions/);
        assert.deepEqual(current.memory, emptyFeedbackBeliefMemory());
      }
      return response(selection);
    };
    const g = guard(), before = g.observeActor();
    await assert.rejects(createFeedbackLlmPolicy(options, `invalid-duration-${legacy}`)(before, [], persona),
      /invalid choice\/memory after 3 attempts/);
    assert.equal(calls, 3);
    assert.deepEqual(g.observeActor(), before);
  }
});

test('optional cart and help inspection time is preserved on the action with zero preceding wait', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  for (const type of ['viewCart', 'viewHelp']) for (const durationMs of [0, 3456]) {
    global.fetch = async (_url, init) => {
      const current = JSON.parse(JSON.parse(init.body).messages[1].content);
      return response({ ...choose(current, type, wrongMemory()), durationMs });
    };
    const selected = await createFeedbackLlmPolicy(options, `${type}-${durationMs}`)(guard().observeActor(), [], persona);
    assert.equal(selected.delayMs, 0);
    assert.deepEqual(selected.action, { type, durationMs });
    assert.deepEqual(selected.feedbackMemory, wrongMemory());
  }
});

test('HTTP and transport failure stop immediately without actions, retries or stochastic fallback', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  for (const kind of ['http', 'transport']) {
    let calls = 0;
    const checkpoints = [];
    global.fetch = async () => {
      calls++;
      if (kind === 'transport') throw new Error('fixture transport unavailable');
      return new Response('fixture failure', { status: 503 });
    };
    await assert.rejects(generateTrace({ personaId: persona.id, seed: `failure-${kind}`, snapshot: snapshot(), mode: 'llm',
      actorPolicyVersion: 'feedback-choice-v1', llm: options, onCheckpoint: checkpoint => checkpoints.push(checkpoint) }),
    kind === 'http' ? /HTTP 503; no stochastic fallback/ : /fixture transport unavailable/);
    assert.equal(calls, 1);
    assert.deepEqual(checkpoints, []);
  }
});
