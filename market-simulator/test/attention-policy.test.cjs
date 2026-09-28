const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { AttentionPolicy } = require('../src/attentionPolicy.ts');
const { getPersona } = require('../src/personas.ts');

const apple = { id: 'apple', categoryId: 'produce', name: '사과', detail: '1개', price: 1200, stock: 6 };
const curry = { id: 'curry', categoryId: 'meal', name: '순한 카레', detail: '1개', price: 1800, stock: 6 };
const goals = [{ id: 'goal-apple', label: '사과', quantity: 2, match: 'exact' }];
const station = (id, near = true) => ({ id, kind: 'shelf', label: id === 'meal' ? '간편식' : '과일 채소', direction: 'north', distanceBand: near ? 'near' : 'medium', near });
const anchor = (id, direction = 'north') => ({ id, label: '보이는 통로', direction, distanceBand: 'near' });
function profile(overrides = {}) {
  const p = getPersona('mild-intellectual-disability-adult');
  // Isolate attention mechanics here; complete active personalities have separate comparisons.
  delete p.shoppingStyle;
  p.attention = { version: '1', interestProductWeights: { curry: 3 }, interestCategoryWeights: { meal: 1.6 },
    captureProbability: 1, interestPurchaseProbability: 1, resumeProbability: 1,
    minimumInterestActions: 2, maximumInterestActions: 4, firstPlayOrientationActions: 0,
    goalMemoryCapacity: 3, spatialMemoryCapacity: 96, switchMemoryDecay: 0, ...overrides };
  return p;
}
function observation(overrides = {}) {
  return { schemaVersion: 'attention-observation-v1', sequence: 0, phase: 'shopping', view: 'world', activeStation: null,
    visibleStations: [], anchors: [], products: [], shelf: null, listAvailable: true,
    cart: null, cashiers: {}, ...overrides };
}
function after(policy, action, before, overrides = {}) {
  const next = { ...before, sequence: before.sequence + 1, readObjectives: undefined,
    result: { accepted: true, actionType: action.action.type, ...('quantity' in action.action ? { quantity: action.action.quantity } : {}) }, ...overrides };
  policy.record(action, before, next);
  return next;
}
function readGoals(policy, o = observation(), values = goals) {
  const d = policy.next(o); assert.equal(d.action.type, 'readList');
  return after(policy, d, o, { readObjectives: values });
}

test('rejects raw observations and does not memorize objectives before its own accepted read', () => {
  const p = new AttentionPolicy(profile(), 'read-gate');
  assert.throws(() => p.next({ schemaVersion: 1, objectives: goals, environment: {} }), /projected actor/);
  const o = observation({ readObjectives: goals });
  p.observe(o);
  assert.deepEqual(p.getState().rememberedGoal, []);
  assert.equal(p.getState().hasReadList, false);
  const d = p.next(o); assert.equal(d.action.type, 'readList');
  after(p, d, o, { readObjectives: goals, result: { accepted: false, actionType: 'readList' }, lastActionError: 'hidden list' });
  assert.deepEqual(p.getState().rememberedGoal, []);
});

test('first play explores controls before reading; familiarity with curry does not reveal layout or goals', () => {
  const p = new AttentionPolicy(profile({ firstPlayOrientationActions: 2 }), 'first-play');
  let o = observation();
  for (let i = 0; i < 2; i++) {
    const d = p.next(o); assert.equal(d.action.type, 'lookAround');
    assert.deepEqual(p.getState().rememberedGoal, []);
    assert.equal(p.getMemory().stations.length, 0);
    o = after(p, d, o);
  }
  o = readGoals(p, o);
  assert.equal(p.getState().rememberedGoal[0].label, '사과');
  assert.equal(p.getState().currentFocus, 'goal-item');
});

