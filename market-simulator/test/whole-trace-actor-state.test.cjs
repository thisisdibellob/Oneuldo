const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { validateWholeTraceActorState, auditWholeTraceActorFidelity: reviewActor } = require('../src/wholeTraceActorState.ts');
const { WholeTraceKnowledgeLedger } = require('../src/wholeTraceKnowledge.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const { getPersona } = require('../src/personas.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');

const persona = getPersona('mild-intellectual-disability-adult');
const objectiveRules = createMarketSession({ difficulty: 'exact', objectives: ['milk', 'apple', 'curry'].map(productId => ({ productId, quantity: 1 })) }).objectives.map(goal => ({ ...goal, id: goal.productId }));
const auditWholeTraceActorFidelity = (entries, actor, options = { objectives: objectiveRules }) => reviewActor(entries, actor, options);
const neutralPersona = { character: { selectedTraits: [] } };
function state(activity = 'orient', overrides = {}) {
  return { activity, task: '현재 화면의 구체적인 단서를 살핀다', heldGoalIds: [], uncertainGoalIds: [],
    orientation: 'unfamiliar', triggerCueRefs: ['phase:shopping'], ...overrides };
}
const knowledge = {
  schemaVersion: 'actor-knowledge-v1', observationIndex: 4,
  visibleCueRefs: ['phase:shopping', 'list'], rememberedCueRefs: ['objective:milk', 'objective:apple', 'objective:curry'],
  profileCueRefs: ['persona:goal'], previousExperienceCueRefs: [],
  cues: [
    { cueRef: 'phase:shopping', kind: 'phase', source: 'current-observation', value: 'shopping' },
    { cueRef: 'list', kind: 'displayed-list-control', source: 'current-observation', value: true },
    { cueRef: 'persona:goal', kind: 'personal-goal', source: 'persona-history', value: '내 장보기를 마친다' },
    ...['milk', 'apple', 'curry'].map(id => ({ cueRef: `objective:${id}`, kind: 'read-objective',
      source: 'observed-this-visit', value: { id, label: id, quantity: 1, match: 'exact' } })),
  ],
};
const before = { schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world', activeStation: null,
  visibleStations: [], anchors: [], products: [], shelf: null, listAvailable: true, cart: null, cashiers: {} };
function entry(decisionIndex, actorState, action = { type: 'pause', durationMs: 1500 }, delayMs = 1000) {
  return { decisionIndex, actorState, action, delayMs, knowledge: structuredClone(knowledge),
    before: structuredClone(before), basis: { intent: 'explore', cueRefs: ['phase:shopping'] } };
}
const codes = audit => audit.findings.map(finding => finding.code);

test('focus is explicit, known and separate from remembered goal order, with nullable legacy compatibility', () => {
  const focused = state('shop', { heldGoalIds: ['milk', 'apple'], focusedGoalId: 'apple', focusedProductId: 'apple' });
  const seen = structuredClone(knowledge);
  seen.cues.push({ cueRef: 'product:apple', kind: 'displayed-product', source: 'observed-this-visit', value: { id: 'apple' } });
  assert.equal(validateWholeTraceActorState(focused, { knowledge: seen, persona, requireFocusFields: true }).valid, true);
  assert.equal(validateWholeTraceActorState(state(), { requireFocusFields: true }).valid, false);
  assert.equal(validateWholeTraceActorState(state()).valid, true);
  for (const field of ['focusedGoalId', 'focusedProductId']) {
    assert.equal(validateWholeTraceActorState({ ...focused, [field]: null }, { knowledge: seen, persona, requireFocusFields: true }).valid, true);
    for (const value of [undefined, '', 3, [], {}, 'x'.repeat(301)])
      assert.equal(validateWholeTraceActorState({ ...focused, [field]: value }).valid, false);
  }
  assert.equal(validateWholeTraceActorState(focused, { knowledge, persona }).valid, false);
  assert.equal(validateWholeTraceActorState({ ...focused, focusedGoalId: 'curry' }, { knowledge: seen, persona }).valid, false);
  assert.equal(validateWholeTraceActorState({ ...focused, focusedGoalId: 'unread' }, { knowledge: seen, persona }).valid, false);
  const historical = structuredClone(seen);
  historical.cues.find(cue => cue.cueRef === 'product:apple').source = 'confirmed-prior-experience';
  assert.equal(validateWholeTraceActorState(focused, { knowledge: historical, persona }).valid, false);
  const cartSeen = structuredClone(knowledge);
  cartSeen.cues.push({ cueRef: 'cart:product:apple', kind: 'displayed-cart-item', source: 'current-observation', value: { productId: 'apple', quantity: 1 } });
  assert.equal(validateWholeTraceActorState(focused, { knowledge: cartSeen, persona }).valid, true);
});

test('actual purchases detect the missed banana-to-milk transition despite static goal arrays and legacy missing focus', () => {
  const objectives = createMarketSession({ difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'banana', quantity: 1 }] }).objectives;
  const rows = ['banana', 'milk'].map((productId, i) => {
    const row = entry(i ? 20 : 14, state('shop', { heldGoalIds: ['objective-1', 'objective-2'],
      focusedGoalId: i ? 'objective-1' : 'objective-2', focusedProductId: productId }), { type: 'add', productId, quantity: 1 }, i ? 3200 : 3000);
    row.knowledge.cues = objectives.map(goal => ({ cueRef: `objective:${goal.id}`, kind: 'read-objective', source: 'observed-this-visit', value: goal }));
    return row;
  });
  const original = structuredClone(rows);
  const audit = reviewActor(rows, persona, { objectives });
  assert.deepEqual(codes(audit), ['NEXT_GOAL_WITHOUT_LIST_RECHECK']);
  assert.deepEqual(audit.findings[0].decisionIndexes, [14, 20]);
  assert.equal(audit.summary.goalSwitches, 1);
  assert.equal(audit.summary.focusGoalSwitches, 1);
  assert.equal(audit.focusCoverage.recordedDecisions, 2);
  assert.deepEqual(rows, original, 'review cannot insert a list read or alter the cart/action');
  const old = structuredClone(rows);
  old.forEach(row => { delete row.actorState.focusedGoalId; delete row.actorState.focusedProductId; });
  const legacy = reviewActor(old, persona, { objectives });
  assert.deepEqual(codes(legacy), ['NEXT_GOAL_WITHOUT_LIST_RECHECK']);
  assert.equal(legacy.summary.goalSwitches, 1);
  assert.equal(legacy.summary.focusGoalSwitches, 0, 'heldGoalIds[0] never masquerades as current focus');
  assert.deepEqual(legacy.focusCoverage.unrecordedDecisionIndexes, [14, 20]);
  const check = entry(17, state('check'), { type: 'readList', durationMs: 2000 }, 2700);
  assert.equal(reviewActor([rows[0], check, rows[1]], persona, { objectives }).status, 'clear');
});

