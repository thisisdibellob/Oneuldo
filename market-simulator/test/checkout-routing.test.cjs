const test=require('node:test');
const assert=require('node:assert/strict');
require('../runtime.cjs');
const environmentApi=require('../../frontend/src/game/marketEnvironment.ts');
const navigation=require('../src/navigation.ts');
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot}=require('../../frontend/src/game/marketReplayTrace.ts');
const {TraceGuard}=require('../src/traceValidation.ts');
const {appendCheckoutCompletion}=require('../src/checkoutCompletion.ts');
function fixture(cashierCount=2,employeeCount=1){
  const config={seed:'checkout-routing-fixture',environment:{cashierCount,employeeCount}};
  const snapshot=createMarketReplaySnapshot(createMarketSession(config));
  const guard=new TraceGuard(snapshot,'test','1','test',true),steps=[];
  const append=(intent,reason,timeoutMs=120000)=>{
    const step={...intent,id:`system-${steps.length}`,reactionDelayMs:1,reason,timeoutMs};
    guard.execute(step,true);steps.push(step);
  };
  const run=()=>appendCheckoutCompletion(guard,'system-0','routing-test',append);
  return {guard,steps,snapshot,run};
}
test('a staffed checkout needs the app nearest-approach route as well as the offline sampled route',t=>{
  const f=fixture(),original=environmentApi.getMarketStationApproachPoint,spawn=f.snapshot.environment.spawn;
  t.mock.method(environmentApi,'getMarketStationApproachPoint',(env,station,reference,cashiers)=>{
    if(station==='checkout' && reference.x===spawn.x && reference.y===spawn.y)return null;
    return original(env,station,reference,cashiers);
  });
  const result=f.run();
  assert.equal(result.checkoutId,'checkout-2');
  assert.equal(f.steps.some(s=>s.type==='walkTo'&&s.target.stationId==='checkout'),false);
  assert.equal(f.steps.at(-3).type,'submitForReview');
});
test('no cashiers: skip a blocked first empty checkout before making any staff request',t=>{
  const f=fixture(0),original=environmentApi.getMarketStationApproachPoint;
  t.mock.method(environmentApi,'getMarketStationApproachPoint',(env,station,reference,cashiers)=>{
    // Only the newly staffed geometry is blocked; pre-staffing reachability is insufficient.
    if(station==='checkout'&&cashiers.checkout)return null;
    return original(env,station,reference,cashiers);
  });
  const result=f.run();
  assert.equal(result.checkoutId,'checkout-2');
  const requests=f.steps.filter(s=>s.type==='talkToStaff'&&s.choice==='requestCashier');
  assert.equal(requests.length,1);
  assert.equal(requests[0].checkoutId,'checkout-2');
  assert.equal(f.guard.observe().cashierAvailability.checkout,false);
  assert.deepEqual(result.cartAtStart,{});
});
test('try another employee when the first employee cannot lead to either checkout',t=>{
  const f=fixture(0,2),original=navigation.planWalk;
  const staff=f.snapshot.environment.stationDetails.filter(s=>s.kind==='employee');
  assert.equal(staff.length,2);
  const firstApproach=environmentApi.getMarketStationApproachPoint(f.snapshot.environment,staff[0].id,f.snapshot.environment.spawn,{checkout:false,'checkout-2':false});
  t.mock.method(navigation,'planWalk',(observation,station,random,speed)=>{
    if(station.startsWith('checkout')&&Math.hypot(observation.playerPosition.x-firstApproach.x,observation.playerPosition.y-firstApproach.y)<90)return null;
    return original(observation,station,random,speed);
  });
  f.run();
  const request=f.steps.find(s=>s.type==='talkToStaff'&&s.choice==='requestCashier');
  assert.equal(request.stationId,staff[1].id);
  assert.equal(f.steps.some(s=>s.type==='walkTo'&&s.target.stationId===staff[0].id),false);
});
test('no viable employee-to-checkout route fails without a speculative staff request or submission',t=>{
  const f=fixture(0),original=environmentApi.getMarketStationApproachPoint;
  t.mock.method(environmentApi,'getMarketStationApproachPoint',(env,station,reference,cashiers)=>{
    if(station.startsWith('checkout')&&cashiers[station])return null;
    return original(env,station,reference,cashiers);
  });
  assert.throws(f.run,/SYSTEM_CHECKOUT_UNAVAILABLE/);
  assert.equal(f.steps.some(s=>['walkTo','talkToStaff','checkout','submitForReview'].includes(s.type)),false);
  assert.equal(f.guard.observe().attempts,0);
  assert.deepEqual(f.guard.observe().cashierAvailability,{checkout:false,'checkout-2':false});
});