test('visible personal interest captures focus, persists, and can buy a non-goal product without automatic return', () => {
  const p = new AttentionPolicy(profile(), 'interest');
  let o = readGoals(p);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, visibleStations: [station('meal')] };
  let d = p.next(o); assert.deepEqual(d.action, { type: 'interact', station: 'meal' });
  o = after(p, d, o, { activeStation: 'meal', products: [curry], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } });
  for (let i = 0; i < 2; i++) {
    d = p.next(o); assert.equal(d.action.type, 'browse', 'interest must not immediately close a shelf without goals');
    assert.equal(d.attentionTag, 'interest'); o = after(p, d, o);
  }
  d = p.next(o); assert.deepEqual(d.action, { type: 'add', productId: 'curry', quantity: 1 });
  o = after(p, d, o);
  let dwellActions = 3;
  for (;;) {
    d = p.next(o);
    if (d.action.type === 'closeStation') break;
    assert.equal(d.action.type, 'browse'); dwellActions++;
    assert.ok(dwellActions <= 4, 'interest dwell must respect its maximum');
    o = after(p, d, o);
  }
  o = after(p, d, o, { activeStation: null, products: [], shelf: null });
  assert.equal(p.next(o).action.type, 'readList');
  assert.equal(p.getState().rememberedCart.curry, 1, 'interest purchase remains a choice, not an automatic repair');
  assert.deepEqual(p.getState().rememberedGoal.map(g => g.label), ['사과']);
});

test('ending an interest does not force goal recovery when resume tendency is disabled', () => {
  const p = new AttentionPolicy(profile({ resumeProbability: 0, minimumInterestActions: 1, maximumInterestActions: 1 }), 'no-forced-resume');
  let o = readGoals(p);
  o = { ...o, sequence: ++o.sequence, readObjectives: undefined, visibleStations: [station('meal')] };
  let d = p.next(o); o = after(p, d, o, { activeStation: 'meal', products: [curry], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } });
  d = p.next(o); o = after(p, d, o);
  d = p.next(o); assert.equal(d.action.type, 'closeStation');
  assert.equal(d.attentionTag, 'disengaged');
  assert.equal(p.getState().currentFocus, 'disengaged');
});

test('an absent interest cue cannot capture attention or reveal an unseen product', () => {
  const visible = new AttentionPolicy(profile(), 'same-cue-seed');
  const absent = new AttentionPolicy(profile(), 'same-cue-seed');
  let a = readGoals(visible), b = readGoals(absent);
  a = { ...a, sequence: a.sequence + 1, readObjectives: undefined, visibleStations: [station('meal')] };
  b = { ...b, sequence: b.sequence + 1, readObjectives: undefined, visibleStations: [station('produce')], anchors: [anchor('passage-a')] };
  assert.equal(visible.next(a).attentionTag, 'interest');
  const d = absent.next(b); assert.notEqual(d.attentionTag, 'interest');
  assert.equal(absent.getMemory().knownProducts.length, 0);
  assert.ok(!JSON.stringify(absent.getMemory()).includes('curry'));
});

test('only current visible products can be selected; browse uses the real nonuniform page fractions', () => {
  const p = new AttentionPolicy(profile({ captureProbability: 0 }), 'paging');
  let o = readGoals(p);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, activeStation: 'produce', visibleStations: [station('produce')],
    products: [{ ...apple, id: 'banana', name: '바나나' }], shelf: { page: 0, pageCount: 3, scrollFraction: 0, pageFractions: [0, .37, 1] } };
  let d = p.next(o); assert.deepEqual(d.action, { type: 'browse', durationMs: d.action.durationMs, scrollFraction: .37 });
  o = after(p, d, o, { products: [apple], shelf: { ...o.shelf, page: 1, scrollFraction: .37 } });
  d = p.next(o); assert.deepEqual(d.action, { type: 'add', productId: 'apple', quantity: 2 });
});

