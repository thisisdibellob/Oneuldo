const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { extendedActorChoices, presentActorChoices } = require('../src/actorChoices.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { marketMission } = require('../../frontend/src/game/scenarios.ts');

const step = (type, extra = {}) => ({ id: type, type, reactionDelayMs: 1, timeoutMs: 120000,
  reason: 'Offline UI control contract fixture; not a persona play', ...extra });
function guard(near, v11 = true) {
  const config = { seed: 'control-effects-fixture', environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  return new TraceGuard(createMarketReplaySnapshot(createMarketSession(config, environment)),
    'adult-minjae-unit-support-research-v2', 'research-learning-v2', 'offline-test', true, true,
    false, false, false, false, true, false, undefined, v11);
}
function unchangedControls(observation) {
  const plain = extendedActorChoices({ ...observation, visibleApproachEnabled: undefined });
  const described = extendedActorChoices(observation);
  // ui-fidelity-v2 deliberately offers v11 giveUp only where the app shows 그만두기 (store-floor menu, checkout).
  const inside = observation.phase === 'shopping' && (observation.view === 'cart' || observation.view === 'help' || !!observation.activeStation);
  if (inside) assert.equal(described.some(c => c.action.type === 'giveUp'), false);
  const controls = list => list.filter(c => !inside || c.action.type !== 'giveUp').map(({ id, action }) => ({ id, action }));
  assert.deepEqual(controls(described), controls(plain));
  assert.deepEqual(controls(presentActorChoices(described, 'fixed-order', 17)),
    controls(presentActorChoices(plain, 'fixed-order', 17)));
  return { plain, described };
}

test('v11 add/remove descriptions match actual quantity deltas without exposing an unseen cart total', () => {
  const g = guard('fresh');
  g.execute(step('openShelf', { stationId: 'fresh' }));
  const first = g.observeActor();
  assert.equal(first.cart, null);
  const productId = first.products.find(p => p.stock >= 4).id;
  const { described, plain } = unchangedControls(first);
  const add = described.find(c => c.action.type === 'add' && c.action.productId === productId && c.action.quantity === 2);
  assert.match(add.effect, /Add 2 more unit\(s\)/);
  assert.match(add.effect, /not a command to set the cart total/);
  assert.equal(plain.find(c => c.id === add.id).effect, undefined);
  for (let n = 0; n < 2; n++) g.execute(step('dragProduct', { productId, quantity: 2,
    gesture: { outcome: 'drop', durationMs: 100, hesitationMs: 0 } }));
  g.execute(step('viewCart'));
  assert.equal(g.observeActor().cart[productId], 4);
  const remove = unchangedControls(g.observeActor()).described.find(c =>
    c.action.type === 'remove' && c.action.productId === productId && c.action.quantity === 2);
  assert.match(remove.effect, /Remove 2 unit\(s\)/);
  assert.match(remove.effect, /not a command to set the remaining cart total/);
  g.execute(step('removeProduct', { productId, quantity: 2 }));
  assert.equal(g.observeActor().cart[productId], 2);
  assert.equal(JSON.stringify(described).includes('readObjectives'), false);
  assert.equal(JSON.stringify(described).includes('acceptedProductIds'), false);
});

test('v11 checkout opening and purchase confirmation remain distinct existing controls', () => {
  const g = guard('checkout');
  const before = g.observeActor();
  const checkout = extendedActorChoices(before).find(c => c.action.type === 'checkout' && c.action.checkoutId === 'checkout');
  assert.ok(checkout);
  assert.match(checkout.effect, /Opening it does not confirm a purchase or submit the cart/);
  g.execute(step('checkout', { checkoutId: 'checkout' }));
  assert.equal(g.observe().attempts, 0);
  assert.equal(g.observeActor().phase, 'checkout');
  const { described, plain } = unchangedControls(g.observeActor());
  const submit = described.find(c => c.action.type === 'submit');
  assert.equal(submit.label, '구매 확정');
  assert.match(submit.effect, /confirm the current cart and submit this attempt/);
  assert.match(submit.effect, /does not add, remove or correct products or quantities/);
  assert.equal(plain.find(c => c.id === submit.id).label, 'AI 수행 검토 요청하기');
  assert.equal(plain.find(c => c.id === submit.id).effect, undefined);
});

for (const checkout of [false, true]) test(`v11 voluntary stop remains available ${checkout ? 'at checkout' : 'while shopping'} without purchase or submission`, () => {
  const g = guard(checkout ? 'checkout' : 'fresh');
  if (checkout) g.execute(step('checkout', { checkoutId: 'checkout' }));
  const quit = extendedActorChoices(g.observeActor()).find(c => c.action.type === 'giveUp');
  assert.ok(quit);
  assert.equal(quit.label, checkout ? '그만두기 (장보기 포기)' : '메뉴의 그만두기 (장보기 포기)');
  assert.match(quit.effect, /Nothing in the cart is bought or paid for/);
  g.execute(step('giveUp'));
  assert.equal(g.observe().phase, 'finished');
  assert.equal(g.observe().attempts, 0);
  assert.equal(g.observe().outcome, 'gave-up');
});

test('legacy direct and feedback observations do not opt into the v11 control descriptions', () => {
  const g = guard('checkout', false);
  assert.equal(g.observeActor().visibleApproachEnabled, undefined);
  assert.equal(extendedActorChoices(g.observeActor()).find(c => c.action.type === 'giveUp').effect, undefined);
  g.execute(step('checkout', { checkoutId: 'checkout' }));
  const submit = extendedActorChoices(g.observeActor()).find(c => c.action.type === 'submit');
  assert.equal(submit.label, 'AI 수행 검토 요청하기');
  assert.equal(submit.effect, undefined);
});

test('ui-fidelity-v1: v11 closeStation uses the actual app button text without changing the control', () => {
  const g = guard('fresh');
  g.execute(step('openShelf', { stationId: 'fresh' }));
  const { described, plain } = unchangedControls(g.observeActor());
  const close = described.find(c => c.action.type === 'closeStation');
  assert.equal(close.label, '다 골랐어요');
  assert.match(close.effect, /Products already in the cart stay in the cart/);
  // Legacy/non-v11 observations keep the original generic label.
  assert.equal(plain.find(c => c.id === close.id).label, '진열대 또는 대화 닫기');
});

test('ui-fidelity-v2 and goal-reminder-v1: no quit inside a shelf; the open cart repeats quest text once listed items are in it', () => {
  const config = { seed: 'control-effects-fixture', environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'fresh', environment.spawn);
  const probe = new TraceGuard(createMarketReplaySnapshot(createMarketSession(config, environment)),
    'adult-minjae-unit-support-research-v2', 'research-learning-v2', 'offline-test', true, true, false, false, false, false, true, false, undefined, true);
  probe.execute(step('openShelf', { stationId: 'fresh' }));
  const productId = probe.observeActor().products[0].id;
  const mission = { ...marketMission, description: '목표 설명', briefing: ['안내 1', '안내 2'], objectives: [{ productId, quantity: 1 }] };
  const g = new TraceGuard(createMarketReplaySnapshot(createMarketSession({ ...config, objectives: [{ productId, quantity: 1 }] }, environment), mission),
    'adult-minjae-unit-support-research-v2', 'research-learning-v2', 'offline-test', true, true, false, false, false, false, true, false, undefined, true);
  g.execute(step('openShelf', { stationId: 'fresh' }));
  assert.equal(extendedActorChoices(g.observeActor()).some(c => c.action.type === 'giveUp'), false);
  g.execute(step('viewCart'));
  assert.equal(g.observeActor().goalReminder, undefined, 'nothing before the listed items are in the cart');
  g.execute(step('closeView'));
  g.execute(step('dragProduct', { productId, quantity: 1, gesture: { outcome: 'drop', durationMs: 100, hesitationMs: 0 } }));
  g.execute(step('viewCart'));
  assert.deepEqual(g.observeActor().goalReminder, { contract: 'goal-reminder-v1', title: '퀘스트 안내 다시 보기', lines: ['목표 설명', '안내 1', '안내 2'] });
  g.execute(step('closeView')); g.execute(step('closeStation'));
  assert.equal(g.observeActor().goalReminder, undefined, 'only while the cart is open');
  assert.ok(extendedActorChoices(g.observeActor()).some(c => c.action.type === 'giveUp'), 'store floor keeps the menu quit');
});

test('visible-travel-v1: a visible but distant place can be walked to along the floor, ending next to it', () => {
  // The actual easy pre/post layout (classic, tailored-shared-v1), standing at the fresh shelf.
  const base = require('./fixtures/prepost-easy-classic-snapshot.json');
  const environment = structuredClone(base.environment);
  environment.spawn = getMarketStationApproachPoint(environment, 'fresh', environment.spawn, base.cashierAvailability);
  const g = new TraceGuard(createMarketReplaySnapshot(createMarketSession(base.config, environment), base.mission, base.presentation),
    'adult-minjae-unit-support-research-v2', 'research-learning-v2', 'offline-test', true, true, false, false, false, false, true, false, undefined, true);
  const before = g.observeActor();
  const far = before.visibleStations.find(s => s.id.startsWith('checkout') && s.approachable === false && !s.near);
  assert.ok(far, 'fixture: a checkout is visible from the fresh shelf but not locally approachable');
  const choice = extendedActorChoices(before).find(c => c.action.type === 'walkTo' && c.action.station === far.id);
  assert.equal(choice.label, `보이는 ${far.label} 쪽으로 걸어가기 (멀리 보임)`);
  assert.match(choice.effect, /going around shelves/);
  g.execute(step('walkTo', { target: { stationId: far.id }, movement: { style: 'steady', speedMultiplier: 1, running: false, motorSeed: 's', accelerationMs: 200 } }));
  const after = g.observeActor();
  assert.ok(after.visibleStations.some(s => s.id === far.id && s.near), 'arrives next to the visible target');
  assert.ok(extendedActorChoices(after).some(c => c.action.type === 'checkout' && c.action.checkoutId === far.id));
});
