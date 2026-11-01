const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTraceBundle.ts');
const { compileWholeTraceCandidate, validateWholeTracePrefix } = require('../src/wholeTraceCompiler.ts');
const { validateWholeTraceCandidate } = require('../src/wholeTraceContracts.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTraceExecutionAuthoring.ts');
const { WholeTraceCognitionEngine } = require('../src/wholeTraceCognition.ts');

function fixture(near = 'meal', extra = {}) {
  const config = { seed: 'prefix-validation', difficulty: 'exact', stockPerProduct: 5,
    objectives: [{ productId: 'milk', quantity: 2 }], environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'prefix-validation',
    timingProfile: 'original', maxActions: 100, ...extra };
  return { settings, bundle: buildWholeTraceBundle(settings, 'prefix-validation-request') };
}
function d(source, choiceId, { state = {}, delayMs = 850, intent = 'check', goalId = null, uses = [], quantity } = {}) {
  return { choiceRef: { source: structuredClone(source), choiceId, ...(quantity === undefined ? {} : { quantity }) },
    delayMs, reason: '실제 실행과 같은 접두 구간 검증을 확인한다', basis: { intent, goalId, memoryUses: uses },
    actorState: { activity: 'check', task: '현재 관찰과 유지한 목표를 확인한다', heldGoalIds: [], uncertainGoalIds: [],
      focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar', ...state } };
}
const draft = decision => { const copy = structuredClone(decision); delete copy.choiceRef.source; return copy; };
const plan = (bundle, decisions) => ({ candidateVersion: '7', requestId: bundle.requestId, decisions });
const quit = (source, state = {}) => d(source, 'control/giveUp', { intent: 'finish', state: { activity: 'finish', ...state } });
function selected(bundle) {
  const source = bundle.initialChoiceFrame.source, goal = bundle.worldReference.objectives[0];
  return [d(source, 'control/readList'), d(source, 'control/pause', { state: {
    heldGoalIds: [goal.id], taskUpdate: [{ type: 'select', goalId: goal.id }],
  } })];
}
async function rejection(promise) {
  try { await promise; assert.fail('Expected rejection'); } catch (error) {
    assert.ok(error.validation, error.stack); return error.validation;
  }
}

test('05: opening a shelf cannot focus curry before that action exposes it', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const original = structuredClone(bundle);
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const initial = await cursor.menu();
  assert.equal(initial.decisionCount, 0);
  assert.equal(initial.advisory.observedProductIds.includes('spicy-curry'), false);
  const bad = d(source, 'open/meal', { state: { focusedProductId: 'spicy-curry' } });
  const refused = await cursor.append(draft(bad));
  assert.equal(refused.accepted, false);
  assert.equal(refused.menu.advisory.observedProductIds.includes('spicy-curry'), false);
  const failed = await rejection(validateWholeTracePrefix(settings, bundle, plan(bundle, [bad])));
  assert.equal(failed.failedDecisionIndex, 0);
  assert.equal(failed.acceptedPrefixLength, 0);
  assert.equal(failed.issues[0].path, 'decisions[0].actorState.focusedProductId');
  assert.equal(failed.issues[0].rule, 'focused-product-observed');
  assert.deepEqual(failed.issues[0].evidence, { productId: 'spicy-curry', observed: false });
  const opened = await cursor.append(draft(d(source, 'open/meal')));
  assert.equal(opened.accepted, true);
  assert.ok(opened.menu.advisory.observedProductIds.includes('spicy-curry'));
  assert.deepEqual(bundle, original);
  assert.equal(bad.actorState.focusedProductId, 'spicy-curry');
});

test('09: elapsed pressure crossing is visible before submission and rejects the same decision with evidence', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const goal = bundle.worldReference.objectives[0], held = { heldGoalIds: [goal.id] };
  const interest = d(source, 'control/pause', { intent: 'interest', delayMs: 13871,
    state: { ...held, activity: 'interest' } });
  const prefix = [...selected(bundle), interest];
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  for (const decision of prefix) assert.equal((await cursor.append(draft(decision))).accepted, true);
  const calculated = await cursor.menu();
  const quantity = calculated.advisory.goalFields.find(field => field.goalId === goal.id && field.field === 'requiredQuantity');
  assert.equal(quantity.status, 'uncertain');
  assert.ok(quantity.pressure >= .7);
  assert.deepEqual(calculated.advisory.openGoalIds, [goal.id]);
  assert.equal(calculated.advisory.assumptions.delayMs, 0);
  assert.match(calculated.advisory.notice, /참고용 계산값.*선언은 계속 AI/);
  const bad = d(source, 'control/pause', { delayMs: 746, state: held });
  const exact = await cursor.menu(bad);
  const refused = await cursor.append(draft(bad));
  assert.equal(refused.accepted, false);
  assert.equal(refused.issues[0].decisionNumber, 4);
  assert.equal(refused.menu.advisory.goalFields.find(field => field.field === 'requiredQuantity').status, 'uncertain');
  const failed = await rejection(validateWholeTracePrefix(settings, bundle, plan(bundle, [...prefix, bad])));
  assert.equal(failed.code, 'WORKING_MEMORY');
  assert.equal(failed.failedDecisionIndex, 3);
  const issue = failed.issues.find(issue => issue.rule === 'uncertain-goal-required');
  assert.equal(issue.path, 'decisions[3].actorState.uncertainGoalIds');
  const evidence = issue.evidence.fields.find(field => field.field === 'requiredQuantity');
  assert.equal(evidence.previousPressure, .697598);
  assert.equal(evidence.pressure, .794728);
  assert.equal(issue.evidence.thresholds.uncertainThreshold, .7);
  assert.match(issue.message, new RegExp(`${evidence.previousPressure}→${evidence.pressure}`));
  assert.match(issue.message, /threshold 0\.7/);
  assert.equal(exact.advisory.goalFields.find(field => field.field === 'requiredQuantity').pressure, evidence.pressure);
  assert.deepEqual(bad.actorState.uncertainGoalIds, []);
  const retry = structuredClone(bad); retry.actorState.uncertainGoalIds = [goal.id];
  assert.equal((await cursor.append(draft(retry))).accepted, true);
  assert.equal(cursor.metrics().decisions[3].rewriteCount, 1);
});