test('limited working goals can rotate through an explicitly reread longer list', () => {
  const persona = profile({ captureProbability: 0, goalMemoryCapacity: 1 });
  // Isolate list rotation from optional basket/help support, which has its own contextual tests.
  Object.assign(persona.parameters, { recheckProbability: 0, helpProbability: 0 });
  const p = new AttentionPolicy(persona, 'capacity');
  const water = { id: 'water', categoryId: 'drink', name: '생수', price: 800, stock: 6 };
  const all = [...goals, { id: 'goal-water', label: '생수', quantity: 1, match: 'exact' }];
  let o = readGoals(p, observation(), all);
  assert.equal(p.getState().rememberedGoal.length, 1); assert.equal(p.getState().moreGoals, true);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, activeStation: 'produce', visibleStations: [station('produce')], products: [apple], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } };
  let d = p.next(o); o = after(p, d, o);
  d = p.next(o); assert.equal(d.action.type, 'closeStation');
  o = after(p, d, o, { activeStation: null, products: [], shelf: null });
  d = p.next(o); assert.equal(d.action.type, 'readList');
  o = after(p, d, o, { readObjectives: all });
  assert.deepEqual(p.getState().rememberedGoal.map(g => g.label), ['생수']);
  assert.equal(p.getState().moreGoals, false);
  assert.equal(p.getMemory().knownProducts.some(p => p.id === water.id), false);
});

test('revisit preserves only actually supplied experience and invalidates spatial memory on a new layout', () => {
  assert.throws(() => new AttentionPolicy(profile(), 'missing-memory', { visit: 'revisit' }), /Revisit requires memory/);
  const memory = { version: '1', stations: [{ id: 'meal', label: '간편식', kind: 'shelf', anchorId: 'known-a', visits: 1 }],
    anchors: [{ id: 'known-a', neighbors: [], visits: 2 }], knownProducts: [curry], controlsPracticed: ['readList', 'interact'] };
  const same = new AttentionPolicy(profile({ firstPlayOrientationActions: 2 }), 'revisit', { visit: 'revisit', layoutKey: 'store-a', previousLayoutKey: 'store-a', memory });
  const changed = new AttentionPolicy(profile({ firstPlayOrientationActions: 2 }), 'revisit', { visit: 'revisit', layoutKey: 'store-b', previousLayoutKey: 'store-a', memory });
  assert.equal(same.getMemory().stations.length, 1); assert.equal(changed.getMemory().stations.length, 0);
  assert.equal(changed.getMemory().anchors.length, 0); assert.deepEqual(changed.getMemory().controlsPracticed, ['readList', 'interact']);
  assert.deepEqual(same.getState().rememberedGoal, []); assert.equal(same.next(observation()).action.type, 'readList');
  assert.equal(JSON.stringify(memory).includes('basket'), false);
});

test('navigation selects local visible anchors, records discovered connections, and never invents full-map routes', () => {
  const p = new AttentionPolicy(profile({ captureProbability: 0 }), 'anchors');
  let o = readGoals(p);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, anchors: [anchor('a'), anchor('b', 'west')] };
  let d = p.next(o); assert.equal(d.action.type, 'walkToAnchor'); assert.ok(['a', 'b'].includes(d.action.anchorId));
  const first = d.action.anchorId;
  o = after(p, d, o, { anchors: [anchor('c'), anchor('d', 'east')] });
  d = p.next(o); assert.ok(['c', 'd'].includes(d.action.anchorId));
  const remembered = p.getMemory().anchors.find(a => a.id === first);
  assert.deepEqual(remembered.neighbors.sort(), ['c', 'd']);
  assert.ok(!('environment' in p.getState()));
});

test('seed determines attention choices independently of timing parameters; different seeds vary semantic choices', () => {
  function first(seed, median = 1000) {
    const persona = profile({ captureProbability: .5 }); persona.parameters.reactionMedianMs = median;
    const p = new AttentionPolicy(persona, seed); let o = readGoals(p);
    return p.next({ ...o, sequence: o.sequence + 1, readObjectives: undefined, visibleStations: [station('meal')], anchors: [anchor('a'), anchor('b', 'west')] });
  }
  for(let i=0;i<20;i++) assert.deepEqual(first(`rng-${i}`, 500).action, first(`rng-${i}`, 7000).action);
  assert.ok(new Set(Array.from({length:30},(_,i)=>JSON.stringify(first(`rng-${i}`).action))).size > 1);
});

