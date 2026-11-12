const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createWholeTraceSourceAuthoringCursor } = require('../src/wholeTrace/wholeTraceAuthoringSource.ts');

// Compact, hand-authored catalog fixtures retain the five rejected directed hops.
// They neither load historical pilot files nor execute/generate persona traces.
const rejectedHops = [
  ['W013', 'W012', ['W003', 'W004', 'W014', 'W015']],
  ['W053', 'W052', ['W040', 'W054', 'W055', 'W067']],
  ['W026', 'W021', ['W022', 'W035']],
  ['W058', 'W057', ['W043', 'W044', 'W056', 'W059', 'W060']],
  ['W022', 'W021', ['W010', 'W020', 'W026']],
];
function fixture(from = 'W013', forbidden = 'W012', allowed = ['W003', 'W004', 'W014', 'W015']) {
  const source = { location: 'start', navigationStateId: 'cashiers-0', phase: 'shopping',
    view: 'world', activeStation: null, pageIndex: null };
  const nearbyStations = [{ id: 'fresh', kind: 'shelf', label: '냉장 진열대' },
    { id: 'staff', kind: 'employee', label: '종업원 1' }, { id: 'checkout', kind: 'checkout', label: '계산대' }];
  const links = { start: [from], [from]: allowed, [forbidden]: [from] };
  for (const id of allowed) links[id] = [from];
  const controls = ['pause', 'lookAround', 'giveUp', 'readList', 'viewCart', 'viewHelp',
    'closeView', 'closeStation', 'submit'];
  const entries = controls.map(type => ({ choiceId: `control/${type}`, action: { type } }));
  for (const id of Object.keys(links).filter(id => id !== 'start'))
    entries.push({ choiceId: `walk/${id}`, action: { type: 'walk', waypointId: id } });
  entries.push({ choiceId: 'open/fresh', action: { type: 'interact', station: 'fresh' } },
    { choiceId: 'open/staff', action: { type: 'interact', station: 'staff' } },
    { choiceId: 'checkout/checkout', action: { type: 'checkout', checkoutId: 'checkout' } },
    { choiceId: 'requestCashier/checkout', action: { type: 'requestCashier', checkoutId: 'checkout' } },
    ...[0, 1].map(pageIndex => ({ choiceId: `browse/fresh/${pageIndex}`, action: { type: 'browse', pageIndex } })),
    ...['milk', 'apple'].flatMap(productId => ['add', 'remove'].map(type =>
      ({ choiceId: `${type}/${productId}`, action: { type, productId } }))));
  const states = [false, true].map(staffed => ({ stateId: `cashiers-${Number(staffed)}`,
    cashierAvailability: { checkout: staffed }, start: { allowedWaypointIds: links.start, nearbyStations },
    nodes: Object.entries(links).filter(([id]) => id !== 'start').map(([waypointId, allowedWaypointIds]) =>
      ({ waypointId, allowedWaypointIds, nearbyStations })) }));
  return { bundleVersion: '8', candidateVersion: '7', requestId: 'source-menu-regression',
    generationLimits: { technicalActionBudget: 100 }, initialChoiceFrame: { source },
    worldReference: { objectives: [{ id: 'objective-1' }], world: { checkouts: [{ id: 'checkout', kind: 'staffed' }] },
      shelves: [{ stationId: 'fresh', products: [{ id: 'milk', stock: 5 }, { id: 'apple', stock: 5 }] }],
      navigation: { initialStateId: source.navigationStateId, states } },
    choiceCatalog: { entries: entries.map(entry => ({ ...entry, label: entry.choiceId, cueRefs: [] })),
      common: { shopping: ['control/pause', 'control/lookAround', 'control/giveUp'],
        world: ['control/readList', 'control/viewCart', 'control/viewHelp'],
        help: ['control/closeView'], cart: ['control/closeView'],
        shelf: ['control/closeStation', 'control/viewCart'], staff: ['control/closeStation'], checkout: [] },
      navigation: states.map(state => ({ navigationStateId: state.stateId,
        locations: Object.entries(links).map(([location, ids]) => ({ location,
          choiceIds: [...ids.map(id => `walk/${id}`), 'open/fresh', 'open/staff', 'checkout/checkout'],
          visibleWalkChoices: ids.map((id, index) => ({ choiceId: `walk/${id}`, label: `보이는 통로 ${id}`,
            direction: index % 2 ? 'left' : 'up', distanceBand: index % 2 ? 'near' : 'far' })) })) })),
      shelves: [{ stationId: 'fresh', browseChoiceIds: ['browse/fresh/0', 'browse/fresh/1'],
        pages: [{ pageIndex: 0, choiceIds: ['add/milk'] }, { pageIndex: 1, choiceIds: ['add/apple'] }] }],
      staff: [{ stationId: 'staff', choiceIds: ['requestCashier/checkout'] }],
      checkout: [{ checkoutId: 'checkout', choiceIds: ['control/closeStation', 'control/giveUp', 'control/submit'] }],
      cartProductChoiceIds: ['remove/milk', 'remove/apple'] } };
}
function draft(choiceId, quantity) {
  return { choiceRef: { choiceId, ...(quantity === undefined ? {} : { quantity }) }, delayMs: 731,
    reason: '선택지와 작성자 선언 보존 회귀 시험',
    basis: { intent: choiceId === 'control/giveUp' ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: 'orient', task: '작성자가 정한 행동', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } };
}
function rejection(cursor, input, code) {
  const before = cursor.menu(), original = structuredClone(input);
  let rejected;
  assert.throws(() => cursor.append(input), error => { rejected = error; assert.equal(error.code, code); return true; });
  assert.deepEqual(rejected.context, before, 'The rejection describes the unchanged current menu');
  assert.deepEqual(cursor.menu(), before, 'A rejection cannot advance the source or insert a choice');
  assert.deepEqual(input, original, 'The original draft remains intact');
  return rejected;
}

