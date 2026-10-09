const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { TraceGuard } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { marketMission } = require('../../frontend/src/game/scenarios.ts');
const { createAttentionLlmPolicy } = require('../src/llmPolicy.ts');
const { getPersona } = require('../src/personas.ts');
const step = (type, extra = {}) => ({ id: type, type, reactionDelayMs: 1, timeoutMs: 120000, reason: 'fixture', ...extra });

test('entry guidance is delivered once, checkout guidance only at checkout, hidden target remains private', () => {
  const mission = { ...marketMission, briefing: ['상품의 규격을 비교해요.'], checkoutDialogue: ['이름을 확인해요.', '수량을 확인해요.'] };
  const guard = new TraceGuard(createMarketReplaySnapshot(createMarketSession({seed:'actor-instructions'}), mission));
  guard.execute(step('start'));
  assert.deepEqual(guard.observeActor().instructions.lines, [mission.description, ...mission.briefing]);
  assert.equal(guard.observeActor().readObjectives, undefined);
  guard.execute(step('lookAround', {durationMs:100}));
  assert.equal(guard.observeActor().instructions, undefined);
  guard.execute(step('walkTo', { target:{stationId:'checkout'}, movement:{style:'steady',speedMultiplier:1,motorSeed:'fixed'}}));
  guard.execute(step('checkout', {checkoutId:'checkout'}));
  assert.deepEqual(guard.observeActor().instructions, {phase:'checkout', lines:mission.checkoutDialogue});
  assert.equal(guard.observeActor().objectives, undefined);
});

test('a cashier request exposes the actual staff reply and displayed empty-counter buttons without pretending fulfillment', () => {
  const session = createMarketSession({ seed: 'visible-staff-reply', environment: {
    cashierCount: 1, kioskLane: 'none', employeeCount: { min: 1, max: 1 },
  } });
  const staffed = Object.keys(session.cashierAvailability).find(id => session.cashierAvailability[id]);
  const empty = Object.keys(session.cashierAvailability).find(id => !session.cashierAvailability[id]);
  const employee = session.environment.stationDetails.find(station => station.kind === 'employee').id;
  const guard = new TraceGuard(createMarketReplaySnapshot(session));
  guard.execute(step('start'));
  guard.execute(step('walkTo', { target: { stationId: employee }, movement: {
    style: 'steady', speedMultiplier: 1, motorSeed: 'staff-reply',
  } }));
  guard.execute(step('talkToStaff', { stationId: employee, choice: 'open' }));
  guard.execute(step('talkToStaff', { stationId: employee, choice: 'requestCashier', checkoutId: empty }));
  assert.equal(guard.observe().cashierRequestFeedback.accepted, false);
  const actor = guard.observeActor();
  assert.equal(actor.cashiers[staffed], true);
  assert.equal(actor.cashiers[empty], false);
  assert.equal(actor.activeStation, employee);
});

test('Ollama actor forwards displayed instruction text and authenticates without outputting secrets', async () => {
  const original = global.fetch;
  process.env.ACTOR_TEST_KEY='fixture-only-secret';
  const observation = new TraceGuard(createMarketReplaySnapshot(createMarketSession({seed:'actor-wire'}),marketMission)).observeActor();
  let request;
  global.fetch=async (url,init)=>{
    assert.equal(url.pathname,'/api/chat');
    assert.equal(init.headers.Authorization,'Bearer fixture-only-secret');
    request=JSON.parse(init.body);
    return new Response(JSON.stringify({message:{content:JSON.stringify({choiceId:JSON.parse(request.messages[1].content).availableChoices.find(c=>c.action.type==='readList').id,delayMs:300,reason:'목록 확인'})}}));
  };
  try {
    const decide=createAttentionLlmPolicy({baseUrl:'http://127.0.0.1:9999',model:'fixture',protocol:'ollama',apiKeyEnv:'ACTOR_TEST_KEY'});
    const result=await decide(observation,[],getPersona('mild-intellectual-disability-adult'),{});
    assert.deepEqual(JSON.parse(request.messages[1].content).observation.instructions,observation.instructions);
    assert.equal(request.think,false);assert.equal(request.stream,false);
    assert.equal(request.options.num_ctx,18432);
    assert.equal(JSON.stringify(result.exchange).includes('fixture-only-secret'),false);
    assert.equal(result.action.type,'readList');
  } finally {global.fetch=original;delete process.env.ACTOR_TEST_KEY;}
});

test('orientation is consumed once by an accepted observation, not by a proposed or rejected choice', () => {
  const {AttentionPolicy}=require('../src/attentionPolicy.ts');
  const policy=new AttentionPolicy(getPersona('mild-intellectual-disability-adult'),'orientation');
  const initial=policy.getState().orientationRemaining;
  const before={schemaVersion:'attention-observation-v1',sequence:0,phase:'shopping',view:'world',activeStation:null,
    visibleStations:[],anchors:[],products:[],shelf:null,listAvailable:true,cart:null,cashiers:{}};
  const decision={action:{type:'lookAround',durationMs:1000},delayMs:300,reason:'둘러본다'};
  assert.ok(initial>0);
  policy.acceptDecision(decision);
  assert.equal(policy.getState().orientationRemaining,initial);
  policy.record(decision,before,{...before,sequence:1,result:{accepted:true,actionType:'lookAround'}});
  assert.equal(policy.getState().orientationRemaining,initial-1);
  policy.acceptDecision(decision);
  policy.record(decision,before,{...before,sequence:2,result:{accepted:false,actionType:'lookAround'},lastActionError:'blocked'});
  assert.equal(policy.getState().orientationRemaining,initial-1);
});
