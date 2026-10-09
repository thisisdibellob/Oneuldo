const assert = require('node:assert/strict');
const test = require('node:test');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { WebSocket } = require('ws');

const { OneuldoMarketHttpService } = require('../src/http-service.cjs');

async function connectClient(url, name) {
  const client = new Client({ name, version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

test('shared HTTP MCP routes one browser and enforces one controlling client', async (context) => {
  const service = new OneuldoMarketHttpService({ port: 0, browserTimeoutMs: 1000, leaseTimeoutMs: 10000 });
  const address = await service.start();
  context.after(() => service.close());

  const browser = new WebSocket(address.browserUrl, { origin: 'http://localhost:8082' });
  context.after(() => browser.close());
  await new Promise((resolve, reject) => { browser.once('open', resolve); browser.once('error', reject); });
  browser.send(JSON.stringify({ type: 'browserReady', protocolVersion: 2, browserId: 'browser-a', visibility: 'visible', authenticated: false, view: 'login' }));
  browser.on('message', bytes => {
    const command = JSON.parse(bytes.toString());
    const sessionId = command.input.sessionId ?? command.input?.action?.sessionId ?? 'game-session';
    const payload = command.type === 'export'
      ? { schemaVersion: 'episode.v1', sessionId }
      : { schemaVersion: 'action.v1', sessionId, revision: command.type === 'start' ? 0 : 1, observation: { sessionId } };
    browser.send(JSON.stringify({ type: 'result', requestId: command.requestId, payload }));
  });

  const clientA = await connectClient(address.mcpUrl, 'client-a');
  const clientB = await connectClient(address.mcpUrl, 'client-b');
  context.after(() => clientA.close());
  context.after(() => clientB.close());

  const listed = await clientA.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name), [
    'market_bridge_status', 'market_start', 'market_observe', 'market_move', 'market_act', 'market_stop', 'market_export_episode',
  ]);
  const status = await clientA.callTool({ name: 'market_bridge_status', arguments: { browserId: 'browser-a' } });
  assert.equal(status.structuredContent.browser.ready, true);
  assert.equal(status.structuredContent.browser.target.authenticated, false);

  const loginRequired = await clientA.callTool({ name: 'market_start', arguments: { browserId: 'browser-a', agentModel: 'test', personaId: 'persona-a', sessionId: 'game-before-login' } });
  assert.equal(loginRequired.isError, true);
  assert.equal(loginRequired.structuredContent.error.code, 'AUTH_REQUIRED');
  browser.send(JSON.stringify({ type: 'browserReady', protocolVersion: 2, browserId: 'browser-a', visibility: 'visible', authenticated: true, view: 'app' }));
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
    const waitUntilAuthenticated = () => {
      if (service.bridge.status('browser-a').target?.authenticated) return resolve();
      if (Date.now() >= deadline) return reject(new Error('Browser did not report authentication'));
      setImmediate(waitUntilAuthenticated);
    };
    waitUntilAuthenticated();
  });

  const startedA = await clientA.callTool({ name: 'market_start', arguments: { browserId: 'browser-a', agentModel: 'test', personaId: 'persona-a', sessionId: 'game-a' } });
  assert.equal(startedA.isError, undefined);
  assert.equal(startedA.structuredContent.sessionId, 'game-a');

  const restartedA = await clientA.callTool({ name: 'market_start', arguments: { browserId: 'browser-a', agentModel: 'test', personaId: 'persona-a', sessionId: 'game-a-fresh' } });
  assert.equal(restartedA.isError, undefined);
  assert.equal(restartedA.structuredContent.sessionId, 'game-a-fresh');

  const blockedB = await clientB.callTool({ name: 'market_start', arguments: { browserId: 'browser-a', agentModel: 'test', personaId: 'persona-b', sessionId: 'game-b' } });
  assert.equal(blockedB.isError, true);
  assert.equal(blockedB.structuredContent.error.code, 'BROWSER_BUSY');

  const exportedA = await clientA.callTool({ name: 'market_export_episode', arguments: { sessionId: 'game-a-fresh' } });
  assert.equal(exportedA.isError, undefined);
  const startedB = await clientB.callTool({ name: 'market_start', arguments: { browserId: 'browser-a', agentModel: 'test', personaId: 'persona-b', sessionId: 'game-b' } });
  assert.equal(startedB.isError, undefined);
  assert.equal(startedB.structuredContent.sessionId, 'game-b');
  const stoppedB = await clientB.callTool({ name: 'market_stop', arguments: { sessionId: 'game-b', reason: 'test complete' } });
  assert.equal(stoppedB.isError, undefined);
  assert.equal(stoppedB.structuredContent.sessionId, 'game-b');
  const released = await clientB.callTool({ name: 'market_bridge_status', arguments: { browserId: 'browser-a' } });
  assert.equal(released.structuredContent.control.controlled, false);
});

test('a second shared service fails fast when the port is already owned', async (context) => {
  const first = new OneuldoMarketHttpService({ port: 0 });
  const address = await first.start();
  context.after(() => first.close());
  const second = new OneuldoMarketHttpService({ port: address.port });
  context.after(() => second.close());
  await assert.rejects(second.start(), error => error.code === 'EADDRINUSE');
});
