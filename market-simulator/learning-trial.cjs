'use strict';
// Artifact-based experiment coordinator. App navigation, authenticated analysis reads,
// trace generation and replay stay with the caller; this module never fabricates them.
const fs = require('node:fs');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
require('./runtime.cjs');
const {assertPersonaLearningAllowed} = require('./src/personas.ts');
const {canonicalMarketReplayJson, marketReplayFingerprint, validateMarketReplaySnapshot} = require('../frontend/src/game/marketReplayTrace.ts');
const {resolveMarketAiMission} = require('../frontend/src/game/scenarios.ts');
const {measureRound, requirePersonalizedContinuation} = require('./pilot-evidence.cjs');
const ARMS = ['A', 'B', 'C'];
const need = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const learnerStore = () => require('./learner-store.cjs');
const text = (value, name) => need(typeof value === 'string' && value.length > 0 && value.length <= 500, `Invalid ${name}`);

function snapshotCheck(snapshot) {
  const result = validateMarketReplaySnapshot(snapshot);
  need(result.valid && snapshot.mission, `Invalid trial snapshot: ${result.errors.join('; ')}`);
  const objectives = values => values.map(({productId,quantity}) => ({productId,quantity})).sort((a,b) => a.productId.localeCompare(b.productId));
  need(hash(objectives(snapshot.config.objectives)) === hash(objectives(snapshot.mission.objectives)),
    'Displayed mission and actor objectives differ');
  need(snapshot.config.objectives.every(o => (o.match ?? snapshot.config.difficulty) === 'exact'),
    'Trial mission objectives must use the app mission exact-match configuration');
}
function seal(state) {
  const {integrity, ...body} = state;
  return {...body, integrity: hash(body)};
}
function writeState(file, state) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary,'wx',0o600);
    fs.writeFileSync(fd, JSON.stringify(seal(state), null, 2) + '\n');
    fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function claimFile(file, owner) {
  const temporary = `${file}.${owner.token}.tmp`;
  try {
    fs.writeFileSync(temporary,JSON.stringify(owner),{flag:'wx',mode:0o600});
    // Linking complete content avoids leaving a zero-byte lock after interruption.
    fs.linkSync(temporary,file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function claimLock(lock, owner) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { claimFile(lock,owner); return; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    let previous;
    try { previous = JSON.parse(fs.readFileSync(lock,'utf8')); }
    catch { throw new Error('Trial lock is ambiguous; inspect its owner before recovery'); }
    need(Number.isSafeInteger(previous.pid) && previous.pid > 0 && typeof previous.token === 'string', 'Trial lock has no verifiable owner');
    let dead = false;
    try { process.kill(previous.pid,0); }
    catch (error) { if (error.code === 'ESRCH') dead = true; else if (error.code !== 'EPERM') throw error; }
    need(dead,'Trial is busy; retry after the current transition');
    // Serialize stale-owner recovery; do not unlink a lock just acquired by another writer.
    const recovery = `${lock}.recover`;
    try { claimFile(recovery,owner); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Trial lock recovery is busy; inspect a crashed recovery owner'); throw error; }
    try {
      let current; try { current = JSON.parse(fs.readFileSync(lock,'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (current?.pid === previous.pid && current?.token === previous.token) fs.unlinkSync(lock);
    } finally { fs.unlinkSync(recovery); }
  }
  throw new Error('Trial lock contention; retry after the current transition');
}
function withLock(file, work) {
  const lock = `${file}.lock`, owner = {pid:process.pid,token:randomUUID()};
  claimLock(lock,owner);
  try { return work(); }
  finally {
    const current = JSON.parse(fs.readFileSync(lock,'utf8'));
    need(current.pid === owner.pid && current.token === owner.token, 'Trial lock ownership changed');
    fs.unlinkSync(lock);
  }
}

function readTrial(trialFile) {
  const file = path.resolve(trialFile);
  need(fs.lstatSync(file).isFile(), 'Trial artifact must be a regular file');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  const {integrity, ...body} = state;
  need(state.version === '1' && integrity === hash(body), 'Trial artifact integrity mismatch');
  assertPersonaLearningAllowed(state.locks?.personaId);
  need(state.arms && ARMS.every(arm => state.arms[arm]), 'Missing trial arms');
  return state;
}

/** Start with three separate, unused learner accounts. The same initial and evaluation
 * snapshots are shared across arms; A's training tasks are fixed before any outcome. */
function createTrial({directory, trialId, personaId, personaVersion, model, policyVersion,
  trainingRounds = 3, arms, baselineSnapshot, probeSnapshot = baselineSnapshot, fixedTrainingSnapshots, generationLimits = {}}) {
  for (const [key,value] of Object.entries({trialId,personaId,personaVersion,model,policyVersion})) text(value,key);
  assertPersonaLearningAllowed(personaId);
  need(/^[a-zA-Z0-9_-]{1,120}$/.test(trialId), 'trialId must be a portable filename');
  need(Number.isSafeInteger(trainingRounds) && trainingRounds >= 1 && trainingRounds <= 100, 'trainingRounds must be 1..100');
  const wholeTrace = ['whole-trace-v1','whole-trace-v2','whole-trace-v3'].includes(policyVersion);
  const limits = {maxActions:wholeTrace?100:1000,maxCalls:wholeTrace?100:300,timingProfile:policyVersion==='whole-trace-v3'?'original':'compact',...generationLimits};
  need(Object.keys(limits).every(k => ['maxActions','maxCalls','timingProfile','timeBudgetMs'].includes(k)), 'Unknown generation limit');
  for (const key of ['maxActions','maxCalls']) need(Number.isSafeInteger(limits[key]) && limits[key] >= 1 && limits[key] <= 2000, `${key} must be 1..2000`);
  need(['compact','original'].includes(limits.timingProfile), 'Invalid timingProfile');
  if(policyVersion==='whole-trace-v3') need(limits.timingProfile==='original', 'Whole-trace-v3 preserves actor judgment timing; use original');
  if (limits.timeBudgetMs !== undefined) need(Number.isSafeInteger(limits.timeBudgetMs) && limits.timeBudgetMs >= 1000 && limits.timeBudgetMs <= 3600000, 'Invalid timeBudgetMs');
  snapshotCheck(baselineSnapshot); snapshotCheck(probeSnapshot);
  const fixed = fixedTrainingSnapshots ?? Array.from({length:trainingRounds}, () => baselineSnapshot);
  need(Array.isArray(fixed) && fixed.length === trainingRounds, 'Provide one fixed A snapshot per training round');
  fixed.forEach(snapshotCheck);
  const identities = [], armState = {};
  for (const arm of ARMS) {
    need(arms?.[arm]?.learnerFile, `Missing ${arm} learnerFile`);
    const learnerFile = path.resolve(arms[arm].learnerFile);
    const learner = learnerStore().readLearner(learnerFile);
    const identity = learner.identity;
    for (const [key,value] of Object.entries({experimentId:trialId,arm,personaId,personaVersion,model,policyVersion})) {
      need(identity[key] === value, `${arm} learner ${key} differs from trial`);
    }
    need(learner.rounds.length === 0, `${arm} learner must start with no prior rounds`);
    identities.push(identity);
    armState[arm] = {learnerFile, identity:clone(identity), rounds:[], attempts:[], active:null};
  }
  need(new Set(identities.map(i => i.memberId)).size === 3 && new Set(identities.map(i => i.learnerId)).size === 3,
    'A/B/C require distinct learner IDs and test accounts');
  const state = {version:'1', trialId, locks:{personaId,personaVersion,model,policyVersion,trainingRounds,generationLimits:limits},
    conditions:{baselineSnapshot:clone(baselineSnapshot),probeSnapshot:clone(probeSnapshot),fixedTrainingSnapshots:clone(fixed)},
    arms:armState, protocol:{A:'fixed-quests-with-memory',B:'personalized-quests-with-memory',C:'personalized-quests-without-memory',
      generation:'llm', modelTraining:false, execution:'actual-app-replay-and-database', timingUsedForAbility:false,
      comparison:'descriptive paired baseline/probe differences; repeated trials required for effect estimates'}};
  fs.mkdirSync(path.resolve(directory), {recursive:true});
  const trialFile = path.resolve(directory, `${trialId}.trial.json`);
  fs.writeFileSync(trialFile, JSON.stringify(seal(state),null,2)+'\n', {flag:'wx', mode:0o600});
  return {trialFile, state:readTrial(trialFile)};
}

function armOf(state, arm) { need(ARMS.includes(arm), 'Unknown trial arm'); return state.arms[arm]; }
function nextRound(state, arm) {
  const count = arm.rounds.length;
  if (count === 0) return {phase:'baseline', index:0};
  if (count <= state.locks.trainingRounds) return {phase:'training', index:count};
  if (count === state.locks.trainingRounds + 1) return {phase:'probe', index:0};
  return null;
}

function missionConditions(mission) {
  const normalized = mission;
  return Object.fromEntries(['id','scenarioId','catalogVersion','scenarioVersion','title','description','budget',
    'objectives','briefing','checkoutDialogue','successMessage','scene'].filter(k => normalized[k] !== undefined)
    .map(k => [k,normalized[k]]));
}
function checkPersonalized(state, arm, snapshot, job, generation) {
  const previous = arm.rounds.at(-1);
  requirePersonalizedContinuation(job, generation, {sessionId:previous.sessionId});
  if (job.memberId !== undefined) need(job.memberId === arm.identity.memberId, 'Analysis account differs from trial arm');
  if (generation.memberId !== undefined) need(generation.memberId === arm.identity.memberId, 'Quest account differs from trial arm');
  // The same normalizer used by the app resolves accepted variants before comparison.
  need(generation.quest && hash(missionConditions(resolveMarketAiMission(generation.quest))) === hash(missionConditions(snapshot.mission)),
    'Current app snapshot is not the linked AI quest');
  for (const other of Object.values(state.arms)) {
    need(!other.rounds.some(r => r.generation?.generationId === generation.generationId), 'Stale/reused AI quest generation');
    if (other !== arm && other.active) need(other.active.generation?.generationId !== generation.generationId, 'AI quest cannot cross trial arms');
  }
}
function requestFor(state, arm, active) {
  const current = learnerStore().readLearner(arm.learnerFile);
  need(hash(current.identity) === hash(arm.identity), 'Learner identity changed during trial');
  need(current.rounds.length === arm.rounds.length, 'Learner has rounds outside this trial; record or repair the pending trial evidence first');
  const attentionExperience = arm.identity.arm === 'C' ? undefined : learnerStore().getLearnerExperience(arm.learnerFile, arm.identity);
  const {maxCalls,...limits} = state.locks.generationLimits;
  const generationOptions = {personaId:state.locks.personaId, mode:'llm', seed:`${state.trialId}:${active.phase}:${active.index}`,
    ...limits, snapshot:clone(active.snapshot), llm:{model:state.locks.model,maxCalls}, learnerIdentity:clone(arm.identity),
    attentionExperience:attentionExperience ?? {visit:'first-play'},
    ...(['whole-trace-v1','whole-trace-v2','whole-trace-v3'].includes(arm.identity.policyVersion) ? {planningMode:'whole-trace'} : {})};
  const expected = {requestHash:hash(generationOptions), seed:generationOptions.seed,
    experienceFingerprint:marketReplayFingerprint(generationOptions.attentionExperience)};
  if (active.expected) need(hash(active.expected) === hash(expected), 'Prepared experience changed; cannot regenerate this round with different memory');
  else active.expected = expected;
  generationOptions.trialBinding = {trialId:state.trialId,arm:arm.identity.arm,roundId:active.roundId,requestHash:expected.requestHash};
  return {roundId:active.roundId, phase:active.phase, index:active.index, arm:arm.identity.arm,
    learnerFile:arm.learnerFile, expectedMemberId:arm.identity.memberId,
    generationOptions,
    experiencePolicy:arm.identity.arm === 'C' ? 'no-prior-experience' : 'confirmed-executed-experience',
    linkage:active.generation ? {analysisId:active.job.analysisId,generationId:active.generation.generationId,
      profileId:active.generation.profileId,previousSessionId:active.job.sessionId} : null,
    nextAction:'Generate this trace, replay in the expected account, then record the actual replay and DB receipt. No app action has been executed by preparation.'};
}

/** Resume-safe preparation. Personalized training waits for READY and checks the full
 * displayed mission against the AI response; fallback/static or stale quests cannot pass. */
function prepareNextRound({trialFile, arm, snapshot, job, generation}) {
  const file = path.resolve(trialFile);
  return withLock(file, () => {
    const state = readTrial(file), participant = armOf(state,arm), next = nextRound(state,participant);
    if (!next) return {complete:true,arm,nextAction:'All scheduled rounds recorded'};
    snapshotCheck(snapshot);
    if (participant.active) {
      need(hash(participant.active.snapshot) === hash(snapshot), 'A different snapshot is already prepared; record the attempt before retrying');
      if (job !== undefined) need(hash(participant.active.job) === hash(job), 'Prepared analysis binding cannot change');
      if (generation !== undefined) need(hash(participant.active.generation) === hash(generation), 'Prepared quest binding cannot change');
      return requestFor(state,participant,participant.active);
    }
    if (next.phase === 'training' && arm !== 'A') checkPersonalized(state,participant,snapshot,job,generation);
    else {
      const expected = next.phase === 'baseline' ? state.conditions.baselineSnapshot
        : next.phase === 'probe' ? state.conditions.probeSnapshot : state.conditions.fixedTrainingSnapshots[next.index-1];
      need(hash(snapshot) === hash(expected), 'Snapshot differs from the pre-registered fixed/common task');
      need(job === undefined && generation === undefined, 'Fixed/common rounds do not accept adaptive quest substitutions');
    }
    const active = {...next,roundId:`${state.trialId}:${arm}:${next.phase}:${next.index}`,snapshot:clone(snapshot),
      ...(job ? {job:clone(job),generation:clone(generation)} : {})};
    const request = requestFor(state,participant,active);
    participant.active = active; writeState(file,state);
    return request;
  });
}

function roundMetrics(measurement) {
  if (measurement.outcome === 'assisted-completion' && measurement.performanceEligible === false
    && measurement.learningEligible === true && measurement.analysisEligible === true) return null;
  need(measurement.performanceEligible !== false, 'System interventions have no persona performance metrics');
  const p = measurement.purchase, counts = measurement.actionCounts;
  return {submitted:measurement.submitted, exact:p?.exact ?? null,
    exactObjectives:p ? p.objectives.filter(o => o.missing === 0 && o.excess === 0).length : null,
    requestedUnits:p ? p.objectives.reduce((n,o) => n+o.requested,0) : null,
    missingUnits:p ? p.objectives.reduce((n,o) => n+o.missing,0) : null,
    excessUnits:p ? p.objectives.reduce((n,o) => n+o.excess,0) : null,
    offListUnits:p?.offListUnits ?? null, withinBudget:p?.withinBudget ?? null,
    support:{helpOpens:counts.viewHelp ?? 0,listReads:counts.readList ?? 0,cartChecks:counts.viewCart ?? 0},
    completedActions:Object.values(counts).reduce((n,v) => n+v,0),actionCounts:clone(counts)};
}

function recordTrialRound({trialFile,arm,roundId,trace,snapshot,replay,receipt,options = {}}) {
  const file = path.resolve(trialFile);
  return withLock(file, () => {
    const state = readTrial(file), participant = armOf(state,arm);
    const evidenceHash = hash({trace,snapshot,replay,receipt,options});
    const old = participant.rounds.find(r => r.roundId === roundId);
    if (old) { need(old.evidenceHash === evidenceHash, 'Completed round cannot be replaced by different evidence'); return {round:old,idempotent:true}; }
    const intervention = participant.attempts.find(a => a.outcome === 'system-intervention'
      && (a.replayId === replay.replayId || a.sessionId === replay.sessionId));
    if (intervention) {
      need(intervention.roundId === roundId && intervention.evidenceHash === evidenceHash, 'Recorded system intervention cannot be replaced by different evidence');
      return {attempt:intervention,idempotent:true,roundAdvanced:false,complete:false};
    }
    const active = participant.active;
    need(active?.roundId === roundId, 'Prepare this round before recording evidence');
    need(hash(snapshot) === hash(active.snapshot), 'Executed snapshot differs from prepared round');
    need(replay.memberId === participant.identity.memberId, 'Replay belongs to another trial arm');
    need(trace.personaId === state.locks.personaId && trace.personaVersion === state.locks.personaVersion
      && trace.generationPolicy === 'llm' && trace.generation?.model === state.locks.model
      && trace.generation?.actorPolicyVersion === state.locks.policyVersion, 'Actor/model/version differs from trial lock');
    need(trace.seed === active.expected.seed && hash(trace.generation.learnerIdentity ?? null) === hash(participant.identity)
      && trace.generation.experienceFingerprint === active.expected.experienceFingerprint
      && hash(trace.generation.trialBinding ?? null) === hash({trialId:state.trialId,arm,roundId,requestHash:active.expected.requestHash}),
    'Trace is not bound to the prepared learner, seed and experience');
    const expectedVisit = arm === 'C' || participant.rounds.length === 0 ? 'first-play' : 'revisit';
    need(trace.experienceMode === expectedVisit, 'Trace experience condition differs from trial arm');
    need(!replay.report?.submission || trace.steps.some(s => s.type === 'submitForReview'), 'Submission evidence conflicts with trace termination');
    for (const other of Object.values(state.arms)) need(![...other.rounds,...other.attempts].some(r => r.sessionId === replay.sessionId || r.replayId === replay.replayId), 'App session/replay already belongs to a recorded round or attempt');
    const measurement = measureRound(trace,snapshot,replay,receipt,options);
    if (measurement.outcome === 'system-intervention') {
      // The app did finish its UI flow, but an external controller chose the ending.
      // Keep the scheduled round pending and retain no actor experience or score.
      const attempt = {roundId,phase:active.phase,index:active.index,stage:'generation',
        code:trace.generation.controlledStop.reason === 'action-limit' ? 'ACTOR_ACTION_LIMIT' : 'PERSISTENT_STAGNATION',
        outcome:'system-intervention',sessionId:replay.sessionId,replayId:replay.replayId,
        snapshotId:snapshot.snapshotId,evidenceHash,measurement};
      participant.attempts.push(attempt); writeState(file,state);
      return {attempt,idempotent:false,roundAdvanced:false,complete:false,
        nextAction:'The replay ended through a system intervention. This round remains incomplete and no learner memory or performance score was saved. Retry the same prepared conditions; do not claim a quest learning effect.'};
    }
    // Idempotent learner recording permits recovery if a crash happened before trial rename.
    learnerStore().recordLearnerRound({learnerFile:participant.learnerFile,trace,snapshot,replay,receipt,options});
    const round = {roundId,phase:active.phase,index:active.index,sessionId:replay.sessionId,replayId:replay.replayId,
      snapshotId:snapshot.snapshotId,snapshotHash:hash(snapshot),evidenceHash,
      taskSignature:hash({mission:missionConditions(snapshot.mission),environment:snapshot.environment,
        initialStock:snapshot.initialStock,cashierAvailability:snapshot.cashierAvailability,presentation:snapshot.presentation ?? null}),
      status:measurement.outcome === 'assisted-completion' ? 'assisted-submission'
        : measurement.submitted ? 'submitted' : 'completed-without-submission',
      ...(active.generation ? {generation:{generationId:active.generation.generationId,analysisId:active.generation.analysisId,
        profileId:active.generation.profileId,source:active.generation.source,previousSessionId:active.job.sessionId}} : {}),
      measurement,metrics:roundMetrics(measurement)};
    participant.rounds.push(round); participant.active = null; writeState(file,state);
    return {round,idempotent:false,complete:nextRound(state,participant) === null};
  });
}

/** A technical failure is a retryable attempt, never a participant error or a failed
 * purchase. It does not advance the round and never enters pre/post score deltas. */
function recordTrialFailure({trialFile,arm,roundId,stage,code}) {
  need(['generation','replay','persistence','analysis'].includes(stage), 'Unknown technical failure stage');
  text(code,'failure code');
  const file = path.resolve(trialFile);
  return withLock(file, () => {
    const state = readTrial(file), participant = armOf(state,arm);
    if (!participant.active && stage === 'analysis') {
      const next = nextRound(state,participant);
      need(arm !== 'A' && next?.phase === 'training' && roundId === `${state.trialId}:${arm}:${next.phase}:${next.index}`,
        'Analysis failure must refer to the pending personalized training round');
      const previousSessionId = participant.rounds.at(-1).sessionId;
      participant.attempts.push({roundId,stage,code,outcome:'technical-failure',previousSessionId});
      writeState(file,state);
      return {recorded:true,roundAdvanced:false,waitingForAnalysis:true,previousSessionId,
        nextAction:'Read the analysis of this exact previous session; prepare only after READY and a linked AI quest are available.'};
    }
    need(participant.active?.roundId === roundId, 'No matching prepared round');
    participant.attempts.push({roundId,stage,code,outcome:'technical-failure',snapshotId:participant.active.snapshot.snapshotId});
    // Keep the binding for retries: an easier replacement quest cannot erase a failed attempt.
    writeState(file,state);
    return {recorded:true,roundAdvanced:false,retry:requestFor(state,participant,participant.active)};
  });
}

const numericMetrics = ['exactObjectives','missingUnits','excessUnits','offListUnits','completedActions'];
function pairedChange(participant) {
  const baseline = participant.rounds.find(r => r.phase === 'baseline');
  const probe = participant.rounds.find(r => r.phase === 'probe');
  let reason;
  if (!baseline || !probe) reason = 'missing-baseline-or-probe';
  else if ([baseline,probe].some(r => r.measurement?.outcome === 'assisted-completion')) reason = 'assisted-completion';
  else if ([baseline,probe].some(r => r.measurement?.performanceEligible === false)) reason = 'system-intervention';
  else if (!baseline.metrics.submitted || !probe.metrics.submitted) reason = 'missing-actual-submission';
  else if (baseline.taskSignature !== probe.taskSignature) reason = 'baseline-and-probe-conditions-differ';
  if (reason) return {included:false,reason,baseline:baseline?.metrics ?? null,probe:probe?.metrics ?? null};
  const delta = Object.fromEntries(numericMetrics.map(key => [key,probe.metrics[key]-baseline.metrics[key]]));
  delta.exact = Number(probe.metrics.exact)-Number(baseline.metrics.exact);
  delta.support = Object.fromEntries(['helpOpens','listReads','cartChecks'].map(key => [key,probe.metrics.support[key]-baseline.metrics.support[key]]));
  return {included:true,baseline:baseline.metrics,probe:probe.metrics,delta,taskSignature:baseline.taskSignature};
}
function compareTrial({trialFile}) {
  const state = readTrial(trialFile), paired = Object.fromEntries(ARMS.map(arm => [arm,pairedChange(state.arms[arm])]));
  const contrast = (left,right,question) => {
    const l = paired[left], r = paired[right];
    if (!l.included || !r.included || l.taskSignature !== r.taskSignature) return {included:false,question,reason:'unpaired-or-noncomparable-arms'};
    const deltaDifference = Object.fromEntries([...numericMetrics,'exact'].map(key => [key,l.delta[key]-r.delta[key]]));
    deltaDifference.support = Object.fromEntries(['helpOpens','listReads','cartChecks'].map(key => [key,l.delta.support[key]-r.delta.support[key]]));
    return {included:true,question,arms:[left,right],deltaDifference};
  };
  return {trialId:state.trialId,complete:ARMS.every(arm => nextRound(state,state.arms[arm]) === null),
    arms:Object.fromEntries(ARMS.map(arm => [arm,{condition:state.protocol[arm],paired:paired[arm],
      completion:{recordedRounds:state.arms[arm].rounds.length,scheduledRounds:state.locks.trainingRounds+2,
        remainingRounds:state.locks.trainingRounds+2-state.arms[arm].rounds.length,
        assistedSubmissions:state.arms[arm].rounds.filter(r => r.measurement?.outcome === 'assisted-completion').length,
        systemInterventions:state.arms[arm].attempts.filter(a => a.outcome === 'system-intervention').length},
      rounds:state.arms[arm].rounds.map(({roundId,phase,index,status,metrics,generation}) => ({roundId,phase,index,status,metrics,...(generation?{generation}:{})})),
      technicalFailures:clone(state.arms[arm].attempts)}])),
    contrasts:{personalization:contrast('B','A','Added effect of personalized practice with memory'),
      memory:contrast('B','C','Added effect of carrying experience through the adaptive process; quests may also diverge')},
    interpretation:{descriptiveOnly:true,replications:1,modelWeightsUpdated:false,forcedGrowth:false,
      successIsTaskSpecific:true,supportIsNotInherentlyBad:true,timingExcluded:true,
      caveats:['A single trial is not an effect estimate; repeat with independent matched starts.',
        'B/C adaptive quests can diverge as their prior results differ; this contrast covers the whole memory-enabled process.',
        'Training tasks differ and are shown as raw outcomes, not directly comparable ability scores.',
        'Technical failures and absent submissions are reported separately; no zero score is imputed.',
        'Legacy system-controlled stops remain incomplete attempts without learning. Assisted submissions advance the analysis sequence and retain only the executed actor prefix as memory; automatic checkout is excluded from independent performance comparisons.',
        'This evaluates a synthetic actor, not learning outcomes for people with intellectual disabilities.']}};
}

module.exports = {createTrial,readTrial,prepareNextRound,recordTrialRound,recordTrialFailure,compareTrial,roundMetrics};
