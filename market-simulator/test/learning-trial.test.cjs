'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
require('../runtime.cjs');
const {createMarketSession} = require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot,marketReplayTraceId,marketReplayFingerprint} = require('../../frontend/src/game/marketReplayTrace.ts');
const {buildMarketScenarioMission} = require('../../frontend/src/game/scenarios.ts');
const {getPersona} = require('../src/personas.ts');
const {generateTrace} = require('../src/simulator.ts');
const {createLearner,readLearner,recordLearnerRound} = require('../learner-store.cjs');
const {createTrial,readTrial,prepareNextRound,recordTrialRound,recordTrialFailure,compareTrial} = require('../learning-trial.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const PERSONA = 'mild-intellectual-disability-adult';
const MODEL = 'unit-test-model';
const POLICY = 'episodic-choice-v9';
let basePromise;
async function baseFixture() {
  basePromise ??= (async () => {
    const mission = buildMarketScenarioMission('S01');
    const config = {seed:'trial-contract',objectives:mission.objectives.map(({productId,quantity})=>({productId,quantity,match:'exact'})),
      environment:{cashierCount:2}};
    // Small coordinator fixture: start at a staffed checkout. No exploration or network
    // model is needed to test persistence, evidence linkage, and comparison arithmetic.
    const environment = clone(createMarketSession(config).environment);
    environment.spawn = {...environment.checkout.point};
    const snapshot = createMarketReplaySnapshot(createMarketSession(config,environment),mission);
    const actions = [{type:'readList',durationMs:100},{type:'viewHelp'},{type:'closeView'},{type:'checkout',checkoutId:'checkout'},{type:'submit'}];
    let calls = 0;
    const trace = await generateTrace({personaId:PERSONA,seed:'trial-unit',snapshot,llm:{model:MODEL},
      actorDecisionProvider:async()=>({action:actions[calls++],delayMs:100,reason:'실험 조정 모듈의 오프라인 테스트 대역'})});
    return {snapshot,trace};
  })();
  return clone(await basePromise);
}
async function trialFixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'market-trial-'));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  const {snapshot,trace} = await baseFixture();
  const trialId = 'unit-trial';
  const personaVersion = getPersona(PERSONA).version;
  const policyVersion = options.policyVersion ?? POLICY;
  const arms = Object.fromEntries(['A','B','C'].map(arm => [arm, createLearner({directory,identity:{learnerId:`learner-${arm}`,
    memberId:`member-${arm}`,personaId:PERSONA,personaVersion,experimentId:trialId,arm,model:MODEL,policyVersion}})]));
  const created = createTrial({directory,trialId,personaId:PERSONA,personaVersion,model:MODEL,policyVersion,
    trainingRounds:1,arms,baselineSnapshot:snapshot,...options});
  return {...created,directory,snapshot,trace,arms};
}
function prepare(fixture, arm, more = {}) {
  return prepareNextRound({trialFile:fixture.trialFile,arm,snapshot:fixture.snapshot,...more});
}
function linkedQuest(fixture, arm) {
  const previous = readTrial(fixture.trialFile).arms[arm].rounds.at(-1);
  return {job:{status:'READY',sessionId:previous.sessionId,analysisId:`analysis-${previous.sessionId}`,memberId:`member-${arm}`},
    generation:{source:'AI',analysisId:`analysis-${previous.sessionId}`,profileId:`profile-${arm}`,
      generationId:`generation-${previous.sessionId}`,quest:clone(fixture.snapshot.mission)}};
}
function evidence(fixture, request, cart) {
  // Explicit unit doubles: structural verification is tested here, not live app/model quality.
  const trace = clone(fixture.trace);
  trace.generationPolicy = 'llm';
  trace.generation = {model:MODEL,reproducibility:'captured-trace',actorPolicyVersion:request.generationOptions.learnerIdentity.policyVersion,
    ...(trace.generation.systemCompletion ? {systemCompletion:clone(trace.generation.systemCompletion)} : {}),
    learnerIdentity:clone(request.generationOptions.learnerIdentity),trialBinding:clone(request.generationOptions.trialBinding),
    experienceFingerprint:marketReplayFingerprint(request.generationOptions.attentionExperience)};
  trace.experienceMode = request.generationOptions.attentionExperience.visit;
  trace.seed = request.generationOptions.seed;
  trace.traceId = marketReplayTraceId(trace);
  const snapshot = request.generationOptions.snapshot;
  const sessionId = `session-${request.arm}-${request.phase}-${request.index}`;
  const replay = {replayId:`replay-${sessionId}`,traceId:trace.traceId,
    traceHash:createHash('sha256').update(JSON.stringify(trace)).digest('hex'),snapshotId:snapshot.snapshotId,
    sessionId,memberId:request.expectedMemberId,status:'completed',report:{acknowledged:true,
      completedSteps:trace.steps.map(s=>({id:s.id,type:s.type})),displacementViolations:0,inputViolations:0,
      startedAt:'2026-09-30T01:00:00Z',endedAt:'2026-09-30T01:03:00Z',
      ...(cart === null ? {} : {submission:{source:'app-ui-before-submit',cart:cart ?? Object.fromEntries(snapshot.mission.objectives.map(o=>[o.productId,o.quantity]))}})}};
  const receipt = {sessionId,memberId:replay.memberId,eventCount:100,firstSequence:1,lastSequence:100,
    uniqueSequences:100,uniqueClientEvents:100,endEvents:1,timeReversals:0};
  return {trialFile:fixture.trialFile,arm:request.arm,roundId:request.roundId,trace,snapshot,replay,receipt};
}
function record(fixture, request, cart) { return recordTrialRound(evidence(fixture,request,cart)); }

