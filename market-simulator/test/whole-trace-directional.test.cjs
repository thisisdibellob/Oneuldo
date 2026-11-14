const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { DEFAULT_REPLAY_PRESENTATION } = require('../../frontend/src/game/marketReplayPerception.ts');
const { getWorldCameraFrame } = require('../../frontend/src/game/worldZoom.ts');
const { getMarketHudOcclusionRect } = require('../../frontend/src/game/marketHudLayout.ts');
const { directionalInputSlices, MARKET_DIRECTIONAL_MOVE_SPEED } = require('../../frontend/src/game/marketDirectionalInput.ts');
const { resolveMarketEnvironmentMovement } = require('../../frontend/src/game/marketMovement.ts');
// The production simulator loader intentionally excludes replay modules. Load
// only the two real, UI-independent motor modules for this cross-runtime check.
function loadReplayMotor() {
  const previous = require.extensions['.ts'];
  const allowed = ['motor.ts', 'ports.ts'].map(file => path.resolve(__dirname, '../../frontend/src/replay', file));
  require.extensions['.ts'] = (module, filename) => {
    if (!allowed.includes(filename)) return previous(module, filename);
    const ts = require('../../frontend/node_modules/typescript');
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    module._compile(outputText, filename);
  };
  try { return require('../../frontend/src/replay/motor.ts'); }
  finally { require.extensions['.ts'] = previous; }
}
const { moveDirection, createMotionReport } = loadReplayMotor();
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { wholeTraceChoiceFrame, resolveWholeTraceChoice } = require('../src/wholeTrace/wholeTraceChoices.ts');
const { compileWholeTraceCandidate, validateWholeTracePrefix } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { validateWholeTraceCandidate, validateWholeTraceChoiceDecisionSyntax } = require('../src/wholeTrace/wholeTraceContracts.ts');
const { createWholeTraceSourceAuthoringCursor } = require('../src/wholeTrace/wholeTraceAuthoringSource.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');

const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
// Mechanical contract fixtures only; no model calls or stored experiment rewrites.
function fixture({ enabled = true, presentation } = {}) {
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'whole-directional-contract',
    stockPerProduct: 5, environment: { cashierCount: 2 } }), undefined, presentation);
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'whole-directional-contract',
    timingProfile: 'original', maxActions: 100, llm: { model: 'gpt-6-luna', maxCalls: 1 },
    ...(enabled ? { movementVersion: 'directional-v1' } : {}) };
  const bundle = buildWholeTraceBundle(settings, 'whole-directional-request');
  return { settings, bundle };
}
function decision(source, choiceId, durationMs) {
  const terminal = choiceId === 'control/giveUp';
  return { choiceRef: { source: structuredClone(source), choiceId, ...(durationMs === undefined ? {} : { durationMs }) },
    delayMs: 731, reason: terminal ? '이번 장보기를 마친다' : '선택한 방향으로 잠시 걷는다',
    basis: { intent: terminal ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: terminal ? 'finish' : 'orient', task: terminal ? '장보기 끝내기' : '통로에서 방향 이동',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } };
}
function draft(choiceId, durationMs) {
  const value = decision({}, choiceId, durationMs);
  delete value.choiceRef.source;
  return value;
}
function plan(bundle, decisions) { return { candidateVersion: '7', requestId: bundle.requestId, decisions }; }
function moves(frame) { return frame.availableChoices.filter(entry => entry.action.type === 'moveDirection'); }
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('omitting the movement option preserves the exact pre-change default menus, observations, navigation and input hash', () => {
  const { bundle } = fixture({ enabled: false });
  // Captured from the unchanged checkout before directional implementation. These
  // hashes compare serialized bytes, including entry order, labels and optional keys.
  // Menus and the initial choice frame are still the original capture. actorState,
  // worldReference and inputHash were re-captured after three intended content changes:
  // the anchor-visible-structures-v1 default (visibleStructures: [], 51b5692), persona
  // strategy 5 (cbe8d3c) and the help line about asking staff for locations (a44f3a9).
  const baseline = {
    choiceCatalog: 'a2d836cb1f7af4e3b14f5c0615a060daaa1a959e244265b8c57b14f27a3eb205',
    initialChoiceFrame: 'eaee5bc6277e5e1d86294be9a672a74d10caf05d05e62d239dd8679fab9fe688',
    actorState: 'fcbafb394f00052555044f9ea72da19245288e10d3a076706fb8bcdf38725ead',
    worldReference: '7faae91bd51cdc8ab4686362d805543aeedb71b3d57a718d414e1e874b3185d5',
    inputHash: 'c78136f340db6e0b4f942c5cab086ee29d1ef37bdebcc34bda1b3fc01dd5d091',
  };
  for (const [key, expected] of Object.entries(baseline)) assert.equal(digest(bundle[key]), expected, key);
  assert.equal(bundle.bundleVersion, '8');
  assert.equal(bundle.candidateVersion, '7');
  assert.deepEqual(bundle.supportedCandidateVersions, ['7', '6', '5', '4', '3']);
  assert.equal(Object.hasOwn(bundle, 'movementVersion'), false);
  assert.deepEqual(moves(bundle.initialChoiceFrame), []);
});