test('actual family selections, comparisons, extras and activity relabeling do not bypass or fabricate next-goal reviews', () => {
  const objectives = createMarketSession({ difficulty: 'family', objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 1 }] }).objectives;
  function selected(index, productId, activity = 'shop') {
    const row = entry(index, state(activity), { type: 'add', productId, quantity: 1 }, 1300 + index * 100);
    row.knowledge.cues = objectives.map(goal => ({ cueRef: `objective:${goal.id}`, kind: 'read-objective', source: 'observed-this-visit', value: goal }));
    return row;
  }
  const variants = [selected(0, 'milk'), selected(1, 'milk-large')];
  const sameGoal = reviewActor(variants, persona, { objectives });
  assert.equal(sameGoal.summary.goalSwitches, 0);
  assert.equal(sameGoal.summary.productSwitches, 1);
  assert.equal(sameGoal.status, 'clear');
  const extra = selected(2, 'curry', 'interest'); extra.basis.intent = 'interest';
  const later = selected(3, 'apple', 'orient');
  const changed = reviewActor([...variants, extra, later], persona, { objectives });
  assert.deepEqual(codes(changed), ['NEXT_GOAL_WITHOUT_LIST_RECHECK', 'INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY']);
  assert.deepEqual(changed.findings[0].decisionIndexes, [1, 3]);
  assert.equal(changed.summary.goalSwitches, 1);
  assert.equal(reviewActor([...variants, later], neutralPersona, { objectives }).status, 'clear');
  const shoppingAfterInterest = { ...later, basis: { intent: 'task', cueRefs: [] } };
  const relabeled = reviewActor([...variants, extra, shoppingAfterInterest], persona, { objectives });
  assert.ok(codes(relabeled).includes('INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY'));
  assert.equal(relabeled.summary.interestReturns, 1, 'actual shopping selection cannot hide behind an orient activity label');
});

