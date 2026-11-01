'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { startHost, closeHost, hostStatus, callHost } = require('../whole-trace-host.cjs');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { marketMission } = require('../../frontend/src/game/scenarios.ts');

const cli = path.resolve(__dirname, '../cli.cjs');
const run = (args, input = '', options = {}) => spawnSync(process.execPath, [cli, 'author-whole', ...args],
  { encoding: 'utf8', input, timeout: 30000, maxBuffer: 16 * 1024 * 1024, ...options });
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-author-cli-'));
  const hostDirectory = path.join(directory, 'host');
  t.after(async () => {
    try { await closeHost(hostDirectory); } catch { /* The test may fail before startup. */ }
    for (let i = 0; i < 200; i++) {
      try { if ((await hostStatus(hostDirectory)).endedAt) break; } catch { break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await startHost(hostDirectory);
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'author-cli', difficulty: 'exact',
    objectives: marketMission.objectives.map(({ productId, quantity }) => ({ productId, quantity, match: 'exact' })) }), marketMission);
  // Preparation remains an administrator operation; author-whole uses only the
  // already prepared request identified by the saved context.
  const prepared = await callHost(hostDirectory, { operationId: 'prepare', tool: 'prepare_whole_trace', arguments: {
    personaId: 'careful-checker', seed: 'author-cli', snapshot, outputPath: path.join(directory, 'trace.json'), maxRepairs: 0,
  } });
  fs.mkdirSync(path.join(directory, 'binding')); fs.mkdirSync(path.join(directory, 'operations'));
  const contextPath = path.join(directory, 'binding', 'context.json');
  fs.writeFileSync(contextPath, JSON.stringify({ hostDirectory: '../host', requestId: prepared.requestId,
    condition: 'fixture', inputHash: prepared.bundle.inputHash, actorState: { focusedProductId: 'must-not-be-copied' } }));
  return { directory, hostDirectory, prepared, contextPath };
}

test('03 duplicate script/path, remaining positionals and unknown flags reject before opening inputs or validation', () => {
  const missing = path.join(os.tmpdir(), 'authoring-input-that-does-not-exist.json');
  for (const args of [[cli, missing], [missing, missing], [missing, 'remaining'],
    ['--options-file', missing], ['--unknown'], ['-', missing], []]) {
    const result = run(args, '{ invalid json');
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /^AUTHORING_UNEXPECTED_ARGUMENT:/);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /ENOENT|SyntaxError|Unknown whole-trace request/);
  }
});

test('context resolves from the input file or stdin cwd, and invalid argv never starts candidate validation', async t => {
  const { directory, hostDirectory, prepared, contextPath } = await fixture(t);
  const request = { contextFilePath: '../binding/context.json', operationId: 'submit', tool: 'submit-whole', arguments: {
    candidate: { candidateVersion: '7', requestId: prepared.requestId, decisions: [] },
  } };
  const candidateInput = path.join(directory, 'operations', 'candidate-input.json');
  fs.writeFileSync(candidateInput, JSON.stringify(request));
  const bytes = fs.readFileSync(candidateInput);
  const contextBytes = fs.readFileSync(contextPath);
  for (const args of [[candidateInput, candidateInput], [cli, candidateInput], [candidateInput, '--unknown']]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^AUTHORING_UNEXPECTED_ARGUMENT:/);
    const status = await hostStatus(hostDirectory);
    assert.equal(status.requests[prepared.requestId].attempts, 0);
    assert.equal(status.operations.submit, undefined, 'candidate validation was never queued');
  }
  const stdin = run(['-'], JSON.stringify({ ...request, contextFilePath: 'binding/context.json' }), { cwd: directory });
  assert.equal(stdin.status, 0, stdin.stderr);
  const rejected = JSON.parse(stdin.stdout);
  assert.equal(rejected.status, 'invalid');
  assert.equal((await hostStatus(hostDirectory)).requests[prepared.requestId].attempts, 1);
  const retry = run([candidateInput]);
  assert.equal(retry.status, 0, retry.stderr);
  assert.deepEqual(JSON.parse(retry.stdout), rejected);
  assert.deepEqual(fs.readFileSync(candidateInput), bytes);
  assert.deepEqual(fs.readFileSync(contextPath), contextBytes);
  const events = fs.readFileSync(path.join(hostDirectory, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(event => event.type === 'operation_started' && event.operationId === 'submit').length, 1);
  assert.equal((await callHost(hostDirectory, { operationId: 'status', tool: 'whole_trace_status',
    arguments: { requestId: prepared.requestId } })).attempts, 1);
});

