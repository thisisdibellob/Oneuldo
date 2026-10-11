const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { ActorActivityMonitor } = require('../src/actorActivity.ts');

const observation = extra => ({
  schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world', activeStation: null,
  visibleStations: [], anchors: ['a', 'b', 'c'].map(id => ({ id, label: '보이는 통로', direction: 'west', distanceBand: 'near' })),
  products: [], shelf: null, listAvailable: true, cart: null, cashiers: {}, ...extra,
});
function recorder(monitor, initial = observation()) {
  let current = initial;
  monitor.observe(current);
  return (action, fields = {}, metadata = {}) => {
    const next = observation({ ...fields, result: { accepted: true, actionType: action.type, ...fields.result } });
    monitor.record({ action, delayMs: 1, reason: 'fixture', ...metadata }, current, next);
    current = next;
    return monitor.getState();
  };
}

function assertDiagnosticsOnly(state) {
  assert.deepEqual(Object.keys(state).sort(), ['decisionsWithoutNewObservation', 'lastOutcome', 'repetition']);
  assert.deepEqual(Object.keys(state.repetition).sort(), [
    'movementReturnsInRecentWindow', 'recentWindowSize', 'repeatedActionsInRecentWindow',
    'repeatedActionsWithoutNewObservation',
  ]);
}

test('a two-passage loop records revisits beyond 100 actions without choosing an ending', () => {
  const monitor = new ActorActivityMonitor();
  const step = recorder(monitor);
  step({ type: 'walkToAnchor', anchorId: 'a' });
  step({ type: 'walkToAnchor', anchorId: 'b' });
  for (let i = 1; i <= 120; i++) {
    const state = step({ type: 'walkToAnchor', anchorId: i % 2 ? 'a' : 'b' });
    assert.equal(state.decisionsWithoutNewObservation, i);
    assert.equal(state.lastOutcome.returnedToPreviousAnchor, true);
    assert.equal(state.lastOutcome.newInformation, false);
    assertDiagnosticsOnly(state);
  }
  const state = monitor.getState();
  assert.equal(state.lastOutcome.destinationArrivals, 61);
  assert.equal(state.lastOutcome.repeatedDirectedEdgeCount, 61);
  assert.equal(state.repetition.movementReturnsInRecentWindow, 12);
  assert.equal(state.repetition.repeatedActionsInRecentWindow, 10);
  assert.equal(state.repetition.repeatedActionsWithoutNewObservation, 118);
});

test('first arrival at a previously seen passage and genuinely new cues reset cumulative repetition', () => {
  const monitor = new ActorActivityMonitor();
  const step = recorder(monitor);
  for (let i = 0; i < 40; i++) step({ type: 'pause', durationMs: 1 });
  assert.equal(monitor.getState().repetition.repeatedActionsWithoutNewObservation, 39);
  const arrived = step({ type: 'walkToAnchor', anchorId: 'c' });
  assert.equal(arrived.lastOutcome.firstArrival, true);
  assert.deepEqual(arrived.lastOutcome.newlyObserved, ['arrival:c']);
  assert.equal(arrived.decisionsWithoutNewObservation, 0);
  assert.equal(arrived.repetition.repeatedActionsWithoutNewObservation, 0);
  for (let i = 0; i < 40; i++) step({ type: 'lookAround', durationMs: 1 });
  const discovery = step({ type: 'lookAround', durationMs: 1 }, {
    visibleStations: [{ id: 'fresh', label: '신선식품', kind: 'shelf', direction: 'north', distanceBand: 'far', near: false }],
  });
  assert.deepEqual(discovery.lastOutcome.newlyObserved, ['station:fresh']);
  assert.equal(discovery.decisionsWithoutNewObservation, 0);
  assert.equal(discovery.repetition.repeatedActionsWithoutNewObservation, 0);
});

test('distinct familiar movements are distinguished from subsequent repeated actions', () => {
  const monitor = new ActorActivityMonitor();
  const step = recorder(monitor);
  const anchors = Array.from({ length: 13 }, (_, i) => `familiar-${i}`);
  for (const anchorId of anchors) step({ type: 'walkToAnchor', anchorId });
  let current = 12;
  for (const offset of [2, 3, 4]) {
    for (let i = 0; i < anchors.length; i++) {
      current = (current + offset) % anchors.length;
      const state = step({ type: 'walkToAnchor', anchorId: anchors[current] });
      assert.equal(state.repetition.repeatedActionsWithoutNewObservation, 0);
      assertDiagnosticsOnly(state);
    }
  }
  assert.equal(monitor.getState().decisionsWithoutNewObservation, 39);
  for (let i = 0; i < 100; i++) step({ type: 'lookAround', durationMs: 1000 });
  const state = monitor.getState();
  assert.equal(state.decisionsWithoutNewObservation, 139);
  assert.equal(state.repetition.repeatedActionsWithoutNewObservation, 99);
});

