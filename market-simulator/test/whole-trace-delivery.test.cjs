'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { finishAndSubmit } = require('../whole-trace-delivery.cjs');

function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-delivery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function candidate(requestId = 'delivery-request') {
  return { candidateVersion: '7', requestId, decisions: [{ choiceRef: { choiceId: 'control/giveUp' },
    delayMs: 731, reason: '현재 선택한 장보기를 마친다', basis: { intent: 'finish', goalId: null, memoryUses: [] },
    actorState: { activity: 'finish', task: '장보기 마치기', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } }] };
}
function fake(t, options = {}) {
  const dir = directory(t), original = candidate(), calls = [];
  let state = 'prepared', canRepair = false, submissions = 0;
  const invokeTool = async (tool, args) => {
    calls.push({ tool, args: structuredClone(args) });
    assert.equal(args.requestId, original.requestId);
    if (tool === 'whole_trace_status') return { requestId: original.requestId, status: state, canRepair };
    if (tool === 'finish_whole_trace_authoring') return options.finish
      ? options.finish(original) : { requestId: original.requestId, candidate: structuredClone(original), authoring: { decisions: ['not a candidate'] } };
    assert.equal(tool, 'submit_whole_trace', 'Delivery must not prepare, rewrite, close, or author a decision');
    assert.deepEqual(JSON.parse(fs.readFileSync(args.candidateFilePath, 'utf8')), original);
    submissions++;
    if (options.submit) return options.submit({ submissions, args, setState: (s, repair = false) => { state = s; canRepair = repair; } });
    state = 'complete';
    return { requestId: original.requestId, status: 'complete', validation: { valid: true } };
  };
  return { original, calls, invokeTool, requestId: original.requestId,
    candidateFilePath: path.join(dir, 'candidate.json') };
}

test('finished candidate is saved as one exact JSON object and completion requires a subsequent status', async t => {
  const f = fake(t), original = structuredClone(f.original), saved = await finishAndSubmit(f);
  assert.equal(saved.complete, true); assert.equal(saved.terminal, true); assert.equal(saved.status, 'complete');
  assert.equal(saved.requestStatus.status, 'complete'); assert.match(saved.candidateSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.candidateFilePath, 'utf8')), original);
  assert.deepEqual(f.original, original);
  assert.deepEqual(f.calls.map(x => x.tool), ['whole_trace_status', 'finish_whole_trace_authoring', 'submit_whole_trace', 'whole_trace_status']);
  assert.deepEqual(fs.readdirSync(path.dirname(f.candidateFilePath)), ['candidate.json']);
});

test('null-prefixed JSONL candidate and a different existing candidate are preserved without submission', async t => {
  for (const text of [Array(12).fill('null').join('\n') + '\n' + JSON.stringify(candidate()),
    JSON.stringify({ ...candidate(), decisions: [] })]) {
    const f = fake(t); fs.writeFileSync(f.candidateFilePath, text);
    await assert.rejects(finishAndSubmit(f), e => {
      assert.ok(['DELIVERY_CANDIDATE_FILE', 'DELIVERY_CANDIDATE_MISMATCH'].includes(e.code));
      assert.equal(e.requestStatus.status, 'prepared'); return true;
    });
    assert.equal(fs.readFileSync(f.candidateFilePath, 'utf8'), text);
    assert.equal(f.calls.some(x => x.tool === 'submit_whole_trace'), false);
  }
});

test('malformed finish values and lossy JSON fields cannot produce a candidate file', async t => {
  for (const finish of [() => ({ requestId: 'delivery-request', candidate: null }),
    value => ({ requestId: 'delivery-request', candidate: 'null\n' + JSON.stringify(value) }),
    value => ({ requestId: 'delivery-request', candidate: { ...value, decisions: [{ omitted: undefined }] } }),
    value => ({ requestId: 'different-request', candidate: value })]) {
    const f = fake(t, { finish });
    await assert.rejects(finishAndSubmit(f), { code: 'DELIVERY_INVALID_CANDIDATE' });
    assert.equal(fs.existsSync(f.candidateFilePath), false);
    assert.equal(f.calls.some(x => x.tool === 'submit_whole_trace'), false);
  }
});

test('a delivery exception leaves the same request prepared and an unchanged candidate can be retried', async t => {
  const f = fake(t, { submit: ({ submissions, setState }) => {
    if (submissions === 1) throw new Error('transport unavailable');
    setState('complete'); return { requestId: 'delivery-request', status: 'complete', validation: { valid: true } };
  } });
  await assert.rejects(finishAndSubmit(f), e => {
    assert.equal(e.message, 'transport unavailable'); assert.equal(e.requestStatus.status, 'prepared'); return true;
  });
  const bytes = fs.readFileSync(f.candidateFilePath);
  assert.equal((await finishAndSubmit(f)).complete, true);
  assert.deepEqual(fs.readFileSync(f.candidateFilePath), bytes);
});

