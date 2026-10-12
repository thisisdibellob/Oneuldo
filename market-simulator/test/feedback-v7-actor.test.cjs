const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('../runtime.cjs');
const { FEEDBACK_ACTOR_POLICY_VERSION, buildFeedbackActorFrame, emptyFeedbackBeliefMemory,
  validateFeedbackBeliefMemory, carryFeedbackBeliefMemory, projectFeedbackObservation,
  feedbackDecisionFromChoice, isExperienceFeedbackPolicy, isStructuredFeedbackPolicy,
  isFeedbackActorPolicy } = require('../src/feedbackActor.ts');
const { FeedbackExperience } = require('../src/feedbackExperience.ts');
const { getPersona } = require('../src/personas.ts');

const v7 = 'feedback-choice-v7';
const persona = getPersona('mild-intellectual-disability-adult');
const observation = (extra = {}) => ({ schemaVersion: 'attention-observation-v1', sequence: 0, elapsedMs: 0,
  phase: 'shopping', view: 'world', activeStation: null, listAvailable: true,
  visibleStations: [], anchors: [], products: [], shelf: null, cart: null, cashiers: {}, lastActionError: null, ...extra });
const frame = (o = observation(), policyVersion = v7, extra = {}) => buildFeedbackActorFrame({
  observation: o, policyVersion, persona, memory: emptyFeedbackBeliefMemory(policyVersion), seed: 'fixture', decisionIndex: 0,
  ...(policyVersion === 'feedback-choice-v3' || isExperienceFeedbackPolicy(policyVersion) ? {
    movementPolicy: { version: policyVersion === 'feedback-choice-v3' ? 'exploration-v1' : 'exploration-v2',
      mode: 'actor-choice', eligible: true, wanderProbability: .2, roll: .6, avoidedDirections: [] },
  } : {}),
  ...(isExperienceFeedbackPolicy(policyVersion) ? { experience: new FeedbackExperience({
    version: policyVersion === v7 ? 'bounded-observed-experience-v2' : 'bounded-observed-experience-v1',
  }).snapshot(o) } : {}), ...extra,
});
const item = (extra = {}) => ({ name: '관심 있는 카레', quantity: 1, certainty: 'clear', status: 'pending', ...extra });
const memory = (extra = {}) => ({ rememberedItems: [item()], currentTask: '고르기', notes: [], ongoingIntent: '카레 살펴보기', ...extra });
const shelf = () => observation({ activeStation: 'meal', listAvailable: false, products: [
  { id: 'curry', name: '카레', categoryId: 'meal', price: 1000, stock: 6 },
  { id: 'rice', name: '밥', categoryId: 'meal', price: 1500, stock: 1 },
], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } });
function expand(choices) {
  const actions = [];
  for (const choice of choices) {
    const run = parameters => {
      const decision = feedbackDecisionFromChoice(choice, choice.timing?.minimumMs ?? 0,
        '현재 선택', emptyFeedbackBeliefMemory(v7), parameters);
      actions.push(JSON.stringify({ action: Object.fromEntries(Object.entries(decision.action).sort()),
        dragOutcome: decision.dragOutcome ?? 'drop' }));
    };
    if (!choice.catalog) { run(); continue; }
    for (const product of choice.catalog) for (let quantity = product.quantity.minimum; quantity <= product.quantity.maximum; quantity++) {
      if (choice.action.type === 'remove') run({ productId: product.productId, quantity });
      else for (const dragOutcome of product.dragOutcomes) {
        if (dragOutcome !== 'drop' && quantity !== product.nonDropQuantity) continue;
        run({ productId: product.productId, quantity, dragOutcome });
      }
    }
  }
  return actions.sort();
}

