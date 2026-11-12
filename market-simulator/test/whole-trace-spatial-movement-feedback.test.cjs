'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createWholeTraceMovementFeedback, wholeTraceHasAnchorMovementFeedback, validWholeTraceMovementFeedback,
  WHOLE_TRACE_ANCHOR_CAPACITY_MOVEMENT_FEEDBACK_VERSION } = require('../src/wholeTraceMovementFeedback.ts');
const { FEEDBACK_EXPERIENCE_LIMITS } = require('../src/feedbackExperience.ts');

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const observation = (extra = {}) => ({ schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world',
  activeStation: null, visibleStations: [], anchors: ids.map(id => ({ id, label: '눈앞의 통로', direction: 'north', distanceBand: 'near' })),
  products: [], shelf: null, cart: null, cashiers: {}, ...extra });
const frame = () => ({ source: { location: 'start', navigationStateId: 'cashiers-1', phase: 'shopping', view: 'world',
  activeStation: null, pageIndex: null }, availableChoices: ids.map((id, index) => ({ choiceId: `walk/W${index}`,
    label: '눈앞의 통로로 걷기', action: { type: 'walk', waypointId: `W${index}` }, cueRefs: [`anchor:${id}`, 'control:walkToAnchor'] })) });
const decision = action => ({ action, delayMs: 500, reason: '선택한 행동을 수행한다' });
function arrive(feedback, id, result = {}) {
  feedback.record(decision({ type: 'walkToAnchor', anchorId: id }), observation(), observation({ result: {
    accepted: true, actionType: 'walkToAnchor', anchorId: id, ...result } }));
}
const pause = feedback => feedback.record(decision({ type: 'pause', durationMs: 1500 }), observation(),
  observation({ result: { accepted: true, actionType: 'pause' } }));
const marked = feedback => Object.fromEntries(feedback.decorate(frame(), observation()).choiceFrame.availableChoices
  .filter(choice => choice.recentVisit).map(choice => [choice.cueRefs[0].slice('anchor:'.length), choice.recentVisit.timesArrived]));

test('capacity feedback is a separate anchor-only version and uses the existing persona capacity bounds', () => {
  assert.equal(WHOLE_TRACE_ANCHOR_CAPACITY_MOVEMENT_FEEDBACK_VERSION, 'recent-movement-anchor-capacity-v1');
  for (const version of ['recent-movement-anchor-v1', WHOLE_TRACE_ANCHOR_CAPACITY_MOVEMENT_FEEDBACK_VERSION]) {
    assert.equal(wholeTraceHasAnchorMovementFeedback(version), true);
    assert.equal(validWholeTraceMovementFeedback(version, undefined, 'anchor-visible-structures-v1'), true);
    assert.equal(validWholeTraceMovementFeedback(version, 'directional-v2', 'anchor-visible-structures-v1'), false);
    assert.equal(validWholeTraceMovementFeedback(version, undefined, undefined), false);
  }
  assert.equal(wholeTraceHasAnchorMovementFeedback('recent-movement-v1'), false);
  for (const spatialMemoryCapacity of [null, 0, 3, 4.5, NaN, Infinity, '4'])
    assert.throws(() => createWholeTraceMovementFeedback({ spatialMemoryCapacity }), /integer of at least 4/);
  for (const spatialMemoryCapacity of [4, 5, 96])
    assert.doesNotThrow(() => createWholeTraceMovementFeedback({ spatialMemoryCapacity }));
});

test('capacity four evicts the least recently arrived passage and returning starts a fresh count', () => {
  const feedback = createWholeTraceMovementFeedback({ spatialMemoryCapacity: 4 });
  for (const id of ['a', 'b', 'c', 'd', 'a']) arrive(feedback, id);
  assert.deepEqual(marked(feedback), { a: 2, b: 1, c: 1, d: 1 });
  arrive(feedback, 'e');
  assert.deepEqual(marked(feedback), { a: 2, c: 1, d: 1, e: 1 }, 'arrival to a refreshes its recency; b is evicted');
  arrive(feedback, 'b');
  assert.deepEqual(marked(feedback), { a: 2, b: 1, d: 1, e: 1 }, 'b cannot resurrect its earlier arrival; c is evicted');
  const choice = feedback.decorate(frame(), observation()).choiceFrame.availableChoices[1];
  assert.equal(choice.label, '눈앞의 통로로 걷기 · 최근에 1번 간 통로');
});

