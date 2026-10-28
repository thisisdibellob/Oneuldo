const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('../runtime.cjs');
const { FEEDBACK_ACTOR_POLICY_VERSION, buildFeedbackActorFrame, emptyFeedbackBeliefMemory,
  carryFeedbackBeliefMemory, validateFeedbackBeliefMemory, projectFeedbackObservation,
  feedbackDecisionFromChoice, feedbackChoiceMatchesDecision, isExperienceFeedbackPolicy,
  isStructuredFeedbackPolicy, isFeedbackActorPolicy } = require('../src/feedbackActor.ts');
const { FeedbackExperience } = require('../src/feedbackExperience.ts');
const { getPersona } = require('../src/personas.ts');

const persona = getPersona('mild-intellectual-disability-adult');
const observation = (extra = {}) => ({ schemaVersion: 'attention-observation-v1', sequence: 0, elapsedMs: 0,
  phase: 'shopping', view: 'world', activeStation: null, listAvailable: true,
  visibleStations: [], anchors: [], products: [], shelf: null, cart: null, cashiers: {}, lastActionError: null, ...extra });
const product = (id, stock) => ({ id, name: `보이는 ${id}`, categoryId: 'meal', detail: '현재 상품 설명', price: 1000, stock });
const shelf = () => observation({ activeStation: 'meal', listAvailable: false,
  products: [product('zero', 0), product('one', 1), product('six', 6), product('many', 101)],
  shelf: { page: 0, pageCount: 2, scrollFraction: 0, pageFractions: [0, 1] } });
const frame = (o, policyVersion = 'feedback-choice-v5', extra = {}) => buildFeedbackActorFrame({
  observation: o, policyVersion, persona, memory: emptyFeedbackBeliefMemory(policyVersion), seed: 'fixture', decisionIndex: 0,
  ...(policyVersion === 'feedback-choice-v3' || isExperienceFeedbackPolicy(policyVersion) ? {
    movementPolicy: { version: policyVersion === 'feedback-choice-v3' ? 'exploration-v1' : 'exploration-v2',
      mode: 'actor-choice', eligible: true, wanderProbability: .2, roll: .6, avoidedDirections: [] },
  } : {}),
  ...(isExperienceFeedbackPolicy(policyVersion) ? { experience: new FeedbackExperience().snapshot(o) } : {}), ...extra,
});
const decide = (choice, parameters) => feedbackDecisionFromChoice(choice, choice.timing?.minimumMs ?? 0,
  '현재 선택을 수행한다', emptyFeedbackBeliefMemory('feedback-choice-v5'), parameters);
const key = decision => JSON.stringify({ action: Object.fromEntries(Object.entries(decision.action).sort()),
  dragOutcome: decision.dragOutcome ?? 'drop' });
function expand(choices) {
  const decisions = [];
  for (const choice of choices) {
    if (!choice.catalog) { decisions.push(decide(choice)); continue; }
    for (const p of choice.catalog) for (let quantity = p.quantity.minimum; quantity <= p.quantity.maximum; quantity++) {
      if (choice.action.type === 'remove') decisions.push(decide(choice, { productId: p.productId, quantity }));
      else for (const dragOutcome of p.dragOutcomes) {
        if (dragOutcome !== 'drop' && quantity !== p.nonDropQuantity) continue;
        decisions.push(decide(choice, { productId: p.productId, quantity, dragOutcome }));
      }
    }
  }
  return decisions.map(key).sort();
}

