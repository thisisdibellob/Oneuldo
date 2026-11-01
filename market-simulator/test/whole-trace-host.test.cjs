'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { startHost, callHost, hostStatus, closeHost } = require('../whole-trace-host.cjs');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { marketMission } = require('../../frontend/src/game/scenarios.ts');

const cli = path.resolve(__dirname, '../cli.cjs');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await sleep(25); }
  throw new Error('Timed out waiting for host lifecycle evidence');
}
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-host-test-'));
  const hosts = [];
  t.after(async () => {
    for (const host of hosts) {
      try { await closeHost(host); await until(() => read(path.join(host, 'status.json')).endedAt); } catch { /* A tested signal may already have stopped it. */ }
      const connection = path.join(host, 'connection.json');
      if (fs.existsSync(connection)) fs.rmSync(path.dirname(read(connection).socketPath), { recursive: true, force: true });
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'whole-host-fixture', difficulty: 'exact',
    objectives: marketMission.objectives.map(({ productId, quantity }) => ({ productId, quantity, match: 'exact' })) }), marketMission);
  return { directory, snapshot, host(name) { const destination = path.join(directory, name); hosts.push(destination); return destination; } };
}
function request(f, name = 'trace') {
  return { operationId: `prepare-${name}`, tool: 'prepare_whole_trace', arguments: {
    personaId: 'careful-checker', seed: 'host-fixture', snapshot: f.snapshot,
    outputPath: path.join(f.directory, `${name}.json`), maxRepairs: 0,
  } };
}
function candidate(requestId) {
  return { candidateVersion: '3', requestId, decisions: [{ action: { type: 'giveUp' }, delayMs: 100,
    reason: 'PRIVATE-ACTOR-REASON-not-for-lifecycle-journal', basis: { intent: 'finish', cueRefs: ['persona:goal'] },
    actorState: { activity: 'finish', task: '이번 장보기를 마친다', heldGoalIds: [], uncertainGoalIds: [], orientation: 'unfamiliar', triggerCueRefs: ['persona:goal'] } }] };
}
async function disconnectedCall(directory, message) {
  const credentials = read(path.join(directory, 'connection.json'));
  const socket = net.createConnection(credentials.socketPath);
  socket.on('error', () => {});
  await new Promise(resolve => socket.once('connect', resolve));
  await new Promise(resolve => socket.write(JSON.stringify({ ...message, ...credentials }) + '\n', resolve));
  socket.destroy();
}
async function stubHost(t, f, name, implementation) {
  const directory = f.host(name), hostId = randomUUID();
  fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'owner.json'), JSON.stringify({ hostId }));
  // Inject a deterministic offline service/transport in the child process,
  // without exposing production test options or invoking candidate generation.
  const worker = `
    const fs = require('node:fs'), net = require('node:net'), path = require('node:path');
    const [serverPath,hostPath,directory,hostId,fixtureDirectory] = process.argv.slice(1);
    ${implementation}
    require.cache[serverPath] = {id:serverPath,filename:serverPath,loaded:true,exports:{createService}};
    require(hostPath).runHost(directory,hostId).catch(error=>{process.stderr.write(error.stack);process.exitCode=1;});
  `;
  const child = spawn(process.execPath, ['-e', worker, require.resolve('../server.cjs'), require.resolve('../whole-trace-host.cjs'), directory, hostId, f.directory], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  t.after(() => child.kill('SIGKILL'));
  await until(() => fs.existsSync(path.join(directory, 'connection.json')));
  return { directory, child, exited, stderr: () => stderr };
}

