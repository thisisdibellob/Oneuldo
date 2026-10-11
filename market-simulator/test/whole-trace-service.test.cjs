'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
require('../runtime.cjs');
const {createService,definitions}=require('../server.cjs');
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot,canonicalMarketReplayJson}=require('../../frontend/src/game/marketReplayTrace.ts');
const {marketMission}=require('../../frontend/src/game/scenarios.ts');
const {getPersona}=require('../src/personas.ts');
const {createLearner,readLearner}=require('../learner-store.cjs');
const {createTrial,readTrial}=require('../learning-trial.cjs');

function setup(t,options={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'oneuldo-whole-trace-service-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const snapshot=createMarketReplaySnapshot(createMarketSession({seed:'whole-service-fixture',difficulty:'exact',
    objectives:marketMission.objectives.map(({productId,quantity})=>({productId,quantity,match:'exact'}))}),marketMission);
  const service=createService({...options,generateTrace:()=>{throw new Error('Provider generation must not run in native whole-trace mode');}});
  t.after(()=>service.close());
  return {directory,snapshot,service};
}
const state=(activity,task,triggerCueRefs)=>({activity,task,heldGoalIds:[],uncertainGoalIds:[],orientation:'unfamiliar',triggerCueRefs});
function quit(requestId){return {candidateVersion:'3',requestId,decisions:[{action:{type:'giveUp'},delayMs:100,
  reason:'이번 장보기를 마친다',basis:{intent:'finish',cueRefs:['persona:goal']},actorState:state('finish','이번 장보기를 마친다',['persona:goal'])}]};}
function rest(){return {action:{type:'pause'},delayMs:1,reason:'현재 화면에서 잠시 기다린다',
  basis:{intent:'rest',cueRefs:['phase:shopping']},actorState:state('rest','현재 화면에서 잠시 기다린다',['phase:shopping'])};}
function invalidSelection(requestId){return {candidateVersion:'3',requestId,decisions:[
  {action:{type:'add',productId:'unobserved-product',quantity:1},delayMs:100,reason:'아직 본 적 없는 상품을 담으려 한다',
    basis:{intent:'interest',cueRefs:['product:unobserved-product']},actorState:state('interest','아직 본 적 없는 상품을 담으려 한다',['product:unobserved-product'])},
  ...quit(requestId).decisions,
]};}
async function prepare(f,extra={}){return f.service.invokeTool('prepare_whole_trace',Object.fromEntries(Object.entries({
  personaId:'careful-checker',seed:'whole-service-plan',snapshot:f.snapshot,outputPath:path.join(f.directory,'trace.json'),...extra,
}).filter(([,value])=>value!==undefined)));}

