const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { reviewWholeTraceTaskExpression } = require('../src/wholeTraceTaskExpression.ts');

function entry(decisionIndex, overrides = {}) {
  return {
    decisionIndex,
    actorState: { activity: 'shop', focusedGoalId: null, focusedProductId: null, uncertainGoalIds: [] },
    basis: { intent: 'task', memoryUses: [] },
    action: { type: 'pause' }, delayMs: 900,
    cognition: { valid: true, state: { knownGoalFields: {}, uncertainGoalIds: [], activeGoals: [] }, events: [] },
    ...overrides,
  };
}
function uncertainEntry(index, goalId = 'goal-a') {
  return entry(index, { actorState: { activity: 'check', focusedGoalId: goalId, focusedProductId: null, uncertainGoalIds: [goalId] },
    cognition: { valid: true, state: { knownGoalFields: { [goalId]: ['name', 'requiredQuantity'] }, uncertainGoalIds: [goalId],
      activeGoals: [{ goalId, fields: { name: { status: 'uncertain' }, requiredQuantity: { status: 'clear' } } }] },
      events: [{ kind: 'declared-uncertain', goalId, fields: ['name'] }] } });
}

test('empty evidence is unexercised rather than a failure or quota', () => {
  const review = reviewWholeTraceTaskExpression([]);
  assert.equal(review.version, 'task-expression-v1');
  assert.equal(review.coverage.status, 'unexercised');
  assert.deepEqual(review.findings, []);
});

test('only known displayed fields with a later same-goal real list read count as exercised', () => {
  const uncertain = entry(4, { cognition: { valid: true, state: { knownGoalFields: { 'goal-a': ['name', 'hiddenField'] },
    uncertainGoalIds: ['goal-a'], activeGoals: [{ goalId: 'goal-a', fields: { name: { status: 'uncertain' }, hiddenField: { status: 'uncertain' } } }] },
    events: [{ kind: 'decayed', goalId: 'goal-a', fields: ['name', 'hiddenField'] }] } });
  const readAction = entry(5, { action: { type: 'readList' } });
  const recovery = entry(6, { cognition: { valid: true,
    state: { knownGoalFields: { 'goal-a': ['name'] }, uncertainGoalIds: [], activeGoals: [{ goalId: 'goal-a', fields: { name: { status: 'clear' } } }] },
    events: [{ kind: 'list-read', goalId: 'goal-a', fields: ['name'] }] } });
  const review = reviewWholeTraceTaskExpression([uncertain, readAction, recovery]);
  assert.equal(review.coverage.status, 'exercised');
  assert.deepEqual(review.coverage.uncertainFieldDecisions, [4]);
  assert.deepEqual(review.coverage.contextUncertaintyDecisions, [4]);
  assert.deepEqual(review.coverage.declaredUncertaintyDecisions, []);
  assert.deepEqual(review.coverage.recoveryAfterUncertaintyDecisions, [6]);
});

test('recovery for a different goal does not count; a later same-goal uncertain memory use does', () => {
  const uncertain = uncertainEntry(0);
  const otherGoalRead = entry(1, { action: { type: 'readList' },
    cognition: { valid: true, state: { knownGoalFields: { 'goal-a': ['name'] }, uncertainGoalIds: [], activeGoals: [] },
      events: [{ kind: 'list-read', goalId: 'goal-b', fields: ['name'] }] } });
  assert.equal(reviewWholeTraceTaskExpression([uncertain, otherGoalRead]).coverage.status, 'unexercised');
  const guess = entry(2, { actorState: { activity: 'shop', focusedGoalId: 'goal-a', focusedProductId: null, uncertainGoalIds: ['goal-a'] },
    basis: { intent: 'task', memoryUses: [{ goalId: 'goal-a', field: 'name', mode: 'guess', value: 'remembered name' }] },
    cognition: { valid: true, state: { knownGoalFields: { 'goal-a': ['name'] }, uncertainGoalIds: ['goal-a'],
      activeGoals: [{ goalId: 'goal-a', fields: { name: { status: 'uncertain' } } }] }, events: [] } });
  const review = reviewWholeTraceTaskExpression([uncertain, otherGoalRead, guess]);
  assert.equal(review.coverage.status, 'exercised');
  assert.deepEqual(review.coverage.recoveryAfterUncertaintyDecisions, [2]);
  assert.deepEqual(review.coverage.declaredUncertaintyDecisions, [0]);
});

test('a real read begun at the first uncertainty can recover in the next observation', () => {
  const read = uncertainEntry(3);
  read.action = { type: 'readList' };
  read.actorState.focusedGoalId = null;
  read.basis.goalId = null;
  const restored = entry(4, { cognition: { valid: true,
    state: { knownGoalFields: { 'goal-a': ['name'] }, uncertainGoalIds: [],
      activeGoals: [{ goalId: 'goal-a', fields: { name: { status: 'clear' } } }] },
    events: [{ kind: 'list-read', goalId: 'goal-a', fields: ['name'] }] } });
  const review = reviewWholeTraceTaskExpression([read, restored]);
  assert.equal(review.coverage.status, 'exercised');
  assert.deepEqual(review.coverage.recoveryAfterUncertaintyDecisions, [4]);
});

