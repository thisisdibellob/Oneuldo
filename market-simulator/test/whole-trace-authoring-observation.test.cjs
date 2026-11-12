const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { visibleStations } = require('../../frontend/src/game/marketReplayPerception.ts');
const { getMarketHelpLines } = require('../../frontend/src/game/marketHelp.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate, validateWholeTracePrefix } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { createWholeTraceSourceAuthoringCursor } = require('../src/wholeTrace/wholeTraceAuthoringSource.ts');

function fixture() {
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'authoring-observation',
    difficulty: 'exact', stockPerProduct: 5, environment: { cashierCount: 2 },
    objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 1 }] }));
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'authoring-observation',
    maxActions: 100, maxRepairs: 0, timingProfile: 'original' };
  return { settings, bundle: buildWholeTraceBundle(settings, 'authoring-observation-request') };
}
function draft(choiceId, { held = [], goal = null, mode = 'current-display', select = false,
  intent = 'check', activity = 'check', focusedProductId = null } = {}) {
  return { choiceRef: { choiceId }, delayMs: 850, reason: '현재 관찰을 확인하고 작성한 선언을 그대로 제출한다',
    basis: { intent, goalId: goal?.id ?? null,
      memoryUses: goal ? [{ goalId: goal.id, field: 'name', mode, value: goal.label }] : [] },
    actorState: { activity, task: '현재 관찰과 선택한 목표에 따라 행동한다', heldGoalIds: held,
      uncertainGoalIds: [], focusedGoalId: goal?.id ?? null, focusedProductId, orientation: 'unfamiliar',
      ...(select ? { taskUpdate: [{ type: 'select', goalId: goal.id }] } : {}) } };
}
const selectGoal = goal => draft('control/pause', { held: [goal.id], goal, select: true, intent: 'task', activity: 'shop' });
const quit = held => draft('control/giveUp', { held, intent: 'finish', activity: 'finish' });
const plan = (bundle, decisions) => ({ candidateVersion: '7', requestId: bundle.requestId, decisions });
const sourceFree = decision => { const copy = structuredClone(decision); delete copy.choiceRef.source; return copy; };
async function append(cursor, input) {
  const original = structuredClone(input), result = await cursor.append(input);
  assert.equal(result.accepted, true, JSON.stringify(result.issues));
  assert.deepEqual(input, original);
  assert.deepEqual(sourceFree(result.decision), original, 'Only the mechanically tracked source is attached');
  return result;
}
async function compileRejection(promise) {
  try { await promise; assert.fail('Expected the existing execution guard to reject'); }
  catch (error) { assert.ok(error.validation, error.stack); return error.validation; }
}

test('10: a displayed list remains visible with empty advisory until the actor explicitly selects a goal', async () => {
  const { settings, bundle } = fixture(), originalBundle = structuredClone(bundle);
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const initial = await cursor.menu();
  assert.equal(initial.currentObservation.kind, 'validated-prefix-observation-v4');
  assert.equal(initial.currentObservation.acceptedDecisionCount, 0);
  assert.equal(Object.hasOwn(initial.currentObservation, 'readObjectives'), false);
  const read = await append(cursor, draft('control/readList'));
  const prefix = await validateWholeTracePrefix(settings, bundle, plan(bundle, [read.decision]));
  assert.equal(read.menu.currentObservation.acceptedDecisionCount, 1);
  assert.deepEqual(read.menu.currentObservation.readObjectives, prefix.before.readObjectives);
  assert.deepEqual(read.menu.currentObservation.observation, prefix.before);
  assert.deepEqual(read.menu.currentObservation.observation.readObjectives, read.menu.currentObservation.readObjectives);
  assert.equal(read.menu.currentObservation.readObjectives.length, 2);
  assert.deepEqual(read.menu.advisory, prefix.advisory);
  assert.deepEqual(read.menu.advisory.goalFields, []);
  assert.deepEqual(read.menu.advisory.openGoalIds, []);
  assert.deepEqual(read.menu.advisory.observedProductIds, []);
  assert.deepEqual(read.decision.actorState.heldGoalIds, []);
  assert.equal(Object.hasOwn(read.decision.actorState, 'taskUpdate'), false);
  const goal = read.menu.currentObservation.readObjectives[0];
  const selected = await append(cursor, selectGoal(goal));
  assert.deepEqual(selected.menu.advisory.openGoalIds, [goal.id]);
  assert.ok(selected.menu.advisory.goalFields.some(field => field.goalId === goal.id));
  const ending = await append(cursor, quit([goal.id]));
  const candidate = cursor.finish();
  assert.deepEqual(candidate, plan(bundle, [read.decision, selected.decision, ending.decision]));
  assert.deepEqual(Object.keys(candidate).sort(), ['candidateVersion', 'decisions', 'requestId']);
  assert.equal((await compileWholeTraceCandidate(settings, bundle, candidate)).acceptedActions, 3);
  assert.deepEqual(bundle, originalBundle);
  assert.equal(Object.hasOwn(createWholeTraceSourceAuthoringCursor(bundle).menu(), 'currentObservation'), false,
    'The symbolic source helper does not manufacture an execution observation');
});

