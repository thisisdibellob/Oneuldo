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
const crypto = require('node:crypto');
const { buildActorInput, renderActorInstructions, REPLACEMENTS, OMITTED_BUNDLE_KEYS, INSTRUCTION_TEMPLATES, extractVisitMemo, validateVisitMemo, MEMO_FORMATS } = require('../whole-trace-actor-input.cjs');

async function prepared(t, extra = {}) {
  const service = createService();
  t.after(() => service.close());
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'actor-input',
    objectives: [{ productId: 'milk', quantity: 1 }], environment: { cashierCount: 2 } }));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-input-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return service.invokeTool('prepare_whole_trace', { personaId: 'mild-intellectual-disability-adult',
    seed: 'actor-input', snapshot, outputPath: path.join(directory, 'trace.json'), ...extra });
}

const text = value => JSON.stringify(value);

for (const [label, extra] of [['default bundle', {}],
  ['movement feedback bundle', { movementFeedbackVersion: 'recent-movement-anchor-capacity-v1' }]]) {
  test(`actor input omits hidden keys and rewrites their directives (${label})`, async t => {
    const response = await prepared(t, extra);
    const before = text(response);
    const actorInput = buildActorInput(response);

    assert.equal(text(response), before, 'the prepared response is not mutated');
    for (const key of OMITTED_BUNDLE_KEYS) assert.equal(Object.hasOwn(actorInput.bundle, key), false, key);
    assert.equal(Object.hasOwn(actorInput, 'diagnosticDirectory'), false);
    assert.equal(actorInput.requestId, response.requestId);
    assert.equal(actorInput.bundle.inputHash, response.bundle.inputHash);
    assert.deepEqual(actorInput.bundle.authoringGuide.identity, response.bundle.authoringGuide.identity);
    assert.deepEqual(actorInput.bundle.initialChoiceFrame, response.bundle.initialChoiceFrame);
    assert.deepEqual(actorInput.bundle.persona, response.bundle.persona);

    const output = text(actorInput.bundle);
    for (const entry of REPLACEMENTS) assert.equal(output.includes(entry.from), false, entry.id);
    assert.equal(output.includes('choiceCatalog.navigation'), false);
    assert.equal(output.includes('choiceCatalog.referenceAliases entry'), false);
    assert.match(actorInput.bundle.actionContract.walk, /current authoring menu/);
    assert.match(actorInput.actorInputProjection.notice, /currentObservation/);
    const applied = Object.fromEntries(actorInput.actorInputProjection.replacements.map(entry => [entry.id, entry.count]));
    assert.ok(applied['walk-from-menu'] >= 1);
    assert.ok(applied['world-reference-purpose'] >= 1);
  });
}

test('actor input rejects malformed prepare responses', () => {
  assert.throws(() => buildActorInput(null), /object/);
  assert.throws(() => buildActorInput({ bundle: {} }), /requestId/);
  assert.throws(() => buildActorInput({ requestId: 'r' }), /bundle/);
  assert.throws(() => buildActorInput({ requestId: 'r', bundle: { requestId: 'other' } }), /does not match/);
});

test('actor input CLI writes input and fixed instructions and never overwrites', async t => {
  const response = await prepared(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-input-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'owner'));
  const source = path.join(directory, 'owner', 'prepare-response.json');
  const output = path.join(directory, 'actor-input.json');
  fs.writeFileSync(source, JSON.stringify(response));
  const cli = path.resolve(__dirname, '../whole-trace-actor-input.cjs');
  const first = spawnSync(process.execPath, [cli, source, output], { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  const summary = JSON.parse(first.stdout);
  assert.equal(summary.requestId, response.requestId);
  assert.deepEqual(summary.omittedBundleKeys, ['worldReference', 'choiceCatalog', 'sourceFiles']);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).bundle.worldReference, undefined);
  assert.equal(summary.actorInstructions.templateId, 'authoring-v3');
  const instructions = fs.readFileSync(path.join(directory, 'actor-instructions.txt'), 'utf8');
  assert.equal(summary.actorInstructions.sha256, crypto.createHash('sha256').update(instructions).digest('hex'));
  assert.ok(instructions.startsWith(`Your slot directory is ${directory}.`));
  assert.ok(instructions.includes(`call ${directory}/owner --operation-file`));
  assert.doesNotMatch(instructions, /__[A-Z_]+__/);
  const second = spawnSync(process.execPath, [cli, source, output], { encoding: 'utf8' });
  assert.notEqual(second.status, 0);
});