test('the starting HUD can hide every north anchor while all eight direction controls remain available', () => {
  const presentation = { viewport: { width: 390, height: 400 }, zoom: 1.3, fontScale: 1, safeArea: { top: 0, bottom: 0 } };
  const { bundle } = fixture({ presentation });
  const legacy = fixture({ enabled: false, presentation }).bundle;
  const observation = bundle.actorState.initialObservation;
  assert.equal(observation.anchors.some(anchor => anchor.direction === 'north'), false);
  // A real north waypoint lies inside the HUD and inside the screen: absence
  // here is occlusion, not an out-of-range destination or a missing grid point.
  const from = bundle.worldReference.navigation.startPoint;
  const camera = getWorldCameraFrame(from, presentation.viewport, presentation.zoom, bundle.worldReference.world.world);
  const hud = getMarketHudOcclusionRect(presentation);
  const hiddenNorth = bundle.worldReference.waypoints.find(waypoint => {
    const dx = waypoint.point.x - from.x, dy = waypoint.point.y - from.y;
    const x = presentation.viewport.width / 2 + (waypoint.point.x - camera.center.x) * presentation.zoom;
    const y = presentation.viewport.height / 2 + (waypoint.point.y - camera.center.y) * presentation.zoom;
    return dy < -45 && Math.abs(dx) < 20 && Math.hypot(dx, dy) < 180
      && x > hud.left && x < hud.right && y > hud.top && y < hud.bottom;
  });
  assert.ok(hiddenNorth);
  assert.equal(observation.anchors.some(anchor => anchor.id === hiddenNorth.anchorId), false);
  assert.deepEqual(moves(bundle.initialChoiceFrame).map(entry => entry.action.direction), directions);
  assert.ok(bundle.initialChoiceFrame.availableChoices.some(entry => entry.action.type === 'walk'), 'visible walking shortcuts remain');
  for (const entry of moves(bundle.initialChoiceFrame)) {
    assert.equal(entry.choiceId, `moveDirection/${entry.action.direction}`);
    assert.deepEqual(entry.action, { type: 'moveDirection', direction: entry.action.direction });
    assert.equal(entry.durationBounds.min, 100); assert.equal(entry.durationBounds.max, 2000);
    assert.deepEqual(entry.cueRefs, ['control:moveDirection']);
  }
  for (const key of ['anchors', 'visibleStations', 'products', 'readObjectives'])
    assert.deepEqual(observation[key], legacy.actorState.initialObservation[key], key);
  assert.deepEqual(bundle.worldReference, legacy.worldReference, 'movement does not widen perception or the old navigation graph');
  const addedCues = bundle.actorState.knowledge.cues.filter(cue => !legacy.actorState.knowledge.cues.some(old => old.cueRef === cue.cueRef));
  assert.deepEqual(addedCues.map(cue => cue.cueRef), ['control:moveDirection']);
  assert.equal(bundle.actorState.knowledge.cues.some(cue => cue.cueRef === `anchor:${hiddenNorth.anchorId}`), false);
});