test('a wrong listed product under unchanged explicit focus is a possible mistake, not an intentional next-item habit violation', () => {
  const held = ['milk', 'apple'];
  const select = entry(0, state('shop', { heldGoalIds: held, focusedGoalId: 'milk', focusedProductId: 'milk' }), { type: 'add', productId: 'milk', quantity: 1 }, 1800);
  const mistake = entry(1, state('shop', { heldGoalIds: held, focusedGoalId: 'milk', focusedProductId: 'apple' }), { type: 'add', productId: 'apple', quantity: 1 }, 2400);
  const back = { ...select, decisionIndex: 2 };
  const audit = auditWholeTraceActorFidelity([select, mistake, back], persona);
  assert.deepEqual(codes(audit), ['FOCUS_GOAL_SELECTION_MISMATCH']);
  assert.equal(audit.summary.goalSwitches, 2, 'actual selection facts are retained');
  assert.equal(audit.summary.focusGoalSwitches, 0, 'declared task intent did not switch');
  assert.equal(audit.transitions.find(row => row.kind === 'purchase-goal').selectionFocus, 'different-goal');
  assert.equal(mistake.action.productId, 'apple');
});

test('focus/action mismatch is descriptive; a legal wrong product is retained and never corrected', () => {
  const row = entry(0, state('shop', { heldGoalIds: ['milk'], focusedGoalId: 'milk', focusedProductId: 'milk' }),
    { type: 'add', productId: 'apple', quantity: 1 }, 2000);
  const original = structuredClone(row);
  assert.deepEqual(codes(auditWholeTraceActorFidelity([row], neutralPersona)), ['FOCUS_ACTION_MISMATCH']);
  assert.deepEqual(row, original);
  const interest = { ...row, actorState: { ...row.actorState, activity: 'interest', focusedGoalId: null, focusedProductId: 'apple' }, basis: { intent: 'interest', cueRefs: [] } };
  assert.equal(auditWholeTraceActorFidelity([interest], neutralPersona).status, 'clear');
});

test('a recovery label alone cannot hide unsupported interest return or cleared uncertainty', () => {
  const interest = entry(0, state('interest'), { type: 'pause', durationMs: 1500 }, 1500);
  const label = entry(1, state('recover'), { type: 'pause', durationMs: 1500 }, 1700);
  const shop = entry(2, state('shop', { heldGoalIds: ['milk'] }), { type: 'add', productId: 'milk', quantity: 1 }, 2300);
  assert.deepEqual(codes(auditWholeTraceActorFidelity([interest, label, shop], neutralPersona)), ['INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY']);
  label.actorState.triggerCueRefs = ['objective:milk']; label.actorState.heldGoalIds = ['milk'];
  assert.equal(auditWholeTraceActorFidelity([interest, label, shop], neutralPersona).status, 'clear');
  const uncertain = entry(0, state('check', { heldGoalIds: ['milk'], uncertainGoalIds: ['milk'] }), { type: 'pause', durationMs: 1500 }, 1700);
  const cleared = entry(1, state('shop', { heldGoalIds: ['milk'] }), { type: 'pause', durationMs: 1500 }, 2200);
  assert.deepEqual(codes(auditWholeTraceActorFidelity([uncertain, cleared], neutralPersona)), ['UNCERTAINTY_CLEARED_WITHOUT_RECORDED_CUE']);
  const reading = { ...uncertain, action: { type: 'readList', durationMs: 2000 } };
  assert.equal(auditWholeTraceActorFidelity([reading, cleared], neutralPersona).status, 'clear');
  cleared.actorState.triggerCueRefs = ['objective:milk'];
  assert.equal(auditWholeTraceActorFidelity([uncertain, cleared], neutralPersona).status, 'clear');
  const productCue = { cueRef: 'product:apple', kind: 'displayed-product', source: 'current-observation', value: { id: 'apple' } };
  cleared.knowledge.cues.push(productCue); cleared.actorState.triggerCueRefs = ['product:apple'];
  assert.deepEqual(codes(auditWholeTraceActorFidelity([uncertain, cleared], neutralPersona)), ['UNCERTAINTY_CLEARED_WITHOUT_RECORDED_CUE']);
  cleared.knowledge.cues.push({ ...productCue, cueRef: 'product:milk', value: { id: 'milk' } });
  cleared.actorState.triggerCueRefs = ['product:milk'];
  assert.equal(auditWholeTraceActorFidelity([uncertain, cleared], neutralPersona).status, 'clear');
});