function familiarCycle(size, readBetweenMoves) {
  const monitor = new ActorActivityMonitor();
  const anchors = Array.from({ length: size }, (_, i) => `route-${i}`);
  const list = [{ id: 'milk', label: '흰 우유', quantity: 1, match: 'exact' }];
  const initial = observation({ readObjectives: list });
  const step = recorder(monitor, initial);
  const actions = anchors.flatMap(anchorId => [
    ...(readBetweenMoves ? [{ type: 'readList', durationMs: 2000 }] : []),
    { type: 'walkToAnchor', anchorId },
  ]);
  for (const action of actions) step(action, { readObjectives: list });
  let index = 0;
  return { monitor, step, next: () => step(actions[index++ % actions.length], { readObjectives: list }) };
}

test('the observed five-passage/list cycle stays diagnostic for 1000 repeated decisions', () => {
  // Distilled from the actual closed cycle: read, A, read, B, read, C, read, D, read, E.
  const { monitor, next } = familiarCycle(5, true);
  for (let i = 1; i <= 1000; i++) {
    const state = next();
    assert.equal(state.decisionsWithoutNewObservation, i);
    if (i >= 12) assert.equal(state.repetition.repeatedActionsInRecentWindow, 6);
    assertDiagnosticsOnly(state);
  }
  assert.equal(monitor.getState().repetition.repeatedActionsWithoutNewObservation, 994);
  assert.equal(monitor.getState().lastOutcome.returnedToPreviousAnchor, false);
});

for (const size of [10, 20]) {
  for (const readBetweenMoves of [false, true]) {
    test(`${size}-edge closed route${readBetweenMoves ? ' with list checks' : ''} retains repetition outside the recent window`, () => {
      const { monitor, next } = familiarCycle(size, readBetweenMoves);
      for (let i = 1; i <= 1000; i++) next();
      const state = monitor.getState();
      assert.equal(state.decisionsWithoutNewObservation, 1000);
      assert.equal(state.repetition.repeatedActionsWithoutNewObservation, 1000 - size - Number(readBetweenMoves));
      assert.ok(state.repetition.repeatedActionsInRecentWindow < 8);
      assertDiagnosticsOnly(state);
    });
  }
}

test('new cues reset cumulative evidence while preserving the factual recent window', () => {
  const { next, step } = familiarCycle(5, true);
  let state;
  for (let i = 0; i < 100; i++) state = next();
  assert.equal(state.repetition.repeatedActionsWithoutNewObservation, 94);
  state = step({ type: 'lookAround', durationMs: 1000 }, {
    visibleStations: [{ id: 'fresh', label: '신선식품', kind: 'shelf', direction: 'north', distanceBand: 'far', near: false }],
  });
  assert.deepEqual(state.lastOutcome.newlyObserved, ['station:fresh']);
  assert.equal(state.decisionsWithoutNewObservation, 0);
  assert.equal(state.repetition.repeatedActionsWithoutNewObservation, 0);
  assert.equal(state.repetition.recentWindowSize, 12);
  for (let i = 0; i < 14; i++) state = next();
  assert.equal(state.decisionsWithoutNewObservation, 14);
  assert.equal(state.repetition.repeatedActionsWithoutNewObservation, 8);
});

test('brief wandering, pauses and interest changes keep their individual observed outcomes', () => {
  const monitor = new ActorActivityMonitor();
  const step = recorder(monitor);
  const types = [];
  for (const action of [
    { type: 'walkToAnchor', anchorId: 'a' }, { type: 'walkToAnchor', anchorId: 'b' },
    { type: 'pause', durationMs: 4000 }, { type: 'walkToAnchor', anchorId: 'a' },
    { type: 'lookAround', durationMs: 3000 }, { type: 'walkToAnchor', anchorId: 'b' },
    { type: 'walkToAnchor', anchorId: 'a' }, { type: 'pause', durationMs: 2000 },
  ]) {
    const state = step(action);
    types.push(state.lastOutcome.actionType);
    assertDiagnosticsOnly(state);
  }
  assert.deepEqual(types, ['walkToAnchor', 'walkToAnchor', 'pause', 'walkToAnchor', 'lookAround', 'walkToAnchor', 'walkToAnchor', 'pause']);
  assert.equal(monitor.getState().decisionsWithoutNewObservation, 6);
});

test('rereading the same list/help and reopening cart are not infinitely new observations', () => {
  for (const [action, fields] of [
    [{ type: 'readList', durationMs: 1000 }, { readObjectives: [{ id: 'x', label: '우유', quantity: 1, match: 'exact' }] }],
    [{ type: 'viewHelp' }, { view: 'help', supportText: ['필요하면 직원에게 물어보세요.'] }],
    [{ type: 'viewCart' }, { view: 'cart', cart: {} }],
  ]) {
    const monitor = new ActorActivityMonitor();
    const step = recorder(monitor);
    assert.equal(step(action, fields).lastOutcome.newInformation, true);
    for (let i = 0; i < 50; i++) {
      step({ type: 'closeView' });
      step(action, fields);
    }
    assert.equal(monitor.getState().decisionsWithoutNewObservation, 100);
    assert.ok(monitor.getState().repetition.repeatedActionsWithoutNewObservation >= 97);
    assertDiagnosticsOnly(monitor.getState());
  }
});

