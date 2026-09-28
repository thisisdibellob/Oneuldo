const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { listPersonas } = require('../src/simulator.ts');
const { AttentionPolicy } = require('../src/attentionPolicy.ts');
const { runShelfProbe, probes, summarizeSamples, shoppingSequence, describe, readOptions } = require('../scripts/verify-personalities.cjs');
const profiles = Object.fromEntries(listPersonas().map(p => [p.id, p]));
const clone = id => structuredClone(profiles[id]);

test('three fictional adults each describe intellectual disability, individual strengths and distinct shopping habits', () => {
  for (const persona of Object.values(profiles)) {
    assert.ok(persona.character.name && persona.character.age >= 18);
    assert.match(persona.description, /경도 지적장애/, `${persona.id}: diagnosis must be explicit in this individual profile`);
    assert.ok(persona.character.strengths.length > 0 && persona.character.preferences.length > 0);
    assert.ok(persona.character.practicedStrategies.length > 0);
    assert.ok(!persona.prompt.includes('별도의 장애나 진단 설정은 없다'));
    assert.ok(persona.character.selectedTraits.length >= 3 && persona.character.selectedTraits.length <= 5);
    assert.ok(persona.attention, `${persona.id} must use public-observation attention`);
    const style = persona.shoppingStyle;
    assert.ok(style, `${persona.id} must define shoppingStyle`);
    for (const [key, value] of Object.entries(style)) {
      assert.ok(Number.isFinite(value));
      if (key === 'maxComparisonPages') assert.ok(Number.isInteger(value) && value >= 1 && value <= 4);
      else assert.ok(value >= 0 && value <= 1, key);
    }
  }
  const careful = profiles['careful-checker'].shoppingStyle, quick = profiles['quick-decider'].shoppingStyle;
  assert.ok(careful.comparisonProbability > quick.comparisonProbability);
  assert.ok(careful.listCheckAfterSelectionProbability > quick.listCheckAfterSelectionProbability);
  assert.ok(careful.preCheckoutCheckProbability > quick.preCheckoutCheckProbability);
  assert.ok(quick.familiarShortcutProbability > careful.familiarShortcutProbability);
  assert.equal(new Set(Object.values(profiles).map(p => p.character.name)).size, 3);
  assert.equal(new Set(Object.values(profiles).map(p => JSON.stringify(p.character.selectedTraits))).size, 3,
    'Individual support needs must not be copied across all three characters');
});

test('identical visible shopping opportunities produce measured personality differences over 100 fixed seeds', () => {
  const mild = probes(profiles['mild-intellectual-disability-adult'], 100);
  const careful = probes(profiles['careful-checker'], 100), quick = probes(profiles['quick-decider'], 100);
  for (const p of [mild, careful, quick]) assert.equal(p.selected, 100, 'Controlled shelf is solvable for every seed');
  assert.ok(careful.comparisonFraction > quick.comparisonFraction + .5);
  assert.ok(careful.postSelectionListRecheckFraction > quick.postSelectionListRecheckFraction + .4);
  assert.ok(careful.preCheckoutCartCheckFraction > quick.preCheckoutCartCheckFraction + .4);
  assert.ok(quick.familiarShortcutFraction > careful.familiarShortcutFraction + .4);
  assert.ok(quick.familiarSelectionFraction > careful.familiarSelectionFraction + .15);
  assert.ok(careful.reactionMs.mean > quick.reactionMs.mean * 1.5);
  assert.ok(mild.nonGoalInterestShelfOpenFraction > careful.nonGoalInterestShelfOpenFraction + .25);
  // A tendency must leave both outcomes possible; no compulsory per-seed personality quota.
  assert.ok(careful.comparisonFraction > 0 && careful.comparisonFraction < 1);
  assert.ok(quick.familiarShortcutFraction > 0 && quick.familiarShortcutFraction < 1);
});

test('comparison requires alternatives and its page budget prevents repeated endless browsing', () => {
  const p = clone('careful-checker');
  Object.assign(p.shoppingStyle, { comparisonProbability: 1, familiarShortcutProbability: 0, maxComparisonPages: 2 });
  for (let i = 0; i < 30; i++) {
    const result = runShelfProbe(p, `bounded-comparison:${i}`);
    const comparison = result.actions.filter(a => a.type === 'browse' && /^(compare-|return-to-a-compared-option)/.test(a.reason));
    assert.ok(result.selected, 'Comparison must eventually select a visible product');
    assert.ok(comparison.length >= 2 && comparison.length <= 3, 'Current page + second page + optional single return');
    assert.ok(new Set(comparison.map(a => a.scrollFraction)).size <= 2);
    assert.ok(result.actions.length < 15, 'Fixture must finish before exhausting the probe cap');
    assert.equal(runShelfProbe(p, `no-alternative:${i}`, { oneChoice: true }).comparisonBrowses, 0);
  }
  p.shoppingStyle.comparisonProbability = 0;
  assert.equal(runShelfProbe(p, 'comparison-disabled').comparisonBrowses, 0);
});

