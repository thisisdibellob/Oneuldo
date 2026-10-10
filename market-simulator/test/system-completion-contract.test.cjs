const test=require('node:test');
const assert=require('node:assert/strict');
require('../runtime.cjs');
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {marketMission}=require('../../frontend/src/game/scenarios.ts');
const {createMarketReplaySnapshot,marketReplayTraceId,validateMarketReplayTrace,isMarketReplaySystemCompletionStep}=require('../../frontend/src/game/marketReplayTrace.ts');
const movement={style:'steady',speedMultiplier:.6,running:false,motorSeed:'system-completion-test',accelerationMs:200};
function fixture(cartAtStart={}){
  const snapshot=createMarketReplaySnapshot(createMarketSession({seed:'system-completion-contract'}),marketMission);
  const intents=[{type:'start'},...Array.from({length:100},()=>({type:'lookAround',durationMs:100})),
    {type:'viewCart'},{type:'closeView'},{type:'walkTo',target:{stationId:'checkout'},movement},
    {type:'checkout',checkoutId:'checkout'},{type:'submitForReview'},{type:'awaitReviewAccepted'},{type:'leave'}];
  const trace={traceSchemaVersion:'2',personaId:'contract-test',personaVersion:'1',seed:1,generationPolicy:'llm',policyVersion:'5',
    generation:{model:'test-model',reproducibility:'captured-trace',actorPolicyVersion:'episodic-choice-v9',
      systemCompletion:{reason:'action-limit',afterDecisions:100,actionLimit:100,firstStepId:'s101',checkoutId:'checkout',cartAtStart}},
    target:{snapshotId:snapshot.snapshotId,missionId:marketMission.id,completionMode:'ai-review'},
    steps:intents.map((s,i)=>({...s,id:`s${i}`,reactionDelayMs:0,timeoutMs:1000,reason:'structural contract fixture'}))};
  trace.traceId=marketReplayTraceId(trace);
  return {trace,snapshot};
}
function invalid(mutate){
  const f=fixture();mutate(f.trace);f.trace.traceId=marketReplayTraceId(f.trace);
  assert.equal(validateMarketReplayTrace(f.trace,f.snapshot).valid,false);
  assert.equal(isMarketReplaySystemCompletionStep(f.trace,f.trace.generation.systemCompletion?.firstStepId??'s101'),false);
}
test('v9 system checkout accepts empty/partial baskets and exposes only the controller suffix',()=>{
  for(const cart of [{},{milk:1,banana:2}]){
    const {trace,snapshot}=fixture(cart);
    assert.deepEqual(validateMarketReplayTrace(trace,snapshot),{valid:true,errors:[]});
    assert.equal(isMarketReplaySystemCompletionStep(trace,'s100'),false);
    assert.equal(isMarketReplaySystemCompletionStep(trace,'s101'),true);
    assert.equal(isMarketReplaySystemCompletionStep(trace,trace.steps.at(-1).id),true);
    assert.equal(isMarketReplaySystemCompletionStep(trace,'unknown'),false);
  }
});
test('system checkout requires v9, exact action limit, valid cart and distinct provenance',()=>{
  for(const version of ['episodic-choice-v6','episodic-choice-v7','episodic-choice-v8',undefined])invalid(t=>t.generation.actorPolicyVersion=version);
  for(const key of ['afterDecisions','actionLimit'])for(const value of [99,101,'100',100.5])invalid(t=>t.generation.systemCompletion[key]=value);
  for(const cart of [null,[],{milk:0},{milk:-1},{milk:1.5},{milk:'1'},{'':1},{milk:Infinity},{milk:Number.MAX_SAFE_INTEGER+1}])invalid(t=>t.generation.systemCompletion.cartAtStart=cart);
  invalid(t=>t.generationPolicy='stochastic');
  invalid(t=>t.generation.controlledStop={reason:'action-limit',afterDecisions:100,actionLimit:100});
  invalid(t=>t.generation.systemCompletion.firstStepId='s100');
  invalid(t=>t.generation.systemCompletion.firstStepId=t.steps.at(-2).id);
  invalid(t=>t.generation.systemCompletion.firstStepId='missing');
  invalid(t=>{t.steps.at(-3).type='giveUp';t.steps.at(-2).type='skipRating';});
});
test('controller cannot add/return products or visit arbitrary stations',()=>{
  for(const intent of [
    {type:'walkTo',target:{stationId:'fresh'},movement},
    {type:'walkTo',target:{stationId:'checkout-2'},movement},
    {type:'checkout',checkoutId:'checkout-2'},
    {type:'openShelf',stationId:'fresh'},
    {type:'removeProduct',productId:'milk',quantity:1},
    {type:'talkToStaff',stationId:'staff:employee-1',choice:'returnProduct',productId:'milk',quantity:1},
    {type:'talkToStaff',stationId:'staff:employee-1',choice:'requestCashier',checkoutId:'checkout-2'},
    {type:'readList',durationMs:100},
  ])invalid(t=>{t.steps[101]={...intent,id:'s101',reactionDelayMs:0,timeoutMs:1000,reason:'forbidden controller action'};});
});
test('only real employees may be used to staff the selected checkout',()=>{
  const {trace,snapshot}=fixture();
  const employee=snapshot.environment.stationDetails.find(s=>s.kind==='employee');
  assert.ok(employee);
  trace.steps.splice(103,0,...[
    {type:'walkTo',target:{stationId:employee.id},movement},
    {type:'talkToStaff',stationId:employee.id,choice:'open'},
    {type:'talkToStaff',stationId:employee.id,choice:'requestCashier',checkoutId:'checkout'},
    {type:'closeStation'},
  ].map((s,i)=>({...s,id:`staff-${i}`,reactionDelayMs:0,timeoutMs:1000,reason:'system cashier setup'})));
  trace.traceId=marketReplayTraceId(trace);
  assert.equal(validateMarketReplayTrace(trace,snapshot).valid,true);
  trace.steps[103].target.stationId='staff:not-in-this-environment';
  trace.traceId=marketReplayTraceId(trace);
  assert.equal(validateMarketReplayTrace(trace,snapshot).valid,false);
});
