'use strict';
// Whole-trace generation: prepare, offline decision authoring, submit, repair and status.
// Handler bodies were moved verbatim from server.cjs.
const fs = require('node:fs');
const path = require('node:path');
const { string, seed, object, schema, wholeTraceRepair } = require('./schema.cjs');
const { readJson } = require('./common.cjs');
const { ACTOR_PLAN_MODEL } = require('../src/actorPlanSession.ts');
const definitions = [
  { name: 'prepare_whole_trace', description: 'Prepare bundle 8 with whole-world reference, persistent pending goals, capacity-bounded working memory, and exact source-bound choices for native Codex Luna low reasoning. Default candidate 7 binds goal-directed decisions independently of focus and retains pending-goal memory through interest/exploration. Separate expression coverage reports whether cognition was exercised. Legacy candidates 6/5/4/3 keep existing strict guards. Cognition is independently checked after the complete plan is submitted; actions are never replaced. Original actor timing is preserved. No per-action observation calls, provider requests or app input are sent. Optional suffix repair retains accepted behavior and does not automatically choose actions. Supports separate whole-trace-v3 learners and trials.', inputSchema: schema({personaId:string,seed,tabId:string,snapshot:object,snapshotFilePath:string,outputPath:string,learnerFile:string,trialFile:string,arm:{enum:['A','B','C']},jobFilePath:string,generationFilePath:string,timingProfile:{enum:['original']},movementValidationVersion:{enum:['1']},movementVersion:{enum:['directional-v1','directional-v2']},movementFeedbackVersion:{enum:['recent-movement-v1','recent-movement-anchor-v1','recent-movement-anchor-capacity-v1'],description:'Optional, off when omitted. recent-movement-v1 requires directional-v2; recent-movement-anchor-v1 and recent-movement-anchor-capacity-v1 require omitted movementVersion and the unbound anchor-visible-structures-v1 observation contract. Describes only accepted arrivals within 24 actions; the capacity variant additionally limits distinct passages by persona spatialMemoryCapacity. No route recommendation.'},attentionExperience:object,maxActions:{type:'integer',minimum:1,maximum:100},timeBudgetMs:{type:'integer',minimum:1000,maximum:3600000},maxRepairs:{type:'integer',minimum:0,maximum:1},choiceOrderVersion:{enum:['give-up-last-v1'],description:'Optional experiment, off when omitted. Lists control/giveUp after all other currently available choices; availability unchanged.'},authoringExampleVersion:{enum:['walk-while-unseen-v1'],description:'Optional experiment, off when omitted. Adds one neutral walk syntax example to the authoring guide.'}}) },
  { name: 'submit_whole_trace', description: 'Submit the complete candidate for a prepared request. Candidate 4 selects a source-bound exact action and derived observed target cues; legacy 3 remains explicitly supported under strict existing guards. Saves trace, knowledge audit and independent persona review. Warnings never rewrite behavior. Does not call a model or app; use repair_whole_trace for a suffix-only technical repair when allowed.', inputSchema: schema({requestId:string,candidate:object,candidateFilePath:string},['requestId']) },
  { name: 'repair_whole_trace', description: 'Repair only the failed suffix of an invalid request with remaining repair budget. Provide repair:{decisions:[...]} or a repairFilePath containing that object. The server fills repairVersion, requestId, baseAttempt, fromDecisionIndex and candidateVersion from the prepared request; explicitly supplied legacy metadata must still match. The server retains accepted prefix, terminal intent and the existing one-repair limit. No automatic action choice, model or app calls.', inputSchema: schema({requestId:string,repair:wholeTraceRepair,repairFilePath:string},['requestId']) },
  { name: 'whole_trace_status', description: 'Read a whole-trace request status and candidate submission counts. Counts are not native Codex inference-call telemetry.', inputSchema: schema({requestId:string},['requestId']),annotations:{readOnlyHint:true} },
];
// Callable offline authoring tools kept out of the default public catalog.
const hiddenDefinitions = [
  { name: 'begin_whole_trace_authoring', description: 'Begin offline decision authoring for the same prepared request. Each explicit draft uses unchanged prefix execution validation, with bounded technical rewrites and advisory calculations only; no model or app calls.', inputSchema: schema({requestId:string,maxRewritesPerDecision:{type:'integer',minimum:0}},['requestId']) },
  { name: 'append_whole_trace_decision', description: 'Check one source-free actor decision. Rejection retains the accepted prefix and returns reasons, the current menu and rewrite metrics; it never supplies replacement declarations.', inputSchema: schema({requestId:string,decision:object},['requestId','decision']) },
  { name: 'whole_trace_authoring_menu', description: 'Read current choices and reference-only calculated pressures, observed product IDs and open goals. Optional nextDecision supplies actorState and delayMs for an exact pre-action preview; no declarations are filled.', inputSchema: schema({requestId:string,nextDecision:object},['requestId']),annotations:{readOnlyHint:true} },
  { name: 'finish_whole_trace_authoring', description: 'Return the complete actor-authored candidate and first-attempt/rewrite metrics. Submit this unchanged candidate through submit_whole_trace for final validation.', inputSchema: schema({requestId:string},['requestId']) },
];
async function invoke(name, args, ctx) {
  const { getSnapshot, getBridge, wholeTraceSessions } = ctx;
  if (name === 'prepare_whole_trace') {
    if(args.movementValidationVersion!==undefined && args.movementValidationVersion!=='1')
      throw new Error('movementValidationVersion must be 1 when supplied');
    if(args.movementVersion!==undefined && !['directional-v1','directional-v2'].includes(args.movementVersion)) throw new Error('movementVersion must be directional-v1 or directional-v2 when supplied');
    if(args.movementFeedbackVersion!==undefined
      && !(args.movementFeedbackVersion==='recent-movement-v1' && args.movementVersion==='directional-v2')
      && !(['recent-movement-anchor-v1','recent-movement-anchor-capacity-v1'].includes(args.movementFeedbackVersion) && args.movementVersion===undefined && !args.trialFile))
      throw new Error('movementFeedbackVersion requires recent-movement-v1 with directional-v2, or recent-movement-anchor-v1/recent-movement-anchor-capacity-v1 with omitted movementVersion and anchor-visible-structures-v1');
    // Existing trial locks have no movement version. Reject before preparing
    // a round can update its stored pending state.
    if(args.trialFile && (args.movementVersion!==undefined || args.movementValidationVersion!==undefined)) throw new Error('Whole-trace trial movementVersion is frozen');
    if(args.timingProfile!==undefined && args.timingProfile!=='original') throw new Error('Whole-trace-v3 preserves actor judgment timing; use original');
    if(args.choiceOrderVersion!==undefined && args.choiceOrderVersion!=='give-up-last-v1') throw new Error('choiceOrderVersion must be give-up-last-v1 when supplied');
    if(args.authoringExampleVersion!==undefined && args.authoringExampleVersion!=='walk-while-unseen-v1') throw new Error('authoringExampleVersion must be walk-while-unseen-v1 when supplied');
    if(args.trialFile && (args.choiceOrderVersion!==undefined || args.authoringExampleVersion!==undefined)) throw new Error('Whole-trace trial presentation options are frozen');
    if (args.trialFile && (args.learnerFile || args.attentionExperience)) throw new Error('A trial supplies its own verified learner memory');
    if (args.arm && !args.trialFile) throw new Error('arm requires a whole-trace trialFile');
    const snapshot=await getSnapshot(args), coordinator=args.trialFile?require('../learning-trial.cjs'):null;
    let settings,trialRound=null,learnerIdentity,attentionExperience=args.attentionExperience;
    if(coordinator){
      if(!args.arm) throw new Error('A prepared whole-trace trial requires arm');
      const trial=coordinator.readTrial(args.trialFile),identity=trial.arms[args.arm]?.identity;
      if(trial.locks.model!==ACTOR_PLAN_MODEL || trial.locks.policyVersion!=='whole-trace-v3' || identity?.reasoningEffort!=='low')
        throw new Error('Prepared learning round is not bound to the native Luna whole-trace-v3 identity');
      if(args.tabId){
        const member=(await getBridge()).list().sessions.find(s=>s.tabId===args.tabId)?.memberId;
        if(identity.memberId!==member) throw new Error('Whole-trace trial cannot cross test accounts');
      }
      const result=coordinator.prepareNextRound({trialFile:args.trialFile,arm:args.arm,snapshot,
        ...(args.jobFilePath?{job:readJson(args.jobFilePath)}:{}),...(args.generationFilePath?{generation:readJson(args.generationFilePath)}:{})});
      if(result.complete)return result;
      settings=result.generationOptions;learnerIdentity=settings.learnerIdentity;attentionExperience=settings.attentionExperience;
      if(settings.llm?.model!==ACTOR_PLAN_MODEL || learnerIdentity?.policyVersion!=='whole-trace-v3' || learnerIdentity?.reasoningEffort!=='low')
        throw new Error('Prepared learning round is not bound to the native Luna whole-trace-v3 identity');
      for(const key of ['personaId','seed','maxActions','timeBudgetMs','timingProfile','movementVersion','movementFeedbackVersion'])
        if(args[key]!==undefined && args[key]!==settings[key]) throw new Error(`Whole-trace trial ${key} is frozen`);
      trialRound={trialFile:args.trialFile,arm:result.arm,roundId:result.roundId,phase:result.phase,expectedMemberId:result.expectedMemberId,experiencePolicy:result.experiencePolicy};
    }else{
      if(!args.personaId || args.seed===undefined) throw new Error('Provide personaId and seed, or a prepared whole-trace trialFile and arm');
      settings={personaId:args.personaId,seed:args.seed,maxActions:args.maxActions??100,timingProfile:args.timingProfile??'original',
        ...(args.movementValidationVersion===undefined?{}:{movementValidationVersion:args.movementValidationVersion}),
        ...(args.movementVersion===undefined?{}:{movementVersion:args.movementVersion}),
        ...(args.movementFeedbackVersion===undefined?{}:{movementFeedbackVersion:args.movementFeedbackVersion}),
        ...(args.choiceOrderVersion===undefined?{}:{choiceOrderVersion:args.choiceOrderVersion}),
        ...(args.authoringExampleVersion===undefined?{}:{authoringExampleVersion:args.authoringExampleVersion}),
        ...(args.timeBudgetMs===undefined?{}:{timeBudgetMs:args.timeBudgetMs})};
    }
    // Ordinary generation must not load the optional fidelity evaluator.
    const traceDirectory=args.outputPath?path.dirname(path.dirname(path.dirname(path.resolve(args.outputPath)))):null;
    const validationManifest=traceDirectory&&path.basename(traceDirectory)==='traces'?path.join(path.dirname(traceDirectory),'manifest.json'):null;
    const validationInfo=validationManifest&&fs.existsSync(validationManifest)?readJson(validationManifest):null;
    const validationRun=validationInfo?.schema==='oneuldo.persona-fidelity-run';
    if(validationRun && (validationInfo.movementValidationVersion!==undefined || settings.movementValidationVersion!==undefined)) {
      const manifest=require('../src/validation/personaValidationRun.cjs').readManifest(path.dirname(validationManifest));
      require('../src/validation/personaValidationMovement.cjs').assertMovementBinding(manifest,settings,'Prepared validation movement options');
    } else if(validationRun && settings.movementVersion!==undefined)
      throw new Error('Whole-trace validation slot movementVersion is frozen; directional movement requires a separate unbound request');
    else if(validationRun && (settings.choiceOrderVersion!==undefined || settings.authoringExampleVersion!==undefined))
      throw new Error('Whole-trace validation slot presentation options are frozen; use an unbound request');
    else if(validationRun && settings.movementFeedbackVersion!==undefined)
      throw new Error('Whole-trace validation slot movementFeedbackVersion is frozen; prepare a separate bound validation run');
    else if(!validationRun && settings.movementValidationVersion!==undefined)
      throw new Error('movementValidationVersion requires a bound validation run slot');
    const traitRun=validationInfo?.schema==='oneuldo.persona-fidelity-run'&&validationInfo.version===3;
    const controlSlot=settings.personaId==='neutral-adult-control'||traitRun||validationInfo?.movementValidationVersion!==undefined
      ?require('../src/validation/personaValidationRun.cjs').lookupValidationSlot(args,snapshot):null;
    const persona=controlSlot?require('../src/personas.ts').withValidationPersona(()=>require('../src/personas.ts').getWholeTracePersona(settings.personaId),controlSlot.persona)
      :require('../src/personas.ts').getPersona(settings.personaId);
    if(args.learnerFile){
      if(attentionExperience) throw new Error('learnerFile cannot be combined with manual experience');
      const store=require('../learner-store.cjs'),learner=store.readLearner(args.learnerFile);learnerIdentity=learner.identity;
      if(learnerIdentity.personaId!==persona.id || learnerIdentity.personaVersion!==persona.version || learnerIdentity.model!==ACTOR_PLAN_MODEL
        || learnerIdentity.policyVersion!=='whole-trace-v3' || learnerIdentity.reasoningEffort!=='low')
        throw new Error('Whole-trace learner identity changed; create a separate whole-trace-v3 learner');
      if(args.tabId){const member=(await getBridge()).list().sessions.find(s=>s.tabId===args.tabId)?.memberId;
        if(member!==learnerIdentity.memberId) throw new Error('Whole-trace learner cannot cross test accounts');}
      attentionExperience=store.getLearnerExperience(args.learnerFile,learnerIdentity);
    }
    if(attentionExperience){
      if(!['first-play','revisit'].includes(attentionExperience.visit)) throw new Error('Manual attentionExperience.visit must be first-play or revisit');
      if(attentionExperience.visit==='revisit' && (!attentionExperience.memory || !attentionExperience.previousLayoutKey))
        throw new Error('Manual revisit experience requires memory and previousLayoutKey');
      if(attentionExperience.memory && (typeof attentionExperience.memory!=='object' || Array.isArray(attentionExperience.memory)))
        throw new Error('Manual attentionExperience.memory must be an object');
      if(attentionExperience.learning) require('../src/actorLearning.ts').validateLearning(attentionExperience.learning);
      if(attentionExperience.learning?.memberId && args.tabId){const member=(await getBridge()).list().sessions.find(s=>s.tabId===args.tabId)?.memberId;
        if(member!==attentionExperience.learning.memberId) throw new Error('Learning cannot cross test accounts');}
    }
    const {WholeTraceSession}=require('../src/wholeTrace/wholeTraceSession.ts');
    const createSession=()=>new WholeTraceSession({snapshot,personaId:settings.personaId,seed:settings.seed,
      ...(args.outputPath?{outputPath:path.resolve(args.outputPath)}:{}),timingProfile:settings.timingProfile,
      maxActions:settings.maxActions,maxRepairs:args.maxRepairs??0,
      ...(settings.timeBudgetMs===undefined?{}:{timeBudgetMs:settings.timeBudgetMs}),
      ...(settings.movementValidationVersion===undefined?{}:{movementValidationVersion:settings.movementValidationVersion}),
      ...(settings.movementVersion===undefined?{}:{movementVersion:settings.movementVersion}),
      ...(settings.movementFeedbackVersion===undefined?{}:{movementFeedbackVersion:settings.movementFeedbackVersion}),
      ...(settings.choiceOrderVersion===undefined?{}:{choiceOrderVersion:settings.choiceOrderVersion}),
      ...(settings.authoringExampleVersion===undefined?{}:{authoringExampleVersion:settings.authoringExampleVersion}),
      ...(settings.llm?{llm:settings.llm}:{}),
      ...(attentionExperience?{attentionExperience}:{}),...(learnerIdentity?{learnerIdentity}:{}),
      ...(settings.trialBinding?{trialBinding:settings.trialBinding}:{})});
    const session=controlSlot?require('../src/personas.ts').withValidationPersona(createSession,controlSlot.persona):createSession();
    const prepared=session.prepare();wholeTraceSessions.set(prepared.requestId,{session,trialRound,controlSlot,submitting:false,finished:false,trialFailureRecorded:false});
    return {...prepared,...(trialRound??{})};
  }
  if(['begin_whole_trace_authoring','append_whole_trace_decision','whole_trace_authoring_menu','finish_whole_trace_authoring'].includes(name)){
    const record=wholeTraceSessions.get(args.requestId);if(!record) throw new Error('Unknown whole-trace request; use the same persistent MCP or interactive CLI process');
    if(record.submitting) throw new Error('A whole-trace candidate is already being submitted');
    const author=()=>name==='begin_whole_trace_authoring'?record.session.beginAuthoring({maxRewritesPerDecision:args.maxRewritesPerDecision})
      :name==='append_whole_trace_decision'?record.session.appendAuthoring(args.decision)
      :name==='whole_trace_authoring_menu'?record.session.authoringMenu(args.nextDecision):record.session.finishAuthoring();
    const result=await (record.controlSlot?require('../src/personas.ts').withValidationPersona(author,record.controlSlot.persona):author());
    if(result.authoring?.failed){
      record.finished=true;
      if(record.trialRound && !record.trialFailureRecorded){
        require('../learning-trial.cjs').recordTrialFailure({trialFile:record.trialRound.trialFile,arm:record.trialRound.arm,
          roundId:record.trialRound.roundId,stage:'generation',code:'WHOLE_TRACE_GENERATION_FAILED'});
        record.trialFailureRecorded=true;
      }
    }
    return {...result,...(record.trialRound??{})};
  }
  if(name==='submit_whole_trace' || name==='repair_whole_trace' || name==='whole_trace_status'){
    const record=wholeTraceSessions.get(args.requestId);if(!record) throw new Error('Unknown whole-trace request; use the same persistent MCP or interactive CLI process');
    if(name==='whole_trace_status')return {...record.session.status(),...(record.trialRound??{})};
    const repairing=name==='repair_whole_trace';
    const inline=repairing?args.repair:args.candidate, file=repairing?args.repairFilePath:args.candidateFilePath;
    if(Boolean(inline)===Boolean(file)) throw new Error(repairing?'Provide exactly one of repair or repairFilePath':'Provide exactly one of candidate or candidateFilePath');
    const payload=inline??readJson(file);
    if((!repairing || payload?.requestId!==undefined) && payload?.requestId!==args.requestId)
      throw new Error('Candidate or repair is bound to a different whole-trace request');
    const deliver=()=>record.controlSlot?require('../src/personas.ts').withValidationPersona(()=>repairing?record.session.submitRepair(payload):record.session.submit(payload),record.controlSlot.persona)
      :repairing?record.session.submitRepair(payload):record.session.submit(payload);
    if(record.submitting) throw new Error('A whole-trace candidate is already being submitted');
    // The session returns the cached response for an identical delivery retry.
    // A changed candidate after closure is rejected without another trial failure.
    if(record.finished)return {...await deliver(),...(record.trialRound??{})};
    record.submitting=true;
    let result;
    try{result=await deliver();}catch(error){
      const status=record.session.status();
      record.finished=status.status==='complete'||status.status==='failed'||status.status==='invalid'&&!status.canRepair;
      if(record.finished && record.trialRound && !record.trialFailureRecorded){
        require('../learning-trial.cjs').recordTrialFailure({trialFile:record.trialRound.trialFile,
          arm:record.trialRound.arm,roundId:record.trialRound.roundId,stage:'generation',code:'WHOLE_TRACE_GENERATION_FAILED'});
        record.trialFailureRecorded=true;
      }
      throw error;
    }finally{record.submitting=false;}
    record.finished=result.status==='invalid'?!result.canRepair:result.status==='failed'||Boolean(result.outputPath);
    if((result.status==='failed'||result.status==='invalid'&&!result.canRepair) && record.trialRound && !record.trialFailureRecorded){
      require('../learning-trial.cjs').recordTrialFailure({trialFile:record.trialRound.trialFile,arm:record.trialRound.arm,
        roundId:record.trialRound.roundId,stage:'generation',code:result.status==='failed'?'WHOLE_TRACE_GENERATION_FAILED':'WHOLE_TRACE_CANDIDATE_INVALID'});
      record.trialFailureRecorded=true;
    }
    return {...result,...(record.trialRound??{})};
  }
  throw new Error('Unsupported tool.');
}
module.exports = { definitions, hiddenDefinitions, invoke };
