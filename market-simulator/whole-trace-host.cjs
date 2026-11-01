'use strict';
// Opt-in process ownership for offline whole-trace work. The journal is audit
// evidence, never a session checkpoint: a new host cannot restore old requests.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const TOOLS = new Set(['list_personas', 'prepare_whole_trace', 'submit_whole_trace', 'repair_whole_trace',
  'whole_trace_status', 'validate_trace', 'begin_whole_trace_authoring', 'append_whole_trace_decision',
  'whole_trace_authoring_menu', 'finish_whole_trace_authoring']);
const MATERIALIZED_FILES = [['candidateFilePath', 'candidate'], ['repairFilePath', 'repair'],
  ['snapshotFilePath', 'snapshot'], ['traceFilePath', 'trace']];
const SUPPORTED_FILE_KEYS = new Set(MATERIALIZED_FILES.map(([key]) => key));
const MAX_MESSAGE = 4 * 1024 * 1024;
const SHUTDOWN_REPLY_TIMEOUT_MS = 5000;
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const now = () => new Date().toISOString();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function error(code, message) { return Object.assign(new Error(message), { code }); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function atomicJson(file, value) {
  const temporary = `${file}.partial`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function materialize(args) {
  // Learner/trial/run directories carry mutable external state. They remain on
  // the existing MCP/interactive workflow until an explicit freeze/resume
  // contract exists. Merely hashing their pathname is not payload identity.
  for (const key of Object.keys(args)) {
    if (/(?:File|FilePath|FilePaths|Directory)$/.test(key) && !SUPPORTED_FILE_KEYS.has(key))
      throw error('HOST_UNBOUND_FILE_OPTION', `Detached host does not support ${key}. Use the existing MCP/interactive workflow for mutable learner/trial/persona-validation state. Only candidateFilePath, repairFilePath, snapshotFilePath and traceFilePath are frozen here.`);
  }
  const result = structuredClone(args);
  // Freeze file contents before queuing and hashing, so retrying an operation
  // after editing its candidate cannot silently return an unrelated result.
  for (const [fileKey, valueKey] of MATERIALIZED_FILES) {
    if (typeof result[fileKey] === 'string' && !Object.hasOwn(result, valueKey)) {
      result[valueKey] = json(path.resolve(result[fileKey]));
      delete result[fileKey];
    }
  }
  return result;
}
function publicStatus(state) {
  return { ...state, available: state.state === 'ready', resumable: false,
    requests: Object.fromEntries(Object.entries(state.requests).map(([id, request]) => [id,
      { ...request, sessionAvailable: state.state === 'ready' }])) };
}

async function startHost(directory, { startupTimeoutMs = 20000 } = {}) {
  directory = path.resolve(directory);
  // Exclusive ownership intentionally rejects even a retired host directory.
  fs.mkdirSync(directory, { mode: 0o700 });
  const hostId = crypto.randomUUID();
  fs.writeFileSync(path.join(directory, 'owner.json'), JSON.stringify({ hostId, createdAt: now() }) + '\n', { flag: 'wx', mode: 0o600 });
  const log = fs.openSync(path.join(directory, 'process.log'), 'ax', 0o600);
  let child;
  try { child = spawn(process.execPath, [__filename, '--run', directory, hostId], {
    detached: true, stdio: ['ignore', log, log], cwd: process.cwd(),
  }); } finally { fs.closeSync(log); }
  let spawnError;
  child.on('error', cause => { spawnError = cause; });
  child.unref();
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    const statePath = path.join(directory, 'status.json');
    if (fs.existsSync(statePath)) {
      const state = json(statePath);
      if (state.state === 'ready') return { directory, ...await hostStatus(directory) };
      if (['failed', 'closed'].includes(state.state)) throw error('HOST_START_FAILED', `Host failed to start; inspect ${statePath}`);
    }
    await pause(25);
  }
  // Do not kill or restart a host whose startup outcome is uncertain.
  throw error('HOST_START_UNCONFIRMED', `Host startup not confirmed; inspect host-status for ${directory}. Do not retry in a new directory until ownership is resolved.`);
}

function connect(directory, message, { timeoutMs = 300000 } = {}) {
  directory = path.resolve(directory);
  const credentials = json(path.join(directory, 'connection.json'));
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(credentials.socketPath);
    socket.setEncoding('utf8');
    let data = '', completed = false;
    const finish = (cause, value) => { if (completed) return; completed = true; socket.destroy(); cause ? reject(cause) : resolve(value); };
    socket.setTimeout(timeoutMs, () => finish(error('HOST_RESPONSE_UNCERTAIN', 'Host response timed out. Inspect host-status and retry only the same operationId and unchanged payload; do not create a replacement request.')));
    let connected = false;
    socket.on('error', cause => finish(error(connected ? 'HOST_RESPONSE_UNCERTAIN' : 'HOST_UNAVAILABLE',
      `Host connection failed (${cause.code}); saved requests are not restored. Inspect host-status and retry only the same operationId and unchanged payload on the same live host; do not rebind candidates.`)));
    socket.on('connect', () => { connected = true; socket.write(JSON.stringify({ ...message, hostId: credentials.hostId, token: credentials.token }) + '\n'); });
    socket.on('data', chunk => {
      data += chunk;
      const end = data.indexOf('\n');
      if (end < 0) return;
      try {
        const response = JSON.parse(data.slice(0, end));
        if (response.hostId !== credentials.hostId) throw error('HOST_IDENTITY_MISMATCH', 'Host identity changed; requests cannot be rebound.');
        if (!response.ok) throw error(response.error.code, response.error.message);
        finish(null, response.result);
      } catch (cause) { finish(cause); }
    });
    socket.on('end', () => { if (!completed) finish(error('HOST_RESPONSE_UNCERTAIN', 'Host disconnected before a complete response. Retry only the same operationId and unchanged payload on the same live host.')); });
  });
}
async function hostStatus(directory) {
  try { return await connect(directory, { command: 'status' }, { timeoutMs: 2000 }); }
  catch (cause) {
    if (!['HOST_UNAVAILABLE', 'HOST_RESPONSE_UNCERTAIN', 'ENOENT'].includes(cause.code)) throw cause;
    const saved = json(path.join(path.resolve(directory), 'status.json'));
    return { ...publicStatus({ ...saved, state: 'unavailable' }), lastKnownState: saved.state,
      state: ['closed', 'failed'].includes(saved.state) ? saved.state : 'unavailable',
      unavailability: cause.code, terminationCauseKnown: saved.endedAt !== undefined,
      guidance: 'The journal does not restore sessions. Keep old candidates bound to this host and request; use a new directory only for separately authorized work.' };
  }
}
const callHost = (directory, request, options) => connect(directory, { ...request, command: 'call' }, options);
const closeHost = directory => connect(directory, { command: 'close' });

