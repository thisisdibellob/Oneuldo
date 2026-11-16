'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
require('../runtime.cjs');
const { serveMailbox, callMailbox, readMailboxStatus, abortMailbox } = require('../whole-trace-mailbox.cjs');
const { createService } = require('../server.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');

const mailboxCli = path.resolve(__dirname, '../whole-trace-mailbox.cjs');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message = 'mailbox condition') {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await pause(20);
  }
  throw new Error(`Timed out waiting for ${message}`);
}
function runCli(args) {
  const child = spawn(process.execPath, [mailboxCli, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  // The input channel ends immediately, just as an actor client can disappear.
  // It must not own or retire the independently running prepared request.
  child.stdin.end();
  return { child, exited, stderr: () => stderr };
}
async function fixture(t, { restrictOperations = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-mailbox-test-'));
  const ownerDirectory = path.join(directory, 'owner');
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'mailbox-regression',
    objectives: [{ productId: 'milk', quantity: 1 }], environment: { cashierCount: 2 } }));
  const prepareArguments = { personaId: 'mild-intellectual-disability-adult', seed: 'mailbox-regression',
    snapshot, outputPath: path.join(directory, 'trace.json'), maxRepairs: 0 };
  const prepareFile = path.join(directory, 'prepare.json');
  fs.writeFileSync(prepareFile, JSON.stringify({ tool: 'prepare_whole_trace', arguments: prepareArguments }));
  const owner = runCli(['serve', ownerDirectory, '--prepare-file', prepareFile, ...(restrictOperations ? ['--operation-root', directory] : [])]);
  t.after(async () => {
    if (owner.child.exitCode === null && owner.child.signalCode === null) {
      try { await abortMailbox(ownerDirectory, 'test cleanup'); } catch { owner.child.kill('SIGTERM'); }
      try { await until(() => owner.child.exitCode !== null || owner.child.signalCode !== null, 'owner shutdown'); }
      catch { owner.child.kill('SIGKILL'); }
    }
    await owner.exited;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await until(async () => {
    if (owner.child.exitCode !== null || owner.child.signalCode !== null)
      throw new Error(`Owner exited before preparing: ${owner.stderr()}`);
    if (!fs.existsSync(path.join(ownerDirectory, 'status.json'))) return false;
    return (await readMailboxStatus(ownerDirectory)).state === 'ready';
  }, 'prepared mailbox');
  const prepared = json(path.join(ownerDirectory, 'prepare-response.json'));
  let fileNumber = 0;
  const cliCall = async operation => {
    const operationFile = path.join(directory, `client-${++fileNumber}.json`);
    fs.writeFileSync(operationFile, JSON.stringify(operation));
    const client = runCli(['call', ownerDirectory, '--operation-file', operationFile]);
    const response = await client.exited;
    assert.equal(response.code, 0, response.stderr);
    return JSON.parse(response.stdout);
  };
  return { directory, ownerDirectory, owner, prepared, prepareArguments, cliCall };
}
const operation = (operationId, tool, args = {}) => ({ operationId, tool, arguments: args });
function draft(choiceId = 'control/pause') {
  const finish = choiceId === 'control/giveUp';
  return { choiceRef: { choiceId }, delayMs: 600, reason: '작성자가 선택한 행동을 실행한다',
    basis: { intent: finish ? 'finish' : 'rest', goalId: null, memoryUses: [] },
    actorState: { activity: finish ? 'finish' : 'rest', task: finish ? '장보기를 마친다' : '현재 자리에서 쉰다',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } };
}

test('client EOF and completed clients leave one prepared owner alive; retries do not duplicate decisions or submission', async t => {
  const f = await fixture(t);
  const initial = await readMailboxStatus(f.ownerDirectory);
  assert.equal(initial.requestStatus.status, 'prepared');
  assert.equal(initial.requestId, f.prepared.requestId);
  assert.equal(initial.completionVerified, false);
  const begin = await f.cliCall(operation('begin', 'begin_whole_trace_authoring'));
  assert.equal(begin.requestId, f.prepared.requestId);
  assert.equal(f.owner.child.exitCode, null, 'The exited begin client does not own the prepared request');

  const append = operation('append-one', 'append_whole_trace_decision', { decision: draft() });
  const [first, retry] = await Promise.all([callMailbox(f.ownerDirectory, append), callMailbox(f.ownerDirectory, append)]);
  assert.equal(first.accepted, true);
  assert.deepEqual(retry, first);
  const live = await callMailbox(f.ownerDirectory, operation('status-one', 'whole_trace_status'));
  assert.equal(live.requestId, f.prepared.requestId);
  assert.equal(live.authoring.attemptedDecisionCount, 1);
  assert.equal(live.authoring.decisions[0].attempts, 1);
  assert.equal(live.attempts, 0);
  await assert.rejects(callMailbox(f.ownerDirectory, { ...append, arguments: { decision: draft('control/giveUp') } }),
    /operation|payload|different|conflict/i);

  assert.equal((await f.cliCall(operation('append-two', 'append_whole_trace_decision',
    { decision: draft('control/giveUp') }))).accepted, true);
  const finished = await f.cliCall(operation('inspect-finish', 'finish_whole_trace_authoring'));
  const finalOperation = operation('finish-submit', 'finish_and_submit_whole_trace');
  const submitted = await f.cliCall(finalOperation);
  assert.equal(submitted.status, 'complete');
  assert.equal(submitted.complete, true);
  assert.equal(submitted.terminal, true);
  assert.equal(submitted.requestStatus.status, 'complete');
  assert.equal(submitted.submission.validation.valid, true);
  assert.equal(submitted.requestStatus.attempts, 1);
  assert.ok(fs.existsSync(submitted.submission.outputPath));
  const candidateBytes = fs.readFileSync(path.join(f.ownerDirectory, 'candidate.json'), 'utf8');
  assert.deepEqual(JSON.parse(candidateBytes), finished.candidate, 'Only the finish candidate is serialized, with no preceding JSONL null values');
  assert.equal(JSON.parse(candidateBytes).decisions.length, 2);

  await until(async () => (await readMailboxStatus(f.ownerDirectory)).state === 'closed', 'verified owner completion');
  const closed = await readMailboxStatus(f.ownerDirectory);
  assert.equal(closed.completionVerified, true);
  assert.equal(closed.requestStatus.status, 'complete');
  assert.deepEqual(await callMailbox(f.ownerDirectory, finalOperation), submitted, 'A lost final response can be recovered after the owner closes');
  assert.equal((await callMailbox(f.ownerDirectory, operation('closed-status', 'whole_trace_status'))).attempts, 1);
  assert.deepEqual(fs.readFileSync(path.join(f.ownerDirectory, 'candidate.json'), 'utf8'), candidateBytes);
});

test('a client killed after queueing an append can redeliver the same operation without creating another request', async t => {
  const f = await fixture(t);
  await callMailbox(f.ownerDirectory, operation('begin', 'begin_whole_trace_authoring'));
  const append = operation('lost-client', 'append_whole_trace_decision', { decision: draft() });
  const operationFile = path.join(f.directory, 'lost-client.json');
  fs.writeFileSync(operationFile, JSON.stringify(append));
  const client = runCli(['call', f.ownerDirectory, '--operation-file', operationFile]);
  await until(() => fs.existsSync(path.join(f.ownerDirectory, 'commands', 'lost-client.json')), 'queued append');
  if (client.child.exitCode === null) client.child.kill('SIGTERM');
  await client.exited;
  const recovered = await callMailbox(f.ownerDirectory, append);
  assert.equal(recovered.accepted, true);
  assert.equal(recovered.requestId, f.prepared.requestId);
  const status = await callMailbox(f.ownerDirectory, operation('status', 'whole_trace_status'));
  assert.equal(status.authoring.attemptedDecisionCount, 1);
  assert.equal(status.authoring.decisions[0].attempts, 1);
  assert.equal(status.status, 'prepared');
  assert.equal(f.owner.child.exitCode, null);
});

test('conflicting candidate bytes remain intact and cannot make a prepared owner report completion or close', async t => {
  const f = await fixture(t);
  await callMailbox(f.ownerDirectory, operation('begin', 'begin_whole_trace_authoring'));
  assert.equal((await callMailbox(f.ownerDirectory, operation('quit', 'append_whole_trace_decision',
    { decision: draft('control/giveUp') }))).accepted, true);
  const candidatePath = path.join(f.ownerDirectory, 'candidate.json');
  const corrupt = 'null\nnull\n{"candidateVersion":"7"}\n';
  fs.writeFileSync(candidatePath, corrupt, { flag: 'wx' });
  await assert.rejects(callMailbox(f.ownerDirectory, operation('finish-submit', 'finish_and_submit_whole_trace')));
  assert.equal(fs.readFileSync(candidatePath, 'utf8'), corrupt);
  const status = await callMailbox(f.ownerDirectory, operation('still-prepared', 'whole_trace_status'));
  assert.equal(status.requestId, f.prepared.requestId);
  assert.equal(status.status, 'prepared');
  assert.equal(status.attempts, 0);
  const ownerStatus = await readMailboxStatus(f.ownerDirectory);
  assert.equal(ownerStatus.state, 'ready');
  assert.equal(ownerStatus.completionVerified, false);
  assert.equal(f.owner.child.exitCode, null);
  assert.equal(fs.existsSync(f.prepareArguments.outputPath), false);
  await abortMailbox(f.ownerDirectory, 'preserved malformed candidate fixture');
  await until(async () => (await readMailboxStatus(f.ownerDirectory)).state === 'interrupted', 'supervisor abort receipt');
  assert.equal((await readMailboxStatus(f.ownerDirectory)).requestStatus.status, 'prepared');
});

test('partial commands and forbidden actor controls cannot replace or close the bound request', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.ownerDirectory, 'commands', 'not-published.json.partial'), '{');
  for (const invalid of [
    operation('close', 'close'), operation('abort', 'abort'), operation('prepare', 'prepare_whole_trace', f.prepareArguments),
    operation('override', 'whole_trace_status', { requestId: 'another-request' }),
    { ...operation('top-override', 'whole_trace_status'), requestId: f.prepared.requestId },
    operation('file-repair', 'repair_whole_trace', { repairFilePath: path.join(f.directory, 'do-not-open.json') }),
    operation('../escape', 'whole_trace_status'),
  ]) await assert.rejects(callMailbox(f.ownerDirectory, invalid));
  const status = await callMailbox(f.ownerDirectory, operation('live-status', 'whole_trace_status'));
  assert.equal(status.requestId, f.prepared.requestId);
  assert.equal(status.status, 'prepared');
  assert.equal(status.attempts, 0);
  assert.equal((await readMailboxStatus(f.ownerDirectory)).state, 'ready');
  assert.equal(f.owner.child.exitCode, null);
  assert.equal(fs.existsSync(path.join(f.ownerDirectory, 'responses', 'not-published.json')), false);
  const begun = await callMailbox(f.ownerDirectory, operation('begin', 'begin_whole_trace_authoring'));
  assert.equal(begun.authoring.attemptedDecisionCount, 0);
});

