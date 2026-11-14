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
const { buildActorInput, renderActorInstructions, REPLACEMENTS, OMITTED_BUNDLE_KEYS, INSTRUCTION_TEMPLATES } = require('../whole-trace-actor-input.cjs');

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