test('unavailable fields count only when that field was actually displayed and known', () => {
  const knownName = entry(0, { cognition: { valid: true,
    state: { knownGoalFields: { 'goal-a': ['name'] }, uncertainGoalIds: ['goal-a'],
      activeGoals: [{ goalId: 'goal-a', fields: { name: { status: 'unavailable' }, specification: { status: 'unavailable' } } }] },
    events: [{ kind: 'decayed', goalId: 'goal-a', fields: ['name', 'specification'] }] } });
  const review = reviewWholeTraceTaskExpression([knownName]);
  assert.deepEqual(review.coverage.uncertainFieldDecisions, [0]);
  assert.deepEqual(review.coverage.contextUncertaintyDecisions, [0]);
  const staleSpecificationOnly = entry(1, { cognition: { valid: true,
    state: { knownGoalFields: { 'goal-a': ['name'] }, uncertainGoalIds: ['goal-a'],
      activeGoals: [{ goalId: 'goal-a', fields: { name: { status: 'clear' }, specification: { status: 'unavailable' } } }] },
    events: [{ kind: 'decayed', goalId: 'goal-a', fields: ['specification'] }] } });
  assert.equal(reviewWholeTraceTaskExpression([staleSpecificationOnly]).coverage.status, 'unexercised');
});

test('same-goal cart/help checks and explicit self-recall each count only after uncertainty', () => {
  const checks = [
    entry(1, { action: { type: 'viewCart' }, actorState: { activity: 'check', focusedGoalId: null, focusedProductId: null },
      basis: { intent: 'check', goalId: 'goal-a', memoryUses: [] } }),
    entry(2, { action: { type: 'viewHelp' }, actorState: { activity: 'help', focusedGoalId: null, focusedProductId: null },
      basis: { intent: 'help', goalId: 'goal-a', memoryUses: [] } }),
    entry(3, { actorState: { activity: 'recover', focusedGoalId: 'goal-a', focusedProductId: null,
      memoryUpdate: [{ type: 'selfRecall', goalId: 'goal-a' }] } }),
  ];
  for (const check of checks) {
    const review = reviewWholeTraceTaskExpression([uncertainEntry(0), check]);
    assert.equal(review.coverage.status, 'exercised');
    assert.deepEqual(review.coverage.recoveryAfterUncertaintyDecisions, [check.decisionIndex]);
  }
});

test('coverage separates pending task memory, movement, focused interest and goal-directed behavior', () => {
  const review = reviewWholeTraceTaskExpression([
    entry(0, { action: { type: 'walkToAnchor' }, actorState: { activity: 'orient', focusedGoalId: null, focusedProductId: null },
      taskMemory: { state: { openGoalIds: ['goal-a'] } } }),
    entry(1, { actorState: { activity: 'interest', focusedGoalId: null, focusedProductId: 'banana' },
      basis: { intent: 'interest', memoryUses: [] }, taskMemory: { state: { openGoalIds: ['goal-a'] } }, before: { products: [{ id: 'banana' }] } }),
    entry(2, { actorState: { activity: 'shop', focusedGoalId: 'goal-a', focusedProductId: 'milk' },
      basis: { intent: 'task', goalId: 'goal-a', memoryUses: [] } }),
  ]);
  assert.deepEqual(review.coverage.goalMemoryDuringMovementDecisions, [0]);
  assert.deepEqual(review.coverage.interestWithPendingGoalsDecisions, [1]);
  assert.deepEqual(review.coverage.focusedInterestProductDecisions, [1]);
  assert.deepEqual(review.coverage.goalDirectedDecisions, [2]);
  const focuslessGoal = reviewWholeTraceTaskExpression([entry(3, { actorState: { activity: 'shop', focusedGoalId: null, focusedProductId: null },
    basis: { intent: 'task', goalId: 'goal-b', memoryUses: [] } })]);
  assert.deepEqual(focuslessGoal.coverage.goalDirectedDecisions, [3]);
});

test('warnings stay descriptive for null interest focus and uniform orientation or movement delays', () => {
  const interest = entry(0, { actorState: { activity: 'interest', focusedGoalId: null, focusedProductId: null },
    basis: { intent: 'interest', memoryUses: [] }, before: { products: [{ id: 'banana' }] } });
  const orientWalk = Array.from({ length: 8 }, (_, index) => entry(index + 1, { actorState: { activity: 'orient', focusedGoalId: null, focusedProductId: null },
    action: { type: 'walkToAnchor' }, delayMs: 777 }));
  const review = reviewWholeTraceTaskExpression([interest, ...orientWalk]);
  assert.deepEqual(review.findings.map(finding => finding.code), ['INTEREST_PRODUCTS_WITHOUT_FOCUS', 'UNIFORM_ORIENT_WALK_DELAYS']);
  assert.deepEqual(review.findings[0].productIds, ['banana']);
  assert.equal(review.findings.every(finding => finding.severity === 'warning'), true);
  assert.equal(review.coverage.status, 'unexercised');
});