test('actor input refuses a slot without owner and supports --no-instructions', async t => {
  const response = await prepared(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-input-layout-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'prepare-response.json');
  fs.writeFileSync(source, JSON.stringify(response));
  const cli = path.resolve(__dirname, '../whole-trace-actor-input.cjs');
  const output = path.join(directory, 'actor-input.json');
  const refused = spawnSync(process.execPath, [cli, source, output], { encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Owner directory not found/);
  assert.equal(fs.existsSync(output), false, 'nothing is written when the layout is refused');
  const plain = spawnSync(process.execPath, [cli, source, output, '--no-instructions'], { encoding: 'utf8' });
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(JSON.parse(plain.stdout).actorInstructions, null);
  assert.equal(fs.existsSync(path.join(directory, 'actor-instructions.txt')), false);
});

test('authoring-v1 template reproduces the instruction S used in past experiments', () => {
  // S (sha256 48eafa53...) was the fixed instruction of generation-isolation r2,
  // procedure-loop arm A and trait-v3 r6, written with the slot placeholder and
  // this checkout's absolute mailbox path.
  const template = fs.readFileSync(INSTRUCTION_TEMPLATES['authoring-v1'], 'utf8');
  const s = template.split('__MAILBOX_CLI__').join('/Users/mymacbookair/Desktop/Project/Oneuldo/market-simulator/whole-trace-mailbox.cjs');
  assert.equal(crypto.createHash('sha256').update(s).digest('hex'),
    '48eafa534f2ff71abc2db43a5ae9c8e3e9c2f5611e23d281f8988d38ef633d94');
  assert.throws(() => renderActorInstructions('authoring-v0', '/tmp/x'), /Unknown/);
  assert.throws(() => renderActorInstructions('authoring-v1', 'relative/slot'), /absolute/);
});

test('authoring-v2 is v1 plus only the continuation and limited-view paragraph', () => {
  const v1 = fs.readFileSync(INSTRUCTION_TEMPLATES['authoring-v1'], 'utf8');
  const v2 = fs.readFileSync(INSTRUCTION_TEMPLATES['authoring-v2'], 'utf8');
  const anchor = 'For final delivery call finish_and_submit_whole_trace';
  const [before, after] = v2.split(anchor);
  assert.ok(before.startsWith(v1.split(anchor)[0]));
  assert.equal(after, v1.split(anchor)[1]);
  const added = before.slice(v1.split(anchor)[0].length);
  assert.match(added, /Do not shorten it to a trivial valid trace/);
  assert.match(added, /not by itself a reason to stop/);
  assert.match(added, /voluntary giveUp remains allowed/);
  assert.match(added, /no minimum number of actions/);
});

test('authoring-v3 is v2 plus only the relative-direction sentences', () => {
  const v2 = fs.readFileSync(INSTRUCTION_TEMPLATES['authoring-v2'], 'utf8');
  const v3 = fs.readFileSync(INSTRUCTION_TEMPLATES['authoring-v3'], 'utf8');
  const anchor = 'A voluntary giveUp remains allowed';
  const [before, after] = v3.split(anchor);
  assert.ok(before.startsWith(v2.split(anchor)[0]));
  assert.equal(after, v2.split(anchor)[1]);
  const added = before.slice(v2.split(anchor)[0].length);
  assert.match(added, /relative to where the person stands now/);
  assert.match(added, /may lie in a different direction or be out of view/);
  assert.doesNotMatch(added, /checkout|south|exit/i);
});


test('v5 adds slot-local transport and literal-only authoring reminders without changing the v4 policy', () => {
  for (const suffix of ['', '-h200']) {
    const rendered = renderActorInstructions(`authoring-v5${suffix}`, '/experiment/slot');
    assert.match(rendered.text, /--operation-file \/experiment\/slot\/operations\//);
    assert.match(rendered.text, /never use \/tmp, \/private\/tmp/);
    assert.match(rendered.text, /Put choiceId inside choiceRef/);
    assert.match(rendered.text, /must never select a choiceId/);
    assert.match(rendered.text, /choiceUnavailableRewrite/);
    assert.match(rendered.text, /Preserve the first draft delayMs on every rewrite/);
  }
});

test('authoring-v5-h200-memo is v5-h200 plus only the previous-visit and visit-memo paragraphs', () => {
  const v5 = fs.readFileSync(INSTRUCTION_TEMPLATES['authoring-v5-h200'], 'utf8');
  const memo = fs.readFileSync(INSTRUCTION_TEMPLATES['authoring-v5-h200-memo'], 'utf8');
  const anchor = 'For final delivery call finish_and_submit_whole_trace with {}.';
  const [head, tail] = v5.split(anchor);
  const [memoHead, memoTail] = memo.split(anchor);
  assert.ok(memoHead.startsWith(head));
  assert.match(memoHead.slice(head.length), /^If actor-input\.json has a top-level previousVisit field/);
  assert.ok(memoTail.startsWith(tail.trimEnd()));
  assert.match(memoTail.slice(tail.trimEnd().length), /^\n\nAfter final delivery, write the person's visit memo:.*at most 300 characters/s);
  assert.doesNotMatch(renderActorInstructions('authoring-v5-h200-memo', '/experiment/slot').text, /__[A-Z_]+__/);
});

test('visit memo extraction takes the last tagged memo verbatim and never repairs it', () => {
  assert.equal(extractVisitMemo('done\n<visit-memo>\n우유는 들어가서 왼쪽 냉장 매대.\n</visit-memo>\n'), '우유는 들어가서 왼쪽 냉장 매대.');
  assert.equal(extractVisitMemo('<visit-memo>a</visit-memo> then <visit-memo>b</visit-memo>'), 'b');
  assert.equal(extractVisitMemo('<visit-memo></visit-memo>'), '');
  assert.equal(extractVisitMemo('no memo here'), null);
  assert.throws(() => validateVisitMemo(''), /empty/);
  assert.throws(() => validateVisitMemo('가'.repeat(301)), /301 characters/);
  assert.equal(validateVisitMemo(' 가'.repeat(150)).characters, 299);
});

test('a previous visit memo is carried verbatim into the actor copy only with a memo template', async t => {
  const response = await prepared(t, { actionHorizon: 200 });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-input-memo-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'owner'));
  const source = path.join(directory, 'owner', 'prepare-response.json');
  const output = path.join(directory, 'actor-input.json');
  const memoFile = path.join(directory, 'memo.txt');
  const memo = '들어가서 왼쪽으로 가면 냉장 매대에 우유가 있었다. 계산대는 출구 옆.';
  fs.writeFileSync(source, JSON.stringify(response));
  fs.writeFileSync(memoFile, `${memo}\n`);
  const cli = path.resolve(__dirname, '../whole-trace-actor-input.cjs');
  const refused = spawnSync(process.execPath, [cli, source, output, '--template', 'authoring-v5-h200', '--previous-visit-memo', memoFile], { encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /-memo instruction template/);
  assert.equal(fs.existsSync(output), false);
  const written = spawnSync(process.execPath, [cli, source, output, '--template', 'authoring-v5-h200-memo', '--previous-visit-memo', memoFile], { encoding: 'utf8' });
  assert.equal(written.status, 0, written.stderr);
  const summary = JSON.parse(written.stdout);
  const actorInput = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(actorInput.previousVisit.memo, memo);
  assert.equal(actorInput.previousVisit.version, 'previous-visit-memo-v1');
  assert.equal(actorInput.bundle.inputHash, response.bundle.inputHash, 'the prepared bundle identity is unchanged');
  assert.equal(text(actorInput.bundle), text(buildActorInput(response).bundle), 'the memo is not merged into the bundle');
  assert.equal(summary.previousVisit.characters, Array.from(memo).length);
  assert.equal(summary.previousVisit.memoSha256, crypto.createHash('sha256').update(memo).digest('hex'));
  assert.equal(summary.actorInstructions.templateId, 'authoring-v5-h200-memo');
  const firstVisit = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-input-first-'));
  t.after(() => fs.rmSync(firstVisit, { recursive: true, force: true }));
  fs.mkdirSync(path.join(firstVisit, 'owner'));
  fs.writeFileSync(path.join(firstVisit, 'owner', 'prepare-response.json'), JSON.stringify(response));
  const plain = spawnSync(process.execPath, [cli, path.join(firstVisit, 'owner', 'prepare-response.json'), path.join(firstVisit, 'actor-input.json'), '--template', 'authoring-v5-h200-memo'], { encoding: 'utf8' });
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(JSON.parse(plain.stdout).previousVisit, null);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(firstVisit, 'actor-input.json'), 'utf8')), 'previousVisit'), false);
});

