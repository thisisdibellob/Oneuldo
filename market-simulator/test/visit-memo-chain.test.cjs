'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../runtime.cjs');
const { createService } = require('../server.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { writeActorInput, buildActorInput } = require('../whole-trace-actor-input.cjs');
const { initChain, recordVisit, chainMetrics } = require('../visit-memo-chain.cjs');
const memo = require('../visit-memo.cjs');

const TEMPLATE = 'authoring-v5-h200-memo-v2';

async function prepared(t, personaId = 'mild-intellectual-disability-adult', shelfOrder) {
  const service = createService();
  t.after(() => service.close());
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'visit-memo-chain',
    objectives: [{ productId: 'milk', quantity: 1 }], environment: { cashierCount: 2, ...(shelfOrder && { shelfOrder }) } }));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'visit-memo-prepare-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return service.invokeTool('prepare_whole_trace', { personaId, seed: 'visit-memo-chain', snapshot,
    outputPath: path.join(directory, 'trace.json'), actionHorizon: 200 });
}

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visit-memo-chain-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let count = 0;
  const slot = response => {
    const directory = path.join(root, `slot-${++count}`);
    fs.mkdirSync(path.join(directory, 'owner'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'owner', 'prepare-response.json'), JSON.stringify(response));
    return directory;
  };
  const build = (directory, chainFile) => writeActorInput(path.join(directory, 'owner', 'prepare-response.json'),
    path.join(directory, 'actor-input.json'), { template: TEMPLATE, visitMemoChainFile: chainFile });
  const reply = (directory, body) => {
    const file = path.join(directory, 'actor-final-reply.txt');
    fs.writeFileSync(file, `slot ${directory} complete\n<visit-memo>\n${body}\n</visit-memo>\n`);
    return file;
  };
  const input = directory => JSON.parse(fs.readFileSync(path.join(directory, 'actor-input.json'), 'utf8'));
  return { root, slot, build, reply, input };
}

const FIRST = ['[장보기 순서]', '목록 보기 → 걷기 → 냉장고', '[장소와 길]', '- 우유: 들어가서 오른쪽, 끝까지 (흐릿)',
  '[다음엔]', '- 들어가면 오른쪽으로 간다.', '[어느 마트에서나]', '- 모르면 직원에게 묻는다.'].join('\n');
const SECOND = ['[장보기 순서]', '목록 보기 → 오른쪽 끝 냉장고 → 계산대', '[장소와 길]', '- 우유: 들어가서 오른쪽, 끝까지 (확실)',
  '- 계산대: 우유 다음 왼쪽 (흐릿)'].join('\n');

test('a chain hands each visit its number, the profile and the last valid memo, and records memos verbatim', async t => {
  const response = await prepared(t);
  const w = workspace(t);
  const chainFile = path.join(w.root, 'memo-chain.json');
  const first = w.slot(response);
  const chain = initChain(chainFile, path.join(first, 'owner', 'prepare-response.json'));
  assert.equal(chain.personaId, 'mild-intellectual-disability-adult');
  assert.equal(chain.storeKey, memo.storeKeyOf(response));

  const summary1 = w.build(first, chainFile);
  const input1 = w.input(first);
  assert.equal(input1.visit.number, 1);
  assert.equal(input1.visitMemoProfile.placeForm, 'route-sequence');
  assert.equal(Object.hasOwn(input1, 'previousVisit'), false);
  assert.equal(JSON.stringify(input1.bundle), JSON.stringify(buildActorInput(response).bundle), 'the bundle is unchanged');
  assert.equal(summary1.visitMemoChain.visitNumber, 1);
  assert.equal(summary1.visitMemoChain.profile.personaVersion, '6');
  const entry1 = recordVisit(chainFile, first, w.reply(first, FIRST));
  assert.equal(entry1.memoStatus, 'valid');
  assert.equal(fs.readFileSync(path.resolve(w.root, entry1.outputMemoFile), 'utf8'), FIRST);
  assert.equal(entry1.outputMemoFile, path.join('memos', 'visit-1-slot-1.txt'), 'the memo is kept beside the chain, not in the actor slot');
  assert.equal(entry1.metrics.vagueMarks, 1);

  const second = w.slot(response);
  w.build(second, chainFile);
  fs.writeFileSync(path.join(second, 'visit-memo.txt'), 'the actor may write its own file with this name');
  const input2 = w.input(second);
  assert.equal(input2.visit.number, 2);
  assert.equal(input2.previousVisit.memo, FIRST, 'the previous memo is carried verbatim');
  assert.equal(input2.previousVisit.version, 'previous-visit-memo-v2');
  assert.throws(() => recordVisit(chainFile, first, w.reply(second, SECOND)), /already recorded/);
  const entry2 = recordVisit(chainFile, second, w.reply(second, SECOND));
  assert.equal(entry2.inputMemoSha256, entry1.outputMemoSha256);
  assert.equal(entry2.metrics.sureMarks, 1);

  const third = w.slot(response);
  w.build(third, chainFile);
  assert.equal(w.input(third).previousVisit.memo, SECOND, 'visit 3 sees only the rewritten memo of visit 2');
  const rows = chainMetrics(chainFile);
  assert.deepEqual(rows.map(row => [row.visit, row.memoStatus, row.sectionItems.places]), [[1, 'valid', 1], [2, 'valid', 2]]);
});

