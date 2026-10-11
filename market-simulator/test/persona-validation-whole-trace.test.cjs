'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { actorEvents, extract } = require('../src/personaValidationMetrics.cjs');
const { flagsForTrace, collectionFlags, collectionDiagnostics } = require('../src/personaValidationFlags.cjs');
const persona = require('../personas/neutral-adult-control.json');
const step = (id, type, extra = {}) => ({ id, type, reactionDelayMs: 100, reason: 'choice', ...extra });
const add = (id, productId, quantity = 1) => step(id, 'dragProduct', { productId, quantity, gesture: { outcome: 'drop' } });
const snapshot = (match = 'exact') => ({ config: { difficulty: match, objectives: [{ productId: 'milk', quantity: 1 }] } });
function decision(decisionIndex, sequence, action, activity = 'goal', goalId = 'objective-1', extra = {}) {
  return { decisionIndex, before: { sequence }, action, delayMs: 200, reason: 'choice',
    actorState: { activity, task: 'shopping' }, basis: { intent: activity === 'interest' ? 'interest' : 'goal', goalId }, ...extra };
}
function wholeFixture() {
  const trace = { generation: { actorPolicyVersion: 'whole-trace-v3', systemCompletion: { firstStepId: 's8' } }, steps: [
    step('s0', 'start', { reactionDelayMs: 9999 }), step('s1', 'openShelf', { stationId: 'meal' }),
    step('s2', 'closeStation'), step('s3', 'viewHelp'), step('s4', 'closeView'), step('s5', 'readList'),
    step('s6', 'openShelf', { stationId: 'fresh' }), add('s7', 'milk'), step('s8', 'checkout'), step('s9', 'leave'),
  ] };
  const audit = { decisions: [decision(0, 1, { type: 'interact', station: 'meal' }, 'interest', null),
    decision(1, 2, { type: 'viewHelp' }, 'interest', null), decision(2, 4, { type: 'closeView' }),
    decision(3, 5, { type: 'readList' }), decision(4, 6, { type: 'interact', station: 'fresh' }),
    decision(5, 7, { type: 'add', productId: 'milk', quantity: 1 })] };
  audit.decisions[1].before.products = [{ id: 'curry' }];
  return { trace, audit };
}

test('candidate7 audit aligns real steps across start, automatic close and system completion', () => {
  const { trace, audit } = wholeFixture();
  const events = actorEvents(trace, audit);
  assert.deepEqual(events.map(s => s.id), ['s1', 's3', 's4', 's5', 's6', 's7']);
  assert.deepEqual(events.map(s => s.sourceStepIndex), [1, 3, 4, 5, 6, 7]);
  const metrics = extract(trace, snapshot(), persona, audit);
  assert.equal(metrics.interestRunLength.value, 2);
  assert.equal(metrics.interestRecoveryRate.value, 1);
  assert.deepEqual(metrics.interestRunLength.evidence, ['s1', 's3']);
  assert.deepEqual(metrics.interestRunLength.decisionIndexes, [0, 1]);
  assert.equal(metrics.curryDetourRate.value, 1);
  assert.equal(metrics.preCheckoutCartRate.status, 'unexercised');
  assert.throws(() => actorEvents({ ...trace, steps: trace.steps.filter(s => s.id !== 's3') }, audit), /matching replay step/);
});

test('shared family objective matching, exact wrong variants and employee returns affect mismatch', () => {
  assert.equal(extract({ steps: [add('a', 'milk-small')] }, snapshot('family'), persona).highLoadMismatchRate.value, 0);
  assert.equal(flagsForTrace({ steps: [add('a', 'milk-small')] }, snapshot('family'), null, persona)
    .some(f => f.code === 'all-familiar-goals-failed'), false);
  assert.equal(extract({ steps: [add('a', 'milk-small')] }, snapshot(), persona).highLoadMismatchRate.value, 1);
  const returned = { steps: [add('a', 'milk', 2), step('b', 'talkToStaff', { choice: 'returnProduct', productId: 'milk', quantity: 1 })] };
  assert.equal(extract(returned, snapshot(), persona).highLoadMismatchRate.value, 0);
  assert.equal(extract({ steps: [add('a', 'milk'), add('b', 'milk-small')] }, snapshot(), persona).highLoadMismatchRate.value, 1);
});

test('explicit goal binding makes a wrong product an exercised mismatch', () => {
  const trace = { steps: [step('s0', 'start'), add('s1', 'apple')] };
  const audit = { decisions: [decision(0, 1, { type: 'add', productId: 'apple', quantity: 1 })] };
  const metrics = extract(trace, snapshot(), persona, audit);
  assert.equal(metrics.highLoadMismatchRate.denominator, 1);
  assert.equal(metrics.highLoadMismatchRate.value, 1);
});

test('feedback is connected to actor choices and immediate correction includes that decision', () => {
  const trace = { steps: [step('s0', 'start'), step('s1', 'closeStation'), step('s2', 'viewHelp'),
    step('s3', 'closeView'), add('s4', 'milk'), add('s5', 'milk'), add('s6', 'milk'), step('s7', 'readList')] };
  const audit = { decisions: [decision(0, 1, { type: 'viewHelp' }), decision(1, 3, { type: 'closeView' }),
    decision(2, 4, { type: 'add', productId: 'milk' }), decision(3, 5, { type: 'add', productId: 'milk' }),
    decision(4, 6, { type: 'add', productId: 'milk' }), decision(5, 7, { type: 'readList' })] };
  for (const d of audit.decisions.slice(3)) d.before.result = { accepted: false, message: 'same error' };
  const flags = flagsForTrace(trace, snapshot(), audit, persona);
  const repeated = flags.find(f => f.code === 'same-wrong-choice-after-feedback');
  assert.deepEqual(repeated.stepIds, ['s4', 's5', 's6']);
  assert.deepEqual(repeated.decisionIndexes, [2, 3, 4]);
  const metric = extract(trace, snapshot(), persona, audit).correctionRate;
  assert.equal(metric.denominator, 3);
  assert.equal(metric.numerator, 1);
  assert.deepEqual(metric.evidence, ['s5', 's6', 's7']);
});

test('whole-trace unavailable motor errors and one sample per load do not create variance violations', () => {
  const sample = wholeFixture();
  const rows = ['low', 'high'].map(condition => ({ ...sample, condition }));
  const diagnostics = collectionDiagnostics(rows);
  assert.equal(diagnostics[0].errorCount, null);
  assert.equal(diagnostics[0].interestCount, 2);
  assert.deepEqual(collectionFlags(rows), []);
  assert.ok(!collectionFlags([{ ...sample, condition: 'low' }, { ...sample, condition: 'low' }]).includes('zero-error-variance'));
});

test('audit currentTask contributes to role warnings and unrelated shelf browsing is not comparison', () => {
  const { trace, audit } = wholeFixture();
  audit.decisions[0].currentTask = '페르소나 연기';
  assert.deepEqual(flagsForTrace(trace, snapshot(), audit, persona).find(f => f.code === 'role-or-disability-mentioned').stepIds, ['s1']);
  const otherShelf = { steps: [step('a', 'browse'), step('b', 'closeStation'), step('c', 'openShelf', { stationId: 'fresh' }), add('d', 'milk')] };
  assert.equal(extract(otherShelf, snapshot(), persona).comparisonRate.value, 0);
});
