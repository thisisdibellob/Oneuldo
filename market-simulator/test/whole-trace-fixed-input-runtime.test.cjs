const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { generateTrace } = require('../src/simulator.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, marketReplayTraceId } = require('../../frontend/src/game/marketReplayTrace.ts');
const { DEFAULT_REPLAY_PRESENTATION, resolveReplayAnchor } = require('../../frontend/src/game/marketReplayPerception.ts');
const { resolveMarketEnvironmentMovement } = require('../../frontend/src/game/marketMovement.ts');
const { nextLocalWalkInput, localWalkInputSlices } = require('../../frontend/src/game/marketLocalInput.ts');

const snapshot = () => createMarketReplaySnapshot(createMarketSession({ seed: 'anchor-equality' }));
const guardFor = (snap, fixed = false) => new TraceGuard(snap, 'fixture', '1', 'fixture', true, true, false, true, false, false, false, fixed);
function fixture() {
  const snap = snapshot(), guard = guardFor(snap), before = guard.observe();
  const anchor = guard.observeActor().anchors[0];
  const target = resolveReplayAnchor(before.environment, before.playerPosition, anchor.id,
    snap.presentation ?? DEFAULT_REPLAY_PRESENTATION, before.cashierAvailability);
  return { snap, guard, before, anchor, target, movement: { speedMultiplier: .7, accelerationMs: 217 } };
}

test('extracting the shared local controller preserves the legacy RAF stop positions exactly', () => {
  const { before, target, movement } = fixture();
  const cases = [
    { frames: [16], expected: { x: 640.2367194610748, y: 1200.507255988018 } },
    { frames: [32, 16, 29, 8], expected: { x: 640.2467736060306, y: 1200.5288005843513 } },
  ];
  for (const { frames, expected } of cases) {
    let position = { ...before.playerPosition }, input = { x: 0, y: 0 }, stopping = false, done = false;
    for (let index = 0; index < 10000; index++) {
      const dt = frames[index % frames.length] / 1000;
      const next = nextLocalWalkInput(position, target, input, stopping, movement, dt);
      if (next.done) { done = true; break; }
      input = next.input; stopping = next.stopping;
      position = resolveMarketEnvironmentMovement(before.environment, position,
        { x: input.x * 190 * dt, y: input.y * 190 * dt }, before.cashierAvailability).position;
    }
    assert.equal(done, true);
    assert.deepEqual(position, expected);
  }
});

test('fixed anchor guard applies canonical bounded joystick slices and retains its actual residual', () => {
  const { snap, before, anchor, target, movement } = fixture();
  const slices = localWalkInputSlices(before.environment, before.playerPosition, target, before.cashierAvailability, movement);
  let expected = before.playerPosition;
  for (const slice of slices) {
    assert.equal(slice.durationMs, 10);
    assert.ok(Math.hypot(slice.input.x, slice.input.y) <= movement.speedMultiplier + 1e-10);
    expected = resolveMarketEnvironmentMovement(before.environment, expected,
      { x: slice.input.x * 190 * slice.durationMs / 1000, y: slice.input.y * 190 * slice.durationMs / 1000 }, before.cashierAvailability).position;
  }
  const step = { id: 'anchor', type: 'walkToAnchor', target: { anchorId: anchor.id },
    movement: { ...movement, running: false, style: 'steady', motorSeed: 'test' },
    reactionDelayMs: 450, timeoutMs: 120000, reason: '보이는 통로로 걷는다' };
  const fixed = guardFor(snap, true), applied = fixed.execute(step);
  assert.deepEqual(applied.after.playerPosition, expected);
  assert.notDeepEqual(expected, target, 'No teleport or waypoint snapping is used');
  assert.ok(Math.hypot(expected.x - target.x, expected.y - target.y) < .6);
  assert.equal(applied.movementMs, slices.length * 10);
  assert.ok(applied.actions.every(action => action.type === 'moveInput' && Math.hypot(action.dx, action.dy) <= 32));
  assert.deepEqual(fixed.observeActor().result.movement.actualDelta,
    { dx: expected.x - before.playerPosition.x, dy: expected.y - before.playerPosition.y });
  const legacy = guardFor(snap), oldApplied = legacy.execute(step);
  assert.ok(oldApplied.actions.every(action => action.type === 'move'));
  assert.equal(legacy.observeActor().result.movement, undefined);
});

test('v2 generation records its contract and sends exact positions only to the trusted applied callback', async () => {
  const applied = [], checkpoints = [], actorInputs = [];
  let index = 0;
  const settings = { personaId: 'mild-intellectual-disability-adult', snapshot: snapshot(), seed: 'fixed-runtime',
    mode: 'llm', llm: { model: 'gpt-6-luna' }, timingProfile: 'original', maxActions: 100,
    planningMode: 'whole-trace', actorPolicyVersion: 'whole-trace-v3', tracePolicyVersion: '6', reasoningEffort: 'low',
    wholeTraceMovementVersion: 'directional-v2',
    actorDecisionProvider: async observation => {
      actorInputs.push(structuredClone(observation));
      const action = index === 0 ? { type: 'moveDirection', direction: 'north', durationMs: 800 }
        : index === 1 ? { type: 'walkToAnchor', anchorId: observation.anchors[0].id }
          : index === 2 ? { type: 'moveDirection', direction: 'east', durationMs: 300 } : { type: 'giveUp' };
      index++;
      return { action, delayMs: 450, reason: '현재 화면의 이동 조작을 검증한다' };
    },
    onActorDecisionApplied: (observation, state) => applied.push({ observation, state }),
    onCheckpoint: checkpoint => checkpoints.push(checkpoint),
  };
  const trace = await generateTrace(settings);
  assert.equal(trace.generation.wholeTraceMovementVersion, 'directional-v2');
  assert.equal(trace.generation.movementContract, 'joystick-direction-v1');
  assert.deepEqual(validateTrace(trace, settings.snapshot), { valid: true, errors: [] });
  assert.equal(applied.length, 4);
  assert.equal(applied[1].observation.result.actionType, 'walkToAnchor');
  assert.ok(applied[1].observation.result.movement.durationMs > 0);
  const guard = guardFor(settings.snapshot, true);
  let accepted = 0;
  for (const step of trace.steps) {
    const result = guard.execute(step);
    if (['moveDirection', 'walkToAnchor', 'giveUp'].includes(step.type)) {
      assert.deepEqual(applied[accepted].state.position, result.after.playerPosition);
      assert.deepEqual(applied[accepted].state.cashierAvailability, result.after.cashierAvailability);
      accepted++;
    }
  }
  assert.doesNotMatch(JSON.stringify(actorInputs), /playerPosition|cashierAvailability|"position"/);
  assert.doesNotMatch(JSON.stringify(checkpoints), /playerPosition|cashierAvailability|"position"/);
  const missingContract = structuredClone(trace); delete missingContract.generation.movementContract;
  missingContract.traceId = marketReplayTraceId(missingContract);
  assert.equal(validateTrace(missingContract, settings.snapshot).valid, false);
});
