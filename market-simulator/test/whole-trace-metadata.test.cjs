'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
require('../runtime.cjs');
const {createMarketSession} = require('../../frontend/src/game/marketSession.ts');
const {buildMarketScenarioMission} = require('../../frontend/src/game/scenarios.ts');
const {createMarketReplaySnapshot, marketReplayTraceId, canonicalMarketReplayJson,
  validateMarketReplayTrace, isMarketReplaySystemCompletionStep} = require('../../frontend/src/game/marketReplayTrace.ts');
const {generateTrace, validateTrace} = require('../src/simulator.ts');
const {getPersona} = require('../src/personas.ts');
const {validateLearnerIdentity, assertLearnerIdentity, assertPersonaLearningEligible} = require('../src/actorLearning.ts');
const {createLearner, readLearner, getLearnerExperience} = require('../learner-store.cjs');
const {createTrial, prepareNextRound, recordTrialRound} = require('../learning-trial.cjs');
const PERSONA = 'mild-intellectual-disability-adult';
const POLICY = 'whole-trace-v3';
const MODEL = 'gpt-6-luna';
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
function snapshot() {
  const mission = buildMarketScenarioMission('S01');
  return createMarketReplaySnapshot(createMarketSession({seed:'whole-metadata',
    objectives:mission.objectives.map(({productId, quantity}) => ({productId, quantity, match:'exact'}))}), mission);
}
function options(extra = {}) {
  let index = 0;
  const actions = [{type:'readList', durationMs:100}, {type:'lookAround', durationMs:100}, {type:'giveUp'}];
  return {personaId:PERSONA, seed:'whole-metadata', snapshot:snapshot(), mode:'llm', maxActions:100, timingProfile:'original',
    llm:{model:MODEL, maxCalls:1}, tracePolicyVersion:'6', actorPolicyVersion:POLICY, reasoningEffort:'low',
    planningMode:'whole-trace', planningSubmissions:2, repairSubmissions:1,
    actorDecisionProvider:async () => ({action:actions[index++], delayMs:100, reason:'오프라인 원샷 메타데이터 계약 테스트'}),
    ...extra};
}
function mutated(trace, change) {
  const copy = clone(trace); change(copy); copy.traceId = marketReplayTraceId(copy); return copy;
}

test('whole-trace records explicit scope/submissions and does not charge each local decision as a model submission', async () => {
  const settings = options();
  const trace = await generateTrace(settings);
  assert.equal(trace.traceSchemaVersion, '2');
  assert.equal(trace.policyVersion, '6');
  assert.equal(trace.generation.actorStateVersion, '1');
  assert.equal(trace.generation.timingProfile, 'actor-preserved-v1');
  assert.deepEqual({model:trace.generation.model, policy:trace.generation.actorPolicyVersion,
    reasoning:trace.generation.reasoningEffort, mode:trace.generation.planningMode,
    scope:trace.generation.observationScope, knowledge:trace.generation.actorKnowledgeScope, submissions:trace.generation.planningSubmissions,
    repairs:trace.generation.repairSubmissions},
  {model:MODEL, policy:POLICY, reasoning:'low', mode:'whole-trace', scope:'whole-world', knowledge:'observed-and-remembered', submissions:2, repairs:1});
  assert.deepEqual(trace.steps.map(s => s.type), ['start','readList','lookAround','giveUp','skipRating','leave']);
  assert.deepEqual(validateTrace(trace, settings.snapshot), {valid:true, errors:[]});
  await assert.rejects(generateTrace(options({planningMode:undefined, planningSubmissions:undefined,
    repairSubmissions:undefined, actorPolicyVersion:'episodic-choice-v10'})), /model-call-limit/);
  await assert.rejects(generateTrace(options({maxActions:1})), /action-limit/);
});