test('prepared status is not completion and repairable/terminal failures are not silently retried', async t => {
  for (const [state, canRepair, terminal] of [['prepared', false, false], ['invalid', true, false], ['invalid', false, true], ['failed', false, true]]) {
    const f = fake(t, { submit: ({ setState }) => {
      setState(state, canRepair);
      return { requestId: 'delivery-request', status: state === 'prepared' ? 'complete' : state, validation: { valid: state === 'prepared' } };
    } });
    const result = await finishAndSubmit(f);
    assert.equal(result.status, state); assert.equal(result.complete, false); assert.equal(result.terminal, terminal);
    if (state !== 'prepared') {
      f.calls.length = 0;
      const unchanged = await finishAndSubmit(f);
      assert.equal(unchanged.status, state); assert.equal(unchanged.complete, false);
      assert.deepEqual(f.calls.map(x => x.tool), ['whole_trace_status']);
    }
  }
});

test('an unconfirmed success or changing candidate bytes never receives a completion acknowledgement', async t => {
  for (const mutate of [false, true]) {
    const f = fake(t, { submit: ({ args, setState }) => {
      setState('complete');
      if (mutate) fs.appendFileSync(args.candidateFilePath, ' ');
      return { requestId: 'delivery-request', status: 'complete', validation: { valid: mutate } };
    } });
    await assert.rejects(finishAndSubmit(f), { code: mutate ? 'DELIVERY_CANDIDATE_CHANGED' : 'DELIVERY_UNCONFIRMED_COMPLETION' });
  }
});

test('relative paths reject before tool execution and symlink destinations are not followed', async t => {
  const f = fake(t);
  await assert.rejects(finishAndSubmit({ ...f, candidateFilePath: 'candidate.json' }), { code: 'DELIVERY_INVALID_INPUT' });
  assert.deepEqual(f.calls, []);
  const other = path.join(path.dirname(f.candidateFilePath), 'other.json');
  fs.writeFileSync(other, JSON.stringify(f.original)); fs.symlinkSync(other, f.candidateFilePath);
  await assert.rejects(finishAndSubmit(f), { code: 'DELIVERY_CANDIDATE_PATH' });
  assert.deepEqual(JSON.parse(fs.readFileSync(other, 'utf8')), f.original);
  assert.equal(f.calls.some(x => x.tool === 'submit_whole_trace'), false);
});

test('real prepared service finishes and submits once, and a lost acknowledgement safely reuses the exact candidate', async t => {
  require('../runtime.cjs');
  const { createService } = require('../server.cjs');
  const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
  const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
  const dir = directory(t), service = createService(); t.after(() => service.close());
  const prepared = await service.invokeTool('prepare_whole_trace', { personaId: 'mild-intellectual-disability-adult',
    seed: 'mechanical-delivery-regression', snapshot: createMarketReplaySnapshot(createMarketSession({ seed: 'delivery-fixture' })),
    outputPath: path.join(dir, 'trace.json'), maxRepairs: 0 });
  const requestId = prepared.requestId;
  await service.invokeTool('begin_whole_trace_authoring', { requestId });
  const authored = candidate(requestId).decisions[0], unchanged = structuredClone(authored);
  assert.equal((await service.invokeTool('append_whole_trace_decision', { requestId, decision: authored })).accepted, true);
  let loseAcknowledgement = true;
  const invokeTool = async (tool, args) => {
    const value = await service.invokeTool(tool, args);
    if (tool === 'submit_whole_trace' && loseAcknowledgement) {
      loseAcknowledgement = false; throw new Error('simulated lost acknowledgement after persistence');
    }
    return value;
  };
  const args = { invokeTool, requestId, candidateFilePath: path.join(dir, 'candidate.json') };
  await assert.rejects(finishAndSubmit(args), e => {
    assert.equal(e.requestStatus.status, 'complete'); assert.equal(e.requestStatus.attempts, 1); return true;
  });
  const result = await finishAndSubmit(args);
  assert.equal(result.complete, true); assert.equal(result.requestStatus.attempts, 1);
  assert.equal(result.submission.validation.valid, true);
  assert.deepEqual(authored, unchanged);
  const { source: _source, ...savedReference } = JSON.parse(fs.readFileSync(args.candidateFilePath)).decisions[0].choiceRef;
  assert.deepEqual(savedReference, authored.choiceRef);
  assert.deepEqual(await service.invokeTool('validate_trace', { traceFilePath: result.submission.outputPath,
    snapshotFilePath: result.submission.snapshotFilePath }), { valid: true, errors: [] });
  const originalTrace = fs.readFileSync(result.submission.outputPath), different = JSON.parse(fs.readFileSync(args.candidateFilePath));
  different.decisions[0].delayMs++;
  fs.writeFileSync(args.candidateFilePath, JSON.stringify(different));
  await assert.rejects(finishAndSubmit(args), /closed/);
  assert.equal((await service.invokeTool('whole_trace_status', { requestId })).attempts, 1);
  assert.deepEqual(fs.readFileSync(result.submission.outputPath), originalTrace);
});