test('capacity five preserves one more distinct accepted passage without changing movement notes or choices', () => {
  const four = createWholeTraceMovementFeedback({ spatialMemoryCapacity: 4 });
  const five = createWholeTraceMovementFeedback({ spatialMemoryCapacity: 5 });
  const plain = createWholeTraceMovementFeedback(), menu = frame(), bytes = JSON.stringify(menu);
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
    for (const feedback of [four, five, plain]) arrive(feedback, id);
    const current = four.decorate(menu, observation()), reference = plain.decorate(menu, observation());
    assert.deepEqual(current.movementNotes, reference.movementNotes, 'capacity limits place identities, not direction-event history');
    assert.deepEqual(five.decorate(menu, observation()).movementNotes, reference.movementNotes);
    for (const key of ['choiceId', 'action', 'cueRefs']) assert.deepEqual(current.choiceFrame.availableChoices.map(choice => choice[key]),
      menu.availableChoices.map(choice => choice[key]), 'capacity must not remove, reorder or rewrite available controls');
    assert.doesNotMatch(JSON.stringify({ labels: current.choiceFrame.availableChoices.map(choice => choice.label),
      movementNotes: current.movementNotes }), /anchor:|\bW\d+\b|waypoint|actualDelta|movedDistancePx|"[xy]"\s*:|가세요|탐색하라/);
  }
  assert.deepEqual(marked(four), { c: 1, d: 1, e: 1, f: 1 });
  assert.deepEqual(marked(five), { b: 1, c: 1, d: 1, e: 1, f: 1 });
  assert.equal(JSON.stringify(menu), bytes);
});

test('sightings, menu reads and rejected or mismatched arrivals cannot refresh passage recency', () => {
  const feedback = createWholeTraceMovementFeedback({ spatialMemoryCapacity: 4 });
  for (const id of ['a', 'b', 'c', 'd']) arrive(feedback, id);
  const seen = observation({ anchors: observation().anchors.slice(0, 1) });
  const first = feedback.decorate(frame(), seen);
  for (let i = 0; i < 40; i++) assert.deepEqual(feedback.decorate(frame(), seen), first);
  arrive(feedback, 'a', { accepted: false });
  arrive(feedback, 'a', { anchorId: 'b' });
  arrive(feedback, 'a', { actionType: 'pause' });
  assert.deepEqual(marked(feedback), { a: 1, b: 1, c: 1, d: 1 });
  arrive(feedback, 'e');
  assert.deepEqual(marked(feedback), { b: 1, c: 1, d: 1, e: 1 }, 'merely showing a repeatedly cannot retain it');
  assert.ok(feedback.decorate(frame(), observation({ anchors: [] })).choiceFrame.availableChoices.every(choice => !choice.recentVisit));
});

test('capacity retains the existing inclusive 24-action window and never revives expired arrivals', () => {
  const feedback = createWholeTraceMovementFeedback({ spatialMemoryCapacity: 4 });
  arrive(feedback, 'a');
  for (let i = 0; i < FEEDBACK_EXPERIENCE_LIMITS.retentionActions; i++) pause(feedback);
  assert.deepEqual(marked(feedback), { a: 1 });
  pause(feedback);
  assert.deepEqual(marked(feedback), {});
  arrive(feedback, 'a');
  assert.deepEqual(marked(feedback), { a: 1 });
});

test('canonical capacity 96 produces byte-identical decorated menus and notes to the uncapped version', () => {
  const plain = createWholeTraceMovementFeedback(), capped = createWholeTraceMovementFeedback({ spatialMemoryCapacity: 96 });
  for (let i = 0; i < 100; i++) {
    if (i % 7 === 0) { pause(plain); pause(capped); }
    else { arrive(plain, ids[i % ids.length]); arrive(capped, ids[i % ids.length]); }
    assert.equal(JSON.stringify(capped.decorate(frame(), observation())), JSON.stringify(plain.decorate(frame(), observation())));
  }
});