test('whole-trace options cannot omit policy/model/reasoning/provider or claim impossible submission counts', async () => {
  for (const extra of [
    {planningMode:undefined}, {actorPolicyVersion:'episodic-choice-v10'}, {actorPolicyVersion:'whole-trace-v1'}, {actorPolicyVersion:'whole-trace-v2'}, {reasoningEffort:undefined},
    {tracePolicyVersion:'5'}, {llm:{model:'different-model'}}, {actorDecisionProvider:undefined},
    {planningSubmissions:0}, {planningSubmissions:1.5}, {planningSubmissions:Infinity}, {planningSubmissions:null},
    {repairSubmissions:-1}, {repairSubmissions:2}, {repairSubmissions:0.5}, {repairSubmissions:null},
  ]) await assert.rejects(generateTrace(options(extra)), /Whole-trace planning/);
});

test('new whole generation defaults to preserving actor judgment delays and rejects explicit compact timing', async () => {
  await assert.rejects(generateTrace(options({ timingProfile: 'compact' })), /preserves actor judgment timing/);
  const settings = options({ timingProfile: undefined });
  const trace = await generateTrace(settings);
  assert.equal(trace.generation.timingProfile, 'actor-preserved-v1');
  assert.deepEqual(trace.steps.filter(step => ['readList','lookAround','giveUp'].includes(step.type)).map(step => step.reactionDelayMs), [100,100,100]);
  assert.equal(trace.steps.find(step => step.type === 'readList').durationMs, 100);
  assert.equal(trace.steps.find(step => step.type === 'lookAround').durationMs, 100);
});

test('shared trace validation rejects partial whole metadata, legacy relabelling and learner-policy mixing', async () => {
  const trace = await generateTrace(options());
  const changes = [
    t => delete t.generation.planningMode,
    t => delete t.generation.observationScope,
    t => delete t.generation.actorKnowledgeScope,
    t => delete t.generation.actorStateVersion,
    t => { t.generation.actorStateVersion = 'future'; },
    t => delete t.generation.timingProfile,
    t => { t.generation.timingProfile = 'compact-v1'; },
    t => { t.generation.actorKnowledgeScope = 'whole-world'; },
    t => delete t.generation.planningSubmissions,
    t => delete t.generation.repairSubmissions,
    t => { t.generation.model = 'different-model'; },
    t => delete t.generation.reasoningEffort,
    t => { t.generation.actorPolicyVersion = 'episodic-choice-v10'; },
    t => { t.generationPolicy = 'stochastic'; },
    t => { t.policyVersion = '5'; },
    t => { t.traceSchemaVersion = '1'; },
    t => { t.generation.planningSubmissions = 0; },
    t => { t.generation.repairSubmissions = 2; },
    t => { t.generation.repairSubmissions = 0.5; },
    t => { t.generation.learnerIdentity = identity('A', 'episodic-choice-v10'); },
  ];
  for (const change of changes) {
    const result = validateMarketReplayTrace(mutated(trace, change));
    assert.equal(result.valid, false, JSON.stringify(result));
  }
});

