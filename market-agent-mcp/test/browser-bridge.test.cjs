const assert = require('node:assert/strict');
const test = require('node:test');
const { WebSocket } = require('ws');

const { BrowserBridgeServer } = require('../src/browser-bridge-server.cjs');
const { BrowserMarketRuntime } = require('../src/browser-runtime.cjs');

test('browser runtime rejects a missing browser and forwards commands after connection', async (context) => {
  const bridge = new BrowserBridgeServer({ port: 0, allowedOrigin: 'http://localhost:8082', timeoutMs: 1000 });
  bridge.start();
  context.after(() => bridge.close());
  await new Promise(resolve => bridge.server.once('listening', resolve));
  const runtime = new BrowserMarketRuntime(bridge);
  await assert.rejects(runtime.start({ agentModel: 'test', personaId: 'persona' }), error => error.code === 'BROWSER_NOT_CONNECTED');

  const port = bridge.server.address().port;
  const browser = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:8082' });
  context.after(() => browser.close());
  await new Promise((resolve, reject) => { browser.once('open', resolve); browser.once('error', reject); });
  browser.send(JSON.stringify({ type: 'browserReady', protocolVersion: 2, browserId: 'visible-browser', url: 'http://localhost:8082/?marketAgent=1&marketAgentBrowserId=visible-browser', visibility: 'visible', authenticated: true, view: 'app' }));
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
    const waitUntilReady = () => {
      if (bridge.status('visible-browser').ready) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('Browser bridge did not become ready'));
        return;
      }
      setImmediate(waitUntilReady);
    };
    waitUntilReady();
  });
  browser.on('message', bytes => {
    const command = JSON.parse(bytes.toString());
    browser.send(JSON.stringify({ type: 'result', requestId: command.requestId, payload: { accepted: true, echoed: command } }));
  });

  const result = await runtime.move({ browserId: 'visible-browser', sessionId: 'session-1', actionId: 'move-1', expectedRevision: 0, dx: 12, dy: -4 });
  assert.equal(result.accepted, true);
  assert.deepEqual(result.echoed.input.action, { type: 'move', dx: 12, dy: -4 });
});

test('routes commands only to the explicitly selected browser', async (context) => {
  const bridge = new BrowserBridgeServer({ port: 0, allowedOrigin: 'http://localhost:8082', timeoutMs: 1000 });
  bridge.start();
  context.after(() => bridge.close());
  await new Promise(resolve => bridge.server.once('listening', resolve));
  const port = bridge.server.address().port;
  const hidden = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:8082' });
  const visible = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:8082' });
  context.after(() => { hidden.close(); visible.close(); });
  await Promise.all([hidden, visible].map(browser => new Promise((resolve, reject) => { browser.once('open', resolve); browser.once('error', reject); })));
  hidden.send(JSON.stringify({ type: 'browserReady', protocolVersion: 2, browserId: 'hidden', visibility: 'hidden', authenticated: false, view: 'login' }));
  visible.send(JSON.stringify({ type: 'browserReady', protocolVersion: 2, browserId: 'visible', visibility: 'visible', authenticated: true, view: 'app' }));
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
    const waitUntilReady = () => {
      if (bridge.status('hidden').ready && bridge.status('visible').ready) return resolve();
      if (Date.now() >= deadline) return reject(new Error('Both browsers did not become ready'));
      setImmediate(waitUntilReady);
    };
    waitUntilReady();
  });
  let hiddenCommands = 0;
  hidden.on('message', () => { hiddenCommands += 1; });
  visible.on('message', bytes => {
    const command = JSON.parse(bytes.toString());
    visible.send(JSON.stringify({ type: 'result', requestId: command.requestId, payload: { browser: 'visible' } }));
  });
  const result = await bridge.request('visible', { type: 'observe', input: { sessionId: 'game' } });
  assert.equal(result.browser, 'visible');
  assert.equal(hiddenCommands, 0);
  assert.equal(bridge.status('visible').target.visibility, 'visible');
  assert.equal(bridge.status('visible').target.authenticated, true);
  assert.equal(bridge.status('hidden').target.view, 'login');
});