test('familiar shortcut requires a visible familiar cue; probability one cannot invent familiarity', () => {
  const p = clone('quick-decider');
  p.character.familiarCategories = []; // Isolate one known product from category familiarity.
  Object.assign(p.shoppingStyle, { comparisonProbability: 0, familiarShortcutProbability: 1 });
  for (let i = 0; i < 30; i++) {
    const seed = `familiar-condition:${i}`;
    const familiar = runShelfProbe(p, seed), unfamiliar = runShelfProbe(p, seed, { noFamiliar: true });
    assert.equal(familiar.familiarShortcuts, 1);
    assert.equal(familiar.selected, 'green-apple', 'Only this visible variant is personally familiar');
    assert.equal(unfamiliar.familiarShortcuts, 0);
    assert.ok(unfamiliar.selected, 'A person can still choose an unfamiliar visible product');
    assert.deepEqual(runShelfProbe(p, seed), familiar, 'Same observation/seed reproduces the same decisions');
  }
});

test('invalid style parameters are rejected before generating behavior', () => {
  for (const [key, value] of [['comparisonProbability', 1.1], ['headingPersistence', -.1], ['maxComparisonPages', 0], ['maxComparisonPages', 5]]) {
    const p = clone('careful-checker'); p.shoppingStyle[key] = value;
    assert.throws(() => new AttentionPolicy(p, 'invalid-style'), /shoppingStyle/);
  }
});

test('failed requests remain in the denominator and do not become zero-action successful plans', () => {
  const p = profiles['careful-checker'];
  const metrics = describe({ steps: [{ type: 'readList', reactionDelayMs: 1000 },
    { type: 'dragProduct', productId: 'apple', quantity: 1, gesture: { outcome: 'drop' }, reactionDelayMs: 1500 },
    { type: 'submitForReview' }] }, p);
  const complete = index => ({ index, seed: String(index), status: 'complete-plan', metrics,
    movement: { maxDisplacementPx: 20 }, reproducibility: { status: 'passed' } });
  const samples = [complete(0), { index: 1, seed: '1', status: 'failed-sample', failureKind: 'technical-generation-limit' }, complete(2)];
  const summary = summarizeSamples(p.id, samples, 3);
  assert.equal(summary.requested, 3); assert.equal(summary.completedPlans, 2); assert.equal(summary.failedSamples, 1);
  assert.equal(summary.completionFractionOfRequested, 2 / 3); assert.equal(summary.failureFractionOfRequested, 1 / 3);
  assert.equal(summary.endings.reviewRequested, 2); assert.equal(summary.endings.gaveUp, 0);
  assert.equal(summary.endings.denominatorRequested, 3);
  assert.equal(summary.metrics.steps.meanPerCompletedPlan, 3); assert.equal(summary.metrics.steps.denominatorCompletedPlans, 2);
  assert.equal(summary.failureKinds['technical-generation-limit'], 1);
  assert.throws(() => summarizeSamples(p.id, samples.slice(0, 2), 3), /Every requested seed/);
  assert.equal(summarizeSamples(p.id, [samples[1]], 1).reproducibility.status, 'unavailable');
});

test('shopping diversity ignores timing, reasons, gesture noise, waits and the walking route', () => {
  const selection = { type: 'dragProduct', productId: 'apple', quantity: 1, gesture: { outcome: 'drop', seed: 'a' }, reactionDelayMs: 10, reason: 'a' };
  const first = { steps: [{ type: 'walkToAnchor', target: { anchorId: 'route-a' } }, selection, { type: 'pause', durationMs: 20 }] };
  const second = { steps: [{ type: 'lookAround', durationMs: 50 }, { type: 'walkToAnchor', target: { anchorId: 'route-b' } },
    { ...selection, gesture: { outcome: 'drop', seed: 'b' }, reactionDelayMs: 9999, reason: 'entirely-different' }] };
  assert.deepEqual(shoppingSequence(first), shoppingSequence(second));
  second.steps[2].productId = 'green-apple'; assert.notDeepEqual(shoppingSequence(first), shoppingSequence(second));
  assert.notDeepEqual(shoppingSequence({ steps: [{ type: 'browse', scrollFraction: 0 }] }),
    shoppingSequence({ steps: [{ type: 'browse', scrollFraction: 1 }] }));
});

test('return metrics count explicit shelf or staff return intents, not a reason-only correction claim', () => {
  const metrics = describe({ steps: [
    { type: 'removeProduct', productId: 'apple', quantity: 2 },
    { type: 'talkToStaff', choice: 'returnProduct', productId: 'milk', quantity: 1 },
    { type: 'pause', reason: 'return-an-observed-mismatch-or-extra-quantity-to-its-shelf' },
    { type: 'talkToStaff', choice: 'requestCashier', checkoutId: 'checkout' },
  ] }, profiles['careful-checker']);
  assert.equal(metrics.returnActions, 2);
  assert.equal(metrics.returnedQuantity, 3);
  assert.equal(metrics.staffReturnRequests, 1);
});

test('comparison CLI enforces the minimum full-plan and fixed-observation sample sizes', () => {
  assert.equal(readOptions([]).count, 12);
  assert.throws(() => readOptions(['--count', '9']), /count must be 10/);
  assert.throws(() => readOptions(['--probe-count', '29']), /probeCount must be 30/);
  assert.throws(() => readOptions(['--unknown', 'value']), /Use --count/);
});