test('an unavailable diagnostic menu never replaces the original draft error', () => {
  const bundle = fixture();
  bundle.choiceCatalog.navigation[0].locations = bundle.choiceCatalog.navigation[0].locations
    .filter(location => location.location !== 'W013');
  const cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('walk/W013'));
  const before = cursor.snapshot();
  assert.throws(() => cursor.append(null), error => {
    assert.equal(error.code, 'AUTHORING_SCHEMA');
    assert.match(error.message, /complete actor decision/);
    assert.equal(error.context, undefined, 'Missing diagnostics are not a valid empty menu');
    assert.match(error.contextUnavailable, /Missing exact location menu/);
    return true;
  });
  assert.deepEqual(cursor.snapshot(), before);
});

for (const [from, forbidden, allowed] of rejectedHops) {
  test(`recheck hop ${from} -> ${forbidden} stays rejected with its exact directed menu`, () => {
    const bundle = fixture(from, forbidden, allowed), original = structuredClone(bundle);
    const cursor = createWholeTraceSourceAuthoringCursor(bundle);
    cursor.append(draft(`walk/${from}`));
    const current = cursor.menu();
    assert.equal(current.authoringRevision, 'source-task-preflight-v3');
    assert.equal(current.expectedSource.location, from);
    assert.deepEqual(current.allowedWaypointIds, allowed);
    const saved = bundle.choiceCatalog.navigation[0].locations.find(location => location.location === from);
    assert.deepEqual(current.choiceIds, [...bundle.choiceCatalog.common.shopping,
      ...bundle.choiceCatalog.common.world, ...saved.choiceIds]);
    assert.deepEqual(current.visibleWalkChoices, saved.visibleWalkChoices, 'Saved labels, directions, distances and order survive');
    assert.equal(current.choiceIds.includes(`walk/${forbidden}`), false);
    assert.ok(bundle.choiceCatalog.entries.some(entry => entry.choiceId === `walk/${forbidden}`),
      'A global catalog entry and reverse edge do not authorize this directed hop');
    const error = rejection(cursor, draft(`walk/${forbidden}`), 'AUTHORING_CHOICE_NOT_AVAILABLE');
    error.context.allowedWaypointIds.splice(0); error.context.expectedSource.location = forbidden;
    assert.deepEqual(cursor.menu(), current, 'Error context does not expose mutable cursor state');
    cursor.append(draft('control/giveUp'));
    assert.deepEqual(cursor.finish().decisions.map(decision => decision.choiceRef.choiceId),
      [`walk/${from}`, 'control/giveUp'], 'The aid selects no replacement and adds no intermediate hop');
    assert.deepEqual(bundle, original);
  });
}

