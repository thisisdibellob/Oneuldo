const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { generateTrace: originalGenerateTrace, generateBatch: originalGenerateBatch, summarizeTrace } = require('../src/simulator.ts');
const generateTrace = options => originalGenerateTrace({mode:'stochastic',...options});
const generateBatch = options => originalGenerateBatch({mode:'stochastic',...options});
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession, createMarketAgentAdapter } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, validateMarketReplaySnapshot, validateMarketReplayTrace, marketReplayTraceId, marketReplayFingerprint } = require('../../frontend/src/game/marketReplayTrace.ts');
const { marketProducts, marketMission } = require('../../frontend/src/game/scenarios.ts');
const snapshot = (overrides = {}) => createMarketReplaySnapshot(createMarketSession({ seed: 'same-store', ...overrides }));
// Retained v1 assistance-workflow fixtures explicitly use their original phone frame.
// Real browser snapshots bind the current measured presentation independently.
const assistancePresentation = { viewport: { width: 390, height: 844 }, zoom: 1.3,
  fontScale: 1, safeArea: { top: 0, bottom: 0 } };
const reseal = t => { t.traceId = marketReplayTraceId(t); return t; };
const isWalk = step => step.type === 'walkTo' || step.type === 'walkToAnchor';
const guardFor = (initial, trace) => new TraceGuard(initial, trace.personaId, trace.personaVersion, trace.generation.model, trace.traceSchemaVersion === '2');

// Only these explicitly named compatibility fixtures use the retained v1 generator.
// Active profiles stay attention-enabled; restore the local module mock before another test runs.
async function generateLegacyFixture(options) {
  const profiles = require('../src/personas.ts');
  const original = profiles.getPersona;
  const replacement = mock.method(profiles, 'getPersona', id => {
    const profile = original(id); delete profile.attention; delete profile.shoppingStyle;
    return { ...profile, version: '1' };
  });
  try {
    const trace = await generateTrace(options);
    assert.equal(trace.traceSchemaVersion, '1'); assert.equal(trace.policyVersion, '3');
    assert.equal(trace.attentionExperience, undefined);
    return trace;
  } finally { replacement.mock.restore(); }
}

