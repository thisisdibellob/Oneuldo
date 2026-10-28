'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { dispatch, invokeTool, definitions, createService } = require('../server.cjs');
const { getPersona } = require('../src/personas.ts');
test('MCP exposes intent generation, app replay and evidence-based learning trial tools', async () => {
  const initialized = await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(initialized.result.protocolVersion, '2025-03-26');
  const listed = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(listed.result.tools.map(tool => tool.name), ['begin_feedback_plan','step_feedback_plan','observe_feedback_plan','finalize_feedback_plan','begin_actor_plan','observe_actor_plan','append_actor_plan','finalize_actor_plan', 'prepare_whole_trace', 'submit_whole_trace', 'repair_whole_trace', 'whole_trace_status', 'list_personas', 'prepare_persona_validation', 'check_persona_validation_readiness', 'measure_persona_validation', 'prepare_blind_review', 'submit_blind_review', 'persona_validation_report', 'generate_trace', 'validate_trace', 'pair_app_session', 'list_app_sessions', 'play_trace', 'replay_status', 'stop_replay',
    'create_learner', 'create_luna_learner', 'create_whole_trace_learner', 'create_learning_trial', 'prepare_learning_round', 'generate_learning_round', 'record_learning_round', 'record_learning_failure', 'compare_learning_trial']);
  assert.equal(await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});
test('removed log/export tools, speed-up options and missing snapshots are rejected', async () => {
  for (const [name, args] of [
    ['export_to_backend', {}], ['validate_episode_schema', {}], ['generate_episode', {}],
    ['generate_trace', { personaId: 'careful-checker', seed: 'x' }],
    ['play_trace', { tabId: 'x', trace: {}, speedMultiplier: 4 }],
  ]) {
    const response = await dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    assert.equal(response.result.isError, true);
  }
});
test('replay commands use selected tab and whole trace with one service owner', async () => {
  const calls = [], fake = { start: async () => ({}), close: async () => {}, list: () => ({ sessions: [] }),
    play: (tabId, trace, owner) => { calls.push({ tabId, trace, owner }); return { replayId: 'r1' }; },
    stop: (tabId, owner) => { calls.push({ tabId, owner }); return { status: 'stopping' }; } };
  const service = createService({ bridge: fake });
  await service.invokeTool('play_trace', { tabId: 'tab-one', trace: { traceId: 'trace-one', steps: [] } });
  await service.invokeTool('stop_replay', { tabId: 'tab-one' });
  assert.equal(calls[0].tabId, 'tab-one'); assert.equal(calls[0].trace.traceId, 'trace-one'); assert.equal(calls[0].owner, calls[1].owner);
  await assert.rejects(service.invokeTool('play_trace', { tabId: 'tab-one', trace: {}, traceFilePath: '/tmp/not-used' }), /exactly one/);
  await service.close();
});
test('list_personas is offline and does not initialize a bridge', async () => {
  const result = await invokeTool('list_personas'); assert.equal(result.personas.length, 3);
  assert.ok(result.personas.every(persona => persona.id && !Object.hasOwn(persona, 'prompt')));
  assert.deepEqual(Object.fromEntries(result.personas.map(persona => [persona.id, persona.version])),
    Object.fromEntries(['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider'].map(id => [id, getPersona(id).version])));
  assert.ok(definitions.find(tool => tool.name === 'pair_app_session'));
});
test('MCP generates only an intention file bound to the supplied snapshot and validates it offline', async () => {
  const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
  const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'mcp-mission' }));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'market-mcp-'));
  const outputPath = path.join(directory, 'trace.json');
  const service = createService();
  const original = global.fetch;
  global.fetch = () => { throw new Error('Unexpected network access'); };
  try {
    const result = await service.invokeTool('generate_trace', { mode:'stochastic', personaId: 'careful-checker', seed: 'mcp-test', snapshot, outputPath });
    const trace = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(result.traceId, trace.traceId);
    assert.equal(trace.traceSchemaVersion, '2'); assert.equal(trace.policyVersion, '5');
    assert.equal(trace.personaVersion, getPersona('careful-checker').version); assert.equal(trace.experienceMode, 'first-play');
    assert.equal(trace.attentionExperience.source, 'planned-trace');
    assert.deepEqual(JSON.parse(fs.readFileSync(result.snapshotFilePath, 'utf8')), snapshot);
    assert.equal(trace.target.snapshotId, snapshot.snapshotId);
    assert.ok(trace.steps.length > 5);
    for (const property of ['episode', 'behaviorLogs', 'run', 'summary']) assert.ok(!Object.hasOwn(trace, property));
    assert.deepEqual(await service.invokeTool('validate_trace', { traceFilePath: outputPath, snapshot }), { valid: true, errors: [] });
    assert.deepEqual(await service.invokeTool('validate_trace', { traceFilePath: outputPath, snapshotFilePath: result.snapshotFilePath }), { valid: true, errors: [] });
    await assert.rejects(service.invokeTool('generate_trace', { mode:'stochastic', personaId: 'careful-checker', seed: 'mcp-test', snapshot, outputPath }), /EEXIST/);
    const changed = createMarketReplaySnapshot(createMarketSession({ seed: 'changed-mission' }));
    assert.equal((await service.invokeTool('validate_trace', { trace, snapshot: changed })).valid, false);
  } finally { global.fetch = original; await service.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
test('real STDIO emits JSON-RPC only and closes after EOF', async () => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../server.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end('not-json\n' + JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }) + '\n');
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr))); });
  const messages = stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(messages.length, 2); assert.ok(messages.some(message => message.error?.code === -32700)); assert.ok(messages.some(message => message.id === 7 && message.result));
});
