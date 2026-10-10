'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createService } = require('../server.cjs');
const { beginGeneration } = require('../generation-journal.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'market-generation-journal-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'journal-snapshot' }));
  return { directory, snapshot, outputPath: path.join(directory, 'trace.json') };
}
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function stubTrace() { return { traceId: 'stub', personaId: 'careful-checker', personaVersion: 'fixture', steps: [], target: {} }; }

test('MCP captures exact snapshot before the first model call and keeps failed generation separate', async t => {
  const f = fixture(t), diagnosticDirectory = `${f.outputPath}.generation`;
  const service = createService({ generateTrace: async options => {
    assert.deepEqual(read(path.join(diagnosticDirectory, 'snapshot.json')), f.snapshot);
    assert.equal(read(path.join(diagnosticDirectory, 'status.json')).state, 'running');
    options.onCheckpoint({ kind: 'decision', index: 0, before: { phase: 'shopping' },
      decision: { action: { type: 'pause', durationMs: 1000 }, delayMs: 100, reason: '주변을 확인한다',
        exchange: { request: 'secret-request', response: 'private-output' }, rawResponse: 'never-copy' },
      after: { phase: 'shopping', result: { accepted: true } }, activity: { repeatedVisits: 3 } });
    throw new Error('Fixture provider error with Authorization: never-save-this');
  } });
  t.after(() => service.close());
  await assert.rejects(service.invokeTool('generate_trace', { personaId: 'careful-checker', seed: 'journal',
    snapshot: f.snapshot, outputPath: f.outputPath,
    llm: { protocol: 'ollama', model: 'fixture', baseUrl: 'http://localhost:1/private', apiKeyEnv: 'SECRET_AUTH_ENV' },
  }), error => error.diagnosticDirectory === diagnosticDirectory && error.message.includes(diagnosticDirectory));
  assert.equal(fs.existsSync(f.outputPath), false);
  assert.equal(fs.existsSync(`${f.outputPath}.snapshot.json`), false);
  const saved = read(path.join(diagnosticDirectory, 'options.json'));
  assert.deepEqual(saved.options.llm, { protocol: 'ollama', model: 'fixture', maxCalls: 300, timeoutMs: 45000 });
  assert.ok(saved.versions.personaVersion && saved.versions.actorPolicyVersion);
  const status = read(path.join(diagnosticDirectory, 'status.json'));
  assert.equal(status.state, 'failed'); assert.equal(status.stage, 'generation'); assert.equal(status.checkpointCount, 1);
  const checkpoint = read(path.join(diagnosticDirectory, 'checkpoints.jsonl'));
  assert.deepEqual(checkpoint.decision, { action: { type: 'pause', durationMs: 1000 }, delayMs: 100, reason: '주변을 확인한다' });
  assert.equal(checkpoint.after.result.accepted, true);
  for (const file of fs.readdirSync(diagnosticDirectory))
    assert.doesNotMatch(fs.readFileSync(path.join(diagnosticDirectory, file), 'utf8'), /secret-request|private-output|never-copy|SECRET_AUTH_ENV|never-save-this|localhost:1/);
});

test('successful MCP generation returns diagnostics and terminal checkpoint without executing or learning from it', async t => {
  const f = fixture(t), trace = stubTrace();
  trace.generation = { controlledStop: { reason: 'persistent-stagnation', afterDecisions: 40, reviewCount: 3 } };
  const service = createService({ generateTrace: async options => {
    options.onCheckpoint({ kind: 'controlled-stop', index: 40, activity: { window: 12, stagnant: true,
      nested: { thinking: 'private-reasoning', request: 'raw-request', accepted: true } } });
    return trace;
  }, validateTrace: () => ({ valid: true, errors: [] }) });
  t.after(() => service.close());
  const result = await service.invokeTool('generate_trace', { personaId: 'careful-checker', seed: 'journal', snapshot: f.snapshot, outputPath: f.outputPath });
  assert.equal(result.diagnosticDirectory, `${f.outputPath}.generation`);
  assert.equal(result.ending, 'controlled-stop');
  assert.deepEqual(result.controlledStop, trace.generation.controlledStop);
  assert.deepEqual(read(result.outputPath), trace);
  assert.deepEqual(read(result.snapshotFilePath), f.snapshot);
  const status = read(path.join(result.diagnosticDirectory, 'status.json'));
  assert.equal(status.state, 'complete'); assert.equal(status.checkpointCount, 1);
  assert.deepEqual(status.controlledStop, trace.generation.controlledStop);
  assert.equal(status.outcome, 'system-intervention');
  assert.equal(status.learningEligible, false); assert.equal(status.performanceEligible, false);
  const entry = read(path.join(result.diagnosticDirectory, 'checkpoints.jsonl'));
  assert.deepEqual(entry.activity.nested, { accepted: true });
  assert.equal(entry.source, 'current-planning-observation');
});

