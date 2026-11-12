'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const run = require('../src/validation/personaValidationRun.cjs');
const { baselineContrasts, matchedContrasts } = require('../src/validation/personaTraitValidationRun.cjs');
const { analyzeBaseline, INTERPRETATION, DISABILITY_NOTE } = require('../src/validation/personaValidationBaseline.cjs');
const { analyzePosition } = require('../src/validation/personaValidationPosition.cjs');
const { getTraitKeys } = require('../src/validation/personaTraitProfiles.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
const specV2 = require('../validation/persona-trait-validation-spec-v2.json');
const specV3 = require('../validation/persona-trait-validation-spec-v3.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');

// Synthetic profiles in one context: deliberation low/high, exploration high only, and a trait-omitted baseline.
const traits = overrides => ({ ...Object.fromEntries(getTraitKeys().map(key => [key, 'medium'])), ...overrides });
const profiles = {
  lo: { id: 'lo', contextHash: 'c', traits: traits({ deliberation: 'low' }) },
  hi: { id: 'hi', contextHash: 'c', traits: traits({ deliberation: 'high' }) },
  solo: { id: 'solo', contextHash: 'c', traits: traits({ exploration: 'high' }) },
  base: { id: 'base', contextHash: 'c', traits: null },
};
const seeds = Array.from({ length: 8 }, (_, i) => `s${i}`);
const spread = [0, .1, .2, .3, .4, .5, .6, .7];
function analyzed(values, { usedSeeds = seeds } = {}) {
  const samples = Object.entries(values).flatMap(([personaId, byKind]) => usedSeeds.map((seed, i) => ({ personaId, seed, condition: 'low',
    metrics: Object.fromEntries(Object.entries(byKind).map(([kind, list]) => [kind, { status: 'measured', value: list[i] }])) })));
  return analyzeBaseline({ manifest: { runId: 'baseline-test', seeds, profiles }, samples, spec: specV3,
    contrasts: matchedContrasts(profiles, 'persona-traits-v2'), baselineContrasts: baselineContrasts(profiles) });
}
const position = (result, kind = 'comparisonRate') => result.positions.find(row => row.kind === kind && row.condition === 'low');
test('baseline position classes follow the spec rule text', () => {
  const ones = spread.map(() => 1), zeros = spread.map(() => 0);
  const cases = [
    [{ lo: spread, base: spread, hi: ones }, 'high-only-shift', 'baseline-approximates-lower'],
    [{ lo: zeros, base: ones, hi: ones }, 'low-only-shift', 'baseline-approximates-higher'],
    [{ lo: zeros, base: spread.map(v => v + .1), hi: ones }, 'both-shift', 'baseline-between'],
    [{ lo: spread, base: spread, hi: spread }, 'indistinguishable', 'both-intervals-include-zero'],
    [{ lo: zeros, base: ones, hi: spread.map(v => v / 2) }, 'baseline-beyond-range', 'both-shifts-same-sign'],
  ];
  for (const [values, expected, reason] of cases) {
    const row = position(analyzed(Object.fromEntries(Object.entries(values).map(([id, list]) => [id, { comparisonRate: list }]))));
    assert.deepEqual([row.position, row.reason], [expected, reason], expected);
    assert.ok(row.descriptiveOnly && row.usedForPrimaryDecision === false);
    assert.equal(row.lowerPairs, 8); assert.equal(row.higherPairs, 8);
  }
  const both = position(analyzed({ lo: { comparisonRate: zeros }, base: { comparisonRate: spread.map(v => v + .1) }, hi: { comparisonRate: ones } }));
  assert.ok(both.lowerDelta < 0 && both.higherDelta > 0 && both.lowerInterval[1] < 0 && both.higherInterval[0] > 0);
  assert.equal(both.lowerMean, 0); assert.equal(both.higherMean, 1); assert.ok(Math.abs(both.baselineMean - .45) < 1e-12);
  const few = analyzed({ lo: { comparisonRate: zeros }, base: { comparisonRate: spread }, hi: { comparisonRate: ones } }, { usedSeeds: seeds.slice(0, 7) });
  assert.deepEqual([position(few).position, position(few).reason, position(few).lowerPairs], ['indistinguishable', 'insufficient-pairs-or-interval', 7]);
  const unexercised = position(analyzed({ lo: { comparisonRate: zeros }, base: { comparisonRate: spread }, hi: { comparisonRate: ones } }), 'newShelfDelayMs');
  assert.deepEqual([unexercised.position, unexercised.lowerPairs, unexercised.lowerDelta], ['indistinguishable', 0, null]);
  assert.ok(Object.keys(specV3.baselineComparison.positionRule).includes(both.position));
});
test('a trait with only one configured level reports deltas without a position class', () => {
  const ones = spread.map(() => 1);
  const result = analyzed({ solo: { interestDetourRate: ones }, base: { interestDetourRate: spread }, lo: {}, hi: {} });
  const solo = result.comparisons.find(row => row.profileId === 'solo' && row.kind === 'interestDetourRate');
  assert.deepEqual([solo.level, solo.pairs, solo.delta, solo.unexercised, solo.missingPairs], ['high', 8, 1, 0, 0]);
  assert.ok(solo.interval[0] > 0 && solo.descriptiveOnly && solo.usedForPrimaryDecision === false);
  assert.ok(!result.positions.some(row => row.traitKey === 'exploration'));
  // solo is medium on deliberation and in no deliberation contrast, so it gets no deliberation rows.
  assert.ok(!result.comparisons.some(row => row.profileId === 'solo' && row.traitKey === 'deliberation'));
  assert.ok(!result.comparisons.some(row => row.profileId === 'lo' && row.traitKey === 'exploration'));
  assert.equal(result.interpretation, INTERPRETATION); assert.equal(result.disabilityNote, DISABILITY_NOTE);
  assert.deepEqual(analyzeBaseline({ manifest: { runId: 'x', seeds, profiles: {} }, samples: [], spec: specV3 }).reason, 'no-baseline-profile');
});
test('baselineAdjusted is near zero when a profile has the same early/late change as its baseline', () => {
  const rows = (...hits) => hits.map((hit, index) => ({ decisionIndex: index, hit, stepIds: [`s${index}`] }));
  const sample = (personaId, seed, opportunityRows) => ({ personaId, seed, condition: 'low', metrics: { comparisonRate: { opportunityRows } } });
  const result = analyzePosition({ manifest: { runId: 'adjusted', seeds, personaIds: Object.keys(profiles), profiles }, spec: specV3,
    contrasts: matchedContrasts(profiles, 'persona-traits-v2'), baselineContrasts: baselineContrasts(profiles), samples: [
      ...seeds.map(seed => sample('hi', seed, rows(true, true, false, false))),
      ...seeds.map(seed => sample('base', seed, seed === 's7' ? rows(true) : rows(true, true, false, false))),
      ...seeds.map(seed => sample('lo', seed, rows(false, false, true, true)))] });
  const adjusted = id => result.baselineAdjusted.rows.find(row => row.profileId === id && row.kind === 'comparisonRate' && row.condition === 'low');
  assert.equal(result.baselineAdjusted.reason, null);
  assert.deepEqual([adjusted('hi').mean, adjusted('hi').interval, adjusted('hi').pairs], [0, [0, 0], 7]);
  assert.deepEqual(adjusted('hi').exclusionReasons, { 'baseline-unsplittable': 1 });
  assert.equal(adjusted('lo').mean, 2);
  assert.ok(result.baselineAdjusted.rows.every(row => row.descriptiveOnly && row.usedForPrimaryDecision === false));
  const none = analyzePosition({ manifest: { runId: 'n', seeds, personaIds: ['hi'] }, spec: specV3, samples: [] });
  assert.deepEqual(none.baselineAdjusted, { descriptiveOnly: true, usedForPrimaryDecision: false, value: null, reason: 'no-baseline-profile' });
});

// Saved runs: the same trait profiles with and without a baseline must give the same findings and blind scores.
function setup(t, profiles, runId) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-baseline-cmp-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotFilePaths = {}, goals = ['milk', 'apple', 'water', 'banana', 'eggs'].map((productId, index) => ({ productId, quantity: index === 2 ? 2 : 1 }));
  for (const [condition, n] of [['low', 2], ['high', 5]]) {
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`);
    write(snapshotFilePaths[condition], createMarketReplaySnapshot(createMarketSession({ seed: `cmp-${condition}`, difficulty: 'exact', objectives: goals.slice(0, n) })));
  }
  return { runId, outputDirectory: directory, snapshotFilePaths, profiles, seeds };
}
// operation-high inspects before both later first uses, the baseline before one of them, operation-low never.
const KINDS = { 'operation-high': ['openShelf', 'lookAround', 'dragProduct', 'lookAround', 'viewCart', 'checkout'],
  baseline: ['openShelf', 'lookAround', 'dragProduct', 'viewCart', 'checkout'], 'operation-low': ['openShelf', 'dragProduct', 'viewCart', 'checkout'] };
function writeTraces(prepared) {
  for (const slot of prepared.slots) {
    const steps = KINDS[slot.personaId].map((type, i) => ({ id: `s${i}`, type, ...(type === 'openShelf' ? { stationId: 'fresh' } : {}),
      ...(type === 'dragProduct' ? { productId: 'milk', quantity: 1, gesture: { outcome: 'drop' } } : {}) }));
    const decisions = steps.map((step, index) => ({ decisionIndex: index, before: { sequence: index }, after: { result: { accepted: true } },
      action: step.type === 'openShelf' ? { type: 'interact', station: 'fresh' } : step.type === 'dragProduct' ? { type: 'add', productId: 'milk', quantity: 1 } : { type: step.type } }));
    fs.mkdirSync(path.dirname(slot.tracePath), { recursive: true });
    write(slot.tracePath, { traceSchemaVersion: '2', traceId: `fixture-${slot.personaId}-${slot.condition}-${slot.seed}`, generationPolicy: 'stochastic',
      experienceMode: 'first-play', personaId: slot.personaId, personaVersion: slot.personaVersion, seed: slot.seed, target: { snapshotId: slot.snapshotId }, steps });
    write(`${slot.tracePath}.knowledge-audit.json`, { decisions });
  }
}
// Answers come from the visible trace only, never from the key.
function blindScore(runDirectory) {
  const blind = run.prepareBlind({ runDirectory, allowFixture: true });
  const answers = Object.fromEntries(blind.bundle.panels.A.map(row => [row.opaqueId, { traits: Object.fromEntries(getTraitKeys().map(key =>
    [key, key !== 'operationLearning' ? 'unknown' : row.trace.steps.filter(step => step.type === 'lookAround').length > 1 ? 'high' : 'low'])) }]));
  return { blind, score: run.submitBlind({ runDirectory, panel: 'A', answers, reviewerModel: 'fixture-only', reviewerSession: 'test' }).score };
}
const BASE = 'mild-intellectual-disability-adult';
const traitProfiles = [{ id: 'operation-low', basePersonaId: BASE, traits: { operationLearning: 'low' } },
  { id: 'operation-high', basePersonaId: BASE, traits: { operationLearning: 'high' } }];
test('adding a baseline leaves findings and blind scores unchanged and reports its position', t => {
  const without = run.prepare(setup(t, traitProfiles, 'baseline-compare')), withBaseline = run.prepare(setup(t,
    [...traitProfiles, { id: 'baseline', basePersonaId: BASE, traitMode: 'omitted' }], 'baseline-compare'));
  writeTraces(without); writeTraces(withBaseline);
  const a = read(run.measure({ runDirectory: without.runDirectory, allowFixture: true }).measurementsPath);
  const b = read(run.measure({ runDirectory: withBaseline.runDirectory, allowFixture: true }).measurementsPath);
  const strip = findings => findings.map(({ evidence, ...finding }) => finding);
  assert.deepEqual(strip(b.findings), strip(a.findings));
  assert.ok(a.findings.every(f => f.status === 'pass'));
  assert.deepEqual(a.baselineComparison.reason, 'no-baseline-profile');
  const scoreA = blindScore(without.runDirectory), scoreB = blindScore(withBaseline.runDirectory);
  assert.deepEqual(scoreB.score, scoreA.score);
  assert.equal(scoreB.blind.excludedBaselineTraces, 16);
  const row = b.baselineComparison.positions.find(item => item.kind === 'operationLearningRate' && item.condition === 'low');
  // low 0/4 < baseline 1/4 < high 2/4 first uses (open, add, viewCart, checkout) preceded by an inspection.
  assert.deepEqual([row.lowerDelta, row.higherDelta, row.position, row.lowerPairs, row.higherPairs], [-1, 1, 'both-shift', 8, 8]);
  const adjusted = b.positionStability.baselineAdjusted.rows.find(item => item.profileId === 'operation-high' && item.kind === 'operationLearningRate' && item.condition === 'low');
  assert.equal(adjusted.pairs, 8);
  const reportA = run.report({ runDirectory: without.runDirectory }), reportB = run.report({ runDirectory: withBaseline.runDirectory });
  const verdicts = file => Object.fromEntries(Object.entries(read(file).axes.traitExpression).map(([key, value]) => [key, value.status]));
  assert.deepEqual(verdicts(reportB.reportPath), verdicts(reportA.reportPath));
  assert.deepEqual(read(reportB.reportPath).baselineComparison, b.baselineComparison);
  const markdown = fs.readFileSync(reportB.markdownPath, 'utf8');
  assert.match(markdown, /## 기준 프로필 대비 \(설명 지표\)/);
  assert.ok(markdown.includes(INTERPRETATION) && markdown.includes(DISABILITY_NOTE));
  if (process.env.BASELINE_REPORT_OUT) fs.copyFileSync(reportB.markdownPath, process.env.BASELINE_REPORT_OUT);
  assert.match(markdown, /\| baseline \| operationLearning \(low\/high\) \| operationLearningRate \| low \| 0 \| 0\.25 \| 0\.5 \| -1 \[-1 ~ -1\] \| 1 \[1 ~ 1\] \| both-shift \| 8\/8 \|/);
  assert.match(fs.readFileSync(reportA.markdownPath, 'utf8'), /기준 프로필 없음: no-baseline-profile/);
});
test('v2 runs have no baselineComparison in measurements or report', t => {
  const prepared = run.prepare(setup(t, traitProfiles, 'baseline-v2')), manifest = read(prepared.manifestPath);
  Object.assign(manifest, { specHash: digest(specV2), specVersion: specV2.version }); write(prepared.manifestPath, manifest); writeTraces(prepared);
  const data = read(run.measure({ runDirectory: prepared.runDirectory, allowFixture: true }).measurementsPath);
  const report = run.report({ runDirectory: prepared.runDirectory });
  for (const value of [data, read(report.reportPath)]) for (const key of ['baselineComparison', 'positionStability']) assert.ok(!Object.hasOwn(value, key), key);
  assert.doesNotMatch(fs.readFileSync(report.markdownPath, 'utf8'), /기준 프로필 대비/);
});