test('SIGTERM records an interrupted prepared request instead of inventing a completed candidate', async t => {
  const f = await fixture(t);
  await callMailbox(f.ownerDirectory, operation('begin', 'begin_whole_trace_authoring'));
  await callMailbox(f.ownerDirectory, operation('pause', 'append_whole_trace_decision', { decision: draft() }));
  f.owner.child.kill('SIGTERM');
  await f.owner.exited;
  const status = await readMailboxStatus(f.ownerDirectory);
  assert.equal(status.state, 'interrupted');
  assert.equal(status.requestStatus.requestId, f.prepared.requestId);
  assert.equal(status.requestStatus.status, 'prepared');
  assert.equal(status.requestStatus.authoring.attemptedDecisionCount, 1);
  assert.equal(status.requestStatus.attempts, 0);
  assert.equal(status.completionVerified, false);
  assert.equal(fs.existsSync(path.join(f.ownerDirectory, 'candidate.json')), false);
  assert.equal(fs.existsSync(f.prepareArguments.outputPath), false);
});

test('unfinished finalization publishes the preserved technical failure and closes the owner without adding an ending', async t => {
  const f = await fixture(t);
  const begun = await callMailbox(f.ownerDirectory, operation('begin', 'begin_whole_trace_authoring'));
  const walk = begun.menu.choiceIds.find(id => id.startsWith('walk/'));
  const input = draft(walk);
  input.basis.intent = 'explore'; input.actorState.activity = 'orient';
  const accepted = await callMailbox(f.ownerDirectory, operation('walk', 'append_whole_trace_decision', { decision: input }));
  assert.equal(accepted.accepted, true);
  const finalization = operation('premature-finish', 'finish_and_submit_whole_trace');
  await assert.rejects(callMailbox(f.ownerDirectory, finalization), error =>
    error.code === 'AUTHORING_INCOMPLETE_FINALIZATION' && error.requestStatus.status === 'failed');
  await until(async () => (await readMailboxStatus(f.ownerDirectory)).state === 'closed', 'failed owner close');
  const closed = await readMailboxStatus(f.ownerDirectory);
  assert.equal(closed.completionVerified, false);
  assert.equal(closed.requestStatus.status, 'failed');
  assert.equal(closed.requestStatus.attempts, 0);
  assert.equal(closed.requestStatus.authoring.decisions.length, 1);
  const receipt = json(closed.requestStatus.result.failurePath);
  assert.deepEqual(receipt.acceptedCandidate.decisions, [accepted.decision]);
  assert.equal(fs.existsSync(path.join(f.ownerDirectory, 'candidate.json')), false);
  assert.equal(fs.existsSync(path.join(f.ownerDirectory, 'completion.json')), false);
  assert.equal(fs.existsSync(f.prepareArguments.outputPath), false);
  assert.equal((await f.owner.exited).code, 0, 'Owner retires normally after recording an engine failure');
  await assert.rejects(callMailbox(f.ownerDirectory, operation('late-quit', 'append_whole_trace_decision',
    { decision: draft('control/giveUp') })), error => error.code === 'MAILBOX_UNAVAILABLE');
  await assert.rejects(callMailbox(f.ownerDirectory, finalization), error =>
    error.code === 'AUTHORING_INCOMPLETE_FINALIZATION', 'The original failed response remains recoverable after owner exit');
});

