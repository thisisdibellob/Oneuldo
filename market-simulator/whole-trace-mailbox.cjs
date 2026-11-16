#!/usr/bin/env node
'use strict';
// Socket-free ownership of ONE prepared request. Files are transport/audit
// records, never restorable simulator sessions or an actor policy.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { finishAndSubmit } = require('./whole-trace-delivery.cjs');
const ALLOWED = new Set(['begin_whole_trace_authoring', 'append_whole_trace_decision',
  'whole_trace_authoring_menu', 'finish_whole_trace_authoring', 'whole_trace_status',
  'repair_whole_trace', 'finish_and_submit_whole_trace']);
const MAX_BYTES = 4 * 1024 * 1024;
const now = () => new Date().toISOString();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fail = (code, message) => Object.assign(new Error(message), { code });
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (Buffer.byteLength(text) > MAX_BYTES) throw fail('MAILBOX_SIZE', 'JSON exceeds 4 MiB');
  return JSON.parse(text);
}
function publishNew(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.partial`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    // link is an atomic exclusive publication; rename would overwrite a race.
    fs.linkSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function replaceStatus(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.partial`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, file);
}
function operation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['operationId', 'tool', 'arguments'].includes(key))
    || typeof input.operationId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(input.operationId)
    || !ALLOWED.has(input.tool) || !input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments))
    throw fail('MAILBOX_OPERATION', 'Expected {operationId,tool,arguments} for this prepared authoring request');
  for (const key of Object.keys(input.arguments)) {
    if (key === 'requestId' || key === 'hostDirectory' || /(?:File|FilePath|FilePaths|Directory)$/.test(key))
      throw fail('MAILBOX_BINDING', 'Request identity and candidate files belong to the owner; use inline authoring/repair data');
  }
  if (input.tool === 'finish_and_submit_whole_trace' && Object.keys(input.arguments).length)
    throw fail('MAILBOX_BINDING', 'finish_and_submit_whole_trace takes empty arguments');
  const normalized = JSON.parse(JSON.stringify(input));
  if (Buffer.byteLength(JSON.stringify(normalized)) > MAX_BYTES) throw fail('MAILBOX_SIZE', 'Operation exceeds 4 MiB');
  return { ...normalized, digest: crypto.createHash('sha256').update(canonical(normalized)).digest('hex') };
}
function unwrap(record, expected) {
  if (record.digest !== expected.digest) throw fail('MAILBOX_OPERATION_CONFLICT', 'operationId was already used with different input');
  if (!record.ok) throw Object.assign(fail(record.error.code, record.error.message), {
    requestStatus: record.error.requestStatus, operationId: record.operationId });
  return record.result;
}
function readMailboxStatus(directory) {
  const status = readJson(path.join(path.resolve(directory), 'status.json'));
  let alive = false;
  try { process.kill(status.pid, 0); alive = true; } catch (error) { if (error.code === 'EPERM') alive = true; }
  return { ...status, available: status.state === 'ready' && alive, ownerAlive: alive, resumable: false };
}
async function callMailbox(directory, input, { timeoutMs = 300000 } = {}) {
  directory = path.resolve(directory);
  const op = operation(input), command = path.join(directory, 'commands', `${op.operationId}.json`);
  const response = path.join(directory, 'responses', `${op.operationId}.json`);
  if (fs.existsSync(response)) return unwrap(readJson(response), op);
  const status = readMailboxStatus(directory);
  if (!status.available) {
    if (op.tool === 'whole_trace_status' && status.requestStatus) return status.requestStatus;
    throw fail('MAILBOX_UNAVAILABLE', `Owner is ${status.state}; this request cannot be recreated or restored`);
  }
  try { publishNew(command, op); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (readJson(command).digest !== op.digest) throw fail('MAILBOX_OPERATION_CONFLICT', 'operationId was already used with different input');
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(response)) return unwrap(readJson(response), op);
    const current = readMailboxStatus(directory);
    if (!current.available) {
      // The owner publishes the response before its close receipt.
      if (fs.existsSync(response)) return unwrap(readJson(response), op);
      throw fail('MAILBOX_UNAVAILABLE', `Owner is ${current.state}; inspect its status without creating a replacement request`);
    }
    await pause(25);
  }
  throw fail('MAILBOX_TIMEOUT', 'Response not yet observed; the owner remains alive. Retry the SAME operationId and unchanged input');
}
function abortMailbox(directory, reason) {
  if (typeof reason !== 'string' || !reason.trim()) throw fail('MAILBOX_ABORT_REASON', 'Supervisor abort requires a reason');
  directory = path.resolve(directory);
  const status = readMailboxStatus(directory);
  if (!status.available) return status;
  publishNew(path.join(directory, 'supervisor-abort.json'), { reason, requestedAt: now() });
  return { requested: true, requestId: status.requestId };
}
async function serveMailbox({ directory, prepareArguments, service, pollIntervalMs = 25, operationRoot }) {
  directory = path.resolve(directory);
  // Optional transport containment; no change to prepared inputs or the default owner.
  const permittedOperationRoot = operationRoot === undefined ? undefined : fs.realpathSync(path.resolve(operationRoot));
  fs.mkdirSync(directory, { mode: 0o700 }); // Never reuse an old owner or its results.
  for (const sub of ['commands', 'responses']) fs.mkdirSync(path.join(directory, sub), { mode: 0o700 });
  service ??= require('./server.cjs').createService();
  const invokeTool = (tool, args) => service.invokeTool(tool, args);
  const state = { version: 1, ownerId: crypto.randomUUID(), pid: process.pid, state: 'starting',
    createdAt: now(), updatedAt: now(), requestId: null, requestStatus: null, completionVerified: false,
    ...(permittedOperationRoot ? { operationRoot: permittedOperationRoot } : {}) };
  const persist = () => { state.updatedAt = now(); replaceStatus(path.join(directory, 'status.json'), state); };
  const event = value => fs.appendFileSync(path.join(directory, 'events.jsonl'), JSON.stringify({ time: now(), ...value }) + '\n', { mode: 0o600 });
  let interrupted;
  const signal = name => { interrupted ??= `signal:${name}`; };
  const onTerm = () => signal('SIGTERM'), onInt = () => signal('SIGINT');
  process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
  persist();
  const requestStatus = async () => {
    if (state.requestId) state.requestStatus = await invokeTool('whole_trace_status', { requestId: state.requestId });
    return state.requestStatus;
  };
  async function confirmCompletion() {
    const status = await requestStatus(), result = status.result;
    if (status.status !== 'complete' || result?.validation?.valid !== true
      || !result.outputPath || !result.snapshotFilePath || !fs.existsSync(result.outputPath) || !fs.existsSync(result.snapshotFilePath))
      throw fail('MAILBOX_COMPLETION_UNCONFIRMED', 'Complete status, valid result and saved trace/snapshot are all required');
    const validation = await invokeTool('validate_trace', { traceFilePath: result.outputPath, snapshotFilePath: result.snapshotFilePath });
    if (!validation.valid) throw fail('MAILBOX_COMPLETION_INVALID', 'Saved trace failed independent validation');
    state.completionVerified = true;
    publishNew(path.join(directory, 'completion.json'), { confirmedAt: now(), requestId: state.requestId, requestStatus: status, validation });
  }
  try {
    const prepared = await invokeTool('prepare_whole_trace', structuredClone(prepareArguments));
    state.requestId = prepared.requestId;
    publishNew(path.join(directory, 'prepare-response.json'), prepared);
    await requestStatus(); state.state = 'ready'; persist(); event({ type: 'ready', requestId: state.requestId });
    while (state.state === 'ready') {
      const abortPath = path.join(directory, 'supervisor-abort.json');
      if (interrupted || fs.existsSync(abortPath)) {
        state.interruptionReason = interrupted ?? readJson(abortPath).reason;
        await requestStatus(); state.state = 'interrupted'; persist(); event({ type: 'interrupted', reason: state.interruptionReason }); break;
      }
      const pending = fs.readdirSync(path.join(directory, 'commands')).filter(name => name.endsWith('.json')
        && !fs.existsSync(path.join(directory, 'responses', name))).sort((a, b) =>
          fs.statSync(path.join(directory, 'commands', a)).mtimeMs - fs.statSync(path.join(directory, 'commands', b)).mtimeMs || a.localeCompare(b));
      if (!pending.length) { await pause(pollIntervalMs); continue; }
      const name = pending[0], submitted = readJson(path.join(directory, 'commands', name));
      const { digest: suppliedDigest, ...input } = submitted, op = operation(input);
      if (name !== `${op.operationId}.json` || suppliedDigest !== op.digest)
        throw fail('MAILBOX_TAMPERED_COMMAND', 'Published operation identity changed');
      let record, shouldClose = false;
      try {
        const result = op.tool === 'finish_and_submit_whole_trace'
          ? await finishAndSubmit({ invokeTool, requestId: state.requestId, candidateFilePath: path.join(directory, 'candidate.json') })
          : await invokeTool(op.tool, { ...op.arguments, requestId: state.requestId });
        await requestStatus();
        if ((op.tool === 'finish_and_submit_whole_trace' && result.complete)
          || (op.tool === 'repair_whole_trace' && result.status === 'complete')) {
          await confirmCompletion(); shouldClose = true;
        } else if (state.requestStatus.status === 'failed'
          || state.requestStatus.status === 'invalid' && !state.requestStatus.canRepair) shouldClose = true;
        record = { operationId: op.operationId, digest: op.digest, ok: true, result };
      } catch (error) {
        try { await requestStatus(); } catch { /* Keep the original transport failure. */ }
        record = { operationId: op.operationId, digest: op.digest, ok: false,
          error: { code: error.code ?? 'MAILBOX_TOOL_ERROR', message: error.message, requestStatus: state.requestStatus } };
        // A confirmed engine failure is final even when the failing operation
        // throws. Preserve its response first, then retire this owner. Delivery
        // exceptions on prepared/complete requests still keep the owner alive.
        shouldClose = state.requestStatus?.status === 'failed'
          || state.requestStatus?.status === 'invalid' && !state.requestStatus.canRepair;
        // A delivery exception is not a completion receipt, even if the engine
        // committed. Keep the owner for an identical-candidate delivery retry.
      }
      publishNew(path.join(directory, 'responses', name), record);
      event({ type: 'operation', operationId: op.operationId, tool: op.tool, ok: record.ok,
        requestStatus: state.requestStatus?.status, completionVerified: state.completionVerified });
      if (shouldClose) state.state = 'closed';
      persist();
    }
  } catch (error) {
    state.state = 'failed'; state.error = { code: error.code ?? 'MAILBOX_OWNER_ERROR', message: error.message };
    try { await requestStatus(); persist(); event({ type: 'owner-failed', ...state.error }); } catch { /* preserve primary error */ }
    throw error;
  } finally {
    process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
    try {
      // Owner evidence, not an actor self-report. Never invent an ending on exit.
      const entries = fs.readdirSync(path.join(directory, 'responses')).map(name => ({
        command: readJson(path.join(directory, 'commands', name)), response: readJson(path.join(directory, 'responses', name)),
      })).filter(entry => entry.command.tool === 'append_whole_trace_decision');
      const accepted = entries.filter(entry => entry.response.ok && entry.response.result?.accepted === true).length;
      publishNew(path.join(directory, 'actor-completion.json'), { source: 'mailbox-owner', recordedAt: now(),
        status: state.completionVerified ? 'complete' : 'technical-failure', requestId: state.requestId,
        outputPath: state.completionVerified ? state.requestStatus.result.outputPath : null,
        acceptedDecisionCount: accepted, rejectionCount: entries.length - accepted,
        interruption: state.interruptionReason ?? state.error ?? null, ownerState: state.state,
        requestStatus: state.requestStatus?.status ?? null });
    } finally { await service.close(); }
  }
  return structuredClone(state);
}
// One immutable receipt per CLI invocation, including invalid JSON, rejected calls,
// cached responses and retries. Capture before publication, never rely on actor redirects.
async function recordedCall(directory, inputFile, inline) {
  const calls = path.join(path.resolve(directory), 'calls');
  fs.mkdirSync(calls, { recursive: true, mode: 0o700 });
  const receipt = path.join(calls, crypto.randomUUID());
  fs.mkdirSync(receipt, { mode: 0o700 });
  const startedAt = now();
  publishNew(path.join(receipt, 'started.json'), { startedAt, pid: process.pid,
    ...(inline ? { transport: inline.stdin ? 'stdin' : 'inline', tool: inline.tool, deliveryKey: inline.deliveryKey ?? null }
      : { inputFile: path.resolve(inputFile) }) });
  let stdout = '', stderr = '', exitCode = 0, operationId = null;
  try {
    let bytes;
    if (inline) bytes = inline.stdin ? fs.readFileSync(0) : Buffer.from(inline.json, 'utf8');
    else {
      const status = readMailboxStatus(directory);
      const resolvedInput = fs.realpathSync(path.resolve(inputFile));
      if (status.operationRoot) {
        const relative = path.relative(status.operationRoot, resolvedInput);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
          throw fail('MAILBOX_OPERATION_OUTSIDE_SLOT', `Save a new operation file inside ${status.operationRoot}; external paths and symlink escapes are not accepted`);
      }
      bytes = fs.readFileSync(resolvedInput);
    }
    fs.writeFileSync(path.join(receipt, 'input.json'), bytes, { flag: 'wx', mode: 0o600 });
    if (bytes.length > MAX_BYTES) throw fail('MAILBOX_SIZE', 'JSON exceeds 4 MiB');
    let input = JSON.parse(bytes.toString('utf8'));
    if (inline) {
      const inputSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const deliveryKey = inline.deliveryKey ?? inputSha256;
      if (typeof deliveryKey !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(deliveryKey))
        throw fail('MAILBOX_DELIVERY_KEY', 'delivery-key must be 1–128 letters, digits, dots, underscores or hyphens');
      operationId = 'inline-' + crypto.createHash('sha256').update(JSON.stringify([inline.tool, deliveryKey])).digest('hex');
      input = { operationId, tool: inline.tool, arguments: input };
      operation(input); // Validate before binding a key; never change authored arguments.
      publishNew(path.join(receipt, 'operation.json'), input);
      const bindings = path.join(path.resolve(directory), 'inline-inputs');
      fs.mkdirSync(bindings, { recursive: true, mode: 0o700 });
      const bindingFile = path.join(bindings, operationId + '.json');
      const binding = { operationId, tool: inline.tool, deliveryKey, inputSha256 };
      try { publishNew(bindingFile, binding); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (readJson(bindingFile).inputSha256 !== inputSha256)
          throw fail('MAILBOX_OPERATION_CONFLICT', 'delivery-key was already used with different input bytes; preserve the original retry');
      }
    }
    operationId = input?.operationId ?? null;
    const result = await callMailbox(directory, input);
    stdout = JSON.stringify(result, null, 2) + '\n';
  } catch (error) {
    stderr = `${error.code ?? 'ERROR'}: ${error.message}\n`;
    exitCode = 1;
  }
  fs.writeFileSync(path.join(receipt, 'stdout.log'), stdout, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(receipt, 'stderr.log'), stderr, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(receipt, 'exit-code'), `${exitCode}\n`, { flag: 'wx', mode: 0o600 });
  publishNew(path.join(receipt, 'completion.json'), { startedAt, finishedAt: now(), operationId, exitCode });
  process.stdout.write(stdout); process.stderr.write(stderr); process.exitCode = exitCode;
}

