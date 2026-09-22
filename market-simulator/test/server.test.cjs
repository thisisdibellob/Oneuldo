const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { dispatch, invokeTool } = require('../server.cjs');
test('MCP initialize and tools/list describe independent simulation tools', async () => {
  const initialized = await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(initialized.result.protocolVersion, '2025-03-26');
  const listed = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listed.result.tools.length, 5);
  assert.ok(listed.result.tools.every((tool) => !tool.name.includes('browser')));
  assert.equal(await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});
test('MCP rejects production, invalid counts and unknown generation arguments', async () => {
  for (const [name, args] of [
    ['export_to_backend', { batchFilePath: '/tmp/no-file', targetEnv: 'production' }],
    ['generate_batch', { count: -1, seed: 'x', outputPath: '/tmp/no-file' }],
    ['generate_episode', { personaId: 'careful-checker', seed: 'x', setPosition: { x: 1, y: 2 } }],
  ]) {
    const response = await dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    assert.equal(response.result.isError, true);
  }
});
test('batch rejects single-episode and unadvertised options instead of ignoring them', async () => {
  const listed = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const schema = listed.result.tools.find((tool) => tool.name === 'generate_batch').inputSchema;
  for (const [name, value] of Object.entries({ personaId: 'careful-checker', sessionId: 'custom-session', replayTrace: [], config: {} })) {
    assert.equal(Object.hasOwn(schema.properties, name), false);
    await assert.rejects(invokeTool('generate_batch', { count: 1, seed: 'x', outputPath: '/tmp/unused-batch-path.jsonl', [name]: value }), new RegExp(name + ': unknown argument'));
  }
});
test('two episode requests coexist, persist artifacts and return bounded output', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'market-mcp-'));
  try {
    const results = await Promise.all(['one', 'two'].map((seed) => invokeTool('generate_episode', { personaId: 'careful-checker', seed, outputPath: path.join(directory, seed + '.jsonl') })));
    assert.notEqual(results[0].sessionId, results[1].sessionId);
    for (const result of results) { assert.ok(fs.statSync(result.outputPath).size > 100); assert.ok(JSON.stringify(result).length < 20000); }
    const validation = await invokeTool('validate_episode_schema', { batchFilePath: results[0].outputPath });
    assert.equal(validation.valid, true, JSON.stringify(validation.failures));
    await assert.rejects(invokeTool('generate_episode', { personaId: 'careful-checker', seed: 'one', outputPath: results[0].outputPath }), /EEXIST/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('real STDIO process emits JSON-RPC only and handles parse errors', async () => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../server.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdin.end('not-json\n' + JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }) + '\n');
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr))); });
  const messages = stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(messages.length, 2); assert.ok(messages.some((message) => message.error?.code === -32700)); assert.ok(messages.some((message) => message.id === 7 && message.result));
});
