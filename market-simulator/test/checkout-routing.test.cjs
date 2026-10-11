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
  const guard=new TraceGuard(snapshot,'test','1','test',true,true),steps=[];
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
test('no cashiers: a blocked first recruitable counter fails before any speculative staff request',t=>{
  const f=fixture(0),original=environmentApi.getMarketStationApproachPoint;
  t.mock.method(environmentApi,'getMarketStationApproachPoint',(env,station,reference,cashiers)=>{
    // Only the newly staffed geometry is blocked; pre-staffing reachability is insufficient.
    if(station==='checkout'&&cashiers.checkout)return null;
    return original(env,station,reference,cashiers);
  });
  // The current app always recruits the first staffed lane; requesting the
  // second lane cannot bypass a blocked route to the actual recruited counter.
  assert.throws(f.run,/SYSTEM_CHECKOUT_UNAVAILABLE/);
  const requests=f.steps.filter(s=>s.type==='talkToStaff'&&s.choice==='requestCashier');
  assert.equal(requests.length,0);
  assert.equal(f.steps.some(s=>['walkTo','talkToStaff','checkout','submitForReview'].includes(s.type)),false);
  assert.deepEqual(f.guard.observe().cashierAvailability,{checkout:false,'checkout-2':false});
  assert.equal(f.guard.observe().attempts,0);
});
test('an unreachable staffed counter does not trigger a declined request for another empty counter',t=>{
  const f=fixture(1),original=environmentApi.getMarketStationApproachPoint;
  const staffed=Object.keys(f.guard.observe().cashierAvailability).find(id=>f.guard.observe().cashierAvailability[id]);
  const before={...f.guard.observe().cashierAvailability},score=f.guard.observe().score;
  t.mock.method(environmentApi,'getMarketStationApproachPoint',(env,station,reference,cashiers)=>{
    if(station===staffed)return null;
    return original(env,station,reference,cashiers);
  });
  assert.throws(f.run,/SYSTEM_CHECKOUT_UNAVAILABLE/);
  assert.equal(f.steps.some(s=>s.type==='talkToStaff'||s.type==='submitForReview'),false);
  assert.deepEqual(f.guard.observe().cashierAvailability,before);
  assert.equal(f.guard.observe().score,score);
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