test('detached CLI host survives launcher stdin EOF and an exiting client; uncertain submission retry does not consume another attempt', async t => {
  const f = fixture(t), directory = f.host('owner');
  const launched = spawnSync(process.execPath, [cli, 'host-start', directory], { input: '', encoding: 'utf8', timeout: 30000 });
  assert.equal(launched.status, 0, launched.stderr);
  const started = JSON.parse(launched.stdout);
  assert.equal(started.state, 'ready'); assert.equal(started.stdinOwnership, 'detached-ignored');
  const prepareFile = path.join(f.directory, 'prepare.json');
  fs.writeFileSync(prepareFile, JSON.stringify({ ...request(f), tool: 'prepare-whole' }));
  const preparedClient = spawnSync(process.execPath, [cli, 'host-call', directory, '--options-file', prepareFile], { input: '', encoding: 'utf8', timeout: 30000 });
  assert.equal(preparedClient.status, 0, preparedClient.stderr);
  const prepared = JSON.parse(preparedClient.stdout);
  assert.equal((await hostStatus(directory)).requests[prepared.requestId].attempts, 0);
  const submission = { operationId: 'submit-1', tool: 'submit_whole_trace', arguments: { requestId: prepared.requestId, candidate: candidate(prepared.requestId) } };
  await disconnectedCall(directory, { command: 'call', ...submission });
  await until(async () => (await hostStatus(directory)).operations['submit-1']?.status === 'completed');
  const retried = await callHost(directory, submission);
  assert.equal(retried.status, 'complete'); assert.equal(retried.metrics.planningSubmissions, 1);
  const status = await hostStatus(directory);
  assert.equal(status.pid, started.pid); assert.equal(status.requests[prepared.requestId].attempts, 1);
  const changed = structuredClone(submission); changed.arguments.candidate.decisions[0].delayMs++;
  await assert.rejects(callHost(directory, changed), { code: 'HOST_OPERATION_CONFLICT' });
  assert.equal((await hostStatus(directory)).requests[prepared.requestId].attempts, 1);
  const journal = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8');
  assert.equal(journal.includes('PRIVATE-ACTOR-REASON'), false);
  assert.equal(journal.includes(read(path.join(directory, 'connection.json')).token), false);
  assert.equal(journal.split('\n').filter(line => line.includes('operation_started') && line.includes('submit-1')).length, 1);
  assert.equal(fs.statSync(path.join(directory, 'connection.json')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  const closeClient = spawnSync(process.execPath, [cli, 'host-close', directory], { input: '', encoding: 'utf8', timeout: 10000 });
  assert.equal(closeClient.status, 0, closeClient.stderr);
  assert.equal(JSON.parse(closeClient.stdout).state, 'closing');
  const closed = await until(async () => { const value = await hostStatus(directory); return value.state === 'closed' && value; });
  assert.equal(closed.closeReason, 'explicit-close'); assert.equal(closed.exitCode, 0); assert.equal(closed.resumable, false);
  assert.equal(closed.requests[prepared.requestId].attempts, 1);
  await assert.rejects(startHost(directory), { code: 'EEXIST' });
  const replacement = f.host('new-owner'); await startHost(replacement);
  await assert.rejects(callHost(replacement, { operationId: 'old-request', tool: 'whole_trace_status', arguments: { requestId: prepared.requestId } }), /Unknown whole-trace request/);
  assert.deepEqual((await hostStatus(replacement)).requests, {});
});

test('host operation identity includes candidate file bytes and rejects changed budgets without rewriting candidates', async t => {
  const f = fixture(t), directory = f.host('owner'); await startHost(directory);
  const prepare = request(f); const prepared = await callHost(directory, prepare);
  await assert.rejects(callHost(directory, { ...prepare, arguments: { ...prepare.arguments, maxRepairs: 1 } }), { code: 'HOST_OPERATION_CONFLICT' });
  const candidateFilePath = path.join(f.directory, 'candidate.json');
  fs.writeFileSync(candidateFilePath, JSON.stringify({ candidateVersion: '7', requestId: prepared.requestId, decisions: [] }));
  const bytes = fs.readFileSync(candidateFilePath);
  const operation = { operationId: 'submit-file', tool: 'submit_whole_trace', arguments: { requestId: prepared.requestId, candidateFilePath } };
  const rejected = await callHost(directory, operation);
  assert.equal(rejected.status, 'invalid'); assert.equal(rejected.canRepair, false);
  assert.deepEqual(await callHost(directory, operation), rejected);
  assert.deepEqual(fs.readFileSync(candidateFilePath), bytes);
  fs.writeFileSync(candidateFilePath, JSON.stringify(candidate(prepared.requestId)));
  await assert.rejects(callHost(directory, operation), { code: 'HOST_OPERATION_CONFLICT' });
  const status = await callHost(directory, { operationId: 'status', tool: 'whole_trace_status', arguments: { requestId: prepared.requestId } });
  assert.equal(status.attempts, 1); assert.equal(status.canRepair, false);
  assert.equal(fs.existsSync(path.join(f.directory, 'trace.json')), false);
  await assert.rejects(callHost(directory, { operationId: 'network', tool: 'generate_trace', arguments: {} }), { code: 'HOST_OFFLINE_TOOL_ONLY' });
  await assert.rejects(callHost(directory, { operationId: 'app', tool: 'prepare_whole_trace', arguments: { tabId: 'tab' } }), { code: 'HOST_OFFLINE_TOOL_ONLY' });
  const safeCall = await callHost(directory, { operationId: 'command-override', command: 'close', tool: 'list_personas', arguments: {} });
  assert.ok(Array.isArray(safeCall.personas));
  assert.equal((await hostStatus(directory)).state, 'ready');
  const before = Object.keys((await hostStatus(directory)).operations);
  for (const key of ['snapshotFilePaths', 'learnerFile', 'trialFile', 'jobFilePath', 'generationFilePath', 'runDirectory']) {
    const value = key === 'snapshotFilePaths' ? { low: '/unused-low', high: '/unused-high' } : '/unused-file';
    await assert.rejects(callHost(directory, { operationId: `unbound-${key}`, tool: 'prepare_whole_trace', arguments: { ...prepare.arguments, [key]: value } }), { code: 'HOST_UNBOUND_FILE_OPTION' });
  }
  await assert.rejects(callHost(directory, { operationId: 'validation-run', tool: 'prepare_persona_validation', arguments: {} }), { code: 'HOST_OFFLINE_TOOL_ONLY' });
  assert.deepEqual(Object.keys((await hostStatus(directory)).operations), before);
});

test('context-bound authoring preserves current list observations and retry metrics through the host and journal', async t => {
  const f = fixture(t), directory = f.host('authoring-owner'); await startHost(directory);
  const prepared = await callHost(directory, request(f));
  const requestId = prepared.requestId, goal = prepared.bundle.worldReference.objectives[0];
  const contextFilePath = path.join(f.directory, 'context.json');
  fs.writeFileSync(contextFilePath, JSON.stringify({ hostDirectory: directory, requestId }));
  const invoke = (operationId, tool, arguments_ = {}) => {
    const result = spawnSync(process.execPath, [cli, 'author-whole', '-'], { encoding: 'utf8', timeout: 30000,
      input: JSON.stringify({ contextFilePath, operationId, tool, arguments: arguments_ }) });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const draft = (choiceId, state = {}, basis = {}) => ({ choiceRef: { choiceId }, delayMs: 100,
    reason: 'PRIVATE-ACTOR-REASON-not-for-lifecycle-journal',
    basis: { intent: 'check', goalId: null, memoryUses: [], ...basis },
    actorState: { activity: 'check', task: '현재 화면을 확인한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar', ...state } });
  const begun = await invoke('begin', 'begin_whole_trace_authoring');
  assert.equal(begun.authoring.maxRewritesPerDecision, 3);
  assert.equal(begun.menu.currentObservation.kind, 'validated-prefix-observation-v1');
  assert.equal(begun.menu.currentObservation.acceptedDecisionCount, 0);
  assert.equal(Object.hasOwn(begun.menu.currentObservation, 'readObjectives'), false);
  const readDecision = draft('control/readList');
  const readResult = await invoke('read', 'append_whole_trace_decision', { decision: readDecision });
  assert.equal(readResult.accepted, true);
  assert.equal(readResult.menu.currentObservation.acceptedDecisionCount, 1);
  assert.deepEqual(readResult.menu.currentObservation.readObjectives, prepared.bundle.worldReference.objectives);
  assert.deepEqual(readResult.menu.advisory.goalFields, []);
  assert.deepEqual(readResult.menu.advisory.openGoalIds, []);
  const held = { heldGoalIds: [goal.id] };
  const selection = draft('control/pause', { ...held, activity: 'shop', focusedGoalId: goal.id,
    taskUpdate: [{ type: 'select', goalId: goal.id }] }, { intent: 'task', goalId: goal.id,
    memoryUses: [{ goalId: goal.id, field: 'name', mode: 'current-display', value: goal.label }] });
  const selected = await invoke('select', 'append_whole_trace_decision', { decision: selection });
  assert.equal(selected.accepted, true);
  assert.equal(selected.menu.currentObservation.acceptedDecisionCount, 2);
  assert.equal(Object.hasOwn(selected.menu.currentObservation, 'readObjectives'), false);
  assert.deepEqual(await invoke('read', 'append_whole_trace_decision', { decision: readDecision }), readResult,
    'A repeated operation returns its original response with the original observation provenance');
  assert.deepEqual((await invoke('after-cached-read', 'whole_trace_authoring_menu')).menu.currentObservation,
    selected.menu.currentObservation, 'Cached delivery does not restore an expired list in the current menu');
  const invalid = draft('control/readList', { ...held, activity: 'recover' }, { intent: 'recover' });
  const rejected = await invoke('recover-invalid', 'append_whole_trace_decision', { decision: invalid });
  assert.equal(rejected.accepted, false); assert.equal(rejected.canRetry, true);
  assert.equal(rejected.decisionIndex, 2); assert.equal(rejected.decisionNumber, 3);
  assert.equal(rejected.rewrite.status, 'awaiting-rewrite');
  assert.equal(rejected.rewrite.decisionIndex, 2); assert.equal(rejected.rewrite.decisionNumber, 3);
  assert.equal(rejected.rewrite.acceptedDecisionCount, 2); assert.equal(rejected.rewrite.remainingRewrites, 3);
  assert.deepEqual(rejected.menu.currentObservation, selected.menu.currentObservation);
  assert.ok(rejected.issues.some(issue => issue.rule === 'bound_intent_requires_goal'));
  assert.equal(rejected.authoring.decisions[2].attempts, 1);
  assert.deepEqual(await invoke('recover-invalid', 'append_whole_trace_decision', { decision: invalid }), rejected,
    'uncertain delivery retry does not consume a rewrite');
  assert.equal((await hostStatus(directory)).requests[requestId].authoring.decisions[2].attempts, 1);
  const corrected = structuredClone(invalid); corrected.basis.goalId = goal.id;
  const accepted = await invoke('recover-corrected', 'append_whole_trace_decision', { decision: corrected });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.decisionIndex, rejected.decisionIndex);
  assert.equal(accepted.authoring.decisions[2].rewriteCount, 1);
  assert.equal(accepted.authoring.decisions[2].firstAttemptPassed, false);
  assert.equal(accepted.menu.currentObservation.acceptedDecisionCount, 3);
  assert.deepEqual(accepted.menu.currentObservation.readObjectives, readResult.menu.currentObservation.readObjectives);
  const repeatedBegin = await invoke('begin-again', 'begin_whole_trace_authoring');
  assert.deepEqual(repeatedBegin.authoring, accepted.authoring, 'begin never resets the authoring attempt history');
  const ending = draft('control/giveUp', { ...held, activity: 'finish' }, { intent: 'finish' });
  assert.equal((await invoke('ending', 'append_whole_trace_decision', { decision: ending })).accepted, true);
  const finished = await invoke('finish', 'finish_whole_trace_authoring');
  assert.equal(finished.authoring.firstAttemptPassCount, 3);
  assert.equal(finished.authoring.firstAttemptAccuracy, 0.75);
  assert.equal(finished.candidate.decisions.length, 4);
  assert.deepEqual(finished.candidate.decisions[2].basis, corrected.basis);
  const submitted = await invoke('submit-authored', 'submit_whole_trace', { candidate: finished.candidate });
  assert.equal(submitted.status, 'complete');
  assert.deepEqual(submitted.authoring, finished.authoring);
  const authoredRows = fs.readFileSync(path.join(prepared.diagnosticDirectory, 'authoring.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(authoredRows.filter(row => row.accepted === false).length, 1);
  assert.deepEqual(authoredRows.find(row => row.accepted === false).rewrite, rejected.rewrite);
  assert.deepEqual(authoredRows.find(row => row.accepted && row.decisionIndex === 0).menu.currentObservation,
    readResult.menu.currentObservation);
  assert.deepEqual(authoredRows.find(row => row.accepted === false).menu.currentObservation,
    rejected.menu.currentObservation);
  assert.deepEqual(authoredRows.find(row => row.accepted && row.decisionIndex === 2).menu.currentObservation,
    accepted.menu.currentObservation);
  assert.equal(authoredRows.filter(row => row.decisionIndex === 0).length, 1,
    'A cached readList delivery adds neither an action nor a second observation journal entry');
  const status = await hostStatus(directory);
  assert.deepEqual(status.requests[requestId].authoring, finished.authoring);
  const journal = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8');
  assert.equal(journal.includes(invalid.reason), false);
  const events = journal.trim().split('\n').map(JSON.parse);
  const rejections = events.filter(event => event.type === 'authoring_decision_rejected');
  assert.equal(rejections.length, 1);
  assert.ok(rejections[0].rejectionRules.includes('bound_intent_requires_goal'));
  const correction = events.find(event => event.type === 'authoring_decision_accepted' && event.decisionIndex === 2);
  assert.equal(correction.authoring.decisions[2].rewriteCount, 1);
  assert.equal(correction.authoring.decisions[2].firstAttemptPassed, false);
});

test('host request decoding preserves Korean text split inside a multibyte character', async t => {
  const f = fixture(t), directory = f.host('owner'); await startHost(directory);
  const prepared = await callHost(directory, request(f));
  const authored = candidate(prepared.requestId); authored.decisions[0].reason = '한글을 그대로 보존한다';
  const credentials = read(path.join(directory, 'connection.json'));
  const bytes = Buffer.from(JSON.stringify({ command: 'call', operationId: 'korean-request', tool: 'submit_whole_trace',
    arguments: { requestId: prepared.requestId, candidate: authored }, ...credentials }) + '\n');
  const split = bytes.indexOf(Buffer.from('한글')) + 1;
  assert.ok(split > 1);
  const socket = net.createConnection(credentials.socketPath); socket.setEncoding('utf8');
  t.after(() => socket.destroy());
  const response = new Promise((resolve, reject) => {
    let text = ''; socket.on('error', reject); socket.on('data', chunk => { text += chunk; if (text.includes('\n')) resolve(JSON.parse(text)); });
  });
  await new Promise(resolve => socket.once('connect', resolve));
  socket.write(bytes.subarray(0, split)); await sleep(25); socket.write(bytes.subarray(split));
  const saved = await response;
  assert.equal(saved.ok, true); assert.equal(saved.result.status, 'complete');
  assert.equal(read(saved.result.knowledgeAuditPath).decisions[0].reason, authored.decisions[0].reason);
});

test('host client decoding preserves a response split inside a Korean multibyte character', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'host-utf8-'));
  const socketPath = path.join(directory, 'h.sock'), hostId = randomUUID(), token = 'fixture-token';
  const expected = { message: '한글 응답 보존' };
  const server = net.createServer(socket => {
    socket.once('data', async () => {
      const bytes = Buffer.from(JSON.stringify({ hostId, ok: true, result: expected }) + '\n');
      const split = bytes.indexOf(Buffer.from('한글')) + 1;
      socket.write(bytes.subarray(0, split)); await sleep(25); socket.end(bytes.subarray(split));
    });
  });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
  await new Promise(resolve => server.listen(socketPath, resolve));
  fs.writeFileSync(path.join(directory, 'connection.json'), JSON.stringify({ hostId, socketPath, token }));
  assert.deepEqual(await callHost(directory, { operationId: 'utf8-response', tool: 'list_personas', arguments: {} }), expected);
});

test('supported file inputs are frozen before queue execution and edited-file retries cannot replace queued work', async t => {
  let releaseFile;
  t.after(() => { if (releaseFile && fs.existsSync(path.dirname(releaseFile))) fs.writeFileSync(releaseFile, 'release'); });
  const f = fixture(t), directory = f.host('queued-owner'), hostId = randomUUID();
  fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'owner.json'), JSON.stringify({ hostId }));
  releaseFile = path.join(f.directory, 'release');
  // A delayed offline service exercises the actual transport queue without AI,
  // app input, timing-dependent simulation work or a production test hook.
  const worker = `
    const fs = require('node:fs');
    const [serverPath,hostPath,directory,hostId,releaseFile] = process.argv.slice(1);
    require.cache[serverPath] = {id:serverPath,filename:serverPath,loaded:true,exports:{createService:()=>({
      async invokeTool(tool,args) {
        if(tool==='list_personas') { while(!fs.existsSync(releaseFile)) await new Promise(r=>setTimeout(r,10)); return {personas:[]}; }
        return {received:args};
      },async close(){}
    })}};
    require(hostPath).runHost(directory,hostId).catch(error=>{process.stderr.write(error.stack);process.exitCode=1;});
  `;
  const child = spawn(process.execPath, ['-e', worker, require.resolve('../server.cjs'), require.resolve('../whole-trace-host.cjs'), directory, hostId, releaseFile], { stdio: ['ignore', 'ignore', 'pipe'] });
  let childErrors = ''; child.stderr.on('data', chunk => { childErrors += chunk; });
  t.after(() => child.kill('SIGTERM'));
  await until(() => fs.existsSync(path.join(directory, 'connection.json')));
  const blocker = callHost(directory, { operationId: 'blocker', tool: 'list_personas', arguments: {} });
  await until(async () => (await hostStatus(directory)).operations.blocker?.status === 'running');
  const snapshotFilePath = path.join(f.directory, 'snapshot.json');
  const original = { fixture: '변경 전', seed: 1 }; fs.writeFileSync(snapshotFilePath, JSON.stringify(original));
  const request = { operationId: 'queued-file', tool: 'prepare_whole_trace', arguments: { snapshotFilePath } };
  const queued = callHost(directory, request);
  await until(async () => (await hostStatus(directory)).operations['queued-file']?.status === 'queued');
  fs.writeFileSync(snapshotFilePath, JSON.stringify({ fixture: '변경 후', seed: 2 }));
  await assert.rejects(callHost(directory, request), { code: 'HOST_OPERATION_CONFLICT' });
  fs.writeFileSync(releaseFile, 'release'); await blocker;
  assert.deepEqual(await queued, { received: { snapshot: original } });
  assert.equal(childErrors, '');
  fs.writeFileSync(snapshotFilePath, JSON.stringify(original));
  assert.deepEqual(await callHost(directory, request), { received: { snapshot: original } });
  const events = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(event => event.type === 'operation_started' && event.operationId === 'queued-file').length, 1);
});

