const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTraceBundle.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTraceCompiler.ts');
const { validateWholeTraceCandidate } = require('../src/wholeTraceContracts.ts');
const { createWholeTraceSourceAuthoringCursor } = require('../src/wholeTraceAuthoringSource.ts');

// Hand-authored contract fixtures, never new AI samples or existing pilot rewrites.
function fixture({ cashierCount = 2, near = 'fresh' } = {}) {
  const config = { seed: 'source-aid-regression', stockPerProduct: 5,
    objectives: [{ productId: 'milk', quantity: 2 }], environment: { cashierCount } };
  const environment = structuredClone(createMarketSession(config).environment);
  if (near) environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment), undefined,
    { viewport: { width: 390, height: 600 }, zoom: 1.3, fontScale: 1, safeArea: { top: 0, bottom: 0 } });
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'source-aid-regression',
    maxActions: 100, maxRepairs: 0, timingProfile: 'original' };
  return { settings, bundle: buildWholeTraceBundle(settings, 'source-aid-request') };
}
function draft(choiceId, quantity) {
  const purchase = /^(add|remove)\//.test(choiceId), terminal = choiceId === 'control/giveUp' || choiceId === 'control/submit';
  return { choiceRef: { choiceId, ...(quantity === undefined ? {} : { quantity }) }, delayMs: 731,
    reason: '명시적으로 선택한 동작의 작성 계약을 확인한다',
    basis: { intent: purchase ? 'interest' : terminal ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: purchase ? 'interest' : terminal ? 'finish' : 'orient', task: '선택한 동작을 수행한다',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } };
}
function sourceGraphFixture(options) {
  const { bundle, settings } = fixture(options);
  const staff = bundle.choiceCatalog.staff[0].stationId;
  const nearbyStations = [
    { id: 'fresh', kind: 'shelf', label: '냉장 진열대' },
    { id: staff, kind: 'employee', label: '직원' },
    { id: 'checkout', kind: 'checkout', label: '계산대' },
  ];
  // Small directed subgraph reproduces stale W072, absent W089 hop, and self-walk
  // cases. Opaque IDs carry no inferred adjacency or ordering information.
  const links = { start: ['W072'], W072: ['W072', 'W073'], W073: ['W089'], W089: [] };
  for (const waypointId of ['W072', 'W073', 'W089']) {
    if (!bundle.choiceCatalog.entries.some(entry => entry.choiceId === `walk/${waypointId}`))
      bundle.choiceCatalog.entries.push({ choiceId: `walk/${waypointId}`, label: waypointId,
        action: { type: 'walk', waypointId }, cueRefs: [] });
  }
  for (const state of bundle.worldReference.navigation.states) {
    state.start = { allowedWaypointIds: links.start, nearbyStations };
    state.nodes = Object.entries(links).filter(([id]) => id !== 'start').map(([waypointId, allowedWaypointIds]) =>
      ({ waypointId, allowedWaypointIds, nearbyStations }));
  }
  bundle.choiceCatalog.navigation = bundle.worldReference.navigation.states.map(state => ({ navigationStateId: state.stateId,
    locations: Object.entries(links).map(([location, ids]) => ({ location, visibleWalkChoices: [],
      choiceIds: [...ids.map(id => `walk/${id}`), 'open/fresh', `open/${staff}`, 'checkout/checkout'] })) }));
  return { settings, bundle, staff };
}
function errorCode(code, pattern) {
  return error => { assert.equal(error.code, code); if (pattern) assert.match(error.message, pattern); return true; };
}

test('legacy bundle contracts are refused rather than converted to candidate 7', () => {
  const { bundle } = fixture();
  for (const legacy of [{ ...bundle, candidateVersion: '6' }, { ...bundle, bundleVersion: '7' }]) {
    const before = structuredClone(legacy);
    assert.throws(() => createWholeTraceSourceAuthoringCursor(legacy), errorCode('AUTHORING_UNSUPPORTED_TRANSITION', /never converts/));
    assert.deepEqual(legacy, before);
  }
});