test('directions require only the unlocked shopping world, even with empty visual cues', () => {
  const { bundle } = fixture();
  const tracked = { location: 'start', navigationStateId: bundle.worldReference.navigation.initialStateId };
  const empty = { ...bundle.actorState.initialObservation, anchors: [], visibleStations: [], products: [], cashiers: {},
    readObjectives: undefined, instructions: undefined };
  const frame = wholeTraceChoiceFrame(empty, bundle, tracked);
  assert.deepEqual(moves(frame).map(entry => entry.action.direction), directions);
  for (const panel of [{ view: 'cart' }, { view: 'help' }, { activeStation: 'fresh' }, { phase: 'checkout', activeStation: 'checkout' }]) {
    const locked = wholeTraceChoiceFrame({ ...empty, ...panel }, bundle, tracked);
    assert.deepEqual(moves(locked), [], JSON.stringify(panel));
  }
  for (const durationMs of [100, 1007, 2000]) {
    const resolved = resolveWholeTraceChoice(decision(frame.source, 'moveDirection/north', durationMs), empty, bundle, tracked);
    assert.deepEqual(resolved.policyAction, { type: 'moveDirection', direction: 'north', durationMs });
    assert.deepEqual(resolved.derivedCueRefs, ['control:moveDirection']);
  }
});

test('direction choices reject missing, fractional or out-of-bounds durations, extraneous quantities and stale sources', () => {
  const { bundle } = fixture(), observation = bundle.actorState.initialObservation;
  const tracked = { location: 'start', navigationStateId: bundle.worldReference.navigation.initialStateId };
  const source = bundle.initialChoiceFrame.source;
  for (const durationMs of [undefined, 99, 2001, 100.5, NaN, '1000'])
    assert.throws(() => resolveWholeTraceChoice(decision(source, 'moveDirection/north', durationMs), observation, bundle, tracked));
  const quantity = decision(source, 'moveDirection/north', 1000); quantity.choiceRef.quantity = 1;
  assert.throws(() => resolveWholeTraceChoice(quantity, observation, bundle, tracked));
  assert.throws(() => resolveWholeTraceChoice(decision(source, 'control/pause', 1000), observation, bundle, tracked));
  assert.throws(() => resolveWholeTraceChoice(decision({ ...source, location: 'D1' }, 'moveDirection/north', 1000), observation, bundle, tracked),
    error => error.code === 'CHOICE_SOURCE_MISMATCH');
  const legacy = fixture({ enabled: false }).bundle;
  assert.throws(() => resolveWholeTraceChoice(decision(legacy.initialChoiceFrame.source, 'moveDirection/north', 1000),
    legacy.actorState.initialObservation, legacy, tracked), error => error.code === 'CHOICE_NOT_AVAILABLE');
});