test('whole-trace MCP tools prepare one complete candidate and save without provider calls or per-action RPC',async t=>{
  const f=setup(t),original=global.fetch;global.fetch=()=>{throw new Error('Unexpected remote request');};t.after(()=>{global.fetch=original;});
  for(const name of ['prepare_whole_trace','submit_whole_trace','repair_whole_trace','whole_trace_status','create_whole_trace_learner']) assert.ok(definitions.some(tool=>tool.name===name));
  const prepared=await prepare(f);assert.equal(typeof prepared.requestId,'string');assert.ok(prepared.bundle);
  const expectedSnapshot=structuredClone(f.snapshot);f.snapshot.initialStock.changed=10;
  const candidateFilePath=path.join(f.directory,'candidate.json');fs.writeFileSync(candidateFilePath,JSON.stringify(quit(prepared.requestId)));
  const saved=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidateFilePath});
  const trace=JSON.parse(fs.readFileSync(saved.outputPath,'utf8'));
  assert.equal(trace.generation.model,'gpt-6-luna');assert.equal(trace.generation.reasoningEffort,'low');
  assert.equal(trace.generation.actorPolicyVersion,'whole-trace-v3');assert.equal(trace.generation.planningMode,'whole-trace');
  assert.equal(trace.generation.observationScope,'whole-world');
  assert.equal(trace.generation.actorKnowledgeScope,'observed-and-remembered');
  assert.equal(trace.personaVersion,getPersona('careful-checker').version);
  assert.deepEqual(trace.steps.map(step=>step.type),['start','giveUp','skipRating','leave']);
  assert.equal(saved.knowledgeAuditPath,`${saved.outputPath}.knowledge-audit.json`);
  const audit=JSON.parse(fs.readFileSync(saved.knowledgeAuditPath,'utf8'));
  assert.equal(audit.requestId,prepared.requestId);assert.equal(audit.traceId,trace.traceId);
  assert.equal(audit.actorKnowledgeScope,'observed-and-remembered');
  assert.equal(audit.referenceAccess,'whole-world');
  assert.equal(audit.validationScope,'declared-cues-actor-state-and-game-guards');
  assert.equal(audit.decisions.length,1);
  assert.deepEqual(audit.decisions[0].basis,quit(prepared.requestId).decisions[0].basis);
  assert.deepEqual(audit.decisions[0].actorState,quit(prepared.requestId).decisions[0].actorState);
  assert.equal(audit.decisions[0].delayMs,100);
  assert.deepEqual(audit.decisions[0].action,{type:'giveUp'});
  assert.equal(audit.decisions[0].before.products.length,0);
  assert.equal(audit.decisions[0].knowledge.cues.some(cue=>cue.cueRef.startsWith('product:')),false);
  assert.equal(saved.knowledgeAuditHash,createHash('sha256').update(canonicalMarketReplayJson(audit)).digest('hex'));
  assert.equal(saved.personaReviewPath,`${saved.outputPath}.persona-review.json`);
  const review=JSON.parse(fs.readFileSync(saved.personaReviewPath,'utf8'));
  assert.equal(review.traceId,trace.traceId);assert.equal(review.requestId,prepared.requestId);
  assert.equal(review.knowledgeAuditHash,saved.knowledgeAuditHash);
  assert.equal(saved.personaReviewHash,createHash('sha256').update(canonicalMarketReplayJson(review)).digest('hex'));
  assert.match(review.limitation,/not a fidelity or clinical pass/);
  assert.equal(trace.steps.find(step=>step.type==='giveUp').reactionDelayMs,100);
  assert.deepEqual(JSON.parse(fs.readFileSync(saved.snapshotFilePath,'utf8')),expectedSnapshot);
  assert.deepEqual(await f.service.invokeTool('validate_trace',{traceFilePath:saved.outputPath,snapshot:expectedSnapshot}),{valid:true,errors:[]});
  assert.ok(await f.service.invokeTool('whole_trace_status',{requestId:prepared.requestId}));
});

test('whole-trace submission rejects request mismatches and ambiguous inputs before consuming a candidate',async t=>{
  const f=setup(t),prepared=await prepare(f);
  await assert.rejects(f.service.invokeTool('submit_whole_trace',{requestId:'unknown',candidate:quit('unknown')}),/Unknown whole-trace request/);
  await assert.rejects(f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:quit('another-request')}),/different whole-trace request/);
  await assert.rejects(f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:quit(prepared.requestId),candidateFilePath:'/tmp/not-read'}),/exactly one/);
  await assert.rejects(f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId}),/exactly one/);
  const saved=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:quit(prepared.requestId)});
  assert.ok(fs.existsSync(saved.outputPath));
  const retry=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:quit(prepared.requestId)});
  assert.equal(retry.traceId,saved.traceId);assert.equal(retry.metrics.planningSubmissions,1);
  await assert.rejects(f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:invalidSelection(prepared.requestId)}),/closed/);
});

