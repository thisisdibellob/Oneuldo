'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { createService, definitions } = require('../server.cjs');
const { IDS } = require('../src/personaValidationBlind.cjs');
const run = require('../src/personaValidationRun.cjs');
function fixture(t, validationMode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-reviewer-integration-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotFilePaths = {}, goals = [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 },
    { productId: 'water', quantity: 2 }, { productId: 'banana', quantity: 1 }, { productId: 'eggs', quantity: 1 }];
  for (const [condition, count] of [['low', 2], ['high', 5]]) {
    const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: `reviewer-${condition}`, difficulty: 'exact', objectives: goals.slice(0, count) }));
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`);
    fs.writeFileSync(snapshotFilePaths[condition], JSON.stringify(snapshot));
  }
  const service = createService({ generateTrace: () => { throw new Error('Validation must not call a generator'); } });
  t.after(() => service.close());
  return { service, args: { runId: 'reviewers', outputDirectory: directory, snapshotFilePaths, seeds: ['s1'], validationMode,
    ...(validationMode === 'legacy' ? { personaIds: IDS } : { profiles: ['low', 'high'].map(level => ({
      id: `checking-${level}`, basePersonaId: 'neutral-adult-control', traits: { checking: level } })) }) } };
}
function populate(prepared) {
  const manifest = run.readManifest(prepared.runDirectory);
  for (const slot of prepared.slots) {
    const personaVersion = manifest.version === 3 ? manifest.profiles[slot.personaId].persona.version
      : require(`../personas/${slot.personaId}.json`).version;
    const trace = { traceSchemaVersion: '2', traceId: `fixture-${slot.condition}-${slot.personaId}`, personaId: slot.personaId,
      personaVersion, seed: slot.seed, generationPolicy: 'stochastic', target: { snapshotId: slot.snapshotId }, steps: [
        { id: 'a', type: 'readList', reactionDelayMs: 100, reason: '목록을 읽는다.' },
        { id: 'b', type: 'openShelf', stationId: 'fresh', reactionDelayMs: 120, reason: '매대를 연다.' },
        { id: 'c', type: 'dragProduct', productId: 'milk', quantity: 1, gesture: { outcome: 'drop' }, reactionDelayMs: 200, reason: '우유를 담는다.' },
        { id: 'd', type: 'checkout', reactionDelayMs: 200, reason: '계산한다.' },
      ] };
    fs.mkdirSync(path.dirname(slot.tracePath), { recursive: true }); fs.writeFileSync(slot.tracePath, JSON.stringify(trace));
  }
}
for (const validationMode of ['legacy', 'traits']) {
  test(`${validationMode} MCP supports named expert reviewers and additive legacy storage through the report`, async t => {
    const f = fixture(t, validationMode), invoke = f.service.invokeTool;
    const prepared = await invoke('prepare_persona_validation', f.args); populate(prepared);
    const input = { runDirectory: prepared.runDirectory };
    await invoke('measure_persona_validation', { ...input, allowFixture: true });
    const first = { reviewerId: 'expert-01', reviewerKind: 'expert', reviewerSession: 'independent-01' };
    const second = { reviewerId: 'expert-02', reviewerKind: 'expert', reviewerSession: 'independent-02' };
    await invoke('prepare_blind_review', { ...input, reviewerId: first.reviewerId, reviewerKind: first.reviewerKind, panel: 'A', allowFixture: true });
    const key = JSON.parse(fs.readFileSync(path.join(input.runDirectory, 'blind-key.json')));
    const answers = panel => Object.fromEntries(key.filter(row => row.version === panel).map(row => [row.opaqueId,
      validationMode === 'traits' ? { traits: row.traits } : row.personaId]));
    const submitted = await invoke('submit_blind_review', { ...input, ...first, panel: 'A', answers: answers('A') });
    assert.equal(submitted.reviewerKind, 'expert');
    await assert.rejects(invoke('prepare_blind_review', { ...input, reviewerId: second.reviewerId, reviewerKind: second.reviewerKind, panel: 'B', allowFixture: true }), /Score panel A/);
    await assert.rejects(invoke('submit_blind_review', { ...input, ...second, panel: 'B', answers: answers('B') }), /Panel A/);
    await invoke('submit_blind_review', { ...input, ...second, panel: 'A', answers: answers('A') });
    let report = await invoke('persona_validation_report', input), saved = JSON.parse(fs.readFileSync(report.reportPath));
    const agreement = value => validationMode === 'traits' ? value.interReviewerAgreement.A.perTrait.checking : value.interReviewerAgreement.A.persona;
    assert.equal(saved.blindReviews.length, 2); assert.equal(saved.blindReview, null);
    assert.equal(agreement(saved).method, 'cohen-kappa'); assert.equal(agreement(saved).kappa, 1);
    assert.ok(saved.blindReviews.every(row => row.reviewerModel === null));
    const old = await invoke('submit_blind_review', { ...input, panel: 'A', answers: answers('A'), reviewerModel: 'fixture-model', reviewerSession: 'independent-old' });
    const bytes = fs.readFileSync(old.reviewPath, 'utf8');
    await invoke('prepare_blind_review', { ...input, reviewerId: first.reviewerId, reviewerKind: first.reviewerKind, panel: 'B', allowFixture: true });
    await invoke('submit_blind_review', { ...input, ...first, panel: 'B', answers: answers('B') });
    assert.equal(fs.readFileSync(old.reviewPath, 'utf8'), bytes);
    report = await invoke('persona_validation_report', input); saved = JSON.parse(fs.readFileSync(report.reportPath));
    assert.equal(saved.blindReviews.length, 3); assert.equal(agreement(saved).method, 'fleiss-kappa'); assert.equal(agreement(saved).kappa, 1);
    assert.ok(saved.blindReview.A); assert.equal(saved.fixtureOnly, true);
    const source = fs.readFileSync(path.join(input.runDirectory, 'blind-key.json'), 'utf8');
    fs.writeFileSync(path.join(input.runDirectory, 'blind-key.json'), source + ' ');
    await assert.rejects(invoke('persona_validation_report', input), /Blind evidence changed/);
  });
}
test('MCP schema exposes reviewer identity and allows a self-reported expert without a model label', () => {
  for (const name of ['prepare_blind_review', 'submit_blind_review']) {
    const schema = definitions.find(tool => tool.name === name).inputSchema;
    assert.equal(schema.properties.reviewerId.type, 'string');
    assert.deepEqual(schema.properties.reviewerKind.enum, ['llm', 'expert']);
  }
  assert.ok(!definitions.find(tool => tool.name === 'submit_blind_review').inputSchema.required.includes('reviewerModel'));
});