const gateResponses = `
  const createServer = net.createServer;
  net.createServer = function(listener) {
    return createServer.call(this, socket => {
      const end = socket.end;
      socket.end = function(payload, ...rest) {
        const response = JSON.parse(payload);
        if (response.result?.replyFixture || response.result?.state === 'closing') {
          fs.appendFileSync(path.join(fixtureDirectory, 'gated-replies'), 'reply\\n');
          const timer = setInterval(() => {
            if (fs.existsSync(path.join(fixtureDirectory, 'flush-replies'))) {
              clearInterval(timer); end.call(socket, payload, ...rest);
            }
          }, 5);
          socket.once('close', () => clearInterval(timer));
          return socket;
        }
        return end.call(socket, payload, ...rest);
      };
      listener(socket);
    });
  };
`;

for (const signal of [null, 'SIGTERM']) {
  test(`${signal ?? 'explicit close'} waits for queued operations and response finish before destroying sockets`, async t => {
    // Register releases before fixture teardown, including when an assertion
    // fails, so a gated worker can never hold the test runner open.
    let directory;
    t.after(() => {
      if (directory && fs.existsSync(directory)) for (const file of ['release-operation', 'flush-replies']) fs.writeFileSync(path.join(directory, file), 'release');
    });
    const f = fixture(t); directory = f.directory;
    const host = await stubHost(t, f, 'owner', `${gateResponses}
      const createService = () => ({
        async invokeTool(tool) {
          if(tool === 'list_personas') while(!fs.existsSync(path.join(fixtureDirectory, 'release-operation'))) await new Promise(r => setTimeout(r, 5));
          return {replyFixture: tool};
        },
        async close() { fs.writeFileSync(path.join(fixtureDirectory, 'service-closed'), 'closed'); }
      });
    `);
    const first = callHost(host.directory, { operationId: 'running', tool: 'list_personas' });
    await until(async () => (await hostStatus(host.directory)).operations.running?.status === 'running');
    const second = callHost(host.directory, { operationId: 'queued', tool: 'validate_trace' });
    await until(async () => (await hostStatus(host.directory)).operations.queued?.status === 'queued');
    const closing = signal ? (host.child.kill(signal), Promise.resolve(null)) : closeHost(host.directory);
    const responses = Promise.all([first, second, closing]);
    await until(() => read(path.join(host.directory, 'status.json')).closeReason === (signal ?? 'explicit-close'));
    assert.equal(read(path.join(host.directory, 'status.json')).operations.queued.status, 'queued');
    fs.writeFileSync(path.join(directory, 'release-operation'), 'release');
    const expectedReplies = signal ? 2 : 3;
    await until(() => fs.existsSync(path.join(directory, 'gated-replies')) && fs.readFileSync(path.join(directory, 'gated-replies'), 'utf8').trim().split('\n').length === expectedReplies);
    await until(() => fs.existsSync(path.join(directory, 'service-closed')));
    assert.equal(read(path.join(host.directory, 'status.json')).state, 'closing');
    fs.writeFileSync(path.join(directory, 'flush-replies'), 'release');
    const [firstResult, secondResult, closeResult] = await responses;
    assert.deepEqual(firstResult, { replyFixture: 'list_personas' });
    assert.deepEqual(secondResult, { replyFixture: 'validate_trace' });
    if (!signal) assert.equal(closeResult.state, 'closing');
    assert.deepEqual(await host.exited, { code: signal ? 143 : 0, signal: null });
    assert.equal(host.stderr(), '');
    const status = read(path.join(host.directory, 'status.json'));
    assert.equal(status.state, 'closed');
    assert.equal(status.operations.running.status, 'completed');
    assert.equal(status.operations.queued.status, 'completed');
    assert.equal(fs.existsSync(status.runtimeDirectory), false);
  });
}