test('authoring envelope rejects unknown fields and administrator tools before context or host lookup', () => {
  for (const request of [
    { contextFilePath: '/missing-context', operationId: 'one', tool: 'submit-whole', arguments: {}, candidate: {} },
    ...['generate_trace', 'prepare-whole', 'list_personas', 'validate_trace'].map(tool =>
      ({ contextFilePath: '/missing-context', operationId: 'one', tool, arguments: {} })),
  ]) {
    const result = run(['-'], JSON.stringify(request));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^AUTHORING_INVALID_INPUT:/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});

test('invalid context and duplicate transport bindings reject before the host queues candidate validation', async t => {
  const { directory, hostDirectory, prepared, contextPath } = await fixture(t);
  const base = { contextFilePath: contextPath, operationId: 'must-not-run', tool: 'submit-whole', arguments: {
    candidate: { candidateVersion: '7', requestId: prepared.requestId, decisions: [] },
  } };
  const before = await hostStatus(hostDirectory), contextBytes = fs.readFileSync(contextPath);
  for (const key of ['hostDirectory', 'requestId']) {
    for (const value of [key === 'hostDirectory' ? hostDirectory : prepared.requestId, 'different-binding']) {
      for (const override of [{ ...base, [key]: value }, { ...base, arguments: { ...base.arguments, [key]: value } }]) {
        const result = run(['-'], JSON.stringify(override));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /^AUTHORING_CONTEXT_OVERRIDE:/);
      }
    }
  }
  const invalidContext = path.join(directory, 'invalid-context.json');
  const invalid = ['not json', 'null', '[]', '{}', JSON.stringify({ hostDirectory, requestId: '' }),
    JSON.stringify({ hostDirectory: '', requestId: prepared.requestId }), JSON.stringify({ hostDirectory, requestId: 1 })];
  for (const contents of invalid) {
    fs.writeFileSync(invalidContext, contents);
    const result = run(['-'], JSON.stringify({ ...base, contextFilePath: invalidContext }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^AUTHORING_INVALID_CONTEXT:/);
  }
  const missing = run(['-'], JSON.stringify({ ...base, contextFilePath: path.join(directory, 'missing-context.json') }));
  assert.equal(missing.status, 1); assert.match(missing.stderr, /^AUTHORING_INVALID_CONTEXT:/);
  const after = await hostStatus(hostDirectory);
  assert.deepEqual(after.operations, before.operations);
  assert.equal(after.requests[prepared.requestId].attempts, 0);
  assert.deepEqual(fs.readFileSync(contextPath), contextBytes);
});

test('context fills only transport bindings and preserves decisions, candidate IDs and repair IDs for existing validators', async t => {
  const { directory, hostDirectory, prepared, contextPath } = await fixture(t);
  const invoke = (operationId, tool, arguments_ = {}) => run(['-'], JSON.stringify({ contextFilePath: contextPath,
    operationId, tool, arguments: arguments_ }));
  const parse = result => { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
  parse(invoke('begin', 'begin-whole-authoring'));
  const decision = { choiceRef: { choiceId: 'control/giveUp' }, delayMs: 731,
    reason: '작성한 행동과 상태를 그대로 보존한다', basis: { intent: 'finish', goalId: null, memoryUses: [] },
    actorState: { activity: 'finish', task: '이번 장보기를 마친다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } };
  const incomplete = structuredClone(decision); delete incomplete.actorState.uncertainGoalIds;
  const rejected = parse(invoke('append-incomplete', 'append-whole-decision', { decision: incomplete }));
  assert.equal(rejected.accepted, false); assert.equal(rejected.code, 'AUTHORING_SCHEMA');
  assert.equal(rejected.canRetry, true);
  const rejectionAudit = JSON.parse(fs.readFileSync(path.join(prepared.diagnosticDirectory, 'authoring.jsonl'), 'utf8').trim());
  assert.deepEqual(rejectionAudit.decision, incomplete);
  assert.equal(Object.hasOwn(rejectionAudit.decision.actorState, 'uncertainGoalIds'), false,
    'missing authored state is not filled from context or defaults');
  const accepted = parse(invoke('append', 'append-whole-decision', { decision }));
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.decisionIndex, rejected.decisionIndex);
  const { source, ...choiceRef } = accepted.decision.choiceRef;
  assert.deepEqual({ ...accepted.decision, choiceRef }, decision, 'only the existing source helper may supply source');
  const finished = parse(invoke('finish', 'finish-whole-authoring'));
  for (const value of [undefined, 'different-request']) {
    const candidate = structuredClone(finished.candidate);
    if (value === undefined) delete candidate.requestId; else candidate.requestId = value;
    const result = invoke(`candidate-${value ?? 'missing'}`, 'submit-whole', { candidate });
    assert.equal(result.status, 1);
    let expected;
    try { await callHost(hostDirectory, { operationId: `direct-candidate-${value ?? 'missing'}`, tool: 'submit_whole_trace',
      arguments: { requestId: prepared.requestId, candidate } }); } catch (cause) { expected = cause; }
    assert.ok(expected); assert.ok(result.stderr.includes(expected.message));
    assert.equal(candidate.requestId, value, 'candidate ID is neither filled nor replaced');
  }
  const repair = { requestId: 'different-request', decisions: finished.candidate.decisions };
  const repaired = invoke('repair-mismatch', 'repair-whole', { repair });
  assert.equal(repaired.status, 1);
  assert.match(repaired.stderr, /Candidate or repair is bound to a different whole-trace request/);
  assert.equal(repair.requestId, 'different-request');
  const submitted = parse(invoke('submit', 'submit-whole', { candidate: finished.candidate }));
  assert.equal(submitted.status, 'complete');
  const original = JSON.parse(fs.readFileSync(path.join(prepared.diagnosticDirectory, 'attempt-1.candidate.json'), 'utf8'));
  assert.deepEqual(original, finished.candidate, 'transport context never changes the submitted candidate');
  const audit = fs.readFileSync(path.join(prepared.diagnosticDirectory, 'authoring.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(audit.at(-1).decision, accepted.decision);
  assert.equal(fs.existsSync(path.join(directory, 'trace.json')), true);
});
