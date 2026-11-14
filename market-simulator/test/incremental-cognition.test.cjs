'use strict';
require('../runtime.cjs').register();
const test=require('node:test'),assert=require('node:assert/strict');
const {IncrementalCognition,incrementalCognitionProfile}=require('../src/incrementalCognition.ts');
const {getPersona}=require('../src/personas.ts');
const {ActorPlanSession}=require('../src/actorPlanSession.ts');
const {generateTrace}=require('../src/simulator.ts');
const {TraceGuard}=require('../src/traceValidation.ts');
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot}=require('../../frontend/src/game/marketReplayTrace.ts');
const persona=getPersona('adult-minjae-unit-support-research-v2');
const obs=(changes={})=>({schemaVersion:'attention-observation-v1',phase:'shopping',view:'world',activeStation:null,
 visibleStations:[],anchors:[],products:[],shelf:null,listAvailable:true,cart:null,cashiers:{},sequence:1,elapsedMs:1,...changes});
const declared=(state={},basis={})=>({actorState:{activity:'explore',heldGoalIds:[],uncertainGoalIds:[],focusedGoalId:null,
 focusedProductId:null,memoryUpdate:[],taskUpdate:[],...state},basis:{intent:'explore',goalId:null,memoryUses:[],...basis}});
const goal={id:'read-goal',label:'흰 우유',quantity:2,match:'exact'};
const chooseGoal=()=>declared({activity:'task',heldGoalIds:[goal.id],focusedGoalId:goal.id,taskUpdate:[{type:'select',goalId:goal.id}]},
 {intent:'task',goalId:goal.id,memoryUses:[{goalId:goal.id,field:'name',mode:'current-display',value:goal.label}]});
function accepted(memory,observation,wire,action,delay=1){memory.preview(observation,wire,action,delay);return memory.applied(obs({sequence:observation.sequence+1,result:{accepted:true,actionType:action.type}}));}

test('research identity is retained while the existing cognitive coefficients have explicit source provenance',()=>{
 const c=incrementalCognitionProfile(persona),original=incrementalCognitionProfile(getPersona('mild-intellectual-disability-adult'));
 assert.deepEqual(c.profile,{...original.profile,familiarProductIds:[]});assert.deepEqual(c.profile.familiarProductIds,[]);
 assert.ok(!c.profile.familiarProductIds.includes('apple')&&!c.profile.familiarProductIds.includes('curry'));
 assert.match(c.source.familiaritySource,/No exact catalogue-ID familiarity mapping/);
 assert.equal(c.source.actorPersonaId,persona.id);assert.equal(c.source.actorPersonaVersion,persona.version);
 assert.equal(c.source.adapter,'research-minjae-explicit-engineering-v1');assert.match(c.source.interpretation,/not measured memory capacity/);
 const f=new IncrementalCognition(persona).frame(obs());assert.equal(f.workingMemory.activeGoals.length,0);
 assert.ok(!('mission'in f)&&!('environment'in f));assert.equal(f.profile.goalMemoryCapacity,2);
});

test('the original engine enforces unread-goal access and existing capacity rather than inventing remembered answers',()=>{
 const c=new IncrementalCognition(persona);
 assert.throws(()=>c.preview(obs(),chooseGoal(),{type:'pause',durationMs:1},1),/unread|displayed|open task/);
 const goals=[goal,{...goal,id:'g2'},{...goal,id:'g3'}];
 const tooMany=declared({heldGoalIds:goals.map(g=>g.id),taskUpdate:goals.map(g=>({type:'select',goalId:g.id}))});
 assert.throws(()=>c.preview(obs({readObjectives:goals}),tooMany,{type:'pause',durationMs:1},1),/capacity|goalMemoryCapacity/);
 assert.equal(c.proof().committedDecisions,0);
});

test('accepted tasks persist through interest while the real existing engine makes quantities uncertain/unavailable',()=>{
 const c=new IncrementalCognition(persona);
 accepted(c,obs({readObjectives:[goal]}),chooseGoal(),{type:'pause',durationMs:1});
 assert.throws(()=>c.preview(obs({sequence:3,elapsedMs:3}),declared(),{type:'pause',durationMs:1},1),/must stay in heldGoalIds/);
 const detour=declared({activity:'interest',heldGoalIds:[goal.id],uncertainGoalIds:[goal.id]}, {intent:'interest'});
 const a=accepted(c,obs({sequence:3,elapsedMs:3}),detour,{type:'pause',durationMs:1},60000);
 assert.deepEqual(a.taskMemory.openGoalIds,[goal.id]);
 assert.equal(a.workingMemory.activeGoals[0].fields.requiredQuantity.status,'unavailable');
 assert.equal(a.workingMemory.activeGoals[0].fields.requiredQuantity.value,null);
 assert.ok(a.cognitionEvents.some(e=>e.kind==='decayed'));
 const impossible=declared({activity:'task',heldGoalIds:[goal.id],uncertainGoalIds:[goal.id],focusedGoalId:goal.id},
  {intent:'task',goalId:goal.id,memoryUses:[{goalId:goal.id,field:'requiredQuantity',mode:'remembered',value:2}]});
 assert.throws(()=>c.preview(obs({sequence:5,elapsedMs:60005}),impossible,{type:'pause',durationMs:1},1),/clear retained/);
 const reread=accepted(c,obs({sequence:5,elapsedMs:60005,readObjectives:[goal]}),
  declared({activity:'check',heldGoalIds:[goal.id]}, {intent:'check'}),{type:'pause',durationMs:1});
 assert.equal(reread.workingMemory.activeGoals[0].fields.requiredQuantity.value,2);
 assert.equal(reread.workingMemory.activeGoals[0].fields.requiredQuantity.status,'clear');
});

