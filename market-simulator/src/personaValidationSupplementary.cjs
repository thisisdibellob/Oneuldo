'use strict';
const { Random } = require('./random.ts');
const { cliffsDelta } = require('./personaValidationStatistics.cjs');

function percentileInterval(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? [sorted[Math.floor(.025 * (sorted.length - 1))], sorted[Math.ceil(.975 * (sorted.length - 1))]] : null;
}
function replicates(count) {
  if (!Number.isSafeInteger(count) || count < 2) throw new Error('Replicates must be an integer >= 2');
}
function fastDelta(xs, ys) {
  const sorted = [...ys].sort((a, b) => a - b);
  let score = 0;
  for (const x of xs) {
    let lower = 0, upper = sorted.length;
    while (lower < upper) { const middle = (lower + upper) >>> 1; if (sorted[middle] < x) lower = middle + 1; else upper = middle; }
    const below = lower;
    lower = 0; upper = sorted.length;
    while (lower < upper) { const middle = (lower + upper) >>> 1; if (sorted[middle] <= x) lower = middle + 1; else upper = middle; }
    score += below - (sorted.length - lower);
  }
  return score / (xs.length * ys.length);
}

/** Conditions are fixed strata. Resample a seed's available condition pairs
 * together, within its availability pattern, so repeated seeds are not treated
 * as independent and missing opportunities never become observed zeroes. */
function stratifiedPairedBootstrap(rows, seed, count = 2000, expectedConditions = ['low', 'high']) {
  replicates(count);
  if (!Array.isArray(rows) || rows.some(row => typeof row?.condition !== 'string' || !row.condition
    || !['string', 'number'].includes(typeof row.seed) || !Array.isArray(row.pair) || row.pair.length !== 2
    || row.pair.some(value => !Number.isFinite(value)))) throw new Error('Pooled analysis requires condition/seed and finite matched pairs');
  if (!Array.isArray(expectedConditions) || !expectedConditions.length
    || expectedConditions.some(condition => typeof condition !== 'string' || !condition)
    || new Set(expectedConditions).size !== expectedConditions.length
    || rows.some(row => !expectedConditions.includes(row.condition))) throw new Error('Invalid pooled conditions');
  const ordered = [...rows].sort((a, b) => a.condition.localeCompare(b.condition) || String(a.seed).localeCompare(String(b.seed)));
  const keys = ordered.map(row => JSON.stringify([row.condition, String(row.seed)]));
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate condition/seed pair in pooled analysis');
  const strata = expectedConditions.map(condition => ({ condition, rows: ordered.filter(row => row.condition === condition) }));
  const observed = strata.filter(stratum => stratum.rows.length), seeds = new Map();
  for (const row of ordered) { const key = String(row.seed); seeds.set(key, [...(seeds.get(key) ?? []), row]); }
  const blocks = new Map();
  for (const [key, observations] of seeds) {
    const pattern = JSON.stringify(observations.map(row => row.condition).sort());
    blocks.set(pattern, [...(blocks.get(pattern) ?? []), { seed: key, observations }]);
  }
  const estimate = sample => observed.reduce((sum, stratum) => {
    const pairs = sample.filter(row => row.condition === stratum.condition).map(row => row.pair);
    return sum + fastDelta(pairs.map(pair => pair[0]), pairs.map(pair => pair[1])) / observed.length;
  }, 0);
  const random = new Random(seed), distribution = [];
  if (ordered.length) for (let b = 0; b < count; b++) {
    const sample = [];
    for (const block of blocks.values()) for (let index = 0; index < block.length; index++) {
      sample.push(...block[Math.floor(random.next() * block.length)].observations);
    }
    distribution.push(estimate(sample));
  }
  return { descriptiveOnly: true, usedForPrimaryVerdict: false,
    status: !ordered.length ? 'unexercised' : observed.length < expectedConditions.length ? 'partial' : 'measured',
    estimator: 'equal-condition-weighted-cliffs-delta', intervalMethod: 'seed-cluster-bootstrap-within-availability-pattern',
    seed: String(seed), bootstrapReplicates: count, n: ordered.length, independentSeedCount: seeds.size,
    delta: ordered.length ? estimate(ordered) : null, interval: percentileInterval(distribution),
    strata: strata.map(stratum => ({ condition: stratum.condition, n: stratum.rows.length,
      weight: stratum.rows.length ? 1 / observed.length : null,
      delta: stratum.rows.length ? cliffsDelta(stratum.rows.map(row => row.pair[0]), stratum.rows.map(row => row.pair[1])) : null })),
    availabilityBlocks: [...blocks.entries()].map(([pattern, block]) => ({ conditions: JSON.parse(pattern), seeds: block.length })),
    limitations: ['Descriptive supplementary analysis; it does not replace condition-specific primary decisions.',
      'Each observed condition has equal weight; no cross-condition distribution comparisons are pooled.',
      'Only exercised pairs are included. Seed clusters preserve observed cross-condition dependence but do not make missingness random.'],
  };
}

