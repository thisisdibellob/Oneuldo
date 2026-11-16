'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
require('../runtime.cjs');
const { buildSnapshots } = require('../scripts/build-validation-snapshots.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, validateMarketReplayTrace } = require('../../frontend/src/game/marketReplayTrace.ts');
const { visibleBoundaries, visibleBoundariesV3, visibleAnchors, visibleGatePassages, replayCurrentArea } = require('../../frontend/src/game/marketReplayPerception.ts');
const { buildWholeTraceBundle } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { WholeTraceSession } = require('../src/wholeTrace/wholeTraceSession.ts');
const { WholeTraceWayfindingMemoryV3, wayfindingProfileOf } = require('../src/wholeTrace/wholeTraceWayfinding.ts');
const { validateTrace } = require('../src/traceValidation.ts');
const { getPersona } = require('../src/personas.ts');
const V3 = 'wayfinding-v3';

// The validation layout: the start is in the lobby outside the shop front wall.
const base = buildSnapshots({ environmentSeed: 'trait-v3-pilot-20261111-r2-verified', lowGoalCount: 2 }).low;
const entrance = base.environment.stationDetails.find(station => station.kind === 'entrance').point;
const LOBBY_START = { x: 710, y: 1350 }, AT_ENTRANCE = { x: entrance.x, y: entrance.y + 30 }, INSIDE = { x: entrance.x, y: entrance.y - 40 };
function fixture(spawn, extra = {}) {
  const environment = structuredClone(base.environment);
  environment.spawn = spawn;
  const snapshot = createMarketReplaySnapshot(createMarketSession(base.config, environment), undefined, base.presentation);
  const settings = { snapshot, personaId: 'mild-intellectual-disability-adult', seed: 'wayfinding-v3', maxActions: 100, maxRepairs: 0,
    timingProfile: 'original', movementValidationVersion: '1', wayfindingVersion: V3, ...extra };
  return { settings, bundle: buildWholeTraceBundle(settings, `wayfinding-v3-${spawn.x}-${spawn.y}`) };
}
function draft(choiceId, { delayMs = 800 } = {}) {
  const ending = choiceId === 'control/giveUp';
  return { choiceRef: { choiceId }, delayMs, reason: '현재 표시된 화면에서 선택한 행동을 수행한다',
    basis: { intent: ending ? 'finish' : 'explore', goalId: null, memoryUses: [] },
    actorState: { activity: ending ? 'finish' : 'orient', task: '매장 구조를 살피며 매대를 찾는다',
      heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar',
      thought: { plan: ending ? '지금까지 확인한 상태로 장보기를 마친다' : '화면을 보고 다음에 갈 곳을 정한다' } } };
}

test('v3 boundaries name what is drawn: the shop front is a wall and lobby benches are furniture, never "shelf-like fixtures"', () => {
  const env = base.environment, p = base.presentation;
  for (const position of [LOBBY_START, AT_ENTRANCE, { x: 300, y: 1230 }]) {
    const v1 = visibleBoundaries(env, position, p), v3 = visibleBoundariesV3(env, position, p);
    for (const [i, boundary] of v1.entries()) {
      assert.equal(v3[i].direction, boundary.direction);
      if (boundary.kind === 'fixture') assert.ok(['wall', 'furniture', 'checkout', 'person'].includes(v3[i].kind), `${JSON.stringify(position)} ${boundary.direction}: ${v3[i].kind}`);
      if (boundary.kind === 'covered' || boundary.kind === 'open') assert.equal(v3[i].kind, boundary.kind);
    }
    assert.equal(v3.some(b => b.kind === 'shelf'), false, 'no shelf is drawn in the lobby');
  }
  assert.ok(visibleBoundariesV3(env, { x: 300, y: 1230 }, p).some(b => b.label === '의자와 탁자'));
});

test('v3 area and gate passages: the lobby, the sales floor, and walk choices that go through the visible entrance', () => {
  const env = base.environment, p = base.presentation;
  assert.deepEqual(replayCurrentArea(env, LOBBY_START), { kind: 'lobby', label: '매장 밖 로비 (매장 앞)' });
  assert.equal(replayCurrentArea(env, INSIDE).kind, 'sales-floor');
  assert.deepEqual(visibleGatePassages(env, LOBBY_START, p, visibleAnchors(env, LOBBY_START, p)), []);
  const inward = visibleGatePassages(env, AT_ENTRANCE, p, visibleAnchors(env, AT_ENTRANCE, p));
  assert.ok(inward.length > 0);
  assert.ok(inward.every(g => g.gate === 'entrance' && g.direction === 'inward' && g.label === '입구를 지나 매장 안으로'));
  const outward = visibleGatePassages(env, INSIDE, p, visibleAnchors(env, INSIDE, p));
  assert.ok(outward.length > 0 && outward.every(g => g.direction === 'outward'));
});

test('v3 menu labels the entrance passage and reports the current area; v2 observations stay unchanged', async () => {
  const { settings, bundle } = fixture(AT_ENTRANCE);
  const menu = await (await createWholeTraceExecutionAuthoringCursor(settings, bundle)).menu();
  assert.equal(menu.currentObservation.observation.area.kind, 'lobby');
  assert.equal(menu.spatialMemory.kind, 'actor-spatial-memory-v3');
  assert.equal(menu.spatialMemory.currentArea, '매장 밖 로비 (매장 앞)');
  assert.ok(menu.visibleWalkChoices.some(choice => choice.label.includes('입구를 지나 매장 안으로') && choice.gatePassage));
  assert.match(bundle.instructions, /wayfinding-v3 공통 규칙/);
  const v2 = fixture(AT_ENTRANCE, { wayfindingVersion: 'wayfinding-v2' });
  const old = await (await createWholeTraceExecutionAuthoringCursor(v2.settings, v2.bundle)).menu();
  assert.equal(Object.hasOwn(old.currentObservation.observation, 'area'), false);
  assert.equal(Object.hasOwn(old.currentObservation.observation, 'gatePassages'), false);
  assert.equal(old.visibleWalkChoices.some(choice => choice.label.includes('입구를 지나')), false);
});

function obs(sequence, extra = {}) {
  return { schemaVersion: 'attention-observation-v1', phase: 'shopping', view: 'world', activeStation: null,
    visibleStations: [], anchors: [{ id: `a${sequence}`, label: '눈앞의 통로', direction: 'north', distanceBand: 'near' }],
    products: [], shelf: null, listAvailable: true, cart: null, cashiers: {}, sequence, elapsedMs: sequence * 1000,
    lastActionError: null, area: { kind: 'lobby', label: '매장 밖 로비 (매장 앞)' }, gatePassages: [], ...extra };
}

test('v3 giveUp: seeing nothing is not a reason; a seen entrance must be entered and unwalked passages wait for the time floor', () => {
  const profile = wayfindingProfileOf(require('../personas/neutral-adult-control.json'), V3);
  const memory = new WholeTraceWayfindingMemoryV3(profile, 'v3');
  memory.observe(obs(0), 0);
  memory.observe(obs(1, { view: 'help' }), 1);
  const early = memory.giveUpStatus({ phase: 'shopping' });
  assert.equal(early.available, false, 'nothing seen, help read, but unwalked passages remain');
  assert.match(early.notice, /아직 안 가 본 곳/);
  memory.observe(obs(2, { visibleStations: [{ id: 'entrance', kind: 'entrance', label: '입구', direction: 'north', distanceBand: 'near', near: true }],
    gatePassages: [{ anchorId: 'a2', gate: 'entrance', direction: 'inward', label: '입구를 지나 매장 안으로' }] }), 2);
  memory.observe(obs(profile.explorationBudgetMs / 1000 + 5), 3);
  const locked = memory.giveUpStatus({ phase: 'shopping' });
  assert.equal(locked.available, false, 'the time floor does not open giveUp before the seen entrance was passed');
  assert.match(locked.notice, /본 입구를 지나 매장 안에 아직 들어가 보지 않음/);
  memory.observe(obs(1000, { result: { accepted: true, actionType: 'walkToAnchor', anchorId: 'a2' }, area: { kind: 'sales-floor', label: '매장 안 판매 구역' } }), 4);
  // The walk is recorded against the previous world observation, which showed a2's gate passage only at sequence 2.
  const snapshot = memory.snapshot(obs(1001, { area: { kind: 'sales-floor', label: '매장 안 판매 구역' } }));
  assert.equal(snapshot.currentArea, '매장 안 판매 구역');
  assert.deepEqual(snapshot.areasVisited, ['매장 밖 로비 (매장 앞)', '매장 안 판매 구역']);
  assert.equal(memory.giveUpStatus({ phase: 'shopping' }).available, true, 'inside the shop and past the time floor');
});

test('v3 session from the lobby: giveUp only after help and the time floor, and the trace validates', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wayfinding-v3-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { settings } = fixture(LOBBY_START), outputPath = path.join(directory, 'trace.json');
  const session = new WholeTraceSession({ ...settings, outputPath });
  session.prepare();
  await session.beginAuthoring();
  const append = async decision => {
    const result = await session.appendAuthoring(decision);
    assert.equal(result.accepted, true, JSON.stringify(result.issues));
    return result;
  };
  await append(draft('control/viewHelp'));
  const afterHelp = await append(draft('control/closeView'));
  assert.equal(afterHelp.menu.spatialMemory.giveUp.available, false, afterHelp.menu.spatialMemory.giveUp.notice);
  assert.equal(afterHelp.menu.choiceIds.includes('control/giveUp'), false);
  await append(draft('control/pause', { delayMs: 120000 }));
  const ready = await append(draft('control/pause', { delayMs: 120000 }));
  assert.equal(ready.menu.spatialMemory.giveUp.available, true, ready.menu.spatialMemory.giveUp.notice);
  await append(draft('control/giveUp'));
  const result = await session.submit(session.finishAuthoring().candidate);
  assert.equal(result.status, 'complete');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const trace = read(outputPath), snapshot = read(`${outputPath}.snapshot.json`);
  assert.equal(trace.generation.wholeTraceWayfindingVersion, V3);
  assert.deepEqual(validateMarketReplayTrace(trace, snapshot), { valid: true, errors: [] });
  assert.deepEqual(validateTrace(trace, snapshot), { valid: true, errors: [] });
});

test('v3 keeps the persona profile shape of v2', () => {
  const persona = getPersona('mild-intellectual-disability-adult');
  assert.deepEqual(wayfindingProfileOf(persona, V3), wayfindingProfileOf(persona, 'wayfinding-v2'));
});