test('trial isolates learners/accounts and locks scenario/model before execution', async t => {
  const f = await trialFixture(t);
  const request = prepare(f,'A');
  assert.equal(request.phase,'baseline');
  assert.equal(request.generationOptions.mode,'llm');
  assert.equal(request.generationOptions.llm.model,MODEL);
  assert.equal(request.generationOptions.llm.maxCalls,300);
  assert.equal(request.generationOptions.maxActions,1000);
  assert.equal(request.generationOptions.attentionExperience.visit,'first-play');
  assert.deepEqual(prepare(f,'A'),request);
  const changed = createMarketReplaySnapshot(createMarketSession({seed:'different',objectives:f.snapshot.config.objectives}),buildMarketScenarioMission('S01'));
  assert.throws(()=>prepare(f,'A',{snapshot:changed}),/different snapshot/);
  assert.equal(readLearner(f.arms.A.learnerFile).rounds.length,0);
});

test('adaptive training waits for the last session READY and rejects fallback/stale/cross-arm content', async t => {
  const f = await trialFixture(t);
  record(f,prepare(f,'B'));
  const linked = linkedQuest(f,'B');
  assert.throws(()=>prepare(f,'B'),/not ready/);
  const pendingFailure = recordTrialFailure({trialFile:f.trialFile,arm:'B',roundId:'unit-trial:B:training:1',stage:'analysis',code:'ANALYSIS_TIMEOUT'});
  assert.equal(pendingFailure.waitingForAnalysis,true);
  assert.equal(pendingFailure.previousSessionId,linked.job.sessionId);
  assert.equal(readTrial(f.trialFile).arms.B.rounds.length,1);
  for (const status of ['QUEUED','RUNNING','FAILED']) {
    assert.throws(()=>prepare(f,'B',{...linked,job:{...linked.job,status}}),/not ready/);
  }
  assert.throws(()=>prepare(f,'B',{...linked,job:{...linked.job,sessionId:'old'}}),/not ready/);
  assert.throws(()=>prepare(f,'B',{...linked,generation:{...linked.generation,source:'STATIC'}}),/not an AI/);
  assert.throws(()=>prepare(f,'B',{...linked,generation:{...linked.generation,analysisId:'old'}}),/not an AI/);
  assert.throws(()=>prepare(f,'B',{...linked,job:{...linked.job,memberId:'member-C'}}),/account/);
  const wrong = clone(linked); wrong.generation.quest.title += ' 다른 퀘스트';
  assert.throws(()=>prepare(f,'B',wrong),/not the linked AI quest/);
  const request = prepare(f,'B',linked);
  assert.equal(request.phase,'training');
  assert.equal(request.linkage.previousSessionId,linked.job.sessionId);
  assert.equal(request.generationOptions.attentionExperience.visit,'revisit');
});