test('v7 is default and explicit v1-v6 complete frames preserve frozen bytes', () => {
  assert.equal(FEEDBACK_ACTOR_POLICY_VERSION, v7);
  assert.equal(isFeedbackActorPolicy(v7), true);
  assert.equal(isExperienceFeedbackPolicy(v7), true);
  assert.equal(isStructuredFeedbackPolicy(v7), true);
  assert.equal(isFeedbackActorPolicy('feedback-choice-v8'), false);
  const hashes = [
    '3a7d745023f9ffcc7a038bdd079171b1bb309fbd83d32acf1a3b63f7fac34e66',
    '5979250eef39e3b26864371fd98a492fecc196cbb7190e6bc449e545fffd0c1d',
    '29ce697d4a3b551a06aedc9e4bdf7f08b68940b6e2cdb83aadb3959775d3c045',
    'dd5a4a9a6b69e4b03e59fbbeb0cce2574dcb872f1a097c81b9d3d928d475e9cb',
    '0cdf04bc45d4359c4eed0a2989a4609be3a810400e0a060ab6daf97972f51aea',
    '4cfcdb987fa08fe0f342aaabf2102b3861ff9149cd2b9706609bf3daafe26625',
  ];
  for (let v = 1; v <= 6; v++) assert.equal(createHash('sha256')
    .update(JSON.stringify(frame(observation(), `feedback-choice-v${v}`))).digest('hex'), hashes[v - 1], `v${v}`);
  assert.deepEqual(frame(), frame(observation(), v7, { policyVersion: undefined }));
  assert.throws(() => frame(observation(), v7, { experience: new FeedbackExperience().snapshot(observation()) }),
    /requires bounded-observed-experience-v2/);
});

test('v7 accepts optional fallible source and cart quantity without automatic completion or correction', () => {
  const beliefs = memory({ rememberedItems: [
    item({ source: 'list', quantity: 99, rememberedCartQuantity: 0, status: 'done' }),
    item({ name: null, source: 'uncertain', quantity: null, rememberedCartQuantity: null }),
    item({ source: 'personal', quantity: 0, rememberedCartQuantity: 99, status: 'abandoned' }),
    item(),
  ] });
  assert.deepEqual(validateFeedbackBeliefMemory(beliefs, v7), { valid: true, errors: [] });
  const o = observation({ view: 'cart', cart: {}, cartItems: [],
    readObjectives: [{ id: 'milk-goal', label: '우유', quantity: 1, match: 'exact' }] });
  assert.deepEqual(frame(o, v7, { memory: beliefs }).memory, beliefs,
    'visible contradictions do not repair source, counts or completion');
  const next = carryFeedbackBeliefMemory(beliefs, { rememberedItems: [item()], currentTask: '고르기', notes: [] }, v7);
  assert.equal(next.rememberedItems[0].source, undefined);
  assert.equal(next.rememberedItems[0].rememberedCartQuantity, undefined);
});

test('new item fields remain optional but reject malformed values and are not accepted in older contracts', () => {
  assert.equal(validateFeedbackBeliefMemory(memory(), v7).valid, true);
  for (const source of [null, undefined, 'verified', 1]) assert.equal(validateFeedbackBeliefMemory(
    memory({ rememberedItems: [item({ source })] }), v7).valid, false);
  for (const rememberedCartQuantity of [undefined, -1, 100, 1.5, '1', NaN, Infinity]) assert.equal(validateFeedbackBeliefMemory(
    memory({ rememberedItems: [item({ rememberedCartQuantity })] }), v7).valid, false);
  for (const field of [{ source: 'personal' }, { rememberedCartQuantity: 1 }]) for (let v = 1; v <= 6; v++) {
    const belief = { rememberedItems: [item(field)], currentTask: null, notes: [] };
    assert.equal(validateFeedbackBeliefMemory(belief, `feedback-choice-v${v}`).valid, false);
  }
  for (const override of [{ rememberedItems: Array(13).fill(item()) }, { notes: Array(9).fill('기억') },
    { rememberedItems: [item({ hiddenGoalId: 'answer' })] }])
    assert.equal(validateFeedbackBeliefMemory(memory(override), v7).valid, false);
  assert.equal(validateFeedbackBeliefMemory(memory({ rememberedItems: Array(12).fill(item()), notes: Array(8).fill('기억') }), v7).valid, true);
});

test('forgetting and intent carry semantics do not reconstruct optional item fields', () => {
  const before = memory({ rememberedItems: [item({ source: 'list', rememberedCartQuantity: 3 })] });
  const after = carryFeedbackBeliefMemory(before, { rememberedItems: [], currentTask: '장바구니 보기', notes: [] }, v7);
  assert.deepEqual(after.rememberedItems, []);
  assert.equal(after.ongoingIntent, before.ongoingIntent);
  assert.equal(carryFeedbackBeliefMemory(after, { ...after, ongoingIntent: null }, v7).ongoingIntent, null);
  const reduced = carryFeedbackBeliefMemory(before, { rememberedItems: [item()], currentTask: null, notes: [] }, v7);
  assert.deepEqual(reduced.rememberedItems, [item()]);
  reduced.rememberedItems[0].name = '다름';
  assert.equal(before.rememberedItems[0].name, '관심 있는 카레');
});

