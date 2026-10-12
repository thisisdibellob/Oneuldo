const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { FeedbackExperience, FEEDBACK_EXPERIENCE_VERSION, FEEDBACK_EXPERIENCE_V2_VERSION,
  FEEDBACK_EXPERIENCE_LIMITS } = require('../src/feedbackExperience.ts');

const observation = (extra = {}) => ({ schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world',
  activeStation: null, visibleStations: [], anchors: [], products: [], shelf: null, cart: null,
  cashiers: {}, listAvailable: true, ...extra });
const fresh = () => new FeedbackExperience({ version: FEEDBACK_EXPERIENCE_V2_VERSION });
const apply = (experience, action, { before = observation(), after = {}, result = { accepted: true, actionType: action.type },
  dragOutcome } = {}) => {
  const current = observation({ ...after, result });
  experience.record({ action, delayMs: 0, reason: 'private authored reason', dragOutcome,
    feedbackMemory: { rememberedItems: [], notes: ['private belief'], currentTask: 'private task' } }, before, current);
  return current;
};
const state = (experience, current = observation()) => experience.snapshot(current).checks.cartChangedSinceLastCartView;
const view = (experience, cart = { curry: 1 }) => apply(experience, { type: 'viewCart' }, { after: { view: 'cart', cart } });
const pause = experience => apply(experience, { type: 'pause', durationMs: 100 });

test('v7 cart change evidence requires an accepted, actually visible cart check', () => {
  const experience = fresh();
  assert.equal(state(experience), null);
  apply(experience, { type: 'readList', durationMs: 100 });
  assert.equal(state(experience), null);
  apply(experience, { type: 'viewCart' });
  assert.equal(state(experience), null);
  apply(experience, { type: 'viewCart' }, { after: { view: 'cart', cart: {} },
    result: { accepted: false, actionType: 'viewCart' } });
  assert.equal(state(experience), null);
  apply(experience, { type: 'viewCart' }, { after: { view: 'cart', cart: {} },
    result: { accepted: true, actionType: 'readList' } });
  assert.equal(state(experience), null);
  const checked = view(experience, {});
  assert.equal(state(experience, checked), false);
  assert.equal(experience.snapshot(checked).checks.cartViewedActionsAgo, 0);
  const closed = apply(experience, { type: 'closeView' }, { before: checked });
  assert.equal(state(experience, closed), false);
  assert.equal(experience.snapshot(closed).checks.cartViewedActionsAgo, 1);
});

test('v7 separates the list-read reference point from the last cart check', () => {
  const experience = fresh();
  apply(experience, { type: 'readList', durationMs: 100 });
  apply(experience, { type: 'add', productId: 'curry', quantity: 1 }, {
    result: { accepted: true, actionType: 'add', productId: 'curry', quantity: 1 },
  });
  const checked = view(experience);
  assert.equal(experience.snapshot(checked).checks.cartChangedSinceListRead, true);
  assert.equal(state(experience, checked), false);
  apply(experience, { type: 'closeView' }, { before: checked });
  apply(experience, { type: 'remove', productId: 'curry', quantity: 1 }, {
    result: { accepted: true, actionType: 'remove', productId: 'curry', quantity: 1 },
  });
  assert.equal(state(experience), true);
  apply(experience, { type: 'readList', durationMs: 100 });
  assert.equal(experience.snapshot(observation()).checks.cartChangedSinceListRead, false);
  assert.equal(state(experience), true);
  view(experience, {});
  assert.equal(state(experience), false);
});