for (const committed of [false, true]) test(`a ${committed ? 'lost submit response' : 'pre-submit transport failure'} preserves the same request for verified identical-candidate redelivery`, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-mailbox-redelivery-'));
  const ownerDirectory = path.join(directory, 'owner');
  const actual = createService();
  let injectFailure = true, submitCalls = 0, closeCalls = 0;
  const service = {
    async invokeTool(tool, args) {
      if (tool === 'submit_whole_trace') {
        submitCalls++;
        if (injectFailure) {
          injectFailure = false;
          if (committed) await actual.invokeTool(tool, args);
          throw Object.assign(new Error('injected delivery response failure'), { code: 'FIXTURE_DELIVERY_FAILURE' });
        }
      }
      return actual.invokeTool(tool, args);
    },
    async close() { closeCalls++; await actual.close(); },
  };
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'mailbox-redelivery',
    objectives: [{ productId: 'milk', quantity: 1 }], environment: { cashierCount: 2 } }));
  const owner = serveMailbox({ directory: ownerDirectory, service, pollIntervalMs: 5,
    prepareArguments: { personaId: 'mild-intellectual-disability-adult', seed: 'mailbox-redelivery',
      snapshot, outputPath: path.join(directory, 'trace.json'), maxRepairs: 0 } });
  // Keep unexpected runner failures observable without an unhandled rejection.
  owner.catch(() => {});
  t.after(async () => {
    try { await abortMailbox(ownerDirectory, 'test cleanup'); } catch { /* Startup may have failed. */ }
    await owner;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await until(() => fs.existsSync(path.join(ownerDirectory, 'status.json'))
    && readMailboxStatus(ownerDirectory).state === 'ready', 'in-process prepared owner');
  const prepared = json(path.join(ownerDirectory, 'prepare-response.json'));
  await callMailbox(ownerDirectory, operation('begin', 'begin_whole_trace_authoring'));
  assert.equal((await callMailbox(ownerDirectory, operation('quit', 'append_whole_trace_decision',
    { decision: draft('control/giveUp') }))).accepted, true);
  const failedDelivery = operation('first-delivery', 'finish_and_submit_whole_trace');
  await assert.rejects(callMailbox(ownerDirectory, failedDelivery), { code: 'FIXTURE_DELIVERY_FAILURE' });
  const preserved = readMailboxStatus(ownerDirectory);
  assert.equal(preserved.state, 'ready');
  assert.equal(preserved.completionVerified, false, 'An exception, even after commit, is not a verified receipt');
  assert.equal(preserved.requestStatus.requestId, prepared.requestId);
  assert.equal(preserved.requestStatus.status, committed ? 'complete' : 'prepared');
  assert.equal(preserved.requestStatus.attempts, committed ? 1 : 0);
  assert.equal(closeCalls, 0);
  const candidatePath = path.join(ownerDirectory, 'candidate.json');
  const bytes = fs.readFileSync(candidatePath);
  await assert.rejects(callMailbox(ownerDirectory, failedDelivery), { code: 'FIXTURE_DELIVERY_FAILURE' });
  assert.equal(submitCalls, 1, 'Re-reading a confirmed operation error does not silently execute it again');

  // A confirmed transport error permits another delivery operation, not another
  // prepared request, actor decision, or candidate. The engine checks identity.
  const completed = await callMailbox(ownerDirectory, operation('redelivery', 'finish_and_submit_whole_trace'));
  assert.equal(completed.complete, true);
  assert.equal(completed.requestStatus.requestId, prepared.requestId);
  assert.equal(completed.requestStatus.attempts, 1);
  assert.equal(completed.submission.validation.valid, true);
  assert.deepEqual(fs.readFileSync(candidatePath), bytes);
  assert.equal(submitCalls, 2);
  await owner;
  assert.equal(closeCalls, 1);
  assert.equal(readMailboxStatus(ownerDirectory).completionVerified, true);
});

