'use strict';
require('../runtime.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const {
  getPersona, listPersonas, getWholeTracePersona, withValidationPersona,
  VALIDATION_CONTROL_PERSONA_ID: CONTROL,
} = require('../src/personas.ts');
const { buildWholeTracePersonaInput } = require('../src/wholeTrace/wholeTracePersona.ts');
const { validateLearnerIdentity, assertPersonaLearningEligible } = require('../src/actorLearning.ts');
const { createLearner, readLearner } = require('../learner-store.cjs');
const { createTrial, readTrial } = require('../learning-trial.cjs');
const { createService } = require('../server.cjs');
const { generateTrace } = require('../src/simulator.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
const control = require('../personas/neutral-adult-control.json');
const identity = {
  learnerId: 'control-learner', memberId: 'member-control', personaId: CONTROL,
  personaVersion: control.version, experimentId: 'control-trial', arm: 'A',
  model: 'gpt-6-luna', policyVersion: 'whole-trace-v3', reasoningEffort: 'low',
};
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-validation-control-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const service = createService();
  t.after(() => service.close());
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'control-test' }));
  return { directory, service, snapshot };
}

test('control retains the matched personal layer and only removes selected burden settings', () => {
  const jimin = getPersona('mild-intellectual-disability-adult');
  for (const key of ['name', 'age', 'goal', 'preferences', 'familiarCategories', 'familiarProductIds'])
    assert.deepEqual(control.character[key], jimin.character[key], key);
  assert.equal(control.attention.goalMemoryCapacity, 5);
  assert.deepEqual(control.attention.interestProductWeights, jimin.attention.interestProductWeights);
  assert.equal(control.parameters.walkSpeed, jimin.parameters.walkSpeed);
  assert.equal(fs.readFileSync(path.join(__dirname, '../personas/neutral-adult-control.md'), 'utf8'), control.prompt);
  const input = buildWholeTracePersonaInput(control);
  for (const rule of [...control.character.selectedTraits, ...control.character.strengths, ...control.character.practicedStrategies])
    assert.ok(input.individualInstructions.includes(rule));
  assert.deepEqual(input.cognition.sourceParameters, { switchMemoryDecay: 0, confusionProbability: 0, quantitySlipProbability: 0 });
  assert.deepEqual(input.cognition.coefficients, { delay: .04, interest: 0, labelConfusion: 0, countTracking: 0 });
  assert.match(input.instruction, /대조군에 적용하지 않는다/);
  assert.doesNotMatch(input.instruction, /작은 작업 목표 묶음의 설계 한도/);
  assert.doesNotMatch(input.instruction, /관심이 옮겨간 동안 하던 목표의 세부를 놓칠 수 있지만/);
});

test('whole-trace scope does not expose control to ordinary getter or stochastic generation', async t => {
  const f = setup(t);
  assert.equal(listPersonas().length, 3);
  assert.ok(!listPersonas().some(p => p.id === CONTROL));
  assert.throws(() => getPersona(CONTROL), /Unknown persona/);
  assert.throws(() => getWholeTracePersona(CONTROL), /Unknown persona/);
  await withValidationPersona(async () => {
    assert.equal(getWholeTracePersona(CONTROL).id, CONTROL);
    await Promise.resolve();
    assert.equal(getWholeTracePersona(CONTROL).id, CONTROL);
    assert.throws(() => getPersona(CONTROL), /Unknown persona/);
    await assert.rejects(generateTrace({ personaId: CONTROL, seed: 1, snapshot: f.snapshot, mode: 'stochastic' }), /Unknown persona/);
    await assert.rejects(generateTrace({ personaId: CONTROL, seed: 1, snapshot: f.snapshot, mode: 'stochastic', planningMode: 'whole-trace' }), /Unknown persona/);
    await assert.rejects(generateTrace({ personaId: CONTROL, seed: 1, snapshot: f.snapshot, mode: 'llm', llm: { model: 'fixture' } }), /Unknown persona/);
  });
  assert.throws(() => getWholeTracePersona(CONTROL), /Unknown persona/);
  const listed = await f.service.invokeTool('list_personas');
  assert.equal(listed.personas.length, 3);
  await assert.rejects(f.service.invokeTool('generate_trace', { personaId: CONTROL, seed: 1, snapshot: f.snapshot, mode: 'stochastic' }), /Unknown persona/);
});

test('control cannot create or load learners and cannot become confirmed learning evidence', t => {
  const f = setup(t);
  assert.throws(() => validateLearnerIdentity(identity), /excluded from learners and learning trials/);
  assert.throws(() => assertPersonaLearningEligible({ personaId: CONTROL }), /excluded from learners and learning trials/);
  assert.throws(() => createLearner({ directory: f.directory, identity }), /excluded from learners and learning trials/);
  const body = { version: '1', identity, rounds: [] };
  const learnerFile = path.join(f.directory, 'control.learner.json');
  fs.writeFileSync(learnerFile, JSON.stringify({ ...body, integrity: createHash('sha256').update(JSON.stringify(body)).digest('hex') }));
  assert.throws(() => readLearner(learnerFile), /excluded from learners and learning trials/);
});