test('the opt-in extends source-bound candidates 4 through 7 without widening any default wire contract', () => {
  const { bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  for (const candidateVersion of ['4', '5', '6', '7']) {
    const decisions = [decision(source, 'moveDirection/north', 1000),
      decision({ ...source, location: 'D1' }, 'control/giveUp')];
    for (const value of decisions) {
      if (candidateVersion !== '7') delete value.basis.goalId;
      if (candidateVersion === '4' || candidateVersion === '5') delete value.basis.memoryUses;
    }
    const candidate = { candidateVersion, requestId: bundle.requestId, decisions };
    assert.deepEqual(validateWholeTraceCandidate(candidate, bundle.requestId, { movementVersion: 'directional-v1' }),
      { valid: true, errors: [] }, candidateVersion);
    assert.equal(validateWholeTraceCandidate(candidate, bundle.requestId).valid, false, candidateVersion);
    assert.equal(validateWholeTraceChoiceDecisionSyntax(decisions[0], candidateVersion).valid, false, candidateVersion);
  }
  for (const change of [{ choiceId: 'moveDirection/up', durationMs: 1000 },
    { choiceId: 'moveDirection/north' }, { choiceId: 'moveDirection/north', durationMs: 99 },
    { choiceId: 'moveDirection/north', durationMs: 2001 }, { choiceId: 'moveDirection/north', durationMs: 100.5 },
    { choiceId: 'moveDirection/north', durationMs: 1000, quantity: 1 }, { choiceId: 'control/pause', durationMs: 1000 }]) {
    const value = decision(source, change.choiceId);
    Object.assign(value.choiceRef, change);
    assert.equal(validateWholeTraceChoiceDecisionSyntax(value, '7', { movementVersion: 'directional-v1' }).valid, false, JSON.stringify(change));
  }
});

async function replayMovementStep(step, snapshot, position) {
  let driver, current = { ...position };
  const delivered = [], report = createMotionReport();
  const port = {
    read: () => ({ position: { ...current }, environment: snapshot.environment, cashiers: snapshot.cashierAvailability,
      locked: false, presentation: snapshot.presentation ?? DEFAULT_REPLAY_PRESENTATION }),
    drive: callback => { driver = callback; }, stop: () => { driver = undefined; },
  };
  let settled = false, failure;
  const replay = moveDirection(port, step.direction, step.durationMs, snapshot.presentation ?? DEFAULT_REPLAY_PRESENTATION,
    step.movement, new AbortController().signal, report);
  void replay.then(() => { settled = true; }, error => { settled = true; failure = error; });
  const frameTimes = [8, 33, 16, 47];
  for (let i = 0; i < 1000 && !settled; i++) {
    await Promise.resolve();
    if (!driver) continue;
    const input = driver(i * 47, frameTimes[i % frameTimes.length] / 1000);
    for (const slice of input.directionalSlices ?? []) {
      delivered.push(slice);
      current = resolveMarketEnvironmentMovement(snapshot.environment, current, {
        x: slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
        y: slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
      }, snapshot.cashierAvailability).position;
    }
  }
  assert.equal(settled, true); assert.equal(failure, undefined); await replay;
  assert.deepEqual(delivered, directionalInputSlices(step.direction, step.durationMs, step.movement));
  assert.equal(report.displacementViolations, 0); assert.equal(report.inputViolations, 0);
  return current;
}

test('whole-trace direction steps preserve actor timing and run unchanged through the frontend motor and trace validator', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const candidate = plan(bundle, [decision(source, 'moveDirection/north', 100),
    decision({ ...source, location: 'D1' }, 'moveDirection/east', 2000),
    decision({ ...source, location: 'D2' }, 'control/giveUp')]);
  const original = structuredClone(candidate);
  const compiled = await compileWholeTraceCandidate(settings, bundle, candidate);
  assert.deepEqual(candidate, original);
  assert.equal(compiled.acceptedActions, 3);
  assert.deepEqual(validateTrace(compiled.trace, settings.snapshot), { valid: true, errors: [] });
  assert.equal(compiled.trace.generation.wholeTraceMovementVersion, 'directional-v1');
  assert.equal(compiled.trace.generation.movementContract, 'joystick-direction-v1');
  const steps = compiled.trace.steps.filter(step => step.type === 'moveDirection');
  assert.deepEqual(steps.map(step => [step.direction, step.durationMs, step.reactionDelayMs]), [['north', 100, 731], ['east', 2000, 731]]);
  const guard = new TraceGuard(settings.snapshot, bundle.persona.id, bundle.persona.version, 'directional-motor-fixture', true, true, false, true);
  let position = { ...settings.snapshot.environment.spawn };
  for (const step of steps) {
    assert.ok(step.movement.accelerationMs >= 160 && step.movement.accelerationMs <= 280);
    position = await replayMovementStep(step, settings.snapshot, position);
    guard.execute(step);
    assert.deepEqual(position, guard.observe().playerPosition, 'offline execution and app motor integrate the same inputs');
  }
  const stale = structuredClone(candidate); stale.decisions[1].choiceRef.source.location = 'start';
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, stale), error => error.validation?.code === 'CHOICE_SOURCE_MISMATCH');
  const disabled = fixture({ enabled: false });
  await assert.rejects(compileWholeTraceCandidate(disabled.settings, disabled.bundle, candidate));
});

test('a compiled directional position can take a currently visible walk shortcut and restore its waypoint source', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const north = decision(source, 'moveDirection/north', 1000);
  const prefix = await validateWholeTracePrefix(settings, bundle, plan(bundle, [north]));
  assert.equal(prefix.acceptedActions, 1);
  const frame = wholeTraceChoiceFrame(prefix.before, bundle, { location: 'D1', navigationStateId: source.navigationStateId });
  const shortcut = frame.availableChoices.find(entry => entry.action.type === 'walk');
  assert.ok(shortcut, 'the actual post-movement observation exposes a local walking shortcut');
  const target = bundle.worldReference.waypoints.find(waypoint => waypoint.waypointId === shortcut.action.waypointId);
  assert.ok(prefix.before.anchors.some(anchor => anchor.id === target.anchorId));
  const compiled = await compileWholeTraceCandidate(settings, bundle, plan(bundle, [north,
    decision(frame.source, shortcut.choiceId), decision({ ...source, location: target.waypointId }, 'control/giveUp')]));
  assert.equal(compiled.acceptedActions, 3);
  assert.deepEqual(compiled.knowledgeAudit.map(entry => entry.choiceResolution.source.location), ['start', 'D1', target.waypointId]);
  assert.deepEqual(compiled.trace.steps.filter(step => step.type === 'moveDirection' || step.type === 'walkToAnchor')
    .map(step => step.type), ['moveDirection', 'walkToAnchor']);
  assert.deepEqual(validateTrace(compiled.trace, settings.snapshot), { valid: true, errors: [] });
});