test('a visible destination outranks unvisited passages behind the actor and briefly retains a masked sign bearing', () => {
  for (let i = 0; i < 20; i++) {
    const persona = profile({ captureProbability: 0 });
    const memory = { version: '1', stations: [], knownProducts: [], controlsPracticed: [], anchors: [
      { id: 'familiar-east', neighbors: [], visits: 40 }, { id: 'novel-west', neighbors: [], visits: 0 }] };
    const p = new AttentionPolicy(persona, `approach-${i}`, { visit: 'revisit', layoutKey: 'same', previousLayoutKey: 'same', memory });
    let o = readGoals(p);
    o = { ...o, sequence: o.sequence + 1, readObjectives: undefined,
      visibleStations: [{ ...station('produce', false), direction: 'east' }],
      anchors: [anchor('familiar-east', 'east'), anchor('novel-west', 'west')] };
    let d = p.next(o); assert.deepEqual(d.action, { type: 'walkToAnchor', anchorId: 'familiar-east' });
    o = after(p, d, o, { visibleStations: [], anchors: [anchor('next-east', 'east'), anchor('novel-west', 'west')] });
    d = p.next(o); assert.deepEqual(d.action, { type: 'walkToAnchor', anchorId: 'next-east' }, 'temporary sign occlusion must not cause immediate backtracking');
    assert.match(d.reason, /recently-observed-sign/);
  }
});

test('a remembered objective with a visible category can take precedence over an unseen first objective', () => {
  const p = new AttentionPolicy(profile({ captureProbability: 0 }), 'noticed-next-objective');
  let o = readGoals(p, observation(), [...goals, { id: 'water-goal', label: '생수', quantity: 1, match: 'family' }]);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, visibleStations: [station('drink')] };
  assert.deepEqual(p.next(o).action, { type: 'interact', station: 'drink' });
});

test('repeated unsuccessful approaches can try another visible direction without an omniscient route', () => {
  const p = new AttentionPolicy(profile({ captureProbability: 0 }), 'approach-loop');
  let o = readGoals(p);
  const decisions = [];
  for (let i = 0; i < 14; i++) {
    o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, visibleStations: [station('produce', false)],
      anchors: [anchor(i % 2 ? 'north-a' : 'north-b', 'north'), anchor('untried-south', 'south')] };
    const d = p.next(o); decisions.push(d);
    assert.equal(d.action.type, 'walkToAnchor');
    o = after(p, d, o);
    if (d.action.anchorId === 'untried-south') break;
  }
  assert.ok(decisions.some(d => d.action.anchorId === 'untried-south' && /repeated-approach/.test(d.reason)));
});

test('visible rejection accumulates stress and a requested help view provides contextual recovery', () => {
  const p = new AttentionPolicy(profile({ captureProbability: 0 }), 'context-recovery');
  let o = readGoals(p);
  const d = { action: { type: 'interact', station: 'produce' }, reason: 'try-visible-station', delayMs: 1 };
  o = after(p, d, o, { result: { accepted: false, actionType: 'interact' }, lastActionError: 'too far' });
  assert.equal(p.getState().context.failures, 1);
  assert.ok(p.getState().context.stress > 0);
  const stressed = p.getState().context.stress;
  // A second rejection changes the support situation; successful movements do not erase it.
  o = after(p, d, o, { result: { accepted: false, actionType: 'interact' }, lastActionError: 'too far' });
  assert.ok(p.getState().context.stress > stressed);
  const help = { action: { type: 'viewHelp' }, reason: 'check-visible-help', delayMs: 1 };
  o = after(p, help, o, { lastActionError: null, view: 'help' });
  assert.ok(p.getState().context.support >= .75);
  assert.equal(p.next(o).action.type, 'closeView');
  assert.match(p.next(o).reason, /context\(familiarity=.*load=.*stress=.*support=.*failures=2\)/);
});

