'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');require('../runtime.cjs');
const {createService}=require('../server.cjs');const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');const {createMarketReplaySnapshot}=require('../../frontend/src/game/marketReplayTrace.ts');
test('shared loop applies exactly 100 accepted actions, discards terminal batch tail and system-submits unchanged cart',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'actor-plan-integration-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const service=createService(),snapshot=createMarketReplaySnapshot(createMarketSession({seed:'actor-plan-limit'}));t.after(()=>service.close());
 const begun=await service.invokeTool('begin_actor_plan',{personaId:'careful-checker',seed:'luna-limit-fixture',snapshot,maxActions:100,outputPath:path.join(dir,'limit.json')});
 const start=Date.now();await assert.rejects(service.invokeTool('finalize_actor_plan',{sessionId:begun.sessionId}),/still running/);assert.ok(Date.now()-start<1000,'premature finalize must not hang');
 let planned=0,previousRevision=0,frame;
 while(planned<100){
  frame=await service.invokeTool('observe_actor_plan',{sessionId:begun.sessionId});
  if(frame.status==='complete')break;
  assert.equal(frame.revision,previousRevision+1);previousRevision=frame.revision;
  const pause=frame.availableChoices.find(c=>c.action.type==='pause');assert.ok(pause);
  const count=Math.min(3,100-planned);
  await service.invokeTool('append_actor_plan',{sessionId:begun.sessionId,revision:frame.revision,choiceIds:Array(count).fill(pause.id),delayMs:Array(count).fill(1),reasons:Array(count).fill('잠시 기다린다')});
  planned+=count;
 }
 let state=await service.invokeTool('observe_actor_plan',{sessionId:begun.sessionId});
 for(let i=0;i<100&&state.status!=='complete';i++){await new Promise(r=>setTimeout(r,10));state=await service.invokeTool('observe_actor_plan',{sessionId:begun.sessionId});}
 assert.equal(state.status,'complete','system tail and save should finish without another model roundtrip');
 const result=await service.invokeTool('finalize_actor_plan',{sessionId:begun.sessionId}),trace=JSON.parse(fs.readFileSync(result.outputPath,'utf8'));
 assert.equal(result.acceptedActions,100);assert.equal(trace.steps.filter(s=>s.type==='pause').length,100);
 assert.equal(trace.generation.systemCompletion.afterDecisions,100);assert.deepEqual(trace.generation.systemCompletion.cartAtStart,{});
 assert.equal(trace.steps.filter(s=>s.type==='add'||s.type==='remove'||s.type==='dragProduct').length,0);
 const startIndex=trace.steps.findIndex(s=>s.id===trace.generation.systemCompletion.firstStepId);
 assert.ok(startIndex>=101);assert.ok(trace.steps.slice(startIndex).some(s=>s.type==='submitForReview'));
 assert.deepEqual(await service.invokeTool('validate_trace',{traceFilePath:result.outputPath,snapshotFilePath:result.snapshotFilePath}),{valid:true,errors:[]});
});