async function runHost(directory, hostId) {
  directory = path.resolve(directory);
  if (json(path.join(directory, 'owner.json')).hostId !== hostId) throw error('HOST_OWNER_MISMATCH', 'Host owner mismatch');
  const runtimeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mwh-'));
  fs.chmodSync(runtimeDirectory, 0o700);
  const socketPath = path.join(runtimeDirectory, 'h.sock');
  const token = crypto.randomBytes(32).toString('hex');
  const statePath = path.join(directory, 'status.json');
  const journalPath = path.join(directory, 'events.jsonl');
  const state = { version: 1, hostId, pid: process.pid, startedAt: now(), state: 'starting', runtimeDirectory,
    stdinOwnership: 'detached-ignored', requests: {}, operations: {} };
  function event(type, fields = {}) {
    const entry = { time: now(), hostId, pid: process.pid, type, ...fields };
    fs.appendFileSync(journalPath, JSON.stringify(entry) + '\n', { mode: 0o600 });
    state.updatedAt = entry.time;
    atomicJson(statePath, state);
  }
  event('host_starting');
  const service = require('./server.cjs').createService();
  const operations = new Map();
  let tail = Promise.resolve(), stopping = null;
  const sockets = new Set(), replies = new Set();
  const server = net.createServer(socket => {
    socket.setEncoding('utf8');
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {}); // A caller disconnect never owns the host.
    socket.setTimeout(300000, () => socket.destroy());
    let buffer = '', received = false;
    socket.on('data', chunk => {
      if (received) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_MESSAGE) { received = true; reply(socket, Promise.reject(error('HOST_MESSAGE_TOO_LARGE', 'Request exceeds 4 MiB; use a file path.'))); return; }
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      received = true;
      let message;
      try { message = JSON.parse(buffer.slice(0, end)); } catch { reply(socket, Promise.reject(error('HOST_INVALID_JSON', 'Expected one JSON request.'))); return; }
      reply(socket, handle(message));
    });
  });
  function reply(socket, promise) {
    // socket.end() only queues bytes. Keep the response alive through writable
    // finish (or a disconnected peer), including responses to queued calls.
    const pending = (async () => {
      let payload;
      try { payload = JSON.stringify({ hostId, ok: true, result: await promise }) + '\n'; }
      catch (cause) { payload = JSON.stringify({ hostId, ok: false, error: { code: cause.code ?? 'HOST_TOOL_ERROR', message: cause.message } }) + '\n'; }
      await new Promise(resolve => {
        if (socket.destroyed || socket.writableFinished) { resolve(); return; }
        const finish = () => {
          socket.removeListener('finish', finish);
          socket.removeListener('close', finish);
          socket.removeListener('error', finish);
          resolve();
        };
        socket.once('finish', finish); socket.once('close', finish); socket.once('error', finish);
        try { socket.end(payload); } catch { finish(); socket.destroy(); }
      });
    })();
    replies.add(pending);
    pending.finally(() => replies.delete(pending));
  }
  async function drainReplies() {
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => resolve(true), SHUTDOWN_REPLY_TIMEOUT_MS); });
    try {
      while (replies.size) {
        if (await Promise.race([Promise.all([...replies]).then(() => false), deadline])) {
          event('host_response_drain_timeout', { pendingResponses: replies.size });
          break;
        }
      }
    } finally { clearTimeout(timer); }
  }
  async function recordRequest(requestId) {
    if (typeof requestId !== 'string') return;
    try {
      const status = await service.invokeTool('whole_trace_status', { requestId });
      state.requests[requestId] = { requestId, status: status.status, attempts: status.attempts,
        canRepair: status.canRepair, inputHash: status.inputHash, diagnosticDirectory: status.diagnosticDirectory,
        ...(status.authoring ? { authoring: structuredClone(status.authoring) } : {}) };
    } catch { /* Failed prepares/unknown request IDs must not become sessions. */ }
  }
  async function handle(message) {
    if (!message || message.hostId !== hostId || message.token !== token) throw error('HOST_UNAUTHORIZED', 'Invalid host identity or local credential.');
    if (message.command === 'status') return publicStatus(state);
    if (message.command === 'close') {
      if (!stopping) setImmediate(() => shutdown('explicit-close', 0));
      state.state = 'closing';
      return publicStatus(state);
    }
    if (message.command !== 'call') throw error('HOST_COMMAND_INVALID', 'Expected status, close, or call.');
    if (state.state !== 'ready') throw error('HOST_CLOSING', 'Host is closing; no new operations are accepted.');
    const { operationId, tool, arguments: args = {} } = message;
    if (typeof operationId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(operationId)) throw error('HOST_OPERATION_ID_REQUIRED', 'Use a stable operationId (1..128 letters, digits, ., _, :, -) for each logical call.');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw error('HOST_ARGUMENTS_INVALID', 'arguments must be a JSON object.');
    if (!TOOLS.has(tool) || Object.hasOwn(args, 'tabId')) throw error('HOST_OFFLINE_TOOL_ONLY', 'Host accepts only list_personas, offline whole-trace prepare/author/submit/repair/status and validate_trace. App, provider generation, tabId and persona-validation directory tools are disabled.');
    const input = materialize(args);
    const digest = crypto.createHash('sha256').update(canonical({ tool, args, input })).digest('hex');
    const prior = operations.get(operationId);
    if (prior) {
      if (prior.digest !== digest) throw error('HOST_OPERATION_CONFLICT', 'operationId payload or input file changed; do not alter an uncertain submission.');
      return prior.promise;
    }
    if (operations.size >= 10000) throw error('HOST_OPERATION_LIMIT', 'Host operation limit reached; no operation was executed.');
    const requestId = typeof args.requestId === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(args.requestId) ? args.requestId : null;
    state.operations[operationId] = { operationId, tool, payloadHash: digest, requestId, status: 'queued', queuedAt: now() };
    event('operation_queued', state.operations[operationId]);
    const promise = tail.then(async () => {
      const record = state.operations[operationId];
      record.status = 'running'; record.startedAt = now(); event('operation_started', { operationId, tool, requestId: record.requestId });
      try {
        const result = await service.invokeTool(tool, input);
        await recordRequest(result?.requestId ?? input.requestId);
        Object.assign(record, { status: 'completed', completedAt: now(), requestId: result?.requestId ?? record.requestId });
        // Keep accuracy counts and rule names separate from private authored
        // reasons and state values. Delivery retries reuse this same event.
        if (tool === 'append_whole_trace_decision' && typeof result?.accepted === 'boolean')
          event(result.accepted ? 'authoring_decision_accepted' : 'authoring_decision_rejected', {
            operationId, requestId: record.requestId, decisionIndex: result.decisionIndex,
            decisionNumber: result.decisionNumber, accepted: result.accepted,
            ...(result.code ? { errorCode: result.code } : {}),
            rejectionRules: [...new Set((result.issues ?? []).map(issue => issue.rule))],
            ...(result.authoring ? { authoring: structuredClone(result.authoring) } : {}),
          });
        event('operation_completed', { operationId, tool, requestId: record.requestId,
          ...(result?.authoring ? { authoring: structuredClone(result.authoring) } : {}) });
        return result;
      } catch (cause) {
        await recordRequest(input.requestId);
        Object.assign(record, { status: 'failed', completedAt: now(), errorCode: cause.code ?? 'HOST_TOOL_ERROR' });
        event('operation_failed', { operationId, tool, requestId: record.requestId, errorCode: record.errorCode });
        throw cause;
      }
    });
    operations.set(operationId, { digest, promise });
    tail = promise.catch(() => {});
    return promise;
  }
  function shutdown(reason, exitCode) {
    if (stopping) return stopping;
    state.state = 'closing'; state.closeReason = reason; event('host_closing', { reason });
    stopping = (async () => {
      const listenerClosed = new Promise(resolve => server.close(resolve));
      let closeError;
      try { await tail; await service.close(); } catch (cause) { closeError = cause; }
      // A close acknowledgement means shutdown was accepted, not that service
      // cleanup succeeded. Flush it even when cleanup fails. An unresponsive
      // reader cannot retain the host indefinitely after queued work completes.
      await drainReplies();
      for (const socket of sockets) socket.destroy();
      await listenerClosed;
      fs.rmSync(runtimeDirectory, { recursive: true, force: true });
      if (closeError) throw closeError;
      state.state = 'closed'; state.endedAt = now(); state.exitCode = exitCode;
      event('host_closed', { reason, exitCode });
      process.exitCode = exitCode;
    })().catch(cause => {
      state.state = 'failed'; state.endedAt = now(); state.exitCode = 1;
      event('host_shutdown_failed', { errorCode: cause.code ?? 'HOST_TOOL_ERROR' });
      for (const socket of sockets) socket.destroy();
      fs.rmSync(runtimeDirectory, { recursive: true, force: true });
      process.exitCode = 1;
    });
    return stopping;
  }
  for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.once(signal, () => shutdown(signal, exitCode));
  process.once('exit', exitCode => {
    if (!state.endedAt) { state.state = 'failed'; state.endedAt = now(); state.exitCode = exitCode; event('host_exit_without_close', { exitCode }); }
    fs.rmSync(runtimeDirectory, { recursive: true, force: true });
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); }); }
  catch (cause) {
    state.state = 'failed'; state.endedAt = now(); state.exitCode = 1;
    event('host_start_failed', { errorCode: cause.code ?? 'HOST_START_FAILED' });
    throw cause;
  }
  fs.chmodSync(socketPath, 0o600);
  fs.writeFileSync(path.join(directory, 'connection.json'), JSON.stringify({ hostId, socketPath, token }) + '\n', { flag: 'wx', mode: 0o600 });
  state.state = 'ready'; event('host_ready');
}

module.exports = { startHost, callHost, hostStatus, closeHost, runHost, TOOLS };
if (require.main === module) {
  const [mode, directory, hostId] = process.argv.slice(2);
  if (mode !== '--run' || !directory || !hostId) throw new Error('Use cli.cjs host-start <new-directory>.');
  runHost(directory, hostId).catch(cause => { process.stderr.write(`${cause.code ?? 'HOST_FATAL'}: ${cause.message}\n`); process.exitCode = 1; });
}
