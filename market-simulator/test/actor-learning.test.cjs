const test=require('node:test'),assert=require('node:assert/strict');
require('../runtime.cjs');
const {generateTrace}=require('../src/simulator.ts');
const {ActorLearningMemory,validateLearning}=require('../src/actorLearning.ts');
const {createAttentionLlmPolicy}=require('../src/llmPolicy.ts');
const {TraceGuard}=require('../src/traceValidation.ts');
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot}=require('../../frontend/src/game/marketReplayTrace.ts');
const {marketMission}=require('../../frontend/src/game/scenarios.ts');
const {getPersona}=require('../src/personas.ts');
const {confirmedExperience}=require('../pilot-evidence.cjs');
const {createHash}=require('node:crypto');
const personaId='mild-intellectual-disability-adult';
const snapshot=()=>createMarketReplaySnapshot(createMarketSession({seed:'learning-boundary'}),marketMission);
const learning={version:'1',source:'confirmed-app-replay',memberId:'fixture-member',sessionId:'fixture-session',replayId:'fixture-replay',episodes:[
 {source:'executed-app-action',action:'dragProduct',product:'바나나 낱개',quantity:1,result:'Action executed; correctness unknown.'},
 {source:'executed-app-action',action:'checkout',instructions:['목록의 포장 단위와 비교해요.']},
]};

test('default mode is AI and does not instantiate the stochastic policy',async()=>{
 const {AttentionPolicy}=require('../src/attentionPolicy.ts');const original=AttentionPolicy.prototype.next;
 AttentionPolicy.prototype.next=()=>{throw new Error('stochastic policy must not run')};
 try {
  const trace=await generateTrace({personaId,seed:1,snapshot:snapshot(),llm:{model:'fixture'},actorDecisionProvider:async()=>({action:{type:'giveUp'},delayMs:100,reason:'오늘은 그만한다'})});
  assert.equal(trace.generationPolicy,'llm');assert.equal(trace.steps.at(-3).type,'giveUp');
 }finally{AttentionPolicy.prototype.next=original;}
});

test('bounded format repair preserves observation and never chooses an action on behalf of AI',async()=>{
 const original=global.fetch;const requests=[];
 global.fetch=async(_,init)=>{
  const request=JSON.parse(init.body);requests.push(request);const user=JSON.parse(request.messages[1].content);
  const result=requests.length===1?{action:{walkToAnchor:['invalid']}}:{choiceId:user.availableChoices.find(c=>c.action.type==='viewHelp').id,delayMs:100,reason:'도움 열기'};
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(result)}}]})};
 };
 try{
  const o=new TraceGuard(snapshot()).observeActor(), p=createAttentionLlmPolicy({baseUrl:'http://localhost:1',model:'fixture',maxCalls:2});
  const result=await p(o,[],getPersona(personaId),{});
  assert.equal(result.action.type,'viewHelp');assert.equal(requests.length,2);
  assert.deepEqual(JSON.parse(requests[0].messages[1].content).observation,JSON.parse(requests[1].messages[1].content).observation);
  assert.ok(JSON.parse(requests[1].messages[1].content).formatCorrection);
  await assert.rejects(p(o,[],getPersona(personaId),{}),/including format repairs/);
 }finally{global.fetch=original;}
});

test('experience contains observed episodes, without automatic mastery or hidden analysis',()=>{
 const actor=new ActorLearningMemory(learning), guard=new TraceGuard(snapshot(),personaId,'5','fixture',true);
 const before=guard.observeActor();guard.execute({id:'read',type:'readList',durationMs:100,reactionDelayMs:100,timeoutMs:10000,reason:'목록 읽기'});
 actor.record({action:{type:'readList',durationMs:100},delayMs:100,reason:'목록 읽기'},before,guard.observeActor());
 actor.record({action:{type:'interact',station:'fresh'},delayMs:100,reason:'매대 보기'},before,
  {...guard.observeActor(),products:[{id:'fixture',name:'살펴본 상품',detail:'낱개',stock:3,price:100,categoryId:'fresh'}]});
 const state=actor.getState();assert.deepEqual(state.previousExecutedExperience,learning.episodes);
 assert.ok(state.recentExperience[0].readList.length);assert.equal(state.mastery,undefined);assert.equal(state.confusionProbability,undefined);
 assert.deepEqual(state.recentExperience[1].seenProducts,['살펴본 상품 낱개']);
 assert.equal(state.recentExperience[1].target,'fresh');
 assert.throws(()=>validateLearning({...learning,source:'planned-trace'}));
 assert.throws(()=>validateLearning({...learning,episodes:[{...learning.episodes[0],analysis:'secret answer'}]}));
});

