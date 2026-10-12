const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { createService } = require('../server.cjs');
const { getPersona } = require('../src/personas.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { generateTrace, summarizeTrace } = require('../src/simulator.ts');
const { buildFeedbackActorFrame, emptyFeedbackBeliefMemory, feedbackDecisionFromChoice,
  projectFeedbackObservation } = require('../src/feedbackActor.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { directionalInputSlices, MARKET_DIRECTIONAL_MOVE_SPEED } = require('../../frontend/src/game/marketDirectionalInput.ts');
const { resolveMarketEnvironmentMovement } = require('../../frontend/src/game/marketMovement.ts');

const persona = getPersona('mild-intellectual-disability-adult');
const snapshot = () => createMarketReplaySnapshot(createMarketSession({ seed: 'direction-contract' }));
const guard = snap => new TraceGuard(snap, persona.id, persona.version, 'authored-fixture', true, true, true, true);
const frame = (observation, policyVersion = 'feedback-choice-v2') => buildFeedbackActorFrame({ observation,
  policyVersion, persona, memory: emptyFeedbackBeliefMemory(), seed: 'direction-contract', decisionIndex: 0 });
const move = (direction, durationMs = 1373) => ({ id: 'move', type: 'moveDirection', direction, durationMs,
  movement: { speedMultiplier: .7, accelerationMs: 217 }, reactionDelayMs: 0, timeoutMs: 10000, reason: '그냥 걷는다' });

test('v2 has all eight controls without any visible object, anchor or goal; v1 stays unchanged', () => {
  const o = guard(snapshot()).observeActor();
  Object.assign(o, { anchors: [], visibleStations: [], visibleStructures: [], readObjectives: undefined, instructions: undefined });
  const controls = frame(o).availableChoices.filter(c => c.action.type === 'moveDirection');
  assert.equal(controls.length, 8);
  for (const c of controls) {
    assert.deepEqual(c.timing, { minimumMs: 100, maximumMs: 2000, phase: 'during-action' });
    assert.deepEqual(Object.keys(c.action).sort(), ['direction', 'durationMs', 'type']);
    assert.equal(feedbackDecisionFromChoice(c, 1027, '그냥 걷는다', emptyFeedbackBeliefMemory()).action.durationMs, 1027);
    assert.throws(() => feedbackDecisionFromChoice(c, 0, '걷는다', emptyFeedbackBeliefMemory()), /100..2000/);
  }
  assert.equal(frame(o, 'feedback-choice-v1').availableChoices.some(c => c.action.type === 'moveDirection'), false);
  for (const panel of [{ view: 'cart' }, { view: 'help' }, { activeStation: 'fresh' }, { phase: 'checkout' }])
    assert.equal(frame({ ...o, ...panel }).availableChoices.some(c => c.action.type === 'moveDirection'), false);
  assert.deepEqual(controls, frame({ ...o, expectedAnswer: 'secret', world: { target: 'secret' } })
    .availableChoices.filter(c => c.action.type === 'moveDirection'));
});

test('offline directional displacement equals the shared UI collision slices and counts duration once', () => {
  for (const direction of ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']) {
    const snap = snapshot(), g = guard(snap), step = move(direction);
    const before = g.observe();
    let expected = before.playerPosition;
    for (const slice of directionalInputSlices(direction, step.durationMs, step.movement)) {
      expected = resolveMarketEnvironmentMovement(before.environment, expected, {
        x: slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
        y: slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
      }, before.cashierAvailability).position;
    }
    const applied = g.execute(step);
    assert.deepEqual(applied.after.playerPosition, expected);
    assert.equal(applied.movementMs, step.durationMs);
    assert.equal(g.observeActor().elapsedMs, step.durationMs);
    assert.equal(g.observeActor().sequence, 1);
    assert.equal(g.observeActor().result.movement.durationMs, step.durationMs);
  }
});

test('blocked attempts keep generating observations and never cross the map or teleport', () => {
  const g = guard(snapshot());
  let blocked = false;
  for (let index = 0; index < 30; index++) {
    g.execute(move('west', 2000));
    const o = g.observeActor(), p = g.observe().playerPosition;
    assert.equal(o.result.accepted, true);
    assert.ok(p.x >= 0 && p.x <= g.observe().environment.world.width);
    if (o.result.movement.outcome === 'blocked') { blocked = true; break; }
  }
  assert.equal(blocked, true);
  const index = g.observeActor().sequence;
  g.execute(move('north', 1000));
  assert.equal(g.observeActor().sequence, index + 1);
});

test('authored movement probe discovers an initially unseen shelf and enables its ordinary interaction', () => {
  // A mechanical fixture only: no route is supplied to a persona or counted as a model sample.
  const g = guard(snapshot());
  assert.equal(g.observeActor().visibleStations.some(s => s.kind === 'shelf'), false);
  for (const direction of ['north', 'north', 'west', 'north', 'north']) g.execute({
    ...move(direction, 1800), movement: { speedMultiplier: .7, accelerationMs: 200 },
  });
  const observed = g.observeActor();
  const shelf = observed.visibleStations.find(s => s.kind === 'shelf' && s.near);
  assert.ok(shelf, 'walking updates the camera projection and exposes a nearby shelf');
  assert.ok(frame(observed).availableChoices.some(c => c.action.type === 'interact' && c.action.station === shelf.id));
  g.execute({ id: 'open', type: 'openShelf', stationId: shelf.id, reactionDelayMs: 0, timeoutMs: 10000, reason: 'fixture' });
  assert.ok(g.observeActor().products.length > 0);
  assert.ok(frame(g.observeActor()).availableChoices.some(c => c.action.type === 'add'));
});

test('movement and anonymous structures are deeply projected without hidden coordinates or routes', () => {
  const g = guard(snapshot()); g.execute(move('north'));
  const o = g.observeActor();
  o.result.movement.hiddenRoute = 'SECRET'; o.result.movement.actualDelta.worldX = 'SECRET';
  o.visibleStructures = [{ kind: 'shelf', label: '진열대', direction: 'north', distanceBand: 'far', categoryId: 'SECRET' }];
  const projected = projectFeedbackObservation(o);
  assert.doesNotMatch(JSON.stringify(projected), /SECRET|hiddenRoute|worldX|categoryId/);
  projected.result.movement.actualDelta.dx = 999;
  assert.notEqual(o.result.movement.actualDelta.dx, 999);
});

test('explicit v2 begin/step/finalize preserves movement feedback, time and legacy selection', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-free-direction-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Protocol fixture must not call a model or backend'); });
  const snap = snapshot();
  const begin = await service.invokeTool('begin_feedback_plan', { requestId: 'begin', personaId: persona.id,
    seed: 'direction-protocol', actorPolicyVersion: 'feedback-choice-v2', snapshot: snap, outputPath: path.join(dir, 'trace.json') });
  assert.equal(begin.actorPolicyVersion, 'feedback-choice-v2');
  const choice = begin.frame.availableChoices.find(c => c.action.type === 'moveDirection' && c.action.direction === 'north');
  const input = { sessionId: begin.sessionId, requestId: 'walk', revision: begin.frame.revision,
    choiceId: choice.id, durationMs: 1373, reason: '위로 걷는다', memory: emptyFeedbackBeliefMemory() };
  const after = await service.invokeTool('step_feedback_plan', input);
  assert.equal(after.executedActions, 1);
  assert.equal(after.nextFrame.observation.elapsedMs, 1373);
  assert.equal(after.timing.plannedElapsedMs, 1373);
  assert.deepEqual(after.result.movement, after.nextFrame.observation.result.movement);
  assert.deepEqual(await service.invokeTool('step_feedback_plan', input), after);
  const stop = after.nextFrame.availableChoices.find(c => c.action.type === 'giveUp');
  await service.invokeTool('step_feedback_plan', { ...input, requestId: 'stop', revision: after.nextFrame.revision,
    choiceId: stop.id, durationMs: 0, reason: '그만한다' });
  const saved = await service.invokeTool('finalize_feedback_plan', { sessionId: begin.sessionId });
  const trace = JSON.parse(fs.readFileSync(saved.outputPath));
  assert.equal(saved.executedActions, 2);
  assert.equal(trace.generation.timingProfile, 'activity-duration-v2');
  assert.equal(trace.generation.movementContract, 'joystick-direction-v1');
  assert.deepEqual(validateTrace(trace, snap), { valid: true, errors: [] });
  assert.equal(summarizeTrace(trace).walkingIntentions, 1);
  assert.equal(trace.generation.systemCompletion, undefined);
});

test('direction duration is included once in the generation time budget', async () => {
  let index = 0;
  const run = budget => generateTrace({ personaId: persona.id, snapshot: snapshot(), seed: 'budget',
    actorPolicyVersion: 'feedback-choice-v2', llm: { model: 'authored-fixture' }, timeBudgetMs: budget,
    feedbackDecisionProvider: async f => {
      const type = index++ === 0 ? 'moveDirection' : 'giveUp';
      return feedbackDecisionFromChoice(f.availableChoices.find(c => c.action.type === type),
        type === 'moveDirection' ? 1373 : 0, '시간 계약 시험', emptyFeedbackBeliefMemory());
    } });
  const trace = await run(1400);
  assert.equal(trace.generation.feedback.decisions, 2);
  index = 0;
  await assert.rejects(run(1300), /planned-time-budget/);
});

test('v2 HTTP provider uses current-only frames for directional input and the resulting displacement', async t => {
  const { createFeedbackLlmPolicy } = require('../src/feedbackLlmPolicy.ts');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const wire = JSON.parse(request.body); requests.push(wire);
    const f = JSON.parse(wire.messages[1].content);
    const c = f.availableChoices.find(c => c.action.type === (requests.length === 1 ? 'moveDirection' : 'giveUp'));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ choiceId: c.id,
      durationMs: requests.length === 1 ? 1107 : 0, reason: '방향 조작 시험', memory: emptyFeedbackBeliefMemory() }) } }] }) };
  });
  const g = guard(snapshot()), policy = createFeedbackLlmPolicy({ baseUrl: 'http://127.0.0.1:19999/v1', model: 'authored-fixture' }, 'http-direction', 'feedback-choice-v2');
  const decision = await policy(g.observeActor(), [], persona);
  g.execute(move(decision.action.direction, decision.action.durationMs));
  await policy(g.observeActor(), [decision], persona);
  assert.equal(requests.length, 2);
  for (const wire of requests) assert.equal(wire.messages.length, 2);
  const next = JSON.parse(requests[1].messages[1].content);
  assert.equal(next.policyVersion, 'feedback-choice-v2');
  assert.equal(next.observation.result.movement.durationMs, 1107);
  assert.equal(next.history, undefined);
  assert.equal(next.observation.environment, undefined);
});

test('free movement does not retain a stale anchor or collapse different directions in diagnostics', () => {
  const { ActorActivityMonitor } = require('../src/actorActivity.ts');
  const g = guard(snapshot()), monitor = new ActorActivityMonitor(), before = g.observeActor();
  monitor.observe(before);
  for (const direction of ['north', 'east']) {
    const d = { action: { type: 'moveDirection', direction, durationMs: 1000 }, delayMs: 0, reason: '걷는다' };
    const after = { ...before, result: { accepted: true, actionType: 'moveDirection', movement: {
      direction, durationMs: 1000, actualDelta: { dx: 1, dy: 0 }, movedDistancePx: 1, outcome: 'moved' } } };
    monitor.record(d, before, after);
  }
  assert.equal(monitor.getState().repetition.repeatedActionsInRecentWindow, 0);
});
