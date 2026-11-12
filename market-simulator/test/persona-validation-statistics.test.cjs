'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { cliffsDelta, bootstrap, judge, binomialTail, scoreReview, nearestCentroidLeaveOneOut } = require('../src/validation/personaValidationStatistics.cjs');
const { IDS } = require('../src/validation/personaValidationBlind.cjs');
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('Cliff delta handles ties, unequal sizes, direction, and missing observations', () => {
  assert.equal(cliffsDelta([3, 4], [1, 2]), 1);
  assert.equal(cliffsDelta([1, 2, 3], [2, 3, 4]), -5 / 9);
  assert.equal(cliffsDelta([2, 3, 4], [1, 2, 3]), 5 / 9);
  assert.equal(cliffsDelta([1, 1], [1]), 0);
  assert.equal(cliffsDelta([1, 3, 5], [3]), 0);
  assert.equal(cliffsDelta([], [1]), null);
  assert.throws(() => cliffsDelta([null], [1]), /finite observed/);
  assert.throws(() => cliffsDelta([NaN], [1]), /finite observed/);
});

test('95 percent bootstrap resamples seed pairs together and reproduces the interval', () => {
  const pairs = [[1, 0], [2, 4], [7, 3], [8, 5], [2, 1], [5, 9], [2, 4], [4, 3]];
  assert.deepEqual(bootstrap(pairs, 'same-run:metric:low', 500), bootstrap(pairs, 'same-run:metric:low', 500));
  assert.deepEqual(bootstrap([[1, 1], [100, 100], [500, 500]], 'paired', 500), [0, 0]);
  assert.deepEqual(bootstrap([[3, 1], [4, 2]], 'positive', 500), [1, 1]);
  assert.equal(bootstrap([], 'empty', 500), null);
  assert.throws(() => bootstrap([[1, null]], 'bad', 500), /finite matched pairs/);
  assert.throws(() => bootstrap(pairs, 'bad', 0), /bootstrapReplicates/);
});

test('effect verdicts honor both directions, inclusive zero intervals and configured thresholds', () => {
  assert.equal(judge(.5, [.2, .8], 'up', .33, 8, 8), 'pass');
  assert.equal(judge(-.5, [-.8, -.2], 'up', .33, 8, 8), 'fail');
  assert.equal(judge(-.5, [-.8, -.2], 'down', .33, 8, 8), 'pass');
  assert.equal(judge(.5, [.2, .8], 'down', .33, 8, 8), 'fail');
  assert.equal(judge(.5, [0, .8], 'up', .33, 8, 8), 'inconclusive');
  assert.equal(judge(-.5, [-.8, 0], 'up', .33, 8, 8), 'inconclusive');
  assert.equal(judge(.32, [.1, .5], 'up', .33, 8, 8), 'inconclusive');
  assert.equal(judge(.5, [.2, .8], 'up', .33, 7, 8), 'insufficient');
  assert.equal(judge(.5, [.2, .8], 'up', .6, 10, 10), 'inconclusive');
  assert.equal(judge(.5, [.2, .8], 'up', .4, 10, 10), 'pass');
  assert.equal(judge(null, null, 'up', .33, 0, 8), 'insufficient');
  assert.throws(() => judge(.5, [.2, .8], 'sideways', .33, 8, 8), /direction/);
});

test('exact one-sided binomial tail matches known values without large-run underflow', () => {
  close(binomialTail(4, 4), 1 / 256);
  close(binomialTail(1, 4), 175 / 256);
  close(binomialTail(2, 4), 67 / 256);
  assert.equal(binomialTail(0, 0), 1);
  assert.equal(binomialTail(0, 10), 1);
  assert.equal(binomialTail(1, 10, 0), 0);
  assert.equal(binomialTail(10, 10, 1), 1);
  assert.ok(binomialTail(1000, 4000) > .50 && binomialTail(1000, 4000) < .52);
  assert.ok(binomialTail(1100, 4000) < binomialTail(1000, 4000));
  assert.throws(() => binomialTail(5, 4), /Invalid binomial/);
});

