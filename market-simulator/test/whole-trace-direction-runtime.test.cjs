const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('../runtime.cjs');
const { generateTrace } = require('../src/simulator.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { assertDecision } = require('../src/llmPolicy.ts');
const { getWholeTracePersona } = require('../src/personas.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, marketReplayTraceId, validateMarketReplayTrace, canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
const { directionalInputSlices } = require('../../frontend/src/game/marketDirectionalInput.ts');

const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
function options(actions, extra = {}) {
  let index = 0;
  return { personaId: 'mild-intellectual-disability-adult', seed: 'whole-direction-runtime',
    snapshot: createMarketReplaySnapshot(createMarketSession({ seed: 'whole-direction-runtime' })),
    mode: 'llm', maxActions: 100, timingProfile: 'original', llm: { model: 'gpt-6-luna', maxCalls: 1 },
    planningMode: 'whole-trace', actorPolicyVersion: 'whole-trace-v3', tracePolicyVersion: '6', reasoningEffort: 'low',
    wholeTraceMovementVersion: 'directional-v1',
    actorDecisionProvider: async () => ({ action: actions[index++], delayMs: 450, reason: '방향 입력 계약을 확인한다' }),
    ...extra };
}
const move = (direction = 'north', durationMs = 1373) => ({ type: 'moveDirection', direction, durationMs });
const quit = { type: 'giveUp' };
const mutated = (trace, change) => {
  const copy = structuredClone(trace); change(copy); copy.traceId = marketReplayTraceId(copy); return copy;
};

test('opt-in whole-trace emits the existing frontend directional format and applied outcomes', async () => {
  const after = [], order = [];
  const settings = options([...directions.map((direction, index) => move(direction, [100, 1373, 2000][index % 3])), quit], {
    onActorDecisionAccepted: () => order.push('accepted'),
    onActorDecisionApplied: observation => { order.push('applied'); after.push(observation); },
  });
  const trace = await generateTrace(settings);
  assert.equal(trace.generation.wholeTraceMovementVersion, 'directional-v1');
  assert.equal(trace.generation.movementContract, 'joystick-direction-v1');
  assert.equal(trace.generation.timingProfile, 'actor-preserved-v1');
  assert.equal(trace.generation.feedback, undefined);
  assert.equal(trace.generation.movementPolicy, undefined);
  const movement = trace.steps.filter(step => step.type === 'moveDirection');
  assert.deepEqual(movement.map(step => step.direction), directions);
  for (const [index, step] of movement.entries()) {
    assert.equal(step.reactionDelayMs, 450);
    assert.deepEqual(Object.keys(step.movement).sort(), ['accelerationMs', 'speedMultiplier']);
    assert.ok(step.movement.accelerationMs >= 160 && step.movement.accelerationMs <= 280);
    assert.equal(directionalInputSlices(step.direction, step.durationMs, step.movement)
      .reduce((total, slice) => total + slice.durationMs, 0), step.durationMs);
    assert.equal(after[index].result.movement.direction, step.direction);
    assert.equal(after[index].result.movement.durationMs, step.durationMs);
    assert.equal(Object.hasOwn(after[index], 'playerPosition'), false);
    assert.equal(Object.hasOwn(after[index], 'visibleStructures'), false, 'Movement does not enable additional perception cues');
  }
  assert.deepEqual(order, Array.from({ length: 9 }, () => ['accepted', 'applied']).flat());
  assert.deepEqual(validateMarketReplayTrace(trace, settings.snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateTrace(trace, settings.snapshot), { valid: true, errors: [] });
  const repeated = await generateTrace(options([...movement.map(step => move(step.direction, step.durationMs)), quit]));
  assert.deepEqual(repeated.steps, trace.steps, 'The existing seeded motor sampling is retained');
});

test('whole-trace movement remains opt-in and cannot borrow feedback timing or policy metadata', async () => {
  await assert.rejects(generateTrace(options([move(), quit], { wholeTraceMovementVersion: undefined })), /moveDirection requires feedback timing/);
  for (const extra of [{ wholeTraceMovementVersion: 'future' }, { planningMode: undefined }, { actorPolicyVersion: 'feedback-choice-v2' }])
    await assert.rejects(generateTrace(options([move(), quit], extra)), /wholeTraceMovementVersion/);
  const settings = options([move(), quit]);
  const trace = await generateTrace(settings);
  for (const change of [
    t => delete t.generation.wholeTraceMovementVersion,
    t => delete t.generation.movementContract,
    t => { t.generation.wholeTraceMovementVersion = 'future'; },
    t => { t.generation.actorPolicyVersion = 'whole-trace-v2'; },
    t => { t.generation.actorPolicyVersion = 'feedback-choice-v2'; },
    t => { t.generation.timingProfile = 'activity-duration-v2'; },
    t => { t.steps.find(step => step.type === 'moveDirection').durationMs = 99; },
    t => { t.steps.find(step => step.type === 'moveDirection').movement.accelerationMs = 301; },
  ]) assert.equal(validateTrace(mutated(trace, change), settings.snapshot).valid, false);
  assert.throws(() => assertDecision({ action: move(), delayMs: 0, reason: '걷는다' }, false,
    { directionalMovement: true }), /Decision delayMs must be 1..120000/);
});

test('default whole-trace output has no movement metadata and retains locked-world guards', async () => {
  const trace = await generateTrace(options([quit], { wholeTraceMovementVersion: undefined }));
  assert.equal(Object.hasOwn(trace.generation, 'wholeTraceMovementVersion'), false);
  assert.equal(Object.hasOwn(trace.generation, 'movementContract'), false);
  const enabled = options([move(), quit]);
  const directional = await generateTrace(enabled);
  const step = directional.steps.find(step => step.type === 'moveDirection');
  const guard = new TraceGuard(enabled.snapshot, 'fixture', '1', 'fixture', true, true, false, true);
  guard.execute({ id: 'cart', type: 'viewCart', reactionDelayMs: 1, timeoutMs: 10000, reason: '장바구니를 본다' });
  assert.throws(() => guard.execute(step), /directional input requires an unlocked/);
});

test('direct runtime calls cannot append directional movement to a frozen legacy trial binding', async () => {
  const settings = options([quit], { wholeTraceMovementVersion: undefined });
  const persona = getWholeTracePersona(settings.personaId);
  settings.learnerIdentity = { learnerId: 'directional-bound-learner', memberId: 'directional-member',
    personaId: persona.id, personaVersion: persona.version, experimentId: 'directional-bound-trial', arm: 'A',
    model: 'gpt-6-luna', policyVersion: 'whole-trace-v3', reasoningEffort: 'low' };
  const frozenRequest = { personaId: persona.id, mode: 'llm', seed: settings.seed, maxActions: settings.maxActions,
    timingProfile: settings.timingProfile, snapshot: settings.snapshot, llm: settings.llm,
    learnerIdentity: settings.learnerIdentity, attentionExperience: { visit: 'first-play' }, planningMode: 'whole-trace' };
  settings.trialBinding = { trialId: settings.learnerIdentity.experimentId, arm: 'A', roundId: 'bound-round',
    requestHash: createHash('sha256').update(canonicalMarketReplayJson(frozenRequest)).digest('hex') };
  const legacy = await generateTrace(settings);
  assert.deepEqual(legacy.generation.trialBinding, settings.trialBinding);
  await assert.rejects(generateTrace({ ...settings, wholeTraceMovementVersion: 'directional-v1' }),
    /trial movementVersion is frozen/);
});