// Fixed approximation to the standard normal CDF; used only to calibrate the
// explicitly hypothetical equal-variance location-shift power scenario.
function normalCdf(value) {
  const x = Math.abs(value), t = 1 / (1 + .2316419 * x);
  const tail = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)
    * t * (.319381530 + t * (-.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return value >= 0 ? 1 - tail : tail;
}
function normalQuantile(probability) {
  let lower = -10, upper = 10;
  for (let index = 0; index < 70; index++) {
    const middle = (lower + upper) / 2;
    if (normalCdf(middle) < probability) lower = middle; else upper = middle;
  }
  return (lower + upper) / 2;
}
function normalDraw(random) {
  return Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random.next()))) * Math.cos(2 * Math.PI * random.next());
}
/** Prospective model-based sensitivity at the design boundary, not observed
 * power estimated from the same measured effect. The actual metric distribution
 * and seed correlation are unknown, so this scenario cannot establish power. */
function simulateDeltaPower(n, { seed = 'persona-validation-power-v1', simulations = 400, bootstrapReplicates = 199,
  withinPairCorrelation = 0 } = {}) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Power sample size must be a nonnegative integer');
  replicates(simulations); replicates(bootstrapReplicates);
  if (!Number.isFinite(withinPairCorrelation) || withinPairCorrelation <= -1 || withinPairCorrelation >= 1) {
    throw new Error('Power within-pair correlation must be between -1 and 1');
  }
  const targetAbsDelta = .33, minValidPairs = 8, minAbsDelta = .33;
  const normalMeanShift = Math.SQRT2 * normalQuantile((1 + targetAbsDelta) / 2);
  const random = new Random(`${seed}:${n}`);
  let detected = 0, passed = 0;
  if (n >= 2) for (let iteration = 0; iteration < simulations; iteration++) {
    const pairs = Array.from({ length: n }, () => {
      const shared = normalDraw(random), independent = normalDraw(random);
      return [normalMeanShift + shared, withinPairCorrelation * shared + Math.sqrt(1 - withinPairCorrelation ** 2) * independent];
    });
    const delta = fastDelta(pairs.map(pair => pair[0]), pairs.map(pair => pair[1])), values = [];
    for (let b = 0; b < bootstrapReplicates; b++) {
      const sampled = Array.from({ length: n }, () => pairs[Math.floor(random.next() * n)]);
      values.push(fastDelta(sampled.map(pair => pair[0]), sampled.map(pair => pair[1])));
    }
    const interval = percentileInterval(values), excludesZeroInExpectedDirection = interval[0] > 0;
    detected += Number(excludesZeroInExpectedDirection);
    passed += Number(n >= minValidPairs && delta >= minAbsDelta && excludesZeroInExpectedDirection);
  }
  const detectionPower = n >= 2 ? detected / simulations : null, passProbability = n >= 2 ? passed / simulations : n ? 0 : null;
  return { descriptiveOnly: true, usedForPrimaryVerdict: false, status: n >= 2 ? 'simulated' : n ? 'insufficient' : 'unexercised', n,
    reliabilityWarning: n < 2 ? 'Fewer than two pairs cannot produce a meaningful empirical bootstrap interval.'
      : n < 8 ? 'Very small-sample percentile bootstrap intervals are unstable; this approximate scenario is especially unreliable.' : null,
    seed: String(seed), simulations, bootstrapReplicates, targetAbsDelta, minValidPairs, minAbsDelta,
    detectionPower, passProbability,
    monteCarloStandardError: n >= 2 ? { detectionPower: Math.sqrt(detectionPower * (1 - detectionPower) / simulations),
      passProbability: Math.sqrt(passProbability * (1 - passProbability) / simulations) } : null,
    model: { distribution: 'equal-variance-bivariate-normal-location-shift', marginalVariance: 1,
      normalMeanShift, withinPairCorrelation, intervalMethod: 'matched-pair-percentile-bootstrap-95' },
    limitations: ['Approximate hypothetical normal-distribution scenario, not empirical power for bounded, tied, or zero-inflated trace metrics.',
      'The assumed within-pair correlation is not estimated from generated traces. Actual power may differ substantially.',
      'Detection is a 95% interval excluding zero in the expected direction. Pass probability additionally retains n >= 8 and delta >= 0.33.',
      'The true effect is exactly the design boundary; increasing n need not make the pass probability approach one.',
      'Monte Carlo uncertainty excludes uncertainty in distribution assumptions; this is not a comparison with human data.'],
  };
}

module.exports = { stratifiedPairedBootstrap, simulateDeltaPower };