test('list display expires after the next accepted action and a later read exposes a new current display', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const read = await append(cursor, draft('control/readList'));
  const goal = read.menu.currentObservation.readObjectives[0];
  const selected = await append(cursor, selectGoal(goal));
  assert.equal(selected.menu.currentObservation.acceptedDecisionCount, 2);
  assert.equal(Object.hasOwn(selected.menu.currentObservation, 'readObjectives'), false);
  assert.equal(Object.hasOwn(selected.menu.currentObservation.observation, 'readObjectives'), false);
  assert.deepEqual(selected.menu.advisory.openGoalIds, [goal.id], 'An open goal is not a persistent list display');
  const staleDisplay = draft('control/pause', { goal, held: [goal.id], intent: 'task', activity: 'shop' });
  const rejected = await cursor.append(staleDisplay);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, 'WORKING_MEMORY');
  assert.ok(rejected.issues.some(issue => /No current displayed list field\/value/.test(issue.message)));
  assert.equal(Object.hasOwn(rejected.menu.currentObservation, 'readObjectives'), false);
  assert.equal(Object.hasOwn(rejected.menu.currentObservation.observation, 'readObjectives'), false);
  const bad = { ...staleDisplay, choiceRef: { ...staleDisplay.choiceRef, source: selected.menu.expectedSource } };
  const finalFailure = await compileRejection(compileWholeTraceCandidate(settings, bundle,
    plan(bundle, [read.decision, selected.decision, bad,
      { ...quit([goal.id]), choiceRef: { choiceId: 'control/giveUp', source: selected.menu.expectedSource } }])));
  assert.deepEqual(rejected.issues, finalFailure.issues);
  const retained = await append(cursor, draft('control/pause', {
    goal, held: [goal.id], mode: 'remembered', intent: 'task', activity: 'shop' }));
  const reread = await append(cursor, draft('control/readList', { held: [goal.id] }));
  const prefix = await validateWholeTracePrefix(settings, bundle,
    plan(bundle, [read.decision, selected.decision, retained.decision, reread.decision]));
  assert.equal(reread.menu.currentObservation.acceptedDecisionCount, 4);
  assert.deepEqual(reread.menu.currentObservation.readObjectives, prefix.before.readObjectives);
  assert.deepEqual(reread.menu.currentObservation.readObjectives, read.menu.currentObservation.readObjectives);
  assert.deepEqual(reread.menu.currentObservation.observation.readObjectives, reread.menu.currentObservation.readObjectives);
  const movedOn = await append(cursor, draft('control/pause', { held: [goal.id], intent: 'rest', activity: 'rest' }));
  assert.equal(Object.hasOwn(movedOn.menu.currentObservation, 'readObjectives'), false);
  await append(cursor, quit([goal.id]));
  assert.equal((await compileWholeTraceCandidate(settings, bundle, cursor.finish())).acceptedActions, 6);
});