test('freshly read simple familiar quantities stay stable, while unreviewed multiple selections permit contextual counting slips', () => {
  let slips = 0;
  for (let i = 0; i < 60; i++) {
    const persona = profile({ captureProbability: 0 });
    Object.assign(persona.parameters, { recheckProbability: 0, helpProbability: 0, quantitySlipProbability: 1, confusionProbability: 0 });
    const fresh = new AttentionPolicy(persona, `quantity-${i}`);
    let a = readGoals(fresh);
    a = { ...a, sequence: a.sequence + 1, readObjectives: undefined, activeStation: 'produce', products: [apple], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } };
    assert.equal(fresh.next(a).action.quantity, 2, 'a new simple familiar goal is not assigned an arbitrary error');
    const loaded = new AttentionPolicy(persona, `quantity-${i}`);
    let b = readGoals(loaded, observation(), [{ ...goals[0], quantity: 3 },
      { id: 'g2', label: '생수', quantity: 1, match: 'family' }, { id: 'g3', label: '우유', quantity: 1, match: 'family' }]);
    for (let j = 0; j < 4; j++) b = after(loaded, { action: { type: 'add', productId: 'curry', quantity: 1 }, delayMs: 1, reason: 'accepted-choice' }, b, { products: [curry] });
    b = { ...b, sequence: b.sequence + 1, readObjectives: undefined, activeStation: 'produce', products: [apple], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } };
    const d = loaded.next(b);
    if (d.action.type === 'add' && d.action.quantity !== 3) { slips++; assert.match(d.reason, /lose-count.*unreviewed/); }
  }
  assert.ok(slips > 0 && slips < 60, `conditional slips must be possible and not mandatory (${slips})`);
});

test('checkout inspection is a persona decision and does not force perfect correction from a visible basket', () => {
  const persona = profile({ captureProbability: 0 }); persona.parameters.recheckProbability = 0;
  const p = new AttentionPolicy(persona, 'optional-review');
  let o = readGoals(p);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, phase: 'checkout', activeStation: 'checkout', cart: {}, cashiers: { checkout: true } };
  assert.equal(p.next(o).action.type, 'submit');
});

test('comparison browses observed pages and returns to the preferred visible candidate before adding', () => {
  const persona = profile({ captureProbability: 0 });
  persona.shoppingStyle = { comparisonProbability: 1, maxComparisonPages: 2, listCheckAfterSelectionProbability: 0,
    preCheckoutCheckProbability: 0, familiarShortcutProbability: 0, headingPersistence: .8 };
  persona.parameters.itemPreferenceWeights = { apple: 1, 'premium-apple': 0 };
  const p = new AttentionPolicy(persona, 'comparison-pages');
  let o = readGoals(p, observation(), [{ ...goals[0], match: 'family' }]);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, activeStation: 'produce',
    products: [apple], shelf: { page: 0, pageCount: 2, scrollFraction: 0, pageFractions: [0, 1] } };
  let d = p.next(o); assert.equal(d.action.type, 'browse'); assert.equal(d.action.scrollFraction, 0);
  o = after(p, d, o);
  d = p.next(o); assert.equal(d.action.scrollFraction, 1);
  o = after(p, d, o, { products: [{ ...apple, id: 'premium-apple', name: '고급 사과', price: 3500 }], shelf: { ...o.shelf, page: 1, scrollFraction: 1 } });
  d = p.next(o); assert.equal(d.action.type, 'browse'); assert.equal(d.action.scrollFraction, 0);
  assert.match(d.reason, /return-to-a-compared-option/);
  o = after(p, d, o, { products: [apple], shelf: { ...o.shelf, page: 0, scrollFraction: 0 } });
  d = p.next(o); assert.equal(d.action.type, 'add'); assert.equal(d.action.productId, 'apple');
});

test('a fully inspected unavailable goal is remembered and does not reopen the same shelf forever', () => {
  const persona = profile({ captureProbability: 0 });
  const p = new AttentionPolicy(persona, 'empty-shelf');
  let o = readGoals(p);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, activeStation: 'produce', visibleStations: [station('produce')],
    products: [{ ...apple, stock: 0 }], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } };
  let d = p.next(o); assert.equal(d.action.type, 'closeStation'); assert.match(d.reason, /no-available-matching-item/);
  o = after(p, d, o, { activeStation: null, products: [], shelf: null });
  d = p.next(o); assert.equal(d.action.type, 'giveUp'); assert.match(d.reason, /observing.*unavailable/);
});

