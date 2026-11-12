'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { createService, definitions } = require('../server.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { marketMission } = require('../../frontend/src/game/scenarios.ts');
const { createTrial, readTrial } = require('../learning-trial.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-directional-service-'));
  const service = createService();
  t.after(() => { service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'directional-service', difficulty: 'exact',
    objectives: marketMission.objectives.map(({ productId, quantity }) => ({ productId, quantity, match: 'exact' })) }), marketMission);
  const args = { personaId: 'careful-checker', seed: 'directional-service', snapshot,
    outputPath: path.join(directory, 'trace.json') };
  return { directory, service, snapshot, args };
}

test('prepare exposes and forwards the explicit directional movement version only when requested', async t => {
  const f = fixture(t);
  const schema = definitions.find(tool => tool.name === 'prepare_whole_trace').inputSchema;
  assert.deepEqual(schema.properties.movementVersion.enum, ['directional-v1', 'directional-v2']);
  const legacy = await f.service.invokeTool('prepare_whole_trace', f.args);
  assert.equal(Object.hasOwn(legacy.bundle, 'movementVersion'), false);
  assert.equal(legacy.bundle.initialChoiceFrame.availableChoices.some(choice => choice.action.type === 'moveDirection'), false);
  const prepared = await f.service.invokeTool('prepare_whole_trace', { ...f.args,
    outputPath: path.join(f.directory, 'directional.json'), movementVersion: 'directional-v1' });
  assert.equal(prepared.bundle.movementVersion, 'directional-v1');
  assert.equal(prepared.bundle.initialChoiceFrame.availableChoices.filter(choice => choice.action.type === 'moveDirection').length, 8);
  const persisted = JSON.parse(fs.readFileSync(path.join(prepared.diagnosticDirectory, 'bundle.json'), 'utf8'));
  assert.equal(persisted.movementVersion, 'directional-v1');
  assert.notEqual(prepared.bundle.inputHash, legacy.bundle.inputHash);
});

test('unknown movement versions reject before reserving a prepared request', async t => {
  const f = fixture(t);
  for (const movementVersion of ['directional-v3', 'default', null, false])
    await assert.rejects(f.service.invokeTool('prepare_whole_trace', { ...f.args, movementVersion }), /movementVersion/);
  assert.equal(fs.existsSync(`${f.args.outputPath}.whole-trace`), false);
});

test('existing trial movement conditions cannot be overridden by a directional request', async t => {
  const f = fixture(t), arms = {};
  for (const arm of ['A', 'B', 'C']) arms[arm] = await f.service.invokeTool('create_whole_trace_learner', {
    directory: f.directory, learnerId: `directional-${arm}`, memberId: `directional-${arm}`,
    personaId: f.args.personaId, experimentId: 'directional-trial', arm,
  });
  const { trialFile } = createTrial({ directory: f.directory, trialId: 'directional-trial',
    personaId: f.args.personaId, personaVersion: arms.A.identity.personaVersion, model: 'gpt-6-luna',
    policyVersion: 'whole-trace-v3', trainingRounds: 1, arms, baselineSnapshot: f.snapshot,
    generationLimits: { maxActions: 100, maxCalls: 1, timingProfile: 'original' } });
  const before = JSON.stringify(readTrial(trialFile));
  await assert.rejects(f.service.invokeTool('prepare_whole_trace', { trialFile, arm: 'A', snapshot: f.snapshot,
    outputPath: f.args.outputPath, movementVersion: 'directional-v1' }), /movementVersion is frozen/);
  assert.equal(JSON.stringify(readTrial(trialFile)), before);
  assert.equal(fs.existsSync(`${f.args.outputPath}.whole-trace`), false);
});

test('existing persona validation manifests do not silently opt into directional movement', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.directory, 'manifest.json'), JSON.stringify({ schema: 'oneuldo.persona-fidelity-run', version: 2 }));
  const outputPath = path.join(f.directory, 'traces', f.args.personaId, 'low', 'trace.json');
  await assert.rejects(f.service.invokeTool('prepare_whole_trace', { ...f.args, outputPath,
    movementVersion: 'directional-v1' }), /validation slot movementVersion is frozen/);
  assert.equal(fs.existsSync(`${outputPath}.whole-trace`), false);
});