test('whole-trace preserves 100 actor decisions and labels only unchanged-basket checkout as system-owned', async () => {
  let decisions = 0;
  const settings = options({planningSubmissions:1, repairSubmissions:0,
    actorDecisionProvider:async () => { decisions++; return {action:{type:'readList',durationMs:100},
      delayMs:100, reason:'오프라인 100행동 상한 테스트'}; }});
  const trace = await generateTrace(settings);
  assert.equal(decisions, 100);
  const completion = trace.generation.systemCompletion;
  assert.equal(completion.afterDecisions, 100);
  assert.deepEqual(completion.cartAtStart, {});
  assert.equal(trace.generation.controlledStop, undefined);
  assert.equal(isMarketReplaySystemCompletionStep(trace, trace.steps[100].id), false);
  assert.equal(isMarketReplaySystemCompletionStep(trace, completion.firstStepId), true);
  assert.deepEqual(validateTrace(trace, settings.snapshot), {valid:true, errors:[]});
  for (const policy of ['episodic-choice-v9','episodic-choice-v10']) {
    const legacy = mutated(trace, t => {
      t.generation.actorPolicyVersion = policy;
      for (const key of ['planningMode','observationScope','actorKnowledgeScope','actorStateVersion','timingProfile','planningSubmissions','repairSubmissions']) delete t.generation[key];
    });
    assert.equal(validateMarketReplayTrace(legacy, settings.snapshot).valid, true);
  }
  const intervention = mutated(trace, t => {
    const first = t.steps.findIndex(s => s.id === completion.firstStepId);
    t.steps = t.steps.slice(0, first);
    for (const type of ['giveUp','skipRating','leave']) t.steps.push({type,id:`stop-${type}`,
      reactionDelayMs:100, timeoutMs:1000, reason:'시스템 제어 종료 테스트'});
    delete t.generation.systemCompletion;
    t.generation.controlledStop = {reason:'action-limit',afterDecisions:100,actionLimit:100};
  });
  assert.equal(validateMarketReplayTrace(intervention).valid, false);
  assert.throws(() => assertPersonaLearningEligible(intervention), /excluded/);
});

test('already saved whole-trace-v1 and v2 replays retain their explicit metadata and validation compatibility', async () => {
  const settings = options(), trace = await generateTrace(settings);
  for (const policy of ['whole-trace-v1','whole-trace-v2']) {
    const legacy = mutated(trace, t => {
      t.generation.actorPolicyVersion = policy;
      delete t.generation.actorStateVersion;
      delete t.generation.timingProfile;
      if (policy === 'whole-trace-v1') delete t.generation.actorKnowledgeScope;
    });
    assert.equal(legacy.traceSchemaVersion, '2');
    assert.equal(legacy.policyVersion, '6');
    assert.deepEqual(validateTrace(legacy, settings.snapshot), {valid:true, errors:[]});
    assert.deepEqual(validateMarketReplayTrace(legacy, settings.snapshot), {valid:true, errors:[]});
  }
});

function identity(arm, policy = POLICY) {
  return {learnerId:`whole-${arm}`, memberId:`whole-member-${arm}`, personaId:PERSONA,
    personaVersion:getPersona(PERSONA).version, experimentId:'whole-trial', arm,
    model:MODEL, policyVersion:policy, reasoningEffort:'low'};
}
test('whole learner identity requires Luna low and remains distinct from v10', () => {
  validateLearnerIdentity(identity('A'));
  validateLearnerIdentity(identity('A', 'whole-trace-v1'));
  validateLearnerIdentity(identity('A', 'whole-trace-v2'));
  validateLearnerIdentity(identity('A', 'episodic-choice-v10'));
  assert.throws(() => validateLearnerIdentity({...identity('A'), model:'different-model'}), /Whole-trace/);
  assert.throws(() => validateLearnerIdentity({...identity('A'), reasoningEffort:undefined}), /Whole-trace/);
  assert.throws(() => assertLearnerIdentity(identity('A'), identity('A', 'episodic-choice-v10')), /policyVersion/);
  assert.throws(() => assertLearnerIdentity(identity('A'), identity('A', 'whole-trace-v1')), /policyVersion/);
  assert.throws(() => assertLearnerIdentity(identity('A'), identity('A', 'whole-trace-v2')), /policyVersion/);
});

