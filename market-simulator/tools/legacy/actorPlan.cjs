'use strict';
// Legacy Codex incremental actor plan (frozen; reproduction only).
// Handler bodies were moved verbatim from server.cjs.
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const { string, seed, object, schema } = require('../schema.cjs');
const { readJson } = require('../common.cjs');
const { ACTOR_PLAN_MODEL } = require('../../src/legacy/actorPlanSession.ts');
const { ActorPlanSession } = require('../../src/legacy/actorPlanSession.ts');
const definitions = [
  { name: 'begin_actor_plan', description: 'Begin a private Luna low-reasoning actor trace session. Returns a session ID; use observe_actor_plan then append_actor_plan. Each plan is 1..3 choice IDs and is discarded when the actor observation changes. Supports a prepared v10 learning round and sends no app input.', inputSchema: schema({ personaId:string, seed, tabId:string, snapshot:object, snapshotFilePath:string, outputPath:string, learnerFile:string, trialFile:string, arm:{enum:['A','B','C']}, jobFilePath:string, generationFilePath:string, timingProfile:{enum:['original','compact']}, attentionExperience:object, maxActions:{type:'integer',minimum:1,maximum:2000} }) },
  { name: 'observe_actor_plan', description: 'Read the current actor-only observation, stable identity, observed experience and available choice IDs for an active plan session.', inputSchema: schema({sessionId:string}, ['sessionId']), annotations:{readOnlyHint:true} },
  { name: 'append_actor_plan', description: 'Append 1..3 choice IDs for the exact current revision, each with its own delay and brief reason. Stale or unavailable choices are rejected; meaningful observation changes cancel the remainder.', inputSchema: schema({sessionId:string,revision:{type:'integer',minimum:1},choiceIds:{type:'array',minItems:1,maxItems:3,items:string},delayMs:{type:'array',minItems:1,maxItems:3,items:{type:'integer',minimum:1,maximum:120000}},reasons:{type:'array',minItems:1,maxItems:3,items:string},currentTasks:{type:'array',minItems:1,maxItems:3,items:{anyOf:[string,{type:'null'}]}}}, ['sessionId','revision','choiceIds','delayMs','reasons']) },
  { name: 'finalize_actor_plan', description: 'Return the completed whole trace file and generation counts after the normal actor loop finishes.', inputSchema: schema({sessionId:string}, ['sessionId']), annotations:{readOnlyHint:true} },
];
async function invoke(name, args, ctx) {
  const { getSnapshot, getBridge, generateAndSave, planSessions } = ctx;
  if (name === 'begin_actor_plan') {
    const snapshot=await getSnapshot(args), coordinator=args.trialFile?require('../../learning-trial.cjs'):null;
    let trialRound=null, settings, learnerIdentity, attentionExperience=args.attentionExperience;
    if(coordinator){
      if(!args.arm) throw new Error('A prepared trial plan requires arm');
      if(args.learnerFile||attentionExperience) throw new Error('A trial supplies its own verified learner memory');
      const result=coordinator.prepareNextRound({trialFile:args.trialFile,arm:args.arm,snapshot,
        ...(args.jobFilePath?{job:readJson(args.jobFilePath)}:{}),...(args.generationFilePath?{generation:readJson(args.generationFilePath)}:{})});
      if(result.complete) return result;
      trialRound={trialFile:args.trialFile,arm:result.arm,roundId:result.roundId,phase:result.phase,expectedMemberId:result.expectedMemberId,experiencePolicy:result.experiencePolicy};
      settings=result.generationOptions;learnerIdentity=settings.learnerIdentity;attentionExperience=settings.attentionExperience;
      if(settings.llm?.model!==ACTOR_PLAN_MODEL || learnerIdentity?.policyVersion!=='episodic-choice-v10' || learnerIdentity?.reasoningEffort!=='low')
        throw new Error('Prepared learning round is not bound to the current Luna v10 identity');
      if(args.seed!==undefined && args.seed!==settings.seed) throw new Error('Trial seed is frozen');
      if(args.personaId!==undefined && args.personaId!==settings.personaId) throw new Error('Trial persona is frozen');
      if(args.tabId){const member=(await getBridge()).list().sessions.find(s=>s.tabId===args.tabId)?.memberId;
        if(member!==learnerIdentity.memberId) throw new Error('Trial cannot cross test accounts');}
    } else {
      if(!args.personaId||args.seed===undefined) throw new Error('Provide personaId and seed, or a prepared trialFile and arm');
      settings={personaId:args.personaId,seed:args.seed,mode:'llm',llm:{model:ACTOR_PLAN_MODEL,maxCalls:2000},timingProfile:args.timingProfile??'compact',
        maxActions:args.maxActions??100,tracePolicyVersion:'6',actorPolicyVersion:'episodic-choice-v10',reasoningEffort:'low'};
    }
    const persona=require('../../src/personas.ts').getPersona(settings.personaId);
    if(args.learnerFile){
      if(attentionExperience) throw new Error('learnerFile cannot be combined with manual experience');
      const store=require('../../learner-store.cjs'), learner=store.readLearner(args.learnerFile); learnerIdentity=learner.identity;
      if(learnerIdentity.personaId!==persona.id || learnerIdentity.personaVersion!==persona.version || learnerIdentity.model!==ACTOR_PLAN_MODEL
        || learnerIdentity.policyVersion!=='episodic-choice-v10' || learnerIdentity.reasoningEffort!=='low') throw new Error('Luna learner identity changed; create a new v10 learner');
      if(args.tabId){const member=(await getBridge()).list().sessions.find(s=>s.tabId===args.tabId)?.memberId;
        if(member!==learnerIdentity.memberId) throw new Error('Luna learner cannot cross test accounts');}
      attentionExperience=store.getLearnerExperience(args.learnerFile,learnerIdentity);
    }
    if(attentionExperience){
      if(!['first-play','revisit'].includes(attentionExperience.visit)) throw new Error('Manual attentionExperience.visit must be first-play or revisit');
      if(attentionExperience.visit==='revisit' && (!attentionExperience.memory || !attentionExperience.previousLayoutKey))
        throw new Error('Manual revisit experience requires memory and previousLayoutKey');
      if(attentionExperience.learning) require('../../src/actorLearning.ts').validateLearning(attentionExperience.learning);
      if(attentionExperience.memory && (typeof attentionExperience.memory!=='object' || Array.isArray(attentionExperience.memory)))
        throw new Error('Manual attentionExperience.memory must be an object');
      if(attentionExperience.learning?.memberId && args.tabId){
        const member=(await getBridge()).list().sessions.find(s=>s.tabId===args.tabId)?.memberId;
        if(member!==attentionExperience.learning.memberId) throw new Error('Learning cannot cross test accounts');
      }
      settings.attentionExperience=attentionExperience;
    }
    if(learnerIdentity) settings.learnerIdentity=learnerIdentity;
    if(args.maxActions!==undefined && args.maxActions!==settings.maxActions) throw new Error('Generation maxActions is frozen or outside the prepared plan');
    if(!trialRound) Object.assign(settings,{tracePolicyVersion:'6',actorPolicyVersion:'episodic-choice-v10',reasoningEffort:'low'});
    const session=new ActorPlanSession(), outputPath=path.resolve(args.outputPath ?? path.join(ROOT,'output',`luna-${session.id}.json`));
    settings={...settings,mode:'llm',llm:{...settings.llm,model:ACTOR_PLAN_MODEL},tracePolicyVersion:'6',actorPolicyVersion:'episodic-choice-v10',reasoningEffort:'low',
      actorDecisionProvider:(o,h,p,a,state)=>session.decide(o,h,p,a,state),onActorDecisionAccepted:()=>session.recordAccepted()};
    const record={session,outputPath,done:null,error:null,trialRound};
    const onFailure=trialRound?stage=>coordinator.recordTrialFailure({trialFile:trialRound.trialFile,arm:trialRound.arm,roundId:trialRound.roundId,
      stage,code:stage==='generation'?'TRACE_GENERATION_FAILED':'TRACE_FILE_SAVE_FAILED'}):undefined;
    record.done=generateAndSave(settings,snapshot,outputPath,onFailure).then(result=>{session.complete();return result;}).catch(error=>{record.error=error;session.complete();throw error;});
    record.done.catch(()=>{}); planSessions.set(session.id,record);
    return {sessionId:session.id,model:ACTOR_PLAN_MODEL,reasoningEffort:'low',actorPolicyVersion:session.policyVersion,policyVersion:'6',status:'awaiting-actor-observation',...(trialRound??{})};
  }
  if (name === 'observe_actor_plan') {
    const record=planSessions.get(args.sessionId); if(!record) throw new Error('Unknown actor plan session');
    if(record.error) throw record.error;
    if(!record.session.status.waiting && record.session.status.complete) return {status:'complete'};
    return record.session.awaitObserve();
  }
  if (name === 'append_actor_plan') {
    const record=planSessions.get(args.sessionId); if(!record) throw new Error('Unknown actor plan session');
    return record.session.append(args);
  }
  if (name === 'finalize_actor_plan') {
    const record=planSessions.get(args.sessionId); if(!record) throw new Error('Unknown actor plan session');
    if(record.error) throw record.error;
    if(!record.session.status.complete) throw new Error('Actor trace is still running; observe and append the current plan first');
    const result=await record.done; record.session.close();
    return {...result,...(record.trialRound??{}),model:ACTOR_PLAN_MODEL,reasoningEffort:'low',policyVersion:'6',acceptedActions:record.session.status.acceptedActions};
  }
  throw new Error('Unsupported tool.');
}
module.exports = { definitions, invoke };