test('v7 classifies applied mutation results without assuming requested quantities succeeded', async t => {
  const cases = [
    { label: 'successful add', type: 'add', result: { accepted: true, quantity: 2 }, expected: true },
    { label: 'successful removal', type: 'remove', result: { accepted: true, quantity: 1 }, expected: true },
    { label: 'successful staff return', type: 'requestReturn', result: { accepted: true, quantity: 1 }, expected: true },
    { label: 'rejected action', type: 'add', result: { accepted: false }, expected: false },
    { label: 'zero applied quantity', type: 'remove', result: { accepted: true, quantity: 0 }, expected: false },
    { label: 'missing applied quantity', type: 'add', result: { accepted: true }, expected: null },
    { label: 'unknown staff return outcome', type: 'requestReturn', result: { accepted: true }, expected: null },
    { label: 'negative quantity is not evidence', type: 'remove', result: { accepted: true, quantity: -1 }, expected: null },
    { label: 'NaN quantity is not evidence', type: 'add', result: { accepted: true, quantity: NaN }, expected: null },
    { label: 'infinite quantity is not evidence', type: 'add', result: { accepted: true, quantity: Infinity }, expected: null },
    { label: 'missing result', type: 'add', result: null, expected: null },
    { label: 'stale result from another action', type: 'add', result: { accepted: true, actionType: 'readList', quantity: 3 }, expected: null },
    { label: 'missed drop even without feedback', type: 'add', result: null, dragOutcome: 'miss', expected: false },
    { label: 'cancelled drop even without feedback', type: 'add', result: null, dragOutcome: 'cancel', expected: false },
    { label: 'attempted drop without feedback', type: 'add', result: null, dragOutcome: 'drop', expected: null },
  ];
  for (const entry of cases) await t.test(entry.label, () => {
    const experience = fresh();
    view(experience);
    apply(experience, { type: entry.type, productId: 'curry', quantity: 3 }, {
      result: entry.result && { actionType: entry.type, ...entry.result }, dragOutcome: entry.dragOutcome,
    });
    assert.equal(state(experience), entry.expected);
  });
});

test('v7 retains uncertainty across no-ops, checks of other information, and unchanged observations', () => {
  const experience = fresh();
  view(experience);
  apply(experience, { type: 'add', productId: 'curry', quantity: 1 }, { result: null });
  assert.equal(state(experience), null);
  pause(experience);
  apply(experience, { type: 'readList', durationMs: 100 });
  apply(experience, { type: 'add', productId: 'curry', quantity: 1 }, {
    result: { accepted: false, actionType: 'add', quantity: 0 }, dragOutcome: 'miss',
  });
  apply(experience, { type: 'remove', productId: 'curry', quantity: 1 }, {
    before: observation({ cart: { curry: 1 } }), after: { cart: { curry: 1 } },
  });
  assert.equal(state(experience), null);
  assert.equal(state(experience, observation({ view: 'cart', cart: { curry: 1 } })), null);
  apply(experience, { type: 'add', productId: 'curry', quantity: 1 }, {
    result: { accepted: true, actionType: 'add', quantity: 1 },
  });
  assert.equal(state(experience), true);
  view(experience, { curry: 2 });
  assert.equal(state(experience), false);
});

test('v7 visible evidence identifies actual changes and no-ops without a hidden cart query', () => {
  const experience = fresh();
  view(experience);
  apply(experience, { type: 'remove', productId: 'curry', quantity: 1 }, {
    before: observation({ cart: { curry: 1 } }), after: { cart: { curry: 1 } },
    result: { accepted: true, actionType: 'remove', quantity: 1 },
  });
  assert.equal(state(experience), false, 'identical displayed carts identify a no-op despite the requested quantity');
  apply(experience, { type: 'pause', durationMs: 100 }, { after: { view: 'cart', cart: { curry: 2 } } });
  assert.equal(state(experience), true, 'a later visible change is sufficient evidence');
  view(experience, { curry: 2 });
  apply(experience, { type: 'remove', productId: 'curry', quantity: 1 }, {
    before: observation({ cart: { curry: 2 } }), after: { cart: { curry: 1 } }, result: null,
  });
  assert.equal(state(experience), true, 'displayed before/after evidence does not require a result message');
  view(experience, { curry: 1 });
  apply(experience, { type: 'closeView' }, { before: observation({ view: 'cart', cart: { curry: 3 } }) });
  assert.equal(state(experience), true, 'closing does not discard a newly observed change');
});

test('v7 records that edits occurred even when a later edit restores the same contents', () => {
  const experience = fresh();
  view(experience);
  for (const type of ['add', 'remove']) apply(experience, { type, productId: 'curry', quantity: 1 }, {
    result: { accepted: true, actionType: type, quantity: 1 },
  });
  assert.equal(state(experience), true);
  assert.equal(state(experience, observation({ cart: { curry: 1 } })), true);
  view(experience);
  assert.equal(state(experience), false);
});