test('a retained unrelated goal cue cannot replace the actual focused-goal recall after interest', () => {
  const interest = entry(0, state('interest', { heldGoalIds: ['milk', 'apple'], focusedGoalId: null, focusedProductId: 'curry' }), { type: 'pause', durationMs: 1500 }, 1700);
  const shop = entry(1, state('shop', { heldGoalIds: ['milk', 'apple'], focusedGoalId: 'apple', focusedProductId: 'apple', triggerCueRefs: ['objective:milk'] }),
    { type: 'add', productId: 'apple', quantity: 1 }, 2400);
  assert.deepEqual(codes(auditWholeTraceActorFidelity([interest, shop], neutralPersona)), ['INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY']);
  shop.actorState.triggerCueRefs = ['objective:apple'];
  assert.equal(auditWholeTraceActorFidelity([interest, shop], neutralPersona).status, 'clear');
  shop.actorState.focusedGoalId = 'milk';
  assert.ok(codes(auditWholeTraceActorFidelity([interest, shop], neutralPersona)).includes('FOCUS_GOAL_SELECTION_MISMATCH'));
  assert.equal(shop.action.productId, 'apple');
  shop.actorState.focusedGoalId = null;
  assert.ok(codes(auditWholeTraceActorFidelity([shop], neutralPersona)).includes('FOCUS_GOAL_SELECTION_MISMATCH'),
    'nullable fields cannot silently hide the focus of a stated task purchase');
  shop.actorState.activity = 'interest'; shop.basis.intent = 'interest';
  assert.equal(auditWholeTraceActorFidelity([shop], neutralPersona).status, 'clear', 'a personal-interest selection need not invent a shopping goal');
});

test('context coverage separates a category sign from actual preferred-product exposure and allows competent simple tasks', () => {
  const sign = entry(0, state('orient', { triggerCueRefs: ['station:meal'] }), { type: 'walkToAnchor', anchorId: 'seen' }, 1700);
  sign.before.visibleStations = [{ id: 'meal', kind: 'shelf', label: '간편식품', direction: 'east', distanceBand: 'near', near: true }];
  sign.knowledge.cues.push({ cueRef: 'station:meal', kind: 'visible-station', source: 'current-observation', value: sign.before.visibleStations[0] });
  const observed = entry(1, state('shop', { heldGoalIds: ['milk', 'apple'], focusedGoalId: 'milk', focusedProductId: 'milk' }), { type: 'add', productId: 'milk', quantity: 1 }, 2600);
  observed.before.products = [{ id: 'milk', categoryId: 'fresh', name: '흰 우유', price: 2200, stock: 3 }];
  const simple = auditWholeTraceActorFidelity([sign, observed], persona);
  assert.equal(simple.status, 'clear', 'no missing interest, wandering or error quota');
  assert.deepEqual(simple.situations.interestExposure.categorySignDecisionIndexes, [0]);
  assert.deepEqual(simple.situations.interestExposure.productDecisionIndexes, []);
  assert.deepEqual(simple.situations.unfamiliar.localCueLinkedDecisionIndexes, [0]);
  assert.deepEqual(simple.situations.memoryLoad.readGoalsOverCapacityDecisionIndexes, [0, 1], 'three read archived goals exceed the configured two-goal set, without forcing failure');
  observed.before.products.push({ id: 'curry', categoryId: 'meal', name: '카레', price: 1800, stock: 3 });
  const exposed = auditWholeTraceActorFidelity([sign, observed], persona);
  assert.deepEqual(exposed.situations.interestExposure.productDecisionIndexes, [1]);
  assert.equal(exposed.summary.activityCounts.interest, 0);
  assert.equal(exposed.status, 'clear', 'one exposure does not force an interest action');
  observed.actorState.uncertainGoalIds = ['apple']; observed.action = { type: 'viewHelp' };
  const load = auditWholeTraceActorFidelity([sign, observed], persona);
  assert.deepEqual(load.situations.memoryLoad.uncertainDecisionIndexes, [1]);
  assert.deepEqual(load.situations.memoryLoad.checksDuringUncertaintyDecisionIndexes, [1]);
});

