'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { buildSnapshots } = require('../scripts/build-validation-snapshots.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { visibleBoundaries } = require('../../frontend/src/game/marketReplayPerception.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { WholeTraceWayfindingMemory, DEFAULT_WAYFINDING_PROFILE, validateWayfindingProfile, renderWayfindingInstructions,
  validateWholeTraceThought, WAYFINDING_GIVE_UP_LOCKED } = require('../src/wholeTrace/wholeTraceWayfinding.ts');
const { getPersona } = require('../src/personas.ts');
const VERSION = 'wayfinding-v1';

// A start far from every shelf: the first screen shows no shelf sign at all.
function fixture(extra = {}) {
  const base = buildSnapshots({ environmentSeed: 'trait-v3-pilot-20261111-r2-verified', lowGoalCount: 2 }).low;
  const environment = structuredClone(base.environment);
  environment.spawn = { x: 710, y: 1350 };
  const snapshot = createMarketReplaySnapshot(createMarketSession(base.config, environment), undefined, base.presentation);
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'wayfinding-regression',
    maxActions: 100, maxRepairs: 0, timingProfile: 'original', ...extra };
  return { settings, bundle: buildWholeTraceBundle(settings, `wayfinding-${extra.wayfindingVersion ?? 'off'}`) };
}
function draft(choiceId, thought, extra = {}) {
  const ending = choiceId === 'control/giveUp';
  return { choiceRef: { choiceId }, delayMs: 800, reason: '현재 표시된 화면에서 선택한 행동을 수행한다',
    basis: { intent: ending ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: ending ? 'finish' : 'orient', task: '매장 구조를 살피며 매대를 찾는다',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar',
      triggerCueRefs: ['phase:shopping'], ...(thought ? { thought } : {}), ...extra } };
}
const firstWalk = menu => menu.visibleWalkChoices[0].choiceId;

test('every persona file carries a valid wayfinding profile that differs between the control and the disability personas', () => {
  const profiles = Object.fromEntries(['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider']
    .map(id => [id, getPersona(id).wayfinding]));
  profiles.control = require('../personas/neutral-adult-control.json').wayfinding;
  for (const [id, profile] of Object.entries(profiles)) assert.deepEqual(validateWayfindingProfile(profile), [], id);
  assert.equal(profiles.control.cueLevel, 'layout-schema');
  assert.equal(profiles['mild-intellectual-disability-adult'].cueLevel, 'landmark');
  assert.notEqual(renderWayfindingInstructions(profiles.control), renderWayfindingInstructions(profiles['mild-intellectual-disability-adult']));
  // Personas differ in how they search, not in when they may stop.
  assert.equal(new Set(Object.values(profiles).map(p => `${p.explorationBudgetMs}:${p.minDistinctPlacesBeforeGiveUp}`)).size, 1);
});

test('boundaries describe the drawn screen and keep the list-covered direction distinct from a wall', () => {
  const { settings } = fixture();
  const { environment, presentation } = settings.snapshot;
  const boundaries = visibleBoundaries(environment, environment.spawn, presentation, {});
  assert.equal(boundaries.length, 8);
  for (const b of boundaries) assert.deepEqual(Object.keys(b).sort(), ['direction', 'distanceBand', 'kind', 'label']);
  assert.equal(boundaries.find(b => b.direction === 'north').kind, 'covered', 'the shopping-list note hides north, it is not a wall');
  assert.ok(boundaries.some(b => b.kind === 'wall' || b.kind === 'fixture'));
});

test('wayfinding-v1 is opt-in: the default bundle and menu are unchanged', async () => {
  const { settings, bundle } = fixture();
  assert.equal(bundle.wayfindingVersion, undefined);
  assert.equal(bundle.actorState.initialObservation.boundaries, undefined);
  assert.ok(bundle.initialChoiceFrame.availableChoices.some(c => c.choiceId === 'control/giveUp'));
  const menu = await (await createWholeTraceExecutionAuthoringCursor(settings, bundle)).menu();
  assert.equal(menu.spatialMemory, undefined);
  assert.equal(menu.ownNotes, undefined);
  assert.ok(menu.choiceIds.includes('control/giveUp'));
  const rejected = await (await createWholeTraceExecutionAuthoringCursor(settings, bundle))
    .append(draft('control/readList', { next: '목록을 본다' }));
  assert.equal(rejected.accepted, false, 'thought is not part of the default contract');
});