test('C retains measurement evidence but never carries prior memory into another round', async t => {
  const f = await trialFixture(t);
  record(f,prepare(f,'C'));
  assert.equal(readLearner(f.arms.C.learnerFile).rounds.length,1);
  const training = prepare(f,'C',linkedQuest(f,'C'));
  assert.deepEqual(training.generationOptions.attentionExperience,{visit:'first-play'});
  record(f,training);
  const probe = prepare(f,'C');
  assert.equal(probe.phase,'probe');
  assert.deepEqual(probe.generationOptions.attentionExperience,{visit:'first-play'});
});

test('only completed replay and DB evidence advance a round; incorrect submission is an outcome', async t => {
  const f = await trialFixture(t);
  const request = prepare(f,'A');
  const input = evidence(f,request,{});
  assert.throws(()=>recordTrialRound({...input,replay:{...input.replay,status:'failed'}}),/did not complete/);
  assert.throws(()=>recordTrialRound({...input,receipt:{...input.receipt,endEvents:0}}),/database/);
  assert.throws(()=>recordTrialRound({...input,replay:{...input.replay,memberId:'member-B'}}),/another trial arm/);
  const wrongActor = clone(input); wrongActor.trace.generation.model = 'another-model';
  assert.throws(()=>recordTrialRound(wrongActor),/Actor\/model\/version/);
  for (const field of ['experienceFingerprint','trialBinding','learnerIdentity']) {
    const altered = clone(input); delete altered.trace.generation[field];
    assert.throws(()=>recordTrialRound(altered),/not bound to the prepared/);
  }
  const differentSeed = clone(input); differentSeed.trace.seed = 'another-seed';
  assert.throws(()=>recordTrialRound(differentSeed),/not bound to the prepared/);
  assert.equal(readTrial(f.trialFile).arms.A.rounds.length,0);
  const result = recordTrialRound(input);
  assert.equal(result.round.status,'submitted');
  assert.equal(result.round.metrics.exact,false);
  assert.ok(result.round.metrics.missingUnits > 0);
  assert.equal(prepare(f,'A').phase,'training');
  assert.equal(recordTrialRound(input).idempotent,true);
  assert.throws(()=>recordTrialRound({...input,options:{different:true}}),/cannot be replaced/);
});

test('technical generation failure is retryable and never counted as an incorrect purchase', async t => {
  const f = await trialFixture(t);
  const request = prepare(f,'A');
  const result = recordTrialFailure({trialFile:f.trialFile,arm:'A',roundId:request.roundId,stage:'generation',code:'MODEL_TIMEOUT'});
  assert.equal(result.roundAdvanced,false);
  assert.deepEqual(result.retry,request);
  const report = compareTrial({trialFile:f.trialFile});
  assert.equal(report.arms.A.rounds.length,0);
  assert.equal(report.arms.A.technicalFailures[0].outcome,'technical-failure');
  assert.equal(report.arms.A.paired.included,false);
  assert.equal(report.contrasts.personalization.included,false);
});