test('concurrent outputs have distinct journals and an existing output is never replaced', async t => {
  const f = fixture(t); let calls = 0;
  const service = createService({ generateTrace: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return stubTrace(); },
    validateTrace: () => ({ valid: true, errors: [] }) });
  t.after(() => service.close());
  const args = { personaId: 'careful-checker', seed: 'journal', snapshot: f.snapshot };
  const destinations = [f.outputPath, path.join(f.directory, 'other.json')];
  const results = await Promise.all(destinations.map(outputPath => service.invokeTool('generate_trace', { ...args, outputPath })));
  assert.notEqual(results[0].diagnosticDirectory, results[1].diagnosticDirectory);
  const original = fs.readFileSync(f.outputPath, 'utf8');
  await assert.rejects(service.invokeTool('generate_trace', { ...args, outputPath: f.outputPath }), /EEXIST/);
  assert.equal(calls, 2); assert.equal(fs.readFileSync(f.outputPath, 'utf8'), original);
  const failedDestination = path.join(f.directory, 'in-progress.json');
  const settled = await Promise.allSettled([0, 1].map(() => service.invokeTool('generate_trace', { ...args, outputPath: failedDestination })));
  assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(x => x.status === 'rejected').length, 1);
  assert.equal(calls, 3);
});

test('system checkout diagnostics distinguish the planned controller suffix from actual analysis', async t => {
  const f = fixture(t), trace = stubTrace();
  trace.steps = [{ id:'actor-100', type:'pause', reactionDelayMs:100 }, { id:'system-101', type:'viewCart', reactionDelayMs:100 },
    { id:'system-102', type:'submitForReview', reactionDelayMs:100 }];
  trace.generation = { systemCompletion: { reason:'action-limit', afterDecisions:100, actionLimit:100,
    firstStepId:'system-101', checkoutId:'checkout', cartAtStart:{} } };
  const service = createService({ generateTrace: async options => {
    options.onCheckpoint({ kind:'system-completion', index:100, activity:{} }); return trace;
  }, validateTrace: () => ({ valid:true, errors:[] }) });
  t.after(() => service.close());
  const result = await service.invokeTool('generate_trace', {personaId:'careful-checker',seed:1,snapshot:f.snapshot,outputPath:f.outputPath});
  assert.equal(result.ending, 'assisted-review-requested');
  assert.deepEqual(result.systemCompletion, trace.generation.systemCompletion);
  const status = read(path.join(result.diagnosticDirectory,'status.json'));
  assert.equal(status.appExecuted,false);
  assert.equal(status.analysisRequested,false);
  assert.equal(status.learningScope,'actor-prefix-after-confirmed-app-replay');
  assert.deepEqual(status.systemEndingStepIds,['system-101','system-102']);
  assert.equal(read(path.join(result.diagnosticDirectory,'checkpoints.jsonl')).kind,'system-completion');
});

test('journal whitelists options and omits callbacks and provider exchanges recursively', t => {
  const f = fixture(t), journal = beginGeneration(f.outputPath, f.snapshot, { personaId: 'careful-checker', seed: 1,
    decisionProvider() {}, actorDecisionProvider() {}, onCheckpoint() {}, randomPrivateSetting: 'excluded',
    attentionExperience: { visit: 'first-play', exchange: { request: 'private' } },
    llm: { model: 'fixture', protocol: 'openai', maxCalls: 8, timeoutMs: 1000, apiKey: 'credential', baseUrl: 'private-endpoint', apiKeyEnv: 'private-env' },
  }, { personaVersion: 'fixture' });
  journal.fail('generation');
  const options = read(path.join(journal.diagnosticDirectory, 'options.json')).options;
  assert.deepEqual(options.attentionExperience, { visit: 'first-play' });
  assert.deepEqual(options.llm, { model: 'fixture', protocol: 'openai', maxCalls: 8, timeoutMs: 1000 });
  assert.doesNotMatch(JSON.stringify(options), /private|credential|Provider|onCheckpoint|randomPrivate/);
});

test('default destination is chosen once and independent calls reserve different UUID paths', async t => {
  const f = fixture(t), service = createService({ generateTrace: async () => stubTrace(),
    validateTrace: () => ({ valid: true, errors: [] }) });
  t.after(() => service.close());
  const results = [];
  t.after(() => {
    for (const result of results) for (const file of [result.outputPath, result.snapshotFilePath, result.diagnosticDirectory])
      fs.rmSync(file, { recursive: true, force: true });
  });
  const args = { personaId: 'careful-checker', seed: 1, snapshot: f.snapshot };
  results.push(...await Promise.all([service.invokeTool('generate_trace', args), service.invokeTool('generate_trace', args)]));
  assert.notEqual(results[0].outputPath, results[1].outputPath);
  for (const result of results) {
    assert.equal(result.diagnosticDirectory, `${result.outputPath}.generation`);
    assert.equal(result.snapshotFilePath, `${result.outputPath}.snapshot.json`);
    assert.deepEqual(read(path.join(result.diagnosticDirectory, 'snapshot.json')), f.snapshot);
  }
});
