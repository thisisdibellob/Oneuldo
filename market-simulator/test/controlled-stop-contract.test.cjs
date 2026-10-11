const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createHash} = require('node:crypto');
require('../runtime.cjs');
const {generateTrace} = require('../src/simulator.ts');
const {createMarketSession} = require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot,marketReplayTraceId,validateMarketReplayTrace} = require('../../frontend/src/game/marketReplayTrace.ts');
const {marketMission} = require('../../frontend/src/game/scenarios.ts');
const {getPersona} = require('../src/personas.ts');
const {verifyExecution,confirmedExperience,measureRound} = require('../pilot-evidence.cjs');
const {createLearner,readLearner,recordLearnerRound} = require('../learner-store.cjs');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function fixture(t,actorPolicyVersion='episodic-choice-v7') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'market-controlled-stop-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const snapshot = createMarketReplaySnapshot(createMarketSession({seed:'controlled-stop-contract'}),marketMission);
  const identity = {learnerId:'test-learner',memberId:'test-member',personaId:'mild-intellectual-disability-adult',
    personaVersion:getPersona('mild-intellectual-disability-adult').version,experimentId:'test-experiment',arm:'B',
    model:'test-model',policyVersion:actorPolicyVersion};
  const trace = await generateTrace({personaId:identity.personaId,seed:1,snapshot,llm:{model:identity.model},
    actorDecisionProvider:async()=>({action:{type:'giveUp'},delayMs:100,reason:'계약 검증용 자발적 종료'})});
  trace.generation.actorPolicyVersion = identity.policyVersion;
  trace.generation.learnerIdentity = identity;
  if(actorPolicyVersion==='episodic-choice-v8'){
    trace.steps.splice(1,0,...Array.from({length:100},(_,i)=>({id:`observation-${i+1}`,type:'lookAround',
      reactionDelayMs:100,timeoutMs:1000,durationMs:100,reason:'계약 검증용 주변 관찰'})));
    trace.generation.controlledStop = {reason:'action-limit',afterDecisions:100,actionLimit:100};
  }else trace.generation.controlledStop = {reason:'persistent-stagnation',afterDecisions:36,reviewCount:3};
  trace.traceId = marketReplayTraceId(trace);
  // Structural unit evidence, never represented as an actual app/database execution.
  const replay = {replayId:'test-replay',sessionId:'test-session',memberId:identity.memberId,traceId:trace.traceId,
    traceHash:hash(trace),snapshotId:snapshot.snapshotId,status:'completed',report:{acknowledged:true,
      completedSteps:trace.steps.map(s=>({id:s.id,type:s.type})),displacementViolations:0,inputViolations:0,
      startedAt:'2026-10-01T00:00:00Z',endedAt:'2026-10-01T00:01:00Z'}};
  const receipt = {sessionId:replay.sessionId,memberId:replay.memberId,eventCount:10,firstSequence:1,lastSequence:10,
    uniqueSequences:10,uniqueClientEvents:10,endEvents:1,timeReversals:0};
  const {learnerFile} = createLearner({directory,identity});
  return {trace,snapshot,replay,receipt,learnerFile};
}

test('controlled stop has a bounded explicit schema and can only end through giveUp',async t=>{
  const f = await fixture(t);
  assert.equal(validateMarketReplayTrace(f.trace,f.snapshot).valid,true);
  const invalid = mutate => {
    const trace = structuredClone(f.trace); mutate(trace); trace.traceId = marketReplayTraceId(trace);
    assert.equal(validateMarketReplayTrace(trace,f.snapshot).valid,false);
  };
  for (const metadata of [null,{}, {reason:'persistent-stagnation',afterDecisions:0,reviewCount:1},
    {reason:'persistent-stagnation',afterDecisions:1,reviewCount:2},
    {reason:'persistent-stagnation',afterDecisions:36.5,reviewCount:3},
    {reason:'persistent-stagnation',afterDecisions:36,reviewCount:0},
    {reason:'persistent-stagnation',afterDecisions:36,reviewCount:3,personaFailure:true},
    {reason:'not-an-actor-success',afterDecisions:36,reviewCount:3}]) invalid(trace=>trace.generation.controlledStop=metadata);
  invalid(trace=>trace.generation.actorPolicyVersion='episodic-choice-v5');
  invalid(trace=>trace.generationPolicy='stochastic');
  invalid(trace=>{
    trace.steps.at(-3).type='submitForReview';
    trace.steps.at(-2).type='awaitReviewAccepted';
  });
});