test('offline seed and snapshot reproduce pure intentions; scratch movement retains all guards', async () => {
  const original = global.fetch;
  global.fetch = () => { throw new Error('Network forbidden'); };
  try {
    const initial = snapshot();
    const options = { personaId: 'careful-checker', seed: 'repeatable', snapshot: initial };
    const a = await generateTrace(options), b = await generateTrace(options);
    assert.deepEqual(a, b);
    assert.deepEqual(validateTrace(a, initial), { valid: true, errors: [] });
    assert.equal(a.generation.reproducibility, 'seed-and-snapshot');
    assert.equal(a.traceSchemaVersion, '2'); assert.equal(a.policyVersion, '5');
    assert.equal(a.experienceMode, 'first-play');
    assert.equal(a.behaviorLogs, undefined);
    assert.equal(a.episode, undefined);
    assert.deepEqual(a.steps.slice(-3).map(s => s.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
    const guard = guardFor(initial, a);
    let moves = 0;
    for (const step of a.steps) {
      const result = guard.execute(step);
      assert.ok(!('action' in step) && !('path' in step) && !('at' in step));
      for (const action of result.actions) {
        assert.notEqual(action.type, 'setPosition');
        if (action.type === 'move') { moves++; assert.ok(Math.hypot(action.dx, action.dy) <= 32); }
      }
    }
    assert.ok(moves > 20);
    assert.ok(a.steps.filter(isWalk).length < moves, 'local intentions must expand into bounded primitive movements');
    const adapter = createMarketAgentAdapter({ ...initial.config, provenance: { source: 'synthetic', personaId: 'guard', agentModel: 'test' } }, initial.environment);
    assert.throws(() => adapter.act({ type: 'setPosition', point: initial.environment.spawn }), /not allowed/);
    assert.ok(adapter.act({ type: 'move', dx: 100, dy: 0 }).lastActionError);
  } finally { global.fetch = original; }
});

test('initial snapshot identity excludes execution identity and rejects stale or modified bindings', async () => {
  const first = createMarketSession({ seed: 'identity', sessionId: 'one', startedAt: '2020-01-01T00:00:00Z' });
  const second = createMarketSession({ seed: 'identity', sessionId: 'two', startedAt: '2025-01-01T00:00:00Z', provenance: { source: 'human', participantId: 'other' } });
  assert.deepEqual(createMarketReplaySnapshot(first), createMarketReplaySnapshot(second));
  first.cart.milk = 1;
  assert.throws(() => createMarketReplaySnapshot(first), /untouched/);
  const initial = snapshot();
  const t = await generateTrace({ personaId: 'quick-decider', seed: 7, snapshot: initial });
  assert.equal(validateTrace(t, snapshot({ seed: 'another-store' })).valid, false);
  const damaged = structuredClone(initial);
  damaged.initialStock.milk = 100;
  assert.equal(validateMarketReplaySnapshot(damaged).valid, false);
  const { snapshotId, ...body } = damaged;
  damaged.snapshotId = `snapshot-${marketReplayFingerprint(body)}`;
  assert.equal(validateMarketReplaySnapshot(damaged).valid, false, 'resealing cannot bypass stock/config consistency');
  const withMission = createMarketReplaySnapshot(second, { ...marketMission, id: 'bound-mission' });
  // This tests mission identity, independently of whether a stochastic walk
  // finishes under the current visible-anchor graph and its action budget.
  const bound = await generateTrace({ mode: 'llm', llm: { model: 'offline-binding-fixture' },
    personaId: 'careful-checker', seed: 1, snapshot: withMission,
    actorDecisionProvider: async () => ({ action: { type: 'giveUp' }, delayMs: 100, reason: 'Offline mission binding fixture' }) });
  assert.equal(bound.target.missionId, 'bound-mission');
  assert.equal(validateTrace(bound, withMission).valid, true);
  assert.equal(validateTrace(bound, createMarketReplaySnapshot(second)).valid, false);
});

test('different policy seeds vary choices in one snapshot, preserving visible family-name matching', async () => {
  const fingerprints = new Set();
  for (let i = 0; i < 8; i++) {
    const trace = await generateTrace({ personaId: 'quick-decider', seed: `variant-${i}`, snapshot: snapshot() });
    fingerprints.add(JSON.stringify(trace.steps.map(s => [s.type, s.target, s.stationId, s.checkoutId, s.productId, s.quantity, s.choice, s.scrollFraction])));
  }
  assert.ok(fingerprints.size > 1, 'policy seeds must change observable intentions, not only reaction time');
  const inventory = ['premium-eggs', ...marketProducts.filter(p => p.categoryId === 'fresh' && (p.familyId ?? p.id) !== 'eggs').slice(0, 11).map(p => p.id)];
  const eggs = await generateTrace({ personaId: 'careful-checker', seed: 'eggs', snapshot: snapshot({
    objectives: [{ productId: 'premium-eggs', quantity: 1 }], inventoryProductIds: { fresh: inventory },
  }) });
  assert.ok(eggs.steps.some(s => s.type === 'dragProduct' && s.productId === 'premium-eggs'));
});

test('shared schema rejects renderer commands, paths, invalid timings, and unsupported terminal flows', async () => {
  const initial = snapshot();
  const original = await generateTrace({ personaId: 'quick-decider', seed: 1, snapshot: initial });
  const bad = edit => { const trace = structuredClone(original); edit(trace); return validateMarketReplayTrace(reseal(trace), initial); };
  assert.equal(bad(t => { t.steps[1] = { ...t.steps[1], type: 'setPosition', point: { x: 0, y: 0 } }; }).valid, false);
  assert.equal(bad(t => { t.steps.find(isWalk).path = [{ x: 1, y: 2 }]; }).valid, false);
  assert.equal(bad(t => { t.steps[0].reactionDelayMs = -1; }).valid, false);
  assert.equal(bad(t => { t.steps.find(isWalk).movement.running = true; }).valid, false);
  assert.equal(bad(t => { t.steps.at(-2).type = 'retry'; }).valid, false);
  assert.equal(bad(t => { t.steps.at(-2).type = 'skipRating'; }).valid, false);
  assert.equal(bad(t => { t.steps[1].id = t.steps[0].id; }).valid, false);
});

test('semantic guard rejects remote shelf access, hidden products and unavailable stock even with a valid schema', async () => {
  const initial = snapshot();
  const original = await generateTrace({ personaId: 'careful-checker', seed: 'guard-test', snapshot: initial });
  const product = structuredClone(original);
  product.steps.find(s => s.type === 'dragProduct').productId = 'not-in-this-game';
  assert.equal(validateMarketReplayTrace(reseal(product), initial).valid, true);
  assert.equal(validateTrace(product, initial).valid, false);
  const empty = structuredClone(original);
  empty.steps.find(s => s.type === 'dragProduct').quantity = 99;
  assert.equal(validateTrace(reseal(empty), initial).valid, false);
  const remote = structuredClone(original);
  remote.steps = remote.steps.filter(s => !isWalk(s));
  assert.equal(validateTrace(reseal(remote), initial).valid, false);
});

test('missing cashier uses an employee conversation before review', async () => {
  for (const employeeCount of [1, 2]) {
    const initial = createMarketReplaySnapshot(createMarketSession({ seed: 'same-store',
      environment: { cashierCount: 0, employeeCount } }), undefined, assistancePresentation);
    const trace = await generateTrace({ personaId: 'careful-checker', seed: 'cashier', snapshot: initial });
    assert.ok(validateTrace(trace, initial).valid);
    assert.ok(trace.steps.some(s => s.type === 'talkToStaff' && s.choice === 'requestCashier'));
    assert.deepEqual(trace.steps.slice(-3).map(s => s.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
  }
});

test('attention generation limits reject incomplete plans without inventing a persona outcome', async () => {
  const initial = snapshot();
  for (const limits of [{ maxActions: 2 }, { timeBudgetMs: 1000 }]) {
    await assert.rejects(generateTrace({ personaId: 'quick-decider', seed: 'limit', snapshot: initial, ...limits }), /ATTENTION_GENERATION_LIMIT/);
  }
});

test('worker scheduling preserves byte-identical ordered traces and never overwrites files', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'market-traces-'));
  try {
    const base = { count: 6, seed: 'workers', snapshot: snapshot() };
    const one = await generateBatch({ ...base, concurrency: 1, outputPath: path.join(folder, 'one.jsonl') });
    const three = await generateBatch({ ...base, concurrency: 3, outputPath: path.join(folder, 'three.jsonl') });
    const left = await fs.readFile(one.outputPath, 'utf8');
    assert.equal(left, await fs.readFile(three.outputPath, 'utf8'));
    for (const line of left.trim().split('\n')) {
      const trace = JSON.parse(line);
      assert.ok(validateTrace(trace, base.snapshot).valid);
      assert.equal(trace.episode, undefined);
      assert.ok(summarizeTrace(trace).steps > 2);
    }
    await assert.rejects(generateBatch({ ...base, outputPath: one.outputPath }), /already exists/);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test('legacy v1 fixture: shelf help uses the world HUD, then reopens the shelf after the policy closes help exactly once', async () => {
  const initial = snapshot();
  const actions = [{ type: 'walkTo', station: 'fresh' }, { type: 'interact', station: 'fresh' },
    { type: 'viewHelp' }, { type: 'closeView' }, { type: 'viewCart' }, { type: 'closeView' }, { type: 'giveUp' }];
  let calls = 0;
  const trace = await generateLegacyFixture({ personaId: 'careful-checker', seed: 'shelf-help', snapshot: initial, mode: 'llm', llm: { model: 'fixture' },
    decisionProvider: async () => ({ action: actions[calls++], delayMs: 800, reason: 'inspect the visible controls' }),
  });
  assert.equal(calls, actions.length, 'UI normalization cannot consume extra policy or model decisions');
  const help = trace.steps.findIndex(s => s.type === 'viewHelp');
  assert.deepEqual(trace.steps.slice(help - 1, help + 3).map(s => s.type), ['closeStation', 'viewHelp', 'closeView', 'openShelf']);
  assert.equal(trace.steps.filter(s => s.type === 'closeView').length, 2);
  const guard = new TraceGuard(initial);
  for (const step of trace.steps) {
    if (step.type === 'viewHelp') assert.equal(guard.observe().activeStation, null);
    guard.execute(step);
    if (step.id === trace.steps[help + 2].id) assert.equal(guard.observe().activeStation, 'fresh');
  }
  const hidden = structuredClone(trace);
  hidden.steps.splice(help - 1, 1);
  assert.equal(validateTrace(reseal(hidden), initial).valid, false, 'a schema-valid hidden help button is not playable');
});

test('legacy v1 fixture: staff cart checking leaves the conversation for a visible HUD button and returns to the same staff member', async () => {
  const initial = snapshot();
  const station = initial.environment.stationDetails.find(s => s.kind === 'employee').id;
  const actions = [{ type: 'walkTo', station }, { type: 'interact', station }, { type: 'viewCart' }, { type: 'closeView' }, { type: 'giveUp' }];
  let calls = 0;
  const trace = await generateLegacyFixture({ personaId: 'careful-checker', seed: 'staff-cart', snapshot: initial, mode: 'llm', llm: { model: 'fixture' },
    decisionProvider: async () => ({ action: actions[calls++], delayMs: 800, reason: 'check the basket after talking' }),
  });
  const cart = trace.steps.findIndex(s => s.type === 'viewCart');
  assert.deepEqual(trace.steps.slice(cart - 1, cart + 3).map(s => s.type), ['closeStation', 'viewCart', 'closeView', 'talkToStaff']);
  assert.equal(trace.steps[cart + 2].stationId, station);
  assert.ok(validateTrace(trace, initial).valid);
});

test('an inline cart overlay blocks both product dragging and browsing despite valid trace shapes', async () => {
  const initial = snapshot();
  const original = await generateTrace({ personaId: 'careful-checker', seed: 'overlay-blocks-grid', snapshot: initial });
  for (const type of ['dragProduct', 'browse']) {
    const trace = structuredClone(original);
    const index = trace.steps.findIndex(s => s.type === 'dragProduct');
    assert.ok(index >= 0);
    if (type === 'browse') trace.steps[index] = { id: trace.steps[index].id, type: 'browse', scrollFraction: 0, durationMs: 500, reactionDelayMs: 250, timeoutMs: 10000, reason: 'inspect the currently exposed shelf' };
    const base = { reactionDelayMs: 250, timeoutMs: 10000, reason: 'inspect the basket overlay' };
    trace.steps.splice(index, 0, { ...base, id: `overlay-before-${type}`, type: 'viewCart' });
    trace.steps.splice(index + 2, 0, { ...base, id: `overlay-after-${type}`, type: 'closeView' });
    reseal(trace);
    assert.equal(validateMarketReplayTrace(trace, initial).valid, true);
    const validation = validateTrace(trace, initial);
    assert.equal(validation.valid, false, `${type} must not interact through the cart overlay`);
    assert.match(validation.errors.join('; '), /close the cart or help view/);
  }
});

test('cashier requests name the actual empty checkout button and the schema rejects an implicit default', async () => {
  const initial = createMarketReplaySnapshot(createMarketSession({ seed: 'same-store',
    environment: { cashierCount: 0, employeeCount: 1 } }), undefined, assistancePresentation);
  const trace = await generateTrace({ personaId: 'careful-checker', seed: 'cashier-button', snapshot: initial });
  const index = trace.steps.findIndex(s => s.type === 'talkToStaff' && s.choice === 'requestCashier');
  assert.ok(index >= 0);
  const firstCheckout = trace.steps.slice(index + 1).find(s => s.type === 'checkout');
  assert.ok(firstCheckout);
  assert.equal(initial.cashierAvailability[trace.steps[index].checkoutId], false, 'the request names an actual empty counter button');
  const replyGuard = guardFor(initial, trace);
  for (const step of trace.steps.slice(0, index + 1)) replyGuard.execute(step);
  assert.ok(replyGuard.observe().cashierRequestFeedback.checkoutIds.includes(firstCheckout.checkoutId),
    'the next visit follows the staff reply, which may name another counter');
  assert.ok(validateTrace(trace, initial).valid);
  const missing = structuredClone(trace);
  delete missing.steps[index].checkoutId;
  assert.equal(validateMarketReplayTrace(reseal(missing), initial).valid, false);

  const station = initial.environment.stationDetails.find(s => s.kind === 'employee').id;
  const actions = [{ type: 'walkTo', station }, { type: 'interact', station }, { type: 'requestCashier' }, { type: 'giveUp' }];
  let calls = 0;
  const direct = await generateLegacyFixture({ personaId: 'careful-checker', seed: 'cashier-default', snapshot: initial,
    mode: 'llm', llm: { model: 'fixture' }, decisionProvider: async () => ({ action: actions[calls++], delayMs: 500, reason: 'ask at the visible employee counter choices' }) });
  const request = direct.steps.find(s => s.type === 'talkToStaff' && s.choice === 'requestCashier');
  assert.equal(request.checkoutId, initial.environment.checkouts.find(c => !c.cashierPresent).id);
  assert.ok(validateTrace(direct, initial).valid);
});