test('AI revisit request receives confirmed experiences but not stochastic ability parameters',async()=>{
 const original=global.fetch;let wire;
 global.fetch=async(_,init)=>{
  wire=JSON.parse(JSON.parse(init.body).messages[1].content);
  return {ok:true,json:async()=>({message:{content:JSON.stringify({choiceId:wire.availableChoices.find(c=>c.action.type==='giveUp').id,delayMs:100,reason:'이번에는 종료'})}})};
 };
 try {
  const trace=await generateTrace({personaId,seed:'revisit-input',snapshot:snapshot(),
   llm:{baseUrl:'http://localhost:1',model:'fixture',protocol:'ollama'},attentionExperience:{visit:'revisit',previousLayoutKey:'old-layout',
    memory:{version:'1',stations:[],anchors:[],knownProducts:[],controlsPracticed:[]},learning}});
  assert.deepEqual(wire.experience.previousExecutedExperience,learning.episodes);
  assert.equal(wire.observation.readObjectives,undefined);
  assert.equal(wire.personaCharacter.parameters,undefined);
  assert.equal(trace.generation.actorPolicyVersion,'episodic-choice-v4');
 }finally{global.fetch=original;}
});

test('only a fully confirmed AI replay can carry episodic experience into another visit',async()=>{
 const initial=snapshot();let calls=0;
 const trace=await generateTrace({personaId,seed:'confirmed',snapshot:initial,llm:{model:'fixture'},actorDecisionProvider:async()=>({action:++calls===1?{type:'readList',durationMs:100}:{type:'giveUp'},delayMs:100,reason:'목록을 보고 종료'})});
 // Explicit evidence fixtures, never counted as a real completed app play.
 const replay={replayId:'fixture-replay',traceId:trace.traceId,traceHash:createHash('sha256').update(JSON.stringify(trace)).digest('hex'),snapshotId:initial.snapshotId,sessionId:'fixture-session',memberId:'fixture-member',status:'completed',report:{acknowledged:true,completedSteps:trace.steps.map(s=>({id:s.id,type:s.type})),displacementViolations:0,inputViolations:0}};
 const receipt={sessionId:replay.sessionId,memberId:replay.memberId,eventCount:10,firstSequence:1,lastSequence:10,uniqueSequences:10,uniqueClientEvents:10,endEvents:1,timeReversals:0};
 const experience=confirmedExperience(trace,initial,replay,receipt);
 assert.ok(experience.learning.episodes.some(e=>e.instructions));assert.ok(experience.learning.episodes.some(e=>e.readList));
 assert.throws(()=>confirmedExperience(trace,initial,{...replay,status:'failed'},receipt));
 assert.throws(()=>confirmedExperience(trace,initial,replay,receipt,{...experience,learning:{...experience.learning,memberId:'other'}}),/cross test accounts/);
 await assert.rejects(generateTrace({personaId,seed:2,snapshot:initial,llm:{model:'fixture'},attentionExperience:{visit:'first-play',learning:experience.learning}}),/AI revisit/);
});

test('observed guidance and list survive the recent-action window without revealing unread goals',()=>{
 const actor=new ActorLearningMemory(), guard=new TraceGuard(snapshot(),personaId,'5','fixture',true);
 const before=guard.observeActor();actor.observe(before);
 assert.equal(actor.getState().observedThisVisit.lastReadList,null);
 assert.equal(actor.getState().actorChosenTask,null);
 guard.execute({id:'read',type:'readList',durationMs:100,reactionDelayMs:100,timeoutMs:10000,reason:'목록 읽기'});
 const read=guard.observeActor();actor.record({action:{type:'readList',durationMs:100},delayMs:100,reason:'목록 읽기',currentTask:'우유를 찾기'},before,read);
 for(let i=0;i<8;i++){
  const later={...read,readObjectives:undefined,instructions:undefined,result:{accepted:true,actionType:'pause'}};
  actor.record({action:{type:'pause',durationMs:100},delayMs:100,reason:'대기'},later,later);
 }
 const state=actor.getState();
 assert.equal(state.recentExperience.some(x=>x.readList),false);
 assert.deepEqual(state.observedThisVisit.lastReadList,read.readObjectives);
 assert.deepEqual(state.observedThisVisit.instructions.entry,before.instructions.lines);
 assert.equal(state.actorChosenTask,'우유를 찾기');
 const other=new ActorLearningMemory();assert.equal(other.getState().observedThisVisit.lastReadList,null);
 assert.deepEqual(other.getState().observedThisVisit.instructions,{});
});

