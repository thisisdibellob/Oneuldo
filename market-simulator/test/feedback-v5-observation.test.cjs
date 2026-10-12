const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../runtime.cjs');
const { TraceGuard } = require('../src/traceValidation.ts');
const { FEEDBACK_CHECKOUT_SCREEN_TEXT } = require('../src/feedbackScreenText.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { marketMission, marketProducts, getMarketProduct } = require('../../frontend/src/game/scenarios.ts');

const step = (type, extra = {}) => ({ id: `fixture-${type}`, type, reactionDelayMs: 0,
  timeoutMs: 120000, reason: 'Mechanical observation fixture', ...extra });
const makeSnapshot = (config = {}, mission) => createMarketReplaySnapshot(createMarketSession({
  seed: 'rich-feedback-observation', environment: { cashierCount: 2, kioskLane: 'none' }, ...config,
}), mission);
// Routing here prepares UI states for a mechanical test; it is never supplied to an actor.
const guard = (snapshot, rich = true) => new TraceGuard(snapshot, undefined, undefined, undefined,
  false, true, true, true, rich);
const walk = (g, stationId) => g.execute(step('walkTo', { target: { stationId },
  movement: { style: 'steady', speedMultiplier: 1, motorSeed: 'observation-fixture', running: false, accelerationMs: 200 } }));
const openAndAdd = (g, categoryId = 'fresh', productId) => {
  walk(g, categoryId);
  g.execute(step('openShelf', { stationId: categoryId }));
  const product = productId ? g.observeActor().products.find(item => item.id === productId) : g.observeActor().products[0];
  assert.ok(product);
  g.execute(step('dragProduct', { productId: product.id, quantity: 1,
    gesture: { durationMs: 500, hesitationMs: 0, outcome: 'drop', motorSeed: 'observation-fixture' } }));
  return product;
};
const checkout = g => {
  walk(g, 'checkout');
  g.execute(step('checkout', { checkoutId: 'checkout' }));
};

test('rich cart labels follow actual cart surfaces and disappear when the cart is closed or the run ends', () => {
  const g = guard(makeSnapshot());
  assert.equal(g.observeActor().cartItems, undefined);
  const product = openAndAdd(g);
  assert.equal(g.observeActor().cartItems, undefined, 'an open shelf does not expose its collapsed basket');
  g.execute(step('viewCart'));
  assert.deepEqual(g.observeActor().cartItems, [{ id: product.id, name: product.name, quantity: 1 }],
    'the shelf basket does not render the catalog detail text');
  assert.deepEqual(g.observeActor().cart, { [product.id]: 1 });
  g.execute(step('closeView'));
  assert.equal(g.observeActor().cartItems, undefined);
  g.execute(step('closeStation'));
  g.execute(step('viewCart'));
  const expected = [{ id: product.id, name: product.name, quantity: 1, detail: getMarketProduct(product.id).detail }];
  assert.deepEqual(g.observeActor().cartItems, expected, 'the world CartContents component renders detail');
  const copy = g.observeActor().cartItems;
  copy[0].quantity = 99;
  copy[0].name = 'mutated output';
  assert.deepEqual(g.observeActor().cartItems, expected, 'labels are a detached projection, not a mutable game reference');
  g.execute(step('giveUp'));
  assert.equal(g.observeActor().cartItems, undefined, 'terminal state is not an exposed cart surface');
});

test('cart label restoration adds no stock, category, hidden objectives or unpurchased catalog entries', () => {
  const inventoryProductIds = { fresh: ['milk', ...marketProducts.filter(p => p.categoryId === 'fresh' && p.id !== 'milk').slice(0, 11).map(p => p.id)] };
  const snapshots = [
    makeSnapshot({ stockPerProduct: 4, inventoryProductIds, objectives: [{ productId: 'milk', quantity: 1, match: 'exact' }] }),
    makeSnapshot({ stockPerProduct: 9, inventoryProductIds, objectives: [{ productId: 'apple', quantity: 3, match: 'exact' }] }),
  ];
  const guards = snapshots.map(snapshot => guard(snapshot));
  for (const g of guards) {
    openAndAdd(g, 'fresh', 'milk');
    g.execute(step('viewCart'));
  }
  assert.deepEqual(guards[0].observeActor(), guards[1].observeActor(),
    'hidden stock and goal changes cannot alter an otherwise identical exposed cart');
  const o = guards[0].observeActor();
  assert.deepEqual(o.cartItems.map(item => item.id), Object.keys(o.cart));
  assert.deepEqual(Object.keys(o.cartItems[0]).sort(), ['id', 'name', 'quantity']);
  assert.equal(o.readObjectives, undefined);
  assert.equal(o.objectives, undefined);
  assert.equal(o.cartItems[0].categoryId, undefined);
  assert.equal(o.cartItems[0].stock, undefined);
  assert.equal(o.cartItems[0].matchesGoal, undefined);
});

test('checkout observation restores the existing final-purchase UI text and currently shown cart metadata', () => {
  const mission = { ...marketMission, checkoutDialogue: ['실제 미션의 계산 안내'] };
  const g = guard(makeSnapshot({}, mission));
  const product = openAndAdd(g);
  g.execute(step('closeStation'));
  checkout(g);
  const o = g.observeActor();
  assert.deepEqual(o.instructions, { phase: 'checkout', lines: [
    '이대로 구매할까요?', ...mission.checkoutDialogue, '구매를 확정하면 이번 시도가 기록되고 결과가 나와요.',
  ] });
  assert.deepEqual(o.cartItems, [{ id: product.id, name: product.name, quantity: 1, detail: getMarketProduct(product.id).detail }]);
  assert.equal(o.readObjectives, undefined, 'checkout clarification does not reread the list');
  assert.equal(o.missingItems, undefined);
  assert.equal(o.matchesGoal, undefined);
});

test('empty-counter checkout shows its existing unavailable branch without a false purchase-confirmation cue', () => {
  const mission = { ...marketMission, checkoutDialogue: ['This ready-only dialogue must stay hidden'] };
  const g = guard(makeSnapshot({ environment: { cashierCount: 0, kioskLane: 'none' } }, mission));
  checkout(g);
  assert.deepEqual(g.observeActor().instructions, { phase: 'checkout', lines: [
    '계산원이 자리를 비웠어요', '다른 계산대나 무인 계산대를 살펴보세요. 유인 계산대가 모두 비었다면 직원에게 부탁해요.',
  ] });
  assert.deepEqual(g.observeActor().cartItems, []);
});

test('legacy observation defaults remain byte-identical to explicit opt-out and rich mode changes no game state', () => {
  const mission = { ...marketMission, checkoutDialogue: ['기존 계산 안내'] };
  const snapshot = makeSnapshot({}, mission);
  const oldDefault = new TraceGuard(snapshot, undefined, undefined, undefined, false, true, true, true);
  const explicitOff = guard(snapshot, false);
  const rich = guard(snapshot);
  const all = [oldDefault, explicitOff, rich];
  const compare = () => {
    assert.equal(JSON.stringify(oldDefault.observeActor()), JSON.stringify(explicitOff.observeActor()));
    assert.equal(oldDefault.observeActor().cartItems, undefined);
    assert.deepEqual(rich.observe(), oldDefault.observe(), 'enriching observation must not mutate the shared game');
  };
  compare();
  for (const g of all) { openAndAdd(g); g.execute(step('viewCart')); }
  compare();
  for (const g of all) { g.execute(step('closeView')); g.execute(step('closeStation')); checkout(g); }
  compare();
  assert.deepEqual(oldDefault.observeActor().instructions, { phase: 'checkout', lines: mission.checkoutDialogue });
  const stripped = rich.observeActor();
  delete stripped.cartItems;
  stripped.instructions = oldDefault.observeActor().instructions;
  assert.equal(JSON.stringify(stripped), JSON.stringify(oldDefault.observeActor()), 'no other legacy observation field changes');
});

test('restored checkout copy matches the actual aiAssessment screen source', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/MarketSimulationScreen.tsx'), 'utf8');
  const block = source.slice(source.indexOf('{aiAssessment && review === null'), source.indexOf('{!aiAssessment && !briefing && session.phase'));
  for (const text of Object.values(FEEDBACK_CHECKOUT_SCREEN_TEXT)) assert.ok(block.includes(text), text);
  assert.match(block, /<CartContents cart=\{session\.cart\}/);
  assert.match(block, /text="구매 확정"/);
});