test('v8 action-limit stop requires exactly 100 decisions and an explicit system terminal tail',async t=>{
  const f = await fixture(t,'episodic-choice-v8');
  assert.equal(f.trace.steps.length,104);
  assert.equal(validateMarketReplayTrace(f.trace,f.snapshot).valid,true);
  const invalid = (mutate,message) => {
    const trace=structuredClone(f.trace); mutate(trace); trace.traceId=marketReplayTraceId(trace);
    assert.equal(validateMarketReplayTrace(trace,f.snapshot).valid,false,message);
  };
  for(const metadata of [null,{},
    {reason:'action-limit',afterDecisions:99,actionLimit:100},
    {reason:'action-limit',afterDecisions:101,actionLimit:100},
    {reason:'action-limit',afterDecisions:100.5,actionLimit:100},
    {reason:'action-limit',afterDecisions:'100',actionLimit:100},
    {reason:'action-limit',afterDecisions:100,actionLimit:99},
    {reason:'action-limit',afterDecisions:100},
    {reason:'action-limit',afterDecisions:100,actionLimit:100,reviewCount:3},
    {reason:'action-limit',afterDecisions:100,actionLimit:100,personaFailure:true},
    {reason:'persistent-stagnation',afterDecisions:100,reviewCount:3},
    {reason:'unrecognized-limit',afterDecisions:100,actionLimit:100}]){
    invalid(trace=>trace.generation.controlledStop=metadata,JSON.stringify(metadata));
  }
  for(const version of ['episodic-choice-v6','episodic-choice-v7',undefined])invalid(trace=>{
    if(version===undefined)delete trace.generation.actorPolicyVersion;
    else trace.generation.actorPolicyVersion=version;
  },`action-limit is not a ${version} contract`);
  invalid(trace=>trace.generationPolicy='stochastic');
  invalid(trace=>trace.policyVersion='4');
  invalid(trace=>trace.steps.splice(1,1),'99 actor steps cannot claim 100 decisions');
  invalid(trace=>{trace.steps.at(-3).type='submitForReview';trace.steps.at(-2).type='awaitReviewAccepted';});
  invalid(trace=>{trace.steps.at(-2).type='lookAround';trace.steps.at(-2).durationMs=100;});
  invalid(trace=>{trace.steps[50]={...trace.steps.at(-3),id:'premature-give-up'};});
  invalid(trace=>{trace.steps[50]={...trace.steps.at(-3),id:'premature-submit',type:'submitForReview'};});
  // Automatic view closing can make the step count larger than the accepted actor decision count.
  const expanded=structuredClone(f.trace);
  expanded.steps.splice(2,0,{id:'automatic-close',type:'closeView',reactionDelayMs:0,timeoutMs:1000,reason:'관찰 전 열린 창 닫기'});
  expanded.traceId=marketReplayTraceId(expanded);
  assert.equal(validateMarketReplayTrace(expanded,f.snapshot).valid,true);
});

