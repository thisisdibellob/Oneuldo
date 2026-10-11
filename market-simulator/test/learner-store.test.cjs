const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
require('../runtime.cjs');
const {generateTrace}=require('../src/simulator.ts');
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot}=require('../../frontend/src/game/marketReplayTrace.ts');
const {getPersona}=require('../src/personas.ts');
const {marketMission}=require('../../frontend/src/game/scenarios.ts');
const {ActorLearningMemory,validateLearning,retrieveLearningEpisodes}=require('../src/actorLearning.ts');
const {createLearner,readLearner,recordLearnerRound,getLearnerExperience}=require('../learner-store.cjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function fixture(t,arm='B') {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'oneuldo-learner-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const snapshot=createMarketReplaySnapshot(createMarketSession({seed:'learner-archive'}),marketMission);
  const identity={learnerId:'jimin-b',memberId:'test-member',personaId:'mild-intellectual-disability-adult',
    personaVersion:getPersona('mild-intellectual-disability-adult').version,experimentId:'test-experiment',arm,model:'unit-test-model',policyVersion:'episodic-choice-v9'};
  let n=0;
  const trace=await generateTrace({personaId:identity.personaId,seed:7,snapshot,learnerIdentity:identity,
    llm:{model:'unit-test-model'},actorDecisionProvider:async()=>({action:++n===1?{type:'readList',durationMs:100}:
      n<32?{type:'pause',durationMs:100}:{type:'giveUp'},delayMs:100,reason:'명시적인 오프라인 테스트 대역'})});
  // Unit evidence fixtures only. These tests do not claim an actual app or database execution.
  const replay={replayId:'test-replay-1',sessionId:'test-session-1',memberId:'test-member',traceId:trace.traceId,
    traceHash:hash(trace),snapshotId:snapshot.snapshotId,status:'completed',report:{acknowledged:true,
      completedSteps:trace.steps.map(s=>({id:s.id,type:s.type})),displacementViolations:0,inputViolations:0}};
  const receipt={sessionId:replay.sessionId,memberId:replay.memberId,eventCount:100,firstSequence:1,lastSequence:100,
    uniqueSequences:100,uniqueClientEvents:100,endEvents:1,timeReversals:0};
  const {learnerFile}=createLearner({directory,identity});
  return {directory,learnerFile,identity,trace,snapshot,replay,receipt};
}
test('persistent memory retains every executed step and retrieves only bounded displayed-cue context',async t=>{
  const f=await fixture(t);
  assert.equal(getLearnerExperience(f.learnerFile),undefined);
  const first=recordLearnerRound(f);
  assert.equal(first.experience.learning.version,'2');
  assert.equal(first.experience.learning.episodes.length,f.trace.steps.length);
  assert.ok(first.experience.learning.episodes.length>24);
  assert.equal(first.experience.learning.episodes[1].action,'readList');
  assert.deepEqual(first.experience.learning.episodes[1].evidence,{sessionId:f.replay.sessionId,replayId:f.replay.replayId,
    traceId:f.trace.traceId,stepId:f.trace.steps[1].id,stepIndex:1});
  const trace=await generateTrace({personaId:f.identity.personaId,seed:8,snapshot:f.snapshot,learnerIdentity:f.identity,
    attentionExperience:first.experience,llm:{model:f.identity.model},
    actorDecisionProvider:async()=>({action:{type:'giveUp'},delayMs:100,reason:'다음 회차 테스트 종료'})});
  const replay={...f.replay,replayId:'test-replay-2',sessionId:'test-session-2',traceId:trace.traceId,traceHash:hash(trace),
    report:{...f.replay.report,completedSteps:trace.steps.map(s=>({id:s.id,type:s.type}))}};
  const second=recordLearnerRound({...f,trace,replay,receipt:{...f.receipt,sessionId:replay.sessionId}});
  assert.equal(second.experience.learning.episodes.length,f.trace.steps.length+trace.steps.length);
  assert.equal(readLearner(f.learnerFile).rounds.length,2);
  const actor=new ActorLearningMemory(getLearnerExperience(f.learnerFile,f.identity).learning);
  const state=actor.getState();
  assert.equal(state.previousExecutedExperience.length,12);
  assert.equal(state.previousExperienceRetrieval.archivedEpisodeCount,f.trace.steps.length+trace.steps.length);
  assert.equal(state.previousExperienceRetrieval.inferredMastery,false);
  assert.equal(state.mastery,undefined);
});
test('existing files are not reset and identical replay evidence is idempotent',async t=>{
  const f=await fixture(t);
  assert.throws(()=>createLearner({directory:f.directory,identity:f.identity}),/EEXIST/);
  recordLearnerRound(f); const saved=fs.readFileSync(f.learnerFile,'utf8');
  assert.equal(recordLearnerRound(f).idempotent,true);
  assert.equal(fs.readFileSync(f.learnerFile,'utf8'),saved);
  assert.throws(()=>recordLearnerRound({...f,receipt:{...f.receipt,eventCount:101,lastSequence:101,uniqueSequences:101,uniqueClientEvents:101}}),/Conflicting evidence/);
  assert.throws(()=>recordLearnerRound({...f,replay:{...f.replay,replayId:'another-replay'}}),/another replay/);
  assert.equal(readLearner(f.learnerFile).rounds.length,1);
});
test('every learner identity dimension is checked and unsuccessful app evidence cannot persist',async t=>{
  const f=await fixture(t);
  for(const key of ['learnerId','memberId','personaId','personaVersion','experimentId','model','policyVersion'])
    assert.throws(()=>getLearnerExperience(f.learnerFile,{...f.identity,[key]:'different'}),new RegExp(key));
  assert.throws(()=>getLearnerExperience(f.learnerFile,{...f.identity,arm:'A'}),/arm/);
  for(const key of ['personaId','personaVersion','model','policyVersion']) {
    // Keep the comparison identity eligible so recording reaches the cross-identity check.
    const identity={...f.identity,[key]:key==='personaId'?'careful-checker':'different'};
    const {learnerFile}=createLearner({directory:path.join(f.directory,key),identity});
    assert.throws(()=>recordLearnerRound({...f,learnerFile}),new RegExp(key));
  }
  assert.throws(()=>recordLearnerRound({...f,replay:{...f.replay,status:'failed'}}),/did not complete/);
  assert.throws(()=>recordLearnerRound({...f,receipt:{...f.receipt,endEvents:0}}),/not confirmed/);
  assert.equal(readLearner(f.learnerFile).rounds.length,0);
});
test('archive detects tampering and rejects caller-authored memory even with a recalculated checksum',async t=>{
  const f=await fixture(t);recordLearnerRound(f);
  const original=fs.readFileSync(f.learnerFile,'utf8'), modified=JSON.parse(original);
  modified.rounds[0].receipt.endEvents=0;
  fs.writeFileSync(f.learnerFile,JSON.stringify(modified));
  assert.throws(()=>readLearner(f.learnerFile),/integrity/);
  const {integrity,...body}=modified;modified.integrity=hash(body);
  fs.writeFileSync(f.learnerFile,JSON.stringify(modified));
  assert.throws(()=>readLearner(f.learnerFile),/integrity/);
  const injected=JSON.parse(original);injected.episodes=[{analysis:'correct answer'}];
  fs.writeFileSync(f.learnerFile,JSON.stringify(injected));
  assert.throws(()=>readLearner(f.learnerFile),/Invalid learner archive/);
  fs.writeFileSync(f.learnerFile,original);
  assert.equal(readLearner(f.learnerFile).rounds.length,1);
});
test('memory-free arm archives measurements without returning previous experiences',async t=>{
  const f=await fixture(t,'C');
  assert.equal(recordLearnerRound(f).experience,undefined);
  assert.equal(readLearner(f.learnerFile).rounds.length,1);
  assert.equal(getLearnerExperience(f.learnerFile),undefined);
});
test('retrieval uses displayed cues rather than success labels, and all archived episodes remain intact',()=>{
  const episodes=Array.from({length:60},(_,i)=>({action:'dragProduct',source:'executed-app-action',product:i===2?'우유 1팩':`상품 ${i}`,
    result:i===2?'선택 결과':'성공 정답 완벽함'}));
  const selected=retrieveLearningEpisodes(episodes,['우유 1팩']);
  assert.equal(selected.length,12);assert.ok(selected.some(e=>e.product==='우유 1팩'));
  assert.equal(episodes.length,60);assert.ok(selected.some(e=>e.product==='상품 59'));
  const withOtherResults=episodes.map(e=>({...e,result:'결과 표시 없음'}));
  assert.deepEqual(retrieveLearningEpisodes(withOtherResults,['우유 1팩']).map(e=>e.product),selected.map(e=>e.product));
});
test('v2 episodes require step provenance and forbid hidden evaluations or inferred abilities',async t=>{
  const f=await fixture(t);const {learning}=recordLearnerRound(f).experience;
  assert.doesNotThrow(()=>validateLearning(learning));
  assert.throws(()=>validateLearning({...learning,ability:0.9}));
  assert.throws(()=>validateLearning({...learning,episodes:[{...learning.episodes[0],analysis:'correct target'}]}));
  assert.throws(()=>validateLearning({...learning,episodes:[{...learning.episodes[0],evidence:undefined}]}));
});
test('a stale trace cannot silently skip the latest confirmed experience',async t=>{
  const f=await fixture(t);recordLearnerRound(f);
  const replay={...f.replay,replayId:'stale-replay',sessionId:'stale-session'};
  assert.throws(()=>recordLearnerRound({...f,replay,receipt:{...f.receipt,sessionId:replay.sessionId}}),/memory lineage/);
  assert.equal(readLearner(f.learnerFile).rounds.length,1);
});
test('displayed help is retained with its execution evidence without claiming understanding',async t=>{
  const f=await fixture(t);let calls=0;
  const trace=await generateTrace({personaId:f.identity.personaId,seed:12,snapshot:f.snapshot,learnerIdentity:f.identity,
    llm:{model:f.identity.model},actorDecisionProvider:async()=>({action:++calls===1?{type:'viewHelp'}:
      calls===2?{type:'closeView'}:{type:'giveUp'},delayMs:100,reason:'도움말 표시 경계 테스트'})});
  const replay={...f.replay,traceId:trace.traceId,traceHash:hash(trace),
    report:{...f.replay.report,completedSteps:trace.steps.map(s=>({id:s.id,type:s.type}))}};
  const {learning}=recordLearnerRound({...f,trace,replay}).experience;
  const help=learning.episodes.find(e=>e.action==='viewHelp');
  assert.ok(help.supportText.length>0);assert.match(help.result,/comprehension unknown/);
  assert.equal(help.evidence.stepId,trace.steps.find(s=>s.type==='viewHelp').id);
  assert.equal(learning.episodes.find(e=>e.action==='closeView').supportText,undefined);
  assert.ok(learning.episodes.every(e=>e.analysis===undefined&&e.mastery===undefined));
});
test('a live archive owner is respected and a crashed owner lock can be recovered',async t=>{
  const f=await fixture(t),lock=`${f.learnerFile}.lock`;
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token:'live-owner'}));
  assert.throws(()=>recordLearnerRound(f),/locked by a live process/);
  assert.equal(fs.existsSync(lock),true);fs.unlinkSync(lock);
  const dead=require('node:child_process').spawnSync(process.execPath,['-e','process.exit(0)']);
  assert.equal(dead.status,0);
  fs.writeFileSync(lock,JSON.stringify({pid:dead.pid,token:'crashed-owner'}));
  fs.writeFileSync(`${lock}.recover`,JSON.stringify({pid:dead.pid,token:'crashed-recovery'}));
  assert.equal(recordLearnerRound(f).idempotent,false);
  assert.equal(fs.existsSync(lock),false);assert.equal(fs.existsSync(`${lock}.recover`),false);
  assert.equal(readLearner(f.learnerFile).rounds.length,1);
});