test('menu intersects directed edges with saved choices without sorting or enriching visible cues', () => {
  const bundle = fixture(), navigation = bundle.choiceCatalog.navigation[0];
  const start = navigation.locations.find(location => location.location === 'start');
  // W003 has a graph edge only; W012 has a saved menu entry only. Neither is a current walk.
  bundle.worldReference.navigation.states[0].start.allowedWaypointIds.push('W003');
  start.choiceIds.unshift('walk/W012');
  start.visibleWalkChoices.unshift({ choiceId: 'walk/W012', label: '화면에 저장된 통로', direction: 'right', distanceBand: 'far' });
  start.visibleWalkChoices.push({ choiceId: 'walk/W003', label: '메뉴 밖 통로', direction: 'down', distanceBand: 'near' });
  const cursor = createWholeTraceSourceAuthoringCursor(bundle), menu = cursor.menu();
  assert.deepEqual(menu.allowedWaypointIds, ['W013']);
  assert.deepEqual(menu.visibleWalkChoices, [start.visibleWalkChoices[1]]);
  rejection(cursor, draft('walk/W012'), 'AUTHORING_CHOICE_NOT_AVAILABLE');
  rejection(cursor, draft('walk/W003'), 'AUTHORING_CHOICE_NOT_AVAILABLE');
});

test('source keys including null and undefined are rejected verbatim with usable unchanged context', () => {
  const bundle = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('walk/W013'));
  for (const source of [null, undefined, bundle.initialChoiceFrame.source, cursor.snapshot().expectedSource]) {
    const input = draft('control/readList'); input.choiceRef.source = source;
    const error = rejection(cursor, input, 'AUTHORING_SOURCE_SUPPLIED');
    assert.match(error.message, /Omit the source key entirely/);
    assert.ok(Object.hasOwn(input.choiceRef, 'source'));
    assert.deepEqual(input.choiceRef.source, source);
  }
  cursor.append(draft('control/giveUp'));
  assert.equal(cursor.finish().decisions.length, 2);
});

test('menu and snapshot are read-only copies with no engine, cognition or recommendation output', () => {
  const bundle = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const expected = cursor.menu();
  assert.deepEqual(Object.keys(cursor.snapshot()).sort(), ['decisionCount', 'expectedSource', 'kind', 'terminal']);
  assert.deepEqual(Object.keys(expected).sort(), ['allowedWaypointIds', 'authoringRevision', 'availableChoices', 'choiceIds',
    'decisionCount', 'expectedSource', 'interactionContext', 'kind', 'notice', 'presentationRevision', 'terminal', 'visibleWalkChoices']);
  assert.deepEqual(Object.keys(expected.visibleWalkChoices[0]).sort(), ['choiceId', 'direction', 'distanceBand', 'label']);
  const menu = cursor.menu();
  menu.choiceIds.splice(0); menu.allowedWaypointIds[0] = 'invented';
  menu.expectedSource.location = 'invented'; menu.visibleWalkChoices[0].label = '추천 경로';
  menu.availableChoices[0].label = '추천 행동'; menu.availableChoices.splice(1);
  menu.interactionContext.kind = 'shelf'; menu.interactionContext.label = '외부 화면';
  bundle.choiceCatalog.navigation[0].locations[0].visibleWalkChoices[0].label = '외부 변경';
  bundle.choiceCatalog.common.world.splice(0);
  bundle.choiceCatalog.entries[0].label = '외부 선택지';
  bundle.worldReference.navigation.states[0].start.nearbyStations[0].label = '외부 장소';
  assert.deepEqual(cursor.menu(), expected, 'Neither caller data nor returned copies mutate the saved cursor catalog');
  cursor.append(draft('walk/W013'));
  assert.equal(cursor.menu().expectedSource.location, 'W013');
  assert.equal(expected.expectedSource.location, 'start', 'Previously returned menus do not track later transitions');
});