test('schema, task and execution rejections leave the current list and accepted prefix intact', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const read = await append(cursor, draft('control/readList')), before = await cursor.menu();
  const goal = before.currentObservation.readObjectives[0];
  const malformed = selectGoal(goal); delete malformed.basis.memoryUses;
  const missingSelection = draft('control/pause');
  const unseenProduct = selectGoal(goal); unseenProduct.actorState.focusedProductId = 'spicy-curry';
  for (const [input, rule] of [[malformed, 'AUTHORING_SCHEMA'], [missingSelection, 'selection_after_list'],
    [unseenProduct, 'focused-product-observed']]) {
    const original = structuredClone(input), result = await cursor.append(input);
    assert.equal(result.accepted, false);
    assert.equal(result.decisionIndex, 1);
    assert.equal(result.canRetry, true);
    assert.ok(result.issues.some(issue => issue.rule === rule), JSON.stringify(result.issues));
    assert.deepEqual(input, original);
    assert.deepEqual(result.menu, before);
    assert.deepEqual(await cursor.menu(), before);
  }
  const selected = await append(cursor, selectGoal(goal));
  const ending = await append(cursor, quit([goal.id]));
  assert.deepEqual(cursor.finish(), plan(bundle, [read.decision, selected.decision, ending.decision]));
  assert.equal(cursor.metrics().decisions[1].rewriteCount, 3);
  assert.equal((await compileWholeTraceCandidate(settings, bundle, cursor.finish())).acceptedActions, 3);
});

// Test-only search locates a displayed sign without supplying any route or
// destination to a model. Production menu choices and their order stay intact.
function routeToStation(bundle, matches) {
  const { navigation, waypoints, world, presentation } = bundle.worldReference;
  const state = navigation.states.find(s => s.stateId === navigation.initialStateId);
  const nodes = new Map(state.nodes.map(node => [node.waypointId, node]));
  const points = new Map(waypoints.map(w => [w.waypointId, w.point]));
  const queue = state.start.allowedWaypointIds.map(id => [id]), seen = new Set(state.start.allowedWaypointIds);
  for (const path of queue) {
    const location = path.at(-1), point = points.get(location);
    const station = visibleStations(world, point, presentation, state.cashierAvailability).find(matches);
    if (station) return { path, station };
    for (const id of nodes.get(location).allowedWaypointIds) if (!seen.has(id)) {
      seen.add(id); queue.push([...path, id]);
    }
  }
  assert.fail('Fixture must have a reachable station with the requested visible state');
}
async function followTestRoute(cursor, bundle, path) {
  const source = createWholeTraceSourceAuthoringCursor(bundle), decisions = [];
  for (const waypointId of path) {
    const input = draft(`walk/${waypointId}`, { intent: 'explore', activity: 'orient' });
    const result = await append(cursor, input);
    source.append(input); decisions.push(result.decision);
    assert.deepEqual(result.menu.choiceIds, source.menu().choiceIds,
      'Displaying current observations cannot add, rank or remove any legal control');
    assert.deepEqual(result.menu.visibleWalkChoices, source.menu().visibleWalkChoices);
  }
  return decisions;
}

test('anchor menu preserves a visible distant shelf sign even before its open control is available', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const { path, station } = routeToStation(bundle, s => s.kind === 'shelf' && !s.near);
  const decisions = await followTestRoute(cursor, bundle, path), menu = await cursor.menu();
  const prefix = await validateWholeTracePrefix(settings, bundle, plan(bundle, decisions));
  assert.equal(menu.currentObservation.kind, 'validated-prefix-observation-v4');
  assert.equal(menu.currentObservation.acceptedDecisionCount, path.length);
  assert.deepEqual(menu.currentObservation.observation, prefix.before,
    'The public runtime projection is copied verbatim, not reconstructed from the world catalog');
  assert.deepEqual(menu.currentObservation.observation.visibleStations.find(s => s.id === station.id), station);
  assert.equal(menu.choiceIds.includes(`open/${station.id}`), false,
    'Seeing a distant sign does not authorize an interaction');
  assert.deepEqual(menu.currentObservation.observation.products, [], 'The closed shelf does not reveal products');
  assert.equal(Object.hasOwn(menu.currentObservation.observation, 'readObjectives'), false);
  assert.equal(Object.hasOwn(menu.currentObservation.observation, 'environment'), false);
  assert.equal(Object.hasOwn(menu.currentObservation.observation, 'playerPosition'), false);
  const saved = structuredClone(menu);
  menu.currentObservation.observation.visibleStations[0].label = 'invented';
  menu.currentObservation.observation.products.push({ id: 'invented' });
  assert.deepEqual(await cursor.menu(), saved, 'Returned observation objects cannot mutate the accepted boundary');
  const rejected = await cursor.append(draft(`open/${station.id}`));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, 'AUTHORING_CHOICE_NOT_AVAILABLE');
  assert.deepEqual(rejected.menu.currentObservation, saved.currentObservation,
    'A rejection cannot advance the screen or manufacture knowledge');
});