test('cleanup failure still flushes close acknowledgement and releases the listener and runtime directory', async t => {
  let directory;
  t.after(() => { if (directory && fs.existsSync(directory)) fs.writeFileSync(path.join(directory, 'flush-replies'), 'release'); });
  const f = fixture(t); directory = f.directory;
  const host = await stubHost(t, f, 'owner', `${gateResponses}
    const createService = () => ({
      async invokeTool() { return {}; },
      async close() { throw Object.assign(new Error('fixture cleanup failed'), {code:'FIXTURE_CLEANUP_FAILED'}); }
    });
  `);
  const closing = closeHost(host.directory);
  await until(() => fs.existsSync(path.join(directory, 'gated-replies')));
  await until(() => read(path.join(host.directory, 'status.json')).state === 'closing');
  fs.writeFileSync(path.join(directory, 'flush-replies'), 'release');
  assert.equal((await closing).state, 'closing');
  assert.deepEqual(await host.exited, { code: 1, signal: null });
  const status = read(path.join(host.directory, 'status.json'));
  assert.equal(status.state, 'failed');
  assert.equal(status.exitCode, 1);
  assert.equal(fs.existsSync(status.runtimeDirectory), false);
  const events = fs.readFileSync(path.join(host.directory, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(events.some(event => event.type === 'host_shutdown_failed' && event.errorCode === 'FIXTURE_CLEANUP_FAILED'));
});

for (const disconnect of [true, false]) {
  test(`shutdown releases ${disconnect ? 'a disconnected' : 'a stalled'} backpressured reader without losing the close acknowledgement`, async t => {
    const f = fixture(t);
    const host = await stubHost(t, f, 'owner', `
      const createService = () => ({
        async invokeTool() { return {largeFixture: 'x'.repeat(16 * 1024 * 1024)}; },
        async close() {}
      });
    `);
    const credentials = read(path.join(host.directory, 'connection.json'));
    const socket = net.createConnection(credentials.socketPath);
    t.after(() => socket.destroy());
    socket.on('error', () => {});
    socket.pause();
    await new Promise(resolve => socket.once('connect', resolve));
    socket.write(JSON.stringify({ command: 'call', operationId: 'large-response', tool: 'list_personas', ...credentials }) + '\n');
    await until(async () => (await hostStatus(host.directory)).operations['large-response']?.status === 'completed');
    // An already-connected client which never sends a request must not retain
    // the closing server either.
    const idle = net.createConnection(credentials.socketPath);
    idle.on('error', () => {}); t.after(() => idle.destroy());
    await new Promise(resolve => idle.once('connect', resolve));
    const started = Date.now();
    assert.equal((await closeHost(host.directory)).state, 'closing');
    await until(() => read(path.join(host.directory, 'status.json')).state === 'closing');
    if (disconnect) socket.destroy();
    await until(() => read(path.join(host.directory, 'status.json')).endedAt);
    assert.deepEqual(await host.exited, { code: 0, signal: null });
    assert.ok(Date.now() - started < 8000, 'response drain has a bounded shutdown deadline');
    const status = read(path.join(host.directory, 'status.json'));
    assert.equal(status.operations['large-response'].status, 'completed');
    assert.equal(fs.existsSync(status.runtimeDirectory), false);
    const events = fs.readFileSync(path.join(host.directory, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const timeouts = events.filter(event => event.type === 'host_response_drain_timeout');
    assert.equal(timeouts.length, disconnect ? 0 : 1);
    if (!disconnect) assert.equal(timeouts[0].pendingResponses, 1);
    assert.equal(host.stderr(), '');
  });
}

test('SIGTERM records the requested termination and request status without restoring a retired session', async t => {
  const f = fixture(t), directory = f.host('owner'); const started = await startHost(directory);
  const prepared = await callHost(directory, request(f));
  process.kill(started.pid, 'SIGTERM');
  const closed = await until(async () => { const value = await hostStatus(directory); return value.state === 'closed' && value; });
  assert.equal(closed.closeReason, 'SIGTERM'); assert.equal(closed.exitCode, 143); assert.equal(closed.available, false);
  assert.equal(closed.requests[prepared.requestId].status, 'prepared');
  assert.equal(closed.requests[prepared.requestId].attempts, 0);
  assert.match(fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8'), /"type":"host_closed".*"reason":"SIGTERM"/);
  await assert.rejects(callHost(directory, { operationId: 'lost-submit', tool: 'submit_whole_trace', arguments: { requestId: prepared.requestId, candidate: candidate(prepared.requestId) } }), { code: 'HOST_UNAVAILABLE' });
});

test('unobservable SIGKILL reports unavailable with unknown cause rather than inventing a clean exit or restoring requests', async t => {
  const f = fixture(t), directory = f.host('owner'); const started = await startHost(directory);
  process.kill(started.pid, 'SIGKILL');
  const unavailable = await until(async () => { const value = await hostStatus(directory); return value.state === 'unavailable' && value; });
  assert.equal(unavailable.available, false); assert.equal(unavailable.terminationCauseKnown, false);
  assert.equal(unavailable.lastKnownState, 'ready'); assert.equal(unavailable.endedAt, undefined);
  assert.equal(unavailable.resumable, false);
  assert.equal(read(path.join(directory, 'status.json')).state, 'ready');
  await assert.rejects(startHost(directory), { code: 'EEXIST' });
});
