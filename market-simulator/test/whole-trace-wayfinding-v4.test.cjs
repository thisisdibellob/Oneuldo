'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { buildSnapshots } = require('../scripts/build-validation-snapshots.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { marketLocationResponse } = require('../../frontend/src/game/marketHelp.ts');
const { createMarketReplaySnapshot, validateMarketReplayTrace } = require('../../frontend/src/game/marketReplayTrace.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { compileWholeTraceCandidate } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { validateTrace } = require('../src/traceValidation.ts');
const V4 = 'wayfinding-v4';

const base = buildSnapshots({ environmentSeed: 'trait-v3-pilot-20261111-r2-verified', lowGoalCount: 2 }).low;
const staff = base.environment.stationDetails.find(station => station.kind === 'employee');
function fixture(extra = {}) {
  const environment = structuredClone(base.environment);
  environment.spawn = getMarketStationApproachPoint(environment, staff.id, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(base.config, environment), undefined, base.presentation);
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'wayfinding-v4', maxActions: 100, maxRepairs: 0,
    timingProfile: 'original', movementValidationVersion: '1', wayfindingVersion: V4, ...extra };
  return { settings, bundle: buildWholeTraceBundle(settings, `wayfinding-${settings.wayfindingVersion}-staff`) };
}
function draft(choiceId, { delayMs = 800 } = {}) {
  const ending = choiceId === 'control/giveUp';
  return { choiceRef: { choiceId }, delayMs, reason: '직원에게 물건 위치를 물어본다',
    basis: { intent: ending ? 'finish' : 'help', goalId: null, memoryUses: [] },
    actorState: { activity: ending ? 'finish' : 'recover', task: '직원에게 물건 위치를 물어본다',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar',
      thought: { plan: ending ? '지금까지 확인한 상태로 장보기를 마친다' : '직원의 대답을 듣고 갈 곳을 정한다' } } };
}
async function append(cursor, decision) {
  const result = await cursor.append(decision);
  assert.equal(result.accepted, true, JSON.stringify(result.issues));
  return result.menu;
}

test('v4 exposes the app staff dialogue: location menu, one question per list item, the answer, and back', async () => {
  const { settings, bundle } = fixture();
  const goals = bundle.worldReference.objectives;
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  await append(cursor, draft('control/viewHelp'));
  let menu = await append(cursor, draft('control/closeView'));
  assert.ok(menu.choiceIds.includes(`open/${staff.id}`));
  menu = await append(cursor, draft(`open/${staff.id}`));
  assert.ok(menu.choiceIds.includes('staff/openLocationHelp'));
  assert.equal(menu.choiceIds.some(id => id.startsWith('staff/askLocation/')), false);
  menu = await append(cursor, draft('staff/openLocationHelp'));
  assert.deepEqual(menu.choiceIds.filter(id => id.startsWith('staff/askLocation/')), goals.map(goal => `staff/askLocation/${goal.id}`));
  assert.ok(menu.choiceIds.includes('staff/backToStaff'));
  assert.equal(menu.choiceIds.includes('staff/openLocationHelp'), false);
  assert.ok(menu.availableChoices.some(choice => choice.label === `${goals[0].label} 위치 물어보기`));
  menu = await append(cursor, draft(`staff/askLocation/${goals[0].id}`));
  const env = settings.snapshot.environment;
  const categoryId = Object.entries(settings.snapshot.config.inventoryProductIds)
    .find(([, ids]) => ids.includes(goals[0].match ?? goals[0].id))?.[0];
  const answer = menu.currentObservation.observation.result.message;
  assert.match(answer, /진열대에 있어요/);
  if (categoryId) assert.equal(answer, marketLocationResponse(env, categoryId));
  assert.deepEqual(menu.spatialMemory.staffAnswers.map(item => item.answer), [answer]);
  assert.equal(menu.spatialMemory.recovery.askedStaff, true);
  menu = await append(cursor, draft('staff/backToStaff'));
  assert.ok(menu.choiceIds.includes('staff/openLocationHelp'));
  await append(cursor, draft('control/closeStation'));
  await append(cursor, draft('control/pause', { delayMs: 120000 }));
  menu = await append(cursor, draft('control/pause', { delayMs: 120000 }));
  assert.equal(menu.spatialMemory.giveUp.available, true, menu.spatialMemory.giveUp.notice);
  await append(cursor, draft('control/giveUp'));
  const result = await compileWholeTraceCandidate(settings, bundle, cursor.finish());
  const talk = result.trace.steps.filter(step => step.type === 'talkToStaff').map(step => step.choice);
  assert.deepEqual(talk, ['open', 'openLocationHelp', 'askLocation', 'backToStaff']);
  assert.equal(result.trace.generation.wholeTraceWayfindingVersion, V4);
  assert.deepEqual(validateMarketReplayTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});

test('v4 giveUp: an opened staff dialogue is not asking; an answered question is', async () => {
  const run = async ask => {
    const { settings, bundle } = fixture();
    const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
    await append(cursor, draft('control/viewHelp'));
    await append(cursor, draft('control/closeView'));
    await append(cursor, draft(`open/${staff.id}`));
    if (ask) {
      await append(cursor, draft('staff/openLocationHelp'));
      await append(cursor, draft(`staff/askLocation/${bundle.worldReference.objectives[0].id}`));
    }
    await append(cursor, draft('control/closeStation'));
    await append(cursor, draft('control/pause', { delayMs: 120000 }));
    return append(cursor, draft('control/pause', { delayMs: 120000 }));
  };
  const opened = await run(false);
  assert.equal(opened.spatialMemory.giveUp.available, false);
  assert.match(opened.spatialMemory.giveUp.notice, /물건 위치를 물어 답을 받지 않음/);
  assert.equal(opened.choiceIds.includes('control/giveUp'), false);
  const asked = await run(true);
  assert.equal(asked.spatialMemory.giveUp.available, true, asked.spatialMemory.giveUp.notice);
});

test('v3 bundles keep their staff menu and catalog unchanged', async () => {
  const { settings, bundle } = fixture({ wayfindingVersion: 'wayfinding-v3' });
  assert.equal(bundle.choiceCatalog.staffDialogue, undefined);
  assert.equal(bundle.choiceCatalog.entries.some(entry => entry.choiceId.startsWith('staff/')), false);
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const menu = await append(cursor, draft(`open/${staff.id}`));
  assert.equal(menu.choiceIds.some(id => id.startsWith('staff/')), false);
  // The observation always showed the app dialogue; v3 simply never mapped its buttons.
  assert.equal(menu.currentObservation.observation.staffLocationHelp, false);
});