test('an unavailable first remembered goal allows rereading later goals instead of premature abandonment', () => {
  const persona = profile({ captureProbability: 0, goalMemoryCapacity: 1 });
  const p = new AttentionPolicy(persona, 'empty-first-goal');
  const all = [...goals, { id: 'goal-water', label: '생수', quantity: 1, match: 'exact' }];
  let o = readGoals(p, observation(), all);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, activeStation: 'produce', visibleStations: [station('produce')],
    products: [{ ...apple, stock: 0 }], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } };
  const closed = p.next(o); assert.equal(closed.action.type, 'closeStation');
  o = after(p, closed, o, { activeStation: null, products: [], shelf: null });
  const reread = p.next(o); assert.equal(reread.action.type, 'readList');
  o = after(p, reread, o, { readObjectives: all });
  assert.deepEqual(p.getState().rememberedGoal.map(g => g.id), ['goal-water']);
});

test('an unfamiliar category label inspects discovered shelves and their pages without a hidden catalog', () => {
  const persona = profile({ captureProbability: 0 });
  const p = new AttentionPolicy(persona, 'unknown-label');
  const unfamiliar = { id: 'melon', categoryId: 'produce', name: '멜론', price: 3000, stock: 6 };
  let o = readGoals(p, observation(), [{ id: 'melon-goal', label: '멜론', match: 'exact', quantity: 1 }]);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, visibleStations: [station('produce')] };
  let d = p.next(o); assert.deepEqual(d.action, { type: 'interact', station: 'produce' });
  o = after(p, d, o, { activeStation: 'produce', products: [apple], shelf: { page: 0, pageCount: 2, scrollFraction: 0 } });
  d = p.next(o); assert.equal(d.action.type, 'browse'); assert.equal(d.action.scrollFraction, 1);
  o = after(p, d, o, { products: [unfamiliar], shelf: { ...o.shelf, page: 1, scrollFraction: 1 } });
  d = p.next(o); assert.deepEqual(d.action, { type: 'add', productId: 'melon', quantity: 1 });
});

test('an observed excess can be returned while intentional interest purchases are preserved', () => {
  for (const intentional of [false, true]) {
    const persona = profile({ captureProbability: 0 });
    Object.assign(persona.parameters, { recheckProbability: 1, feedbackLearningRate: 1, helpProbability: 0 });
    const p = new AttentionPolicy(persona, 'checked-excess');
    let o = readGoals(p);
    o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, activeStation: 'produce', visibleStations: [station('produce')],
      products: [apple], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } };
    const add = { action: { type: 'add', productId: 'apple', quantity: 3 }, delayMs: 1, reason: 'chosen-three', attentionTag: intentional ? 'interest' : 'goal-item' };
    p.acceptDecision(add); o = after(p, add, o);
    const cart = { action: { type: 'viewCart' }, delayMs: 1, reason: 'inspect-visible-cart' };
    o = after(p, cart, o, { view: 'cart', cart: { apple: 3 } });
    const close = p.next(o); assert.equal(close.action.type, 'closeView');
    o = after(p, close, o, { view: 'world', cart: null });
    // Finish the deliberate interest to isolate correction from interest dwell.
    p.acceptDecision({ action: { type: 'pause', durationMs: 1 }, delayMs: 1, reason: 'resume', attentionTag: 'goal-item' });
    const next = p.next(o);
    if (intentional) assert.notEqual(next.action.type, 'remove');
    else assert.deepEqual(next.action, { type: 'remove', productId: 'apple', quantity: 1 });
  }
});