test('v6 and v7 completed UI evidence remains auditable without becoming learning or purchase success',async t=>{
  for(const version of ['episodic-choice-v6','episodic-choice-v7'])await t.test(version,async t=>{
    const f = await fixture(t,version);
    assert.equal(validateMarketReplayTrace(f.trace,f.snapshot).valid,true);
    assert.equal(verifyExecution(f.trace,f.snapshot,f.replay,f.receipt),true);
    assert.throws(()=>confirmedExperience(f.trace,f.snapshot,f.replay,f.receipt),{code:'SYSTEM_CONTROLLED_STOP_EXCLUDED'});
    assert.throws(()=>recordLearnerRound(f),{code:'SYSTEM_CONTROLLED_STOP_EXCLUDED'});
    assert.equal(readLearner(f.learnerFile).rounds.length,0);
    const measurement = measureRound(f.trace,f.snapshot,f.replay,f.receipt);
    assert.equal(measurement.outcome,'system-intervention');
    assert.equal(measurement.learningEligible,false);
    assert.equal(measurement.performanceEligible,false);
    assert.equal(measurement.purchase,null);
    assert.deepEqual(measurement.intervention,f.trace.generation.controlledStop);
    assert.throws(()=>measureRound(f.trace,f.snapshot,{...f.replay,report:{...f.replay.report,
      submission:{source:'app-ui-before-submit',cart:{}}}},f.receipt),/cannot have submission evidence/);
  });
});

test('pre-watchdog traces remain readable but cannot claim controlled-stop provenance; unknown versions are rejected',async t=>{
  const f = await fixture(t);
  for(const version of ['episodic-choice-v1','episodic-choice-v2','episodic-choice-v3','episodic-choice-v4','episodic-choice-v5',undefined]){
    const trace=structuredClone(f.trace);
    if(version===undefined)delete trace.generation.actorPolicyVersion;
    else trace.generation.actorPolicyVersion=version;
    trace.traceId=marketReplayTraceId(trace);
    assert.equal(validateMarketReplayTrace(trace,f.snapshot).valid,false,`${version} must not authenticate a controlled stop`);
    delete trace.generation.controlledStop;
    trace.traceId=marketReplayTraceId(trace);
    assert.equal(validateMarketReplayTrace(trace,f.snapshot).valid,true,`${version} legacy voluntary exit remains valid`);
  }
  for(const hasControlledStop of [true,false]){
    const trace=structuredClone(f.trace);
    trace.generation.actorPolicyVersion='episodic-choice-v99';
    if(!hasControlledStop)delete trace.generation.controlledStop;
    trace.traceId=marketReplayTraceId(trace);
    assert.equal(validateMarketReplayTrace(trace,f.snapshot).valid,false,'Unknown policy versions require explicit support');
  }
});

test('v8 voluntary termination does not require action-limit metadata',async t=>{
  const f=await fixture(t,'episodic-choice-v8');
  delete f.trace.generation.controlledStop;
  f.trace.steps.splice(1,100);
  f.trace.traceId=marketReplayTraceId(f.trace);
  assert.equal(f.trace.steps.length,4);
  assert.equal(validateMarketReplayTrace(f.trace,f.snapshot).valid,true);
});

test('a voluntary giveUp remains an actor action and can still become confirmed experience',async t=>{
  const f = await fixture(t);
  delete f.trace.generation.controlledStop;
  delete f.trace.generation.learnerIdentity;
  f.trace.traceId=marketReplayTraceId(f.trace); f.replay.traceId=f.trace.traceId; f.replay.traceHash=hash(f.trace);
  const experience = confirmedExperience(f.trace,f.snapshot,f.replay,f.receipt);
  assert.ok(experience.memory.controlsPracticed.includes('giveUp'));
  const measurement=measureRound(f.trace,f.snapshot,f.replay,f.receipt);
  assert.equal(measurement.outcome,undefined);
  assert.equal(measurement.performanceEligible,undefined);
});

test('recomputed archive checksums cannot turn a controlled stop into learner memory',async t=>{
  const f = await fixture(t), state = readLearner(f.learnerFile);
  const evidence = {trace:f.trace,snapshot:f.snapshot,replay:f.replay,receipt:f.receipt,options:{}};
  state.rounds.push({...evidence,evidenceHash:hash(evidence)});
  state.integrity=hash({version:state.version,identity:state.identity,rounds:state.rounds});
  fs.writeFileSync(f.learnerFile,JSON.stringify(state));
  assert.throws(()=>readLearner(f.learnerFile),{code:'SYSTEM_CONTROLLED_STOP_EXCLUDED'});
});
