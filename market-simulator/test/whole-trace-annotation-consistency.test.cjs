const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { auditWholeTraceActorFidelity: reviewActor } = require('../src/wholeTrace/wholeTraceActorState.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const persona = { character: { selectedTraits: [] } };
const objectives = createMarketSession({ difficulty: 'exact', objectives: [
  { productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 1 },
] }).objectives;
const goal = productId => objectives.find(item => item.productId === productId).id;
const options = { objectives, annotationReview: 'actor-annotation-v1' };
function entry(index, action, state = {}, intent = 'explore') {
  return {
    decisionIndex: index, action, delayMs: 1000 + index * 200,
    actorState: { activity: 'check', task: '현재 표시된 정보를 확인한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'recognizing', triggerCueRefs: ['phase:shopping'], ...state },
    knowledge: { schemaVersion: 'actor-knowledge-v1', observationIndex: index, visibleCueRefs: ['phase:shopping'],
      rememberedCueRefs: objectives.map(item => `objective:${item.id}`), profileCueRefs: [], previousExperienceCueRefs: [],
      cues: [{ cueRef: 'phase:shopping', kind: 'phase', source: 'current-observation', value: 'shopping' },
        ...objectives.map(item => ({ cueRef: `objective:${item.id}`, kind: 'read-objective', source: 'observed-this-visit', value: item }))] },
    before: { schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world', activeStation: null,
      visibleStations: [], anchors: [], products: [], shelf: null, listAvailable: true, cart: null, cashiers: {} },
    basis: { intent, cueRefs: ['phase:shopping'] },
  };
}
const codes = review => review.annotationReview.findings.map(item => item.code);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('closing with check labels gives versioned soft evidence without changing historical fidelity output', () => {
  const rows = [entry(3, { type: 'closeStation' }), entry(8, { type: 'closeView' })];
  const legacy = reviewActor(rows, persona, { objectives });
  assert.equal(Object.hasOwn(legacy, 'annotationReview'), false);
  assert.equal(legacy.auditVersion, 'actor-fidelity-v2');
  assert.equal(legacy.status, 'clear');
  const current = reviewActor(rows, persona, options);
  const { annotationReview, ...unchanged } = current;
  assert.deepEqual(unchanged, legacy);
  assert.equal(annotationReview.reviewVersion, 'actor-annotation-v1');
  assert.equal(annotationReview.status, 'review');
  assert.deepEqual(codes(current), ['CHECK_LABEL_WITHOUT_OBSERVABLE_CHECK', 'CHECK_LABEL_WITHOUT_OBSERVABLE_CHECK']);
  assert.deepEqual(annotationReview.findings.map(item => item.decisionIndexes), [[3], [8]]);
  for (const [i, finding] of annotationReview.findings.entries()) {
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.improvementTarget, 'activity-annotation');
    assert.deepEqual(finding.evidence[0].action, rows[i].action);
    assert.deepEqual(finding.evidence[0].cueRefs, ['phase:shopping']);
    assert.equal(finding.evidence[0].declaredActivity, 'check');
    assert.match(finding.message, /implicit review/);
    assert.match(finding.recommendation, /Do not add a check action/);
  }
});

test('same-screen observation, pauses, browsing and information views do not cause false absent-check warnings', () => {
  const actions = [{ type: 'lookAround', durationMs: 1200 }, { type: 'pause', durationMs: 1800 },
    { type: 'browse', durationMs: 1000, scrollFraction: 0.25 }, { type: 'readList', durationMs: 1800 },
    { type: 'viewCart' }, { type: 'viewCheckoutCart' }, { type: 'viewHelp' }];
  const result = reviewActor(actions.map((action, i) => entry(i, action)), persona, options);
  assert.deepEqual(codes(result), []);
  assert.equal(result.annotationReview.status, 'clear');
  assert.match(result.annotationReview.limitation, /Clear means no supported annotation issue/);
  const ordinary = ['shop', 'orient', 'finish', 'rest', 'recover'].map((activity, i) => entry(i,
    { type: i % 2 ? 'closeView' : 'closeStation' }, { activity }));
  assert.deepEqual(codes(reviewActor(ordinary, persona, options)), []);
});

test('null task focus receives evidence while consistent and unrecorded legacy focus remain distinct', () => {
  const purchase = entry(12, { type: 'add', productId: 'milk', quantity: 1 }, { activity: 'shop' }, 'task');
  const missing = reviewActor([purchase], persona, options);
  assert.deepEqual(codes(missing), ['FOCUS_ACTION_MISMATCH', 'FOCUS_GOAL_SELECTION_MISMATCH']);
  for (const finding of missing.annotationReview.findings) {
    assert.equal(finding.improvementTarget, 'focus-annotation');
    assert.equal(finding.evidence[0].focusedGoalId, null);
    assert.equal(finding.evidence[0].focusedProductId, null);
    assert.equal(finding.evidence[0].action.productId, 'milk');
    assert.match(finding.recommendation, /do not fill focus from hidden objectives/);
  }
  Object.assign(purchase.actorState, { focusedGoalId: goal('milk'), focusedProductId: 'milk', heldGoalIds: [goal('milk')] });
  assert.deepEqual(codes(reviewActor([purchase], persona, options)), []);
  delete purchase.actorState.focusedGoalId;
  delete purchase.actorState.focusedProductId;
  const old = reviewActor([purchase], persona, options);
  assert.deepEqual(codes(old), [], 'unrecorded legacy focus is not explicit null');
  assert.deepEqual(old.focusCoverage.unrecordedDecisionIndexes, [12]);
});

test('a mistaken selection is reported without correcting its product, quantity or intended goal', () => {
  const purchase = entry(6, { type: 'add', productId: 'milk', quantity: 2 }, {
    activity: 'shop', focusedGoalId: goal('apple'), focusedProductId: 'milk', heldGoalIds: [goal('apple')],
  }, 'task');
  const original = structuredClone(purchase);
  freeze(purchase);
  const result = reviewActor([purchase], persona, options);
  assert.deepEqual(codes(result), ['FOCUS_GOAL_SELECTION_MISMATCH']);
  assert.equal(result.annotationReview.findings[0].severity, 'warning');
  assert.match(result.annotationReview.findings[0].message, /may record a mistaken choice/);
  assert.deepEqual(purchase, original);
  Object.assign(result.annotationReview.findings[0].evidence[0].action, { productId: 'apple', quantity: 1 });
  assert.deepEqual(purchase, original, 'evidence is detached from immutable accepted behavior');
});

test('interest purchases and unread hidden goals never receive inferred goal focus', () => {
  const interest = entry(2, { type: 'add', productId: 'milk', quantity: 1 }, {
    activity: 'interest', focusedGoalId: null, focusedProductId: 'milk',
  }, 'interest');
  assert.deepEqual(codes(reviewActor([interest], persona, options)), []);
  const unread = entry(5, { type: 'add', productId: 'apple', quantity: 1 }, {
    activity: 'shop', focusedGoalId: null, focusedProductId: 'apple',
  }, 'task');
  unread.knowledge.cues = unread.knowledge.cues.filter(cue => cue.cueRef !== `objective:${goal('apple')}`);
  unread.knowledge.rememberedCueRefs = [`objective:${goal('milk')}`];
  const result = reviewActor([unread], persona, options);
  assert.deepEqual(codes(result), [], 'full evaluator objectives cannot introduce an unread actor goal');
  assert.equal(result.summary.goalSwitches, 0);
});

test('review never mutates actions, state, knowledge, basis or trusted objectives', () => {
  const rows = [entry(4, { type: 'closeStation' }), entry(7, { type: 'remove', productId: 'apple', quantity: 1 }, {
    activity: 'shop', focusedProductId: 'milk',
  }, 'task')];
  const before = structuredClone({ rows, options, persona });
  freeze(rows); freeze(options); freeze(persona);
  const result = reviewActor(rows, persona, options);
  assert.deepEqual(codes(result), ['CHECK_LABEL_WITHOUT_OBSERVABLE_CHECK', 'FOCUS_ACTION_MISMATCH']);
  assert.deepEqual({ rows, options, persona }, before);
  result.annotationReview.findings[0].evidence[0].cueRefs.push('invented');
  assert.deepEqual({ rows, options, persona }, before);
});
