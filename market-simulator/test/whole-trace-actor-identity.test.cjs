'use strict';
// A whole-trace request may name a separate actor identity. Luna stays the default; a Claude actor is recorded as
// itself (model and reasoning effort) in the bundle, the input hash and the saved trace, never under the Luna label.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { createMarketReplaySnapshot, validateMarketReplayTrace } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { WholeTraceSession } = require('../src/wholeTrace/wholeTraceSession.ts');
const { wholeTraceActorIdentity } = require('../src/wholeTrace/wholeTraceContracts.ts');
const { validateTrace } = require('../src/traceValidation.ts');

function fixture(extra = {}) {
  const config = { seed: 'actor-identity-store', objectives: [{ productId: 'milk', quantity: 1 }],
    stockPerProduct: 5, environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'checkout', environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  return { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'actor-identity',
    maxActions: 100, maxRepairs: 0, timingProfile: 'original', wayfindingVersion: 'wayfinding-v4', ...extra };
}
function draft(choiceId) {
  return { choiceRef: { choiceId }, delayMs: 800, reason: '현재 표시된 조작으로 종료와 저장 계약을 확인한다',
    basis: { intent: 'finish', goalId: null, memoryUses: [] },
    actorState: { activity: 'finish', task: '현재 화면에서 선택한 조작을 수행한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar',
      thought: { plan: '지금까지 확인한 상태로 이번 장보기를 마친다' } } };
}

test('the actor identity defaults to Luna low and only declared identities are accepted', () => {
  assert.deepEqual(wholeTraceActorIdentity(), { model: 'gpt-6-luna', reasoningEffort: 'low' });
  assert.deepEqual(wholeTraceActorIdentity('claude-sonnet-5-5'), { model: 'claude-sonnet-5-5', reasoningEffort: 'default' });
  assert.throws(() => wholeTraceActorIdentity('claude-opus-5-5'), /actorModel must be one of/);
  assert.throws(() => buildWholeTraceBundle(fixture({ actorModel: 'gpt-5' }), 'identity-bad'), /actorModel must be one of/);
});

test('a Claude bundle carries the Claude identity and a different input hash; the default bundle is unchanged', () => {
  const luna = buildWholeTraceBundle(fixture(), 'identity-luna');
  const claude = buildWholeTraceBundle(fixture({ actorModel: 'claude-sonnet-5-5' }), 'identity-claude');
  assert.equal(luna.model, 'gpt-6-luna'); assert.equal(luna.reasoningEffort, 'low');
  assert.equal(claude.model, 'claude-sonnet-5-5'); assert.equal(claude.reasoningEffort, 'default');
  assert.notEqual(claude.inputHash, luna.inputHash);
  assert.equal(JSON.stringify(claude).includes('gpt-6-luna'), false, 'no Luna label inside a Claude bundle');
});

test('the compiler refuses a bundle whose identity differs from the request', async () => {
  const settings = fixture({ actorModel: 'claude-sonnet-5-5' });
  const lunaBundle = buildWholeTraceBundle(fixture(), 'identity-mismatch');
  await assert.rejects(compileWholeTraceCandidate(settings, lunaBundle, { decisions: [] }),
    error => error.validation?.code === 'PREPARED_INPUT_MISMATCH' || /PREPARED_INPUT_MISMATCH|differs/.test(String(error.message)));
});

test('a Claude session saves a trace labelled Claude that passes the app and offline validators', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-identity-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const settings = fixture({ actorModel: 'claude-sonnet-5-5' });
  assert.throws(() => new WholeTraceSession({ ...settings, llm: { model: 'gpt-6-luna' }, outputPath: path.join(directory, 'x.json') }),
    /prepared claude-sonnet-5-5 session/);
  const outputPath = path.join(directory, 'trace.json');
  const session = new WholeTraceSession({ ...settings, outputPath });
  assert.equal(session.prepare().bundle.model, 'claude-sonnet-5-5');
  assert.equal(session.status().model, 'claude-sonnet-5-5');
  assert.equal(session.status().reasoningEffort, 'default');
  await session.beginAuthoring();
  for (const choiceId of ['checkout/checkout', 'control/submit']) {
    const result = await session.appendAuthoring(draft(choiceId));
    assert.equal(result.accepted, true, JSON.stringify(result.issues));
  }
  const result = await session.submit(session.finishAuthoring().candidate);
  assert.equal(result.status, 'complete');
  const trace = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(trace.generation.model, 'claude-sonnet-5-5');
  assert.equal(trace.generation.reasoningEffort, 'default');
  assert.equal(trace.generation.actorPolicyVersion, 'whole-trace-v3');
  assert.deepEqual(validateMarketReplayTrace(trace, settings.snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateTrace(trace, settings.snapshot), { valid: true, errors: [] });
  // A Claude trace relabelled as Luna, or Claude with Luna's effort, is not a declared identity.
  for (const [model, reasoningEffort] of [['gpt-6-luna', 'default'], ['claude-sonnet-5-5', 'low']]) {
    const forged = structuredClone(trace); forged.generation.model = model; forged.generation.reasoningEffort = reasoningEffort;
    assert.equal(validateMarketReplayTrace(forged, settings.snapshot).valid, false);
  }
});

test('prepare_whole_trace passes the declared actor identity into the prepared bundle and keeps Luna as the default', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-identity-tool-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const service = require('../server.cjs').createService();
  const { snapshot, ...rest } = fixture();
  const snapshotFilePath = path.join(directory, 'snapshot.json');
  fs.writeFileSync(snapshotFilePath, JSON.stringify(snapshot));
  const base = { personaId: rest.personaId, seed: rest.seed, snapshotFilePath, maxRepairs: 0, wayfindingVersion: 'wayfinding-v4' };
  const claude = await service.invokeTool('prepare_whole_trace', { ...base, actorModel: 'claude-sonnet-5-5', outputPath: path.join(directory, 'claude.json') });
  assert.equal(claude.bundle.model, 'claude-sonnet-5-5');
  assert.equal(claude.bundle.reasoningEffort, 'default');
  assert.equal(JSON.stringify(claude.bundle).includes('gpt-6-luna'), false);
  const luna = await service.invokeTool('prepare_whole_trace', { ...base, outputPath: path.join(directory, 'luna.json') });
  assert.equal(luna.bundle.model, 'gpt-6-luna');
  assert.equal(luna.bundle.reasoningEffort, 'low');
  await assert.rejects(service.invokeTool('prepare_whole_trace', { ...base, actorModel: 'claude-opus-5-5', outputPath: path.join(directory, 'bad.json') }));
});