async function main() {
  const [command, directory, flag, input, ...extra] = process.argv.slice(2);
  if (command === 'call' && directory && flag === '--tool' && input) {
    const options = { tool: input };
    for (let index = 0; index < extra.length; index++) {
      const key = extra[index];
      if (key === '--stdin' && options.stdin === undefined) options.stdin = true;
      else if (key === '--json' && options.json === undefined && extra[index + 1] !== undefined) options.json = extra[++index];
      else if (key === '--delivery-key' && options.deliveryKey === undefined && extra[index + 1] !== undefined) options.deliveryKey = extra[++index];
      else throw fail('MAILBOX_USAGE', 'call DIR --tool TOOL (--stdin | --json JSON) [--delivery-key KEY]');
    }
    if (!!options.stdin === (options.json !== undefined))
      throw fail('MAILBOX_USAGE', 'Choose exactly one of --stdin or --json');
    return recordedCall(directory, undefined, options);
  }
  const hasOperationRoot = command === 'serve' && extra.length === 2 && extra[0] === '--operation-root' && extra[1];
  if (!directory || extra.length && !hasOperationRoot) throw fail('MAILBOX_USAGE', 'serve DIR --prepare-file FILE [--operation-root DIR] | call DIR --operation-file FILE | status DIR | abort DIR --reason TEXT');
  let result;
  if (command === 'serve' && flag === '--prepare-file' && input) {
    const prepared = readJson(path.resolve(input));
    if (prepared.tool !== 'prepare_whole_trace' || !prepared.arguments || Object.keys(prepared).some(key => !['tool', 'arguments'].includes(key)))
      throw fail('MAILBOX_PREPARE', 'Prepare file must be {tool:"prepare_whole_trace",arguments:<unchanged readiness arguments>}');
    result = await serveMailbox({ directory, prepareArguments: prepared.arguments, ...(hasOperationRoot ? { operationRoot: extra[1] } : {}) });
  } else if (command === 'call' && flag === '--operation-file' && input) return recordedCall(directory, input);
  else if (command === 'status' && !flag) result = readMailboxStatus(directory);
  else if (command === 'abort' && flag === '--reason' && input) result = abortMailbox(directory, input);
  else throw fail('MAILBOX_USAGE', 'Invalid mailbox arguments');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
module.exports = { serveMailbox, callMailbox, readMailboxStatus, abortMailbox };
if (require.main === module) main().catch(error => { process.stderr.write(`${error.code ?? 'ERROR'}: ${error.message}\n`); process.exitCode = 1; });
