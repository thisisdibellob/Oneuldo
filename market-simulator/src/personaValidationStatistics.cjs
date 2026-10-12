'use strict';
const { Random } = require('./random.ts');

function finiteValues(values) {
  if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) {
    throw new Error('Statistics require finite observed values; exclude unexercised observations first');
  }
}

function cliffsDelta(xs, ys) {
  finiteValues(xs); finiteValues(ys);
  if (!xs.length || !ys.length) return null;
  let score = 0;
  for (const x of xs) for (const y of ys) score += x > y ? 1 : x < y ? -1 : 0;
  return score / (xs.length * ys.length);
}

/** Percentile 95% interval. Each index is an already matched condition/seed pair:
 * resample the pair together, then calculate the two-sample Cliff's delta. */
function bootstrap(pairs, seed, count) {
  if (!Number.isSafeInteger(count) || count < 2) throw new Error('bootstrapReplicates must be an integer >= 2');
  if (!Array.isArray(pairs) || pairs.some(pair => !Array.isArray(pair) || pair.length !== 2
    || pair.some(value => !Number.isFinite(value)))) throw new Error('Bootstrap requires finite matched pairs');
  if (!pairs.length) return null;
  const random = new Random(seed), values = [];
  for (let b = 0; b < count; b++) {
    const sample = Array.from({ length: pairs.length }, () => pairs[Math.floor(random.next() * pairs.length)]);
    values.push(cliffsDelta(sample.map(pair => pair[0]), sample.map(pair => pair[1])));
  }
  values.sort((a, b) => a - b);
  return [values[Math.floor(.025 * (values.length - 1))], values[Math.ceil(.975 * (values.length - 1))]];
}

function judge(delta, interval, direction, minAbsDelta, n, minPairs) {
  if (!['up', 'down'].includes(direction)) throw new Error('Expected direction must be up or down');
  if (!Number.isFinite(minAbsDelta) || minAbsDelta < 0 || minAbsDelta > 1
    || !Number.isSafeInteger(minPairs) || minPairs < 1 || !Number.isSafeInteger(n) || n < 0) {
    throw new Error('Invalid persona fidelity thresholds or sample count');
  }
  if (n < minPairs) return 'insufficient';
  if (delta === null || !interval) return 'inconclusive';
  if (!Number.isFinite(delta) || Math.abs(delta) > 1 || interval.length !== 2
    || interval.some(value => !Number.isFinite(value) || Math.abs(value) > 1) || interval[0] > interval[1]) {
    throw new Error('Invalid effect size or confidence interval');
  }
  const significant = Math.abs(delta) >= minAbsDelta && (interval[0] > 0 || interval[1] < 0);
  if (!significant || delta === 0) return 'inconclusive';
  return Math.sign(delta) === (direction === 'up' ? 1 : -1) ? 'pass' : 'fail';
}

/** Exact one-sided P(X >= k), H1: accuracy > chance. Work in log space so
 * large runs do not underflow at P(X = 0) before reaching the relevant tail. */
function binomialTail(k, n, p = .25) {
  if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(k) || k < 0 || k > n
    || !Number.isFinite(p) || p < 0 || p > 1) throw new Error('Invalid binomial counts or chance probability');
  if (k === 0 || p === 1) return 1;
  if (p === 0) return 0;
  let logChoose = 0;
  for (let i = 1; i <= Math.min(k, n - k); i++) logChoose += Math.log(n - i + 1) - Math.log(i);
  let logTerm = logChoose + k * Math.log(p) + (n - k) * Math.log1p(-p);
  let logSum = logTerm;
  for (let i = k + 1; i <= n; i++) {
    logTerm += Math.log(n - i + 1) - Math.log(i) + Math.log(p) - Math.log1p(-p);
    const largest = Math.max(logSum, logTerm);
    logSum = largest + Math.log1p(Math.exp(Math.min(logSum, logTerm) - largest));
  }
  return Math.max(0, Math.min(1, Math.exp(logSum)));
}

