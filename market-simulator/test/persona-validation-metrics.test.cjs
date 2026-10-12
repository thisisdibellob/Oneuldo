'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { extract, actorEvents, selectionErrors } = require('../src/personaValidationMetrics.cjs');
const persona = require('../personas/neutral-adult-control.json');
const snapshot = { config: { difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 2 }, { productId: 'apple', quantity: 1 }] } };
function fixture(rows) {
  const steps = rows.map((row, i) => ({ id: `s${i}`, reactionDelayMs: 100, reason: '화면을 확인한다', ...row }));
  const decisions = steps.map((step, index) => ({ decisionIndex: index, before: { sequence: index, ...step.before },
    action: step.type === 'dragProduct' ? { type: 'add', productId: step.productId, quantity: step.quantity }
      : step.type === 'removeProduct' ? { type: 'remove', productId: step.productId, quantity: step.quantity }
      : step.type === 'openShelf' ? { type: 'interact', station: step.stationId }
      : { type: step.type, ...(step.type === 'browse' ? { scrollFraction: step.scrollFraction } : {}) },
    actorState: { activity: step.interest ? 'interest' : 'shop', orientation: step.orientation ?? 'unfamiliar' },
    basis: { intent: step.interest ? 'interest' : 'task', goalId: step.goalId ?? null }, delayMs: step.reactionDelayMs,
  }));
  return { trace: { experienceMode: 'first-play', steps }, audit: { decisions } };
}
const add = (productId, quantity, extra = {}) => ({ type: 'dragProduct', productId, quantity, gesture: { outcome: 'drop' }, ...extra });
function metrics(rows, target = snapshot) { const { trace, audit } = fixture(rows); return extract(trace, target, persona, audit); }