test('anchor menu transmits currently displayed help and product cues and removes them with the panel', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const help = await append(cursor, draft('control/viewHelp', { intent: 'help', activity: 'orient' }));
  assert.deepEqual(help.menu.currentObservation.observation.supportText, getMarketHelpLines(settings.snapshot.config.alarmPenaltyPoints));
  assert.deepEqual(help.menu.currentObservation.observation.visibleStations, []);
  assert.deepEqual(help.menu.visibleWalkChoices, []);
  assert.equal(Object.hasOwn(help.menu.currentObservation.observation, 'readObjectives'), false);
  const close = await append(cursor, draft('control/closeView', { intent: 'explore', activity: 'orient' }));
  assert.equal(Object.hasOwn(close.menu.currentObservation.observation, 'supportText'), false);
  const { path, station } = routeToStation(bundle, s => s.kind === 'shelf' && s.near);
  const walked = await followTestRoute(cursor, bundle, path);
  const opened = await append(cursor, draft(`open/${station.id}`, { intent: 'explore', activity: 'orient' }));
  const prefix = await validateWholeTracePrefix(settings, bundle,
    plan(bundle, [help.decision, close.decision, ...walked, opened.decision]));
  assert.deepEqual(opened.menu.currentObservation.observation, prefix.before);
  assert.ok(opened.menu.currentObservation.observation.products.length > 0);
  assert.deepEqual(opened.menu.currentObservation.observation.anchors, []);
  assert.equal(opened.menu.currentObservation.observation.shelf.page, 0);
  const closed = await append(cursor, draft('control/closeStation', { intent: 'explore', activity: 'orient' }));
  assert.deepEqual(closed.menu.currentObservation.observation.products, []);
  assert.equal(closed.menu.currentObservation.observation.shelf, null);
  const ending = await append(cursor, quit([]));
  const candidate = cursor.finish();
  assert.deepEqual(candidate.decisions, [help.decision, close.decision, ...walked, opened.decision, closed.decision, ending.decision]);
  assert.equal((await compileWholeTraceCandidate(settings, bundle, candidate)).acceptedActions, candidate.decisions.length);
});

test('menu queries, context previews and mutated response copies cannot create, consume or overwrite observations', async () => {
  const { settings, bundle } = fixture(), cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const context = { actorState: { activity: 'interest' }, delayMs: 30000 };
  const initial = await cursor.menu(), initialMetrics = cursor.metrics();
  assert.deepEqual((await cursor.menu(context)).currentObservation, initial.currentObservation);
  assert.deepEqual(cursor.metrics(), initialMetrics);
  const read = await append(cursor, draft('control/readList'));
  const before = await cursor.menu(), metrics = cursor.metrics();
  assert.deepEqual((await cursor.menu()).currentObservation, before.currentObservation);
  const preview = await cursor.menu(context);
  assert.deepEqual(preview.currentObservation, before.currentObservation);
  assert.equal(preview.advisory.assumptions.activity, 'interest');
  assert.equal(preview.advisory.assumptions.delayMs, 30000);
  preview.currentObservation.readObjectives[0].label = '외부에서 바꾼 이름';
  preview.currentObservation.readObjectives.splice(1);
  preview.currentObservation.acceptedDecisionCount = 100;
  read.menu.currentObservation.readObjectives[0].quantity = 99;
  read.menu.currentObservation.readObjectives.push({ id: 'invented', label: '주입된 목표', quantity: 1, match: 'exact' });
  assert.deepEqual(await cursor.menu(), before);
  assert.deepEqual(cursor.metrics(), metrics);
  const goal = before.currentObservation.readObjectives[0];
  const selected = await append(cursor, selectGoal(goal)), after = await cursor.menu();
  const elapsedPreview = await cursor.menu(context);
  assert.deepEqual(elapsedPreview.currentObservation, after.currentObservation);
  assert.equal(Object.hasOwn(elapsedPreview.currentObservation, 'readObjectives'), false);
  assert.ok(elapsedPreview.advisory.goalFields.some((field, index) => field.pressure > after.advisory.goalFields[index].pressure));
  assert.deepEqual(await cursor.menu(), after);
  const ending = await append(cursor, quit([goal.id]));
  assert.deepEqual(cursor.finish(), plan(bundle, [read.decision, selected.decision, ending.decision]));
  assert.equal((await compileWholeTraceCandidate(settings, bundle, cursor.finish())).acceptedActions, 3);
});
