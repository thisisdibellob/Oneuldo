const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTraceBundle.ts');
const { createWholeTraceSourceAuthoringCursor } = require('../src/wholeTraceAuthoringSource.ts');
const { wholeTraceOrderChoiceIds } = require('../src/wholeTraceContracts.ts');

// Optional give-up-last-v1 / walk-while-unseen-v1 presentation options. Fixture only; no actor generation.
const seed = 'give-up-presentation-v1';
function snapshot() {
  const config = { seed, stockPerProduct: 5, objectives: [{ productId: 'milk', quantity: 1 }], environment: { cashierCount: 2 } };
  return createMarketReplaySnapshot(createMarketSession(config), undefined,
    { viewport: { width: 390, height: 600 }, zoom: 1.3, fontScale: 1, safeArea: { top: 0, bottom: 0 } });
}
function bundle(extra = {}) {
  return buildWholeTraceBundle({ snapshot: snapshot(), personaId: 'mild-intellectual-disability-adult', seed,
    maxActions: 100, maxRepairs: 0, timingProfile: 'original', ...extra }, `${seed}-request`);
}

test('wholeTraceOrderChoiceIds moves only giveUp and keeps the default order without an option', () => {
  const ids = ['control/pause', 'control/giveUp', 'control/readList', 'walk/W001'];
  assert.deepEqual(wholeTraceOrderChoiceIds(ids), ids);
  assert.deepEqual(wholeTraceOrderChoiceIds(ids, 'give-up-last-v1'), ['control/pause', 'control/readList', 'walk/W001', 'control/giveUp']);
  assert.deepEqual(wholeTraceOrderChoiceIds(['walk/W001'], 'give-up-last-v1'), ['walk/W001']);
});

test('default bundles are unchanged: no option fields, giveUp keeps its catalog position', () => {
  const base = bundle();
  assert.equal(base.choiceOrderVersion, undefined);
  assert.equal(base.authoringExampleVersion, undefined);
  assert.equal(base.authoringGuide.sourceAuthoring.taskDeclarationExamples.walkWhileUnseen, undefined);
  const ids = createWholeTraceSourceAuthoringCursor(base).menu().choiceIds;
  assert.ok(ids.includes('control/giveUp'));
  assert.notEqual(ids.at(-1), 'control/giveUp');
});

test('give-up-last-v1 changes order only, in the menu and the initial frame, and changes the input hash', () => {
  const base = bundle(), ordered = bundle({ choiceOrderVersion: 'give-up-last-v1' });
  assert.equal(ordered.choiceOrderVersion, 'give-up-last-v1');
  assert.notEqual(ordered.inputHash, base.inputHash);
  const before = createWholeTraceSourceAuthoringCursor(base).menu(), after = createWholeTraceSourceAuthoringCursor(ordered).menu();
  assert.deepEqual([...after.choiceIds].sort(), [...before.choiceIds].sort());
  assert.equal(after.choiceIds.at(-1), 'control/giveUp');
  assert.deepEqual(after.availableChoices.map(row => row.choiceId), after.choiceIds);
  const frame = ordered.initialChoiceFrame.availableChoices.map(entry => entry.choiceId);
  assert.equal(frame.at(-1), 'control/giveUp');
  assert.deepEqual([...frame].sort(), base.initialChoiceFrame.availableChoices.map(entry => entry.choiceId).sort());
  assert.match(ordered.actionContract.choiceOrder, /give-up-last-v1/);
});

test('giveUp remains selectable under give-up-last-v1', () => {
  const cursor = createWholeTraceSourceAuthoringCursor(bundle({ choiceOrderVersion: 'give-up-last-v1' }));
  cursor.append({ choiceRef: { choiceId: 'control/giveUp' }, delayMs: 900, reason: '오늘 장보기를 그만둔다.',
    basis: { intent: 'finish', goalId: null, memoryUses: [] },
    actorState: { activity: 'finish', task: '장보기를 중단한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } });
  assert.equal(cursor.menu().terminal, true);
});

test('walk-while-unseen-v1 adds one walk example and keeps the giveUp examples', () => {
  const guided = bundle({ authoringExampleVersion: 'walk-while-unseen-v1' });
  const examples = guided.authoringGuide.sourceAuthoring.taskDeclarationExamples;
  assert.equal(examples.walkWhileUnseen.draft.choiceRef.choiceId, 'walk/CURRENT_AVAILABLE_WAYPOINT_ID');
  assert.equal(examples.walkWhileUnseen.draft.basis.goalId, 'READ_GOAL_ID');
  assert.deepEqual(examples.walkWhileUnseen.draft.actorState.heldGoalIds, ['READ_GOAL_ID']);
  assert.ok(examples.giveUpAfterRead && examples.giveUpWithPending);
  assert.notEqual(guided.inputHash, bundle().inputHash);
  assert.match(guided.actionContract.authoringExamples, /walk-while-unseen-v1/);
});

test('unknown option values are rejected', () => {
  assert.throws(() => bundle({ choiceOrderVersion: 'give-up-hidden' }), /choiceOrderVersion/);
  assert.throws(() => bundle({ authoringExampleVersion: 'walk-v9' }), /authoringExampleVersion/);
});