test('rich actor frames preserve false beliefs and expose only allowed cart fields', () => {
  const { buildFeedbackActorFrame, projectFeedbackObservation } = require('../src/feedbackActor.ts');
  const { FeedbackMovementPolicy } = require('../src/feedbackMovementPolicy.ts');
  const { FeedbackExperience } = require('../src/feedbackExperience.ts');
  const { getPersona } = require('../src/personas.ts');
  const g = guard(makeSnapshot());
  openAndAdd(g);
  g.execute(step('viewCart'));
  const observation = g.observeActor();
  Object.assign(observation.cartItems[0], { stock: 'HIDDEN', categoryId: 'HIDDEN', correct: 'HIDDEN' });
  const memory = { rememberedItems: [{ name: '실제로 없는 믿음', quantity: 99, certainty: 'clear', status: 'done' }],
    currentTask: null, ongoingIntent: null, notes: ['배우의 잘못된 믿음'] };
  for (const policyVersion of ['feedback-choice-v5', 'feedback-choice-v6']) {
    const frame = buildFeedbackActorFrame({ observation, policyVersion, memory,
      persona: getPersona('mild-intellectual-disability-adult'), seed: 'cart-projection', decisionIndex: 0,
      movementPolicy: new FeedbackMovementPolicy('cart-projection', {}, 'exploration-v2').prepare(observation, 0),
      experience: new FeedbackExperience().snapshot(observation) });
    assert.deepEqual(frame.memory, memory);
    assert.doesNotMatch(JSON.stringify(frame.observation), /HIDDEN/);
    assert.equal(frame.observation.cartItems.length, 1);
  }
  for (const policyVersion of ['feedback-choice-v1', 'feedback-choice-v2', 'feedback-choice-v3', 'feedback-choice-v4'])
    assert.equal(projectFeedbackObservation(observation, policyVersion).cartItems, undefined);
});