const MEMO_V2 = MEMO_FORMATS['authoring-v5-h200-memo-v2'];
const sectionedMemo = [
  '[장보기 순서]', '목록 보고 → 오른쪽 안쪽 냉장고 → 계산대',
  '[기억나는 장면]', '- 과일만 보였다 → 왼쪽으로 갔다 → 벽이 나와 헤맸다. 답답했다.',
  '[장소와 길]', '- 우유: 입구에서 오른쪽 벽 끝 냉장고 (확실)', '- 계산대: 입구 근처 (흐릿)',
  '[다음엔]', '- 과일이 보이면 오른쪽 벽 쪽으로 간다.',
].join('\n');

test('a v2 visit memo is validated by shape only and empty or omitted sections are allowed', () => {
  const result = validateVisitMemo(`\n${sectionedMemo}\n`, MEMO_V2);
  assert.equal(result.text, sectionedMemo, 'the memo is carried verbatim apart from outer whitespace');
  assert.deepEqual(result.sections.map(section => [section.id, section.items]),
    [['routine', 0], ['scenes', 1], ['places', 2], ['nextTime', 1]]);
  assert.deepEqual(validateVisitMemo('[장소와 길]\n- 우유는 냉장고 (흐릿)\n[다음엔]', MEMO_V2).sections.map(section => section.id), ['places', 'nextTime']);
  assert.throws(() => validateVisitMemo('우유는 냉장고', MEMO_V2), /no section headers/);
  assert.throws(() => validateVisitMemo('메모\n[장소와 길]\n- 우유', MEMO_V2), /before the first section header/);
  assert.throws(() => validateVisitMemo('[장소와 길]\n[다음엔]', MEMO_V2), /no content/);
  assert.throws(() => validateVisitMemo('[기분]\n좋았다', MEMO_V2), /unknown section header/);
  assert.throws(() => validateVisitMemo('[다음엔]\n- a\n[장소와 길]\n- b', MEMO_V2), /out of order/);
  assert.throws(() => validateVisitMemo('[다음엔]\n- a\n[다음엔]\n- b', MEMO_V2), /repeats section/);
  assert.throws(() => validateVisitMemo('[기억나는 장면]\n- a\n- b\n- c\n- d', MEMO_V2), /limit is 3/);
  assert.throws(() => validateVisitMemo('[다음엔]\n- a\n- b\n- c', MEMO_V2), /limit is 2/);
  assert.throws(() => validateVisitMemo(`[장보기 순서]\n${'가'.repeat(500)}`, MEMO_V2), /limit is 500/);
  assert.equal(validateVisitMemo(`[장보기 순서]\n${'가'.repeat(400)}`, MEMO_V2).characters, 409, 'v2 allows more than the v1 limit of 300');
});