test('every accepted prefix agrees with final compilation for accepted candidates and preserves authored values', async () => {
  const { settings, bundle } = fixture('fresh'), source = bundle.initialChoiceFrame.source;
  const shelf = { ...source, activeStation: 'fresh', pageIndex: 0 };
  const candidates = [plan(bundle, [quit(source)]), plan(bundle, [d(source, 'control/viewHelp'),
    d({ ...source, view: 'help' }, 'control/closeView'), quit(source)]),
  plan(bundle, [d(source, 'open/fresh'), d(shelf, 'add/milk', { quantity: 1, intent: 'interest', state: { activity: 'interest' } }),
    d(shelf, 'control/closeStation'), quit(source)])];
  for (const candidate of candidates) {
    const original = structuredClone(candidate);
    for (let end = 0; end <= candidate.decisions.length; end++) {
      const result = await validateWholeTracePrefix(settings, bundle, { ...candidate, decisions: candidate.decisions.slice(0, end) });
      assert.equal(result.acceptedActions, end);
      assert.equal(result.terminal, end === candidate.decisions.length);
    }
    assert.equal((await compileWholeTraceCandidate(settings, bundle, candidate)).acceptedActions, candidate.decisions.length);
    assert.deepEqual(candidate, original);
  }
});

test('rejected runtime candidates report identical rules and evidence in prefix and final validation', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const goal = bundle.worldReference.objectives[0], held = { heldGoalIds: [goal.id] };
  const prefixes = [[d(source, 'open/meal', { state: { focusedProductId: 'spicy-curry' } })],
    [d(source, 'control/pause', { state: { heldGoalIds: [goal.id] } })],
    [...selected(bundle), d(source, 'control/pause', { intent: 'interest', delayMs: 16000,
      state: { ...held, activity: 'interest' } })],
    [d(source, 'control/pause', { intent: 'recover' })]];
  for (const decisions of prefixes) {
    const prefix = await rejection(validateWholeTracePrefix(settings, bundle, plan(bundle, decisions)));
    const final = await rejection(compileWholeTraceCandidate(settings, bundle,
      plan(bundle, [...decisions, quit(source, decisions.length > 1 ? held : {})])));
    assert.equal(prefix.code, final.code);
    assert.equal(prefix.failedDecisionIndex, final.failedDecisionIndex);
    assert.deepEqual(prefix.issues, final.issues);
  }
});

test('incomplete prefix never becomes a valid final plan and complete horizon retains final completion checks', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const incomplete = plan(bundle, [d(source, 'control/pause')]);
  assert.equal((await validateWholeTracePrefix(settings, bundle, incomplete)).terminal, false);
  assert.equal(validateWholeTraceCandidate(incomplete, bundle.requestId).valid, false);
  assert.equal((await rejection(compileWholeTraceCandidate(settings, bundle, incomplete))).code, 'CANDIDATE_SCHEMA');
  const horizon = plan(bundle, Array.from({ length: 100 }, () => d(source, 'control/pause')));
  assert.equal((await validateWholeTracePrefix(settings, bundle, horizon)).terminal, true);
  assert.equal((await compileWholeTraceCandidate(settings, bundle, horizon)).acceptedActions, 100);
});


test('reference projection cannot commit declarations or disturb a pending accepted preview', () => {
  const { bundle } = fixture(), goal = bundle.worldReference.objectives[0];
  const engine = new WholeTraceCognitionEngine(bundle.persona.behavior.cognition);
  const observation = { ...bundle.actorState.initialObservation, elapsedMs: 0, cart: null, products: [], readObjectives: [goal] };
  const actor = { activity: 'shop', heldGoalIds: [goal.id], uncertainGoalIds: [] };
  assert.equal(engine.preview(observation, actor, [], 1).valid, true);
  engine.commit();
  const before = engine.snapshot();
  const next = { ...observation, readObjectives: [], elapsedMs: 1501 };
  const pending = engine.preview(next, actor, [], 100);
  assert.equal(pending.valid, true);
  const projected = engine.project(next, { activity: 'interest', delayMs: 30000 });
  assert.equal(projected.activeGoals[0].fields.requiredQuantity.status, 'uncertain');
  assert.deepEqual(engine.snapshot(), before);
  assert.deepEqual(engine.project(next, { activity: 'interest', delayMs: 30000 }), projected);
  assert.deepEqual(engine.commit(), pending.state);
});