test('required public actor state accepts a shape-only check and rejects unknown private-reasoning fields', () => {
  assert.equal(validateWholeTraceActorState(state()).valid, true);
  assert.equal(validateWholeTraceActorState(state('recover', { heldGoalIds: ['milk'], uncertainGoalIds: ['milk'] })).valid, true);
  for (const invalid of [undefined, null, [], { ...state(), thinking: 'hidden reasoning' },
    { ...state(), activity: 'optimal' }, { ...state(), orientation: 'omniscient' }, { ...state(), task: '' },
    { ...state(), task: 'x'.repeat(161) }, { ...state(), heldGoalIds: ['milk', 'milk'] },
    { ...state(), uncertainGoalIds: [4] }, { ...state(), triggerCueRefs: [] },
    { ...state(), triggerCueRefs: Array.from({ length: 13 }, (_, i) => `cue:${i}`) },
    { ...state(), triggerCueRefs: ['phase:shopping', 'phase:shopping'] },
    { ...state(), triggerCueRefs: ['x'.repeat(301)] }]) assert.equal(validateWholeTraceActorState(invalid).valid, false);
  for (const field of Object.keys(state())) {
    const invalid = state(); delete invalid[field];
    assert.equal(validateWholeTraceActorState(invalid).valid, false, `${field} must be required`);
  }
});

test('only an actual accepted list read enables held and uncertain objective declarations for the next decision', () => {
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'actor-state-read-fixture', stockPerProduct: 5 }));
  const guard = new TraceGuard(snapshot, persona.id, persona.version, 'offline-fixture', true, true);
  const ledger = new WholeTraceKnowledgeLedger(persona);
  const initial = ledger.observe(guard.observeActor()).knowledge;
  const objectiveId = guard.observe().objectives[0].id;
  const proposed = state('shop', { heldGoalIds: [objectiveId], uncertainGoalIds: [objectiveId], triggerCueRefs: [`objective:${objectiveId}`] });
  const beforeRead = validateWholeTraceActorState(proposed, { knowledge: initial, persona });
  assert.equal(beforeRead.valid, false);
  assert.ok(beforeRead.errors.some(error => error.includes('unread objective')));
  guard.execute({ id: 'state-list-read', type: 'readList', durationMs: 2000, reactionDelayMs: 1600,
    timeoutMs: 10000, reason: '실제로 목록의 현재 항목을 읽는다' });
  const read = ledger.observe(guard.observeActor()).knowledge;
  assert.equal(validateWholeTraceActorState(proposed, { knowledge: read, persona }).valid, true);
  guard.execute({ id: 'state-interest-pause', type: 'pause', durationMs: 1500, reactionDelayMs: 1800,
    timeoutMs: 10000, reason: '다른 단서를 살핀다' });
  const remembered = ledger.observe(guard.observeActor()).knowledge;
  assert.ok(remembered.rememberedCueRefs.includes(`objective:${objectiveId}`));
  assert.equal(validateWholeTraceActorState(state('interest', { triggerCueRefs: ['persona:preference:0'] }),
    { knowledge: remembered, persona, previous: proposed }).valid, true);
  // Removing an objective from current attention does not erase its actual read.
  assert.equal(validateWholeTraceActorState(proposed, { knowledge: ledger.snapshot(), persona,
    previous: state('interest', { triggerCueRefs: ['persona:preference:0'] }) }).valid, true);
});

test('held goals are bounded independently of the observed knowledge ledger; uncertainty need not force forgetting', () => {
  const original = structuredClone(knowledge);
  const bounded = state('shop', { heldGoalIds: ['milk', 'apple'], uncertainGoalIds: ['apple', 'curry'],
    orientation: 'recognizing', triggerCueRefs: ['objective:milk', 'persona:goal'] });
  assert.equal(validateWholeTraceActorState(bounded, { knowledge, persona }).valid, true);
  const tooMany = validateWholeTraceActorState({ ...bounded, heldGoalIds: ['milk', 'apple', 'curry'] }, { knowledge, persona });
  assert.equal(tooMany.valid, false);
  assert.ok(tooMany.errors.some(error => error.includes('goalMemoryCapacity (2)')));
  assert.equal(validateWholeTraceActorState(bounded, { knowledge, persona, previous: bounded }).valid, true);
  assert.equal(validateWholeTraceActorState({ ...bounded, activity: 'interest' }, { knowledge, persona, previous: bounded }).valid, true);
  assert.deepEqual(knowledge, original);
});