test('cumulative cart and shelf observations distinguish view/quantity toggles from new products', () => {
  const monitor = new ActorActivityMonitor();
  const shelf = page => ({ activeStation: 'fresh', products: [], shelf: { page, pageCount: 2, scrollFraction: page / 2 } });
  const step = recorder(monitor);
  step({ type: 'add', productId: 'milk', quantity: 1 }, { ...shelf(0), cart: { milk: 1 } });
  step({ type: 'remove', productId: 'milk', quantity: 1 }, { ...shelf(1), cart: {} });
  for (let i = 0; i < 50; i++) {
    step({ type: 'add', productId: 'milk', quantity: 1 }, { ...shelf(0), cart: { milk: 1 } });
    step({ type: 'remove', productId: 'milk', quantity: 1 }, { ...shelf(1), cart: {} });
  }
  assert.equal(monitor.getState().decisionsWithoutNewObservation, 100);
  assert.equal(monitor.getState().repetition.repeatedActionsWithoutNewObservation, 98);
  const next = step({ type: 'browse', scrollFraction: 1, durationMs: 1000 }, {
    ...shelf(1), products: [{ id: 'bread', categoryId: 'food', name: '식빵', price: 1200, stock: 2 }],
  });
  assert.equal(next.decisionsWithoutNewObservation, 0);
  assert.equal(next.repetition.repeatedActionsWithoutNewObservation, 0);
  assert.deepEqual(next.lastOutcome.newlyObserved, ['product:bread']);
});

test('timestamps, wording, dynamic relative labels and same-page scroll changes do not disguise repetition', () => {
  const monitor = new ActorActivityMonitor();
  const base = observation({ activeStation: 'fresh', shelf: { page: 0, pageCount: 2, scrollFraction: 0 } });
  const step = recorder(monitor, base);
  for (let i = 1; i <= 100; i++) step({ type: 'browse', scrollFraction: i / 100, durationMs: i }, {
    activeStation: 'fresh', shelf: { page: 0, pageCount: 2, scrollFraction: i / 100 }, sequence: i, elapsedMs: i * 100,
    anchors: base.anchors.map(a => ({ ...a, label: `현재 ${i} 방향 통로`, direction: i % 2 ? 'west' : 'east' })),
  }, { reason: `이유 ${i}`, currentTask: `하고 싶은 일 ${i}`, delayMs: i, cueRefs: [`anchor:${i % 2 ? 'a' : 'b'}`] });
  assert.equal(monitor.getState().decisionsWithoutNewObservation, 100);
  assert.equal(monitor.getState().repetition.repeatedActionsWithoutNewObservation, 99);
});

test('only actor-visible fields affect novelty and returned state cannot mutate memory', () => {
  const monitor = new ActorActivityMonitor();
  const step = recorder(monitor);
  for (let i = 0; i < 100; i++) step({ type: 'lookAround', durationMs: 1 }, {
    targetAnswer: `secret ${i}`, score: i, position: { x: i, y: i }, hiddenMap: { version: i },
  });
  const state = monitor.getState();
  assert.equal(state.decisionsWithoutNewObservation, 100);
  state.lastOutcome.newlyObserved.push('made-up');
  state.repetition.repeatedActionsWithoutNewObservation = 0;
  assert.deepEqual(monitor.getState().lastOutcome.newlyObserved, []);
  assert.equal(monitor.getState().repetition.repeatedActionsWithoutNewObservation, 99);
  assert.equal(JSON.stringify(monitor.getState()).includes('secret'), false);
});

test('rejected or unconfirmed actions never create visits, progress or repetition decisions', () => {
  const monitor = new ActorActivityMonitor();
  const before = observation();
  const d = { action: { type: 'walkToAnchor', anchorId: 'a' }, delayMs: 1, reason: 'fixture' };
  monitor.record(d, before, observation({ result: { accepted: false, actionType: 'walkToAnchor' } }));
  monitor.record(d, before, observation());
  assert.equal(monitor.getState().lastOutcome, null);
  assert.equal(monitor.getState().decisionsWithoutNewObservation, 0);
  assert.equal(monitor.getState().repetition.recentWindowSize, 0);
  const accepted = observation({ result: { accepted: true, actionType: 'walkToAnchor' } });
  monitor.record(d, before, accepted);
  assert.equal(monitor.getState().lastOutcome.firstArrival, true);
  assert.equal(monitor.getState().lastOutcome.destinationArrivals, 1);
});
