'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const run = require('../src/personaValidationRun.cjs');
const { splitOpportunities, analyzePosition, INTERPRETATION } = require('../src/personaValidationPosition.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
const specV2 = require('../validation/persona-trait-validation-spec-v2.json');
const specV3 = require('../validation/persona-trait-validation-spec-v3.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
const rows = (...hits) => hits.map((hit, index) => ({ decisionIndex: index * 3, hit, stepIds: [`s${index * 3}`] }));

test('opportunities split by decisionIndex order, odd middle goes early, too few or unindexed rows are excluded', () => {
  const even = splitOpportunities([...rows(true, true, false, false)].reverse());
  assert.equal(even.status, 'split');
  assert.deepEqual([even.early.decisionIndexes, even.late.decisionIndexes], [[0, 3], [6, 9]]);
  assert.deepEqual([even.early.rate, even.late.rate, even.shift], [1, 0, -1]);
  const odd = splitOpportunities(rows(true, false, false));
  assert.deepEqual([odd.early.opportunities, odd.late.opportunities, odd.early.rate, odd.late.rate], [2, 1, .5, 0]);
  assert.equal(splitOpportunities(rows(true, false, false), { oddMiddle: 'late' }).early.opportunities, 1);
  assert.deepEqual(splitOpportunities(rows(true)), { status: 'insufficient-opportunities', opportunities: 1 });
  assert.equal(splitOpportunities([]).status, 'insufficient-opportunities');
  assert.equal(splitOpportunities(rows(true, false, true), { minOpportunitiesPerTrace: 4 }).status, 'insufficient-opportunities');
  assert.deepEqual(splitOpportunities([{ decisionIndex: 0, hit: true }, { decisionIndex: null, hit: false }]),
    { status: 'missing-decision-index', opportunities: 2 });
  assert.equal(splitOpportunities(null).status, 'missing-opportunity-rows');
});

const seeds = Array.from({ length: 8 }, (_, i) => `s${i}`);
const contrast = { id: 'deliberation:hi:lo', traitKey: 'deliberation', higherProfileId: 'hi', lowerProfileId: 'lo' };
function sample(personaId, seed, opportunityRows, condition = 'low') {
  return { personaId, seed, condition, tracePath: `/${condition}/${seed}/${personaId}.json`, metrics: { comparisonRate: { opportunityRows } } };
}
function analyzed(samples) {
  return analyzePosition({ manifest: { runId: 'position-test', seeds, personaIds: ['hi', 'lo', 'flat'] }, samples, contrasts: [contrast], spec: specV3 });
}
test('profileShift is negative when only early opportunities hit and near zero when uniform', () => {
  const result = analyzed([...seeds.map(seed => sample('hi', seed, rows(true, true, false, false))),
    ...seeds.map(seed => sample('flat', seed, rows(true, false, true, false))), sample('lo', 's0', rows(false))]);
  const shift = (id, condition = 'low') => result.profileShift.find(row => row.profileId === id && row.kind === 'comparisonRate' && row.condition === condition);
  assert.equal(shift('hi').mean, -1); assert.equal(shift('hi').median, -1); assert.equal(shift('hi').usedTraces, 8);
  assert.ok(shift('hi').interval[1] < 0);
  assert.equal(shift('flat').mean, 0); assert.ok(Math.abs(shift('flat').interval[0]) < 1e-12 && Math.abs(shift('flat').interval[1]) < 1e-12);
  assert.deepEqual([shift('lo').status, shift('lo').mean, shift('lo').excludedTraces, shift('lo').exclusionReasons],
    ['unexercised', null, 1, { 'insufficient-opportunities': 1 }]);
  assert.equal(shift('hi', 'high').status, 'unexercised');
  assert.deepEqual(result.kinds, specV3.metrics.filter(m => m.positionSplit).map(m => m.kind));
  for (const row of [result, result.baselineAdjusted, ...result.profileShift, ...result.contrastAttenuation])
    assert.ok(row.descriptiveOnly === true && row.usedForPrimaryDecision === false);
  assert.deepEqual(result.baselineAdjusted, { descriptiveOnly: true, usedForPrimaryDecision: false, value: null, reason: 'no-baseline-profile' });
  assert.equal(result.interpretation, INTERPRETATION);
});
test('contrastAttenuation is positive when the early contrast vanishes late, and unsplittable seeds are excluded with reasons', () => {
  const result = analyzed([
    ...seeds.map(seed => sample('hi', seed, rows(true, true, false, false))),
    ...seeds.map(seed => sample('lo', seed, seed === 's7' ? rows(false) : rows(false, false, false, false)))]);
  const row = result.contrastAttenuation.find(item => item.kind === 'comparisonRate' && item.condition === 'low');
  assert.deepEqual([row.pairs, row.deltaEarly, row.deltaLate, row.attenuation], [7, 1, 0, 1]);
  assert.ok(row.attenuationInterval[0] > 0);
  assert.deepEqual(row.exclusionReasons, { 'lower-unsplittable': 1 });
  assert.deepEqual(row.excluded, [{ seed: 's7', reason: 'lower-unsplittable', higher: 'split', lower: 'insufficient-opportunities' }]);
  assert.equal(row.seed, 'position-test:deliberation:hi:lo:deliberation:comparisonRate:low:position');
  assert.deepEqual(analyzed([...seeds.map(seed => sample('hi', seed, rows(true, true, false, false))),
    ...seeds.map(seed => sample('lo', seed, seed === 's7' ? rows(false) : rows(false, false, false, false)))]).contrastAttenuation, result.contrastAttenuation, 'fixed seed is reproducible');
  const missing = result.contrastAttenuation.find(item => item.kind === 'comparisonRate' && item.condition === 'high');
  assert.deepEqual([missing.status, missing.attenuation, missing.exclusionReasons], ['unexercised', null, { 'missing-trace': 8 }]);
  // Only deliberation's positionSplit metric belongs to a deliberation contrast; newShelfDelayMs is positionSplit:false.
  assert.deepEqual([...new Set(result.contrastAttenuation.map(item => item.kind))], ['comparisonRate']);
});

// Saved-run fixture: operationLearning high adds one inspection before the second first-used control.
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-position-run-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotFilePaths = {}, goals = ['milk', 'apple', 'water', 'banana', 'eggs'].map((productId, index) => ({ productId, quantity: index === 2 ? 2 : 1 }));
  for (const [condition, n] of [['low', 2], ['high', 5]]) {
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`);
    write(snapshotFilePaths[condition], createMarketReplaySnapshot(createMarketSession({ seed: `pos-${condition}`, difficulty: 'exact', objectives: goals.slice(0, n) })));
  }
  const profiles = ['low', 'high'].map(level => ({ id: `operation-${level}`, basePersonaId: 'mild-intellectual-disability-adult', traits: { operationLearning: level } }));
  return { runId: 'position-fixture', outputDirectory: directory, snapshotFilePaths, profiles, seeds };
}
function writeTraces(prepared) {
  for (const slot of prepared.slots) {
    const kinds = ['openShelf', ...(slot.personaId.endsWith('high') ? ['lookAround'] : []), 'dragProduct', 'viewCart', 'lookAround', 'checkout'];
    const steps = kinds.map((type, i) => ({ id: `s${i}`, type, ...(type === 'openShelf' ? { stationId: 'fresh' } : {}),
      ...(type === 'dragProduct' ? { productId: 'milk', quantity: 1, gesture: { outcome: 'drop' } } : {}) }));
    const decisions = steps.map((step, index) => ({ decisionIndex: index, before: { sequence: index }, after: { result: { accepted: true } },
      action: step.type === 'openShelf' ? { type: 'interact', station: 'fresh' } : step.type === 'dragProduct' ? { type: 'add', productId: 'milk', quantity: 1 } : { type: step.type } }));
    fs.mkdirSync(path.dirname(slot.tracePath), { recursive: true });
    write(slot.tracePath, { traceSchemaVersion: '2', traceId: `fixture-${slot.personaId}-${slot.condition}-${slot.seed}`, generationPolicy: 'stochastic',
      experienceMode: 'first-play', personaId: slot.personaId, personaVersion: slot.personaVersion, seed: slot.seed, target: { snapshotId: slot.snapshotId }, steps });
    write(`${slot.tracePath}.knowledge-audit.json`, { decisions });
  }
}
test('v3 runs report position stability without changing findings; v2 runs gain no positionStability key', t => {
  const v3Args = setup(t), v3 = run.prepare(v3Args); writeTraces(v3);
  const v2Args = setup(t), v2 = run.prepare(v2Args), manifest = read(v2.manifestPath);
  Object.assign(manifest, { specHash: digest(specV2), specVersion: specV2.version }); write(v2.manifestPath, manifest); writeTraces(v2);
  const v3Data = read(run.measure({ runDirectory: v3.runDirectory, allowFixture: true }).measurementsPath);
  const v2Data = read(run.measure({ runDirectory: v2.runDirectory, allowFixture: true }).measurementsPath);
  assert.equal(Object.hasOwn(v2Data, 'positionStability'), false);
  const strip = findings => findings.map(({ evidence, ...finding }) => finding);
  assert.deepEqual(strip(v3Data.findings), strip(v2Data.findings));
  const position = v3Data.positionStability;
  assert.ok(position.descriptiveOnly && position.usedForPrimaryDecision === false);
  const row = position.contrastAttenuation.find(item => item.kind === 'operationLearningRate' && item.condition === 'low');
  // high: open(miss) add(hit) | viewCart(miss) checkout(hit); low: open add | viewCart(miss) checkout(hit).
  assert.deepEqual([row.pairs, row.deltaEarly, row.deltaLate, row.attenuation], [8, 1, 0, 1]);
  const v3Report = run.report({ runDirectory: v3.runDirectory }), v2Report = run.report({ runDirectory: v2.runDirectory });
  assert.equal(Object.hasOwn(read(v2Report.reportPath), 'positionStability'), false);
  assert.doesNotMatch(fs.readFileSync(v2Report.markdownPath, 'utf8'), /앞뒤 성향 유지/);
  assert.deepEqual(read(v3Report.reportPath).positionStability, position);
  const verdicts = file => Object.fromEntries(Object.entries(read(file).axes.traitExpression).map(([key, value]) => [key, value.status]));
  assert.deepEqual(verdicts(v3Report.reportPath), verdicts(v2Report.reportPath));
  assert.equal(verdicts(v3Report.reportPath).operationLearning, 'supported');
  const markdown = fs.readFileSync(v3Report.markdownPath, 'utf8');
  assert.match(markdown, /## 앞뒤 성향 유지 \(설명 지표\)/);
  assert.ok(markdown.includes(INTERPRETATION));
  assert.match(markdown, /\| operationLearning \| operation-high \/ operation-low \| operationLearningRate \| low \| 8 \| 0 \| 1 \| 0 \| 1 \|/);
  if (process.env.POSITION_REPORT_OUT) fs.copyFileSync(v3Report.markdownPath, process.env.POSITION_REPORT_OUT);
});
