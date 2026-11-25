'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
require('../runtime.cjs');
const { readMailboxStatus, abortMailbox } = require('../whole-trace-mailbox.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const memo = require('../visit-memo.cjs');

const V3 = memo.MEMO_FORMATS['authoring-v5-h200-memo-v3'];
const mailboxCli = path.resolve(__dirname, '../whole-trace-mailbox.cjs');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await pause(20); }
  throw new Error(`Timed out waiting for ${message}`);
}
function runCli(args) {
  const child = spawn(process.execPath, [mailboxCli, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve({ code, stdout, stderr }));
  });
  child.stdin.end();
  return { child, exited, stderr: () => stderr };
}
async function owner(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'visit-recall-'));
  const ownerDirectory = path.join(directory, 'owner');
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'visit-recall',
    objectives: [{ productId: 'milk', quantity: 1 }], environment: { cashierCount: 2 } }));
  const prepareFile = path.join(directory, 'prepare.json');
  fs.writeFileSync(prepareFile, JSON.stringify({ tool: 'prepare_whole_trace', arguments: { personaId: 'mild-intellectual-disability-adult',
    seed: 'visit-recall', snapshot, outputPath: path.join(directory, 'trace.json'), maxRepairs: 0 } }));
  const serving = runCli(['serve', ownerDirectory, '--prepare-file', prepareFile]);
  t.after(async () => {
    if (serving.child.exitCode === null) {
      try { abortMailbox(ownerDirectory, 'test cleanup'); } catch { serving.child.kill('SIGTERM'); }
    }
    await serving.exited;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await until(async () => {
    if (serving.child.exitCode !== null) throw new Error(`Owner exited: ${serving.stderr()}`);
    return fs.existsSync(path.join(ownerDirectory, 'status.json')) && readMailboxStatus(ownerDirectory).state === 'ready';
  }, 'prepared owner');
  let count = 0;
  const call = async (tool, args = {}) => {
    const file = path.join(directory, `op-${++count}.json`);
    fs.writeFileSync(file, JSON.stringify({ operationId: `op-${count}`, tool, arguments: args }));
    const response = await runCli(['call', ownerDirectory, '--operation-file', file]).exited;
    assert.equal(response.code, 0, response.stderr);
    return JSON.parse(response.stdout);
  };
  return { directory, ownerDirectory, call };
}

test('v3 memos parse [들어가는 길] and 〈label〉 tags, and reject malformed tags', () => {
  const text = ['[장보기 순서]', '목록 → 냉장고', '[들어가는 길]', '- 출발점에서 북쪽 4 · 서쪽 2 걸음쯤 〈입구를 지나 매장 안으로〉 (확실)',
    '[장소와 길]', '- 〈냉장 식품〉 안쪽 (확실)', '- 〈1번 계산대〉 남쪽 (흐릿)'].join('\n');
  const result = memo.validateVisitMemo(text, V3);
  assert.deepEqual(result.labels, ['입구를 지나 매장 안으로', '냉장 식품', '1번 계산대']);
  assert.deepEqual(result.sections.map(section => section.id), ['routine', 'entryRoute', 'places']);
  assert.equal(memo.visitMemoMetrics(text, V3).labels, 3);
  assert.throws(() => memo.validateVisitMemo('[장소와 길]\n- 〈냉장 식품 안쪽', V3), /unbalanced/);
  assert.throws(() => memo.validateVisitMemo('[장소와 길]\n- 냉장 식품〉 안쪽', V3), /unbalanced/);
  assert.throws(() => memo.validateVisitMemo('[장소와 길]\n- 〈 〉 안쪽', V3), /empty/);
  assert.throws(() => memo.validateVisitMemo(`[장소와 길]\n- 〈${'가'.repeat(41)}〉`, V3), /longer than 40/);
  assert.throws(() => memo.validateVisitMemo('[들어가는 길]\n- 북쪽\n[장보기 순서]\n목록', V3), /out of order/);
  assert.throws(() => memo.validateVisitMemo('[들어가는 길]\n- 북쪽', memo.MEMO_FORMATS['authoring-v5-h200-memo-v2']), /unknown section header/);
});

test('recognition lists only memo lines whose label equals a name on the current screen', () => {
  const text = '[들어가는 길]\n- 북쪽으로 〈입구를 지나 매장 안으로〉 (확실)\n[장소와 길]\n- 〈1번 계산대〉 남쪽 (흐릿)\n- 〈냉장 식품〉 안쪽 (확실)';
  const recall = memo.buildVisitRecall(text, V3);
  const menu = { currentObservation: { observation: { visibleStations: [{ label: '1번 계산대 · 계산 가능' }, { label: '생활용품' }],
    gatePassages: [{ label: '입구를 지나 매장 안으로' }], area: { label: '매장 밖 로비 (매장 앞)' } } } };
  const shown = memo.recallForMenu(recall, menu);
  assert.equal(shown.memo, text, 'the whole memo is shown verbatim');
  assert.deepEqual(shown.recognized, [
    { label: '입구를 지나 매장 안으로', memoLine: '- 북쪽으로 〈입구를 지나 매장 안으로〉 (확실)' },
    { label: '1번 계산대', memoLine: '- 〈1번 계산대〉 남쪽 (흐릿)' },
  ]);
  assert.deepEqual(memo.recallForMenu(recall, { currentObservation: { observation: { visibleStations: [{ label: '냉장' }] } } }).recognized, [],
    'a partial name is not recognition');
  assert.deepEqual(memo.recallForMenu(recall, {}).recognized, []);
});

test('the owner adds rememberedVisit to every menu from a recall frozen at the first menu', async t => {
  const f = await owner(t);
  const begin0 = json(path.join(f.ownerDirectory, 'prepare-response.json'));
  assert.ok(begin0.requestId);
  // The start screen of this snapshot shows 1번 계산대 · 계산 가능; one tag matches it and one names nothing on screen.
  const recallText = '[장보기 순서]\n목록 보기\n[장소와 길]\n- 〈1번 계산대〉 바로 보임 (흐릿)\n- 〈없는 매대 이름〉 (흐릿)';
  fs.writeFileSync(path.join(f.ownerDirectory, 'visit-recall.json'), JSON.stringify(memo.buildVisitRecall(recallText, V3)));
  const begun = await f.call('begin_whole_trace_authoring', { maxRewritesPerDecision: 3 });
  assert.equal(begun.menu.rememberedVisit.version, 'visit-recall-v1');
  assert.equal(begun.menu.rememberedVisit.memo, recallText);
  assert.ok(memo.visibleNamesOf(begun.menu).has('1번 계산대'), 'fixture: the start screen shows the checkout');
  assert.deepEqual(begun.menu.rememberedVisit.recognized, [{ label: '1번 계산대', memoLine: '- 〈1번 계산대〉 바로 보임 (흐릿)' }]);
  const saved = json(path.join(f.ownerDirectory, 'responses', 'op-1.json'));
  assert.deepEqual(saved.result.menu.rememberedVisit, begun.menu.rememberedVisit, 'the owner response records exactly what the actor saw');

  fs.writeFileSync(path.join(f.ownerDirectory, 'visit-recall.json'), JSON.stringify(memo.buildVisitRecall('[장소와 길]\n- 바뀐 메모 (흐릿)', V3)));
  const again = await f.call('whole_trace_authoring_menu');
  assert.equal(again.menu.rememberedVisit.memo, recallText, 'a recall changed after the first menu is not used');
  const events = fs.readFileSync(path.join(f.ownerDirectory, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.filter(item => item.type === 'visit-recall').length, 1);
});

test('without a recall file the owner relays menus unchanged', async t => {
  const f = await owner(t);
  const begun = await f.call('begin_whole_trace_authoring', { maxRewritesPerDecision: 3 });
  assert.equal(Object.hasOwn(begun.menu, 'rememberedVisit'), false);
  fs.writeFileSync(path.join(f.ownerDirectory, 'visit-recall.json'), JSON.stringify(memo.buildVisitRecall('[장소와 길]\n- 늦게 생긴 메모 (흐릿)', V3)));
  const again = await f.call('whole_trace_authoring_menu');
  assert.equal(Object.hasOwn(again.menu, 'rememberedVisit'), false, 'a recall that appears after the first menu is never used');
});