test('dynamic direction locations still reject hidden targets and undiscovered cues from the global catalog', async () => {
  const { settings, bundle } = fixture(), source = bundle.initialChoiceFrame.source;
  const north = decision(source, 'moveDirection/north', 1000);
  const prefix = await validateWholeTracePrefix(settings, bundle, plan(bundle, [north]));
  const tracked = { location: 'D1', navigationStateId: source.navigationStateId };
  const frame = wholeTraceChoiceFrame(prefix.before, bundle, tracked);
  const hiddenStation = bundle.choiceCatalog.entries.find(entry => entry.action.type === 'interact'
    && !prefix.before.visibleStations.some(station => station.id === entry.action.station));
  const hiddenProduct = bundle.choiceCatalog.entries.find(entry => entry.action.type === 'add'
    && !prefix.knowledge.cues.some(cue => cue.cueRef === `product:${entry.action.productId}`));
  assert.ok(hiddenStation); assert.ok(hiddenProduct);
  for (const entry of [hiddenStation, hiddenProduct]) {
    assert.equal(frame.availableChoices.some(choice => choice.choiceId === entry.choiceId), false);
    const wire = decision(frame.source, entry.choiceId);
    if (entry.action.type === 'add') wire.choiceRef.quantity = 1;
    assert.throws(() => resolveWholeTraceChoice(wire, prefix.before, bundle, tracked), error => error.code === 'CHOICE_NOT_AVAILABLE');
    await assert.rejects(compileWholeTraceCandidate(settings, bundle, plan(bundle, [north, wire,
      decision(frame.source, 'control/giveUp')])), error => error.validation?.code === 'CHOICE_NOT_AVAILABLE'
        && error.validation.acceptedPrefixLength === 1);
  }
  const hiddenBasis = decision(frame.source, 'moveDirection/east', 1000);
  hiddenBasis.basis.cueRefs = [`product:${hiddenProduct.action.productId}`];
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, plan(bundle, [north, hiddenBasis,
    decision({ ...source, location: 'D2' }, 'control/giveUp')])), error => error.validation?.code === 'KNOWLEDGE_BASIS'
      && error.validation.acceptedPrefixLength === 1);
});

test('the source authoring cursor records symbolic direction locations without predicting a destination', () => {
  const { bundle } = fixture(), cursor = createWholeTraceSourceAuthoringCursor(bundle);
  assert.deepEqual(cursor.menu().choiceIds.filter(id => id.startsWith('moveDirection/')), directions.map(direction => `moveDirection/${direction}`));
  const first = cursor.append(draft('moveDirection/north', 1000));
  assert.equal(first.choiceRef.source.location, 'start');
  assert.equal(cursor.snapshot().expectedSource.location, 'D1');
  const after = cursor.menu();
  assert.deepEqual(after.allowedWaypointIds, []);
  assert.deepEqual(after.visibleWalkChoices, []);
  assert.equal(after.choiceIds.some(id => /^(walk|open|checkout)\//.test(id)), false);
  cursor.append(draft('moveDirection/east', 1000));
  assert.equal(cursor.snapshot().expectedSource.location, 'D2');
  assert.equal(typeof cursor.acceptMovementPosition, 'function', 'phase two has an explicit post-movement position boundary');
  assert.throws(() => cursor.acceptMovementPosition({ decisionCount: 1, position: bundle.worldReference.navigation.startPoint }));
  cursor.acceptMovementPosition({ decisionCount: 2, position: bundle.worldReference.navigation.startPoint });
  assert.equal(cursor.snapshot().expectedSource.location, 'D2', 'received coordinates never masquerade as a waypoint arrival');
  assert.ok(cursor.menu().allowedWaypointIds.length > 0);
  cursor.append(draft('control/giveUp'));
  assert.equal(cursor.finish().decisions.length, 3);
});