test('the v2 memo template carries a sectioned memo and refuses an unsectioned one', async t => {
  const response = await prepared(t, { actionHorizon: 200 });
  const cli = path.resolve(__dirname, '../whole-trace-actor-input.cjs');
  const slot = () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-input-memo-v2-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.mkdirSync(path.join(directory, 'owner'));
    fs.writeFileSync(path.join(directory, 'owner', 'prepare-response.json'), JSON.stringify(response));
    return directory;
  };
  const run = (directory, memoText) => {
    const memoFile = path.join(directory, 'memo.txt');
    fs.writeFileSync(memoFile, memoText);
    return spawnSync(process.execPath, [cli, path.join(directory, 'owner', 'prepare-response.json'), path.join(directory, 'actor-input.json'),
      '--template', 'authoring-v5-h200-memo-v2', '--previous-visit-memo', memoFile], { encoding: 'utf8' });
  };
  const refusedSlot = slot();
  const refused = run(refusedSlot, '들어가서 왼쪽으로 가면 냉장 매대에 우유가 있었다.\n');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /no section headers/);
  assert.equal(fs.existsSync(path.join(refusedSlot, 'actor-input.json')), false);
  const directory = slot();
  const written = run(directory, `${sectionedMemo}\n`);
  assert.equal(written.status, 0, written.stderr);
  const summary = JSON.parse(written.stdout);
  const actorInput = JSON.parse(fs.readFileSync(path.join(directory, 'actor-input.json'), 'utf8'));
  assert.equal(actorInput.previousVisit.version, 'previous-visit-memo-v2');
  assert.equal(actorInput.previousVisit.memo, sectionedMemo);
  assert.match(actorInput.previousVisit.notice, /\[다음엔\]/);
  assert.equal(text(actorInput.bundle), text(buildActorInput(response).bundle), 'the memo is not merged into the bundle');
  assert.deepEqual(summary.previousVisit.sections.map(section => section.id), ['routine', 'scenes', 'places', 'nextTime']);
  assert.equal(summary.actorInstructions.templateId, 'authoring-v5-h200-memo-v2');
  const instructions = fs.readFileSync(path.join(directory, 'actor-instructions.txt'), 'utf8');
  for (const header of ['[장보기 순서]', '[기억나는 장면]', '[장소와 길]', '[다음엔]', '[어느 마트에서나]']) assert.ok(instructions.includes(header), header);
  assert.match(instructions, /rewrite it as one memo/);
});

test('the v2 memo template differs from the v1 memo template only in the two memo paragraphs', () => {
  const lines = file => fs.readFileSync(INSTRUCTION_TEMPLATES[file], 'utf8').split('\n');
  const v1 = lines('authoring-v5-h200-memo');
  const v2 = lines('authoring-v5-h200-memo-v2');
  assert.equal(v2.length, v1.length);
  const changed = v1.map((line, index) => line === v2[index] ? null : index).filter(index => index !== null);
  assert.deepEqual(changed.map(index => v1[index].slice(0, 30)), ['If actor-input.json has a top-', 'After final delivery, write th']);
});
