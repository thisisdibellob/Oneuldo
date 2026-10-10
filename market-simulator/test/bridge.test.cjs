'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const WebSocket = require('../../frontend/node_modules/ws');
const { ReplayBridge, validateConfig, loadReplayConfig, LEASE_TIMEOUT_MS } = require('../replay-bridge.cjs');
const appOrigin = 'http://localhost:8082', backendOrigin = 'http://127.0.0.1:18080';
function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'market-replay-bridge-'));
  const config = { port: 0, appOrigins: [appOrigin], targets: [{ env: 'local', backendOrigin, memberIds: ['test-a', 'test-b'], isolated: true }], manifestPath: path.join(directory, 'manifest.jsonl') };
  const bridge = new ReplayBridge(config, { validateTrace: (trace, snapshot) => ({ valid: trace.target?.snapshotId === snapshot.snapshotId, errors: ['snapshot mismatch'] }) });
  return { config, directory, bridge, async close() { await bridge.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}
function bootstrap(bridge, memberId = 'test-a') {
  const pair = bridge.pair({ appOrigin, backendOrigin, memberId });
  return { pair, bootstrap: JSON.parse(new URLSearchParams(new URL(pair.url).hash.slice(1)).get('marketReplay')) };
}
async function connect(bridge, memberId = 'test-a', patch = {}) {
  const { pair, bootstrap: credentials } = bootstrap(bridge, memberId);
  const socket = new WebSocket(bridge.address().bridgeUrl, { origin: appOrigin });
  const messages = [], waiters = [];
  socket.on('message', bytes => { const message = JSON.parse(bytes.toString()); const waiter = waiters.find(item => item.type === message.type); if (waiter) { waiters.splice(waiters.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(message); } else messages.push(message); });
  const next = type => {
    const index = messages.findIndex(item => item.type === type);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => { const item = { type, resolve }; item.timer = setTimeout(() => { waiters.splice(waiters.indexOf(item), 1); reject(new Error(`No ${type} message`)); }, 2000); waiters.push(item); });
  };
  await once(socket, 'open');
  const app = { origin: appOrigin, backendOrigin, memberId, ready: true, visible: true,
    snapshot: { snapshotId: `snapshot-${memberId}` }, questInstanceId: `quest-${memberId}`, sessionId: null };
  socket.send(JSON.stringify({ type: 'hello', protocolVersion: 1, ...credentials, app, ...patch }));
  return { pair, credentials, socket, app, next, send(message) { socket.send(JSON.stringify({ tabId: pair.tabId, epoch: pair.epoch, ...message })); } };
}
const trace = memberId => ({ traceId: `trace-${memberId}`, target: { snapshotId: `snapshot-${memberId}` }, steps: [{ type: 'viewCart', reason: 'check list' }] });
test('configuration requires private file, exact loopback app origin and explicit isolated target/account', () => {
  const state = setup(), prior = process.env.MARKET_REPLAY_CONFIG;
  try {
    assert.throws(() => validateConfig({ ...state.config, host: '0.0.0.0' }), /127.0.0.1/);
    assert.throws(() => validateConfig({ ...state.config, appOrigins: ['https://example.com'] }), /loopback/);
    assert.throws(() => validateConfig({ ...state.config, targets: [{ env: 'production', backendOrigin, isolated: true, memberIds: ['x'] }] }), /Production/);
    assert.throws(() => validateConfig({ ...state.config, targets: [{ env: 'local', backendOrigin: 'https://example.com', isolated: true, memberIds: ['x'] }] }), /loopback/);
    const file = path.join(state.directory, 'config.json'); fs.writeFileSync(file, JSON.stringify(state.config), { mode: 0o644 }); process.env.MARKET_REPLAY_CONFIG = file;
    assert.throws(loadReplayConfig, /0600/); fs.chmodSync(file, 0o600); assert.equal(loadReplayConfig().targets[0].memberIds[0], 'test-a');
    assert.throws(() => state.bridge.pair({ appOrigin, backendOrigin, memberId: 'real-user' }), /allowlisted/);
  } finally { if (prior === undefined) delete process.env.MARKET_REPLAY_CONFIG; else process.env.MARKET_REPLAY_CONFIG = prior; fs.rmSync(state.directory, { recursive: true, force: true }); }
});
test('authentication rejects wrong token, account, epoch and unlisted localhost port', async () => {
  const state = setup(); await state.bridge.start();
  try {
    for (const patch of [{ token: 'incorrect-token' }, { epoch: 'wrong-epoch' }, { app: { origin: appOrigin, backendOrigin, memberId: 'real-user', ready: true, visible: true } }]) {
      const client = await connect(state.bridge, 'test-a', patch);
      const [code] = await once(client.socket, 'close'); assert.equal(code, 1008);
    }
    const socket = new WebSocket(state.bridge.address().bridgeUrl, { origin: 'http://localhost:9999' });
    const [error] = await once(socket, 'error'); assert.match(error.message, /403/);
    assert.equal(state.bridge.list().sessions.length, 0);
  } finally { await state.close(); }
});
test('different accounts run in parallel with per-tab leases, complete traces and credential-free manifests', async () => {
  const state = setup(); await state.bridge.start();
  try {
    const a = await connect(state.bridge, 'test-a'), b = await connect(state.bridge, 'test-b');
    await a.next('ready'); await b.next('ready');
    const ra = state.bridge.play(a.pair.tabId, trace('test-a'), 'owner-a');
    const rb = state.bridge.play(b.pair.tabId, trace('test-b'), 'owner-b');
    assert.deepEqual((await a.next('play')).trace, trace('test-a')); assert.equal((await b.next('play')).replayId, rb.replayId);
    assert.throws(() => state.bridge.play(a.pair.tabId, trace('test-a'), 'owner-c'), /TAB_BUSY/);
    const otherA = await connect(state.bridge, 'test-a'); await otherA.next('ready');
    assert.throws(() => state.bridge.play(otherA.pair.tabId, trace('test-a'), 'owner-c'), /ACCOUNT_BUSY/);
    assert.throws(() => state.bridge.stop(a.pair.tabId, 'owner-b'), /another MCP owner/);
    a.send({ type: 'status', replayId: ra.replayId, status: 'completed', stepIndex: 1, app: { ...a.app, sessionId: 'real-tracker-session' }, report: { speedViolations: 0, inputDeltaViolations: 0 } });
    await a.next('heartbeat');
    assert.equal(state.bridge.status({ replayId: ra.replayId }).sessionId, 'real-tracker-session');
    assert.equal(state.bridge.status({ replayId: rb.replayId }).status, 'starting');
    const log = fs.readFileSync(state.config.manifestPath, 'utf8');
    assert.ok(log.includes('real-tracker-session')); assert.ok(!log.includes(a.credentials.token)); assert.ok(!log.includes('Authorization'));
    assert.equal(fs.statSync(state.config.manifestPath).mode & 0o777, 0o600);
  } finally { await state.close(); }
});
test('stop retains lease until app confirms; disconnect and heartbeat expiration stop active replay', async () => {
  const state = setup(); await state.bridge.start();
  try {
    const a = await connect(state.bridge); await a.next('ready');
    const run = state.bridge.play(a.pair.tabId, trace('test-a'), 'owner'); await a.next('play');
    assert.equal(state.bridge.stop(a.pair.tabId, 'owner').status, 'stopping'); await a.next('stop');
    assert.throws(() => state.bridge.play(a.pair.tabId, trace('test-a'), 'owner'), /TAB_BUSY/);
    a.send({ type: 'status', replayId: run.replayId, status: 'stopped', stepIndex: 1, stepId: 'step-0002', error: 'User stopped replay' }); await a.next('heartbeat');
    assert.equal(state.bridge.status({ replayId: run.replayId }).status, 'stopped');
    assert.equal(state.bridge.status({ replayId: run.replayId }).error, 'User stopped replay');
    assert.equal(state.bridge.status({ replayId: run.replayId }).stepId, 'step-0002');
    const next = state.bridge.play(a.pair.tabId, trace('test-a'), 'owner'); await a.next('play');
    state.bridge.tabs.get(a.pair.tabId).lastSeen = Date.now() - LEASE_TIMEOUT_MS - 1;
    state.bridge.tick(); assert.equal((await a.next('stop')).reason, 'heartbeat-expired');
    assert.equal(state.bridge.status({ replayId: next.replayId }).status, 'failed');
    const b = await connect(state.bridge, 'test-b'); await b.next('ready'); const rb = state.bridge.play(b.pair.tabId, trace('test-b'), 'owner'); await b.next('play');
    const serverClosed = once(state.bridge.tabs.get(b.pair.tabId).socket, 'close');
    b.socket.close(); await serverClosed;
    assert.equal(state.bridge.status({ replayId: rb.replayId }).reason, 'app-disconnected');
  } finally { await state.close(); }
});
test('learner-bound traces cannot send input or record a replay in a different account even with a matching mission', async () => {
  const state = setup(); await state.bridge.start();
  try {
    const b = await connect(state.bridge, 'test-b'); await b.next('ready');
    const bound = { ...trace('test-b'), generation: { learnerIdentity: { memberId: 'test-a' } } };
    assert.throws(() => state.bridge.play(b.pair.tabId, bound, 'owner'), /Learner trace cannot play in another test account/);
    assert.equal(state.bridge.replays.size, 0);
    assert.equal(state.bridge.tabs.get(b.pair.tabId).replayId, null);
    assert.equal(fs.existsSync(state.config.manifestPath), false);
    const matching = { ...bound, generation: { learnerIdentity: { memberId: 'test-b' } } };
    const run = state.bridge.play(b.pair.tabId, matching, 'owner');
    const sent = await b.next('play');
    assert.equal(sent.replayId, run.replayId);
    assert.equal(sent.trace.generation.learnerIdentity.memberId, 'test-b');
  } finally { await state.close(); }
});
test('mission mismatch cannot play; identity changes and consumed pairing credentials cannot reconnect', async () => {
  const state = setup(); await state.bridge.start();
  try {
    const a = await connect(state.bridge); await a.next('ready');
    assert.throws(() => state.bridge.play(a.pair.tabId, trace('test-b'), 'owner'), /snapshot mismatch/);
    const run = state.bridge.play(a.pair.tabId, trace('test-a'), 'owner'); await a.next('play');
    a.send({ type: 'status', app: { ...a.app, snapshot: { snapshotId: 'new-mission' } } });
    assert.equal((await a.next('stop')).reason, 'mission-changed');
    const serverClosed = once(state.bridge.tabs.get(a.pair.tabId).socket, 'close');
    a.send({ type: 'heartbeat', app: { ...a.app, memberId: 'real-user' } });
    const [code] = await once(a.socket, 'close'); assert.equal(code, 1008);
    await serverClosed;
    assert.equal(state.bridge.status({ replayId: run.replayId }).status, 'failed');
    const socket = new WebSocket(state.bridge.address().bridgeUrl, { origin: appOrigin }); await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'hello', protocolVersion: 1, ...a.credentials, app: a.app }));
    const [reconnectCode] = await once(socket, 'close'); assert.equal(reconnectCode, 1008);
  } finally { await state.close(); }
});