test('the 100-action ending is an incomplete observation, not a learner round or scored failure',async t=>{
  const f = await trialFixture(t,{policyVersion:'episodic-choice-v8'}), request = prepare(f,'A'), input = evidence(f,request,null);
  input.trace.steps.at(-3).type = 'giveUp'; input.trace.steps.at(-2).type = 'skipRating';
  input.trace.steps = [input.trace.steps[0], ...Array.from({length:100},(_,i)=>({id:`observed-${i+1}`,
    type:'lookAround',reactionDelayMs:100,timeoutMs:1000,durationMs:100,reason:'명시적 테스트 관찰'})), ...input.trace.steps.slice(-3)];
  input.trace.generation.controlledStop = {reason:'action-limit',afterDecisions:100,actionLimit:100};
  input.trace.traceId = marketReplayTraceId(input.trace);
  input.replay.traceId = input.trace.traceId;
  input.replay.traceHash = createHash('sha256').update(JSON.stringify(input.trace)).digest('hex');
  input.replay.report.completedSteps = input.trace.steps.map(s=>({id:s.id,type:s.type}));
  const result = recordTrialRound(input);
  assert.equal(result.roundAdvanced,false); assert.equal(result.round,undefined);
  assert.equal(result.attempt.outcome,'system-intervention');
  assert.equal(result.attempt.code,'ACTOR_ACTION_LIMIT');
  assert.equal(result.attempt.measurement.completion,'action-limit-incomplete');
  assert.equal(result.attempt.measurement.purchase,null);
  assert.equal(result.attempt.measurement.performanceEligible,false);
  assert.equal(readLearner(f.arms.A.learnerFile).rounds.length,0);
  assert.equal(readTrial(f.trialFile).arms.A.rounds.length,0);
  assert.deepEqual(prepare(f,'A'),request);
  assert.equal(recordTrialRound(input).idempotent,true);
  const changed = clone(input); changed.receipt.eventCount++;
  assert.throws(()=>recordTrialRound(changed),/cannot be replaced/);
  const report = compareTrial({trialFile:f.trialFile});
  assert.equal(report.complete,false);
  assert.equal(report.arms.A.completion.systemInterventions,1);
  assert.equal(report.arms.A.completion.remainingRounds,3);
  assert.equal(report.arms.A.rounds.length,0);
  assert.equal(report.arms.A.technicalFailures[0].outcome,'system-intervention');
  assert.equal(report.arms.A.paired.included,false);
  assert.equal(report.contrasts.personalization.included,false);
});

test('assisted submissions advance linked analysis rounds with actor-prefix memory but no independent performance metrics',async t=>{
  const f=await trialFixture(t), request=prepare(f,'B');let calls=0;
  const trace=await generateTrace({...request.generationOptions,actorDecisionProvider:async()=>({
    action:++calls===1?{type:'readList',durationMs:100}:{type:'lookAround',durationMs:100},
    delayMs:100,reason:'자동 계산과 개인 경험 구분 테스트'})});
  const input=evidence({...f,trace},request,{});
  const completion=input.trace.generation.systemCompletion;
  assert.ok(completion);assert.equal(calls,100);
  input.replay.report.systemCompletion={...completion,observedCartAtStart:{},startedAt:'2026-09-30T01:02:00Z',source:'app-ui-before-system-completion'};
  const result=recordTrialRound(input), measurement=result.round.measurement;
  assert.equal(result.round.status,'assisted-submission');
  assert.equal(result.round.metrics,null);
  assert.equal(measurement.outcome,'assisted-completion');
  assert.equal(measurement.performanceEligible,false);
  assert.equal(measurement.learningEligible,true);assert.equal(measurement.learningScope,'actor-prefix');
  assert.equal(measurement.analysisEligible,true);
  assert.equal(measurement.purchase.exact,false);
  assert.ok(measurement.purchase.objectives.some(o=>o.missing>0));
  assert.equal(readLearner(f.arms.B.learnerFile).rounds.length,1);
  assert.equal(recordTrialRound(input).idempotent,true);
  assert.throws(()=>prepare(f,'B'),/not ready/);
  const linked=linkedQuest(f,'B'), training=prepare(f,'B',linked);
  const learning=training.generationOptions.attentionExperience.learning;
  const first=input.trace.steps.findIndex(step=>step.id===completion.firstStepId);
  assert.equal(learning.episodes.length,first);
  assert.ok(learning.episodes.every(e=>e.evidence.stepIndex<first));
  assert.equal(training.linkage.previousSessionId,input.replay.sessionId);
  record(f,training);record(f,prepare(f,'B'));
  const comparison=compareTrial({trialFile:f.trialFile});
  assert.equal(comparison.arms.B.completion.recordedRounds,3);
  assert.equal(comparison.arms.B.completion.assistedSubmissions,1);
  assert.equal(comparison.arms.B.completion.systemInterventions,0);
  assert.equal(comparison.arms.B.paired.included,false);
  assert.equal(comparison.arms.B.paired.reason,'assisted-completion');
  assert.equal(comparison.contrasts.personalization.included,false);
});

