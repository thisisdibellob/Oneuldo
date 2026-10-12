const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { FeedbackExperience, FEEDBACK_EXPERIENCE_LIMITS } = require('../src/feedbackExperience.ts');

const observation = (extra = {}) => ({ schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world',
  activeStation: null, visibleStations: [], anchors: [], products: [], shelf: null, cart: null,
  cashiers: {}, listAvailable: true, ...extra });
const decision = action => ({ action, delayMs: 0, reason: 'Actor-authored private data must not enter experience',
  feedbackMemory: { rememberedItems: [{ name: 'false belief' }], notes: ['private'], currentTask: 'task' } });
const apply = (experience, action, before = observation(), extra = {}, accepted = true) => {
  const after = observation({ result: { actionType: action.type, accepted }, ...extra });
  experience.record(decision(action), before, after);
  return after;
};
const shelfStation = id => ({ id, kind: 'shelf', label: `${id} sign`, direction: 'east', distanceBand: 'near', near: true });
const shelfView = (id, page, productIds) => observation({ activeStation: id,
  shelf: { page, pageCount: 99, scrollFraction: 0 },
  products: productIds.map(id => ({ id, name: `${id} name`, categoryId: 'observed', stock: 1, price: 100 })) });

test('snapshots are pure, isolated, and never retain shopping-list contents or hidden fields', () => {
  const experience = new FeedbackExperience();
  const before = observation({ environment: { fullMap: 'SECRET' }, objectives: [{ label: 'SECRET' }] });
  const after = apply(experience, { type: 'readList', durationMs: 1000 }, before, {
    readObjectives: [{ id: 'SECRET', label: 'SECRET', quantity: 8, match: 'exact' }],
    result: { actionType: 'readList', accepted: true, message: 'SECRET list text', hiddenGoal: 'SECRET' },
  });
  const first = experience.snapshot(after);
  assert.equal(first.checks.listReadActionsAgo, 0);
  assert.equal(first.checks.cartChangedSinceListRead, false);
  assert.doesNotMatch(JSON.stringify(first), /SECRET|false belief|private|fullMap|readObjectives/);
  first.recentActions[0].action.type = 'giveUp';
  first.limits.recentActions = 100;
  assert.equal(experience.snapshot(after).recentActions[0].action.type, 'readList');
  assert.equal(experience.snapshot(after).limits.recentActions, 6);
  assert.deepEqual(experience.snapshot(after), experience.snapshot(after));
});

test('recent applied actions retain outcomes and repetition, not submissions or stale result copies', () => {
  const experience = new FeedbackExperience();
  apply(experience, { type: 'readList', durationMs: 100 });
  apply(experience, { type: 'readList', durationMs: 100 });
  apply(experience, { type: 'viewCart' }, observation(), { view: 'cart', cart: {} });
  const after = apply(experience, { type: 'closeView' }, observation(), {
    result: { actionType: 'viewCart', accepted: true, message: 'stale result' },
  });
  const snapshot = experience.snapshot(after);
  assert.equal(snapshot.checks.listReadActionsAgo, 2);
  assert.equal(snapshot.checks.cartViewedActionsAgo, 1);
  assert.equal(snapshot.checks.listReadsInRecentActions, 2);
  assert.equal(snapshot.recentActions[3].result, null);
  for (let i = 0; i < 4; i++) apply(experience, { type: 'pause', durationMs: 100 });
  assert.deepEqual(experience.snapshot(observation()).recentActions.map(a => a.actionNumber), [3, 4, 5, 6, 7, 8]);
  assert.equal(experience.snapshot(observation()).checks.listReadsInRecentActions, 0);
});

test('unknown hidden cart changes stay unknown; actual accepted changes and visible evidence are distinguished', () => {
  const experience = new FeedbackExperience();
  apply(experience, { type: 'readList', durationMs: 100 });
  apply(experience, { type: 'add', productId: 'seen', quantity: 1 }, observation(), {
    result: { accepted: false, actionType: 'add', productId: 'seen', quantity: 0, message: 'drop missed' },
  });
  assert.equal(experience.snapshot(observation()).checks.cartChangedSinceListRead, false);
  apply(experience, { type: 'add', productId: 'seen', quantity: 1 }, observation(), { result: undefined });
  assert.equal(experience.snapshot(observation()).checks.cartChangedSinceListRead, null);
  apply(experience, { type: 'add', productId: 'seen', quantity: 1 }, observation(), {
    result: { accepted: true, actionType: 'add', productId: 'seen', quantity: 1 },
  });
  assert.equal(experience.snapshot(observation()).checks.cartChangedSinceListRead, true);
  assert.equal(experience.snapshot(observation()).visibleCart, null);
  apply(experience, { type: 'readList', durationMs: 100 });
  const after = apply(experience, { type: 'remove', productId: 'seen', quantity: 1 }, observation({ cart: { seen: 1 } }), { cart: {} });
  assert.equal(experience.snapshot(after).checks.cartChangedSinceListRead, true);
  assert.equal(experience.snapshot(after).recentActions.at(-1).cartChanged, true);
  assert.deepEqual(experience.snapshot(after).visibleCart, { items: {}, changedSincePreviousVisibleObservation: true });
});

