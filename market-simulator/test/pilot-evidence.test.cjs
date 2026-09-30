const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
require('../runtime.cjs');
const {generateTrace: originalGenerateTrace} = require('../src/simulator.ts');
const generateTrace = options => originalGenerateTrace({mode:'stochastic',...options});
const {createMarketSession} = require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot} = require('../../frontend/src/game/marketReplayTrace.ts');
const {marketMission,buildMarketScenarioMission} = require('../../frontend/src/game/scenarios.ts');
const {confirmedExperience, measureRound, requirePersonalizedContinuation} = require('../pilot-evidence.cjs');

async function fixture() {
  const snapshot = createMarketReplaySnapshot(createMarketSession({seed:'pilot-contract'}),marketMission);
  const trace = await generateTrace({personaId:'mild-intellectual-disability-adult',seed:'pilot-evidence',snapshot});
  // Explicit unit-test double, never reported as actual app execution.
  const replay = {replayId:'unit-replay',traceId:trace.traceId,traceHash:createHash('sha256').update(JSON.stringify(trace)).digest('hex'),
    snapshotId:snapshot.snapshotId,sessionId:'unit-session',memberId:'unit-member',status:'completed',report:{acknowledged:true,
      completedSteps:trace.steps.map(s=>({id:s.id,type:s.type})),displacementViolations:0,inputViolations:0,
      startedAt:'2026-09-29T00:00:00Z',endedAt:'2026-09-29T00:05:00Z'}};
  const receipt = {sessionId:replay.sessionId,memberId:replay.memberId,eventCount:100,firstSequence:1,lastSequence:100,
    uniqueSequences:100,uniqueClientEvents:100,endEvents:1,timeReversals:0};
  return {trace,snapshot,replay,receipt};
}

