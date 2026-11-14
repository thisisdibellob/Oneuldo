const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');require('../runtime.cjs');
const {TraceGuard}=require('../src/traceValidation.ts');
const {extendedActorChoices}=require('../src/actorChoices.ts');
const {ActorLearningMemory,validateLearning}=require('../src/actorLearning.ts');
const {ConfirmedSpatialRecorder,navigationGeometryKey}=require('../src/confirmedSpatialMemory.ts');
const {confirmedExperience}=require('../pilot-evidence.cjs');
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {isNearMarketStation}=require('../../frontend/src/game/marketEnvironment.ts');
const {wholeReplayWaypointCatalog,canApproachVisibleStation,DEFAULT_REPLAY_PRESENTATION}=require('../../frontend/src/game/marketReplayPerception.ts');
const {createMarketReplaySnapshot,marketReplayTraceId,marketReplayFingerprint,validateMarketReplayTrace}=require('../../frontend/src/game/marketReplayTrace.ts');
const identity={learnerId:'v11-spatial',memberId:'technical-member',personaId:'adult-minjae-unit-support-research-v2',personaVersion:'research-learning-v2',experimentId:'technical-spatial-fixture',arm:'A',model:'gpt-6-luna',reasoningEffort:'low',policyVersion:'episodic-choice-v11'};
const config={seed:'v11-approach',environment:{layoutId:'classic',employeeCount:1,pillarCount:0,chairCount:0,cashierCount:2,kioskLane:'none',shelfOrder:['drink','meal','household','fresh','produce']}};
const presentation={...DEFAULT_REPLAY_PRESENTATION,viewport:{width:1280,height:720}};
const step=(type,extra={})=>({id:type,type,reactionDelayMs:1,timeoutMs:120000,reason:'Explicit technical fixture; not a persona play',...extra});
const movement={style:'steady',speedMultiplier:1,motorSeed:'fixture',running:false,accelerationMs:100};
function fixture(){
 const initial=createMarketSession(config),env=initial.environment;
 const candidate=wholeReplayWaypointCatalog(env).find(p=>canApproachVisibleStation(env,p.point,'fresh',presentation)&&!isNearMarketStation(env,'fresh',p.point));
 assert.ok(candidate,'A visible clear-segment target exists before interaction range');
 const environment={...env,spawn:candidate.point};
 return createMarketReplaySnapshot(createMarketSession(config,environment),undefined,presentation);
}
function guard(snapshot,v11=true){return new TraceGuard(snapshot,identity.personaId,identity.personaVersion,'gpt-6-luna',true,true,false,false,false,false,true,false,undefined,v11);}
function traceFor(snapshot,steps){
 const trace={traceSchemaVersion:'2',traceId:'',personaId:identity.personaId,personaVersion:identity.personaVersion,seed:'fixture',generationPolicy:'llm',policyVersion:'6',experienceMode:'first-play',
  attentionExperience:{layoutKey:marketReplayFingerprint(snapshot.environment),memory:{version:'1',stations:[],anchors:[],knownProducts:[],controlsPracticed:[]},source:'planned-trace'},
  generation:{model:'gpt-6-luna',reasoningEffort:'low',reproducibility:'captured-trace',actorPolicyVersion:'episodic-choice-v11',learnerIdentity:identity},target:{snapshotId:snapshot.snapshotId,completionMode:'ai-review'},steps:steps.map((s,i)=>({...s,id:`step-${i}`}))};
 trace.traceId=marketReplayTraceId(trace);return trace;
}
function evidence(trace,snapshot){
 const replay={replayId:'technical-replay',sessionId:'technical-session',memberId:identity.memberId,traceId:trace.traceId,traceHash:createHash('sha256').update(JSON.stringify(trace)).digest('hex'),snapshotId:snapshot.snapshotId,status:'completed',report:{acknowledged:true,completedSteps:trace.steps.map(s=>({id:s.id,type:s.type})),inputViolations:0,displacementViolations:0}};
 const receipt={sessionId:replay.sessionId,memberId:replay.memberId,eventCount:10,firstSequence:1,lastSequence:10,uniqueSequences:10,uniqueClientEvents:10,endEvents:1,timeReversals:0};return {replay,receipt};
}
test('v11 offers a visible non-near shelf approach, walks ordinary inputs, and leaves opening to a separate choice',()=>{
 const snapshot=fixture(),g=guard(snapshot),old=guard(snapshot,false),o=g.observeActor();
 const target=o.visibleStations.find(s=>s.id==='fresh');assert.equal(target.near,false);assert.equal(target.approachable,true);
 assert.equal(extendedActorChoices(o).some(c=>c.action.type==='interact'&&c.action.station==='fresh'),false);
 const approach=extendedActorChoices(o).find(c=>c.action.type==='walkTo'&&c.action.station==='fresh');assert.ok(approach);assert.match(approach.label,/보이는 냉장 식품/);
 assert.equal(extendedActorChoices(old.observeActor()).some(c=>c.action.type==='walkTo'),false);
 const walk=step('walkTo',{target:{stationId:'fresh'},movement});assert.throws(()=>old.execute(walk),/visible reachable/);
 const before=g.observe().playerPosition,applied=g.execute(walk),after=g.observeActor();
 assert.ok(applied.actions.length>1&&applied.actions.every(a=>a.type==='move'));assert.notDeepEqual(g.observe().playerPosition,before);
 assert.equal(after.visibleStations.find(s=>s.id==='fresh').near,true);assert.equal(after.products.length,0);
 assert.ok(extendedActorChoices(after).some(c=>c.action.type==='interact'&&c.action.station==='fresh'));
 g.execute(step('openShelf',{stationId:'fresh'}));assert.ok(g.observeActor().products.length>0);
 assert.equal(JSON.stringify(o).includes('playerPosition'),false);assert.equal(JSON.stringify(o).includes('acceptedProductIds'),false);
});
test('v11 refuses an unseen destination and keeps legacy choice IDs/actions unchanged without opt-in',()=>{
 const snapshot=fixture(),g=guard(snapshot);const unseen=snapshot.environment.stationDetails.find(s=>!g.observeActor().visibleStations.some(v=>v.id===s.id));assert.ok(unseen);
 assert.throws(()=>g.execute(step('walkTo',{target:{stationId:unseen.id},movement})),/visible reachable/);
 const o=guard(snapshot,false).observeActor();assert.equal(o.visibleApproachEnabled,undefined);
 assert.deepEqual(extendedActorChoices(o),extendedActorChoices({...o,visibleApproachEnabled:undefined}));
});
test('confirmed spatial memory is reconstructed from verified actor steps with semantic route and per-step provenance',()=>{
 const snapshot=fixture(),trace=traceFor(snapshot,[step('start'),step('walkTo',{target:{stationId:'fresh'},movement}),step('openShelf',{stationId:'fresh'}),step('closeStation'),step('giveUp'),step('skipRating'),step('leave')]);
 assert.deepEqual(validateMarketReplayTrace(trace,snapshot),{valid:true,errors:[]});
 const {replay,receipt}=evidence(trace,snapshot),experience=confirmedExperience(trace,snapshot,replay,receipt,undefined,{identity});
 assert.equal(experience.provenance.spatialMemoryRetained,true);validateLearning(experience.learning);
 const spatial=experience.learning.spatial;assert.equal(spatial.routes.length,1);assert.equal(spatial.routes[0].to,'fresh');assert.equal(spatial.routes[0].label,'냉장 식품');
 assert.equal(spatial.routes[0].evidence.stepId,'step-1');assert.equal(spatial.routes[0].evidence.replayId,replay.replayId);
 assert.ok(spatial.stations.some(s=>s.id==='fresh'&&s.visits===1));assert.ok(experience.learning.episodes.find(e=>e.action==='walkTo').result.includes('Walked toward observed'));
 const same=new ActorLearningMemory(experience.learning,true,{layoutKey:spatial.layoutKey,navigationKey:spatial.navigationKey,spatialEnabled:true}).getState();assert.equal(same.previousSpatialExperience.layoutMatches,true);assert.equal(same.previousSpatialExperience.routes.length,1);
 const changed=new ActorLearningMemory(experience.learning,true,{layoutKey:'another-actual-layout',spatialEnabled:true}).getState();assert.equal(changed.previousSpatialExperience.layoutMatches,false);assert.deepEqual(changed.previousSpatialExperience.routes,[]);assert.equal(changed.observedThisVisit.discoveries.stations.length,0);assert.ok(changed.previousSpatialExperience.historicalLandmarks.some(s=>s.label==='냉장 식품'));
 assert.equal(JSON.stringify(spatial).includes('playerPosition'),false);assert.equal(JSON.stringify(spatial).includes('"x"'),false);
 assert.throws(()=>validateLearning({...experience.learning,spatial:{...spatial,hiddenMap:{x:1}}}));
 assert.throws(()=>confirmedExperience(trace,snapshot,{...replay,status:'failed'},receipt,undefined,{identity}),/did not complete/);
});
test('spatial archive bounds route history and clears reusable routes on a layout change while retaining historical labels',()=>{
 const snapshot=fixture(),g=guard(snapshot),o=g.observeActor(),routeTarget=o.anchors[0];const recorder=new ConfirmedSpatialRecorder('layout-A');
 const movementStep=step('walkToAnchor',{target:{anchorId:routeTarget.id},movement});
 for(let i=0;i<60;i++)recorder.record(movementStep,o,o,{sessionId:'s',replayId:'r',traceId:'t',stepId:`step-${i}`,stepIndex:i});
 const saved=recorder.snapshot();assert.equal(saved.routes.length,48);
 const changed=new ConfirmedSpatialRecorder('layout-B',saved,{sessionId:'s',replayId:'r'}).snapshot();assert.equal(changed.routes.length,0);assert.equal(changed.stations.length,0);assert.equal(changed.previousLayouts[0].routeCount,48);assert.ok(changed.previousLayouts[0].landmarkLabels.length>0);
});
test('a landmark first exposed by A to B movement is bound to arrival B with the executed step evidence',()=>{
 const snapshot=fixture(),o=guard(snapshot).observeActor(),a=o.anchors[0],b=o.anchors[1];assert.ok(a&&b);
 const initial={...o,visibleStations:[]},recorder=new ConfirmedSpatialRecorder('arrival-layout');
 recorder.record(step('walkToAnchor',{target:{anchorId:a.id},movement}),initial,initial,{sessionId:'s',replayId:'r',traceId:'t',stepId:'to-A',stepIndex:1});
 const newlySeen={id:'fresh',label:'냉장 식품',kind:'shelf',direction:'north',distanceBand:'far',near:false};
 recorder.record(step('walkToAnchor',{target:{anchorId:b.id},movement}),initial,{...initial,visibleStations:[newlySeen]},
  {sessionId:'s',replayId:'r',traceId:'t',stepId:'A-to-B',stepIndex:2});
 const saved=recorder.snapshot();assert.equal(saved.stations.find(s=>s.id==='fresh').anchorId,b.id);
 assert.equal(saved.routes.at(-1).from,a.id);assert.equal(saved.routes.at(-1).to,b.id);assert.equal(saved.routes.at(-1).evidence.stepId,'A-to-B');
});
test('category swaps preserve verified passage edges but never relocate remembered category landmarks; changed walkability invalidates routes',()=>{
 const snapshot=fixture(),o=guard(snapshot).observeActor(),anchor=o.anchors[0],layoutKey=marketReplayFingerprint(snapshot.environment),nav=navigationGeometryKey(snapshot.environment);
 const recorder=new ConfirmedSpatialRecorder(layoutKey,undefined,undefined,nav);
 recorder.record(step('walkToAnchor',{target:{anchorId:anchor.id},movement}),o,o,{sessionId:'s',replayId:'r',traceId:'t',stepId:'walk',stepIndex:1},nav);const saved=recorder.snapshot();
 const swapped={...createMarketSession({...config,environment:{...config.environment,shelfOrder:['meal','drink','household','fresh','produce']}}).environment,spawn:snapshot.environment.spawn};
 const swappedLayout=marketReplayFingerprint(swapped),sameNavigation=navigationGeometryKey(swapped);assert.notEqual(swappedLayout,layoutKey);assert.equal(sameNavigation,nav);
 const retained=new ConfirmedSpatialRecorder(swappedLayout,saved,{sessionId:'s',replayId:'r'},sameNavigation).snapshot();assert.equal(retained.routes.length,1);assert.ok(retained.anchors.length);assert.deepEqual(retained.stations,[]);assert.deepEqual(retained.routes[0].seenStationIds,[]);
 const learning={version:'2',source:'confirmed-app-replay',...identity,sessionId:'s',replayId:'r',episodes:[],spatial:saved};
 const memory=new ActorLearningMemory(learning,true,{layoutKey:swappedLayout,navigationKey:sameNavigation,spatialEnabled:true}).getState();assert.equal(memory.previousSpatialExperience.layoutMatches,false);assert.equal(memory.previousSpatialExperience.navigationMatches,true);assert.equal(memory.previousSpatialExperience.routes.length,1);assert.equal(memory.observedThisVisit.discoveries.stations.length,0);assert.ok(memory.previousSpatialExperience.historicalLandmarks.length);
 const blocked={...swapped,obstacles:[...swapped.obstacles,{x:500,y:1200,width:30,height:30}]};const changedNavigation=navigationGeometryKey(blocked);assert.notEqual(changedNavigation,nav);
 const invalidated=new ConfirmedSpatialRecorder(marketReplayFingerprint(blocked),saved,{sessionId:'s',replayId:'r'},changedNavigation).snapshot();assert.deepEqual(invalidated.routes,[]);assert.deepEqual(invalidated.anchors,[]);
 assert.notEqual(navigationGeometryKey(snapshot.environment,{checkout:false,'checkout-2':false}),navigationGeometryKey(snapshot.environment,{checkout:true,'checkout-2':true}));
});
test('system completion permits exactly 200 decisions for v11 and preserves legacy 100',()=>{
 function completion(policy,limit){
  const snapshot=fixture(),trace=traceFor(snapshot,[step('start'),...Array.from({length:limit},(_,i)=>step('pause',{durationMs:100})),step('walkTo',{target:{stationId:'checkout'},movement}),step('checkout',{checkoutId:'checkout'}),step('submitForReview'),step('awaitReviewAccepted'),step('leave')]);
  trace.generation.actorPolicyVersion=policy;trace.generation.learnerIdentity={...identity,policyVersion:policy};trace.generation.systemCompletion={reason:'action-limit',afterDecisions:limit,actionLimit:limit,firstStepId:trace.steps[limit+1].id,checkoutId:'checkout',cartAtStart:{}};
  trace.traceId=marketReplayTraceId(trace);return validateMarketReplayTrace(trace);
 }
 assert.equal(completion('episodic-choice-v11',200).valid,true);assert.equal(completion('episodic-choice-v11',100).valid,false);
 assert.equal(completion('episodic-choice-v10',100).valid,true);assert.equal(completion('episodic-choice-v10',200).valid,false);
});