test('the validation control persona is open to a Claude actor only as an unbound first visit', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-identity-control-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const service = require('../server.cjs').createService();
  const { snapshot, seed } = fixture();
  const snapshotFilePath = path.join(directory, 'snapshot.json');
  fs.writeFileSync(snapshotFilePath, JSON.stringify(snapshot));
  const base = { personaId: 'neutral-adult-control', seed, snapshotFilePath, maxRepairs: 0, wayfindingVersion: 'wayfinding-v4' };
  const claude = await service.invokeTool('prepare_whole_trace', { ...base, actorModel: 'claude-sonnet-5-5', outputPath: path.join(directory, 'claude.json') });
  assert.equal(claude.bundle.persona.id, 'neutral-adult-control');
  assert.equal(claude.bundle.model, 'claude-sonnet-5-5');
  // Luna keeps the validation-run binding; Claude cannot bring memory, a learner or a trial to the control.
  await assert.rejects(service.invokeTool('prepare_whole_trace', { ...base, outputPath: path.join(directory, 'luna.json') }),
    /Control requires an explicit first-play validation run slot/);
  await assert.rejects(service.invokeTool('prepare_whole_trace', { ...base, actorModel: 'claude-sonnet-5-5',
    attentionExperience: { visit: 'first-play' }, outputPath: path.join(directory, 'memory.json') }), /actorModel is an unbound experiment option/);
});