test('paired comparisons use common baseline/probe, raw support counts, and no compressed timing', async t => {
  const f = await trialFixture(t);
  for (const arm of ['A','B','C']) {
    record(f,prepare(f,arm),{});
    record(f,prepare(f,arm,arm==='A'?{}:linkedQuest(f,arm)));
    record(f,prepare(f,arm),arm==='C'?{}:undefined);
  }
  const report = compareTrial({trialFile:f.trialFile});
  assert.equal(report.complete,true);
  assert.equal(report.arms.A.paired.delta.exact,1);
  assert.equal(report.arms.C.paired.delta.exact,0);
  assert.equal(report.contrasts.personalization.deltaDifference.exact,0);
  assert.equal(report.contrasts.memory.deltaDifference.exact,1);
  assert.equal(report.interpretation.timingExcluded,true);
  assert.equal(report.arms.A.paired.delta.elapsedMs,undefined);
  assert.equal(typeof report.arms.A.paired.delta.support.helpOpens,'number');
  assert.equal(prepare(f,'A').complete,true);
});

test('unsubmitted probes are disclosed and excluded instead of receiving an invented zero', async t => {
  const f = await trialFixture(t);
  record(f,prepare(f,'A'));
  record(f,prepare(f,'A'));
  record(f,prepare(f,'A'),null);
  const report = compareTrial({trialFile:f.trialFile});
  assert.equal(report.arms.A.rounds.at(-1).status,'completed-without-submission');
  assert.equal(report.arms.A.rounds.at(-1).metrics.exact,null);
  assert.equal(report.arms.A.paired.reason,'missing-actual-submission');
});

test('altered artifact cannot silently change the trial lock', async t => {
  const f = await trialFixture(t);
  const state = readTrial(f.trialFile); state.locks.model = 'changed';
  fs.writeFileSync(f.trialFile,JSON.stringify(state));
  assert.throws(()=>readTrial(f.trialFile),/integrity/);
});

test('recording resumes after learner persistence without counting a second execution', async t => {
  const f = await trialFixture(t);
  const request = prepare(f,'A');
  const input = evidence(f,request);
  recordLearnerRound({learnerFile:f.arms.A.learnerFile,...input});
  assert.throws(()=>prepare(f,'A'),/rounds outside this trial/);
  const result = recordTrialRound(input);
  assert.equal(result.idempotent,false);
  assert.equal(readLearner(f.arms.A.learnerFile).rounds.length,1);
  assert.equal(readTrial(f.trialFile).arms.A.rounds.length,1);
  assert.equal(prepare(f,'A').phase,'training');
});

test('prepared options generate a bound trace through the real generator with an offline actor double', async t => {
  const f = await trialFixture(t), request = prepare(f,'A');
  let step = 0;
  const actions = [{type:'readList',durationMs:100},{type:'checkout',checkoutId:'checkout'},{type:'submit'}];
  const trace = await generateTrace({...request.generationOptions,
    actorDecisionProvider:async()=>({action:actions[step++],delayMs:100,reason:'실제 생성기와 실험 바인딩 통합 테스트'})});
  const input = evidence(f,request);
  input.trace = trace;
  input.replay.traceId = trace.traceId;
  input.replay.traceHash = createHash('sha256').update(JSON.stringify(trace)).digest('hex');
  input.replay.report.completedSteps = trace.steps.map(s=>({id:s.id,type:s.type}));
  assert.equal(recordTrialRound(input).round.status,'submitted');
});

test('live writer locks are respected and dead writer locks are recoverable', async t => {
  const f = await trialFixture(t), lock = `${f.trialFile}.lock`;
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token:'live-owner'}));
  assert.throws(()=>prepare(f,'A'),/Trial is busy/);
  assert.equal(fs.existsSync(lock),true);
  fs.unlinkSync(lock);
  const dead = require('node:child_process').spawnSync(process.execPath,['-e','process.exit(0)']);
  assert.equal(dead.status,0);
  fs.writeFileSync(lock,JSON.stringify({pid:dead.pid,token:'dead-owner'}));
  assert.equal(prepare(f,'A').phase,'baseline');
  assert.equal(fs.existsSync(lock),false);
});