test('missing, invalid and no-visit records are kept without repair and handled as specified', async t => {
  const response = await prepared(t);
  const w = workspace(t);
  const chainFile = path.join(w.root, 'memo-chain.json');
  const first = w.slot(response);
  initChain(chainFile, path.join(first, 'owner', 'prepare-response.json'));
  w.build(first, chainFile);
  recordVisit(chainFile, first, w.reply(first, FIRST));

  const failed = w.slot(response);
  w.build(failed, chainFile);
  assert.throws(() => recordVisit(chainFile, failed, w.reply(failed, FIRST), { noVisit: true }), /must not carry a memo/);
  const emptyReply = path.join(failed, 'empty-reply.txt');
  fs.writeFileSync(emptyReply, 'technical failure\n<visit-memo>\n</visit-memo>\n');
  assert.equal(recordVisit(chainFile, failed, emptyReply, { noVisit: true }).memoStatus, 'no-visit');

  const invalid = w.slot(response);
  w.build(invalid, chainFile);
  assert.equal(w.input(invalid).visit.number, 2, 'a no-visit record does not count as a visit');
  const invalidEntry = recordVisit(chainFile, invalid, w.reply(invalid, '우유는 오른쪽 냉장고'));
  assert.equal(invalidEntry.memoStatus, 'invalid');
  assert.match(invalidEntry.error, /no section headers/);
  assert.equal(fs.readFileSync(path.resolve(w.root, invalidEntry.outputMemoFile), 'utf8'), '우유는 오른쪽 냉장고', 'an invalid memo is kept verbatim');

  const missing = w.slot(response);
  w.build(missing, chainFile);
  assert.equal(w.input(missing).visit.number, 3);
  assert.equal(w.input(missing).previousVisit.memo, FIRST, 'after an invalid memo the last valid memo is handed over');
  const noTag = path.join(missing, 'reply.txt');
  fs.writeFileSync(noTag, 'done without a memo\n');
  assert.equal(recordVisit(chainFile, missing, noTag).memoStatus, 'missing');

  const stale = w.slot(response);
  w.build(stale, chainFile);
  fs.rmSync(path.join(stale, 'actor-input.json'));
  fs.copyFileSync(path.join(missing, 'actor-input.json'), path.join(stale, 'actor-input.json'));
  assert.throws(() => recordVisit(chainFile, stale, w.reply(stale, SECOND)), /expects visit 4/);
});

