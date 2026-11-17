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

/* ---------------------------------------------------------------- wayfinding-v2 */
const { WholeTraceWayfindingMemoryV2, wayfindingProfileOf } = require('../src/wholeTrace/wholeTraceWayfinding.ts');
const V2 = 'wayfinding-v2';
function obs(sequence, extra = {}) {
  return { schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world', activeStation: null,
    visibleStations: [], anchors: [{ id: `a${sequence}`, label: '눈앞의 통로', direction: 'north', distanceBand: 'near' }],
    products: [], shelf: null, listAvailable: true, cart: null, cashiers: {}, sequence, elapsedMs: sequence * 1000,
    lastActionError: null, ...extra };
}
const checkout = { id: 'checkout', kind: 'checkout', label: '1번 계산대 · 계산 가능', direction: 'east', distanceBand: 'medium', near: false };
const walkTo = (sequence, id) => obs(sequence, { result: { accepted: true, actionType: 'walkToAnchor', anchorId: id } });
function walkAway(memory, decisions) {
  memory.observe(obs(0, { visibleStations: [checkout], visibleStructures: Array.from({ length: 4 }, (_, i) =>
    ({ kind: 'shelf', label: '진열대', direction: ['north', 'west', 'northwest', 'northeast'][i], distanceBand: 'far' })) }), 0);
  for (let i = 1; i <= decisions; i++) memory.observe({ ...walkTo(i, `a${i - 1}`), visibleStructures: [{ kind: 'shelf', label: '진열대', direction: 'west', distanceBand: 'near' }] }, i);
}

test('v2 keeps a checkout seen at the start after 60 moves and points back to it from the current position', () => {
  const memory = new WholeTraceWayfindingMemoryV2(wayfindingProfileOf(require('../personas/neutral-adult-control.json'), V2), 'seed');
  walkAway(memory, 60);
  const snapshot = memory.snapshot(obs(60));
  const remembered = snapshot.landmarks.find(place => place.kind === 'checkout');
  assert.ok(remembered, 'a named place is never evicted by unnamed shelf sightings');
  assert.equal(remembered.label, '1번 계산대');
  assert.equal(remembered.memory, 'clear');
  assert.equal(remembered.fromHere.direction, 'south', '60 steps north of a checkout seen 2 steps east of the start');
  assert.ok(remembered.fromHere.steps >= 59);
  assert.ok(snapshot.unlabelledShelves.length <= 4);
});

test('v2 fading is deterministic per seed, stable for the control, and re-seeing restores a clear memory', () => {
  const decaying = wayfindingProfileOf(getPersona('mild-intellectual-disability-adult'), V2);
  assert.equal(decaying.landmarkMemory.retention, 'decaying');
  const run = seed => { const m = new WholeTraceWayfindingMemoryV2(decaying, seed); walkAway(m, 80); return m; };
  const a = run('s1'), b = run('s1');
  assert.deepEqual(a.memoryEvents(), b.memoryEvents());
  const states = ['s1', 's2', 's3', 's4', 's5'].map(seed => run(seed).snapshot(obs(80)).landmarks.find(p => p.kind === 'checkout')?.memory ?? 'forgotten');
  assert.ok(states.some(state => state !== 'clear'), `an 80-decision absence fades some seeds: ${states}`);
  for (const event of a.memoryEvents()) assert.ok(event.decision > 10, 'nothing fades inside the protected window');
  const stable = new WholeTraceWayfindingMemoryV2(wayfindingProfileOf(require('../personas/neutral-adult-control.json'), V2), 's1');
  walkAway(stable, 80);
  assert.deepEqual(stable.memoryEvents(), []);
  const forgetful = run(['s1', 's2', 's3', 's4', 's5'][states.findIndex(state => state !== 'clear')]);
  forgetful.observe(obs(81, { visibleStations: [checkout] }), 81);
  assert.equal(forgetful.snapshot(obs(81)).landmarks.find(p => p.kind === 'checkout').memory, 'clear');
});

test('v2 give-up uses observed leads, so forgetting never opens it early', () => {
  const profile = { ...wayfindingProfileOf(getPersona('mild-intellectual-disability-adult'), V2), explorationBudgetMs: 3600000,
    landmarkMemory: { retention: 'decaying', protectedDecisions: 1, fadeProbabilityPerDecision: 0.5, forgetProbabilityPerDecision: 0.5, basedOn: ['test'] } };
  const memory = new WholeTraceWayfindingMemoryV2(profile, 'lead');
  memory.observe(obs(0, { visibleStations: [checkout] }), 0);
  memory.observe(obs(1, { view: 'help' }), 1);
  memory.observe(obs(2, { result: { accepted: true, actionType: 'add', productId: 'milk', quantity: 1 } }), 2);
  for (let i = 3; i < 40; i++) memory.observe(walkTo(i, `a${i - 1}`), i);
  assert.equal(memory.snapshot(obs(40)).landmarks.some(p => p.kind === 'checkout'), false, 'the checkout was forgotten');
  assert.equal(memory.giveUpStatus({ phase: 'shopping' }).available, false, 'the unvisited checkout still counts as a lead');
  memory.observe(obs(41, { visibleStations: [{ ...checkout, near: true }] }), 41);
  assert.equal(memory.giveUpStatus({ phase: 'shopping' }).available, true);
  assert.equal(memory.giveUpStatus({ phase: 'shopping' }).notice, '그만두기를 고를 수 있다.');
});

test('v2 thoughts: destination must be remembered, text must be Korean, and v1 rejects destination', async () => {
  assert.deepEqual(validateWholeTraceThought({ plan: '계산대로 간다', destination: '1번 계산대' }, V2), []);
  assert.ok(validateWholeTraceThought({ plan: '계산대로 간다', destination: '1번 계산대' }).length, 'v1 has no destination');
  assert.ok(validateWholeTraceThought({ next: '沿南边通道走一步' }, V2).some(e => /Korean/.test(e)));
  assert.ok(validateWholeTraceThought({ destination: '1번 계산대' }, V2).length, 'destination alone is not a judgment');
  const { settings, bundle } = fixture({ wayfindingVersion: V2 });
  assert.match(bundle.instructions, /wayfinding-v2 공통 규칙/);
  assert.equal(bundle.persona.wayfinding.profile.landmarkMemory.retention, 'decaying');
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const menu = await cursor.menu();
  assert.equal(menu.spatialMemory.kind, 'actor-spatial-memory-v2');
  const unknown = await cursor.append(draft(firstWalk(menu), { next: '걷는다', destination: '2번 계산대' }));
  assert.equal(unknown.accepted, false, 'an unseen place cannot be a destination');
  const seen = menu.spatialMemory.landmarks.find(place => place.memory === 'clear' && place.fromHere.steps >= 1);
  if (seen) {
    const ok = await cursor.append(draft(firstWalk(unknown.menu), { next: '기억한 곳으로 간다', destination: seen.label }));
    assert.equal(ok.accepted, true, JSON.stringify(ok.issues));
    assert.equal(ok.menu.spatialMemory.destination.label, seen.label);
  }
});

test('v1 bundles keep their archived profile shape after landmarkMemory was added', () => {
  const { bundle } = fixture({ wayfindingVersion: VERSION });
  assert.equal(bundle.persona.wayfinding.profile.landmarkMemory, undefined);
  assert.doesNotMatch(bundle.instructions, /wayfinding-v2/);
});
