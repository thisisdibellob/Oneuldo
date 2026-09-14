const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { spawn } = require('node:child_process');

function request(child, message) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      child.stdout.off('data', onData);
      try { resolve(JSON.parse(buffer.slice(0, newline))); }
      catch (error) { reject(error); }
    };
    child.stdout.on('data', onData);
    child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

test('MCP lists only explicit movement and game action tools', async (context) => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../server.cjs')], {
    env: { ...process.env, ONEULDO_MARKET_RUNTIME: 'local' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  context.after(() => child.kill());
  const initialized = await request(child, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(initialized.result.serverInfo.name, 'oneuldo-market-agent');
  const listed = await request(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    'market_start', 'market_observe', 'market_move', 'market_act', 'market_export_episode',
  ]);
});