test('default whole-trace failure writes no replay file and optional repair is another complete candidate',async t=>{
  const first=setup(t),prepared=await prepare(first),failed=await first.service.invokeTool('submit_whole_trace',{
    requestId:prepared.requestId,candidate:invalidSelection(prepared.requestId),
  });
  assert.equal(failed.status,'invalid');assert.equal(failed.canRepair,false);assert.ok(failed.validation);
  assert.equal(fs.existsSync(path.join(first.directory,'trace.json')),false);
  const repaired=setup(t),request=await prepare(repaired,{maxRepairs:1});
  const feedback=await repaired.service.invokeTool('submit_whole_trace',{requestId:request.requestId,candidate:invalidSelection(request.requestId)});
  assert.equal(feedback.status,'invalid');assert.equal(feedback.canRepair,true);
  const saved=await repaired.service.invokeTool('submit_whole_trace',{requestId:request.requestId,candidate:quit(request.requestId)});
  assert.ok(fs.existsSync(saved.outputPath));
});
test('MCP suffix repair retains accepted behavior and stale input does not close the request',async t=>{
  const f=setup(t),prepared=await prepare(f,{maxRepairs:1});
  const candidate=invalidSelection(prepared.requestId);
  candidate.decisions.unshift(rest());
  const failed=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate});
  assert.equal(failed.validation.acceptedPrefixLength,1);
  assert.equal(failed.repairContext.baseAttempt,1);
  assert.equal(failed.repairContext.fromDecisionIndex,1);
  const repair={repairVersion:'1',requestId:prepared.requestId,baseAttempt:1,fromDecisionIndex:1,
    candidateVersion:'3',decisions:quit(prepared.requestId).decisions};
  await assert.rejects(f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,
    repair:{...repair,baseAttempt:0}}),/baseAttempt/);
  const unchanged=await f.service.invokeTool('whole_trace_status',{requestId:prepared.requestId});
  assert.equal(unchanged.attempts,1);assert.equal(unchanged.canRepair,true);
  const repairFilePath=path.join(f.directory,'suffix.json');fs.writeFileSync(repairFilePath,JSON.stringify(repair));
  const saved=await f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,repairFilePath});
  assert.equal(saved.status,'complete');assert.equal(saved.metrics.planningSubmissions,2);
  const trace=JSON.parse(fs.readFileSync(saved.outputPath,'utf8'));
  assert.deepEqual(trace.steps.map(step=>step.type),['start','pause','giveUp','skipRating','leave']);
  const repeated=await f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,repair});
  assert.equal(repeated.traceId,saved.traceId);
  assert.equal(repeated.metrics.planningSubmissions,2);
});

test('candidate 7 suffix-only file repair binds metadata on the server without a model or extra submissions',async t=>{
  const f=setup(t),originalFetch=global.fetch;
  global.fetch=()=>{throw new Error('Suffix transport must not call a model, provider or app');};
  t.after(()=>{global.fetch=originalFetch;});
  const prepared=await prepare(f,{maxRepairs:1}),source=prepared.bundle.initialChoiceFrame.source;
  const decision=(choiceId,intent,activity)=>({choiceRef:{source,choiceId},delayMs:137,
    reason:'현재 화면에서 선택한 행동을 진행한다',basis:{intent,goalId:null,memoryUses:[]},
    actorState:{activity,task:'현재 선택한 행동',heldGoalIds:[],uncertainGoalIds:[],
      focusedGoalId:null,focusedProductId:null,orientation:'unfamiliar'}});
  const prefix=decision('control/pause','rest','rest'),ending=decision('control/giveUp','finish','finish');
  const original={candidateVersion:'7',requestId:prepared.requestId,
    decisions:[prefix,decision('walk/not-in-catalog','explore','orient'),ending]};
  const failed=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:original});
  assert.equal(failed.status,'invalid');assert.equal(failed.validation.acceptedPrefixLength,1);
  const minimal={decisions:[ending]},repairFilePath=path.join(f.directory,'suffix-only.json');
  fs.writeFileSync(repairFilePath,JSON.stringify(minimal));
  const saved=await f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,repairFilePath});
  assert.equal(saved.status,'complete');assert.equal(saved.metrics.planningSubmissions,2);
  assert.equal(saved.metrics.repairSubmissions,1);assert.equal(saved.appExecuted,false);
  const normalized=JSON.parse(fs.readFileSync(path.join(saved.diagnosticDirectory,'attempt-2.repair-suffix.json')));
  assert.deepEqual(normalized,{repairVersion:'1',requestId:prepared.requestId,baseAttempt:1,
    fromDecisionIndex:1,candidateVersion:'7',decisions:[ending]});
  const assembled=JSON.parse(fs.readFileSync(path.join(saved.diagnosticDirectory,'attempt-2.candidate.json')));
  assert.deepEqual(assembled.decisions,[prefix,ending]);
  const repeated=await f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,repair:minimal});
  assert.deepEqual(repeated,saved);
  const legacyRetry=await f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,repair:normalized});
  assert.deepEqual(legacyRetry,saved);
  assert.deepEqual(definitions.find(tool=>tool.name==='repair_whole_trace').inputSchema.properties.repair.required,['decisions']);
});

