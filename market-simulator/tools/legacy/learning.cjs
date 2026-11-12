'use strict';
// Legacy learner archives and learning trials (frozen).
// Handler bodies were moved verbatim from server.cjs.
const { string, object, llm, schema } = require('../schema.cjs');
const { readJson } = require('../common.cjs');
const { ACTOR_PLAN_MODEL } = require('../../src/legacy/actorPlanSession.ts');
const definitions = [
  { name: 'create_learner', description: 'Create a separate, persistent fictional learner for one isolated account and trial arm. Character/model/policy identity is frozen; no automatic improvement.', inputSchema: schema({ directory: string, learnerId: string, memberId: string, personaId: string, experimentId: string, arm: { enum: ['A', 'B', 'C'] }, model: string }, ['directory', 'learnerId', 'memberId', 'personaId', 'experimentId', 'arm', 'model']) },
  { name: 'create_luna_learner', description: 'Create a new, separate learner archive bound to this session model gpt-6-luna, low reasoning and episodic-choice-v10. Earlier provider archives are not changed.', inputSchema: schema({directory:string,learnerId:string,memberId:string,personaId:string,experimentId:string,arm:{enum:['A','B','C']}}, ['directory','learnerId','memberId','personaId','experimentId','arm']) },
  { name: 'create_whole_trace_learner', description: 'Create a separate learner bound to native gpt-6-luna low reasoning and whole-trace-v3 complete-world planning. Earlier per-action learners are not reused or changed.', inputSchema: schema({directory:string,learnerId:string,memberId:string,personaId:string,experimentId:string,arm:{enum:['A','B','C']}},['directory','learnerId','memberId','personaId','experimentId','arm']) },
  { name: 'create_learning_trial', description: 'Create an A/B/C comparison from a local JSON configuration with learner files, baseline, ordinary training and common probe snapshots.', inputSchema: schema({ optionsFilePath: string }, ['optionsFilePath']) },
  { name: 'prepare_learning_round', description: 'Prepare the next bound round and its generation options. Personalized rounds require READY analysis and its matching AI quest. No app input is sent.', inputSchema: schema({ trialFile: string, arm: { enum: ['A', 'B', 'C'] }, tabId: string, snapshot: object, snapshotFilePath: string, jobFilePath: string, generationFilePath: string }, ['trialFile', 'arm']) },
  { name: 'generate_learning_round', description: 'Prepare and generate the next trial trace with frozen actor identity and the assigned memory condition. Records generation failures; app replay remains explicit with play_trace.', inputSchema: schema({ trialFile: string, arm: { enum: ['A', 'B', 'C'] }, tabId: string, snapshot: object, snapshotFilePath: string, jobFilePath: string, generationFilePath: string, outputPath: string, llm }, ['trialFile', 'arm']) },
  { name: 'record_learning_round', description: 'Validate app replay and isolated DB receipt, save executed experience and measure the prepared round. Does not create or upload behavior logs.', inputSchema: schema({ trialFile: string, arm: { enum: ['A', 'B', 'C'] }, roundId: string, traceFilePath: string, snapshotFilePath: string, replayFilePath: string, receiptFilePath: string }, ['trialFile', 'arm', 'roundId', 'traceFilePath', 'replayFilePath', 'receiptFilePath']) },
  { name: 'record_learning_failure', description: 'Record a technical failure separately from measured gameplay and keep it in experiment accounting.', inputSchema: schema({ trialFile: string, arm: { enum: ['A', 'B', 'C'] }, roundId: string, stage: string, code: string }, ['trialFile', 'arm', 'roundId', 'stage', 'code']) },
  { name: 'compare_learning_trial', description: 'Compare completed baseline/probe measurements and report incomplete pairs and technical failures. Improvement is never presumed.', inputSchema: schema({ trialFile: string }, ['trialFile']), annotations: { readOnlyHint: true } },
];
async function invoke(name, args, ctx) {
  const { getSnapshot, getBridge, generateAndSave } = ctx;
  if (name === 'create_learner') {
    const persona = require('../../src/personas.ts').getPersona(args.personaId);
    const { directory, ...identity } = args;
    const result = require('../../learner-store.cjs').createLearner({ directory, identity: { ...identity,
      personaVersion: persona.version, policyVersion: require('../../src/llmPolicy.ts').ACTOR_POLICY_VERSION } });
    return { learnerFile: result.learnerFile, identity: result.state.identity };
  }
  if (name === 'create_luna_learner') {
    const persona=require('../../src/personas.ts').getPersona(args.personaId);
    const {directory,...actor}=args;
    const identity={...actor,personaVersion:persona.version,model:ACTOR_PLAN_MODEL,policyVersion:'episodic-choice-v10',reasoningEffort:'low'};
    const result=require('../../learner-store.cjs').createLearner({directory:args.directory,identity});
    return {learnerFile:result.learnerFile,identity:result.state.identity};
  }
  if(name==='create_whole_trace_learner'){
    const persona=require('../../src/personas.ts').getPersona(args.personaId),{directory,...actor}=args;
    const identity={...actor,personaVersion:persona.version,model:ACTOR_PLAN_MODEL,policyVersion:'whole-trace-v3',reasoningEffort:'low'};
    const result=require('../../learner-store.cjs').createLearner({directory,identity});
    return {learnerFile:result.learnerFile,identity:result.state.identity};
  }
  if (name === 'create_learning_trial') return require('../../learning-trial.cjs').createTrial(readJson(args.optionsFilePath));
  if (name === 'prepare_learning_round' || name === 'generate_learning_round') {
    const snapshot = await getSnapshot(args);
    const coordinator = require('../../learning-trial.cjs');
    if (args.tabId) {
      const session = (await getBridge()).list().sessions.find(s => s.tabId === args.tabId);
      const trial = coordinator.readTrial(args.trialFile);
      if (trial.arms[args.arm].identity.memberId !== session?.memberId) throw new Error('Trial cannot cross test accounts');
    }
    const result = coordinator.prepareNextRound({ trialFile: args.trialFile, arm: args.arm, snapshot,
      ...(args.jobFilePath ? { job: readJson(args.jobFilePath) } : {}),
      ...(args.generationFilePath ? { generation: readJson(args.generationFilePath) } : {}) });
    if (name === 'prepare_learning_round' || result.complete) return result;
    if (args.llm?.model && args.llm.model !== result.generationOptions.llm.model) throw new Error('Trial model is frozen');
    if (args.llm?.maxCalls !== undefined && args.llm.maxCalls !== result.generationOptions.llm.maxCalls) throw new Error('Trial generation limits are frozen');
    const saved = await generateAndSave({ ...result.generationOptions,
      llm: { ...args.llm, ...result.generationOptions.llm } }, snapshot, args.outputPath, failureStage => {
        coordinator.recordTrialFailure({ trialFile: args.trialFile, arm: args.arm, roundId: result.roundId,
        stage: failureStage, code: failureStage === 'generation' ? 'TRACE_GENERATION_FAILED' : 'TRACE_FILE_SAVE_FAILED' });
      });
    return { ...saved, roundId: result.roundId, arm: args.arm,
      phase: result.phase, expectedMemberId: result.expectedMemberId, experiencePolicy: result.experiencePolicy };
  }
  if (name === 'record_learning_round') return require('../../learning-trial.cjs').recordTrialRound({
    trialFile: args.trialFile, arm: args.arm, roundId: args.roundId,
    trace: readJson(args.traceFilePath), snapshot: readJson(args.snapshotFilePath ?? `${args.traceFilePath}.snapshot.json`),
    replay: readJson(args.replayFilePath), receipt: readJson(args.receiptFilePath) });
  if (name === 'record_learning_failure') return require('../../learning-trial.cjs').recordTrialFailure(args);
  if (name === 'compare_learning_trial') return require('../../learning-trial.cjs').compareTrial(args);
  throw new Error('Unsupported tool.');
}
module.exports = { definitions, invoke };