test('CLI calls save exact independent input/stdout/stderr/exit receipts on success, conflict and invalid JSON', async t => {
  const f = await fixture(t);
  const file = path.join(f.directory, 'exact.json');
  const inputs = [JSON.stringify(operation('receipt-begin', 'begin_whole_trace_authoring'), null, 4) + '\n',
    JSON.stringify(operation('receipt-begin', 'whole_trace_status')), '{invalid'];
  for (const [i, input] of inputs.entries()) {
    fs.writeFileSync(file, input);
    const before = new Set(fs.existsSync(path.join(f.ownerDirectory, 'calls')) ? fs.readdirSync(path.join(f.ownerDirectory, 'calls')) : []);
    const response = await runCli(['call', f.ownerDirectory, '--operation-file', file]).exited;
    assert.equal(response.code, i ? 1 : 0);
    const names = fs.readdirSync(path.join(f.ownerDirectory, 'calls')).filter(name => !before.has(name));
    assert.equal(names.length, 1);
    const dir = path.join(f.ownerDirectory, 'calls', names[0]);
    assert.equal(fs.readFileSync(path.join(dir, 'input.json'), 'utf8'), input);
    assert.equal(fs.readFileSync(path.join(dir, 'stdout.log'), 'utf8'), response.stdout);
    assert.equal(fs.readFileSync(path.join(dir, 'stderr.log'), 'utf8'), response.stderr);
    assert.equal(Number(fs.readFileSync(path.join(dir, 'exit-code'), 'utf8')), response.code);
    assert.equal(json(path.join(dir, 'completion.json')).exitCode, response.code);
  }
});


