const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { generateTrace } = require('../src/simulator.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const snapshot = () => createMarketReplaySnapshot(createMarketSession({ seed: 'attention-integration' }));
const personaId = 'mild-intellectual-disability-adult';
const decision = action => ({ action, delayMs: 600, reason: 'inspect the currently available control' });
const step = (type, extra = {}) => ({ id: `test-${type}`, type, reactionDelayMs: 600, timeoutMs: 120000, reason: 'fixture', ...extra });

test('actor input learns objectives only by reading and never receives the full game state', async () => {
  const seen = [];
  const actions = [{ type: 'readList', durationMs: 2000 }, { type: 'viewHelp' }, { type: 'giveUp' }];
  const initial = snapshot();
  const trace = await generateTrace({ personaId, seed: 'actor-boundary', snapshot: initial,
    mode: 'llm', llm: { model: 'actor-fixture' }, actorDecisionProvider: async o => {
      seen.push(o); return decision(actions[seen.length - 1]);
    } });
  assert.equal(seen[0].readObjectives, undefined);
  assert.ok(seen[1].readObjectives.length);
  assert.equal(seen[2].readObjectives, undefined);
  for (const o of seen) {
    for (const key of ['environment', 'objectives', 'playerPosition', 'stock', 'config', 'events', 'evaluation']) assert.equal(o[key], undefined, key);
    assert.deepEqual(o.products, []);
  }
  assert.equal(trace.traceSchemaVersion, '2');
  assert.equal(trace.policyVersion, '5');
  assert.equal(trace.experienceMode, 'first-play');
  assert.equal(trace.attentionExperience.source, 'planned-trace');
  assert.ok(validateTrace(trace, initial).valid);
});

test('actor shelf projection contains only the current visible rows; staff opening does not reveal the basket', () => {
  const initial = createMarketReplaySnapshot(createMarketSession({ seed: 'attention-integration' }), undefined, { viewport: { width: 320, height: 568 }, zoom: 1.3 });
  const guard = new TraceGuard(initial);
  const movement = { style: 'steady', speedMultiplier: 1, motorSeed: 'fixture' };
  guard.execute(step('walkTo', { target: { stationId: 'fresh' }, movement }));
  guard.execute(step('openShelf', { stationId: 'fresh' }));
  const first = guard.observeActor();
  assert.ok(first.products.length > 0);
  assert.ok(first.products.length < guard.observe().products.length);
  assert.equal(first.cart, null);
  guard.execute(step('browse', { scrollFraction: 1, durationMs: 1000 }));
  const last = guard.observeActor();
  assert.notDeepEqual(first.products.map(p => p.id), last.products.map(p => p.id));
  guard.execute(step('closeStation'));
  const staff = initial.environment.stationDetails.find(s => s.kind === 'employee').id;
  guard.execute(step('walkTo', { target: { stationId: staff }, movement }));
  guard.execute(step('talkToStaff', { stationId: staff, choice: 'open' }));
  assert.equal(guard.observeActor().cart, null);
});

test('attention choices cannot access an unobserved station or product, even through an external model', async () => {
  for (const action of [{ type: 'walkToAnchor', anchorId: 'anchor-ffffffff' }, { type: 'add', productId: 'milk' }, { type: 'interact', station: 'fresh' }]) {
    await assert.rejects(generateTrace({ personaId, seed: 'hidden', snapshot: snapshot(), mode: 'llm', llm: { model: 'fixture' },
      actorDecisionProvider: async () => decision(action) }), /Unobserved|observed|visible nearby/);
  }
  await assert.rejects(generateTrace({ personaId, seed: 1, snapshot: snapshot(), decisionProvider: async () => decision({ type: 'giveUp' }) }), /actorDecisionProvider/);
  await assert.rejects(generateTrace({ personaId, seed: 1, snapshot: snapshot(), mode: 'llm', llm: { model: 'fixture' },
    actorDecisionProvider: async () => ({ ...decision({ type: 'giveUp' }), cueRefs: ['product:never-observed'] }) }), /Unobserved cue/);
});

test('technical budgets reject incomplete plans instead of injecting persona failure, including terminal time', async () => {
  for (const limits of [{ maxActions: 1 }, { timeBudgetMs: 8000 }]) {
    await assert.rejects(generateTrace({ personaId, seed: 'cap', snapshot: snapshot(), mode: 'llm', llm: { model: 'fixture' }, ...limits,
      actorDecisionProvider: async () => decision(limits.maxActions ? { type: 'lookAround', durationMs: 1000 } : { type: 'giveUp' }) }), /ATTENTION_GENERATION_LIMIT/);
  }
});

test('revisits require an actual memory artifact, and first play cannot import prior knowledge', async () => {
  await assert.rejects(generateTrace({ personaId, seed: 1, snapshot: snapshot(), attentionExperience: { visit: 'revisit' } }), /Revisit requires/);
  await assert.rejects(generateTrace({ personaId, seed: 1, snapshot: snapshot(), attentionExperience: { visit: 'first-play', memory: {} } }), /First-play cannot/);
});
