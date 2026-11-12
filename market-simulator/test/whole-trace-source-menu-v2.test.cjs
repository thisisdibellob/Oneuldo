const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { createWholeTraceSourceAuthoringCursor } = require('../src/wholeTrace/wholeTraceAuthoringSource.ts');

// New contract fixtures only. No historical pilot output or actor generation.
function fixture() {
  const config = { seed: 'source-menu-local-cues-v2', stockPerProduct: 5,
    objectives: [{ productId: 'milk', quantity: 2 }], environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'fresh', environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment), undefined,
    { viewport: { width: 390, height: 600 }, zoom: 1.3, fontScale: 1, safeArea: { top: 0, bottom: 0 } });
  const bundle = buildWholeTraceBundle({ snapshot, personaId: 'mild-intellectual-disability-adult',
    seed: 'source-menu-local-cues-v2', maxActions: 100, maxRepairs: 0,
    timingProfile: 'original' }, 'source-menu-local-cues-v2-request');
  bundle.authoringGuide.executionAuthoring.menuPresentationRevision = 'current-choice-menu-v2';
  return bundle;
}
function draft(choiceId) {
  const ending = choiceId === 'control/giveUp';
  return { choiceRef: { choiceId }, delayMs: 731, reason: '현재 선택한 조작의 계약을 확인한다',
    basis: { intent: ending ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: ending ? 'finish' : 'orient', task: '선택한 조작 수행',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null,
      orientation: 'unfamiliar' } };
}
function compareMenus(bundle, current, legacy) {
  assert.equal(current.presentationRevision, 'current-choice-menu-v2');
  assert.equal(legacy.presentationRevision, 'current-choice-menu-v1');
  for (const key of ['expectedSource', 'choiceIds', 'allowedWaypointIds', 'visibleWalkChoices',
    'interactionContext', 'decisionCount', 'terminal']) assert.deepEqual(current[key], legacy[key], key);
  assert.deepEqual(current.availableChoices.map(row => row.choiceId), current.choiceIds);
  for (const [i, row] of current.availableChoices.entries()) {
    const visible = current.visibleWalkChoices.find(cue => cue.choiceId === row.choiceId);
    const entry = bundle.choiceCatalog.entries.find(entry => entry.choiceId === row.choiceId);
    if (entry.action.type === 'walk' && visible) {
      assert.deepEqual(row, { choiceId: visible.choiceId, label: visible.label,
        direction: visible.direction, distanceBand: visible.distanceBand });
      assert.deepEqual(Object.keys(row).sort(), ['choiceId', 'direction', 'distanceBand', 'label']);
    } else assert.deepEqual(row, legacy.availableChoices[i], 'nonwalk or unavailable cue stays unchanged');
  }
}
function pair() {
  const bundle = fixture(), legacy = structuredClone(bundle);
  legacy.authoringGuide.executionAuthoring.menuPresentationRevision = 'current-choice-menu-v1';
  return { bundle, legacy, current: createWholeTraceSourceAuthoringCursor(bundle),
    previous: createWholeTraceSourceAuthoringCursor(legacy) };
}

test('v2 binds only the currently visible local cue beside its exact choice ID without changing controls or order', () => {
  const { bundle, current, previous } = pair(), original = structuredClone(bundle);
  const menu = current.menu();
  assert.ok(menu.visibleWalkChoices.length > 1);
  compareMenus(bundle, menu, previous.menu());
  menu.availableChoices.find(row => row.direction).direction = 'invented';
  menu.visibleWalkChoices[0].label = 'invented';
  compareMenus(bundle, current.menu(), previous.menu());
  assert.deepEqual(bundle, original, 'a presentation cannot rewrite the saved catalog');
});

test('the same walk choice receives its new relative direction at the next source and candidate decisions remain identical', () => {
  const { bundle, current, previous } = pair();
  const old = current.menu();
  let selected, newMenu;
  for (const candidate of old.visibleWalkChoices) {
    const trial = createWholeTraceSourceAuthoringCursor(bundle);
    trial.append(draft(candidate.choiceId));
    const next = trial.menu();
    const changed = next.visibleWalkChoices.find(cue => old.visibleWalkChoices.some(prior =>
      prior.choiceId === cue.choiceId && prior.direction !== cue.direction));
    if (changed) { selected = candidate.choiceId; newMenu = next; break; }
  }
  assert.ok(selected, 'fixture includes a shared passage seen from two sides');
  const input = draft(selected), untouched = structuredClone(input);
  assert.deepEqual(current.append(input), previous.append(input));
  assert.deepEqual(input, untouched);
  compareMenus(bundle, current.menu(), previous.menu());
  assert.deepEqual(current.menu(), newMenu);
  const row = current.menu().visibleWalkChoices.find(cue => old.visibleWalkChoices.some(prior =>
    prior.choiceId === cue.choiceId && prior.direction !== cue.direction));
  assert.equal(current.menu().availableChoices.find(c => c.choiceId === row.choiceId).direction, row.direction);
  current.append(draft('control/giveUp')); previous.append(draft('control/giveUp'));
  assert.deepEqual(current.finish(), previous.finish(), 'presentation cannot alter action, source, timing or ending');
});

test('help, cart, shelf and terminal menus never retain a stale passage cue', () => {
  const { bundle, current, previous } = pair();
  for (const choiceId of ['control/viewHelp', 'control/closeView', 'control/viewCart',
    'control/closeView', 'open/fresh', 'control/closeStation', 'control/giveUp']) {
    assert.deepEqual(current.append(draft(choiceId)), previous.append(draft(choiceId)));
    compareMenus(bundle, current.menu(), previous.menu());
    if (current.menu().interactionContext.kind !== 'world') {
      assert.deepEqual(current.menu().visibleWalkChoices, []);
      assert.ok(current.menu().availableChoices.every(row => !('direction' in row) && !('distanceBand' in row)));
    }
  }
});

test('a legacy marker or absent saved guide preserves the complete old presentation', () => {
  const { legacy, previous } = pair(), expected = previous.menu();
  for (const variant of ['missing-guide', 'missing-marker', 'v1']) {
    const saved = structuredClone(legacy);
    if (variant === 'missing-guide') delete saved.authoringGuide;
    if (variant === 'missing-marker') delete saved.authoringGuide.executionAuthoring.menuPresentationRevision;
    assert.deepEqual(createWholeTraceSourceAuthoringCursor(saved).menu(), expected);
  }
});

test('a walk without a currently listed visual cue keeps its existing label without inventing a direction', () => {
  const { bundle } = pair();
  const initial = bundle.choiceCatalog.navigation.find(state =>
    state.navigationStateId === bundle.initialChoiceFrame.source.navigationStateId).locations
    .find(location => location.location === 'start');
  const omitted = initial.visibleWalkChoices.shift();
  const menu = createWholeTraceSourceAuthoringCursor(bundle).menu();
  assert.ok(menu.choiceIds.includes(omitted.choiceId), 'do not hide the already legal walk');
  assert.deepEqual(menu.availableChoices.find(row => row.choiceId === omitted.choiceId), {
    choiceId: omitted.choiceId, label: bundle.choiceCatalog.entries.find(e => e.choiceId === omitted.choiceId).label,
  });
});