test('changed declarations require known trigger cues and cannot claim unread goals from personal or prior history', () => {
  assert.equal(validateWholeTraceActorState(state('shop', { heldGoalIds: ['milk'], triggerCueRefs: ['objective:milk'] }),
    { knowledge, persona, previous: state() }).valid, true);
  for (const invalid of [state('shop', { heldGoalIds: ['secret'] }), state('recover', { uncertainGoalIds: ['secret'] }),
    state('interest', { triggerCueRefs: ['product:hidden'] }), state('orient', { triggerCueRefs: ['instruction:entry:unknown'] })])
    assert.equal(validateWholeTraceActorState(invalid, { knowledge, persona, previous: state() }).valid, false);
  for (const source of ['persona-history', 'confirmed-prior-experience']) {
    const historical = structuredClone(knowledge);
    historical.cues.push({ cueRef: 'objective:secret', kind: 'read-objective', source, value: { id: 'secret' } });
    assert.equal(validateWholeTraceActorState(state('shop', { heldGoalIds: ['secret'], triggerCueRefs: ['objective:secret'] }),
      { knowledge: historical, persona }).valid, false);
  }
});

test('new held goals declare the actual objective cue while retained goals need no forced recall or decay', () => {
  const previous = state('shop', { heldGoalIds: ['milk'], triggerCueRefs: ['objective:milk'] });
  const next = state('shop', { heldGoalIds: ['milk', 'apple'], triggerCueRefs: ['phase:shopping'] });
  const missing = validateWholeTraceActorState(next, { knowledge, persona, previous });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some(error => error.includes('Newly held goal apple')));
  assert.equal(validateWholeTraceActorState({ ...next, triggerCueRefs: ['objective:apple'] }, { knowledge, persona, previous }).valid, true);
  assert.equal(validateWholeTraceActorState({ ...previous, activity: 'interest', triggerCueRefs: ['phase:shopping'] },
    { knowledge, persona, previous }).valid, true);
  // Root starts with empty held goals. A first decision cannot quietly copy
  // an already read goal merely by naming the phase or visible list control.
  assert.equal(validateWholeTraceActorState({ ...previous, triggerCueRefs: ['list'] },
    { knowledge, persona, previous: state() }).valid, false);
});

test('uncertainty transitions have a relevant known cue without imposing an uncertainty quota', () => {
  const previous = state('shop', { heldGoalIds: ['milk'], triggerCueRefs: ['objective:milk'] });
  const uncertain = { ...previous, activity: 'interest', uncertainGoalIds: ['milk'], triggerCueRefs: ['phase:shopping'] };
  assert.equal(validateWholeTraceActorState(uncertain, { knowledge, persona, previous }).valid, false);
  assert.equal(validateWholeTraceActorState({ ...uncertain, triggerCueRefs: ['objective:milk'] }, { knowledge, persona, previous }).valid, true);
  const knownPreference = structuredClone(knowledge);
  knownPreference.cues.push({ cueRef: 'persona:preference:0', kind: 'personal-preference', source: 'persona-history', value: '관심 상품의 맛을 살핀다' });
  const preferenceSwitch = { ...uncertain, triggerCueRefs: ['persona:preference:0'] };
  assert.equal(validateWholeTraceActorState(preferenceSwitch, { knowledge: knownPreference, persona, previous }).valid, true);
  const clear = { ...previous, triggerCueRefs: ['phase:shopping'] };
  assert.equal(validateWholeTraceActorState(clear, { knowledge, persona, previous: preferenceSwitch }).valid, false);
  assert.equal(validateWholeTraceActorState({ ...clear, triggerCueRefs: ['objective:milk'] },
    { knowledge, persona, previous: preferenceSwitch }).valid, true);
  assert.equal(validateWholeTraceActorState({ ...previous, orientation: 'familiar' }, { knowledge, persona, previous }).valid, true);
});