test('list checks use actual next-goal opportunities and retain both opportunity and check IDs', () => {
  const m = metrics([add('milk', 2, { goalId: 'objective-1' }), { type: 'readList' }, add('apple', 1, { goalId: 'objective-2' })]);
  assert.equal(m.postSelectionListRate.denominator, 1); assert.equal(m.postSelectionListRate.value, 1);
  assert.ok(m.postSelectionListRate.evidence.includes('s1'));
  assert.equal(metrics([add('milk', 2)]).postSelectionListRate.status, 'unexercised');
  assert.equal(metrics([add('milk', 2), add('apple', 1)]).postSelectionListRate.value, 0);
});
test('comparison needs observed alternatives, not every selection; long comparison intervals remain visible', () => {
  const shelf = { pageCount: 2 };
  const rows = [{ type: 'openShelf', stationId: 'fresh' }, { type: 'browse', scrollFraction: 1,
    before: { products: [{ id: 'milk' }], shelf } }, ...Array.from({ length: 8 }, () => ({ type: 'pause' })),
    add('milk', 2, { before: { products: [{ id: 'milk-small' }, { id: 'milk' }], shelf } })];
  const measured = metrics(rows).comparisonRate;
  assert.equal(measured.denominator, 1); assert.equal(measured.value, 1); assert.ok(measured.evidence.includes('s1'));
  assert.equal(metrics([add('milk', 2, { before: { products: [{ id: 'milk' }], shelf: { pageCount: 1 } } })]).comparisonRate.status, 'unexercised');
  assert.equal(metrics([add('milk', 2, { before: { products: [{ id: 'milk' }], shelf } })]).comparisonRate.value, 0);
});
test('curry exposure must precede entry and each exposed opportunity contributes at most one detour', () => {
  const cue = { products: [{ id: 'curry' }] };
  const prior = metrics([{ type: 'openShelf', stationId: 'meal', interest: true }, { type: 'pause', before: cue, interest: true }]);
  assert.equal(prior.curryDetourRate.value, 0);
  const after = metrics([{ type: 'lookAround', before: cue }, { type: 'openShelf', stationId: 'meal', interest: true },
    { type: 'closeStation' }, { type: 'openShelf', stationId: 'meal', interest: true }]);
  assert.equal(after.curryDetourRate.denominator, 1); assert.equal(after.curryDetourRate.value, 1);
  assert.equal(metrics([{ type: 'openShelf', stationId: 'meal', interest: true }]).curryDetourRate.status, 'unexercised');
});
test('interest recovery excludes intervals after all objectives were fulfilled', () => {
  const target = { config: { objectives: [{ productId: 'milk', quantity: 2 }] } };
  const m = metrics([add('milk', 2), { type: 'pause', interest: true }, { type: 'readList' }], target);
  assert.equal(m.interestRecoveryRate.status, 'unexercised');
  assert.equal(metrics([{ type: 'pause', interest: true }, { type: 'readList' }, add('milk', 2)], target).interestRecoveryRate.value, 1);
  assert.equal(metrics([{ type: 'pause', interest: true }, add('milk', 2)], target).interestRecoveryRate.value, 0);
});
test('displayed mismatch needs actual correction; checking alone and repeated displays are not correction', () => {
  const base = [{ type: 'readList' }, add('milk', 3), { type: 'viewCart' },
    { type: 'pause', before: { cart: { milk: 3 } } }, { type: 'readList', before: { cart: { milk: 3 } } }];
  const no = metrics(base).correctionRate;
  assert.equal(no.denominator, 1); assert.equal(no.numerator, 0);
  const yes = metrics([...base, { type: 'removeProduct', productId: 'milk', quantity: 1 }]).correctionRate;
  assert.equal(yes.denominator, 1); assert.equal(yes.numerator, 1); assert.ok(yes.evidence.includes('s5'));
  assert.equal(metrics([{ type: 'viewCart', before: { cart: {} } }]).correctionRate.status, 'unexercised');
});
test('split quantity selection is one error opportunity and intentional interest purchases are excluded', () => {
  const good = fixture([add('milk', 1), add('milk', 1), { type: 'closeStation' }]);
  const { validationGoals } = require('../src/personaValidationMetrics.cjs');
  assert.equal(selectionErrors(actorEvents(good.trace, good.audit), validationGoals(snapshot)).length, 0);
  const wrong = fixture([add('milk', 3), { type: 'viewCart' }, { type: 'removeProduct', productId: 'milk', quantity: 1 }]);
  assert.equal(selectionErrors(actorEvents(wrong.trace, wrong.audit), validationGoals(snapshot)).length, 1);
  assert.equal(metrics([add('curry', 1, { interest: true })]).highLoadMismatchRate.status, 'unexercised');
});
test('actor decision sidecars and persona-review findings retain original step evidence', () => {
  const { trace, audit } = fixture([add('milk', 2)]);
  const actorDecisions = audit.decisions.map(d => ({ index: d.decisionIndex + 1, before: d.before,
    decision: { action: d.action, delayMs: 450, currentTask: '직접 고르기' } }));
  const m = extract(trace, snapshot, persona, null, { actorDecisions,
    personaReview: { findings: [{ code: 'AUDIT-NOTE', decisionIndexes: [0] }] } });
  assert.equal(m.familiarSelectionDelayMs.value, 450);
  assert.equal(m.familiarSelectionDelayMs.reviewFindings[0].code, 'AUDIT-NOTE');
  assert.deepEqual(m.familiarSelectionDelayMs.evidence, ['s0']);
});
test('spec covers every actual selected trait and thresholds are design values', () => {
  const spec = require('../validation/persona-validation-spec.json');
  for (const id of ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider']) {
    const p = require(`../personas/${id}.json`);
    p.character.selectedTraits.forEach((text, index) => assert.ok(spec.metrics.some(m => m.personaId === id && m.traitIndex === index && m.selectedTrait === text)));
  }
  assert.match(spec.note, /설계값.*임상/); assert.equal(spec.minAbsDelta, .33); assert.equal(spec.minValidPairs, 8);
});

test('intentional interest additions of a goal product do not become goal errors or mismatch feedback', () => {
  const rows = [{ type: 'readList' }, add('milk', 2), { type: 'closeStation' },
    add('milk', 1, { interest: true }), { type: 'viewCart' }, { type: 'pause', before: { cart: { milk: 3 } } }];
  const { trace, audit } = fixture(rows), m = extract(trace, snapshot, persona, audit);
  assert.equal(m.highLoadMismatchRate.value, 0);
  assert.equal(m.correctionRate.status, 'unexercised');
  const { validationGoals } = require('../src/personaValidationMetrics.cjs');
  assert.equal(selectionErrors(actorEvents(trace, audit), validationGoals(snapshot)).length, 0);
});