test('the v2 template needs a chain for the same person and store, and a profile for the persona', async t => {
  const response = await prepared(t);
  const w = workspace(t);
  const chainFile = path.join(w.root, 'memo-chain.json');
  const first = w.slot(response);
  initChain(chainFile, path.join(first, 'owner', 'prepare-response.json'));
  assert.throws(() => writeActorInput(path.join(first, 'owner', 'prepare-response.json'), path.join(first, 'actor-input.json'),
    { template: TEMPLATE }), /requires --visit-memo-chain/);
  const memoFile = path.join(w.root, 'memo.txt');
  fs.writeFileSync(memoFile, FIRST);
  assert.throws(() => writeActorInput(path.join(first, 'owner', 'prepare-response.json'), path.join(first, 'actor-input.json'),
    { template: TEMPLATE, visitMemoChainFile: chainFile, previousVisitMemoFile: memoFile }), /not --previous-visit-memo/);
  assert.throws(() => writeActorInput(path.join(first, 'owner', 'prepare-response.json'), path.join(first, 'actor-input.json'),
    { template: 'authoring-v5-h200-memo', visitMemoChainFile: chainFile }), /requires the authoring-v5-h200-memo-v2/);

  const otherBuilding = structuredClone(response);
  otherBuilding.bundle.worldReference.world.config.layoutId = 'corner';
  const elsewhere = w.slot(otherBuilding);
  assert.throws(() => w.build(elsewhere, chainFile), /start a new chain for a different store/);

  const rearranged = await prepared(t, undefined, ['drink', 'household', 'meal', 'produce', 'fresh']);
  assert.notDeepEqual(rearranged.bundle.worldReference.world.config.shelfOrder, response.bundle.worldReference.world.config.shelfOrder);
  assert.equal(memo.storeKeyOf(rearranged), memo.storeKeyOf(response), 'a different shelf order is still the same store');

  const careful = await prepared(t, 'careful-checker');
  const carefulSlot = w.slot(careful);
  assert.throws(() => initChain(path.join(w.root, 'careful-chain.json'), path.join(carefulSlot, 'owner', 'prepare-response.json')),
    /No visit memo profile for persona careful-checker/);
  assert.throws(() => memo.visitMemoProfileOf('mild-intellectual-disability-adult', '5'), /written for persona version 6/);
});

test('only [어느 마트에서나] lines carry verbatim to a new chain for a different store', async t => {
  const response = await prepared(t);
  const w = workspace(t);
  const chainFile = path.join(w.root, 'store-a.json');
  const first = w.slot(response);
  initChain(chainFile, path.join(first, 'owner', 'prepare-response.json'));
  w.build(first, chainFile);
  recordVisit(chainFile, first, w.reply(first, FIRST));

  const otherStore = structuredClone(response);
  otherStore.bundle.worldReference.world.config.layoutId = 'aisles';
  const newSlot = w.slot(otherStore);
  const chainB = path.join(w.root, 'store-b.json');
  assert.throws(() => initChain(path.join(w.root, 'same.json'), path.join(first, 'owner', 'prepare-response.json'),
    { carryAnyStoreFrom: chainFile }), /same store/);
  const created = initChain(chainB, path.join(newSlot, 'owner', 'prepare-response.json'), { carryAnyStoreFrom: chainFile });
  assert.equal(created.carriedAnyStoreTips.text, '- 모르면 직원에게 묻는다.');
  w.build(newSlot, chainB);
  const input = w.input(newSlot);
  assert.equal(input.visit.number, 1);
  assert.equal(Object.hasOwn(input, 'previousVisit'), false);
  assert.equal(input.otherStoreTips.tips, '- 모르면 직원에게 묻는다.');
  recordVisit(chainB, newSlot, w.reply(newSlot, SECOND));
  const next = w.slot(otherStore);
  w.build(next, chainB);
  assert.equal(Object.hasOwn(w.input(next), 'otherStoreTips'), false, 'once this store has its own memo the carried tips are not repeated');
});

test('the chain CLI reports usage and refuses to overwrite a chain', async t => {
  const response = await prepared(t);
  const w = workspace(t);
  const cli = path.resolve(__dirname, '../visit-memo-chain.cjs');
  const first = w.slot(response);
  const chainFile = path.join(w.root, 'memo-chain.json');
  const usage = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  const created = spawnSync(process.execPath, [cli, 'init', chainFile, path.join(first, 'owner', 'prepare-response.json')], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const again = spawnSync(process.execPath, [cli, 'init', chainFile, path.join(first, 'owner', 'prepare-response.json')], { encoding: 'utf8' });
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /EEXIST/);
});

