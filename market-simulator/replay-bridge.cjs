'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, timingSafeEqual, createHash } = require('node:crypto');
const WebSocket = require('../frontend/node_modules/ws');
const WebSocketServer = WebSocket.WebSocketServer ?? WebSocket.Server;
const HEARTBEAT_MS = 2000;
const LEASE_TIMEOUT_MS = 8000;
const TERMINAL = new Set(['completed', 'stopped', 'failed']);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function origin(value) {
  if (typeof value !== 'string') throw new Error('Expected an origin string.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Configure exact origins only: scheme, host, port.');
  return url.origin;
}
function validateConfig(config) {
  if (!config || !Array.isArray(config.appOrigins) || !config.appOrigins.length || !Array.isArray(config.targets) || !config.targets.length) throw new Error('Replay configuration requires appOrigins and isolated targets.');
  const port = config.port ?? 8765;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid replay bridge port.');
  if (config.host !== undefined && config.host !== '127.0.0.1') throw new Error('Replay bridge can only bind 127.0.0.1.');
  const appOrigins = config.appOrigins.map(origin);
  for (const value of appOrigins) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) throw new Error('Development app origins must be loopback addresses.');
  const targets = config.targets.map(target => {
    if (!['local', 'staging'].includes(target.env) || target.isolated !== true) throw new Error('Production is blocked; target must be isolated local or staging.');
    const backendOrigin = origin(target.backendOrigin), url = new URL(backendOrigin);
    if (target.env === 'local' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('local backend must use loopback.');
    if (target.env === 'staging' && url.protocol !== 'https:') throw new Error('staging backend requires HTTPS.');
    if (!Array.isArray(target.memberIds) || !target.memberIds.length || target.memberIds.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Each target needs explicit test memberIds.');
    return { env: target.env, isolated: true, backendOrigin, memberIds: [...target.memberIds] };
  });
  return { port, appOrigins, targets, manifestPath: path.resolve(config.manifestPath ?? path.join(__dirname, 'output/replay-manifest.jsonl')) };
}
function loadReplayConfig() {
  if (!process.env.MARKET_REPLAY_CONFIG) throw new Error('Set MARKET_REPLAY_CONFIG to a private local configuration file; replay is disabled by default.');
  const file = path.resolve(process.env.MARKET_REPLAY_CONFIG), stat = fs.statSync(file);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('Replay configuration must be a regular file with mode 0600.');
  return validateConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
}
class ReplayBridge {
  constructor(config, options = {}) {
    this.config = validateConfig(config);
    this.validateTrace = options.validateTrace;
    this.pairings = new Map();
    this.tabs = new Map();
    this.replays = new Map();
    this.server = null; this.ws = null; this.timer = null;
  }
  async start() {
    if (this.server) return this.address();
    this.server = http.createServer((_request, response) => { response.writeHead(404); response.end(); });
    this.ws = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
    this.server.on('upgrade', (request, socket, head) => {
      if (request.url !== '/replay' || !this.config.appOrigins.includes(request.headers.origin)) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
      this.ws.handleUpgrade(request, socket, head, connection => this.accept(connection, request.headers.origin));
    });
    try { await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.config.port, '127.0.0.1', resolve); }); }
    catch (error) { this.ws.close(); this.server = null; this.ws = null; throw error; }
    this.timer = setInterval(() => this.tick(), HEARTBEAT_MS); this.timer.unref();
    return this.address();
  }
  address() { return { host: '127.0.0.1', port: this.server?.address()?.port ?? this.config.port, bridgeUrl: `ws://127.0.0.1:${this.server?.address()?.port ?? this.config.port}/replay` }; }
  pair({ appOrigin, backendOrigin, memberId }) {
    appOrigin = origin(appOrigin); backendOrigin = origin(backendOrigin);
    if (!this.config.appOrigins.includes(appOrigin)) throw new Error('App origin is not allowlisted.');
    const target = this.config.targets.find(item => item.backendOrigin === backendOrigin && item.memberIds.includes(memberId));
    if (!target) throw new Error('Backend/test account combination is not allowlisted.');
    const tabId = randomUUID(), epoch = randomUUID(), token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 5 * 60 * 1000;
    this.pairings.set(tabId, { tabId, epoch, token, appOrigin, backendOrigin, memberId, expiresAt, targetEnv: target.env });
    const bootstrap = { tabId, epoch, token, bridgeUrl: this.address().bridgeUrl, backendOrigin, memberId };
    return { tabId, epoch, expiresAt: new Date(expiresAt).toISOString(), url: `${appOrigin}/?marketReplay=1#marketReplay=${encodeURIComponent(JSON.stringify(bootstrap))}` };
  }
  accept(socket, appOrigin) {
    let tab;
    const authTimer = setTimeout(() => socket.close(1008, 'authentication required'), 3000); authTimer.unref();
    socket.on('message', bytes => {
      try {
        const message = JSON.parse(bytes.toString());
        if (!tab) {
          const pairing = this.pairings.get(message.tabId);
          const token = typeof message.token === 'string' ? Buffer.from(message.token) : Buffer.alloc(0);
          const expected = Buffer.from(pairing?.token ?? '');
          if (message.type !== 'hello' || message.protocolVersion !== 1 || !pairing || pairing.expiresAt < Date.now()
            || pairing.epoch !== message.epoch || pairing.appOrigin !== appOrigin || token.length !== expected.length || !timingSafeEqual(token, expected)) throw new Error('Authentication failed.');
          this.assertApp(message.app, pairing);
          if (this.tabs.has(pairing.tabId)) throw new Error('Tab already connected.');
          tab = { tabId: pairing.tabId, epoch: pairing.epoch, appOrigin, backendOrigin: pairing.backendOrigin, memberId: pairing.memberId,
            targetEnv: pairing.targetEnv, socket, app: message.app, connectedAt: new Date().toISOString(), lastSeen: Date.now(), replayId: null };
          this.tabs.set(tab.tabId, tab); this.pairings.delete(tab.tabId); clearTimeout(authTimer);
          this.send(tab, { type: 'ready', epoch: tab.epoch, heartbeatMs: HEARTBEAT_MS, leaseTimeoutMs: LEASE_TIMEOUT_MS });
          return;
        }
        if (message.tabId !== tab.tabId || message.epoch !== tab.epoch || !['heartbeat', 'status'].includes(message.type)) throw new Error('Invalid tab/epoch/message.');
        tab.lastSeen = Date.now();
        if (message.app) {
          this.assertApp(message.app, tab);
          if (tab.replayId && message.app.snapshot?.snapshotId !== tab.app.snapshot?.snapshotId) this.stop(tab.tabId, null, 'mission-changed');
          tab.app = message.app;
        }
        if (message.type === 'status' && message.replayId) {
          const replay = this.replays.get(message.replayId);
          if (!replay || replay.tabId !== tab.tabId || replay.epoch !== tab.epoch || (tab.replayId !== replay.replayId && !TERMINAL.has(replay.status))) throw new Error('Unknown replay.');
          if (!['running', 'completed', 'stopped', 'failed'].includes(message.status)) throw new Error('Invalid replay status.');
          if (TERMINAL.has(replay.status) || (replay.status === 'stopping' && message.status === 'running')) return;
          if (message.stepIndex !== undefined && (!Number.isInteger(message.stepIndex) || message.stepIndex < 0)) throw new Error('Invalid replay step index.');
          if (message.stepId !== undefined && (typeof message.stepId !== 'string' || message.stepId.length > 200)) throw new Error('Invalid replay step ID.');
          if (message.error !== undefined && typeof message.error !== 'string') throw new Error('Invalid replay error.');
          replay.status = message.status; replay.stepIndex = message.stepIndex ?? replay.stepIndex;
          if (message.stepId !== undefined) replay.stepId = message.stepId;
          if (message.error !== undefined) replay.error = message.error.slice(0, 2000);
          if (message.report !== undefined) replay.report = message.report;
          replay.sessionId = message.app?.sessionId ?? tab.app.sessionId ?? replay.sessionId;
          if (TERMINAL.has(replay.status)) { replay.finishedAt = new Date().toISOString(); tab.replayId = null; }
          this.record(replay);
        }
        this.send(tab, { type: 'heartbeat', epoch: tab.epoch, replayId: tab.replayId });
      } catch { socket.close(1008, 'invalid or unauthorized replay message'); }
    });
    socket.on('close', () => {
      clearTimeout(authTimer);
      if (tab && this.tabs.get(tab.tabId)?.socket === socket) {
        this.terminate(tab, 'failed', 'app-disconnected'); this.tabs.delete(tab.tabId);
      }
    });
    socket.on('error', () => {});
  }
  assertApp(app, expected) {
    if (!app || app.origin !== expected.appOrigin || app.backendOrigin !== expected.backendOrigin || app.memberId !== expected.memberId) throw new Error('App identity/target changed.');
    if (typeof app.ready !== 'boolean' || typeof app.visible !== 'boolean') throw new Error('App readiness/visibility is required.');
  }
  send(tab, message) { if (tab.socket.readyState === 1) tab.socket.send(JSON.stringify(message)); }
  snapshot(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.app.ready || !tab.app.snapshot) throw new Error('A connected, authenticated mission snapshot is required.');
    return structuredClone(tab.app.snapshot);
  }
  list() {
    return { ...this.address(), sessions: [...this.tabs.values()].map(tab => ({ tabId: tab.tabId, epoch: tab.epoch,
      appOrigin: tab.appOrigin, backendOrigin: tab.backendOrigin, memberId: tab.memberId, targetEnv: tab.targetEnv,
      connectedAt: tab.connectedAt, ready: tab.app.ready, visible: tab.app.visible, snapshotId: tab.app.snapshot?.snapshotId ?? null,
      questInstanceId: tab.app.questInstanceId ?? null, sessionId: tab.app.sessionId ?? null, replayId: tab.replayId })) };
  }
  play(tabId, trace, ownerId) {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.app.ready || !tab.app.visible) throw new Error('Target tab must be connected, ready and visible.');
    if (tab.replayId) throw new Error('TAB_BUSY: this tab already has an active replay.');
    const validation = this.validateTrace(trace, this.snapshot(tabId));
    if (!validation.valid) throw new Error(`Invalid trace: ${validation.errors.join('; ')}`);
    for (const other of this.tabs.values()) if (other.replayId && other.backendOrigin === tab.backendOrigin && other.memberId === tab.memberId) throw new Error('ACCOUNT_BUSY: concurrent tabs must use different test accounts.');
    const replay = { replayId: randomUUID(), traceId: trace.traceId, traceHash: digest(trace), tabId, epoch: tab.epoch, ownerId,
      targetEnv: tab.targetEnv, backendOrigin: tab.backendOrigin, memberId: tab.memberId,
      snapshotId: tab.app.snapshot.snapshotId, questInstanceId: tab.app.questInstanceId ?? null, sessionId: tab.app.sessionId ?? null,
      status: 'starting', stepIndex: 0, startedAt: new Date().toISOString() };
    this.record(replay);
    this.replays.set(replay.replayId, replay); tab.replayId = replay.replayId;
    this.send(tab, { type: 'play', epoch: tab.epoch, replayId: replay.replayId, traceHash: replay.traceHash, trace });
    return this.publicReplay(replay);
  }
  publicReplay(replay) { const { ownerId, ...result } = replay; return result; }
  status({ replayId, tabId } = {}) {
    const replay = replayId ? this.replays.get(replayId) : this.replays.get(this.tabs.get(tabId)?.replayId);
    if (!replay) throw new Error('Replay not found; supply a known replayId.');
    return this.publicReplay(replay);
  }
  stop(tabId, ownerId, reason = 'user-stopped') {
    const tab = this.tabs.get(tabId), replay = this.replays.get(tab?.replayId);
    if (!tab || !replay) throw new Error('No active replay on this tab.');
    if (ownerId && ownerId !== replay.ownerId) throw new Error('Replay belongs to another MCP owner.');
    this.send(tab, { type: 'stop', epoch: tab.epoch, replayId: replay.replayId, reason });
    replay.status = 'stopping'; replay.reason = reason; replay.stopRequestedAt = Date.now(); this.record(replay);
    return this.publicReplay(replay);
  }
  terminate(tab, status, reason) {
    const replay = this.replays.get(tab.replayId);
    if (!replay || TERMINAL.has(replay.status)) return;
    replay.status = status; replay.reason = reason; replay.finishedAt = new Date().toISOString(); tab.replayId = null;
    this.record(replay);
  }
  tick() {
    for (const [id, pairing] of this.pairings) if (pairing.expiresAt < Date.now()) this.pairings.delete(id);
    for (const tab of this.tabs.values()) {
      const replay = this.replays.get(tab.replayId);
      if ((replay?.status === 'stopping' && Date.now() - replay.stopRequestedAt > LEASE_TIMEOUT_MS) || Date.now() - tab.lastSeen > LEASE_TIMEOUT_MS) { this.send(tab, { type: 'stop', epoch: tab.epoch, replayId: tab.replayId, reason: 'heartbeat-expired' }); this.terminate(tab, 'failed', 'heartbeat-expired'); tab.socket.close(1001, 'heartbeat expired'); }
      else this.send(tab, { type: 'heartbeat', epoch: tab.epoch, replayId: tab.replayId });
    }
  }
  record(replay) {
    const file = this.config.manifestPath;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND, 0o600);
    try { if ((fs.fstatSync(fd).mode & 0o077) !== 0) throw new Error('Replay manifest must have mode 0600.'); fs.writeSync(fd, JSON.stringify(this.publicReplay(replay)) + '\n'); }
    finally { fs.closeSync(fd); }
  }
  async close() {
    clearInterval(this.timer);
    for (const tab of this.tabs.values()) {
      this.send(tab, { type: 'stop', epoch: tab.epoch, replayId: tab.replayId, reason: 'bridge-shutdown' });
      this.terminate(tab, 'failed', 'bridge-shutdown'); tab.socket.terminate();
    }
    this.tabs.clear(); this.pairings.clear();
    if (this.ws) await new Promise(resolve => this.ws.close(resolve));
    if (this.server) await new Promise(resolve => this.server.close(resolve));
    this.ws = null; this.server = null;
  }
}
module.exports = { ReplayBridge, loadReplayConfig, validateConfig, HEARTBEAT_MS, LEASE_TIMEOUT_MS };