test('planned memory is not copied and confirmed controls alone cross visits', async()=>{
  const {trace,snapshot,replay,receipt}=await fixture();
  const m=confirmedExperience(trace,snapshot,replay,receipt);
  assert.equal(m.provenance.source,'confirmed-app-replay');
  assert.deepEqual(m.memory.stations,[]); assert.deepEqual(m.memory.anchors,[]);
  const dragged=new Set(trace.steps.filter(s=>s.type==='dragProduct').map(s=>s.productId));
  assert.ok(m.memory.knownProducts.every(p=>dragged.has(p.id)));
  assert.equal(m.provenance.comprehensionMeasured,false);
  assert.equal(m.memory.objectives,undefined);
});
test('failed, partial or unpersisted replays cannot become experience',async()=>{
  const {trace,snapshot,replay,receipt}=await fixture();
  assert.throws(()=>confirmedExperience(trace,snapshot,{...replay,status:'failed'},receipt));
  assert.throws(()=>confirmedExperience(trace,snapshot,{...replay,report:{...replay.report,completedSteps:[]}},receipt));
  assert.throws(()=>confirmedExperience(trace,snapshot,replay,{...receipt,endEvents:0}));
  assert.throws(()=>confirmedExperience(trace,snapshot,replay,{...receipt,uniqueClientEvents:99}));
});
test('evidence cannot be mixed across accounts, sessions, traces, or snapshots',async()=>{
  const {trace,snapshot,replay,receipt}=await fixture();
  assert.throws(()=>confirmedExperience(trace,snapshot,replay,{...receipt,sessionId:'other'}));
  assert.throws(()=>confirmedExperience(trace,snapshot,{...replay,traceHash:'other'},receipt));
  const m=confirmedExperience(trace,snapshot,replay,receipt); m.provenance.memberId='other-arm';
  assert.throws(()=>confirmedExperience(trace,snapshot,replay,receipt,m));
});
test('movement timestamp reversals remain explicit warnings and cannot hide action or persistence failures',async()=>{
  const {trace,snapshot,replay,receipt}=await fixture();
  const anomaly={...receipt,timeReversals:1,timeReversalDetails:[{eventCode:'SHOP.MOVEMENT_SAMPLED',previousEventCode:'SHOP.MOVEMENT_SAMPLED',reversalMs:79}]};
  const options={allowNonMonotonicMovementTimestamps:true};
  assert.throws(()=>measureRound(trace,snapshot,replay,anomaly));
  const measurement=measureRound(trace,snapshot,replay,anomaly,options);
  assert.equal(measurement.temporalWarning.details[0].reversalMs,79);
  const experience=confirmedExperience(trace,snapshot,replay,anomaly,undefined,options);
  assert.equal(experience.provenance.temporalWarning,'NON_MONOTONIC_MOVEMENT_TIMESTAMPS');
  assert.equal(anomaly.timeReversals,1);
  assert.throws(()=>measureRound(trace,snapshot,replay,{...anomaly,timeReversalDetails:[]},options));
  assert.throws(()=>measureRound(trace,snapshot,replay,{...anomaly,timeReversalDetails:[{...anomaly.timeReversalDetails[0],eventCode:'SHOP.QUANTITY_CHANGED'}]},options));
  assert.throws(()=>measureRound(trace,snapshot,replay,{...anomaly,uniqueSequences:99},options));
});
test('absence of app submission yields unknown purchase, not planned success',async()=>{
  const {trace,snapshot,replay,receipt}=await fixture();
  assert.equal(measureRound(trace,snapshot,replay,receipt).purchase,null);
});
test('purchase measurement uses the actual submitted cart, including surplus and unrelated purchases',async()=>{
  const {trace,snapshot,replay,receipt}=await fixture();
  const cart=Object.fromEntries(snapshot.mission.objectives.map(o=>[o.productId,o.quantity]));
  replay.report.submission={source:'app-ui-before-submit',cart};
  assert.equal(measureRound(trace,snapshot,replay,receipt).purchase.exact,true);
  const first=snapshot.mission.objectives[0]; cart[first.productId]++;
  assert.equal(measureRound(trace,snapshot,replay,receipt).purchase.exact,false);
  assert.equal(measureRound(trace,snapshot,replay,receipt).purchase.objectives[0].excess,1);
  delete cart[first.productId];
  assert.equal(measureRound(trace,snapshot,replay,receipt).purchase.objectives[0].missing,first.quantity);
});
test('a single banana does not satisfy a bunch objective', async()=>{
  const {trace,snapshot,replay,receipt}=await fixture();
  // Generate a separate valid S01 trace so mission binding is not bypassed.
  const fixed=createMarketReplaySnapshot(createMarketSession({seed:'pilot-contract'}),buildMarketScenarioMission('S01'));
  const planned=await generateTrace({personaId:'mild-intellectual-disability-adult',seed:'pilot-evidence-units',snapshot:fixed});
  const executed={...replay,traceId:planned.traceId,traceHash:createHash('sha256').update(JSON.stringify(planned)).digest('hex'),snapshotId:fixed.snapshotId,
    report:{...replay.report,completedSteps:planned.steps.map(s=>({id:s.id,type:s.type})),submission:{source:'app-ui-before-submit',cart:{milk:1,'banana-single':1}}}};
  const result=measureRound(planned,fixed,executed,receipt).purchase;
  assert.equal(result.exact,false); assert.equal(result.offListUnits,1);
  assert.equal(result.objectives.find(o=>o.productId==='banana').missing,1);
});

test('queued/failed analysis and static fallback cannot authorize a personalized next round',()=>{
  const job={status:'READY',sessionId:'s',analysisId:'a'};
  const quest={source:'AI',analysisId:'a',profileId:'p',generationId:'g'};
  assert.equal(requirePersonalizedContinuation(job,quest,{sessionId:'s'}),true);
  for(const status of ['QUEUED','RUNNING','FAILED']) assert.throws(()=>requirePersonalizedContinuation({...job,status},quest,{sessionId:'s'}));
  assert.throws(()=>requirePersonalizedContinuation(job,{...quest,source:'STATIC'},{sessionId:'s'}));
  assert.throws(()=>requirePersonalizedContinuation(job,{...quest,analysisId:'old'},{sessionId:'s'}));
});
