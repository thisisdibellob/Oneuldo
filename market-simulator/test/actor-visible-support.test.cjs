const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { TraceGuard } = require('../src/traceValidation.ts');
const { extendedActorChoices: actorChoices } = require('../src/actorChoices.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketHelpLines, marketCashierResponse } = require('../../frontend/src/game/marketHelp.ts');
const step = (type, extra = {}) => ({ id: type, type, reactionDelayMs: 1, timeoutMs: 120000, reason: 'fixture', ...extra });
const walk = stationId => step('walkTo', { target: { stationId }, movement: { style: 'steady', speedMultiplier: 1, motorSeed: 'fixture' } });
const guard = config => new TraceGuard(createMarketReplaySnapshot(createMarketSession({ seed: 'visible-support', ...config })), undefined, undefined, undefined, false, true);

test('help content is the shared UI text, scoped to the opened view and not a learning verdict', () => {
  const g = guard({ alarmPenaltyPoints: 27 });
  assert.equal(g.observeActor().supportText, undefined);
  g.execute(step('viewHelp'));
  const visible = g.observeActor();
  assert.deepEqual(visible.supportText, getMarketHelpLines(27));
  assert.equal(visible.readObjectives, undefined);
  assert.equal(visible.evaluation, undefined);
  visible.supportText[0] = 'untrusted mutation';
  assert.deepEqual(g.observeActor().supportText, getMarketHelpLines(27));
  g.execute(step('closeView'));
  assert.equal(g.observeActor().supportText, undefined);
  assert.equal(g.observeActor().result.message, undefined);
});

test('actor offers actual shelf return controls but none in the standalone cart or a different shelf', () => {
  const g = guard();
  g.execute(walk('fresh'));
  g.execute(step('openShelf', { stationId: 'fresh' }));
  const productId = g.observeActor().products[0].id;
  g.execute(step('dragProduct', { productId, quantity: 2, gesture: { outcome: 'drop', durationMs: 100, hesitationMs: 0 } }));
  g.execute(step('viewCart'));
  assert.deepEqual(g.observeActor().removableProductIds, [productId]);
  assert.deepEqual(actorChoices(g.observeActor()).filter(c => c.action.type === 'remove').map(c => c.action.quantity), [1, 2]);
  g.execute(step('closeView'));
  g.execute(step('closeStation'));
  g.execute(step('viewCart'));
  assert.deepEqual(g.observeActor().removableProductIds, []);
  assert.equal(actorChoices(g.observeActor()).some(c => c.action.type === 'remove'), false);
  g.execute(step('closeView'));
  g.execute(walk('produce'));
  g.execute(step('openShelf', { stationId: 'produce' }));
  g.execute(step('viewCart'));
  assert.equal(actorChoices(g.observeActor()).some(c => c.action.type === 'remove'), false);
});

test('staff confirmation describes the actual requested action and expires at the next action', () => {
  const g = guard({ environment: { cashierCount: 0, employeeCount: 1 } });
  const stationId = g.observe().environment.stationDetails.find(s => s.kind === 'employee').id;
  g.execute(walk(stationId));
  g.execute(step('talkToStaff', { stationId, choice: 'open' }));
  assert.equal(g.observeActor().result.message, undefined);
  g.execute(step('talkToStaff', { stationId, choice: 'requestCashier', checkoutId: 'checkout-2' }));
  // Current game policy recruits the first eligible staffed counter; the legacy
  // requested ID does not override that rule.
  assert.equal(g.observeActor().result.message, marketCashierResponse(g.observe().selectedCheckoutId));
  assert.equal(g.observeActor().evaluation, undefined);
  g.execute(step('lookAround', { durationMs: 10 }));
  assert.equal(g.observeActor().result.message, undefined);
});

test('existing movement labels and visit annotations leave every observed choice in the same order', () => {
  const o = guard().observeActor();
  const choices = actorChoices(o);
  assert.deepEqual(choices.filter(c => c.action.type === 'walkToAnchor').map(c => c.action.anchorId), o.anchors.map(a => a.id));
  for (const anchor of o.anchors) {
    const choice = choices.find(c => c.action.anchorId === anchor.id);
    assert.match(choice.label, /눈앞의 통로/);
    assert.equal(choice.observedContext.label, anchor.label);
    assert.match(choice.effect, /north is up, east is right/);
    assert.equal(choice.targetCoordinates, undefined);
  }
  assert.deepEqual(actorChoices(o, { anchors: o.anchors.map(a => ({ id: a.id, visits: 10, neighbors: [] })), currentAnchor: null }).map(c => c.action), choices.map(c => c.action));
});

test('location question uses only the opened staff menu and returns the actual app response', () => {
  const { assertDecision } = require('../src/llmPolicy.ts');
  const { marketLocationResponse } = require('../../frontend/src/game/marketHelp.ts');
  const g = guard({environment:{employeeCount:1}});
  assert.equal(g.observeActor().locationChoices, undefined);
  const stationId = g.observe().environment.stationDetails.find(s=>s.kind==='employee').id;
  g.execute(walk(stationId));g.execute(step('talkToStaff',{stationId,choice:'open'}));
  assert.equal(actorChoices(g.observeActor()).some(x=>x.action.type==='askLocation'),false);
  assert.equal(actorChoices(g.observeActor()).some(x=>x.action.type==='openLocationHelp'),true);
  assert.throws(()=>g.execute(step('talkToStaff',{stationId,choice:'askLocation',objectiveId:'objective-1'})),/menu first/);
  g.execute(step('talkToStaff',{stationId,choice:'openLocationHelp'}));
  const observed=g.observeActor();assert.equal(observed.locationChoices.length,g.observe().objectives.length);
  const choice=actorChoices(observed).find(x=>x.action.type==='askLocation');
  assertDecision({action:choice.action,delayMs:100,reason:'직원에게 표시된 물건 위치 묻기'});
  g.execute(step('talkToStaff',{stationId,choice:'askLocation',objectiveId:choice.action.objectiveId}));
  assert.equal(g.observeActor().result.message,g.observe().staffLearningFeedback.message);
  assert.equal(g.observeActor().result.message,marketLocationResponse(g.observe().environment,'fresh'));
  assert.equal(g.observeActor().readObjectives,undefined);
  assert.equal(g.observeActor().visibleStations.length,0);
  g.execute(step('talkToStaff',{stationId,choice:'backToStaff'}));
  assert.equal(g.observeActor().locationChoices,undefined);
  assert.equal(actorChoices(g.observeActor()).some(x=>x.action.type==='askLocation'),false);
});
