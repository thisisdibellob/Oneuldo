'use strict';
require('../runtime.cjs').register();
const test=require('node:test'); const assert=require('node:assert/strict');
const {ActorPlanSession,ACTOR_PLAN_MODEL}=require('../src/actorPlanSession.ts');
const {TraceGuard}=require('../src/traceValidation.ts'); const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot}=require('../../frontend/src/game/marketReplayTrace.ts'); const {getPersona}=require('../src/personas.ts');
function setup(){const snapshot=createMarketReplaySnapshot(createMarketSession({seed:'plan-contract'}));const guard=new TraceGuard(snapshot);return {snapshot,guard};}
test('actor plan requires current revision and accepts one to three individually justified live choices',async()=>{
 const {guard}=setup(), session=new ActorPlanSession(), persona=getPersona('careful-checker'), o=guard.observeActor();
 const pending=session.decide(o,[],persona,{kind:'idle'},{observedThisVisit:{discoveries:{anchors:[]},currentAnchor:null}});
 while(!session.status.waiting) await new Promise(r=>setImmediate(r)); const frame=session.observe();
 assert.equal(session.model,ACTOR_PLAN_MODEL); assert.equal(frame.persona.version,persona.version);
 assert.ok(!('snapshot' in frame)&&!('environment' in frame));
 assert.throws(()=>session.append({revision:frame.revision-1,choiceIds:[frame.availableChoices[0].id],delayMs:[10],reasons:['관찰']}),/Stale/);
 assert.throws(()=>session.append({revision:frame.revision,choiceIds:['unavailable'],delayMs:[10],reasons:['관찰']}),/not available/);
 assert.throws(()=>session.append({revision:frame.revision,choiceIds:['a','b','c','d'],delayMs:[1,1,1,1],reasons:['x','x','x','x']}),/1\.\.3/);
 const chosen=frame.availableChoices.find(c=>c.action.type==='readList')??frame.availableChoices[0];
 session.append({revision:frame.revision,choiceIds:[chosen.id],delayMs:[10],reasons:['현재 보이는 선택을 확인한다']});
 const decision=await pending; assert.deepEqual(decision.action,chosen.action);session.recordAccepted();assert.equal(session.status.acceptedActions,1);session.close();
});
test('plan sessions are isolated and never share a pending observation',async()=>{
 const {guard}=setup(), persona=getPersona('careful-checker'), state={observedThisVisit:{discoveries:{anchors:[]},currentAnchor:null}};
 const a=new ActorPlanSession(), b=new ActorPlanSession(), pa=a.decide(guard.observeActor(),[],persona,{},state), pb=b.decide(guard.observeActor(),[],persona,{},state);
 while(!a.status.waiting||!b.status.waiting) await new Promise(r=>setImmediate(r));
 assert.notEqual(a.id,b.id); const fa=a.observe(), fb=b.observe();
 a.append({revision:fa.revision,choiceIds:[fa.availableChoices[0].id],delayMs:[100],reasons:['선택']});
 assert.equal((await pa).action.type,fa.availableChoices[0].action.type); assert.equal(b.status.waiting,true);
 b.append({revision:fb.revision,choiceIds:[fb.availableChoices[0].id],delayMs:[100],reasons:['선택']}); await pb; a.close();b.close();
});
test('meaningful observation change discards the unexecuted part of a plan and requests a fresh revision',async()=>{
 const {guard}=setup(), persona=getPersona('careful-checker'), state={observedThisVisit:{discoveries:{anchors:[]},currentAnchor:null}}, session=new ActorPlanSession();
 const first=session.decide(guard.observeActor(),[],persona,{},state); while(!session.status.waiting) await new Promise(r=>setImmediate(r));
 const f1=session.observe(), choices=f1.availableChoices.slice(0,2);
 session.append({revision:f1.revision,choiceIds:choices.map(c=>c.id),delayMs:[100,100],reasons:['첫 선택','조건부 다음 선택']});
 await first; const changed={...f1.observation,view:'cart',cart:{}};
 const next=session.decide(changed,[{action:choices[0].action,delayMs:100,reason:'첫 선택'}],persona,{},state);
 while(!session.status.waiting) await new Promise(r=>setImmediate(r));
 assert.equal(session.observe().revision,f1.revision+1);session.recordAccepted();assert.equal(session.status.acceptedActions,1);
 const f2=session.observe(); session.append({revision:f2.revision,choiceIds:[f2.availableChoices[0].id],delayMs:[100],reasons:['새 관측에 맞춘 선택']}); await next; session.close();
});
test('new list, product, basket or movement cues cancel an unexecuted batch',async()=>{
 const {guard}=setup(),persona=getPersona('careful-checker'),base=guard.observeActor();
 for(const [label,mutate,stateChange] of [
  ['new list',o=>({...o,readObjectives:[{id:'objective-new',label:'빵',quantity:1,match:'family'}]}),s=>s],
  ['new product',o=>({...o,products:[{id:'milk',categoryId:'fresh',name:'우유',price:1000,stock:2}]}),s=>({...s,discoveries:{...s.discoveries,knownProducts:[{id:'milk',categoryId:'fresh',name:'우유',price:1000,stock:2}]}})],
  ['basket',o=>({...o,cart:{milk:1}}),s=>s],
  ['movement',o=>({...o,anchors:o.anchors.slice(1)}),s=>({...s,currentAnchor:'anchor-moved',traveledEdges:[{from:null,to:'anchor-moved'}]})],
 ]){
  const session=new ActorPlanSession(),state={observedThisVisit:{discoveries:{anchors:[]},currentAnchor:null,traveledEdges:[]}},first=session.decide(base,[],persona,{},state);
  while(!session.status.waiting)await new Promise(r=>setImmediate(r));const f=session.observe(),pause=f.availableChoices.find(c=>c.action.type==='pause');
  session.append({revision:f.revision,choiceIds:[pause.id,pause.id],delayMs:[100,100],reasons:['잠시 기다린다','계속 기다린다']});await first;
  const next=session.decide(mutate({...base,sequence:2}),[{action:pause.action,delayMs:100,reason:'잠시 기다린다'}],persona,{}, {observedThisVisit:stateChange(state.observedThisVisit)});
  while(!session.status.waiting)await new Promise(r=>setImmediate(r));assert.equal(session.observe().revision,f.revision+1,label);
  const fresh=session.observe();session.append({revision:fresh.revision,choiceIds:[fresh.availableChoices[0].id],delayMs:[100],reasons:['새 단서를 살핀다']});await next;session.close();
 }
});
test('the 99-to-100 boundary preserves voluntary termination and clears trailing batch actions',async()=>{
 const {guard}=setup(),session=new ActorPlanSession(),persona=getPersona('careful-checker'),state={observedThisVisit:{discoveries:{anchors:[]},currentAnchor:null,traveledEdges:[]}};
 for(let i=0;i<99;i++)session.recordAccepted();
 const pending=session.decide(guard.observeActor(),[],persona,{},state);while(!session.status.waiting)await new Promise(r=>setImmediate(r));const frame=session.observe();
 const quit=frame.availableChoices.find(c=>c.action.type==='giveUp'),pause=frame.availableChoices.find(c=>c.action.type==='pause');
 session.append({revision:frame.revision,choiceIds:[quit.id,pause.id,pause.id],delayMs:[100,100,100],reasons:['오늘은 여기까지 한다','대기','대기']});
 const chosen=await pending;assert.equal(chosen.action.type,'giveUp');session.recordAccepted();session.complete();
 assert.equal(session.status.acceptedActions,100);assert.equal(session.status.complete,true);assert.equal(session.status.waiting,false);
 assert.deepEqual(await session.awaitObserve(),{status:'complete'});
});
test('unchanged observation consumes a three-action conditional batch without another revision',async()=>{
 const {guard}=setup(), persona=getPersona('careful-checker'), state={observedThisVisit:{discoveries:{anchors:[]},currentAnchor:null,traveledEdges:[]}}, session=new ActorPlanSession();
 const obs=guard.observeActor(), first=session.decide(obs,[],persona,{},state); while(!session.status.waiting) await new Promise(r=>setImmediate(r));
 const frame=session.observe(), pause=frame.availableChoices.find(c=>c.action.type==='pause');
 session.append({revision:frame.revision,choiceIds:[pause.id,pause.id,pause.id],delayMs:[100,200,300],reasons:['잠시 멈춘다','조금 더 기다린다','계속 기다린다']});
 const one=await first; assert.equal(one.action.type,'pause');
 const afterOne={...obs,sequence:obs.sequence+1,elapsedMs:(obs.elapsedMs??0)+500,result:{accepted:true,actionType:'pause'}};
 const two=await session.decide(afterOne,[one],persona,{},state); const three=await session.decide({...afterOne,sequence:afterOne.sequence+1,elapsedMs:afterOne.elapsedMs+500},[one,two],persona,{},state);
 assert.equal(two.action.type,'pause'); assert.equal(three.action.type,'pause'); assert.equal(session.status.revision,1); assert.equal(session.status.waiting,false);
 session.recordAccepted();session.recordAccepted();session.recordAccepted();assert.equal(session.status.acceptedActions,3);session.close();
});
test('actor wire projection removes repeated choice effects/context while retaining persona and memory cues',async()=>{
 const {guard}=setup(),session=new ActorPlanSession(),persona=getPersona('careful-checker'),state={observedThisVisit:{discoveries:{anchors:[]},currentAnchor:null,traveledEdges:[]}};
 const pending=session.decide(guard.observeActor(),[],persona,{},state);while(!session.status.waiting)await new Promise(r=>setImmediate(r));const frame=session.observe();
 const fullChoices=require('../src/actorChoices.ts').extendedActorChoices(frame.observation);
 const legacyBytes=Buffer.byteLength(JSON.stringify({observation:frame.observation,persona:{id:persona.id,version:persona.version,name:persona.name,description:persona.description,character:persona.character},experience:state,activity:{},availableChoices:fullChoices}));
 const currentBytes=Buffer.byteLength(JSON.stringify(frame));
 assert.ok(currentBytes<legacyBytes,`${currentBytes} should be below ${legacyBytes}`);
 assert.ok(frame.persona.character.selectedTraits.length);assert.deepEqual(frame.experience,state);assert.ok(frame.availableChoices.every(c=>!('effect'in c)&&!('observedContext'in c)));
 assert.ok(frame.choiceSemantics.pauseAndLookAround);assert.ok(frame.availableChoices.every(c=>frame.observation.anchors.some(a=>a.id===c.action.anchorId)||c.action.type!=='walkToAnchor'));
 session.append({revision:frame.revision,choiceIds:[frame.availableChoices[0].id],delayMs:[100],reasons:['테스트 선택']});await pending;session.close();
});
