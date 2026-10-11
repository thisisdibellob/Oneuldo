'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createService } = require('../server.cjs');
const { generateTrace } = require('../src/simulator.ts');
const { ACTOR_POLICY_VERSION } = require('../src/llmPolicy.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, marketReplayFingerprint } = require('../../frontend/src/game/marketReplayTrace.ts');
const { marketMission } = require('../../frontend/src/game/scenarios.ts');
const { readTrial } = require('../learning-trial.cjs');

async function setup(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-trial-mcp-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const service = createService({ ...options, generateTrace: async args => {
    calls.push(args);
    if (options.fail) throw new Error('Fixture model unavailable');
    return generateTrace({ ...args, actorDecisionProvider: async () => ({ action: { type: 'giveUp' }, delayMs: 100, reason: 'Offline contract fixture only' }) });
  } });
  t.after(() => service.close());
  const learners = {};
  for (const arm of ['A', 'B', 'C']) learners[arm] = await service.invokeTool('create_learner', {
    directory, learnerId: `fixture-${arm}`, memberId: `account-${arm}`, personaId: 'careful-checker',
    experimentId: 'mcp-trial', arm, model: 'fixture-model',
  });
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'mcp-learning', difficulty: 'exact', objectives: marketMission.objectives.map(({productId,quantity}) => ({productId,quantity,match:'exact'})) }), marketMission);
  const config = { directory, trialId: 'mcp-trial', personaId: 'careful-checker', personaVersion: learners.A.identity.personaVersion,
    model: 'fixture-model', policyVersion: ACTOR_POLICY_VERSION, trainingRounds: 1,
    arms: Object.fromEntries(Object.entries(learners).map(([arm, l]) => [arm, { learnerFile: l.learnerFile }])), baselineSnapshot: snapshot };
  const optionsFilePath = path.join(directory, 'trial-options.json'); fs.writeFileSync(optionsFilePath, JSON.stringify(config));
  const { trialFile } = await service.invokeTool('create_learning_trial', { optionsFilePath });
  return { directory, calls, service, learners, snapshot, trialFile };
}

test('MCP learner generation binds identity and forbids cross-account or manual memory mixing before model call', async t => {
  const bridge = { start: async () => ({}), close: async () => {}, list: () => ({ sessions: [{ tabId: 'tab', memberId: 'wrong-member' }] }), snapshot: () => snapshot };
  const f = await setup(t, { bridge }), { snapshot } = f;
  await assert.rejects(f.service.invokeTool('generate_trace', { personaId: 'careful-checker', seed: 1, tabId: 'tab', learnerFile: f.learners.A.learnerFile }), /cross test accounts/);
  await assert.rejects(f.service.invokeTool('generate_trace', { personaId: 'careful-checker', seed: 1, snapshot, learnerFile: f.learners.A.learnerFile, attentionExperience: { visit: 'first-play' } }), /manual experience/);
  assert.equal(f.calls.length, 0);
  const result = await f.service.invokeTool('generate_trace', { personaId: 'careful-checker', seed: 1, snapshot,
    learnerFile: f.learners.A.learnerFile, outputPath: path.join(f.directory, 'learner-trace.json') });
  const trace = JSON.parse(fs.readFileSync(result.outputPath));
  assert.deepEqual(trace.generation.learnerIdentity, f.learners.A.identity);
  assert.equal(trace.generation.experienceFingerprint, marketReplayFingerprint({ visit: 'first-play' }));
});

test('MCP trial generation uses prepared frozen context and records technical failures without manufactured outcomes', async t => {
  const f = await setup(t);
  const result = await f.service.invokeTool('generate_learning_round', { trialFile: f.trialFile, arm: 'C', snapshot: f.snapshot,
    outputPath: path.join(f.directory, 'round.json'), llm: { baseUrl: 'http://localhost:1', protocol: 'ollama' } });
  const trace = JSON.parse(fs.readFileSync(result.outputPath));
  assert.equal(trace.generation.learnerIdentity.arm, 'C');
  assert.equal(trace.generation.trialBinding.roundId, result.roundId);
  assert.equal(trace.experienceMode, 'first-play');
  assert.equal(f.calls[0].llm.model, 'fixture-model');
  assert.equal(f.calls[0].attentionExperience.learning, undefined);
  const comparison = await f.service.invokeTool('compare_learning_trial', { trialFile: f.trialFile });
  assert.equal(comparison.complete, false);
  assert.equal(comparison.arms.C.paired.included, false);
  const broken = await setup(t, { fail: true });
  const failedOutput = path.join(broken.directory, 'failed-round.json');
  await assert.rejects(broken.service.invokeTool('generate_learning_round', { trialFile: broken.trialFile, arm: 'A', snapshot: broken.snapshot,
    outputPath: failedOutput }), error => /Fixture model unavailable/.test(error.message) && error.diagnosticDirectory === `${failedOutput}.generation`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(`${failedOutput}.generation`, 'snapshot.json'))), broken.snapshot);
  assert.equal(JSON.parse(fs.readFileSync(path.join(`${failedOutput}.generation`, 'status.json'))).state, 'failed');
  assert.equal(fs.existsSync(failedOutput), false);
  const state = readTrial(broken.trialFile);
  assert.equal(state.arms.A.rounds.length, 0);
  assert.equal(state.arms.A.attempts.length, 1);
  assert.equal(state.arms.A.attempts[0].stage, 'generation');
  assert.equal(state.arms.A.active.phase, 'baseline');
});

test('wrong app account cannot create a prepared trial round', async t => {
  const bridge = { start: async () => ({}), close: async () => {}, list: () => ({ sessions: [{ tabId: 'tab', memberId: 'account-C' }] }), snapshot: () => f.snapshot };
  const f = await setup(t, { bridge });
  await assert.rejects(f.service.invokeTool('prepare_learning_round', { trialFile: f.trialFile, arm: 'A', tabId: 'tab' }), /cross test accounts/);
  assert.equal(readTrial(f.trialFile).arms.A.active, null);
  assert.equal(f.calls.length, 0);
});

test('direct generator rejects changed experiment budgets or memory before calling the actor', async t => {
  const f = await setup(t);
  const prepared = await f.service.invokeTool('prepare_learning_round', { trialFile: f.trialFile, arm: 'A', snapshot: f.snapshot });
  let calls = 0;
  const provider = async () => { calls++; return { action: { type: 'giveUp' }, delayMs: 100, reason: 'Test double' }; };
  for (const change of [
    { maxActions: prepared.generationOptions.maxActions + 1 },
    { llm: { ...prepared.generationOptions.llm, maxCalls: 1 } },
    { seed: 'a-different-sample' },
    { timingProfile: 'original' },
  ]) await assert.rejects(generateTrace({ ...prepared.generationOptions, ...change, actorDecisionProvider: provider }), /Prepared trial request changed/);
  assert.equal(calls, 0);
});
