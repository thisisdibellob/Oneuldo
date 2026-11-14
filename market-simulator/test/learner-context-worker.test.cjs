'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
require('../runtime.cjs');
const store=require('../learner-store.cjs'),{LearnerContextLoader}=require('../learner-context-loader.cjs');
const {createService}=require('../server.cjs');
const {generateTrace}=require('../src/simulator.ts'),{getPersona}=require('../src/personas.ts');
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot,marketReplayFingerprint}=require('../../frontend/src/game/marketReplayTrace.ts');
const {marketMission}=require('../../frontend/src/game/scenarios.ts');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function empty(t,arm='A',v11=false){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'oneuldo-pending-context-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const persona=getPersona(v11?'adult-minjae-unit-support-research-v2':'mild-intellectual-disability-adult');
 const identity={learnerId:'context',memberId:'isolated-unit-member',personaId:persona.id,personaVersion:persona.version,
  experimentId:'pending-memory-init-unit-only',arm,model:v11?'gpt-6-luna':'unit-test-model',policyVersion:v11?'episodic-choice-v11':'episodic-choice-v9',...(v11?{reasoningEffort:'low'}:{})};
 return {directory,identity,...store.createLearner({directory,identity})};
}
async function recordedFixture(t,arm='A'){
 const f=empty(t,arm);const snapshot=createMarketReplaySnapshot(createMarketSession({seed:'pending-context-fixture'}),marketMission);let n=0;
 const trace=await generateTrace({personaId:f.identity.personaId,seed:1,snapshot,learnerIdentity:f.identity,llm:{model:f.identity.model},
  actorDecisionProvider:async()=>({action:++n===1?{type:'readList',durationMs:100}:{type:'giveUp'},delayMs:100,reason:'Offline unit evidence only; no app play'})});
 const replay={replayId:'fixture-replay',sessionId:'fixture-session',memberId:f.identity.memberId,traceId:trace.traceId,traceHash:hash(trace),snapshotId:snapshot.snapshotId,status:'completed',report:{acknowledged:true,completedSteps:trace.steps.map(s=>({id:s.id,type:s.type})),displacementViolations:0,inputViolations:0}};
 const receipt={sessionId:replay.sessionId,memberId:f.identity.memberId,eventCount:100,firstSequence:1,lastSequence:100,uniqueSequences:100,uniqueClientEvents:100,endEvents:1,timeReversals:0};
 store.recordLearnerRound({...f,trace,snapshot,replay,receipt});return f;
}
test('one fresh complete file read supplies the same verified identity and experience',async t=>{
 const f=await recordedFixture(t),expected=store.getLearnerExperience(f.learnerFile,f.identity),raw=fs.readFileSync(f.learnerFile);
 const original=fs.readFileSync;let reads=0,context;
 fs.readFileSync=function(file,...rest){if(path.resolve(String(file))===f.learnerFile)reads++;return original.call(this,file,...rest);};
 try{context=store.readVerifiedLearnerContext(f.learnerFile);}finally{fs.readFileSync=original;}
 assert.equal(reads,1);assert.deepEqual(context.identity,f.identity);assert.deepEqual(context.experience,expected);
 assert.equal(context.roundCount,1);assert.equal(context.source.sha256,createHash('sha256').update(raw).digest('hex'));
 const loader=new LearnerContextLoader();t.after(()=>loader.close());const worker=await loader.read(f.learnerFile);await loader.assertCurrent(worker);
 assert.deepEqual(worker,context);assert.equal(marketReplayFingerprint(worker.experience),marketReplayFingerprint(expected));
 assert.deepEqual(fs.readFileSync(f.learnerFile),raw);
});
test('public and worker loaders reject the same integrity receipt duplicate and lineage defects',async t=>{
 const f=await recordedFixture(t),original=fs.readFileSync(f.learnerFile,'utf8'),base=JSON.parse(original),loader=new LearnerContextLoader();t.after(()=>loader.close());
 const corruptions=[s=>{s.identity.memberId='changed';},s=>{s.rounds[0].receipt.endEvents=0;s.rounds[0].evidenceHash=hash(Object.fromEntries(Object.entries(s.rounds[0]).filter(([key])=>key!=='evidenceHash')));s.integrity=hash({version:s.version,identity:s.identity,rounds:s.rounds});},s=>{s.rounds.push(structuredClone(s.rounds[0]));s.integrity=hash({version:s.version,identity:s.identity,rounds:s.rounds});},s=>{s.rounds[0].trace.generation.experienceFingerprint='changed';s.rounds[0].evidenceHash=hash(Object.fromEntries(Object.entries(s.rounds[0]).filter(([key])=>key!=='evidenceHash')));s.integrity=hash({version:s.version,identity:s.identity,rounds:s.rounds});}];
 for(const corrupt of corruptions){const state=structuredClone(base);corrupt(state);fs.writeFileSync(f.learnerFile,JSON.stringify(state));let expected;
  try{store.getLearnerExperience(f.learnerFile);}catch(error){expected=error.message;}assert.ok(expected);await assert.rejects(loader.read(f.learnerFile),error=>error.message===expected);}
 fs.writeFileSync(f.learnerFile,original);
});
test('memory-free arm still validates all evidence and omits only the actor experience',async t=>{
 const f=await recordedFixture(t,'C'),loader=new LearnerContextLoader();t.after(()=>loader.close());const context=await loader.read(f.learnerFile);
 assert.equal(context.roundCount,1);assert.equal(context.experience,undefined);const state=JSON.parse(fs.readFileSync(f.learnerFile));state.rounds[0].receipt.endEvents=0;fs.writeFileSync(f.learnerFile,JSON.stringify(state));await assert.rejects(loader.read(f.learnerFile),/integrity/);
});
test('archive edits after verification and closing a pending loader never reuse an earlier result',async t=>{
 const f=empty(t),loader=new LearnerContextLoader();const context=await loader.read(f.learnerFile);fs.appendFileSync(f.learnerFile,'\n');
 await assert.rejects(loader.assertCurrent(context),/changed/);const pending=loader.read(f.learnerFile),closed=loader.close();
 await assert.rejects(pending,/closed/);await closed;assert.equal(loader.pending.size,0);await assert.rejects(loader.read(f.learnerFile),/closed/);
});
function bridgeFixture(snapshot,memberId,mutation){
 let value=snapshot,scheduled=false;const tab={tabId:'tab',epoch:'epoch',appOrigin:'http://localhost:1',backendOrigin:'http://localhost:2',memberId,targetEnv:'local',connectedAt:'unit-time',ready:true,visible:true,snapshotId:snapshot.snapshotId,questInstanceId:null,sessionId:'original-app-session',replayId:null};let connected=true;
 return {tab,get snapshotValue(){return value;},set snapshotValue(next){value=next;tab.snapshotId=next.snapshotId;},disconnect(){connected=false;},start:async()=>({}),close:async()=>{},list:()=>({sessions:connected?[{...tab}]:[]}),snapshot:()=>{
  if(!connected||!tab.ready)throw new Error('A connected, authenticated mission snapshot is required.');
  if(mutation&&!scheduled){scheduled=true;setImmediate(mutation);}
  return structuredClone(value);
 }};
}
for(const kind of ['disconnect','member','epoch','session','snapshot','briefing','active-replay'])test('async begin rejects '+kind+' changes before any actor call or journal',async t=>{
 const f=empty(t,'A',true),snapshot=createMarketReplaySnapshot(createMarketSession({seed:'binding-before'}));let bridge;
 bridge=bridgeFixture(snapshot,f.identity.memberId,()=>{
  if(kind==='disconnect')bridge.disconnect();else if(kind==='snapshot')bridge.snapshotValue=createMarketReplaySnapshot(createMarketSession({seed:'binding-after'}));
  else if(kind==='briefing')bridge.tab.ready=false;else if(kind==='active-replay')bridge.tab.replayId='another-replay';else bridge.tab[kind==='member'?'memberId':kind==='session'?'sessionId':'epoch']='changed';
 });
 let calls=0;const service=createService({bridge,generateTrace:async()=>{calls++;throw new Error('Unit actor must not be called');}});t.after(()=>service.close());
 const outputPath=path.join(f.directory,'must-not-exist.json');
 await assert.rejects(service.invokeTool('begin_actor_plan',{personaId:f.identity.personaId,seed:'binding',tabId:'tab',learnerFile:f.learnerFile,actorPolicyVersion:'episodic-choice-v11',maxActions:200,outputPath}),/changed|cross test accounts|connected|not ready/);
 assert.equal(calls,0);assert.equal(fs.existsSync(outputPath),false);assert.equal(fs.existsSync(outputPath+'.generation'),false);
});
test('a stable begin preserves original identity memory policy and 200-choice limit',async t=>{
 const f=empty(t,'A',true),snapshot=createMarketReplaySnapshot(createMarketSession({seed:'stable-binding'})),bridge=bridgeFixture(snapshot,f.identity.memberId);let captured;
 const service=createService({bridge,generateTrace:async options=>{captured=options;throw new Error('Offline stop after context capture; no model call');}});t.after(()=>service.close());
 await service.invokeTool('begin_actor_plan',{personaId:f.identity.personaId,seed:'stable',tabId:'tab',learnerFile:f.learnerFile,actorPolicyVersion:'episodic-choice-v11',maxActions:200,outputPath:path.join(f.directory,'technical-only.json')});
 assert.deepEqual(captured.learnerIdentity,f.identity);assert.equal(captured.attentionExperience,undefined);assert.equal(captured.actorPolicyVersion,'episodic-choice-v11');assert.equal(captured.maxActions,200);assert.equal(captured.llm.model,'gpt-6-luna');
});