test('W072 updates only the next pre-action source and preserves every actor-authored field', () => {
  const { bundle } = sourceGraphFixture(), before = structuredClone(bundle), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const walk = draft('walk/W072'), original = structuredClone(walk);
  const first = cursor.append(walk), second = cursor.append(draft('control/pause'));
  assert.equal(first.choiceRef.source.location, 'start');
  assert.equal(second.choiceRef.source.location, 'W072');
  assert.equal(cursor.snapshot().expectedSource.location, 'W072');
  const { source, ...chosenRef } = first.choiceRef;
  assert.deepEqual({ ...first, choiceRef: chosenRef }, original);
  assert.deepEqual(walk, original);
  first.choiceRef.source.location = 'start'; second.actorState.task = '외부 변경';
  cursor.append(draft('control/giveUp'));
  const candidate = cursor.finish();
  assert.equal(candidate.decisions[1].actorState.task, original.actorState.task);
  assert.equal(candidate.decisions[1].choiceRef.source.location, 'W072');
  assert.equal(candidate.decisions.at(-1).choiceRef.choiceId, 'control/giveUp');
  assert.deepEqual(bundle, before);
});

test('a caller-supplied stale or correct source is rejected, never overwritten', () => {
  const { bundle } = sourceGraphFixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('walk/W072'));
  for (const source of [bundle.initialChoiceFrame.source, cursor.snapshot().expectedSource]) {
    const input = { ...draft('control/pause'), choiceRef: { ...draft('control/pause').choiceRef, source } };
    assert.throws(() => cursor.append(input), errorCode('AUTHORING_SOURCE_SUPPLIED'));
  }
  assert.equal(cursor.snapshot().decisionCount, 1);
  assert.equal(cursor.snapshot().expectedSource.location, 'W072');
});