test('scoring produces the actual-by-predicted matrix and separate binary accuracy', () => {
  const rows = IDS.map((personaId, index) => ({ opaqueId: `sample-${index}`, personaId }));
  const answers = { 'sample-0': IDS[1], 'sample-1': IDS[1], 'sample-2': IDS[3], 'sample-3': IDS[3] };
  const score = scoreReview(rows, answers, IDS);
  assert.equal(score.correct, 2); assert.equal(score.accuracy, .5);
  assert.equal(score.binaryAccuracy, .75); assert.equal(score.binaryCorrect, 3);
  assert.equal(score.confusionMatrix[IDS[0]][IDS[1]], 1);
  assert.equal(score.confusionMatrix[IDS[2]][IDS[3]], 1);
  assert.equal(Object.values(score.confusionMatrix).flatMap(Object.values).reduce((a, b) => a + b, 0), 4);
  close(score.pValue, 67 / 256);
  assert.equal(score.alternative, 'greater'); assert.equal(score.chanceAccuracy, .25);
  assert.throws(() => scoreReview(rows, { ...answers, foreign: IDS[0] }, IDS), /Unexpected answer ID/);
  assert.throws(() => scoreReview(rows, {}, IDS), /Missing or invalid answer/);
  assert.throws(() => scoreReview([...rows, rows[0]], answers, IDS), /duplicate blind answer key/);
  assert.equal(scoreReview([], {}, IDS).accuracy, null);
});

const vectors = () => IDS.flatMap((personaId, classIndex) => [0, 1].map(seed => ({
  personaId, condition: 'low', seed, tracePath: `${classIndex}-${seed}`,
  values: { comparisonRate: classIndex / 3, delayMs: 1000 + classIndex * 500, unexercised: null },
})));

test('nearest centroid leaves each row out, reports four-class scores and requires all classes', () => {
  const result = nearestCentroidLeaveOneOut(vectors());
  assert.equal(result.low.accuracy, 1);
  assert.equal(result.low.binaryAccuracy, 1);
  assert.equal(result.low.coverage, 1);
  assert.equal(result.low.n, 8);
  assert.equal(result.low.accuracyIncludingAbstentions, 1);
  assert.equal(result.high.status, 'insufficient');
  assert.match(result.low.inferenceNote, /not an independent-sample/);
  assert.ok(result.low.predictions.every(row => !row.features.includes('unexercised')));
  assert.equal(nearestCentroidLeaveOneOut(vectors().slice(0, -1)).low.status, 'insufficient');
});

test('classifier standardization is invariant to metric units', () => {
  const original = vectors();
  original.forEach((row, index) => { row.values.delayMs = [100, 250, 400, 280, 310, 510, 610, 920][index]; });
  const scaled = original.map(row => ({ ...row, values: { ...row.values,
    delayMs: row.values.delayMs / 1000, comparisonRate: row.values.comparisonRate * 100 } }));
  const predict = rows => nearestCentroidLeaveOneOut(rows).low.predictions.map(row => row.guess);
  assert.deepEqual(predict(original), predict(scaled));
});

test('held-out row cannot pull its own training centroid toward itself', () => {
  const rows = IDS.flatMap((personaId, classIndex) => [0, 1].map(seed => ({ personaId,
    condition: 'low', tracePath: `${classIndex}-${seed}`,
    values: { x: classIndex === 0 ? seed * 100 : classIndex },
  })));
  const heldOut = nearestCentroidLeaveOneOut(rows).low.predictions.find(row => row.tracePath === '0-1');
  // With leakage the first class center is 50 and wins; its proper held-out center is 0.
  assert.equal(heldOut.guess, IDS[3]);
});

test('classifier never imputes missing opportunities or favors the first class on ties', () => {
  const missing = vectors().map(row => ({ ...row, values: { only: row.personaId === IDS[0] ? 1 : null } }));
  const noCoverage = nearestCentroidLeaveOneOut(missing).low;
  assert.equal(noCoverage.coverage, 0); assert.equal(noCoverage.accuracy, null);
  assert.equal(noCoverage.abstained, 8); assert.equal(noCoverage.accuracyIncludingAbstentions, 0);
  const tied = IDS.flatMap((personaId, classIndex) => [0, 1, 2].map(seed => ({ personaId,
    condition: 'low', tracePath: `${classIndex}-${seed}`, values: { x: seed - 1 } })));
  const result = nearestCentroidLeaveOneOut(tied).low;
  const middleRows = result.predictions.filter(row => row.tracePath.endsWith('-1'));
  assert.ok(middleRows.every(row => row.guess === null && row.reason === 'tied-nearest-centroids'));
  assert.ok(result.abstained >= 4);
});