const V3_TEMPLATE = 'authoring-v5-h200-memo-v3';
const V3_FIRST = ['[장보기 순서]', '목록 보기 → 냉장고 → 계산대', '[들어가는 길]', '- 북쪽으로 가서 서쪽 끝 〈입구를 지나 매장 안으로〉 (흐릿)',
  '[장소와 길]', '- 〈냉장 식품〉 안쪽 왼편 (흐릿)'].join('\n');

test('a v3 chain gives route instructions, writes the owner recall before begin and records labels', async t => {
  const response = await prepared(t);
  const w = workspace(t);
  const chainFile = path.join(w.root, 'memo-chain.json');
  const first = w.slot(response);
  const chain = initChain(chainFile, path.join(first, 'owner', 'prepare-response.json'), { template: V3_TEMPLATE });
  assert.equal(chain.template, V3_TEMPLATE);
  assert.equal(chain.condition, 'memory');
  const build = directory => writeActorInput(path.join(directory, 'owner', 'prepare-response.json'),
    path.join(directory, 'actor-input.json'), { template: V3_TEMPLATE, visitMemoChainFile: chainFile });
  assert.throws(() => w.build(first, chainFile), /uses authoring-v5-h200-memo-v3, not the requested authoring-v5-h200-memo-v2/);
  build(first);
  assert.ok(w.input(first).visitMemoProfile.instructions.some(line => line.startsWith('[들어가는 길]')), 'v3 adds the route instructions');
  assert.equal(fs.existsSync(path.join(first, 'owner', 'visit-recall.json')), false, 'no recall without a previous memo');
  const entry1 = recordVisit(chainFile, first, w.reply(first, V3_FIRST));
  assert.equal(entry1.memoStatus, 'valid');
  assert.equal(entry1.metrics.labels, 2);

  const second = w.slot(response);
  fs.mkdirSync(path.join(second, 'owner', 'responses'));
  fs.writeFileSync(path.join(second, 'owner', 'responses', 'op-1.json'), '{}');
  assert.throws(() => build(second), /before begin/);
  fs.rmSync(path.join(second, 'owner', 'responses'), { recursive: true });
  const summary = build(second);
  const recall = JSON.parse(fs.readFileSync(path.join(second, 'owner', 'visit-recall.json'), 'utf8'));
  assert.equal(recall.memo, V3_FIRST);
  assert.deepEqual(recall.labelled.map(item => item.label), ['입구를 지나 매장 안으로', '냉장 식품']);
  assert.equal(summary.visitMemoChain.recall.labels, 2);
  assert.equal(w.input(second).previousVisit.version, 'previous-visit-memo-v3');
  assert.equal(chainMetrics(chainFile)[0].labels, 2);
});

test('a no-memory control chain presents every visit as a first visit and still records the memos', async t => {
  const response = await prepared(t);
  const w = workspace(t);
  const chainFile = path.join(w.root, 'control-chain.json');
  const first = w.slot(response);
  initChain(chainFile, path.join(first, 'owner', 'prepare-response.json'), { template: V3_TEMPLATE, condition: 'no-memory' });
  assert.throws(() => initChain(path.join(w.root, 'x.json'), path.join(first, 'owner', 'prepare-response.json'), { condition: 'forgetful' }), /Unknown condition/);
  const build = directory => writeActorInput(path.join(directory, 'owner', 'prepare-response.json'),
    path.join(directory, 'actor-input.json'), { template: V3_TEMPLATE, visitMemoChainFile: chainFile });
  build(first);
  recordVisit(chainFile, first, w.reply(first, V3_FIRST));
  const second = w.slot(response);
  const summary = build(second);
  const input = w.input(second);
  assert.equal(input.visit.number, 1, 'the person is told this is a first visit');
  assert.equal(Object.hasOwn(input, 'previousVisit'), false);
  assert.equal(fs.existsSync(path.join(second, 'owner', 'visit-recall.json')), false);
  assert.equal(summary.visitMemoChain.visitIndex, 2);
  const entry2 = recordVisit(chainFile, second, w.reply(second, V3_FIRST));
  assert.equal(entry2.visit, 2, 'the chain still counts the real visit');
  assert.equal(entry2.inputMemoSha256, null);
  assert.deepEqual(chainMetrics(chainFile).map(row => [row.visit, row.condition]), [[1, 'no-memory'], [2, 'no-memory']]);
});