test('missing W089 hop and reverse edges fail without a route insertion; listed self-walks remain allowed', () => {
  const { bundle } = sourceGraphFixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('walk/W072'));
  assert.throws(() => cursor.append(draft('walk/W089')), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE', /absent/));
  assert.equal(cursor.snapshot().decisionCount, 1);
  cursor.append(draft('walk/W072'));
  cursor.append(draft('walk/W072'));
  assert.equal(cursor.snapshot().expectedSource.location, 'W072');
  cursor.append(draft('walk/W073'));
  assert.throws(() => cursor.append(draft('walk/W072')), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
  cursor.append(draft('walk/W089'));
  assert.throws(() => cursor.append(draft('walk/W089')), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
  cursor.append(draft('control/giveUp'));
  assert.deepEqual(cursor.finish().decisions.map(d => d.choiceRef.choiceId),
    ['walk/W072', 'walk/W072', 'walk/W072', 'walk/W073', 'walk/W089', 'control/giveUp']);
});

test('a menu entry alone cannot invent a missing directed graph edge', () => {
  const { bundle } = sourceGraphFixture();
  bundle.choiceCatalog.navigation[0].locations.find(location => location.location === 'start').choiceIds.push('walk/W089');
  const cursor = createWholeTraceSourceAuthoringCursor(bundle);
  assert.throws(() => cursor.append(draft('walk/W089')), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE', /directed edge/));
  assert.equal(cursor.snapshot().decisionCount, 0);
});

test('help/cart overlays block world controls, preserve location, and close to the exact world source', () => {
  const { bundle } = sourceGraphFixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('walk/W072'));
  const world = cursor.snapshot().expectedSource;
  for (const view of ['viewHelp', 'viewCart']) {
    cursor.append(draft(`control/${view}`));
    assert.equal(cursor.snapshot().expectedSource.view, view === 'viewHelp' ? 'help' : 'cart');
    for (const id of ['walk/W073', 'open/fresh', 'control/readList', 'control/closeStation', 'control/viewCart'])
      assert.throws(() => cursor.append(draft(id)), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
    cursor.append(draft('control/pause'));
    const close = cursor.append(draft('control/closeView'));
    assert.equal(close.choiceRef.source.pageIndex, null);
    assert.deepEqual(cursor.snapshot().expectedSource, world);
  }
});

test('shelf cart keeps activeStation, hides pageIndex, and closeView restores the selected browse page', () => {
  const { bundle } = sourceGraphFixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const shelf = bundle.choiceCatalog.shelves.find(shelf => shelf.stationId === 'fresh');
  const page = shelf.pages.at(-1);
  assert.notEqual(page.pageIndex, 0);
  cursor.append(draft('open/fresh'));
  cursor.append(draft(`browse/fresh/${page.pageIndex}`));
  const displayed = cursor.snapshot().expectedSource;
  cursor.append(draft('control/viewCart'));
  assert.deepEqual(cursor.snapshot().expectedSource, { ...displayed, view: 'cart', pageIndex: null });
  for (const id of ['control/closeStation', `browse/fresh/${page.pageIndex}`, page.choiceIds[0], 'control/readList', 'walk/W072'])
    assert.throws(() => cursor.append(draft(id, id.startsWith('add/') ? 1 : undefined)), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
  cursor.append(draft('control/closeView'));
  assert.deepEqual(cursor.snapshot().expectedSource, displayed);
  cursor.append(draft('control/closeStation'));
  cursor.append(draft('open/fresh'));
  assert.equal(cursor.snapshot().expectedSource.pageIndex, 0, 'Closing/reopening a shelf resets its page');
});

test('quantity is explicit, unchanged, and not inferred from the goal or silently capped', () => {
  const { bundle } = sourceGraphFixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('open/fresh'));
  const choiceId = bundle.choiceCatalog.shelves.find(shelf => shelf.stationId === 'fresh').pages[0].choiceIds[0];
  assert.throws(() => cursor.append(draft(choiceId)), errorCode('AUTHORING_SCHEMA', /quantity.*required/));
  assert.throws(() => cursor.append(draft(choiceId, 0)), errorCode('AUTHORING_SCHEMA', /1\.\.99/));
  assert.throws(() => cursor.append(draft(choiceId, 6)), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE', /not corrected/));
  const chosen = draft(choiceId, 3), before = structuredClone(chosen), result = cursor.append(chosen);
  assert.equal(result.choiceRef.quantity, 3, 'The unrelated goal quantity of 2 cannot replace the selected 3');
  assert.deepEqual(chosen, before);
  assert.throws(() => cursor.append(draft(choiceId, 3)), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
  assert.throws(() => cursor.append(draft('control/pause', 1)), errorCode('AUTHORING_SCHEMA', /not removed/));
  assert.equal(cursor.snapshot().decisionCount, 2, 'Failed attempts do not alter expected stock or decisions');
  assert.deepEqual(Object.keys(cursor.snapshot()).sort(), ['decisionCount', 'expectedSource', 'kind', 'terminal']);
});

test('an off-page product and a global cart return are not current controls', () => {
  const { bundle } = sourceGraphFixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const shelf = bundle.choiceCatalog.shelves.find(shelf => shelf.stationId === 'fresh');
  const first = shelf.pages[0], offPage = shelf.pages.at(-1).choiceIds.find(id => !first.choiceIds.includes(id));
  assert.ok(offPage);
  cursor.append(draft('open/fresh'));
  assert.throws(() => cursor.append(draft(offPage, 1)), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
  const addId = first.choiceIds[0], removeId = addId.replace('add/', 'remove/');
  cursor.append(draft(addId, 3));
  assert.throws(() => cursor.append(draft(removeId, 1)), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
  cursor.append(draft('control/viewCart'));
  assert.throws(() => cursor.append(draft(removeId)), errorCode('AUTHORING_SCHEMA', /quantity.*required/));
  const removal = cursor.append(draft(removeId, 1));
  assert.equal(removal.choiceRef.quantity, 1);
  cursor.append(draft('control/closeView'));
  cursor.append(draft('control/closeStation'));
  cursor.append(draft('control/viewCart'));
  assert.throws(() => cursor.append(draft(removeId, 1)), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
});

test('checkout source and explicit ending are preserved, and no action is added after termination', () => {
  const { bundle } = sourceGraphFixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const open = cursor.append(draft('checkout/checkout'));
  assert.equal(open.choiceRef.source.phase, 'shopping');
  assert.deepEqual(cursor.snapshot().expectedSource, { ...open.choiceRef.source, phase: 'checkout', activeStation: 'checkout' });
  assert.throws(() => cursor.append(draft('control/viewCart')), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
  const submit = cursor.append(draft('control/submit'));
  assert.equal(submit.choiceRef.source.phase, 'checkout');
  assert.equal(submit.choiceRef.source.activeStation, 'checkout');
  assert.deepEqual(cursor.snapshot(), { kind: 'symbolic-expected-source-v1', expectedSource: null, decisionCount: 2, terminal: true });
  assert.throws(() => cursor.append(draft('control/giveUp')), errorCode('AUTHORING_TERMINAL'));
  assert.deepEqual(cursor.finish().decisions.map(d => d.choiceRef.choiceId), ['checkout/checkout', 'control/submit']);
});

test('only an explicitly saved checkout alias is accepted and its authored spelling is retained', () => {
  const { bundle } = sourceGraphFixture();
  assert.ok(bundle.choiceCatalog.referenceAliases.some(alias => alias.aliasChoiceId === 'open/checkout'));
  const cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const selected = cursor.append(draft('open/checkout'));
  assert.equal(selected.choiceRef.choiceId, 'open/checkout');
  assert.equal(cursor.snapshot().expectedSource.phase, 'checkout');
  const legacy = structuredClone(bundle); delete legacy.choiceCatalog.referenceAliases;
  assert.throws(() => createWholeTraceSourceAuthoringCursor(legacy).append(draft('open/checkout')),
    errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
});

test('first cashier request changes the exact navigation state; ambiguous legacy effects fail closed', () => {
  const { bundle, staff } = sourceGraphFixture({ cashierCount: 0 }), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft(`open/${staff}`));
  const initial = cursor.snapshot();
  assert.throws(() => cursor.append(draft('requestCashier/checkout-2')), errorCode('AUTHORING_UNSUPPORTED_TRANSITION', /differing app\/compiler/));
  assert.deepEqual(cursor.snapshot(), initial);
  const request = cursor.append(draft('requestCashier/checkout'));
  assert.equal(request.choiceRef.source.navigationStateId, 'cashiers-00');
  assert.equal(cursor.snapshot().expectedSource.navigationStateId, 'cashiers-10');
  assert.throws(() => cursor.append(draft('requestCashier/checkout-2')), errorCode('AUTHORING_UNSUPPORTED_TRANSITION'));
  assert.throws(() => cursor.append(draft('requestCashier/checkout')), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
  cursor.append(draft('control/closeStation'));
  assert.equal(cursor.snapshot().expectedSource.navigationStateId, 'cashiers-10');
});

test('empty checkout cannot submit and closing it returns to shopping', () => {
  const { bundle } = sourceGraphFixture({ cashierCount: 0 }), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('checkout/checkout'));
  assert.throws(() => cursor.append(draft('control/submit')), errorCode('AUTHORING_CHOICE_NOT_AVAILABLE'));
  cursor.append(draft('control/closeStation'));
  assert.equal(cursor.snapshot().expectedSource.phase, 'shopping');
  assert.equal(cursor.snapshot().expectedSource.activeStation, null);
});

test('single-decision syntax and finish retain strict enums, task arrays, objective spelling and ending checks', () => {
  const { bundle } = sourceGraphFixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const invalid = draft('control/pause'); invalid.basis.intent = 'orient';
  assert.throws(() => cursor.append(invalid), errorCode('AUTHORING_SCHEMA', /intent/));
  const invalidTask = draft('control/pause'); invalidTask.actorState.taskUpdate = { type: 'select', goalId: 'invented' };
  assert.throws(() => cursor.append(invalidTask), errorCode('AUTHORING_SCHEMA', /taskUpdate/));
  cursor.append(draft('control/pause'));
  assert.throws(() => cursor.finish(), errorCode('AUTHORING_SCHEMA', /must end/));
  assert.equal(cursor.snapshot().decisionCount, 1);
  const goal = draft('control/giveUp'); goal.basis.goalId = 'invented';
  const original = structuredClone(goal);
  assert.throws(() => cursor.append(goal), errorCode('AUTHORING_TASK_DECLARATION', /basis.goalId/));
  assert.equal(cursor.snapshot().decisionCount, 1, 'invalid task binding is rejected before accepting the draft');
  assert.deepEqual(goal, original, 'early rejection never removes or replaces the authored goal');
  cursor.append(draft('control/giveUp'));
  assert.equal(cursor.finish().decisions.length, 2);
});

test('100 explicit nonterminal decisions keep their horizon; a smaller budget never inserts checkout', () => {
  const { bundle } = sourceGraphFixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  for (let i = 0; i < 100; i++) cursor.append(draft('control/pause'));
  assert.equal(cursor.finish().decisions.length, 100);
  assert.equal(cursor.finish().decisions.at(-1).choiceRef.choiceId, 'control/pause');
  assert.throws(() => cursor.append(draft('control/giveUp')), errorCode('AUTHORING_SCHEMA', /budget/));
  const limited = structuredClone(bundle); limited.generationLimits.technicalActionBudget = 1;
  const small = createWholeTraceSourceAuthoringCursor(limited); small.append(draft('control/pause'));
  assert.throws(() => small.finish(), errorCode('AUTHORING_SCHEMA', /must end/));
  assert.throws(() => small.append(draft('control/giveUp')), errorCode('AUTHORING_SCHEMA', /budget/));
});

test('real compiler agrees with symbolic shelf/cart/page sources without changing selected products or quantities', async () => {
  const { bundle, settings } = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const shelf = bundle.choiceCatalog.shelves.find(shelf => shelf.stationId === 'fresh'), page = shelf.pages.at(-1);
  const addId = page.choiceIds[0], removeId = addId.replace('add/', 'remove/');
  const actorInputs = [draft('control/viewHelp'), draft('control/closeView'), draft('control/viewCart'),
    draft('control/closeView'), draft('open/fresh'), draft(`browse/fresh/${page.pageIndex}`), draft(addId, 3),
    draft('control/viewCart'), draft(removeId, 1), draft('control/closeView'), draft('control/closeStation'),
    draft('open/fresh'), draft('control/giveUp')];
  const original = structuredClone(actorInputs);
  assert.notEqual(bundle.choiceCatalog.entries.find(entry => entry.choiceId === 'control/readList').label, 'control/readList');
  actorInputs.forEach(input => {
    const menu = cursor.menu();
    assert.deepEqual(menu.availableChoices, menu.choiceIds.map(choiceId => ({ choiceId,
      label: bundle.choiceCatalog.entries.find(entry => entry.choiceId === choiceId).label })),
    'Actual catalog labels remain one-to-one and in the unchanged menu order');
    cursor.append(input);
  });
  const candidate = cursor.finish(), saved = structuredClone(candidate);
  assert.equal(validateWholeTraceCandidate(candidate, bundle.requestId).valid, true);
  const result = await compileWholeTraceCandidate(settings, bundle, candidate);
  assert.equal(result.acceptedActions, actorInputs.length);
  assert.deepEqual(result.knowledgeAudit.map(row => row.choiceResolution.source), candidate.decisions.map(d => d.choiceRef.source));
  assert.equal(candidate.decisions[9].choiceRef.source.activeStation, 'fresh');
  assert.equal(candidate.decisions[9].choiceRef.source.pageIndex, null);
  assert.equal(candidate.decisions[10].choiceRef.source.pageIndex, page.pageIndex);
  assert.equal(candidate.decisions.at(-1).choiceRef.source.pageIndex, 0);
  assert.deepEqual(result.knowledgeAudit.filter(row => ['add', 'remove'].includes(row.action.type)).map(row => row.action.quantity), [3, 1]);
  assert.deepEqual(candidate, saved); assert.deepEqual(actorInputs, original);
});

test('a syntactically drafted plan remains subject to the unchanged semantic compiler guards', async () => {
  const { bundle, settings } = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const invalidKnowledge = draft('control/giveUp'); invalidKnowledge.basis.cueRefs = ['product:not-observed'];
  cursor.append(invalidKnowledge);
  const candidate = cursor.finish();
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate), error => {
    assert.equal(error.validation.code, 'KNOWLEDGE_BASIS'); return true;
  });
  assert.deepEqual(candidate.decisions[0].basis.cueRefs, ['product:not-observed']);
});
