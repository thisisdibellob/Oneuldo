const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { StochasticPolicy } = require('../src/stochasticPolicy.ts');
const { PersonaContext } = require('../src/personaContext.ts');
const { getPersona } = require('../src/personas.ts');
const { createMarketAgentAdapter } = require('../../frontend/src/game/marketSession.ts');
const { marketProducts } = require('../../frontend/src/game/scenarios.ts');

const original = () => getPersona('mild-intellectual-disability-adult');
function persona(overrides = {}, unfamiliar = false) {
  const value = original();
  Object.assign(value.parameters, { hesitationProbability: 0, helpProbability: 0, recheckProbability: 0 }, overrides);
  if (unfamiliar) Object.assign(value.character, { familiarCategories: [], familiarProductIds: [] });
  return value;
}
function adapter() {
  return createMarketAgentAdapter({ seed: 'contextual-policy-test', provenance: {
    source: 'synthetic', agentModel: 'contextual-policy-test', personaId: original().id, personaVersion: original().version,
  } });
}
// Public observations let policy units compare the same shelf under controlled personal histories.
// No hidden objective IDs, evaluation counters or full audit events are supplied to the policy.
function shelf(goalCount = 3, quantity = 2) {
  const observed = adapter().observe();
  const products = ['milk', 'low-fat-milk', 'chocolate-milk'].map(id => {
    const { categoryId, name, detail, price } = marketProducts.find(p => p.id === id);
    return { id, categoryId, name, detail, price };
  });
  return { ...observed, activeStation: 'fresh', products, stock: Object.fromEntries(products.map(p => [p.id, 6])),
    objectives: [{ id: 'objective-1', label: products[0].name, quantity, match: 'exact' },
      ...['사과', '순한 카레', '생수', '세제'].slice(0, goalCount - 1).map((label, i) => ({ id: `objective-${i + 2}`, label, quantity: 1, match: 'family' }))],
  };
}

test('familiar single-step choices do not manufacture label or quantity errors even at extreme base rates', () => {
  for (let i = 0; i < 40; i++) {
    const policy = new StochasticPolicy(persona({ confusionProbability: 1, quantitySlipProbability: 1 }), `simple-${i}`);
    const decision = policy.next(shelf(1, 1));
    assert.deepEqual(decision.action, { type: 'add', productId: 'milk', quantity: 1 });
    assert.match(decision.reason, /use-familiar-product-strategy/);
  }
});

test('prior familiarity changes processing time for the same visible task before any purchase', () => {
  let familiarTime = 0, unfamiliarTime = 0;
  for (let i = 0; i < 360; i++) {
    const parameters = { confusionProbability: 0, quantitySlipProbability: 0 };
    const known = new StochasticPolicy(persona(parameters), `processing-${i}`).next(shelf());
    const novel = new StochasticPolicy(persona(parameters, true), `processing-${i}`).next(shelf());
    assert.deepEqual(known.action, novel.action);
    familiarTime += known.delayMs;
    unfamiliarTime += novel.delayMs;
  }
  assert.ok(unfamiliarTime > familiarTime * 1.1, JSON.stringify({ familiarTime, unfamiliarTime }));
});

test('similar-label mistakes depend on unfamiliar multi-condition context, not only a persona-wide error rate', () => {
  let familiarErrors = 0, unfamiliarErrors = 0;
  for (let i = 0; i < 180; i++) {
    const parameters = { confusionProbability: .6, quantitySlipProbability: 0 };
    const known = new StochasticPolicy(persona(parameters), `labels-${i}`).next(shelf(5));
    const novel = new StochasticPolicy(persona(parameters, true), `labels-${i}`).next(shelf(5));
    if (known.action.productId !== 'milk') familiarErrors++;
    if (novel.action.productId !== 'milk') {
      unfamiliarErrors++;
      assert.match(novel.reason, /similar-visible-labels/);
    }
  }
  assert.ok(unfamiliarErrors > familiarErrors + 20, JSON.stringify({ familiarErrors, unfamiliarErrors }));
});

test('fresh basket confirmation prevents slips on a simple familiar next quantity', () => {
  let uncheckedSlips = 0;
  const observed = shelf(3, 2);
  for (let i = 0; i < 120; i++) {
    const profile = persona({ confusionProbability: 0, quantitySlipProbability: 1 });
    const unchecked = new StochasticPolicy(profile, `quantities-${i}`).next(observed);
    if (unchecked.action.quantity !== 2) {
      uncheckedSlips++;
      assert.match(unchecked.reason, /several-quantities-to-track/);
    }
    const checked = new StochasticPolicy(profile, `quantities-${i}`);
    const opened = { ...observed, view: 'cart', cart: {} };
    checked.onResult({ type: 'viewCart' }, observed, opened);
    checked.onResult({ type: 'closeView' }, opened, observed);
    assert.deepEqual(checked.next(observed).action, { type: 'add', productId: 'milk', quantity: 2 });
  }
  assert.ok(uncheckedSlips > 10, `comparison must include actual slips, got ${uncheckedSlips}`);
});

test('unexplained failures accumulate stress, walking preserves it, and visible support permits recovery', () => {
  const context = new PersonaContext(original());
  const observed = shelf();
  const first = { ...observed, phase: 'feedback', attempts: 1, feedback: { success: false } };
  const second = { ...first, attempts: 2 };
  context.record({ type: 'submit' }, observed, first);
  const once = context.snapshot(first);
  context.record({ type: 'submit' }, first, second);
  const repeated = context.snapshot(second);
  assert.ok(repeated.stress > once.stress);
  assert.ok(repeated.confidence < once.confidence);
  for (let i = 0; i < 60; i++) context.record({ type: 'move', dx: 24, dy: 0 }, observed, observed);
  assert.equal(context.snapshot(observed).stress, repeated.stress);
  context.record({ type: 'viewHelp' }, observed, { ...observed, view: 'help' });
  context.record({ type: 'viewCart' }, observed, { ...observed, view: 'cart', cart: {} });
  const supported = context.snapshot(observed);
  assert.ok(supported.stress < repeated.stress);
  assert.ok(supported.support > repeated.support);
  assert.ok(supported.memoryLoad < repeated.memoryLoad);
});

test('a rejected movement recovers by closing its blocking view, while repeated identical rejection is bounded', () => {
  const game = adapter();
  const policy = new StochasticPolicy(original(), 'recovery');
  let before = game.observe();
  let after = game.act({ type: 'viewCart' });
  policy.onResult({ type: 'viewCart' }, before, after);
  const blocked = { type: 'move', dx: 24, dy: 0 };
  before = after;
  after = game.act(blocked);
  assert.ok(after.lastActionError);
  policy.onResult(blocked, before, after);
  const recovery = policy.next(after);
  assert.equal(recovery.action.type, 'closeView');
  assert.match(recovery.reason, /recover-rejected-action/);
  assert.equal(game.act(recovery.action).lastActionError, null);

  const stuck = new StochasticPolicy(original(), 'bounded-recovery');
  for (let i = 0; i < 3; i++) stuck.onResult(blocked, before, after);
  assert.equal(stuck.next(after).action.type, 'giveUp');
});