test('v7 current observation and persona match v6, with no extra hidden goal exposure', () => {
  const o = observation({ view: 'cart', cart: { curry: 3 }, cartItems: [
    { id: 'curry', name: '카레', detail: '표시된 설명', quantity: 3, hiddenGoalMatch: 'SECRET' }],
    expectedAnswer: 'SECRET', rememberedList: ['SECRET'] });
  const current = frame(o), previous = frame(o, 'feedback-choice-v6');
  assert.deepEqual(current.observation, previous.observation);
  assert.deepEqual(current.persona, previous.persona);
  assert.deepEqual(current.movementPolicy, previous.movementPolicy);
  assert.doesNotMatch(JSON.stringify(current), /SECRET|expectedAnswer|hiddenGoalMatch|rememberedList/);
  assert.equal(projectFeedbackObservation({ ...o, cart: null }, v7).cartItems, undefined);
});

test('all legal add/remove/movement/check/stop actions remain with precise increment descriptions', () => {
  const probes = [shelf(), observation({ view: 'cart', activeStation: 'meal', listAvailable: false,
    cart: { curry: 4, rice: 2 }, removableProductIds: ['curry'],
    cartItems: [{ id: 'curry', name: '카레', quantity: 4 }, { id: 'rice', name: '밥', quantity: 2 }] }),
  observation({ visibleStations: [{ id: 'meal', kind: 'shelf', label: '식사', direction: 'east', distanceBand: 'near', near: true }] }),
  observation({ phase: 'checkout', activeStation: 'checkout', listAvailable: false, cart: {}, cartItems: [], cashiers: { checkout: true } })];
  for (const o of probes) assert.deepEqual(expand(frame(o).availableChoices), expand(frame(o, 'feedback-choice-v6').availableChoices));
  const add = frame(shelf()).availableChoices.find(c => c.action.type === 'add');
  const remove = frame(probes[1]).availableChoices.find(c => c.action.type === 'remove');
  assert.match(add.effect, /MORE units.*not the desired final cart total/);
  assert.match(remove.effect, /TAKE OUT.*not how many should remain/);
  assert.deepEqual(remove.catalog.map(p => p.productId), ['curry']);
  assert.throws(() => feedbackDecisionFromChoice(remove, 0, '밥 빼기', memory(), { productId: 'rice', quantity: 1 }), /catalog/);
  const decision = feedbackDecisionFromChoice(remove, 0, '밥을 뺀다', memory({ rememberedItems: [item({ quantity: 1, rememberedCartQuantity: 4 })] }),
    { productId: 'curry', quantity: 2 });
  assert.deepEqual(decision.action, { type: 'remove', productId: 'curry', quantity: 2 });
  assert.equal(decision.feedbackMemory.rememberedItems[0].rememberedCartQuantity, 4,
    'selecting an action does not rewrite the pre-action remembered count');
});

test('an unchanged recent cart check does not filter choices or impose a next activity', () => {
  const o = observation(), experience = new FeedbackExperience({ version: 'bounded-observed-experience-v2' }).snapshot(o);
  experience.checks.cartViewedActionsAgo = 1;
  experience.checks.cartChangedSinceLastCartView = false;
  experience.checks.cartChangedSinceListRead = true;
  const current = frame(o, v7, { experience, memory: memory({ ongoingIntent: null }) });
  assert.deepEqual(current.availableChoices, frame(o).availableChoices);
  assert.ok(current.availableChoices.some(c => c.action.type === 'viewCart'));
  assert.ok(current.availableChoices.some(c => c.action.type === 'giveUp'));
  assert.equal(current.memory.ongoingIntent, null);
  assert.match(current.instructions, /permitted outcomes, not activities to produce/);
  assert.match(current.instructions, /cartChangedSinceLastCartView/);
  assert.match(current.instructions, /BEFORE the selected action executes/);
  assert.match(current.instructions, /rechecking, uncertainty and changing their mind remain possible/);
});