function trialFixture(t, policy = POLICY) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-trace-contract-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  const arms = Object.fromEntries(['A','B','C'].map(arm => [arm,
    createLearner({directory, identity:identity(arm, policy)})]));
  const bound = snapshot();
  const created = createTrial({directory, trialId:'whole-trial', personaId:PERSONA,
    personaVersion:getPersona(PERSONA).version, model:MODEL, policyVersion:policy,
    trainingRounds:1, arms, baselineSnapshot:bound});
  return {...created, arms, snapshot:bound};
}
test('whole trial binds planning mode and defaults; submission repairs do not change the prepared request', async t => {
  const f = trialFixture(t);
  const request = prepareNextRound({trialFile:f.trialFile, arm:'A', snapshot:f.snapshot});
  assert.equal(request.generationOptions.planningMode, 'whole-trace');
  assert.equal(request.generationOptions.maxActions, 100);
  assert.equal(request.generationOptions.llm.maxCalls, 100);
  assert.equal(request.generationOptions.timingProfile, 'original');
  const {trialBinding, ...requestBody} = request.generationOptions;
  assert.equal(hash(requestBody), trialBinding.requestHash);
  const settings = options({...request.generationOptions, tracePolicyVersion:'6',
    actorPolicyVersion:POLICY, reasoningEffort:'low', planningSubmissions:3, repairSubmissions:2});
  const trace = await generateTrace(settings);
  assert.deepEqual(trace.generation.trialBinding, trialBinding);
  assert.equal(trace.generation.planningSubmissions, 3);
  await assert.rejects(generateTrace({...settings, maxActions:99}), /Prepared trial request changed/);
  await assert.rejects(generateTrace({...settings, learnerIdentity:identity('A', 'episodic-choice-v10')}), /identity changed/);
  const replay = {replayId:'whole-offline-replay',sessionId:'whole-offline-session',memberId:request.expectedMemberId,
    traceId:trace.traceId,traceHash:createHash('sha256').update(JSON.stringify(trace)).digest('hex'),
    snapshotId:f.snapshot.snapshotId,status:'completed',report:{acknowledged:true,
      startedAt:'2026-10-08T01:00:00Z',endedAt:'2026-10-08T01:01:00Z',
      completedSteps:trace.steps.map(s => ({id:s.id,type:s.type})),displacementViolations:0,inputViolations:0}};
  const receipt = {sessionId:replay.sessionId,memberId:replay.memberId,eventCount:10,firstSequence:1,lastSequence:10,
    uniqueSequences:10,uniqueClientEvents:10,endEvents:1,timeReversals:0};
  // Explicit offline evidence doubles exercise archive linkage, not actual app or database execution.
  recordTrialRound({trialFile:f.trialFile,arm:'A',roundId:request.roundId,trace,snapshot:f.snapshot,replay,receipt});
  const archived = readLearner(f.arms.A.learnerFile);
  assert.equal(archived.rounds.length, 1);
  assert.equal(archived.identity.policyVersion, POLICY);
  const next = prepareNextRound({trialFile:f.trialFile, arm:'A', snapshot:f.snapshot});
  assert.equal(next.generationOptions.attentionExperience.visit, 'revisit');
  assert.equal(next.generationOptions.attentionExperience.learning.policyVersion, POLICY);
  assert.ok(getLearnerExperience(f.arms.A.learnerFile).learning.episodes
    .every(e => e.source === 'executed-app-action' && e.evidence.replayId === replay.replayId));
});

test('legacy prepared request shape/hash and defaults remain unchanged', t => {
  const f = trialFixture(t, 'episodic-choice-v10');
  const request = prepareNextRound({trialFile:f.trialFile, arm:'A', snapshot:f.snapshot});
  assert.equal(request.generationOptions.maxActions, 1000);
  assert.equal(request.generationOptions.llm.maxCalls, 300);
  assert.equal(Object.hasOwn(request.generationOptions, 'planningMode'), false);
  const expected = {personaId:PERSONA, mode:'llm', seed:'whole-trial:baseline:0', maxActions:1000,
    timingProfile:'compact', snapshot:f.snapshot, llm:{model:MODEL,maxCalls:300},
    learnerIdentity:identity('A','episodic-choice-v10'), attentionExperience:{visit:'first-play'}};
  assert.equal(request.generationOptions.trialBinding.requestHash, hash(expected));
});