test('v7 is the default while explicit v1-v6 retain every legacy instruction byte', () => {
  assert.equal(FEEDBACK_ACTOR_POLICY_VERSION, 'feedback-choice-v7');
  // Captured from the immutable pre-v5 5x300 source, with the same exploration context.
  const legacy = ['61fdb6c1eb4b683c23333270879288f4e4fdec6f1a2936c540e29407ef0c3942',
    '02b6121beed48d899fc39c5b0f2410800e329a9cb0a980748897ad2272b56525',
    'c4432f91094fd17233ae25925b0792f02bd35fc87f9808a3d82b686c9ccdc476',
    '7db64805d17a5bdcbcb99113ae2a4758e6a2de919f80d347c8b5fd2dd5af3251'];
  for (let v = 1; v <= 6; v++) {
    const policy = `feedback-choice-v${v}`;
    assert.equal(isFeedbackActorPolicy(policy), true);
    assert.equal(isExperienceFeedbackPolicy(policy), v >= 4);
    assert.equal(isStructuredFeedbackPolicy(policy), v >= 5);
    if (v <= 4) assert.equal(createHash('sha256').update(frame(observation(), policy).instructions).digest('hex'), legacy[v - 1]);
  }
  assert.equal(isFeedbackActorPolicy('feedback-choice-v14'), false);
  const o = shelf();
  assert.deepEqual(projectFeedbackObservation(observation({ view: 'cart', cart: { curry: 1 }, cartItems: [
    { id: 'curry', name: '순한 카레', quantity: 1 }] })).cartItems, [{ id: 'curry', name: '순한 카레', quantity: 1 }]);
});

test('representative v4 frames match frozen bytes, while v5 and v6 differ only in policy and instructions', () => {
  const probes = [
    [observation(), 'dd5a4a9a6b69e4b03e59fbbeb0cce2574dcb872f1a097c81b9d3d928d475e9cb'],
    [shelf(), '868a934f202341f3bc5e598e6a2e5650030c85d6e324476e5197ca2046504aed'],
    [observation({ view: 'cart', activeStation: 'meal', listAvailable: false, cart: { curry: 4, milk: 2 },
      removableProductIds: ['curry'], cartItems: [{ id: 'curry', name: '순한 카레', quantity: 4 },
        { id: 'milk', name: '우유', quantity: 2 }] }), '65da02f38c88b103e99f407f50227e37527544e35fe0c51fb445840c800d578a'],
    [observation({ phase: 'checkout', activeStation: 'checkout', listAvailable: false, cart: {}, cartItems: [],
      cashiers: { checkout: true } }), '48dbdeda5f66c7a4705ca271104c52aa2760fcdf1deaa5337b2b672b033a6ca1'],
  ];
  for (const [o, frozenHash] of probes) {
    assert.equal(createHash('sha256').update(JSON.stringify(frame(o, 'feedback-choice-v4'))).digest('hex'), frozenHash);
    const v5 = frame(o), v6 = frame(o, 'feedback-choice-v6');
    delete v5.policyVersion; delete v6.policyVersion; delete v5.instructions; delete v6.instructions;
    assert.deepEqual(v5, v6);
  }
});

test('grouped add catalogs expand to exactly the v4 actions including quantity caps and one-item failed gestures', () => {
  const o = shelf(), old = frame(o, 'feedback-choice-v4');
  for (const policy of ['feedback-choice-v5', 'feedback-choice-v6']) {
    const current = frame(o, policy);
    assert.deepEqual(expand(current.availableChoices), expand(old.availableChoices));
    const choices = current.availableChoices.filter(c => c.action.type === 'add');
    assert.equal(choices.length, 1);
    assert.deepEqual(choices[0].action, { type: 'add' }, 'no default product or quantity may choose for the actor');
    assert.deepEqual(choices[0].catalog.map(p => [p.productId, p.quantity.maximum]), [['one', 1], ['six', 6], ['many', 99]]);
    assert.deepEqual(choices[0].parameterSchema.required, ['productId', 'quantity', 'dragOutcome']);
    assert.ok(current.availableChoices.some(c => c.action.type === 'giveUp'));
  }
});