test('wayfinding-v1 returns memory and own notes, gates giveUp on exploration, and lets the actor choose again', async () => {
  const { settings, bundle } = fixture({ wayfindingVersion: VERSION });
  assert.equal(bundle.wayfindingVersion, VERSION);
  assert.match(bundle.instructions, /wayfinding-v1 공통 규칙/);
  assert.match(bundle.instructions, /길을 찾고 판단하는 방식/);
  assert.equal(bundle.persona.wayfinding.profile.cueLevel, 'landmark');
  assert.equal(bundle.actorState.initialObservation.boundaries.length, 8);
  assert.ok(!bundle.initialChoiceFrame.availableChoices.some(c => c.choiceId === 'control/giveUp'));
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  let menu = await cursor.menu();
  assert.equal(menu.spatialMemory.kind, 'actor-spatial-memory-v1');
  assert.equal(menu.spatialMemory.placesVisited, 0);
  assert.equal(menu.spatialMemory.giveUp.available, false);
  assert.ok(!menu.choiceIds.includes('control/giveUp'));
  assert.ok(menu.visibleWalkChoices.every(choice => choice.visitedTimes === 0 && /아직 안 가 본 곳/.test(choice.label)));
  assert.deepEqual(menu.ownNotes.recent, []);

  const thought = { noticed: '아래쪽은 벽이다', hypothesis: '매대는 위쪽 안쪽에 있을 것 같다', plan: '넓은 통로를 따라 위로 간다', next: '가까운 통로로 걷는다' };
  const walked = await cursor.append(draft(firstWalk(menu), thought));
  assert.equal(walked.accepted, true, JSON.stringify(walked.issues));
  menu = walked.menu;
  assert.equal(menu.spatialMemory.placesVisited, 1);
  assert.notEqual(menu.spatialMemory.position.fromStart, '출발점 근처');
  assert.deepEqual(menu.ownNotes.recent, [{ decisionNumber: 1, thought }]);
  assert.equal(menu.ownNotes.currentPlan.plan, thought.plan);

  const locked = await cursor.append(draft('control/giveUp', { plan: '매대가 안 보여 그만둔다' }));
  assert.equal(locked.accepted, false);
  assert.equal(locked.code, WAYFINDING_GIVE_UP_LOCKED);
  assert.equal(locked.canRetry, true);
  // The locked giveUp is not a technical failure: the next draft may be any available action.
  const resumed = await cursor.append(draft(firstWalk(locked.menu), { next: '안 가 본 통로로 가 본다' }));
  assert.equal(resumed.accepted, true, JSON.stringify(resumed.issues));

  const invalid = await cursor.append(draft(firstWalk(resumed.menu), { feeling: '답답하다' }));
  assert.equal(invalid.accepted, false);
});

test('give-up eligibility comes from explored places, recovery and planned time, never from a hidden map', () => {
  const memory = new WholeTraceWayfindingMemory({ ...DEFAULT_WAYFINDING_PROFILE, minDistinctPlacesBeforeGiveUp: 2, explorationBudgetMs: 60000 });
  const world = (sequence, extra = {}) => ({ schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world', activeStation: null,
    visibleStations: [], anchors: [{ id: 'a', label: '눈앞의 통로', direction: 'north', distanceBand: 'near' },
      { id: 'b', label: '눈앞의 통로', direction: 'east', distanceBand: 'medium' }], products: [], shelf: null,
    listAvailable: true, cart: null, cashiers: {}, sequence, elapsedMs: sequence * 1000, lastActionError: null, ...extra });
  memory.observe(world(1), 0);
  assert.equal(memory.giveUpStatus({ phase: 'shopping' }).available, false);
  memory.observe(world(2, { result: { accepted: true, actionType: 'walkToAnchor', anchorId: 'a' } }), 1);
  memory.observe(world(3, { result: { accepted: true, actionType: 'walkToAnchor', anchorId: 'b' } }), 2);
  assert.equal(memory.snapshot(world(3)).position.fromStart, '출발점에서 북쪽 1 · 동쪽 2 걸음쯤');
  assert.equal(memory.giveUpStatus({ phase: 'shopping' }).available, false, 'help has not been tried yet');
  memory.observe({ ...world(4), view: 'help' }, 3);
  assert.equal(memory.giveUpStatus({ phase: 'shopping' }).available, true);
  const timed = new WholeTraceWayfindingMemory({ ...DEFAULT_WAYFINDING_PROFILE, explorationBudgetMs: 60000 });
  timed.observe(world(61), 0);
  assert.equal(timed.giveUpStatus({ phase: 'shopping' }).available, true);
  assert.equal(new WholeTraceWayfindingMemory(DEFAULT_WAYFINDING_PROFILE).giveUpStatus({ phase: 'checkout' }).available, true);
  assert.deepEqual(validateWholeTraceThought({ plan: '위로 간다' }), []);
  assert.ok(validateWholeTraceThought({}).length);
  assert.ok(validateWholeTraceThought({ plan: 'x'.repeat(201) }).length);
});