test('suffix-only repair still rejects explicitly conflicting metadata without consuming a repair',async t=>{
  const f=setup(t),prepared=await prepare(f,{maxRepairs:1});
  const candidate=invalidSelection(prepared.requestId);candidate.decisions.unshift(rest());
  await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate});
  const minimal={decisions:quit(prepared.requestId).decisions};
  for(const [override,pattern] of [
    [{requestId:'another-request'},/different whole-trace request/],
    [{repairVersion:1},/repairVersion/], [{baseAttempt:0},/baseAttempt/],
    [{fromDecisionIndex:0},/fromDecisionIndex/], [{candidateVersion:'7'},/candidateVersion/],
    [{unexpected:true},/unknown (field|argument)/],
  ]) {
    await assert.rejects(f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,
      repair:{...minimal,...override}}),pattern);
    const status=await f.service.invokeTool('whole_trace_status',{requestId:prepared.requestId});
    assert.equal(status.attempts,1);assert.equal(status.canRepair,true);
  }
  // Partial legacy wrappers from the old actor workflow also receive missing fields.
  const saved=await f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,
    repair:{...minimal,requestId:prepared.requestId,candidateVersion:'3',fromDecisionIndex:1}});
  assert.equal(saved.status,'complete');assert.equal(saved.metrics.repairSubmissions,1);
});

test('an invalid suffix-only repair is cached after its prefix advances and cannot buy another attempt',async t=>{
  const f=setup(t),prepared=await prepare(f,{maxRepairs:1});
  const candidate=invalidSelection(prepared.requestId);candidate.decisions.unshift(rest());
  await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate});
  const repair={decisions:[rest(),...candidate.decisions.slice(1)]};
  const failed=await f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,repair});
  assert.equal(failed.status,'invalid');assert.equal(failed.canRepair,false);
  assert.equal(failed.validation.acceptedPrefixLength,2);
  const repeated=await f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,repair});
  assert.deepEqual(repeated,failed);
  await assert.rejects(f.service.invokeTool('repair_whole_trace',{requestId:prepared.requestId,
    repair:{decisions:quit(prepared.requestId).decisions}}),/budget exhausted/);
  const status=await f.service.invokeTool('whole_trace_status',{requestId:prepared.requestId});
  assert.equal(status.attempts,2);
});

test('legacy ungrounded candidate submissions are rejected rather than relabelled as knowledge-limited play',async t=>{
  for(const candidateVersion of ['1','2']) {
    const f=setup(t),prepared=await prepare(f);
    const legacy={...quit(prepared.requestId),candidateVersion};delete legacy.decisions[0].actorState;
    if(candidateVersion==='1')delete legacy.decisions[0].basis;
    const result=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:legacy});
    assert.equal(result.status,'invalid');
    assert.equal(result.validation.code,'CANDIDATE_SCHEMA');
    assert.ok(result.validation.errors.some(message=>/candidateVersion/.test(message)));
    assert.equal(result.completeTrace,false);
    assert.equal(fs.existsSync(path.join(f.directory,'trace.json')),false);
  }
});

test('one whole candidate with 100 accepted decisions retains the existing unchanged-cart system checkout',async t=>{
  const f=setup(t),original=global.fetch;global.fetch=()=>{throw new Error('Unexpected remote request');};t.after(()=>{global.fetch=original;});
  const prepared=await prepare(f,{timingProfile:'original'}),candidate={candidateVersion:'3',requestId:prepared.requestId,
    decisions:Array.from({length:100},rest)};
  const running=f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate});
  await assert.rejects(f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:quit(prepared.requestId)}),/already being submitted/);
  const saved=await running;
  const trace=JSON.parse(fs.readFileSync(saved.outputPath,'utf8'));
  assert.equal(trace.steps.filter(step=>step.type==='pause').length,100);
  assert.equal(trace.generation.systemCompletion.afterDecisions,100);assert.deepEqual(trace.generation.systemCompletion.cartAtStart,{});
  assert.equal(trace.steps.filter(step=>step.type==='dragProduct'||step.type==='removeProduct').length,0);
  assert.deepEqual(trace.steps.slice(-3).map(step=>step.type),['submitForReview','awaitReviewAccepted','leave']);
  assert.deepEqual(await f.service.invokeTool('validate_trace',{traceFilePath:saved.outputPath,snapshot:f.snapshot}),{valid:true,errors:[]});
});

