'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { listPersonas } = require('../src/simulator.ts');
const { AttentionPolicy } = require('../src/attentionPolicy.ts');
const profiles = listPersonas();
// Controlled public observations isolate one condition without changing active profile parameters.
const tofu = { id: 'tofu', categoryId: 'fresh', name: '두부', price: 1500, stock: 12 };
const extra = { id: 'plain-water', categoryId: 'drink', name: '생수', price: 500, stock: 12 };
const goal = { id: 'tofu-three', label: '두부', quantity: 3, match: 'exact' };
const shelf = { page: 0, pageCount: 1, scrollFraction: 0 };
const station = { id: 'fresh', label: '신선식품', kind: 'shelf', direction: 'north', distanceBand: 'near', near: true };
const actor = overrides => ({ schemaVersion: 'attention-observation-v1', sequence: 0, phase: 'shopping', view: 'world',
  activeStation: null, visibleStations: [], anchors: [], products: [], shelf: null, listAvailable: true,
  cart: null, cashiers: {}, ...overrides });
function accept(policy, before, decision, overrides = {}) {
  const after = { ...before, sequence: before.sequence + 1, readObjectives: undefined, lastActionError: null,
    result: { accepted: true, actionType: decision.action.type,
      ...('productId' in decision.action ? { productId: decision.action.productId, quantity: decision.action.quantity ?? 1 } : {}) }, ...overrides };
  policy.record(decision, before, after); return after;
}
function prepare(profile, seed, goals = [goal], experience) {
  const policy = new AttentionPolicy(profile, seed, experience); let o = actor(); let orientations = 0;
  for (let i = 0; i <= profile.attention.firstPlayOrientationActions; i++) {
    const d = policy.next(o);
    if (d.action.type === 'readList') {
      return { policy, observation: accept(policy, o, d, { readObjectives: goals }), orientations, readDelayMs: d.delayMs };
    }
    assert.equal(d.action.type, 'lookAround'); orientations++; o = accept(policy, o, d);
  }
  assert.fail('Bounded orientation must reach the visible list');
}
function selectionProbe(profile, seed, { loaded = false, feedback = false } = {}) {
  const goals = loaded ? [goal, { id: 'apple-one', label: '사과', quantity: 1, match: 'exact' },
    { id: 'milk-one', label: '우유', quantity: 1, match: 'exact' }] : [goal];
  const { policy, observation } = prepare(profile, seed, goals); let o = observation;
  if (loaded) {
    // Previously observed, accepted choices create actual unreviewed history; no hidden-state mutation.
    for (let i = 0; i < 4; i++) o = accept(policy, o,
      { action: { type: 'add', productId: extra.id, quantity: 1 }, reason: 'observed-choice', delayMs: 1 }, { products: [extra] });
  }
  if (feedback) {
    const rejected = { action: { type: 'interact', station: 'fresh' }, reason: 'visible-station', delayMs: 1 };
    o = accept(policy, o, rejected, { lastActionError: 'too far', result: { accepted: false, actionType: 'interact' } });
    const recovery = policy.next(o); assert.equal(recovery.action.type, 'viewHelp');
    o = accept(policy, o, recovery, { view: 'help' });
    const close = policy.next(o); assert.equal(close.action.type, 'closeView');
    o = accept(policy, o, close, { view: 'world' });
  }
  o = { ...o, sequence: o.sequence + 1, readObjectives: undefined, activeStation: 'fresh', products: [tofu], shelf,
    visibleStations: [], listAvailable: false };
  const decision = policy.next(o);
  assert.match(decision.reason, /context\(familiarity=.*load=.*stress=.*support=.*failures=/);
  return { policy, observation: o, decision, context: policy.getState().context };
}

test('all three active characters can complete a fresh simple quantity correctly without assigned mistakes', () => {
  for (const profile of profiles) for (let i = 0; i < 100; i++) {
    const { decision } = selectionProbe(profile, `simple-vs-loaded:${i}`);
    assert.equal(decision.action.type, 'add', `${profile.id}: available simple goal must remain possible`);
    assert.equal(decision.action.productId, tofu.id);
    assert.equal(decision.action.quantity, goal.quantity);
    assert.ok(!/lose-count|uncertain/.test(decision.reason));
  }
});

test('multiple unreviewed choices change actual decisions: checking or conditional counting slips, never a compulsory error', t => {
  const summaries = [];
  for (const profile of profiles) {
    let checks = 0, slips = 0, correct = 0;
    for (let i = 0; i < 160; i++) {
      const seed = `simple-vs-loaded:${i}`;
      const simple = selectionProbe(profile, seed), loaded = selectionProbe(profile, seed, { loaded: true });
      assert.ok(loaded.context.memoryLoad > simple.context.memoryLoad, profile.id);
      const d = loaded.decision;
      if (d.action.type === 'viewCart') { checks++; assert.match(d.reason, /recheck-the-basket/); }
      else {
        assert.equal(d.action.type, 'add'); assert.equal(d.action.productId, tofu.id);
        if (d.action.quantity !== goal.quantity) { slips++; assert.match(d.reason, /lose-count.*unreviewed/); }
        else correct++;
      }
    }
    assert.equal(checks + slips + correct, 160, 'Every fixed seed stays in the denominator');
    assert.ok(checks + slips > 0 && correct > 0, `${profile.id}: context can change behavior without mandatory failure`);
    summaries.push({ personaId: profile.id, checks, slips, correct });
  }
  const careful = summaries.find(s => s.personaId === 'careful-checker'), quick = summaries.find(s => s.personaId === 'quick-decider');
  assert.ok(careful.checks > quick.checks, 'Cautious checking and fast choice remain different coping styles');
  assert.ok(quick.slips > 0 && quick.slips < 160, 'Multi-quantity monitoring difficulty must be conditional');
  t.diagnostic(JSON.stringify({ fixedSeedsPerProfile: 160, loadedSelectionResponses: summaries }));
});

test('observed rejection leads to help and lower repeat-error pressure for every active profile', t => {
  for (const profile of profiles) {
    let beforeSlips = 0, afterSlips = 0, afterCorrect = 0;
    for (let i = 0; i < 160; i++) {
      const seed = `visible-feedback:${i}`;
      const before = selectionProbe(profile, seed, { loaded: true });
      const after = selectionProbe(profile, seed, { loaded: true, feedback: true });
      assert.equal(after.context.failures, 1);
      assert.ok(after.context.support >= .75);
      assert.ok(after.context.memoryLoad < before.context.memoryLoad);
      if (before.decision.action.type === 'add' && before.decision.action.quantity !== goal.quantity) beforeSlips++;
      if (after.decision.action.type === 'add') {
        if (after.decision.action.quantity !== goal.quantity) afterSlips++;
        else afterCorrect++;
      }
    }
    assert.ok(afterCorrect > 0, `${profile.id}: clear feedback leaves a correct action possible`);
    assert.ok(afterSlips <= beforeSlips, `${profile.id}: observed help/feedback should reduce repeated slips (${beforeSlips} -> ${afterSlips})`);
    t.diagnostic(JSON.stringify({ personaId: profile.id, fixedSeeds: 160, beforeSlips, afterSlips, afterCorrect }));
  }
});

test('recorded practice preserves learned controls and only matching-layout locations; new visits cannot invent experience', () => {
  for (const profile of profiles) {
    const { policy, observation, orientations } = prepare(profile, 'practice-origin');
    assert.ok(orientations > 0, `${profile.id}: initial surroundings need orientation`);
    let o = { ...observation, sequence: observation.sequence + 1, readObjectives: undefined, visibleStations: [station] };
    // A real accepted interaction records an observed location and practiced control.
    policy.observe(o);
    o = accept(policy, o, { action: { type: 'interact', station: 'fresh' }, reason: 'open-visible-shelf', delayMs: 1 },
      { activeStation: 'fresh', products: [tofu], shelf });
    const memory = policy.getMemory(); assert.ok(memory.controlsPracticed.includes('interact'));
    assert.ok(memory.knownProducts.some(p => p.id === tofu.id));
    const same = prepare(profile, 'practice-followup', [goal], { visit: 'revisit', memory, layoutKey: 'store-a', previousLayoutKey: 'store-a' });
    const changed = prepare(profile, 'practice-followup', [goal], { visit: 'revisit', memory, layoutKey: 'store-b', previousLayoutKey: 'store-a' });
    assert.equal(same.orientations, 0);
    assert.ok(same.policy.getMemory().stations.some(s => s.id === 'fresh'));
    assert.equal(changed.policy.getMemory().stations.length, 0, 'Product familiarity is not map knowledge');
    assert.deepEqual(changed.policy.getMemory().controlsPracticed, same.policy.getMemory().controlsPracticed);
    for (const prepared of [same, changed]) {
      const next = { ...prepared.observation, sequence: prepared.observation.sequence + 1, readObjectives: undefined,
        activeStation: 'fresh', products: [tofu], shelf, listAvailable: false };
      const d = prepared.policy.next(next); assert.equal(d.action.type, 'add'); assert.equal(d.action.quantity, 3);
    }
    assert.ok(same.policy.getState().context.familiarity > changed.policy.getState().context.familiarity,
      'Only an actually visited same-layout shelf contributes spatial familiarity');
  }
});
