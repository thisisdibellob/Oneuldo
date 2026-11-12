'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createWholeTraceMovementFeedback } = require('../src/wholeTrace/wholeTraceMovementFeedback.ts');
const { FeedbackExperience } = require('../src/feedbackExperience.ts');
const { recentMovementNotes } = require('../src/feedbackActor.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { TraceGuard } = require('../src/traceValidation.ts');

const observation = (extra = {}) => ({ schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world',
  activeStation: null, visibleStations: [], anchors: [], products: [], shelf: null, cart: null, cashiers: {}, ...extra });
const frame = () => ({ source: { location: 'Popaque-position', navigationStateId: 'nav-v2-opaque-state', phase: 'shopping',
  view: 'world', activeStation: null, pageIndex: null }, availableChoices: [
  { choiceId: 'moveDirection/north', label: '위로 걷기', action: { type: 'moveDirection', direction: 'north' }, cueRefs: ['control:moveDirection'] },
  { choiceId: 'walk/W1', label: '눈앞의 통로로 걷기', action: { type: 'walk', waypointId: 'W1' }, cueRefs: ['anchor:seen-a', 'control:walkToAnchor'] },
  { choiceId: 'walk/W2', label: '눈앞의 통로로 걷기', action: { type: 'walk', waypointId: 'W2' }, cueRefs: ['anchor:seen-b', 'control:walkToAnchor'] },
] });
const anchor = id => ({ id, label: '눈앞의 통로', direction: 'north', distanceBand: 'near' });
const decision = action => ({ action, delayMs: 500, reason: '선택한 조작을 수행한다' });
const move = (direction, dx, dy) => {
  const action = { type: 'moveDirection', direction, durationMs: 300 };
  return { decision: decision(action), after: observation({ result: { accepted: true, actionType: action.type,
    movement: { direction, durationMs: 300, movedDistancePx: Math.hypot(dx, dy), actualDelta: { dx, dy },
      outcome: dx === 0 && dy === 0 ? 'blocked' : 'moved' } } }) };
};

test('whole-trace movement notes reuse v11 wording without publishing coordinates, destinations or recommendations', () => {
  const feedback = createWholeTraceMovementFeedback();
  const reference = new FeedbackExperience({ version: 'bounded-observed-experience-v2', movementHistory: true, passageHistory: true });
  const menu = frame(), original = JSON.stringify(menu);
  for (const [i, [direction, dx]] of [['west', -12], ['east', 12], ['west', -12], ['east', 12]].entries()) {
    const applied = move(direction, dx, 0);
    feedback.record(applied.decision, observation(), applied.after);
    reference.record(applied.decision, observation(), applied.after);
    const result = feedback.decorate(menu, applied.after);
    assert.deepEqual(result.movementNotes, recentMovementNotes(reference.snapshot(applied.after)));
    if (i < 3) assert.deepEqual(result.movementNotes, []);
  }
  const result = feedback.decorate(menu, observation());
  assert.equal(result.movementNotes.length, 2);
  assert.match(result.movementNotes[0], /오른쪽 2번.*왼쪽 2번/);
  assert.match(result.movementNotes[0], /그동안 걷지 않은 방향/);
  assert.equal(result.movementNotes[1], '그 걸음들은 오간 끝에 처음 자리 가까이에서 끝났습니다.');
  assert.doesNotMatch(JSON.stringify(result), /actualDelta|travelledPx|netPx|passageArrivals|"x"|"y"|가세요|가야|목적지|진열대/);
  assert.equal(JSON.stringify(menu), original);
  assert.deepEqual(result.choiceFrame, menu, 'notes do not remove, reorder or rewrite controls');
});

test('whole-trace passage markers need an accepted matching arrival and a currently visible offered passage', () => {
  const feedback = createWholeTraceMovementFeedback(), menu = frame();
  const seen = observation({ anchors: [anchor('seen-a'), anchor('seen-b')] });
  const walk = decision({ type: 'walkToAnchor', anchorId: 'seen-a' });
  assert.deepEqual(feedback.decorate(menu, seen).choiceFrame, menu, 'merely seeing a passage is not arrival');
  feedback.record(walk, seen, observation({ result: { accepted: false, actionType: 'walkToAnchor', anchorId: 'seen-a' } }));
  feedback.record(walk, seen, observation({ result: { accepted: true, actionType: 'walkToAnchor', anchorId: 'seen-b' } }));
  assert.deepEqual(feedback.decorate(menu, seen).choiceFrame, menu, 'rejected or mismatched outcomes do not mark arrivals');
  feedback.record(walk, seen, observation({ result: { accepted: true, actionType: 'walkToAnchor', anchorId: 'seen-a' } }));
  const result = feedback.decorate(menu, seen);
  assert.deepEqual(result.choiceFrame.availableChoices[1].recentVisit, { timesArrived: 1 });
  assert.equal(result.choiceFrame.availableChoices[1].label, '눈앞의 통로로 걷기 · 최근에 1번 간 통로');
  assert.equal('recentVisit' in result.choiceFrame.availableChoices[0], false);
  assert.equal('recentVisit' in result.choiceFrame.availableChoices[2], false);
  assert.deepEqual(result.choiceFrame.availableChoices.map(choice => choice.choiceId), menu.availableChoices.map(choice => choice.choiceId));
  assert.deepEqual(result.choiceFrame.availableChoices.map(choice => choice.action), menu.availableChoices.map(choice => choice.action));
  assert.deepEqual(feedback.decorate(menu, observation()).choiceFrame, menu, 'offscreen passages get no marker');
  const onlyDirection = { ...menu, availableChoices: menu.availableChoices.slice(0, 1) };
  assert.deepEqual(feedback.decorate(onlyDirection, seen).choiceFrame, onlyDirection, 'a visited passage is never inserted');
});

test('directional movement does not invent waypoint arrivals and menu reads do not age retained evidence', () => {
  const feedback = createWholeTraceMovementFeedback(), menu = frame();
  const seen = observation({ anchors: [anchor('seen-a')] });
  for (let i = 0; i < 4; i++) {
    const applied = move('north', 0, -10);
    feedback.record(applied.decision, seen, { ...applied.after, anchors: seen.anchors });
  }
  const current = feedback.decorate(menu, seen);
  assert.equal(current.choiceFrame.availableChoices.some(choice => choice.recentVisit), false);
  for (let i = 0; i < 30; i++) assert.deepEqual(feedback.decorate(menu, seen), current);
  for (let i = 0; i < 25; i++) feedback.record(decision({ type: 'pause', durationMs: 1500 }), seen,
    observation({ anchors: seen.anchors, result: { accepted: true, actionType: 'pause' } }));
  assert.deepEqual(feedback.decorate(menu, seen).movementNotes, []);
});

test('execution authoring returns v11 movement notes from real applied input without changing choices or retries', async () => {
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'movement-notes-authoring', environment: { cashierCount: 2 } }));
  const plainSettings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'movement-notes-authoring',
    movementVersion: 'directional-v2', timingProfile: 'original', maxActions: 100, maxRepairs: 0 };
  const settings = { ...plainSettings, movementFeedbackVersion: 'recent-movement-v1' };
  const bundle = buildWholeTraceBundle(settings, 'movement-notes-request');
  const plainBundle = buildWholeTraceBundle(plainSettings, 'movement-no-notes-request');
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const plainCursor = await createWholeTraceExecutionAuthoringCursor(plainSettings, plainBundle);
  const draft = (choiceId, durationMs) => ({ choiceRef: { choiceId, ...(durationMs === undefined ? {} : { durationMs }) },
    delayMs: 731, reason: '통로에서 선택한 조작을 수행한다',
    basis: { intent: choiceId === 'control/giveUp' ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: choiceId === 'control/giveUp' ? 'finish' : 'orient', task: '통로에서 걷기', heldGoalIds: [],
      uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } });
  assert.deepEqual((await cursor.menu()).movementNotes, []);
  assert.equal(Object.hasOwn(await plainCursor.menu(), 'movementNotes'), false);
  let current;
  for (const [i, direction] of ['west', 'east', 'west', 'east'].entries()) {
    const authored = draft(`moveDirection/${direction}`, 300);
    const result = await cursor.append(authored), plainResult = await plainCursor.append(authored);
    assert.equal(result.accepted, true, JSON.stringify(result));
    assert.equal(plainResult.accepted, true, JSON.stringify(plainResult));
    current = result.menu;
    assert.deepEqual(current.choiceIds, plainResult.menu.choiceIds, 'movement history never filters or reorders the menu');
    assert.deepEqual(current.availableChoices, plainResult.menu.availableChoices, 'directional moves do not invent passage arrivals');
    assert.equal(Object.hasOwn(plainResult.menu, 'movementNotes'), false);
    if (i < 3) assert.deepEqual(current.movementNotes, []);
  }
  assert.ok(current.movementNotes.length >= 1);
  assert.match(current.movementNotes[0], /최근 24번의 행동 안에 4번 걸었습니다/);
  assert.match(current.movementNotes[0], /오른쪽 2번.*왼쪽 2번/);
  for (let i = 0; i < 3; i++) assert.deepEqual(await cursor.menu(), current, 'reading the menu does not age or duplicate movement');
  const rejected = await cursor.append(draft('moveDirection/north', 99));
  assert.equal(rejected.accepted, false);
  assert.deepEqual(rejected.menu, current, 'a rejected draft preserves the exact observation, notes and choices');
  assert.deepEqual(await cursor.menu(), current);
  const changedEnding = await cursor.append(draft('control/giveUp'));
  assert.equal(changedEnding.accepted, false);
  assert.equal(changedEnding.code, 'AUTHORING_REWRITE_CHANGED_ENDING');
  assert.deepEqual(changedEnding.menu, current, 'an ending violation also preserves the accepted movement history');
  const corrected = await cursor.append(draft('moveDirection/north', 300));
  assert.equal(corrected.accepted, true, JSON.stringify(corrected.issues));
  assert.equal((await cursor.append(draft('control/giveUp'))).accepted, true);
  const reference = new FeedbackExperience({ version: 'bounded-observed-experience-v2', movementHistory: true, passageHistory: true });
  const compiled = await compileWholeTraceCandidate(settings, bundle, cursor.finish());
  // Public compiler diagnostics deliberately strip displacement. Reapply its
  // exact trace inputs locally to give the legacy experience its private motor evidence.
  const guard = new TraceGuard(snapshot, bundle.persona.id, bundle.persona.version, 'movement-notes-test',
    true, true, false, true, false, false, false, true);
  let expectedNotes, walks = 0;
  for (const step of compiled.trace.steps) {
    const before = guard.observeActor();
    guard.execute(step);
    if (step.type !== 'moveDirection') continue;
    const after = guard.observeActor();
    reference.record(decision({ type: 'moveDirection', direction: step.direction, durationMs: step.durationMs }), before, after);
    if (++walks === 4) { expectedNotes = recentMovementNotes(reference.snapshot(after)); break; }
  }
  assert.deepEqual(current.movementNotes, expectedNotes, 'same real applied observations produce the exact legacy v11 wording');
  assert.doesNotMatch(JSON.stringify(current), /actualDelta|travelledPx|netPx|passageArrivals|movedDistancePx|"x"|"y"/);
});