test('assisted checkout archives only the executed actor prefix and carries no system controls into the next visit',async t=>{
  const f=await fixture(t);let calls=0;
  const trace=await generateTrace({personaId:f.identity.personaId,seed:'assisted-memory',snapshot:f.snapshot,learnerIdentity:f.identity,
    llm:{model:f.identity.model},actorDecisionProvider:async()=>({action:++calls===1?{type:'readList',durationMs:100}:
      {type:'lookAround',durationMs:100},delayMs:100,reason:'100회 관찰 경계의 오프라인 테스트 대역'})});
  const completion=trace.generation.systemCompletion;
  assert.ok(completion);assert.equal(calls,100);
  const first=trace.steps.findIndex(step=>step.id===completion.firstStepId);
  const replay={...f.replay,traceId:trace.traceId,traceHash:hash(trace),report:{...f.replay.report,
    completedSteps:trace.steps.map(step=>({id:step.id,type:step.type})),
    submission:{source:'app-ui-before-submit',cart:{}},systemCompletion:{...completion,observedCartAtStart:{},
      startedAt:'2026-10-01T00:01:00Z',source:'app-ui-before-system-completion'}}};
  const {experience}=recordLearnerRound({...f,trace,replay});
  assert.equal(experience.provenance.learningScope,'actor-prefix');
  assert.equal(experience.learning.episodes.length,first);
  assert.deepEqual(experience.memory.controlsPracticed,['readList','lookAround']);
  assert.ok(experience.learning.episodes.every(e=>e.evidence.stepIndex<first));
  const systemIds=new Set(trace.steps.slice(first).map(step=>step.id));
  assert.ok(experience.learning.episodes.every(e=>!systemIds.has(e.evidence.stepId)));
  assert.equal(readLearner(f.learnerFile).rounds.length,1);
  assert.deepEqual(getLearnerExperience(f.learnerFile,f.identity),experience);
  const next=await generateTrace({personaId:f.identity.personaId,seed:'after-assisted',snapshot:f.snapshot,learnerIdentity:f.identity,
    attentionExperience:experience,llm:{model:f.identity.model},
    actorDecisionProvider:async()=>({action:{type:'giveUp'},delayMs:100,reason:'다음 회차 연결 테스트'})});
  assert.equal(next.experienceMode,'revisit');
  assert.equal(next.generation.systemCompletion,undefined);
});