test('optional operation root blocks outside inputs and symlink escapes before reading, while default owners remain compatible', async t => {
  const restricted = await fixture(t, { restrictOperations: true });
  const legacy = await fixture(t);
  assert.equal(readMailboxStatus(restricted.ownerDirectory).operationRoot, fs.realpathSync(restricted.directory));
  assert.equal(Object.hasOwn(readMailboxStatus(legacy.ownerDirectory), 'operationRoot'), false);
  const outside = path.join(legacy.directory, 'external.json');
  fs.writeFileSync(outside, JSON.stringify(operation('outside-begin', 'begin_whole_trace_authoring')));
  const link = path.join(restricted.directory, 'escape.json');
  fs.symlinkSync(outside, link);
  for (const file of [outside, link]) {
    const response = await runCli(['call', restricted.ownerDirectory, '--operation-file', file]).exited;
    assert.equal(response.code, 1);
    assert.match(response.stderr, /MAILBOX_OPERATION_OUTSIDE_SLOT/);
  }
  assert.equal(fs.readdirSync(path.join(restricted.ownerDirectory, 'commands')).length, 0);
  for (const name of fs.readdirSync(path.join(restricted.ownerDirectory, 'calls'))) {
    const receipt = path.join(restricted.ownerDirectory, 'calls', name);
    assert.equal(fs.existsSync(path.join(receipt, 'input.json')), false, 'do not read or copy outside bytes');
    assert.equal(json(path.join(receipt, 'completion.json')).exitCode, 1);
    assert.match(fs.readFileSync(path.join(receipt, 'stderr.log'), 'utf8'), /MAILBOX_OPERATION_OUTSIDE_SLOT/);
    assert.equal(fs.readFileSync(path.join(receipt, 'stdout.log'), 'utf8'), '');
    assert.equal(fs.readFileSync(path.join(receipt, 'exit-code'), 'utf8'), '1\n');
  }
  const accepted = await restricted.cliCall(operation('inside-begin', 'begin_whole_trace_authoring'));
  assert.equal(accepted.requestId, restricted.prepared.requestId);
  // No restriction was configured for the legacy owner; the same external file works.
  const defaultResponse = await runCli(['call', legacy.ownerDirectory, '--operation-file', path.join(restricted.directory, 'client-1.json')]).exited;
  assert.equal(defaultResponse.code, 0, defaultResponse.stderr);
});