test('v7 snapshots can reflect currently visible differences without mutating or ageing the archive', () => {
  const experience = fresh();
  view(experience);
  const baseline = experience.snapshot(observation());
  assert.equal(state(experience, observation({ cart: { curry: 2 } })), true);
  assert.deepEqual(experience.snapshot(observation()), baseline);
  for (let i = 0; i < 30; i++) experience.snapshot(observation());
  assert.deepEqual(experience.snapshot(observation()), baseline);
  const copied = experience.snapshot(observation());
  copied.checks.cartChangedSinceLastCartView = true;
  copied.limits.retentionActions = 999;
  assert.deepEqual(experience.snapshot(observation()), baseline);
});

test('v7 retains the six-action and 24-action limits and expires the cart check to unknown', () => {
  const experience = fresh();
  view(experience);
  for (let i = 0; i < FEEDBACK_EXPERIENCE_LIMITS.retentionActions; i++) pause(experience);
  assert.equal(state(experience), false);
  assert.equal(experience.snapshot(observation()).checks.cartViewedActionsAgo, 24);
  assert.equal(experience.snapshot(observation()).recentActions.length, 6);
  pause(experience);
  assert.equal(state(experience), null);
  assert.equal(experience.snapshot(observation()).checks.cartViewedActionsAgo, null);
  apply(experience, { type: 'add', productId: 'curry', quantity: 1 }, {
    result: { accepted: true, actionType: 'add', quantity: 1 },
  });
  assert.equal(state(experience), null, 'a mutation cannot revive an expired check');
  view(experience);
  assert.equal(state(experience), false);
});

test('v7 never exposes old cart contents, goal contents, actor beliefs, or hidden world information', () => {
  const experience = fresh();
  const current = observation({ view: 'cart', cart: { SECRET_HISTORICAL_PRODUCT: 4 },
    cartItems: [{ id: 'SECRET_HISTORICAL_PRODUCT', name: 'SECRET_CART_NAME', quantity: 4 }],
    readObjectives: [{ id: 'SECRET_GOAL', label: 'SECRET_GOAL_LABEL', quantity: 3, match: 'exact' }] });
  for (const key of ['environment', 'objectives', 'stock', 'goalLedger']) Object.defineProperty(current, key, {
    get() { throw new Error(`Must never read hidden ${key}`); },
  });
  const checked = apply(experience, { type: 'viewCart' }, { before: current,
    after: { view: 'cart', cart: current.cart, cartItems: current.cartItems } });
  const closed = apply(experience, { type: 'closeView' }, { before: checked });
  const serialized = JSON.stringify(experience.snapshot(closed));
  assert.equal(state(experience), false);
  assert.equal(experience.snapshot(closed).visibleCart, null);
  assert.doesNotMatch(serialized, /SECRET|private|goalLedger|readObjectives|cartItems/);
});

test('default and explicit v1 snapshots preserve the legacy wire shape; v2 adds only its version and check', () => {
  const legacy = new FeedbackExperience();
  const explicit = new FeedbackExperience({ version: FEEDBACK_EXPERIENCE_VERSION });
  const modern = fresh();
  for (const experience of [legacy, explicit, modern]) {
    apply(experience, { type: 'readList', durationMs: 100 });
    const checked = view(experience);
    apply(experience, { type: 'closeView' }, { before: checked });
    apply(experience, { type: 'add', productId: 'curry', quantity: 2 }, {
      result: { accepted: true, actionType: 'add', quantity: 2 },
    });
    pause(experience);
  }
  const original = legacy.snapshot(observation());
  assert.equal(original.version, 'bounded-observed-experience-v1');
  assert.deepEqual(Object.keys(original.checks), ['listReadActionsAgo', 'cartViewedActionsAgo',
    'listReadsInRecentActions', 'cartViewsInRecentActions', 'cartChangedSinceListRead']);
  assert.equal(JSON.stringify(original), JSON.stringify(explicit.snapshot(observation())));
  const upgraded = modern.snapshot(observation());
  assert.equal(upgraded.version, 'bounded-observed-experience-v2');
  assert.equal(upgraded.checks.cartChangedSinceLastCartView, true);
  upgraded.version = FEEDBACK_EXPERIENCE_VERSION;
  delete upgraded.checks.cartChangedSinceLastCartView;
  assert.equal(JSON.stringify(original), JSON.stringify(upgraded));
});