test('whole-trace learners retain persona versions and reject old policies or wrong app accounts',async t=>{
  let snapshot;
  const bridge={start:async()=>({}),close:async()=>{},list:()=>({sessions:[{tabId:'tab',memberId:'different-member'}]}),snapshot:()=>snapshot};
  const f=setup(t,{bridge});snapshot=f.snapshot;
  const learner=await f.service.invokeTool('create_whole_trace_learner',{directory:f.directory,learnerId:'whole-person',memberId:'whole-member',
    personaId:'careful-checker',experimentId:'whole-experiment',arm:'B'});
  assert.equal(learner.identity.policyVersion,'whole-trace-v3');assert.equal(learner.identity.model,'gpt-6-luna');assert.equal(learner.identity.reasoningEffort,'low');
  assert.equal(learner.identity.personaVersion,getPersona('careful-checker').version);assert.equal(readLearner(learner.learnerFile).rounds.length,0);
  await assert.rejects(prepare(f,{learnerFile:learner.learnerFile,attentionExperience:{visit:'first-play'}}),/manual experience/);
  await assert.rejects(prepare(f,{snapshot:undefined,tabId:'tab',learnerFile:learner.learnerFile}),/cross test accounts/);
  const old=await f.service.invokeTool('create_luna_learner',{directory:f.directory,learnerId:'old-person',memberId:'old-member',
    personaId:'careful-checker',experimentId:'old-experiment',arm:'B'});
  await assert.rejects(prepare(f,{learnerFile:old.learnerFile}),/separate whole-trace-v3 learner/);
  const legacyWhole=createLearner({directory:f.directory,identity:{...learner.identity,
    learnerId:'old-whole-person',policyVersion:'whole-trace-v1'}});
  assert.equal(readLearner(legacyWhole.learnerFile).identity.policyVersion,'whole-trace-v1');
  await assert.rejects(prepare(f,{learnerFile:legacyWhole.learnerFile}),/separate whole-trace-v3 learner/);
  const knowledgeOnly=createLearner({directory:f.directory,identity:{...learner.identity,
    learnerId:'old-knowledge-whole-person',policyVersion:'whole-trace-v2'}});
  await assert.rejects(prepare(f,{learnerFile:knowledgeOnly.learnerFile}),/separate whole-trace-v3 learner/);
  const prepared=await prepare(f,{learnerFile:learner.learnerFile});
  const saved=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:quit(prepared.requestId)});
  assert.deepEqual(JSON.parse(fs.readFileSync(saved.outputPath,'utf8')).generation.learnerIdentity,learner.identity);
});

async function trialFixture(t){
  const f=setup(t),arms={};
  for(const arm of ['A','B','C']) arms[arm]=await f.service.invokeTool('create_whole_trace_learner',{
    directory:f.directory,learnerId:`whole-${arm}`,memberId:`whole-account-${arm}`,personaId:'careful-checker',experimentId:'whole-trial',arm,
  });
  const {trialFile}=createTrial({directory:f.directory,trialId:'whole-trial',personaId:'careful-checker',personaVersion:arms.A.identity.personaVersion,
    model:'gpt-6-luna',policyVersion:'whole-trace-v3',trainingRounds:1,arms,baselineSnapshot:f.snapshot,
    generationLimits:{maxActions:100,maxCalls:1,timingProfile:'original'}});
  return {...f,arms,trialFile};
}
test('whole-trace trial keeps frozen identity and does not apply model-call budget to accepted decisions',async t=>{
  const f=await trialFixture(t);
  await assert.rejects(f.service.invokeTool('prepare_whole_trace',{trialFile:f.trialFile,arm:'A',snapshot:f.snapshot,seed:'changed'}),/seed is frozen/);
  const prepared=await f.service.invokeTool('prepare_whole_trace',{trialFile:f.trialFile,arm:'C',snapshot:f.snapshot,outputPath:path.join(f.directory,'trial.json')});
  const candidate={candidateVersion:'3',requestId:prepared.requestId,decisions:[rest(),...quit(prepared.requestId).decisions]};
  const saved=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate});
  const trace=JSON.parse(fs.readFileSync(saved.outputPath,'utf8'));
  assert.equal(trace.generation.trialBinding.roundId,prepared.roundId);assert.equal(trace.generation.learnerIdentity.arm,'C');
  assert.equal(trace.steps.filter(step=>step.type==='pause').length,1);assert.equal(trace.experienceMode,'first-play');
  assert.equal(readTrial(f.trialFile).arms.C.rounds.length,0);
  assert.equal(readTrial(f.trialFile).arms.C.attempts.length,0);
});
test('an invalid whole-trace trial records a technical failure without a manufactured performed round',async t=>{
  const f=await trialFixture(t),prepared=await f.service.invokeTool('prepare_whole_trace',{trialFile:f.trialFile,arm:'A',snapshot:f.snapshot,
    outputPath:path.join(f.directory,'invalid.json')});
  const result=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:invalidSelection(prepared.requestId)});
  assert.equal(result.status,'invalid');assert.equal(result.canRepair,false);
  const duplicate=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:invalidSelection(prepared.requestId)});
  assert.equal(duplicate.attempts,1);
  await assert.rejects(f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate:quit(prepared.requestId)}),/closed|repair budget exhausted/);
  const arm=readTrial(f.trialFile).arms.A;assert.equal(arm.rounds.length,0);assert.equal(arm.attempts.length,1);
  assert.equal(arm.attempts[0].code,'WHOLE_TRACE_CANDIDATE_INVALID');assert.equal(fs.existsSync(path.join(f.directory,'invalid.json')),false);
});