test('help, cart, shelf, staff and checkout panels hide all world walks', () => {
  for (const choiceId of ['control/viewHelp', 'control/viewCart', 'open/fresh', 'open/staff', 'checkout/checkout']) {
    const cursor = createWholeTraceSourceAuthoringCursor(fixture());
    cursor.append(draft('walk/W013'));
    const world = cursor.menu(); cursor.append(draft(choiceId));
    const panel = cursor.menu();
    assert.deepEqual(panel.allowedWaypointIds, []);
    assert.deepEqual(panel.visibleWalkChoices, []);
    assert.equal(panel.choiceIds.some(id => id.startsWith('walk/')), false);
    rejection(cursor, draft('walk/W003'), 'AUTHORING_CHOICE_NOT_AVAILABLE');
    cursor.append(draft(choiceId.startsWith('control/') ? 'control/closeView' : 'control/closeStation'));
    assert.deepEqual(cursor.menu().expectedSource, world.expectedSource);
    assert.deepEqual(cursor.menu().choiceIds, world.choiceIds);
    assert.deepEqual(cursor.menu().visibleWalkChoices, world.visibleWalkChoices);
  }
});

test('page, cart and stock menus follow only explicitly authored transitions without changing quantity', () => {
  const cursor = createWholeTraceSourceAuthoringCursor(fixture());
  cursor.append(draft('open/fresh'));
  assert.ok(cursor.menu().choiceIds.includes('add/milk'));
  assert.equal(cursor.menu().choiceIds.includes('add/apple'), false);
  cursor.append(draft('browse/fresh/1'));
  assert.equal(cursor.menu().expectedSource.pageIndex, 1);
  assert.ok(cursor.menu().choiceIds.includes('add/apple'));
  rejection(cursor, draft('add/apple', 6), 'AUTHORING_CHOICE_NOT_AVAILABLE');
  const chosen = draft('add/apple', 5), original = structuredClone(chosen), assembled = cursor.append(chosen);
  const { source, ...choiceRef } = assembled.choiceRef;
  assert.deepEqual({ ...assembled, choiceRef }, original, 'Only the missing source is added');
  assert.equal(cursor.menu().choiceIds.includes('add/apple'), false, 'Exactly the authored stock amount was consumed');
  cursor.append(draft('control/viewCart'));
  assert.equal(cursor.menu().expectedSource.pageIndex, null);
  assert.ok(cursor.menu().choiceIds.includes('remove/apple'));
  assert.equal(cursor.menu().choiceIds.includes('remove/milk'), false);
  cursor.append(draft('control/closeView'));
  assert.equal(cursor.menu().expectedSource.pageIndex, 1);
  cursor.append(draft('control/giveUp'));
  assert.deepEqual(cursor.finish().decisions.filter(decision => decision.choiceRef.quantity !== undefined)
    .map(decision => decision.choiceRef.quantity), [5]);
});

test('cashier transition updates the saved navigation menu and terminal menus expose no actions', () => {
  const bundle = fixture();
  const staffed = bundle.choiceCatalog.navigation.find(state => state.navigationStateId === 'cashiers-1');
  staffed.locations.find(location => location.location === 'start').choiceIds = ['checkout/checkout'];
  const cursor = createWholeTraceSourceAuthoringCursor(bundle);
  cursor.append(draft('checkout/checkout'));
  assert.equal(cursor.menu().choiceIds.includes('control/submit'), false);
  cursor.append(draft('control/closeStation'));
  cursor.append(draft('open/staff')); cursor.append(draft('requestCashier/checkout'));
  assert.equal(cursor.menu().expectedSource.navigationStateId, 'cashiers-1');
  assert.equal(cursor.menu().choiceIds.includes('requestCashier/checkout'), false);
  cursor.append(draft('control/closeStation'));
  assert.deepEqual(cursor.menu().allowedWaypointIds, []);
  cursor.append(draft('checkout/checkout'));
  assert.ok(cursor.menu().choiceIds.includes('control/submit'));
  cursor.append(draft('control/submit'));
  assert.deepEqual(cursor.menu(), { kind: 'symbolic-expected-source-v1', expectedSource: null,
    decisionCount: 7, terminal: true, authoringRevision: 'source-task-preflight-v3', choiceIds: [],
    presentationRevision: 'current-choice-menu-v1',
    interactionContext: { kind: 'terminal', stationId: null, label: '작성 종료: 현재 선택지 없음' },
    availableChoices: [],
    notice: '현재 선택 가능 여부는 이 메뉴의 choiceIds를 기준으로 확인한다. availableChoices는 같은 순서의 라벨이다.',
    allowedWaypointIds: [], visibleWalkChoices: [] });
  rejection(cursor, draft('control/giveUp'), 'AUTHORING_TERMINAL');
  assert.equal(cursor.finish().decisions.at(-1).choiceRef.choiceId, 'control/submit');
});