test('system completion cart or reported boundary tampering cannot enter a learner archive',async t=>{
  const f=await fixture(t);
  const trace=await generateTrace({personaId:f.identity.personaId,seed:'assisted-integrity',snapshot:f.snapshot,learnerIdentity:f.identity,
    llm:{model:f.identity.model},actorDecisionProvider:async()=>({action:{type:'lookAround',durationMs:100},delayMs:100,reason:'경계 검증 테스트'})});
  const completion=trace.generation.systemCompletion;
  const replay={...f.replay,traceId:trace.traceId,traceHash:hash(trace),report:{...f.replay.report,
    completedSteps:trace.steps.map(step=>({id:step.id,type:step.type})),submission:{source:'app-ui-before-submit',cart:{}}}};
  const record=changed=>recordLearnerRound({...f,trace,replay:changed});
  assert.throws(()=>record({...replay,report:{...replay.report,submission:undefined}}),/actual app submission/);
  assert.throws(()=>record({...replay,report:{...replay.report,submission:{source:'app-ui-before-submit',cart:{milk:1}}}}),/differs from the actor boundary/);
  const boundary={...completion,observedCartAtStart:{},startedAt:'2026-10-01T00:01:00Z',source:'app-ui-before-system-completion'};
  assert.throws(()=>record({...replay,report:{...replay.report,systemCompletion:{...boundary,firstStepId:trace.steps[1].id}}}),/boundary differs/);
  assert.throws(()=>record({...replay,report:{...replay.report,systemCompletion:{...boundary,observedCartAtStart:{milk:1}}}}),/Observed system completion cart/);
  assert.equal(readLearner(f.learnerFile).rounds.length,0);
  // Older evidence collectors may omit the optional observed boundary; the actual submitted cart is still required.
  assert.equal(record(replay).experience.provenance.learningScope,'actor-prefix');
});
