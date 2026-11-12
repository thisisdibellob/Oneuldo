'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createService, definitions } = require('../server.cjs');
const run = require('../src/validation/personaValidationRun.cjs');
const { matchedContrasts } = require('../src/validation/personaTraitValidationRun.cjs');
const { resolveProfiles } = require('../src/validation/personaTraitProfiles.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const base = 'neutral-adult-control';
const profiles = [
  { id: 'checking-low', basePersonaId: base, presetId: 'deliberate-checker', traits: { checking: 'low' } },
  { id: 'checking-high', basePersonaId: base, presetId: 'deliberate-checker', traits: { checking: 'high' } },
];
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-trait-run-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotFilePaths = {};
  const objectives = [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 },
    { productId: 'water', quantity: 2 }, { productId: 'banana', quantity: 1 }, { productId: 'eggs', quantity: 1 }];
  for (const [condition, count] of [['low', 2], ['high', 5]]) {
    const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: `trait-${condition}`, difficulty: 'exact', objectives: objectives.slice(0, count) }));
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`);
    fs.writeFileSync(snapshotFilePaths[condition], JSON.stringify(snapshot));
  }
  const service = createService({ generateTrace: () => { throw new Error('No provider generation in validator'); } });
  t.after(() => service.close());
  return { directory, service, snapshotFilePaths, args: { runId: 'traits', outputDirectory: directory, snapshotFilePaths,
    seeds: ['s1', 's2'], validationMode: 'traits', profiles } };
}
function populate(prepared, args) {
  const manifest = run.readManifest(prepared.runDirectory);
  for (const slot of prepared.slots) {
    const objectives = JSON.parse(fs.readFileSync(args.snapshotFilePaths[slot.condition])).config.objectives;
    const steps = [{ type: 'readList' }];
    for (const goal of objectives) {
      steps.push({ type: 'dragProduct', productId: goal.productId, quantity: goal.quantity, gesture: { outcome: 'drop' } });
      if (slot.personaId === 'checking-high') steps.push({ type: 'readList' });
    }
    if (slot.personaId === 'checking-high') steps.push({ type: 'viewCart' });
    steps.push({ type: 'checkout' }, { type: 'submitForReview' });
    const trace = { traceSchemaVersion: '2', personaId: slot.personaId, personaVersion: manifest.profiles[slot.personaId].persona.version,
      seed: slot.seed, generationPolicy: 'stochastic', target: { snapshotId: slot.snapshotId }, traceId: `fixture-${slot.condition}-${slot.seed}-${slot.personaId}`,
      steps: steps.map((step, i) => ({ id: `s${i}`, reactionDelayMs: 100, reason: '화면의 조건을 확인한다', ...step })) };
    fs.mkdirSync(path.dirname(slot.tracePath), { recursive: true }); fs.writeFileSync(slot.tracePath, JSON.stringify(trace));
  }
}
test('MCP accepts arbitrary trait profile populations and no mandatory control class', async t => {
  const f = fixture(t);
  const single = await f.service.invokeTool('prepare_persona_validation', { ...f.args, profiles: profiles.slice(0, 1) });
  assert.equal(single.required, 4); assert.equal(single.validationMode, 'traits');
  assert.equal(single.catalog.traits.length, 9); assert.equal(single.catalog.presets.length, 5);
  const many = await f.service.invokeTool('prepare_persona_validation', { ...f.args, runId: 'many',
    profiles: Array.from({ length: 5 }, (_, i) => ({ ...profiles[0], id: `population-${i}` })) });
  assert.equal(many.required, 20);
  assert.equal((await f.service.invokeTool('list_personas')).personas.length, 3);
  const schema = definitions.find(tool => tool.name === 'prepare_persona_validation').inputSchema;
  assert.equal(schema.properties.personaIds.minItems, 1);
});
test('only one changed trait with fixed capability/taste/experience yields matched contrasts', () => {
  const rows = resolveProfiles({ profiles: [...profiles,
    { ...profiles[1], id: 'confounded', traits: { checking: 'high', exploration: 'high' } },
    { ...profiles[1], id: 'different-base', basePersonaId: 'quick-decider' }] });
  const contrasts = matchedContrasts(Object.fromEntries(rows.map(row => [row.id, row])));
  assert.ok(contrasts.some(c => c.traitKey === 'checking' && c.higherProfileId === 'checking-high' && c.lowerProfileId === 'checking-low'));
  assert.ok(!contrasts.some(c => [c.higherProfileId, c.lowerProfileId].includes('different-base')));
  assert.ok(!contrasts.some(c => [c.higherProfileId, c.lowerProfileId].includes('confounded') && [c.higherProfileId, c.lowerProfileId].includes('checking-low')));
});
test('fixture pipeline reports full goals, paired coverage and variance warnings without forcing mistakes', async t => {
  const f = fixture(t), prepared = run.prepare(f.args); populate(prepared, f.args);
  assert.throws(() => run.measure({ runDirectory: prepared.runDirectory }), /Stochastic/);
  const result = run.measure({ runDirectory: prepared.runDirectory, allowFixture: true });
  assert.equal(result.completed, 8); assert.equal(result.comparisons, 1);
  const m = JSON.parse(fs.readFileSync(result.measurementsPath));
  assert.equal(m.findings.length, 4);
  assert.ok(m.findings.every(f => f.pairs === 2 && f.status === 'insufficient' && f.delta === 1));
  assert.ok(m.perTrace.every(row => row.outcome.allGoalsCompleted && row.outcome.completionRate === 1));
  assert.equal(m.flags['checking-low'].status, 'pass');
  assert.ok(m.flags['checking-low'].diagnosticWarnings.some(f => f.code === 'zero-error-variance'));
  assert.ok(m.groups.every(group => group.descriptiveOnly));
  const report = run.report({ runDirectory: prepared.runDirectory });
  const saved = JSON.parse(fs.readFileSync(report.reportPath));
  assert.equal(saved.axes.traitExpression.checking.status, 'insufficient');
  assert.equal(saved.axes.traitExpression.exploration.status, 'unmatched');
  assert.equal(saved.fixtureOnly, true);
});
test('common trait blind answers support abstention, A/B ordering, and answer/evidence freezing', t => {
  const f = fixture(t), prepared = run.prepare(f.args); populate(prepared, f.args);
  run.measure({ runDirectory: prepared.runDirectory, allowFixture: true });
  assert.throws(() => run.prepareBlind({ runDirectory: prepared.runDirectory, panel: 'B', allowFixture: true }), /Score panel A/);
  const blind = run.prepareBlind({ runDirectory: prepared.runDirectory, allowFixture: true });
  assert.equal(blind.traitRubric.length, 9); assert.equal(blind.publicProfiles, undefined);
  assert.ok(!JSON.stringify(blind.bundle).includes('checking-low'));
  const key = JSON.parse(fs.readFileSync(path.join(prepared.runDirectory, 'blind-key.json')));
  const answers = Object.fromEntries(key.filter(row => row.version === 'A').map(row => [row.opaqueId,
    { traits: { ...row.traits, persistence: 'unknown' }, confidence: .5 }]));
  const args = { runDirectory: prepared.runDirectory, panel: 'A', answers, reviewerModel: 'fixture-only', reviewerSession: 'test' };
  const graded = run.submitBlind(args);
  assert.equal(graded.score.perTrait.persistence.coverage, 0);
  assert.equal(graded.score.perTrait.checking.accuracy, 1);
  assert.equal(graded.score.macroAccuracy, 8 / 9);
  assert.deepEqual(run.submitBlind(args).score, graded.score);
  const changed = structuredClone(args); changed.answers[Object.keys(answers)[0]].confidence = .7;
  assert.throws(() => run.submitBlind(changed), /frozen/);
  assert.ok(run.prepareBlind({ runDirectory: prepared.runDirectory, panel: 'B', allowFixture: true }).bundle.panels.B);
  fs.appendFileSync(prepared.slots[0].tracePath, '\n');
  assert.throws(() => run.prepareBlind({ runDirectory: prepared.runDirectory, allowFixture: true }), /sample set changed/);
  assert.throws(() => run.report({ runDirectory: prepared.runDirectory }), /stale/);
});
test('custom whole-trace scope compiles candidate7 and remains outside ordinary generation', async t => {
  const f = fixture(t), prepared = run.prepare({ ...f.args, seeds: ['s1'], profiles: profiles.slice(0, 1) });
  const slot = prepared.slots[0];
  await assert.rejects(f.service.invokeTool('generate_trace', { personaId: slot.personaId, seed: 's1', snapshotFilePath: f.snapshotFilePaths.low }), /Unknown persona/);
  const request = await f.service.invokeTool('prepare_whole_trace', slot.prepareWholeTrace);
  assert.equal(request.bundle.persona.id, slot.personaId);
  assert.match(request.bundle.persona.behavior.individualInstructions, /checking=low/);
  const saved = await f.service.invokeTool('submit_whole_trace', { requestId: request.requestId, candidate: {
    candidateVersion: '7', requestId: request.requestId, decisions: [{
      choiceRef: { source: request.bundle.initialChoiceFrame.source, choiceId: 'control/giveUp' }, delayMs: 100,
      reason: '이번 장보기를 마친다', basis: { intent: 'finish', goalId: null, memoryUses: [] },
      actorState: { activity: 'finish', task: '이번 장보기를 마친다', heldGoalIds: [], uncertainGoalIds: [],
        focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' },
    }],
  } });
  assert.equal(saved.status, 'complete'); assert.equal(saved.appExecuted, false);
  const measured = run.measure({ runDirectory: prepared.runDirectory });
  assert.equal(measured.completed, 1); assert.equal(measured.fixtureOnly, false);
  const evidence = JSON.parse(fs.readFileSync(measured.measurementsPath)).perTrace[0];
  assert.equal(evidence.outcome.completionRate, 0); assert.equal(evidence.terminationReview.status, 'review');
  assert.equal(evidence.annotationReview.reviewVersion, 'actor-annotation-v1');
  const report = JSON.parse(fs.readFileSync(run.report({ runDirectory: prepared.runDirectory }).reportPath));
  assert.deepEqual(report.annotationReviews[0].review, evidence.annotationReview);
  await assert.rejects(f.service.invokeTool('prepare_whole_trace', slot.prepareWholeTrace), /slot binding mismatch/);
  await assert.rejects(f.service.invokeTool('prepare_whole_trace', { ...slot.prepareWholeTrace, outputPath: path.join(f.directory, 'outside.json') }), /Unknown persona/);
});
test('trait manifests bind all profile definitions, snapshots and saved evidence', t => {
  const f = fixture(t), prepared = run.prepare(f.args);
  assert.throws(() => run.prepare({ ...f.args, profiles: [{ ...profiles[0], traits: { checking: 'medium' } }, profiles[1]] }), /configuration differs/);
  const original = fs.readFileSync(prepared.manifestPath, 'utf8'), altered = JSON.parse(original);
  altered.profiles['checking-low'].traits.checking = 'high';
  fs.writeFileSync(prepared.manifestPath, JSON.stringify(altered));
  assert.throws(() => run.readManifest(prepared.runDirectory), /profile definition changed/);
  fs.writeFileSync(prepared.manifestPath, original);
  populate(prepared, f.args); run.measure({ runDirectory: prepared.runDirectory, allowFixture: true });
  fs.appendFileSync(prepared.slots[0].tracePath, '\n');
  assert.throws(() => run.measure({ runDirectory: prepared.runDirectory, allowFixture: true }), /evidence changed/);
});
test('canonical subsets default to traits, historical four-person requests remain v2', t => {
  const f = fixture(t); delete f.args.profiles; delete f.args.validationMode;
  const subset = run.prepare({ ...f.args, personaIds: ['careful-checker'] });
  assert.equal(run.readManifest(subset.runDirectory).version, 3);
  const old = run.prepare({ ...f.args, runId: 'old', personaIds: ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', base] });
  assert.equal(run.readManifest(old.runDirectory).version, 2);
  const current = run.prepare({ ...f.args, runId: 'current' });
  assert.equal(current.profiles.length, 3); assert.equal(current.validationMode, 'traits');
});
test('authored delay alone never supports a trait and unexercised behavior remains partial', () => {
  const { summarizeTraitFindings } = require('../src/validation/personaTraitValidationRun.cjs');
  const behavior = status => ({ status, evidenceType: 'observed-action' });
  const timing = status => ({ status, evidenceType: 'authored-timing' });
  const timingOnly = summarizeTraitFindings([behavior('unexercised'), timing('pass')]);
  assert.equal(timingOnly.status, 'unexercised');
  assert.equal(timingOnly.authoredTiming.status, 'supported');
  assert.equal(summarizeTraitFindings([behavior('insufficient'), timing('pass')]).status, 'insufficient');
  assert.equal(summarizeTraitFindings([behavior('fail'), timing('pass')]).status, 'contradicted');
  assert.equal(summarizeTraitFindings([behavior('pass'), timing('fail')]).status, 'supported');
  const partial = summarizeTraitFindings([behavior('pass'), behavior('unexercised')]);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.behavioralEvidence.exercisedComparisons, 1);
  assert.equal(partial.behavioralEvidence.expectedComparisons, 2);
  assert.equal(summarizeTraitFindings([]).status, 'unmatched');
});