test('current interaction and one-to-one saved labels follow the same menu branch without changing availability', () => {
  const bundle = fixture(), original = structuredClone(bundle);
  const cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const check = (kind, stationId, label) => {
    const menu = cursor.menu();
    assert.equal(menu.presentationRevision, 'current-choice-menu-v1');
    assert.deepEqual(menu.interactionContext, { kind, stationId, label });
    assert.deepEqual(menu.availableChoices, menu.choiceIds.map(choiceId => ({ choiceId,
      label: bundle.choiceCatalog.entries.find(entry => entry.choiceId === choiceId).label })));
    assert.match(menu.notice, /현재 선택 가능 여부.*choiceIds/);
    return menu;
  };
  const world = check('world', null, '매장 통로 화면');
  assert.ok(world.choiceIds.includes('control/readList'));
  cursor.append(draft('control/viewHelp'));
  const help = check('help', null, '이용 방법 화면');
  assert.deepEqual(help.choiceIds, [...bundle.choiceCatalog.common.shopping, 'control/closeView']);
  cursor.append(draft('control/closeView'));
  cursor.append(draft('control/viewCart'));
  check('cart', null, '장바구니 화면');
  cursor.append(draft('control/closeView'));
  cursor.append(draft('open/fresh'));
  const shelf = check('shelf', 'fresh', '매대 열림: 냉장 진열대');
  assert.equal(shelf.expectedSource.view, 'world', 'The wire view is preserved while the open shelf is explicit');
  assert.equal(shelf.choiceIds.includes('control/readList'), false);
  const invalidRead = rejection(cursor, draft('control/readList'), 'AUTHORING_CHOICE_NOT_AVAILABLE');
  assert.match(invalidRead.message, /current interaction: 매대 열림: 냉장 진열대/);
  assert.equal(invalidRead.issues, undefined, 'Presentation cannot add or change a rejection rule');
  cursor.append(draft('control/viewCart'));
  const cart = check('cart', 'fresh', '장바구니 화면 (매대 가려짐: 냉장 진열대)');
  assert.equal(cart.expectedSource.activeStation, 'fresh');
  assert.equal(cart.expectedSource.pageIndex, null);
  assert.equal(cart.choiceIds.includes('control/closeStation'), false);
  assert.equal(cart.choiceIds.includes('add/milk'), false);
  const invalidShelf = rejection(cursor, draft('control/closeStation'), 'AUTHORING_CHOICE_NOT_AVAILABLE');
  assert.match(invalidShelf.message, /장바구니 화면.*매대 가려짐/);
  cursor.append(draft('control/closeView'));
  assert.deepEqual(check('shelf', 'fresh', '매대 열림: 냉장 진열대').choiceIds, shelf.choiceIds);
  cursor.append(draft('control/closeStation'));
  cursor.append(draft('open/staff'));
  const staff = check('staff', 'staff', '종업원 1 직원 대화 열림');
  assert.ok(staff.choiceIds.includes('requestCashier/checkout'));
  cursor.append(draft('control/closeStation'));
  cursor.append(draft('checkout/checkout'));
  const checkout = check('checkout', 'checkout', '계산대 계산 화면');
  assert.equal(checkout.choiceIds.includes('control/submit'), false);
  cursor.append(draft('control/giveUp'));
  assert.deepEqual(check('terminal', null, '작성 종료: 현재 선택지 없음').availableChoices, []);
  assert.deepEqual(bundle, original);
});

test('missing presentation labels fall back to exact IDs without adding an availability rejection', () => {
  const bundle = fixture();
  delete bundle.choiceCatalog.entries.find(entry => entry.choiceId === 'control/pause').label;
  for (const state of bundle.worldReference.navigation.states)
    for (const node of [state.start, ...state.nodes]) delete node.nearbyStations[0].label;
  const cursor = createWholeTraceSourceAuthoringCursor(bundle);
  assert.deepEqual(cursor.menu().availableChoices.find(choice => choice.choiceId === 'control/pause'),
    { choiceId: 'control/pause', label: 'control/pause' });
  cursor.append(draft('control/pause'));
  cursor.append(draft('open/fresh'));
  assert.deepEqual(cursor.menu().interactionContext, { kind: 'shelf', stationId: 'fresh', label: '매대 열림: fresh' });
  assert.ok(cursor.menu().choiceIds.includes('add/milk'));
});
