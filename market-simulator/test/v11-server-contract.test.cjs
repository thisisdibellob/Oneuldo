'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require('../runtime.cjs');
const {createService}=require('../server.cjs');
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot}=require('../../frontend/src/game/marketReplayTrace.ts');
const emptyCognition={actorState:{activity:'finish',heldGoalIds:[],uncertainGoalIds:[],focusedGoalId:null,focusedProductId:null,memoryUpdate:[],taskUpdate:[]},basis:{intent:'finish',goalId:null,memoryUses:[]}};
test('explicit v11 MCP learner and plan expose connected cognition without changing the research identity',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oneuldo-v11-server-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const service=createService();t.after(()=>service.close());
 const created=await service.invokeTool('create_luna_learner',{directory:dir,learnerId:'v11',memberId:'isolated-v11-member',personaId:'adult-minjae-unit-support-research-v2',experimentId:'v11-contract',arm:'A',actorPolicyVersion:'episodic-choice-v11'});
 assert.equal(created.identity.policyVersion,'episodic-choice-v11');
 const snapshot=createMarketReplaySnapshot(createMarketSession({seed:'v11-contract'}));
 const began=await service.invokeTool('begin_actor_plan',{personaId:created.identity.personaId,seed:'v11-contract',snapshot,learnerFile:created.learnerFile,maxActions:200,outputPath:path.join(dir,'trace.json')});
 assert.equal(began.actorPolicyVersion,'episodic-choice-v11');
 const frame=await service.invokeTool('observe_actor_plan',{sessionId:began.sessionId});
 assert.equal(frame.persona.id,created.identity.personaId);
 assert.ok(frame.cognition,'The live frame must contain the actual cognition engine state');
 const quit=frame.availableChoices.find(c=>c.action.type==='giveUp');assert.ok(quit);
 await service.invokeTool('append_actor_plan',{sessionId:began.sessionId,revision:frame.revision,choiceIds:[quit.id],delayMs:[1],reasons:['이번 장보기를 마친다'],cognition:emptyCognition});
 for(let i=0;i<50;i++){const state=await service.invokeTool('observe_actor_plan',{sessionId:began.sessionId});if(state.status==='complete')break;await new Promise(r=>setTimeout(r,10));}
 const done=await service.invokeTool('finalize_actor_plan',{sessionId:began.sessionId});
 assert.ok(done.cognitionProof,'Finalization must prove the engine ran for the accepted decisions');
 const trace=JSON.parse(fs.readFileSync(done.outputPath));assert.equal(trace.generation.actorPolicyVersion,'episodic-choice-v11');
 await assert.rejects(service.invokeTool('begin_actor_plan',{personaId:created.identity.personaId,seed:'mismatch',snapshot,learnerFile:created.learnerFile,actorPolicyVersion:'episodic-choice-v10',outputPath:path.join(dir,'wrong.json')}),/identity changed/);
});
test('the default Luna learner remains v10 and cannot be silently upgraded',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oneuldo-v10-default-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const service=createService();t.after(()=>service.close());
 const created=await service.invokeTool('create_luna_learner',{directory:dir,learnerId:'legacy',memberId:'member',personaId:'adult-minjae-unit-support-research-v2',experimentId:'legacy',arm:'A'});
 assert.equal(created.identity.policyVersion,'episodic-choice-v10');
});