function scoreReview(rows, answers, ids) {
  if (!Array.isArray(ids) || ids.length !== 4 || new Set(ids).size !== 4 || !ids.includes('neutral-adult-control')) {
    throw new Error('Blind scoring requires the four persona classes including the control');
  }
  if (!Array.isArray(rows) || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new Error('Blind scoring requires rows and an answer map');
  }
  const opaqueIds = new Set(rows.map(row => row.opaqueId));
  if (opaqueIds.size !== rows.length || rows.some(row => typeof row.opaqueId !== 'string' || !row.opaqueId
    || !ids.includes(row.personaId))) throw new Error('Invalid or duplicate blind answer key');
  if (Object.keys(answers).some(id => !opaqueIds.has(id))) throw new Error('Unexpected answer ID for this blind panel');
  const matrix = Object.fromEntries(ids.map(actual => [actual, Object.fromEntries(ids.map(predicted => [predicted, 0]))]));
  let correct = 0, binary = 0;
  for (const row of rows) {
    const guess = Object.hasOwn(answers, row.opaqueId) ? answers[row.opaqueId] : undefined;
    if (!ids.includes(guess)) throw new Error(`Missing or invalid answer: ${row.opaqueId}`);
    matrix[row.personaId][guess]++;
    if (guess === row.personaId) correct++;
    if ((guess === 'neutral-adult-control') === (row.personaId === 'neutral-adult-control')) binary++;
  }
  return { n: rows.length, correct, accuracy: rows.length ? correct / rows.length : null,
    chanceAccuracy: .25, alternative: 'greater', pValue: binomialTail(correct, rows.length),
    binaryCorrect: binary, binaryAccuracy: rows.length ? binary / rows.length : null, confusionMatrix: matrix };
}

/** Score independently inferred trait levels, including an explicit abstention.
 * No uniform class baseline is meaningful for arbitrary profile mixtures: many
 * people may share a style, and the observed level distribution can be skewed. */
function scoreTraitReview(rows, answers, { traitKeys, levels = ['low', 'medium', 'high'] } = {}) {
  const uniqueStrings = values => Array.isArray(values) && values.length > 0
    && values.every(value => typeof value === 'string' && value.trim()) && new Set(values).size === values.length;
  if (!uniqueStrings(traitKeys) || !uniqueStrings(levels) || levels.includes('unknown')) {
    throw new Error('Trait scoring requires unique traitKeys and levels excluding unknown');
  }
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const completeTraits = (value, allowed) => record(value) && Object.keys(value).length === traitKeys.length
    && traitKeys.every(key => Object.hasOwn(value, key) && allowed.includes(value[key]));
  if (!Array.isArray(rows) || !record(answers)) throw new Error('Trait scoring requires rows and an answer map');
  const opaqueIds = new Set(rows.map(row => row?.opaqueId));
  if (opaqueIds.size !== rows.length || rows.some(row => !record(row) || typeof row.opaqueId !== 'string'
    || !row.opaqueId || !completeTraits(row.traits, levels))) throw new Error('Invalid or duplicate trait answer key');
  if (Object.keys(answers).some(id => !opaqueIds.has(id))) throw new Error('Unexpected answer ID for this blind panel');
  const predictions = [...levels, 'unknown'];
  const perTrait = Object.fromEntries(traitKeys.map(key => [key, { n: rows.length, knownPredictions: 0,
    abstained: 0, correct: 0, accuracy: null, coverage: null, accuracyWhenPredicted: null,
    confusionMatrix: Object.fromEntries(levels.map(actual => [actual,
      Object.fromEntries(predictions.map(predicted => [predicted, 0]))])) }]));
  for (const row of rows) {
    const answer = Object.hasOwn(answers, row.opaqueId) ? answers[row.opaqueId] : undefined;
    if (!record(answer) || Object.keys(answer).some(key => !['traits', 'confidence'].includes(key))
      || !completeTraits(answer.traits, predictions)
      || answer.confidence !== undefined && (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1)) {
      throw new Error(`Missing or invalid trait answer or confidence (expected 0..1): ${row.opaqueId}`);
    }
    for (const key of traitKeys) {
      const score = perTrait[key], actual = row.traits[key], predicted = answer.traits[key];
      score.confusionMatrix[actual][predicted]++;
      if (predicted === 'unknown') score.abstained++;
      else score.knownPredictions++;
      if (predicted === actual) score.correct++;
    }
  }
  for (const score of Object.values(perTrait)) {
    score.accuracy = score.n ? score.correct / score.n : null;
    score.coverage = score.n ? score.knownPredictions / score.n : null;
    score.accuracyWhenPredicted = score.knownPredictions ? score.correct / score.knownPredictions : null;
  }
  const average = key => rows.length
    ? Object.values(perTrait).reduce((sum, score) => sum + score[key], 0) / traitKeys.length : null;
  return { scoring: 'trait-level-with-abstentions', n: rows.length, traitKeys: [...traitKeys], levels: [...levels],
    perTrait, macroAccuracy: average('accuracy'), macroCoverage: average('coverage'),
    accuracyDefinition: 'Each unknown prediction stays in the denominator and is not correct.',
    inferenceNote: 'Descriptive agreement with configured fictional traits; no fixed chance baseline or disability classification is used.' };
}