test('fidelity review permits a direct successful episode without wandering, capture, mistakes or forced recovery', () => {
  const entries = [entry(0, state(), { type: 'readList', durationMs: 2000 }, 1700),
    entry(1, state('shop', { heldGoalIds: ['milk'], triggerCueRefs: ['objective:milk'] }), { type: 'add', productId: 'milk', quantity: 1 }, 1300),
    entry(2, state('finish', { heldGoalIds: [], orientation: 'recognizing' }), { type: 'submit' }, 1400)];
  const original = structuredClone(entries);
  const audit = auditWholeTraceActorFidelity(entries, persona);
  assert.equal(audit.status, 'clear');
  assert.deepEqual(audit.findings, []);
  assert.equal(audit.summary.activityCounts.interest, 0);
  assert.match(audit.limitation, /not a fidelity or clinical pass/);
  assert.deepEqual(entries, original);
});

test('uniform reaction delays across varied activities are a soft review finding only after eight decisions', () => {
  const entries = Array.from({ length: 8 }, (_, i) => entry(i, state(i % 2 ? 'check' : 'shop'),
    i % 2 ? { type: 'viewCart' } : { type: 'pause', durationMs: 1500 }, 1800));
  assert.equal(auditWholeTraceActorFidelity(entries.slice(0, 7), neutralPersona).status, 'clear');
  const audit = auditWholeTraceActorFidelity(entries, neutralPersona);
  assert.equal(audit.status, 'review');
  assert.deepEqual(codes(audit), ['UNIFORM_REACTION_DELAYS']);
  assert.deepEqual(audit.findings[0].decisionIndexes, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(audit.findings[0].severity, 'warning');
  assert.equal(audit.summary.distinctReactionDelays, 1);
  entries[7].delayMs = 2100;
  assert.equal(auditWholeTraceActorFidelity(entries, neutralPersona).status, 'clear');
});

test('a repeated shop label cannot hide uniform delays across different actions, while one walking routine remains permitted', () => {
  const entries = Array.from({ length: 8 }, (_, i) => entry(i, state('shop'),
    i % 2 ? { type: 'add', productId: 'milk', quantity: 1 } : { type: 'walkToAnchor', anchorId: 'seen-passage' }, 650));
  assert.deepEqual(codes(auditWholeTraceActorFidelity(entries, neutralPersona)), ['UNIFORM_REACTION_DELAYS']);
  const walks = entries.map(item => ({ ...item, action: { type: 'walkToAnchor', anchorId: 'seen-passage' } }));
  assert.equal(auditWholeTraceActorFidelity(walks, neutralPersona).status, 'clear');
});

test('interest returns are reviewed when neither an actual check nor a declared remembered goal transition is recorded', () => {
  const interest = entry(0, state('interest', { triggerCueRefs: ['persona:goal'] }));
  const shop = entry(1, state('shop', { heldGoalIds: ['milk'], triggerCueRefs: ['phase:shopping'] }),
    { type: 'walkToAnchor', anchorId: 'seen-passage' }, 2200);
  const audit = auditWholeTraceActorFidelity([interest, shop], neutralPersona);
  assert.deepEqual(codes(audit), ['INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY']);
  assert.deepEqual(audit.findings[0].decisionIndexes, [0, 1]);
  assert.equal(audit.summary.interestReturns, 1);
  // Retaining a goal during interest is allowed; the review still asks for a
  // recorded source of the transition, rather than forcing memory decay.
  const retained = { ...interest, actorState: { ...interest.actorState, heldGoalIds: ['milk'] } };
  assert.equal(validateWholeTraceActorState(retained.actorState, { knowledge, persona }).valid, true);
  assert.deepEqual(codes(auditWholeTraceActorFidelity([retained, shop], neutralPersona)), ['INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY']);
  const recalled = { ...shop, actorState: { ...shop.actorState, triggerCueRefs: ['objective:milk'] } };
  assert.equal(auditWholeTraceActorFidelity([interest, recalled], neutralPersona).status, 'clear');
});

test('self-recall, explicit recovery and actual list/cart/help checks are alternatives, with no mandatory action inserted', () => {
  const interest = entry(0, state('interest', { triggerCueRefs: ['persona:goal'] }));
  const shop = entry(2, state('shop', { heldGoalIds: ['milk'], triggerCueRefs: ['phase:shopping'] }), { type: 'pause', durationMs: 1500 }, 1400);
  const recover = entry(1, state('recover', { heldGoalIds: ['milk'], triggerCueRefs: ['objective:milk'] }), { type: 'pause', durationMs: 1500 }, 1700);
  assert.equal(auditWholeTraceActorFidelity([interest, recover, shop], neutralPersona).status, 'clear');
  for (const action of [{ type: 'readList', durationMs: 2000 }, { type: 'viewCart' }, { type: 'viewHelp' }]) {
    const check = entry(1, state('check', { triggerCueRefs: ['list'] }), action, 2300);
    assert.equal(auditWholeTraceActorFidelity([interest, check, shop], neutralPersona).status, 'clear');
    const interestCheck = { ...interest, action };
    assert.equal(auditWholeTraceActorFidelity([interestCheck, shop], neutralPersona).status, 'clear');
  }
});

test('the selected next-item recheck trait is reviewed only on an observed goal switch after selection', () => {
  const select = entry(3, state('shop', { heldGoalIds: ['milk'], triggerCueRefs: ['objective:milk'] }),
    { type: 'add', productId: 'milk', quantity: 1 }, 1300);
  const next = entry(5, state('shop', { heldGoalIds: ['apple'], triggerCueRefs: ['objective:apple'] }),
    { type: 'add', productId: 'apple', quantity: 1 }, 1900);
  const audit = auditWholeTraceActorFidelity([select, next], persona);
  assert.deepEqual(codes(audit), ['NEXT_GOAL_WITHOUT_LIST_RECHECK']);
  assert.deepEqual(audit.findings[0].decisionIndexes, [3, 5]);
  assert.ok(audit.findings[0].selectedTrait.includes('다음 항목'));
  assert.equal(audit.summary.goalSwitches, 1);
  assert.equal(auditWholeTraceActorFidelity([select, next], neutralPersona).status, 'clear');
  assert.equal(auditWholeTraceActorFidelity([select, next], getPersona('careful-checker')).status, 'clear');
  // Previously read knowledge or a cart check alone is not a new list read.
  const cartCheck = entry(4, state('check'), { type: 'viewCart' }, 1700);
  assert.deepEqual(codes(auditWholeTraceActorFidelity([select, cartCheck, next], persona)), ['NEXT_GOAL_WITHOUT_LIST_RECHECK']);
  const listCheck = entry(4, state('check'), { type: 'readList', durationMs: 2000 }, 2100);
  assert.equal(auditWholeTraceActorFidelity([select, listCheck, next], persona).status, 'clear');
  const noSelection = { ...select, action: { type: 'pause', durationMs: 1500 } };
  assert.equal(auditWholeTraceActorFidelity([noSelection, next], persona).status, 'clear');
});

test('empty fidelity review is descriptive and does not infer a failure or success quota', () => {
  const audit = auditWholeTraceActorFidelity([], persona);
  assert.equal(audit.status, 'clear');
  assert.equal(audit.summary.decisions, 0);
  assert.equal(audit.summary.maximumHeldGoals, 0);
  assert.equal(audit.summary.distinctReactionDelays, 0);
});

test('a goal-focus switch may precede a real list read; only checks before the next selection count', () => {
  const selected = entry(0, state('shop', { heldGoalIds: ['milk'], focusedGoalId: 'milk', focusedProductId: 'milk', triggerCueRefs: ['objective:milk'] }),
    { type: 'add', productId: 'milk', quantity: 1 }, 1300);
  const switchedThenRead = entry(1, state('check', { heldGoalIds: ['apple'], focusedGoalId: 'apple', focusedProductId: null, triggerCueRefs: ['objective:apple'] }),
    { type: 'readList', durationMs: 2000 }, 2100);
  const nextSelection = entry(2, state('shop', { heldGoalIds: ['apple'], focusedGoalId: 'apple', focusedProductId: 'apple', triggerCueRefs: ['objective:apple'] }),
    { type: 'add', productId: 'apple', quantity: 1 }, 1700);
  assert.equal(auditWholeTraceActorFidelity([selected, switchedThenRead, nextSelection], persona).status, 'clear');
  const lateRead = { ...switchedThenRead, decisionIndex: 3 };
  const missing = auditWholeTraceActorFidelity([selected, nextSelection, lateRead], persona);
  assert.deepEqual(codes(missing), ['NEXT_GOAL_WITHOUT_LIST_RECHECK']);
  assert.deepEqual(missing.findings[0].decisionIndexes, [0, 2]);
});
