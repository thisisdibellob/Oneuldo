const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint, createMarketEnvironment } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTraceBundle.ts');
const { resolveWholeTraceChoice, wholeTraceChoiceFrame } = require('../src/wholeTraceChoices.ts');
const { validateWholeTraceCandidate } = require('../src/wholeTraceContracts.ts');
const { WholeTraceKnowledgeLedger } = require('../src/wholeTraceKnowledge.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const { getPersona } = require('../src/personas.ts');
function fixture({ near, environment, presentation } = {}) {
  const config = { seed: 'choice-contract-test', stockPerProduct: 5, environment: { cashierCount: 2 } };
  environment ??= structuredClone(createMarketSession(config).environment);
  config.seed = environment.seed;
  if (near) environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment), undefined, presentation);
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'choice-contract-test', timingProfile: 'original' };
  const bundle = buildWholeTraceBundle(settings, 'choice-request');
  const guard = new TraceGuard(snapshot, bundle.persona.id, bundle.persona.version, 'choice-tests', true);
  const tracked = { location: 'start', navigationStateId: bundle.worldReference.navigation.initialStateId };
  return { bundle, guard, tracked };
}
function d(source, choiceId, quantity, extra = {}) {
  return { choiceRef: { source: structuredClone(source), choiceId, ...(quantity === undefined ? {} : { quantity }) }, delayMs: 650,
    reason: '화면에 보이는 조작을 선택한다', basis: { intent: 'check' }, actorState: { activity: 'check', task: '화면을 확인한다',
      heldGoalIds: [], uncertainGoalIds: [], orientation: 'unfamiliar' }, ...extra };
}
const step = action => ({ id: 'fixture-action', reactionDelayMs: 0, reason: 'Test fixture displays a real panel', ...action });
function shelfFixture() {
  const f = fixture({ near: 'fresh', presentation: { viewport: { width: 390, height: 420 }, zoom: 1.3, fontScale: 1, safeArea: { top: 0, bottom: 0 } } });
  f.guard.execute(step({ type: 'openShelf', stationId: 'fresh' }));
  return f;
}
test('bundle defaults to version 5 focused state choices and stores entry vocabulary once without quantity enumeration', () => {
  const { bundle } = fixture();
  assert.equal(bundle.bundleVersion, '8'); assert.equal(bundle.candidateVersion, '7');
  assert.deepEqual(bundle.supportedCandidateVersions, ['7', '6', '5', '4', '3']);
  const entries = bundle.choiceCatalog.entries;
  assert.equal(new Set(entries.map(e => e.choiceId)).size, entries.length);
  assert.ok(entries.filter(e => e.action.type === 'add').every(e => e.action.quantity === undefined && e.quantityBounds.min === 1));
  assert.ok(bundle.choiceCatalog.navigation.every(state => state.locations.every(location => location.choiceIds.every(id => entries.some(e => e.choiceId === id)))));
  assert.equal(bundle.initialChoiceFrame.availableChoices.some(e => e.choiceId === 'control/readList'), true);
  assert.ok(bundle.choiceCatalog.navigation.every(state => state.locations.every(location => location.visibleWalkChoices.every(choice => location.choiceIds.includes(choice.choiceId) && choice.label.includes('화면')))));
  assert.ok(bundle.initialChoiceFrame.availableChoices.filter(e => e.action.type === 'walk').every(e => e.label.includes('화면')));
  assert.equal(bundle.actorState.knowledge.cues.some(c => c.cueRef === 'cart'), false);
});

