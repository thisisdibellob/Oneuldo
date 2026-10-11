'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { flagsForTrace, collectionFlags, collectionFindings, collectionDiagnostics } = require('../src/personaValidationFlags.cjs');
const persona = require('../personas/neutral-adult-control.json');
const snapshot = { config: { objectives: [{ productId: 'milk', quantity: 2 }, { productId: 'apple', quantity: 1 }] } };
const step = (id, type, extra = {}) => ({ id, type, reactionDelayMs: 100, reason: '상품을 살펴본다', ...extra });
const add = (id, productId, quantity = 1, extra = {}) => step(id, 'dragProduct', { productId, quantity, gesture: { outcome: 'drop' }, ...extra });
const codes = (trace, audit) => flagsForTrace(trace, snapshot, audit, persona).map(f => f.code);

test('same wrong choice requires three identical feedback outcomes and retains every responsible step', () => {
  const trace = { steps: [add('a', 'milk'), add('b', 'milk'), add('c', 'milk'), step('d', 'pause')] };
  const audit = { decisions: [1, 2, 3].map(decisionIndex => ({ decisionIndex, before: { lastActionError: '같은 오류' } })) };
  const flag = flagsForTrace(trace, snapshot, audit, persona).find(f => f.code === 'same-wrong-choice-after-feedback');
  assert.deepEqual(flag.stepIds, ['a', 'b', 'c']);
  audit.decisions[1].before.lastActionError = '다른 오류';
  assert.ok(!codes(trace, audit).includes('same-wrong-choice-after-feedback'));
  assert.ok(!codes(trace).includes('same-wrong-choice-after-feedback'));
});
test('familiar goals are failed only when no familiar goal reaches its final required quantity', () => {
  assert.ok(codes({ steps: [add('a', 'milk', 1)] }).includes('all-familiar-goals-failed'));
  assert.ok(!codes({ steps: [add('a', 'milk', 2)] }).includes('all-familiar-goals-failed'));
  assert.ok(codes({ steps: [add('a', 'milk', 2), step('b', 'removeProduct', { productId: 'milk', quantity: 1 })] }).includes('all-familiar-goals-failed'));
});
test('an interest purchase that physically satisfies a familiar goal is not a failed goal', () => {
  const trace = { steps: [add('a', 'milk', 2, { attentionTag: 'interest' })] };
  assert.ok(!codes(trace).includes('all-familiar-goals-failed'));
});
test('independent choice distinguishes actual help from returning a product and tolerates view closure', () => {
  const dependent = { steps: [step('a', 'viewHelp'), step('b', 'closeView'), add('c', 'milk', 2)] };
  assert.ok(codes(dependent).includes('no-independent-choice'));
  assert.ok(!codes({ steps: [...dependent.steps, add('d', 'apple')] }).includes('no-independent-choice'));
  assert.ok(!codes({ steps: [step('a', 'talkToStaff', { choice: 'returnProduct', productId: 'milk', quantity: 1 }), add('b', 'milk', 2)] }).includes('no-independent-choice'));
});
test('prohibited role references are detected in reason and currentTask with safe alternatives', () => {
  assert.ok(codes({ steps: [step('a', 'pause', { currentTask: '페르소나 연기' })] }).includes('role-or-disability-mentioned'));
  assert.ok(codes({ steps: [step('b', 'pause', { reason: 'role-play a disability' })] }).includes('role-or-disability-mentioned'));
  assert.ok(!codes({ steps: [add('c', 'milk', 2, { reason: '목록에 적힌 우유 두 개를 고른다' })] }).includes('role-or-disability-mentioned'));
});
test('whole-trace errors measure task mismatches and interest episodes rather than unavailable motor noise', () => {
  const sample = (tracePath, amount, interest = false) => ({ tracePath, snapshot, condition: 'high', trace: {
    generation: { actorPolicyVersion: 'whole-trace-v3' }, steps: [add('a', 'milk', amount),
      step('b', 'closeStation'), ...(interest ? [step('c', 'pause', { attentionTag: 'interest' }), step('d', 'pause', { attentionTag: 'interest' })] : [])] } });
  const diagnostics = collectionDiagnostics([sample('/a', 3, true), sample('/b', 2)]);
  assert.equal(diagnostics[0].errorCount, 1); assert.equal(diagnostics[1].errorCount, 0);
  assert.equal(diagnostics[0].interestCount, 1); assert.deepEqual(diagnostics[0].errorStepIds, ['a']);
  assert.ok(!collectionFlags([sample('/a', 3, true), sample('/b', 2)]).includes('every-trace-has-error'));
  assert.ok(collectionFlags([sample('/a', 3, true), sample('/b', 4)]).includes('every-trace-has-error'));
});
test('each condition is checked independently and findings retain condition plus trace/step evidence', () => {
  const row = (condition, tracePath, n) => ({ condition, tracePath, snapshot,
    trace: { steps: Array.from({ length: n }, (_, i) => add(`s${i}`, 'milk', 1, { gesture: { outcome: 'miss' } })) } });
  const rows = [row('low', '/a', 1), row('low', '/b', 1), row('high', '/c', 0), row('high', '/d', 2)];
  const finding = collectionFindings(rows).find(f => f.code === 'zero-error-variance');
  assert.equal(finding.condition, 'low'); assert.deepEqual(finding.traces, [
    { tracePath: '/a', stepIds: ['s0'] }, { tracePath: '/b', stepIds: ['s0'] }]);
  assert.ok(!collectionFindings(rows).some(f => f.condition === 'high' && f.code === 'zero-error-variance'));
});
test('zero correction is conditional on exercised feedback and any actual correction prevents the set flag', () => {
  const make = (numerator, denominator) => ({ tracePath: '/sample', snapshot, trace: { steps: [add('a', 'milk', 2)] },
    metrics: { correctionRate: { numerator, denominator, evidence: ['a'] } } });
  assert.ok(collectionFlags([make(0, 1)]).includes('zero-correction-after-feedback'));
  assert.ok(!collectionFlags([make(0, 0)]).includes('zero-correction-after-feedback'));
  assert.ok(!collectionFlags([make(0, 1), make(1, 1)]).includes('zero-correction-after-feedback'));
});