test('cart checks compare actually displayed carts and never expose stale contents in the world', () => {
  const experience = new FeedbackExperience();
  let after = apply(experience, { type: 'viewCart' }, observation(), { view: 'cart', cart: { seen: 1 } });
  assert.equal(experience.snapshot(after).visibleCart.changedSincePreviousVisibleObservation, null);
  after.cart.seen = 50;
  assert.deepEqual(experience.snapshot(observation()).visibleCart, null);
  after = apply(experience, { type: 'viewCart' }, observation(), { view: 'cart', cart: { seen: 1 } });
  assert.equal(experience.snapshot(after).visibleCart.changedSincePreviousVisibleObservation, false);
  after = apply(experience, { type: 'viewCart' }, observation(), { view: 'cart', cart: { seen: 2 } });
  assert.equal(experience.snapshot(after).visibleCart.changedSincePreviousVisibleObservation, true);
});

test('shelf experience records observed pages/products and actual openings without inferring unseen products', () => {
  const experience = new FeedbackExperience();
  const before = observation({ visibleStations: [shelfStation('drink')],
    hiddenProducts: [{ id: 'SECRET' }], environment: { map: 'SECRET' } });
  let after = shelfView('drink', 0, ['coffee']);
  after.result = { accepted: true, actionType: 'interact', stationId: 'drink' };
  experience.record(decision({ type: 'interact', station: 'drink' }), before, after);
  after = apply(experience, { type: 'browse', scrollFraction: 1, durationMs: 100 }, after, shelfView('drink', 1, ['tea']));
  apply(experience, { type: 'closeStation' }, after);
  const shelf = experience.snapshot(observation()).exploration.recentShelves[0];
  assert.deepEqual(shelf.observedPages, [0, 1]);
  assert.deepEqual(shelf.observedProducts.map(p => p.id), ['coffee', 'tea']);
  assert.equal(shelf.timesOpened, 1);
  assert.equal(shelf.label, 'drink sign');
  assert.equal(shelf.lastSeenActionsAgo, 1);
  assert.doesNotMatch(JSON.stringify(experience.snapshot(observation())), /SECRET|pageCount|categoryId|notFound|missingGoal/);
});

test('passage arrivals and attempted headings use observed controls/outcomes without coordinates or routes', () => {
  const experience = new FeedbackExperience();
  const before = observation({ anchors: [{ id: 'visible-passage', label: '통로', direction: 'north', distanceBand: 'near' }] });
  for (let i = 0; i < 2; i++) apply(experience, { type: 'walkToAnchor', anchorId: 'visible-passage' }, before, {
    result: { actionType: 'walkToAnchor', accepted: true, anchorId: 'visible-passage' },
  });
  apply(experience, { type: 'moveDirection', direction: 'north', durationMs: 100 }, observation(), {
    result: { actionType: 'moveDirection', accepted: true, movement: { direction: 'north', durationMs: 100,
      movedDistancePx: 0, actualDelta: { dx: 0, dy: 0 }, outcome: 'blocked', route: 'SECRET' } },
  });
  const snapshot = experience.snapshot(observation());
  assert.equal(snapshot.exploration.recentPassages[0].arrivals, 2);
  assert.deepEqual(snapshot.exploration.lastMovement, { direction: 'north', outcome: 'blocked', actionsAgo: 0 });
  assert.doesNotMatch(JSON.stringify(snapshot), /actualDelta|dx|dy|SECRET|route/);
});

test('retention expires observations individually even when a shelf keeps being seen', () => {
  const experience = new FeedbackExperience();
  const old = shelfView('drink', 0, ['old-product']);
  apply(experience, { type: 'interact', station: 'drink' }, observation({ visibleStations: [shelfStation('drink')] }), old);
  apply(experience, { type: 'readList', durationMs: 100 });
  for (let i = 0; i < 24; i++) apply(experience, { type: 'pause', durationMs: 100 }, observation(), {
    visibleStations: [shelfStation('drink')],
  });
  let snapshot = experience.snapshot(observation());
  assert.equal(snapshot.checks.listReadActionsAgo, 24);
  assert.deepEqual(snapshot.exploration.recentShelves[0].observedProducts, []);
  assert.deepEqual(snapshot.exploration.recentShelves[0].observedPages, []);
  assert.equal(snapshot.exploration.recentShelves[0].timesOpened, 0);
  apply(experience, { type: 'pause', durationMs: 100 });
  snapshot = experience.snapshot(observation());
  assert.equal(snapshot.checks.listReadActionsAgo, null);
  assert.equal(snapshot.checks.cartChangedSinceListRead, null);
  for (let i = 0; i < 24; i++) apply(experience, { type: 'pause', durationMs: 100 });
  assert.deepEqual(experience.snapshot(observation()).exploration.recentShelves, []);
});

test('place/product bounds and snapshot-only discovery do not mutate the applied experience archive', () => {
  const experience = new FeedbackExperience();
  for (let i = 0; i < 10; i++) apply(experience, { type: 'pause', durationMs: 100 }, observation(), {
    visibleStations: [shelfStation(`shelf-${i}`)],
    anchors: [{ id: `passage-${i}`, label: '통로', direction: 'south', distanceBand: 'far' }],
  });
  const snapshot = experience.snapshot(shelfView('open-shelf', 0, Array.from({ length: 30 }, (_, i) => `p-${i}`)));
  assert.equal(snapshot.exploration.recentShelves.length, FEEDBACK_EXPERIENCE_LIMITS.places);
  assert.equal(snapshot.exploration.recentPassages.length, FEEDBACK_EXPERIENCE_LIMITS.places);
  assert.equal(snapshot.exploration.recentShelves.find(s => s.id === 'open-shelf').observedProducts.length, 12);
  assert.equal(experience.snapshot(observation()).exploration.recentShelves.some(s => s.id === 'open-shelf'), false);
});