test('memory validation never corrects a legal mistaken purchase and completion needs an actually observed prior add',()=>{
 const c=new IncrementalCognition(persona);accepted(c,obs({readObjectives:[goal]}),chooseGoal(),{type:'pause',durationMs:1});
 const complete=declared({activity:'check',heldGoalIds:[],taskUpdate:[{type:'complete',goalId:goal.id}]},{intent:'check'});
 assert.throws(()=>c.preview(obs({sequence:3}),complete,{type:'viewCart'},1),/earlier accepted add/);
 const wire=declared({activity:'task',heldGoalIds:[goal.id],focusedGoalId:goal.id},
  {intent:'task',goalId:goal.id,memoryUses:[{goalId:goal.id,field:'name',mode:'remembered',value:goal.label},
   {goalId:goal.id,field:'requiredQuantity',mode:'remembered',value:2}]});
 const wrongAction={type:'add',productId:'milk-small',quantity:5};
 c.preview(obs({sequence:3}),wire,wrongAction,1);
 const added=c.applied(obs({sequence:4,result:{accepted:true,actionType:'add',productId:'milk-small',quantity:5}}));
 assert.deepEqual(added.action,wrongAction);
 const done=accepted(c,obs({sequence:4,result:{accepted:true,actionType:'add',productId:'milk-small',quantity:5}}),complete,{type:'viewCart'});
 assert.deepEqual(done.taskMemory.completedGoalIds,[goal.id]);
 assert.equal(done.taskMemory.purchaseEvidence.length,0);
});

test('an applied UI rejection does not commit a preview as completed working-memory experience',()=>{
 const c=new IncrementalCognition(persona);c.preview(obs({readObjectives:[goal]}),chooseGoal(),{type:'pause',durationMs:1},1);
 const a=c.applied(obs({sequence:2,result:{accepted:false,actionType:'pause'}}));
 assert.equal(a.accepted,false);assert.equal(c.proof().committedDecisions,0);assert.deepEqual(c.proof().taskMemory.openGoalIds,[]);
});

test('v11 generation refuses an unconnected provider and its MCP session exposes committed engine state after each accepted action',async()=>{
 const snapshot=createMarketReplaySnapshot(createMarketSession({seed:'v11-cognition-runtime',objectives:[{productId:'milk',quantity:1,match:'exact'}]}));
 const options={personaId:persona.id,seed:'v11-runtime',snapshot,mode:'llm',actorPolicyVersion:'episodic-choice-v11',tracePolicyVersion:'6',reasoningEffort:'low',maxActions:200,llm:{model:'gpt-6-luna'}};
 await assert.rejects(generateTrace({...options,actorDecisionProvider:async()=>({action:{type:'giveUp'},delayMs:1,reason:'그만한다'})}),/v11 requires cognition/);
 const session=new ActorPlanSession({policyVersion:'episodic-choice-v11'}),checkpoints=[];
 const generation=generateTrace({...options,actorDecisionProvider:(...args)=>session.decide(...args),onActorDecisionAccepted:()=>session.recordAccepted(),
  onActorDecisionApplied:after=>session.recordApplied(after),onCheckpoint:x=>checkpoints.push(x)});
 const frame=await session.awaitObserve();assert.ok(frame.cognition);assert.equal(frame.cognition.committedDecisions,0);
 const quit=frame.availableChoices.find(c=>c.action.type==='giveUp');
 assert.throws(()=>session.append({revision:frame.revision,choiceIds:[quit.id,quit.id],delayMs:[1,1],reasons:['끝','끝'],cognition:declared()}),/exactly one/);
 session.append({revision:frame.revision,choiceIds:[quit.id],delayMs:[1],reasons:['오늘은 그만한다'],cognition:declared({activity:'finish'},{intent:'finish'})});
 const trace=await generation;assert.equal(trace.generation.actorPolicyVersion,'episodic-choice-v11');assert.ok(!trace.generation.systemCompletion);
 assert.equal(session.cognitionProof.committedDecisions,1);assert.equal(checkpoints[0].cognition.contract,'observed-working-and-task-memory-v1');session.complete();
});

test('the explicit v11 horizon reaches 200 and preserves voluntary termination on the last decision',async()=>{
 const snapshot=createMarketReplaySnapshot(createMarketSession({seed:'v11-horizon'}));
 const base={personaId:persona.id,seed:'v11-horizon',snapshot,mode:'llm',actorPolicyVersion:'episodic-choice-v11',tracePolicyVersion:'6',reasoningEffort:'low',maxActions:200,llm:{model:'gpt-6-luna'}};
 const make=(quitAtBound)=>async(o,h)=>({action:quitAtBound&&h.length===199?{type:'giveUp'}:{type:'pause',durationMs:1500},delayMs:1,
  reason:'현재 화면에서 선택한다',cognition:declared(quitAtBound&&h.length===199?{activity:'finish'}:{},quitAtBound&&h.length===199?{intent:'finish'}:{})});
 const assisted=await generateTrace({...base,actorDecisionProvider:make(false)});
 assert.equal(assisted.generation.systemCompletion.actionLimit,200);assert.equal(assisted.generation.systemCompletion.afterDecisions,200);
 assert.deepEqual(assisted.generation.systemCompletion.cartAtStart,{});
 const voluntary=await generateTrace({...base,actorDecisionProvider:make(true)});
 assert.ok(!voluntary.generation.systemCompletion);assert.ok(voluntary.steps.some(s=>s.type==='giveUp'));
 await assert.rejects(generateTrace({...base,maxActions:100,actorDecisionProvider:make(false)}),/200-action observation horizon/);
});