test('a returned native persistence failure is recorded once and never overwrites a competing output',async t=>{
  const f=await trialFixture(t),outputPath=path.join(f.directory,'occupied.json');
  const prepared=await f.service.invokeTool('prepare_whole_trace',{trialFile:f.trialFile,arm:'B',snapshot:f.snapshot,outputPath});
  fs.writeFileSync(outputPath,'existing unrelated output',{flag:'wx'});
  const candidate=quit(prepared.requestId),failed=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate});
  assert.equal(failed.status,'failed');assert.equal(failed.completeTrace,false);assert.equal(fs.readFileSync(outputPath,'utf8'),'existing unrelated output');
  const repeated=await f.service.invokeTool('submit_whole_trace',{requestId:prepared.requestId,candidate});
  assert.equal(repeated.status,'failed');assert.equal(repeated.attempts,1);
  const arm=readTrial(f.trialFile).arms.B;assert.equal(arm.rounds.length,0);assert.equal(arm.attempts.length,1);
  assert.equal(arm.attempts[0].code,'WHOLE_TRACE_GENERATION_FAILED');
});

test('CLI explains persistent whole-trace requests and supports the whole learner alias offline',async t=>{
  const f=setup(t),cli=path.resolve(__dirname,'../cli.cjs');
  const denied=spawnSync(process.execPath,[cli,'prepare-whole'],{encoding:'utf8'});
  assert.equal(denied.status,1);assert.match(denied.stderr,/same persistent MCP/);
  const created=spawnSync(process.execPath,[cli,'create-whole-learner',JSON.stringify({directory:f.directory,learnerId:'cli-whole',memberId:'cli-member',
    personaId:'quick-decider',experimentId:'cli-whole-experiment',arm:'A'})],{encoding:'utf8'});
  assert.equal(created.status,0,created.stderr);assert.equal(JSON.parse(created.stdout).identity.policyVersion,'whole-trace-v3');
});

test('interactive CLI aliases retain the same whole-trace request through complete candidate submission',async t=>{
  const f=setup(t),child=spawn(process.execPath,[path.resolve(__dirname,'../cli.cjs'),'interactive'],{stdio:['pipe','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  const lines=require('node:readline').createInterface({input:child.stdout}),pending=[],received=[];
  lines.on('line',line=>{const waiter=pending.shift();if(waiter)waiter(line);else received.push(line);});
  const next=()=>new Promise((resolve,reject)=>{
    if(received.length){resolve(JSON.parse(received.shift()));return;}
    const timeout=setTimeout(()=>reject(new Error(`Interactive whole-trace response timed out: ${stderr}`)),10000);
    pending.push(line=>{clearTimeout(timeout);try{resolve(JSON.parse(line));}catch(error){reject(error);}});
  });
  const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  child.stdin.write(JSON.stringify({tool:'prepare-whole',arguments:{personaId:'quick-decider',seed:'interactive-whole',snapshot:f.snapshot,
    outputPath:path.join(f.directory,'interactive.json')}})+'\n');
  const prepared=await next();assert.ok(prepared.requestId);
  child.stdin.write(JSON.stringify({tool:'submit-whole',arguments:{requestId:prepared.requestId,candidate:quit(prepared.requestId)}})+'\n');
  const saved=await next();assert.ok(fs.existsSync(saved.outputPath));
  child.stdin.end();assert.equal(await ended,0,stderr);assert.equal(stderr,'');
});