test('remove grouping preserves only currently removable products and all their quantities with visible names', () => {
  const o = observation({ view: 'cart', activeStation: 'meal', listAvailable: false,
    cart: { curry: 4, milk: 2 }, removableProductIds: ['curry'],
    cartItems: [{ id: 'curry', name: '순한 카레', quantity: 4 }, { id: 'milk', name: '우유', quantity: 2 }] });
  const current = frame(o), choice = current.availableChoices.find(c => c.action.type === 'remove');
  assert.deepEqual(expand(current.availableChoices), expand(frame(o, 'feedback-choice-v4').availableChoices));
  assert.deepEqual(choice.catalog, [{ productId: 'curry', name: '순한 카레', quantity: { minimum: 1, maximum: 4 } }]);
  assert.deepEqual(choice.parameterSchema.required, ['productId', 'quantity']);
  assert.throws(() => decide(choice, { productId: 'milk', quantity: 1 }), /catalog/);
  assert.throws(() => decide(choice, { productId: 'curry', quantity: 1, dragOutcome: 'drop' }), /required catalog fields/);
  assert.equal(feedbackChoiceMatchesDecision(choice, decide(choice, { productId: 'curry', quantity: 4 })), true);
});

test('parameters reject absent, malformed, extra, unseen and out-of-range selections without semantic correction', () => {
  const choice = frame(shelf()).availableChoices.find(c => c.action.type === 'add');
  for (const parameters of [undefined, null, {}, [], { productId: 'one', quantity: 1 },
    { productId: 'hidden', quantity: 1, dragOutcome: 'drop' }, { productId: 'one', quantity: 2, dragOutcome: 'drop' },
    { productId: 'six', quantity: 0, dragOutcome: 'drop' }, { productId: 'six', quantity: 1.5, dragOutcome: 'drop' },
    { productId: 'six', quantity: '1', dragOutcome: 'drop' }, { productId: 'six', quantity: 2, dragOutcome: 'cancel' },
    { productId: 'six', quantity: 2, dragOutcome: 'miss' }, { productId: 'six', quantity: 1, dragOutcome: 'unexpected' },
    { productId: 'six', quantity: 1, dragOutcome: 'drop', expectedAnswer: 'one' }]) assert.throws(() => decide(choice, parameters));
  for (const dragOutcome of ['drop', 'miss', 'cancel']) {
    const parameters = { productId: 'six', quantity: 1, dragOutcome }, decision = decide(choice, parameters);
    assert.equal(feedbackChoiceMatchesDecision(choice, decision), true);
    assert.equal(feedbackChoiceMatchesDecision(choice, decision, parameters), true);
    assert.equal(feedbackChoiceMatchesDecision(choice, decision, { ...parameters, productId: 'one' }), false);
    const corrupted = structuredClone(decision); corrupted.action.quantity = 7;
    assert.equal(feedbackChoiceMatchesDecision(choice, corrupted), false);
  }
  const stop = frame(shelf()).availableChoices.find(c => c.action.type === 'giveUp');
  assert.throws(() => decide(stop, {}), /only allowed/);
  assert.throws(() => feedbackDecisionFromChoice(choice, 10, '담는다', emptyFeedbackBeliefMemory(),
    { productId: 'one', quantity: 1, dragOutcome: 'drop' }), /ordinary actions require 0/);
  const memory = { rememberedItems: [{ name: '다른 물건', quantity: 1, certainty: 'clear', status: 'done' }],
    currentTask: '한 개 고르기', notes: [] };
  const selected = feedbackDecisionFromChoice(choice, 0, '한 개 담는다', memory,
    { productId: 'six', quantity: 4, dragOutcome: 'drop' });
  assert.equal(selected.action.quantity, 4, 'public reason and beliefs must not silently correct the authored selection');
  assert.deepEqual(selected.feedbackMemory, memory);
});

