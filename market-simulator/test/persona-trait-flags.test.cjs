'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { summarizeFlags } = require('../src/personaTraitValidationRun.cjs');
const { flagsForTrace, collectionFindings } = require('../src/personaValidationFlags.cjs');
const persona = require('../personas/neutral-adult-control.json');
const snapshot = { config: { objectives: [{ productId: 'milk', quantity: 1 }] } };
const step = (id, type, extra = {}) => ({ id, type, ...extra });
const add = (quantity = 1) => step('select', 'dragProduct', { productId: 'milk', quantity, gesture: { outcome: 'drop' } });
function sample(steps, tracePath = '/fixture') {
  const trace = { steps };
  return { personaId: 'profile', tracePath, trace, snapshot, persona, condition: 'low', flags: flagsForTrace(trace, snapshot, null, persona) };
}
test('help before every selection remains diagnostic rather than universal personality failure', () => {
  const row = sample([step('help', 'viewHelp'), add()]);
  assert.ok(row.flags.some(flag => flag.code === 'no-independent-choice' && flag.severity === 'review'));
  const summary = summarizeFlags([row], ['profile']).profile;
  assert.notEqual(summary.status, 'fail');
});
test('accuracy and equal error counts do not become prohibited-pattern failures', () => {
  const rows = [sample([add(2)], '/one'), sample([add(2)], '/two')];
  assert.ok(rows.every(row => row.flags.some(flag => flag.code === 'all-familiar-goals-failed')));
  const summary = summarizeFlags(rows, ['profile']).profile;
  assert.notEqual(summary.status, 'fail');
  assert.ok(JSON.stringify(summary).includes('every-trace-has-error'));
  assert.ok(JSON.stringify(summary).includes('zero-error-variance'));
});
test('an explicit prohibited role disclosure can still fail universal pattern validation', () => {
  const row = sample([step('explanation', 'pause', { reason: '페르소나 연기 중이다' })]);
  assert.ok(row.flags.some(flag => flag.code === 'role-or-disability-mentioned'));
  assert.equal(summarizeFlags([row], ['profile']).profile.status, 'fail');
});
test('a run can bind its own repetition and variance thresholds without changing legacy defaults', () => {
  const trace = { steps: [...['one', 'two', 'three'].map(id => ({ ...add(), id })), step('after', 'pause')] };
  const audit = { decisions: [1, 2, 3].map(decisionIndex => ({ decisionIndex, before: { lastActionError: 'same rejected choice' } })) };
  const overridden = { sameWrongChoiceMinimum: 4, minimumVarianceSamples: 3 };
  const repeats = flags => flags.some(flag => flag.code === 'same-wrong-choice-after-feedback');
  assert.equal(repeats(flagsForTrace(trace, snapshot, audit, persona)), true);
  assert.equal(repeats(flagsForTrace(trace, snapshot, audit, persona, {}, overridden)), false);
  const rows = [sample([add()], '/one'), sample([add()], '/two')];
  const equalErrors = findings => findings.some(finding => finding.code === 'zero-error-variance');
  assert.equal(equalErrors(collectionFindings(rows)), true);
  assert.equal(equalErrors(collectionFindings(rows, overridden)), false);
  assert.equal(equalErrors(collectionFindings([...rows, sample([add()], '/three')], overridden)), true);
  assert.equal(equalErrors(collectionFindings(rows)), true);
});
