const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { validateTrace } = require('../src/traceValidation.ts');

const pause = () => ({ choiceRef: { choiceId: 'control/pause' }, delayMs: 500,
  reason: '현재 자리에서 잠시 쉬며 다음 행동을 기다린다',
  basis: { intent: 'rest', goalId: null, memoryUses: [] },
  actorState: { activity: 'rest', task: '현재 자리에서 쉬기', heldGoalIds: [], uncertainGoalIds: [],
    focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } });

test('v2 authoring reaches its nonterminal 100-action horizon atomically and can finish the system-completed candidate', async () => {
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'continuous-horizon',
    environment: { cashierCount: 2 } }));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'continuous-horizon',
    movementVersion: 'directional-v2', maxActions: 100, maxRepairs: 0, timingProfile: 'original',
    llm: { model: 'gpt-6-luna', maxCalls: 1 } };
  const bundle = buildWholeTraceBundle(settings, 'continuous-horizon-request');
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  let accepted;
  for (let index = 0; index < 100; index++) {
    accepted = await cursor.append(pause());
    assert.equal(accepted.accepted, true, JSON.stringify(accepted));
    assert.equal(accepted.menu.decisionCount, index + 1);
    assert.equal(accepted.menu.terminal, index === 99);
  }
  assert.equal(accepted.menu.interactionContext.kind, 'terminal');
  assert.equal(accepted.menu.expectedSource, null);
  assert.deepEqual(accepted.menu.choiceIds, []);
  assert.deepEqual(accepted.menu.availableChoices, []);
  assert.deepEqual(accepted.menu.allowedWaypointIds, []);
  assert.equal(cursor.metrics().failed, false);
  const candidate = cursor.finish();
  assert.equal(candidate.decisions.length, 100);
  assert.ok(candidate.decisions.every(decision => decision.choiceRef.choiceId === 'control/pause'));
  const rejected = await cursor.append(pause());
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, 'AUTHORING_TERMINAL');
  assert.equal(rejected.menu.terminal, true);
  assert.equal(rejected.menu.decisionCount, 100);
  assert.deepEqual(cursor.finish(), candidate, 'An extra append never replaces or extends the accepted horizon');
  const compiled = await compileWholeTraceCandidate(settings, bundle, candidate);
  assert.equal(compiled.acceptedActions, 100);
  assert.equal(compiled.trace.generation.systemCompletion.afterDecisions, 100);
  assert.deepEqual(validateTrace(compiled.trace, snapshot), { valid: true, errors: [] });
});