test('only observed locations and actually traveled edges enter model memory; failed movement does not count',()=>{
 const actor=new ActorLearningMemory(), o=new TraceGuard(snapshot(),personaId,'5','fixture',true).observeActor();
 const a=o.anchors[0],b=o.anchors[1];assert.ok(a&&b);actor.observe(o);
 const move=(anchor,accepted)=>actor.record({action:{type:'walkToAnchor',anchorId:anchor.id},delayMs:100,reason:'이동'},o,
  {...o,readObjectives:undefined,instructions:undefined,result:{accepted,actionType:'walkToAnchor'}});
 move(a,true);move(b,false);
 assert.equal(actor.getState().observedThisVisit.currentAnchor,a.id);
 move(b,true);
 const state=actor.getState().observedThisVisit;
 assert.deepEqual(state.traveledEdges,[{from:null,to:a.id},{from:a.id,to:b.id}]);
 assert.equal(state.discoveries.anchors.find(x=>x.id===a.id).visits,1);
 assert.deepEqual(state.discoveries.anchors.find(x=>x.id===a.id).neighbors,[b.id]);
 assert.ok(state.discoveries.stations.every(s=>o.visibleStations.some(v=>v.id===s.id)));
 assert.equal(JSON.stringify(state).includes('acceptedProductIds'),false);
 assert.equal(JSON.stringify(state).includes('playerPosition'),false);
 state.discoveries.anchors[0].visits=999;
 assert.notEqual(actor.getState().observedThisVisit.discoveries.anchors[0].visits,999);
});

test('model-authored task is passed to the next model request and an oversized task is rejected',async()=>{
 const original=global.fetch;const requests=[];
 global.fetch=async(_,init)=>{
  const u=JSON.parse(JSON.parse(init.body).messages[1].content);requests.push(u);
  const type=requests.length===1?'readList':'giveUp';
  return {ok:true,json:async()=>({message:{content:JSON.stringify({choiceId:u.availableChoices.find(c=>c.action.type===type).id,delayMs:100,reason:'관찰 가능한 동작',currentTask:'우유 매대를 찾기'})}})};
 };
 try{
  await generateTrace({personaId,seed:'intent-carry',snapshot:snapshot(),llm:{baseUrl:'http://localhost:1',model:'fixture',protocol:'ollama'}});
  assert.equal(requests[0].experience.actorChosenTask,null);
  assert.equal(requests[1].experience.actorChosenTask,'우유 매대를 찾기');
  assert.ok(requests[1].experience.observedThisVisit.lastReadList.length);
  const {assertDecision}=require('../src/llmPolicy.ts');
  assert.throws(()=>assertDecision({action:{type:'giveUp'},delayMs:100,reason:'종료',currentTask:'x'.repeat(161)}),/currentTask/);
 }finally{global.fetch=original;}
});


test('waiting feedback reports an unchanged observation without choosing a replacement action',()=>{
 const {actorChoices}=require('../src/actorChoices.ts');
 const o=new TraceGuard(snapshot(),personaId,'5','fixture',true).observeActor(), actor=new ActorLearningMemory();
 const d={action:{type:'lookAround',durationMs:100},delayMs:100,reason:'주변 보기'};
 actor.record(d,o,{...o,result:{accepted:true,actionType:'lookAround'}});
 assert.match(actor.getState().recentExperience.at(-1).result,/scene unchanged/);
 assert.match(actorChoices(o).find(c=>c.action.type==='lookAround').effect,/does not pan/);
 assert.ok(actorChoices(o).some(c=>c.action.type==='lookAround'));
 actor.record(d,o,{...o,visibleStations:[],anchors:[],result:{accepted:true,actionType:'lookAround'}});
 assert.doesNotMatch(actor.getState().recentExperience.at(-1).result,/scene unchanged/);
});


test('choice annotations expose recorded arrivals without removing or ranking revisits',()=>{
 const {actorChoices}=require('../src/actorChoices.ts');const o=new TraceGuard(snapshot()).observeActor();
 const anchor=o.anchors[0];const original=actorChoices(o), annotated=actorChoices(o,{anchors:[{id:anchor.id,visits:3,neighbors:[]}],currentAnchor:anchor.id});
 assert.deepEqual(annotated.map(c=>c.action),original.map(c=>c.action));
 const choice=annotated.find(c=>c.action.anchorId===anchor.id);
 assert.equal(choice.observedContext.recordedArrivals,3);assert.equal(choice.observedContext.direction,anchor.direction);
 assert.equal(choice.observedContext.currentLocation,true);
});