test('control cannot create or load learning trials through direct and MCP paths', async t => {
  const f = setup(t);
  const options = { directory: f.directory, trialId: 'control-trial', personaId: CONTROL,
    personaVersion: control.version, model: 'gpt-6-luna', policyVersion: 'whole-trace-v3',
    baselineSnapshot: f.snapshot, arms: {} };
  assert.throws(() => createTrial(options), /excluded from learners and learning trials/);
  const body = { version: '1', locks: { personaId: CONTROL }, arms: { A: {}, B: {}, C: {} } };
  const trialFile = path.join(f.directory, 'control.trial.json');
  fs.writeFileSync(trialFile, JSON.stringify({ ...body, integrity: createHash('sha256').update(canonicalMarketReplayJson(body)).digest('hex') }));
  assert.throws(() => readTrial(trialFile), /excluded from learners and learning trials/);
  const optionsFilePath = path.join(f.directory, 'trial-options.json');
  fs.writeFileSync(optionsFilePath, JSON.stringify(options));
  await assert.rejects(f.service.invokeTool('create_learning_trial', { optionsFilePath }), /excluded from learners and learning trials/);
  for (const tool of ['create_learner', 'create_luna_learner', 'create_whole_trace_learner']) {
    const args = { directory: f.directory, learnerId: tool, memberId: 'member-control', personaId: CONTROL, experimentId: 'e', arm: 'A',
      ...(tool === 'create_learner' ? { model: 'gpt-6-luna' } : {}) };
    await assert.rejects(f.service.invokeTool(tool, args), /Unknown persona/);
  }
});

test('a bound validation control compiles a complete submitted candidate without a provider', async t => {
  const f = setup(t);
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('Control validation must not contact a provider'); };
  t.after(() => { global.fetch = originalFetch; });
  const snapshotFilePaths = {};
  const goals = [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 },
    { productId: 'curry', quantity: 1 }, { productId: 'water', quantity: 2 }, { productId: 'banana', quantity: 1 }];
  for (const [condition, count] of [['low', 2], ['high', 5]]) {
    const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: `control-${condition}`, difficulty: 'exact', objectives: goals.slice(0, count) }));
    snapshotFilePaths[condition] = path.join(f.directory, `${condition}.snapshot.json`);
    fs.writeFileSync(snapshotFilePaths[condition], JSON.stringify(snapshot));
  }
  const run = await f.service.invokeTool('prepare_persona_validation', {
    runId: 'control-bound', outputDirectory: f.directory, snapshotFilePaths, seeds: [1],
    personaIds: [...listPersonas().map(p => p.id), CONTROL],
  });
  const slot = run.slots.find(row => row.personaId === CONTROL && row.condition === 'low');
  const prepared = await f.service.invokeTool('prepare_whole_trace', slot.prepareWholeTrace);
  assert.equal(prepared.bundle.persona.id, CONTROL);
  assert.equal(prepared.bundle.persona.version, control.version);
  const candidate = { candidateVersion: '7', requestId: prepared.requestId, decisions: [{
    choiceRef: { source: prepared.bundle.initialChoiceFrame.source, choiceId: 'control/giveUp' },
    delayMs: 1700, reason: '이번 장보기를 마친다', basis: { intent: 'finish', goalId: null, memoryUses: [] },
    actorState: { activity: 'finish', task: '이번 장보기를 마친다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' },
  }] };
  const result = await f.service.invokeTool('submit_whole_trace', { requestId: prepared.requestId, candidate });
  assert.equal(result.status, 'complete', JSON.stringify(result));
  const trace = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  assert.equal(trace.personaId, CONTROL);
  assert.equal(trace.experienceMode, 'first-play');
  assert.equal(trace.generation.actorPolicyVersion, 'whole-trace-v3');
  assert.equal(trace.generation.learnerIdentity, undefined);
  assert.throws(() => getWholeTracePersona(CONTROL), /Unknown persona/);
  const measurements = await f.service.invokeTool('measure_persona_validation', { runDirectory: run.runDirectory });
  assert.equal(measurements.completed, 1);
  assert.equal(measurements.missing, 7);
  assert.equal(measurements.fixtureOnly, false);
  const report = await f.service.invokeTool('persona_validation_report', { runDirectory: run.runDirectory });
  assert.equal(report.completed, 1);
  assert.equal(report.required, 8);
  assert.equal(report.fixtureOnly, false);
  const savedReport = JSON.parse(fs.readFileSync(report.reportPath, 'utf8'));
  assert.ok(Object.values(savedReport.traits).flat().every(trait => trait.status !== 'expressed'));
});