test('v5 requires both explicit nullable focus fields while v4 remains backward compatible', () => {
  const { bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const base = d(source, 'control/giveUp');
  const validV5 = { candidateVersion: '5', requestId: bundle.requestId, decisions: [structuredClone(base)] };
  validV5.decisions[0].actorState.focusedGoalId = null;
  validV5.decisions[0].actorState.focusedProductId = null;
  assert.deepEqual(validateWholeTraceCandidate(validV5, bundle.requestId), { valid: true, errors: [] });
  for (const field of ['focusedGoalId', 'focusedProductId']) {
    const missing = structuredClone(validV5); delete missing.decisions[0].actorState[field];
    const result = validateWholeTraceCandidate(missing, bundle.requestId);
    assert.equal(result.valid, false); assert.ok(result.errors.some(error => error.includes(field)));
  }
  const legacyV4 = { ...validV5, candidateVersion: '4', decisions: [structuredClone(base)] };
  assert.deepEqual(validateWholeTraceCandidate(legacyV4, bundle.requestId), { valid: true, errors: [] });
});
test('v5 preflight reports product IDs used as goal IDs together with source errors without inferring an actual read', () => {
  const { bundle } = fixture();
  const decision = d({ ...bundle.initialChoiceFrame.source, view: 'checkout' }, 'control/giveUp', undefined, {
    actorState: { activity: 'check', task: '다음 상품을 확인한다', orientation: 'unfamiliar',
      focusedGoalId: 'milk', focusedProductId: null, heldGoalIds: ['milk'], uncertainGoalIds: ['banana'],
      triggerCueRefs: ['objective:milk'] },
    basis: { intent: 'check', cueRefs: ['objective:banana'] },
  });
  const candidate = { candidateVersion: '5', requestId: bundle.requestId, decisions: [decision] };
  const objectiveIds = bundle.worldReference.objectives.map(goal => goal.id);
  const result = validateWholeTraceCandidate(candidate, bundle.requestId, { objectiveIds });
  assert.equal(result.valid, false);
  for (const fragment of ['invalid source view', 'focusedGoalId has unknown objective ID milk',
    'heldGoalIds has unknown objective ID milk', 'uncertainGoalIds has unknown objective ID banana',
    'triggerCueRefs has unknown objective reference objective:milk', 'basis.cueRefs has unknown objective reference objective:banana'])
    assert.ok(result.errors.some(error => error.includes(fragment)), fragment);
  const known = structuredClone(candidate);
  known.decisions[0].choiceRef.source.view = 'world';
  Object.assign(known.decisions[0].actorState, { focusedGoalId: objectiveIds[0], heldGoalIds: [objectiveIds[0]],
    uncertainGoalIds: [], triggerCueRefs: [`objective:${objectiveIds[0]}`] });
  known.decisions[0].basis.cueRefs = [`objective:${objectiveIds[0]}`];
  // This only validates the ID spelling. The compiler's knowledge guard must
  // still reject this first decision because no readList has occurred.
  assert.deepEqual(validateWholeTraceCandidate(known, bundle.requestId, { objectiveIds }), { valid: true, errors: [] });
});
test('choice selection maps exact walking ID and opaque full anchor reference without asking the actor to copy them', () => {
  const { bundle, guard, tracked } = fixture(), o = guard.observeActor();
  const frame = wholeTraceChoiceFrame(o, bundle, tracked), selected = frame.availableChoices.find(e => e.action.type === 'walk');
  assert.ok(selected);
  const resolved = resolveWholeTraceChoice(d(frame.source, selected.choiceId), o, bundle, tracked);
  const target = bundle.worldReference.waypoints.find(w => w.waypointId === selected.action.waypointId);
  assert.deepEqual(resolved.policyAction, { type: 'walkToAnchor', anchorId: target.anchorId });
  assert.deepEqual(resolved.decision.action, selected.action);
  assert.ok(resolved.derivedCueRefs.includes(`anchor:${target.anchorId}`));
  assert.ok(resolved.derivedCueRefs.includes('control:walkToAnchor'));
  assert.deepEqual(resolved.decision.actorState.triggerCueRefs, resolved.derivedCueRefs);
});
test('the same control ID cannot be reused with a wrong source location, phase, navigation state, panel or page', () => {
  const { bundle, guard, tracked } = fixture(), o = guard.observeActor(), frame = wholeTraceChoiceFrame(o, bundle, tracked);
  for (const changed of [{ location: bundle.worldReference.waypoints[0].waypointId }, { navigationStateId: 'cashiers-wrong' },
    { phase: 'checkout' }, { view: 'cart' }, { activeStation: 'fresh' }, { pageIndex: 0 }]) {
    const selected = d({ ...frame.source, ...changed }, 'control/pause');
    assert.throws(() => resolveWholeTraceChoice(selected, o, bundle, tracked), error => error.code === 'CHOICE_SOURCE_MISMATCH');
  }
});
test('global target IDs do not authorize a nonlocal hop or unopened shelf product', () => {
  const { bundle, guard, tracked } = fixture(), o = guard.observeActor(), frame = wholeTraceChoiceFrame(o, bundle, tracked);
  const unavailable = bundle.choiceCatalog.entries.find(e => e.action.type === 'walk' && !frame.availableChoices.some(c => c.choiceId === e.choiceId));
  assert.ok(unavailable);
  assert.throws(() => resolveWholeTraceChoice(d(frame.source, unavailable.choiceId), o, bundle, tracked), error => error.code === 'CHOICE_NOT_AVAILABLE');
  const product = bundle.choiceCatalog.entries.find(e => e.action.type === 'add');
  assert.throws(() => resolveWholeTraceChoice(d(frame.source, product.choiceId, 1), o, bundle, tracked), error => error.code === 'CHOICE_NOT_AVAILABLE');
});
test('declared checkout aliases preserve the same target and actor declarations without mutating the candidate', () => {
  for (const checkoutId of ['checkout', 'checkout-2']) {
    const { bundle, guard, tracked } = fixture({ near: checkoutId });
    const o = guard.observeActor(), frame = wholeTraceChoiceFrame(o, bundle, tracked);
    assert.ok(frame.availableChoices.some(choice => choice.choiceId === `checkout/${checkoutId}`));
    assert.ok(bundle.choiceCatalog.referenceAliases.some(alias => alias.aliasChoiceId === `open/${checkoutId}`));
    const selected = d(frame.source, `open/${checkoutId}`, undefined, { delayMs: 2400, reason: '이 계산대를 이용한다' });
    const original = structuredClone(selected);
    const resolved = resolveWholeTraceChoice(selected, o, bundle, tracked);
    assert.deepEqual(selected, original);
    assert.deepEqual(resolved.policyAction, { type: 'checkout', checkoutId });
    assert.equal(resolved.decision.delayMs, selected.delayMs);
    assert.equal(resolved.decision.reason, selected.reason);
    assert.deepEqual(resolved.resolvedChoiceRef, { ...selected.choiceRef, choiceId: `checkout/${checkoutId}` });
    assert.deepEqual(resolved.normalization, { kind: 'checkout-open-v1', authoredChoiceId: `open/${checkoutId}`, canonicalChoiceId: `checkout/${checkoutId}` });
    const exact = resolveWholeTraceChoice(d(frame.source, `checkout/${checkoutId}`), o, bundle, tracked);
    assert.equal(exact.normalization, undefined);
    assert.deepEqual(exact.policyAction, resolved.policyAction);
  }
});
test('checkout aliases still require exact source and a currently available same-checkout control', () => {
  const { bundle, guard, tracked } = fixture({ near: 'checkout' });
  const o = guard.observeActor(), frame = wholeTraceChoiceFrame(o, bundle, tracked);
  for (const changed of [{ location: 'W999' }, { navigationStateId: 'cashiers-wrong' }, { phase: 'checkout' },
    { view: 'cart' }, { activeStation: 'checkout' }, { pageIndex: 0 }]) {
    assert.throws(() => resolveWholeTraceChoice(d({ ...frame.source, ...changed }, 'open/checkout'), o, bundle, tracked),
      error => error.code === 'CHOICE_SOURCE_MISMATCH');
  }
  assert.throws(() => resolveWholeTraceChoice(d(frame.source, 'open/checkout', 1), o, bundle, tracked), error => error.code === 'CHOICE_QUANTITY');
  for (const invalid of ['open/unknown-checkout', 'open/Checkout', 'open/checkout ', 'checkout/open', 'open/fresh']) {
    assert.throws(() => resolveWholeTraceChoice(d(frame.source, invalid), o, bundle, tracked), error => error.code === 'CHOICE_NOT_AVAILABLE');
  }
  const far = fixture({ near: 'fresh' }), farObservation = far.guard.observeActor();
  const farFrame = wholeTraceChoiceFrame(farObservation, far.bundle, far.tracked);
  assert.equal(farFrame.availableChoices.some(choice => choice.action.type === 'checkout'), false);
  assert.throws(() => resolveWholeTraceChoice(d(farFrame.source, 'open/checkout'), farObservation, far.bundle, far.tracked),
    error => error.code === 'CHOICE_NOT_AVAILABLE');
  guard.execute(step({ type: 'viewCart' }));
  const cart = guard.observeActor(), cartFrame = wholeTraceChoiceFrame(cart, bundle, tracked);
  assert.throws(() => resolveWholeTraceChoice(d(cartFrame.source, 'open/checkout'), cart, bundle, tracked), error => error.code === 'CHOICE_NOT_AVAILABLE');
});
test('missing, ambiguous or retargeted alias contracts never authorize normalization', () => {
  const { bundle, guard, tracked } = fixture({ near: 'checkout' });
  const o = guard.observeActor(), selected = d(wholeTraceChoiceFrame(o, bundle, tracked).source, 'open/checkout');
  for (const change of [
    b => { delete b.choiceCatalog.referenceAliases; },
    b => { b.choiceCatalog.referenceAliases.push(structuredClone(b.choiceCatalog.referenceAliases.find(a => a.aliasChoiceId === 'open/checkout'))); },
    b => { b.choiceCatalog.referenceAliases.find(a => a.aliasChoiceId === 'open/checkout').canonicalChoiceId = 'checkout/checkout-2'; },
    b => { b.choiceCatalog.referenceAliases.find(a => a.aliasChoiceId === 'open/checkout').kind = 'unknown'; },
    b => { b.worldReference.world.checkouts = b.worldReference.world.checkouts.filter(c => c.id !== 'checkout'); },
    b => { b.choiceCatalog.navigation.find(s => s.navigationStateId === tracked.navigationStateId).locations.find(l => l.location === 'start').choiceIds = []; },
  ]) {
    const altered = structuredClone(bundle); change(altered);
    assert.throws(() => resolveWholeTraceChoice(selected, o, altered, tracked), error => error.code === 'CHOICE_NOT_AVAILABLE');
  }
});
test('directed camera/HUD edges cannot be reversed through a global choice entry', () => {
  const environment = createMarketEnvironment({ layoutId: 'classic', entranceConstruction: false, seed: 'market-1790906391403-1',
    employeeCount: { min: 1, max: 3 }, customerCount: { min: 1, max: 5 }, pillarCount: { min: 1, max: 3 }, chairCount: 0,
    cashierCount: 2, kioskPresent: 'random', shelfOrder: ['produce', 'fresh', 'household', 'meal', 'drink'] });
  environment.spawn = { x: 160, y: 640 };
  const { bundle, guard } = fixture({ environment, presentation: { viewport: { width: 668, height: 853 }, zoom: 1.3, fontScale: 1, safeArea: { top: 0, bottom: 0 } } });
  const lower = bundle.worldReference.waypoints.find(w => w.point.x === 160 && w.point.y === 640);
  const upper = bundle.worldReference.waypoints.find(w => w.point.x === 160 && w.point.y === 480);
  const state = bundle.worldReference.navigation.states[0];
  assert.ok(state.nodes.find(n => n.waypointId === upper.waypointId).allowedWaypointIds.includes(lower.waypointId));
  assert.equal(state.nodes.find(n => n.waypointId === lower.waypointId).allowedWaypointIds.includes(upper.waypointId), false);
  const tracked = { location: lower.waypointId, navigationStateId: state.stateId }, o = guard.observeActor();
  const frame = wholeTraceChoiceFrame(o, bundle, tracked);
  assert.throws(() => resolveWholeTraceChoice(d(frame.source, `walk/${upper.waypointId}`), o, bundle, tracked), error => error.code === 'CHOICE_NOT_AVAILABLE');
});
test('shelf selection checks actual page and quantity without automatically choosing one', () => {
  const { bundle, guard, tracked } = shelfFixture(), o = guard.observeActor(), frame = wholeTraceChoiceFrame(o, bundle, tracked);
  const selected = frame.availableChoices.find(e => e.action.type === 'add'); assert.ok(selected);
  assert.throws(() => resolveWholeTraceChoice(d(frame.source, selected.choiceId), o, bundle, tracked), error => error.code === 'CHOICE_QUANTITY');
  assert.throws(() => resolveWholeTraceChoice(d(frame.source, selected.choiceId, 6), o, bundle, tracked), error => error.code === 'CHOICE_QUANTITY');
  const chosen = resolveWholeTraceChoice(d(frame.source, selected.choiceId, 3), o, bundle, tracked);
  assert.equal(chosen.decision.action.quantity, 3); assert.equal(chosen.policyAction.quantity, 3);
  assert.ok(chosen.derivedCueRefs.includes(`product:${selected.action.productId}`));
  assert.throws(() => resolveWholeTraceChoice(d({ ...frame.source, pageIndex: o.shelf.page + 1 }, selected.choiceId, 1), o, bundle, tracked), error => error.code === 'CHOICE_SOURCE_MISMATCH');
  const invisible = bundle.choiceCatalog.entries.find(e => e.action.type === 'add' && !o.products.some(p => p.id === e.action.productId));
  assert.ok(invisible);
  assert.throws(() => resolveWholeTraceChoice(d(frame.source, invisible.choiceId, 1), o, bundle, tracked), error => error.code === 'CHOICE_NOT_AVAILABLE');
  assert.throws(() => resolveWholeTraceChoice(d(frame.source, 'control/closeStation', 1), o, bundle, tracked), error => error.code === 'CHOICE_QUANTITY');
});
test('cart button selection supplies control evidence while explicit undisplayed cart content remains rejected', () => {
  const { bundle, guard, tracked } = fixture(), o = guard.observeActor(), frame = wholeTraceChoiceFrame(o, bundle, tracked);
  const selected = d(frame.source, 'control/viewCart', undefined, { basis: { intent: 'check', cueRefs: ['cart'] } });
  const resolved = resolveWholeTraceChoice(selected, o, bundle, tracked);
  assert.ok(resolved.derivedCueRefs.includes('control:viewCart')); assert.equal(resolved.derivedCueRefs.includes('cart'), false);
  assert.ok(resolved.decision.basis.cueRefs.includes('cart'), 'Explicit reference is retained, not silently removed');
  const ledger = new WholeTraceKnowledgeLedger(getPersona(bundle.persona.id)); ledger.observe(o);
  assert.throws(() => ledger.assertBasis(resolved.decision.basis, resolved.policyAction), /Unobserved.*cart/);
});
test('only actually read goals can be linked, and declared unknown cue references are not filtered', () => {
  const { bundle, guard, tracked } = fixture(), o = guard.observeActor(), frame = wholeTraceChoiceFrame(o, bundle, tracked);
  const goal = bundle.worldReference.objectives[0].id;
  const ledger = new WholeTraceKnowledgeLedger(getPersona(bundle.persona.id)); const initial = ledger.observe(o).knowledge;
  const selected = d(frame.source, 'control/pause'); selected.actorState.heldGoalIds = [goal]; selected.actorState.focusedGoalId = goal;
  assert.equal(resolveWholeTraceChoice(selected, o, bundle, tracked, initial).derivedCueRefs.includes(`objective:${goal}`), false);
  guard.execute(step({ type: 'readList', durationMs: 2000 }));
  const afterRead = guard.observeActor(), known = ledger.observe(afterRead).knowledge;
  const next = wholeTraceChoiceFrame(afterRead, bundle, tracked); selected.choiceRef.source = next.source;
  const resolved = resolveWholeTraceChoice(selected, afterRead, bundle, tracked, known);
  assert.ok(resolved.derivedCueRefs.includes(`objective:${goal}`));
  selected.actorState.triggerCueRefs = ['anchor:unknown'];
  assert.ok(resolveWholeTraceChoice(selected, afterRead, bundle, tracked, known).decision.actorState.triggerCueRefs.includes('anchor:unknown'));
});
test('focused product only contributes observed evidence when it was actually displayed this visit', () => {
  const { bundle, guard, tracked } = shelfFixture(), o = guard.observeActor(), frame = wholeTraceChoiceFrame(o, bundle, tracked);
  const shown = frame.availableChoices.find(choice => choice.action.type === 'add'); assert.ok(shown);
  const selected = d(frame.source, 'control/pause'); selected.actorState.focusedProductId = shown.action.productId;
  const observed = resolveWholeTraceChoice(selected, o, bundle, tracked);
  assert.ok(observed.derivedCueRefs.includes(`product:${shown.action.productId}`));
  const hidden = bundle.choiceCatalog.entries.find(choice => choice.action.type === 'add' && !o.products.some(product => product.id === choice.action.productId));
  assert.ok(hidden); selected.actorState.focusedProductId = hidden.action.productId;
  assert.equal(resolveWholeTraceChoice(selected, o, bundle, tracked).derivedCueRefs.includes(`product:${hidden.action.productId}`), false);
});
test('a cart-only focus contributes the exact cart cue and never invents a shelf product cue', () => {
  const { bundle, guard, tracked } = shelfFixture();
  const product = guard.observeActor().products[0]; assert.ok(product);
  guard.execute(step({ type: 'dragProduct', productId: product.id, quantity: 1,
    gesture: { durationMs: 1000, hesitationMs: 0, outcome: 'drop', motorSeed: 'cart-focus-fixture' } }));
  guard.execute(step({ type: 'closeStation' }));
  guard.execute(step({ type: 'viewCart' }));
  const ledger = new WholeTraceKnowledgeLedger(getPersona(bundle.persona.id));
  const cartKnowledge = ledger.observe(guard.observeActor()).knowledge;
  assert.ok(cartKnowledge.cues.some(cue => cue.cueRef === `cart:product:${product.id}`));
  assert.equal(cartKnowledge.cues.some(cue => cue.cueRef === `product:${product.id}`), false);
  guard.execute(step({ type: 'closeView' }));
  const world = guard.observeActor(), known = ledger.observe(world).knowledge;
  const frame = wholeTraceChoiceFrame(world, bundle, tracked), selected = d(frame.source, 'control/giveUp');
  selected.actorState.focusedProductId = product.id;
  const resolved = resolveWholeTraceChoice(selected, world, bundle, tracked, known);
  assert.ok(resolved.decision.basis.cueRefs.includes(`cart:product:${product.id}`));
  assert.equal(resolved.decision.basis.cueRefs.includes(`product:${product.id}`), false);
  assert.doesNotThrow(() => ledger.assertBasis(resolved.decision.basis, resolved.policyAction));
});
test('candidate 4 optional references still have strict shape; legacy 3 keeps its required evidence', () => {
  const { bundle } = fixture(), selected = d(bundle.initialChoiceFrame.source, 'control/giveUp');
  const candidate = { candidateVersion: '4', requestId: bundle.requestId, decisions: [selected] };
  assert.deepEqual(validateWholeTraceCandidate(candidate, bundle.requestId), { valid: true, errors: [] });
  for (const malformed of [null, 'bad', { action: null }]) assert.equal(validateWholeTraceCandidate({ candidateVersion: '3', requestId: bundle.requestId, decisions: [malformed] }, bundle.requestId).valid, false);
  const legacyMissing = { candidateVersion: '3', requestId: bundle.requestId, decisions: [{ action: { type: 'giveUp' }, delayMs: 650,
    reason: selected.reason, basis: { intent: 'finish' }, actorState: selected.actorState }] };
  assert.equal(validateWholeTraceCandidate(legacyMissing, bundle.requestId).valid, false);
  for (const alter of [x => x.decisions[0].action = { type: 'giveUp' }, x => delete x.decisions[0].choiceRef.source.pageIndex,
    x => x.decisions[0].actorState.triggerCueRefs = ['duplicate', 'duplicate'], x => x.decisions[0].basis.cueRefs = ['bad', 7]]) {
    const invalid = structuredClone(candidate); alter(invalid); assert.equal(validateWholeTraceCandidate(invalid, bundle.requestId).valid, false);
  }
});
test('multiple cashier states require explicitly tracked state and reject a visible availability mismatch', () => {
  const environment = structuredClone(createMarketSession({ seed: 'multi-cashier', environment: { cashierCount: 0 } }).environment);
  const { bundle, guard } = fixture({ environment }), o = guard.observeActor();
  assert.ok(bundle.worldReference.navigation.states.length > 1);
  assert.throws(() => wholeTraceChoiceFrame(o, bundle, 'start'), /Exact tracked navigationStateId/);
  const wrong = bundle.worldReference.navigation.states.find(s => Object.values(s.cashierAvailability).some(Boolean));
  const shown = structuredClone(o); const [id, availability] = Object.entries(wrong.cashierAvailability)[0]; shown.cashiers[id] = !availability;
  assert.throws(() => wholeTraceChoiceFrame(shown, bundle, { location: 'start', navigationStateId: wrong.stateId }), /disagrees with observed cashier/);
});
test('all missing product quantities are reported before executing a candidate, without inserting defaults', () => {
  const { bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const missing = { candidateVersion: '4', requestId: bundle.requestId, decisions: [
    d(source, 'add/milk-white-900'), d(source, 'remove/milk-white-900'), d(source, 'control/giveUp'),
  ] };
  const original = structuredClone(missing), result = validateWholeTraceCandidate(missing, bundle.requestId);
  assert.equal(result.valid, false); assert.equal(result.code, 'CANDIDATE_SCHEMA');
  assert.ok(result.errors.some(message => message.includes('decisions[0]') && message.includes('quantity is required')));
  assert.ok(result.errors.some(message => message.includes('decisions[1]') && message.includes('quantity is required')));
  assert.deepEqual(missing, original);
});
