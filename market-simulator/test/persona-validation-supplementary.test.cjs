'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { stratifiedPairedBootstrap, simulateDeltaPower } = require('../src/validation/personaValidationSupplementary.cjs');

test('stratified paired bootstrap is reproducible, order independent and does not compare across loads', () => {
  const rows = ['a', 'b', 'c'].flatMap((seed, index) => [
    { condition: 'low', seed, pair: [index + 2, index] },
    { condition: 'high', seed, pair: [index + 100, index + 102] },
  ]);
  const result = stratifiedPairedBootstrap(rows, 'strata', 100);
  assert.deepEqual(result, stratifiedPairedBootstrap([...rows].reverse(), 'strata', 100));
  assert.equal(result.delta, 0); assert.deepEqual(result.interval, [0, 0]);
  assert.equal(result.n, 6); assert.equal(result.independentSeedCount, 3);
  assert.equal(result.descriptiveOnly, true); assert.equal(result.usedForPrimaryVerdict, false);
  assert.deepEqual(result.availabilityBlocks, [{ conditions: ['high', 'low'], seeds: 3 }]);
});

test('pooled bootstrap preserves condition sample counts when opportunities are missing', () => {
  const rows = [{ condition: 'low', seed: 'shared', pair: [1, 0] }, { condition: 'high', seed: 'shared', pair: [3, 0] },
    { condition: 'low', seed: 'low-only', pair: [2, 0] }];
  const result = stratifiedPairedBootstrap(rows, 'missing', 50);
  assert.deepEqual(result.strata.map(row => [row.condition, row.n]), [['low', 2], ['high', 1]]);
  assert.deepEqual(result.interval, [1, 1]); assert.equal(result.availabilityBlocks.length, 2);
  const partial = stratifiedPairedBootstrap(rows.filter(row => row.condition === 'low'), 'partial', 50);
  assert.equal(partial.status, 'partial'); assert.equal(partial.strata[1].delta, null);
  const none = stratifiedPairedBootstrap([], 'empty', 50);
  assert.equal(none.status, 'unexercised'); assert.equal(none.delta, null); assert.equal(none.interval, null);
  assert.throws(() => stratifiedPairedBootstrap([...rows, rows[0]], 'duplicate', 50), /Duplicate/);
  assert.throws(() => stratifiedPairedBootstrap([{ condition: 'low', seed: 'x', pair: [null, 1] }], 'null', 50), /finite/);
});

test('approximate power is fixed-seed reproducible and retains the primary design thresholds', () => {
  const options = { seed: 'power-test', simulations: 60, bootstrapReplicates: 59 };
  const result = simulateDeltaPower(8, options);
  assert.deepEqual(result, simulateDeltaPower(8, options));
  assert.equal(result.targetAbsDelta, .33); assert.equal(result.minAbsDelta, .33); assert.equal(result.minValidPairs, 8);
  assert.ok(result.detectionPower >= 0 && result.detectionPower <= 1);
  assert.ok(result.passProbability >= 0 && result.passProbability <= result.detectionPower);
  assert.equal(result.usedForPrimaryVerdict, false);
  assert.match(result.limitations.join(' '), /hypothetical.*not empirical/);
  assert.equal(simulateDeltaPower(7, options).passProbability, 0);
  const singleton = simulateDeltaPower(1, options);
  assert.equal(singleton.status, 'insufficient'); assert.equal(singleton.detectionPower, null);
  assert.equal(singleton.passProbability, 0); assert.match(singleton.reliabilityWarning, /Fewer than two pairs/);
  const empty = simulateDeltaPower(0, options);
  assert.equal(empty.status, 'unexercised'); assert.equal(empty.detectionPower, null); assert.equal(empty.passProbability, null);
  assert.throws(() => simulateDeltaPower(-1, options), /nonnegative/);
  assert.throws(() => simulateDeltaPower(8, { ...options, withinPairCorrelation: 1 }), /correlation/);
});