test('memory import rejects hidden fields, invalid numbers, unsupported controls, and excessive or non-JSON collections', () => {
  const valid = () => ({ version: '1', stations: [{ id: 'meal', kind: 'shelf', label: '간편식', visits: 1, anchorId: 'known-a' }],
    anchors: [{ id: 'known-a', neighbors: [], visits: 1 }], knownProducts: [{ ...curry }], controlsPracticed: ['readList'] });
  const construct = memory => new AttentionPolicy(profile(), 'memory-input', { visit: 'revisit', layoutKey: 'same', previousLayoutKey: 'same', memory });
  const invalid = [
    m => { m.x = 12; }, m => { m.stations[0].x = 12; }, m => { m.stations[0].y = 15; },
    m => { m.knownProducts[0].hiddenAnswer = 'water'; }, m => { m.anchors[0].environment = {}; },
    m => { m.stations[0].visits = -1; }, m => { m.anchors[0].visits = NaN; },
    m => { m.anchors[0].visits = 1.5; }, m => { m.knownProducts[0].price = Infinity; },
    m => { m.knownProducts[0].price = -1; }, m => { m.knownProducts[0].stock = NaN; },
    m => { m.knownProducts[0].stock = -1; }, m => { delete m.knownProducts[0].name; },
    m => { m.stations[0].kind = 'hidden-map'; }, m => { m.anchors[0].neighbors.push({ id: 'hidden', x: 20 }); },
    m => { m.knownProducts[0].detail = { x: 10 }; }, m => { m.controlsPracticed.push('setPosition'); },
    m => { m.anchors = Array.from({ length: 2049 }, (_, i) => ({ id: `a${i}`, neighbors: [], visits: 0 })); },
    m => { m.stations = Array.from({ length: 257 }, (_, i) => ({ id: `s${i}`, kind: 'shelf', label: '표지', visits: 0 })); },
    m => { m.knownProducts = Array.from({ length: 1025 }, (_, i) => ({ ...curry, id: `p${i}` })); },
    m => { m.controlsPracticed = Array(33).fill('add'); }, m => { m.anchors[0].neighbors = new Array(2); },
    m => { m.anchors[0].neighbors.secret = 'hidden'; },
    m => { m.knownProducts[0].name = 'x'.repeat(501); },
    m => { m.knownProducts = Array.from({ length: 300 }, (_, i) => ({ ...curry, id: `p${i}`, detail: 'x'.repeat(1000) })); },
  ];
  invalid.forEach((change, i) => { const m = valid(); change(m); assert.throws(() => construct(m), /Invalid attention memory artifact/, `invalid case ${i}`); });
  let accessed = false;
  const accessor = valid(); Object.defineProperty(accessor.knownProducts[0], 'name', { enumerable: true, get() { accessed = true; return 'hidden'; } });
  assert.throws(() => construct(accessor), /expected a JSON value/); assert.equal(accessed, false);
});

test('validated memory preserves getMemory shape and seeded revisit decisions without normalization', () => {
  const p = new AttentionPolicy(profile({ captureProbability: 0 }), 'recorded-memory');
  let o = readGoals(p);
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, visibleStations: [station('produce')], anchors: [anchor('discovered-a')] };
  const d = p.next(o);
  o = after(p, d, o, { activeStation: 'produce', products: [apple], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } });
  const memory = p.getMemory();
  const seed = 'revisit-stability', options = { visit: 'revisit', layoutKey: 'same', previousLayoutKey: 'same' };
  const direct = new AttentionPolicy(profile(), seed, { ...options, memory });
  const serialized = new AttentionPolicy(profile(), seed, { ...options, memory: JSON.parse(JSON.stringify(memory)) });
  assert.deepEqual(JSON.parse(JSON.stringify(direct.getMemory())), JSON.parse(JSON.stringify(memory)));
  assert.deepEqual(direct.next(observation()), serialized.next(observation()));
});

test('the same interest scene has seeded dwell durations from minimum through maximum without forced recovery', () => {
  const lengths = new Set();
  function dwell(seed) {
    const p = new AttentionPolicy(profile({ resumeProbability: 0, interestPurchaseProbability: 0,
      minimumInterestActions: 2, maximumInterestActions: 6 }), seed);
    let o = readGoals(p);
    o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, visibleStations: [station('meal')] };
    let d = p.next(o);
    o = after(p, d, o, { activeStation: 'meal', products: [curry], shelf: { page: 0, pageCount: 1, scrollFraction: 0 } });
    let count = 0;
    for (;;) {
      d = p.next(o);
      if (d.action.type === 'closeStation') {
        assert.equal(d.attentionTag, 'disengaged', 'stopping the interest does not force the shopping goal to resume');
        break;
      }
      assert.equal(d.action.type, 'browse'); count++;
      assert.ok(count <= 6); o = after(p, d, o);
    }
    assert.ok(count >= 2 && count <= 6); return count;
  }
  for (let i = 0; i < 120; i++) {
    const seed = `interest-dwell-${i}`;
    const count = dwell(seed); assert.equal(count, dwell(seed)); lengths.add(count);
  }
  assert.deepEqual([...lengths].sort((a, b) => a - b), [2, 3, 4, 5, 6]);
});
