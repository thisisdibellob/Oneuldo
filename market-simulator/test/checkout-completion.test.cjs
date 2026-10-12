const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { generateTrace } = require('../src/simulator.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, isMarketReplaySystemCompletionStep, marketReplayTraceId } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const personaId = 'mild-intellectual-disability-adult';
const decision = action => ({ action, delayMs: 100, reason: '자동 마무리 경계 검증용 모의 결정' });
function snapshot(cashierCount = 2, near) {
  const config = { seed: 'checkout-completion-fixture', environment: { cashierCount } };
  const environment = structuredClone(createMarketSession(config).environment);
  if (near) environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  return createMarketReplaySnapshot(createMarketSession(config, environment));
}
async function generate(initial, provider) {
  let calls = 0;
  const trace = await generateTrace({ personaId, seed: 'controller-checkout', snapshot: initial,
    mode: 'llm', actorPolicyVersion: 'episodic-choice-v9', maxActions: 100, llm: { model: 'offline-fixture', maxCalls: 100 },
    actorDecisionProvider: async o => decision(provider ? provider(o, ++calls) : (++calls, { type: 'pause', durationMs: 100 })) });
  assert.equal(calls, 100);
  assert.equal(trace.generation.controlledStop, undefined);
  assert.ok(validateTrace(trace, initial).valid);
  return trace;
}
function auditMotion(trace, initial) {
  const guard = new TraceGuard(initial, personaId, trace.personaVersion, 'offline-test', true, true);
  const moves = [];
  for (const step of trace.steps) {
    const result = guard.execute(step, isMarketReplaySystemCompletionStep(trace, step.id));
    moves.push(...result.actions.filter(a => a.type === 'move'));
  }
  assert.ok(moves.length > 0);
  assert.ok(moves.every(a => Math.hypot(a.dx, a.dy) <= 32));
  assert.equal(guard.observe().attempts, 1);
}
test('empty cart is submitted after physical checkout movement without inventing purchases', async () => {
  const initial = snapshot(), trace = await generate(initial);
  assert.deepEqual(trace.generation.systemCompletion.cartAtStart, {});
  assert.deepEqual(trace.steps.slice(-3).map(s => s.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
  assert.equal(trace.steps.some(s => ['giveUp', 'skipRating', 'dragProduct', 'removeProduct'].includes(s.type)), false);
  auditMotion(trace, initial);
});
test('no cashiers: walk to an actual employee, request one and then submit the unchanged basket', async () => {
  const initial = snapshot(0), trace = await generate(initial);
  const request = trace.steps.find(s => s.type === 'talkToStaff' && s.choice === 'requestCashier');
  assert.ok(request);
  assert.equal(request.checkoutId, trace.generation.systemCompletion.checkoutId);
  assert.ok(trace.steps.findIndex(s => s.type === 'walkTo' && s.target.stationId === request.stationId)
    < trace.steps.indexOf(request));
  auditMotion(trace, initial);
});
for (const panel of ['shelf', 'cart']) test(`partial basket survives the action limit with ${panel} open`, async () => {
  const initial = snapshot(2, 'fresh');
  let selected;
  const trace = await generate(initial, (o, n) => {
    if (n === 1) return { type: 'interact', station: 'fresh' };
    if (n === 2) { selected = o.products.find(p => p.stock > 0).id; return { type: 'add', productId: selected, quantity: 1 }; }
    if (n === 3 && panel === 'cart') return { type: 'viewCart' };
    return { type: 'pause', durationMs: 100 };
  });
  assert.deepEqual(trace.generation.systemCompletion.cartAtStart, { [selected]: 1 });
  assert.equal(trace.steps.filter(s => s.type === 'dragProduct').length, 1);
  const suffix = trace.steps.filter(s => isMarketReplaySystemCompletionStep(trace, s.id));
  assert.equal(suffix.some(s => ['dragProduct', 'removeProduct'].includes(s.type)), false);
  auditMotion(trace, initial);
  const changed = structuredClone(trace);
  changed.generation.systemCompletion.cartAtStart[selected] = 2;
  changed.traceId = marketReplayTraceId(changed);
  assert.equal(validateTrace(changed, initial).valid, false, 'metadata cannot invent a second item');
});
for (const panel of ['help', 'checkout', 'staff']) test(`system checkout closes an existing ${panel} panel before walking`, async () => {
  const base = snapshot();
  const staff = base.environment.stationDetails.find(s => s.kind === 'employee').id;
  const initial = panel === 'help' ? base : snapshot(2, panel === 'checkout' ? 'checkout' : staff);
  const trace = await generate(initial, (_o, n) => n > 1 ? { type: 'pause', durationMs: 100 }
    : panel === 'help' ? { type: 'viewHelp' } : panel === 'checkout' ? { type: 'checkout', checkoutId: 'checkout' }
    : { type: 'interact', station: staff });
  const first = trace.steps.find(s => s.id === trace.generation.systemCompletion.firstStepId);
  assert.equal(first.type, panel === 'help' ? 'closeView' : 'closeStation');
});