/** Diagnostic classifier only. Means/scales use the training fold, never the
 * held-out row. Missing opportunities stay missing; they are not imputed as 0.
 * Every class competes on the SAME observed features. Ties abstain. */
function nearestCentroidLeaveOneOut(vectors, ids = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control']) {
  const result = {};
  for (const condition of ['low', 'high']) {
    const rows = vectors.filter(vector => vector.condition === condition);
    if (rows.some(row => !ids.includes(row.personaId))) throw new Error('Unknown class in metric vectors');
    const counts = Object.fromEntries(ids.map(id => [id, rows.filter(row => row.personaId === id).length]));
    const method = { classifier: 'nearest-centroid', validation: 'leave-one-out',
      scaling: 'training-fold-standard-deviation', missing: 'common-observed-features-no-imputation', ties: 'abstain' };
    if (ids.some(id => counts[id] < 2)) {
      result[condition] = { status: 'insufficient', reason: 'Leave-one-out requires at least two observed traces per class in this condition', counts, method };
      continue;
    }
    const predictions = [];
    for (let index = 0; index < rows.length; index++) {
      const heldOut = rows[index], training = rows.filter((_, i) => i !== index);
      const commonFeatures = [];
      for (const key of Object.keys(heldOut.values ?? {}).sort()) {
        if (!Number.isFinite(heldOut.values[key])) continue;
        const byClass = ids.map(id => training.filter(row => row.personaId === id)
          .map(row => row.values?.[key]).filter(Number.isFinite));
        if (byClass.some(values => !values.length)) continue;
        const values = byClass.flat(), mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const scale = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
        if (!Number.isFinite(scale) || scale === 0) continue;
        commonFeatures.push({ key, scale, centers: byClass.map(values => values.reduce((sum, value) => sum + value, 0) / values.length) });
      }
      const prediction = { opaqueId: String(index), tracePath: heldOut.tracePath, personaId: heldOut.personaId,
        features: commonFeatures.map(feature => feature.key), guess: null };
      if (!commonFeatures.length) prediction.reason = 'no-varying-common-observed-features';
      else {
        const distances = ids.map((id, classIndex) => ({ id,
          distance: commonFeatures.reduce((sum, feature) => sum
            + ((heldOut.values[feature.key] - feature.centers[classIndex]) / feature.scale) ** 2, 0) / commonFeatures.length }));
        distances.sort((a, b) => a.distance - b.distance);
        const best = distances[0], tolerance = Number.EPSILON * Math.max(1, Math.abs(best.distance)) * 32;
        if (!Number.isFinite(best.distance)) prediction.reason = 'nonfinite-distance';
        else if (distances.filter(candidate => Math.abs(candidate.distance - best.distance) <= tolerance).length > 1) prediction.reason = 'tied-nearest-centroids';
        else prediction.guess = best.id;
      }
      predictions.push(prediction);
    }
    const classified = predictions.filter(row => row.guess !== null);
    const score = scoreReview(classified, Object.fromEntries(classified.map(row => [row.opaqueId, row.guess])), ids);
    result[condition] = { ...score, status: classified.length ? 'measured' : 'insufficient', counts, method,
      total: rows.length, classified: classified.length, abstained: rows.length - classified.length,
      coverage: classified.length / rows.length,
      accuracyIncludingAbstentions: score.correct / rows.length,
      binaryAccuracyIncludingAbstentions: score.binaryCorrect / rows.length,
      inferenceNote: 'Leave-one-out predictions share training data; the binomial p value is a descriptive cross-check, not an independent-sample significance test.',
      predictions };
  }
  return result;
}

module.exports = { cliffsDelta, bootstrap, judge, binomialTail, scoreReview, scoreTraitReview, nearestCentroidLeaveOneOut };