test('cart labels are current-screen only, deeply allowlisted, and absent from every legacy policy', () => {
  const o = observation({ view: 'cart', cart: { curry: 1 }, cartItems: [
    { id: 'curry', name: '순한 카레', detail: '현재 표시 설명', quantity: 1, goalMatch: 'HIDDEN' }], expectedAnswer: 'HIDDEN' });
  for (const policy of ['feedback-choice-v1', 'feedback-choice-v2', 'feedback-choice-v3', 'feedback-choice-v4'])
    assert.equal(projectFeedbackObservation(o, policy).cartItems, undefined);
  for (const policy of ['feedback-choice-v5', 'feedback-choice-v6']) {
    const projected = projectFeedbackObservation(o, policy);
    assert.deepEqual(projected.cartItems, [{ id: 'curry', name: '순한 카레', detail: '현재 표시 설명', quantity: 1 }]);
    assert.doesNotMatch(JSON.stringify(projected), /HIDDEN|goalMatch|expectedAnswer/);
    projected.cartItems[0].name = 'changed'; assert.equal(o.cartItems[0].name, '순한 카레');
    assert.equal(projectFeedbackObservation({ ...o, cart: null }, policy).cartItems, undefined);
  }
});

test('v6 changes motivation instructions only, preserving choices, persona, memory bounds and freedom to stop or forget', () => {
  const o = shelf(), v5 = frame(o), v6 = frame(o, 'feedback-choice-v6');
  for (const field of ['observation', 'persona', 'memory', 'availableChoices', 'movementPolicy', 'experience'])
    assert.deepEqual(v5[field], v6[field], field);
  assert.match(v5.instructions, /No goal must be retained, selected, completed or corrected/);
  assert.doesNotMatch(v6.instructions, /No goal must be retained, selected, completed or corrected/);
  assert.match(v6.instructions, /permitted outcomes, not activities to produce/);
  assert.match(v6.instructions, /No new memory or forced goal restoration/);
  const wrong = { ...emptyFeedbackBeliefMemory('feedback-choice-v5'),
    rememberedItems: [{ name: '보이지 않는 기억 속 물건', quantity: 9, certainty: 'clear', status: 'done' }],
    ongoingIntent: '카레 살펴보기' };
  for (const policy of ['feedback-choice-v5', 'feedback-choice-v6']) {
    assert.equal(validateFeedbackBeliefMemory(wrong, policy).valid, true);
    const next = carryFeedbackBeliefMemory(wrong, { rememberedItems: [], currentTask: null, notes: [] }, policy);
    assert.deepEqual(next.rememberedItems, []); assert.equal(next.ongoingIntent, wrong.ongoingIntent);
    assert.equal(carryFeedbackBeliefMemory(wrong, { ...next, ongoingIntent: null }, policy).ongoingIntent, null);
    assert.equal(validateFeedbackBeliefMemory({ ...wrong, goalPhase: 'find' }, policy).valid, false);
    assert.equal(validateFeedbackBeliefMemory({ ...wrong, notes: Array(9).fill('기억') }, policy).valid, false);
  }
});

test('v5/v6 keep v4 exploration freedoms and empty-cart submit, exposing real control effects without a completion gate', () => {
  const world = observation({ visibleStations: [{ id: 'meal', kind: 'shelf', label: '식사', direction: 'east', distanceBand: 'near', near: true }] });
  for (const policy of ['feedback-choice-v5', 'feedback-choice-v6']) {
    const movementPolicy = { version: 'exploration-v2', mode: 'random-wander', eligible: true,
      wanderProbability: 1, roll: .1, avoidedDirections: ['west'] };
    const current = frame(world, policy, { movementPolicy });
    assert.deepEqual(expand(current.availableChoices), expand(frame(world, 'feedback-choice-v4', { movementPolicy }).availableChoices));
    const checkout = frame(observation({ phase: 'checkout', activeStation: 'checkout', listAvailable: false,
      cart: {}, cartItems: [], cashiers: { checkout: true } }), policy);
    const submit = checkout.availableChoices.find(c => c.action.type === 'submit');
    assert.equal(submit.label, '구매 확정'); assert.match(submit.effect, /이번 시도가 기록되고 결과가 나와요/);
    assert.equal(decide(submit).action.type, 'submit');
    const back = checkout.availableChoices.find(c => c.action.type === 'closeStation');
    assert.equal(back.label, '다시 고르기'); assert.match(back.effect, /매장으로 돌아가/);
  }
});
