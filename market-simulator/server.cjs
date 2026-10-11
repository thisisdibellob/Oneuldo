#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
require('./runtime.cjs').register();
const { ReplayBridge, loadReplayConfig } = require('./replay-bridge.cjs');
const { beginGeneration, withDiagnostics } = require('./generation-journal.cjs');
const { ActorPlanSession, ACTOR_PLAN_MODEL } = require('./src/actorPlanSession.ts');
const string = { type: 'string', minLength: 1 };
const seed = { anyOf: [string, { type: 'number' }] };
const object = { type: 'object' };
const llm = { type: 'object', additionalProperties: false, properties: { protocol: { enum: ['openai', 'ollama'] }, baseUrl: string, model: string, apiKeyEnv: string, maxCalls: { type: 'integer', minimum: 1, maximum: 2000 }, timeoutMs: { type: 'integer', minimum: 1, maximum: 300000 } } };
const schema = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const wholeTraceRepair = schema({
  decisions:{type:'array',minItems:1,maxItems:100,items:object},
  repairVersion:{const:'1'},requestId:string,baseAttempt:{type:'integer',minimum:1},
  fromDecisionIndex:{type:'integer',minimum:0},candidateVersion:{enum:['3','4','5','6','7']},
},['decisions']);
const definitions = [
  { name: 'begin_actor_plan', description: 'Begin a private Luna low-reasoning actor trace session. Returns a session ID; use observe_actor_plan then append_actor_plan. Each plan is 1..3 choice IDs and is discarded when the actor observation changes. Supports a prepared v10 learning round and sends no app input.', inputSchema: schema({ personaId:string, seed, tabId:string, snapshot:object, snapshotFilePath:string, outputPath:string, learnerFile:string, trialFile:string, arm:{enum:['A','B','C']}, jobFilePath:string, generationFilePath:string, timingProfile:{enum:['original','compact']}, attentionExperience:object, maxActions:{type:'integer',minimum:1,maximum:2000} }) },
  { name: 'observe_actor_plan', description: 'Read the current actor-only observation, stable identity, observed experience and available choice IDs for an active plan session.', inputSchema: schema({sessionId:string}, ['sessionId']), annotations:{readOnlyHint:true} },
  { name: 'append_actor_plan', description: 'Append 1..3 choice IDs for the exact current revision, each with its own delay and brief reason. Stale or unavailable choices are rejected; meaningful observation changes cancel the remainder.', inputSchema: schema({sessionId:string,revision:{type:'integer',minimum:1},choiceIds:{type:'array',minItems:1,maxItems:3,items:string},delayMs:{type:'array',minItems:1,maxItems:3,items:{type:'integer',minimum:1,maximum:120000}},reasons:{type:'array',minItems:1,maxItems:3,items:string},currentTasks:{type:'array',minItems:1,maxItems:3,items:{anyOf:[string,{type:'null'}]}}}, ['sessionId','revision','choiceIds','delayMs','reasons']) },
  { name: 'finalize_actor_plan', description: 'Return the completed whole trace file and generation counts after the normal actor loop finishes.', inputSchema: schema({sessionId:string}, ['sessionId']), annotations:{readOnlyHint:true} },
  { name: 'prepare_whole_trace', description: 'Prepare bundle 8 with whole-world reference, persistent pending goals, capacity-bounded working memory, and exact source-bound choices for native Codex Luna low reasoning. Default candidate 7 binds goal-directed decisions independently of focus and retains pending-goal memory through interest/exploration. Separate expression coverage reports whether cognition was exercised. Legacy candidates 6/5/4/3 keep existing strict guards. Cognition is independently checked after the complete plan is submitted; actions are never replaced. Original actor timing is preserved. No per-action observation calls, provider requests or app input are sent. Optional suffix repair retains accepted behavior and does not automatically choose actions. Supports separate whole-trace-v3 learners and trials.', inputSchema: schema({personaId:string,seed,tabId:string,snapshot:object,snapshotFilePath:string,outputPath:string,learnerFile:string,trialFile:string,arm:{enum:['A','B','C']},jobFilePath:string,generationFilePath:string,timingProfile:{enum:['original']},attentionExperience:object,maxActions:{type:'integer',minimum:1,maximum:100},timeBudgetMs:{type:'integer',minimum:1000,maximum:3600000},maxRepairs:{type:'integer',minimum:0,maximum:1}}) },
  { name: 'submit_whole_trace', description: 'Submit the complete candidate for a prepared request. Candidate 4 selects a source-bound exact action and derived observed target cues; legacy 3 remains explicitly supported under strict existing guards. Saves trace, knowledge audit and independent persona review. Warnings never rewrite behavior. Does not call a model or app; use repair_whole_trace for a suffix-only technical repair when allowed.', inputSchema: schema({requestId:string,candidate:object,candidateFilePath:string},['requestId']) },
  { name: 'repair_whole_trace', description: 'Repair only the failed suffix of an invalid request with remaining repair budget. Provide repair:{decisions:[...]} or a repairFilePath containing that object. The server fills repairVersion, requestId, baseAttempt, fromDecisionIndex and candidateVersion from the prepared request; explicitly supplied legacy metadata must still match. The server retains accepted prefix, terminal intent and the existing one-repair limit. No automatic action choice, model or app calls.', inputSchema: schema({requestId:string,repair:wholeTraceRepair,repairFilePath:string},['requestId']) },
  { name: 'whole_trace_status', description: 'Read a whole-trace request status and candidate submission counts. Counts are not native Codex inference-call telemetry.', inputSchema: schema({requestId:string},['requestId']),annotations:{readOnlyHint:true} },
  { name: 'list_personas', description: 'List available personas for intent trace generation.', inputSchema: schema({}), annotations: { readOnlyHint: true } },
  { name: 'prepare_persona_validation', description: 'Create or refresh a persona fidelity run manifest; no traces are generated.', inputSchema: schema({runId:string,outputDirectory:string,snapshotFilePaths:schema({low:string,high:string},['low','high']),seeds:{type:'array'},personaIds:{type:'array'}},['runId','outputDirectory','snapshotFilePaths','seeds','personaIds']) },
  { name: 'measure_persona_validation', description: 'Measure conditional metrics, paired effect sizes and prohibited patterns from saved traces.', inputSchema: schema({runDirectory:string,allowFixture:{type:'boolean'}},['runDirectory']) },
  { name: 'prepare_blind_review', description: 'Create redacted panels and a separate answer key; panel B requires an already scored panel A.', inputSchema: schema({runDirectory:string,panel:{enum:['A','B']},allowFixture:{type:'boolean'}},['runDirectory']) },
  { name: 'submit_blind_review', description: 'Score independently supplied blind answers without calling a model.', inputSchema: schema({runDirectory:string,panel:{enum:['A','B']},answers:object,reviewerModel:string,reviewerSession:string},['runDirectory','panel','answers','reviewerModel','reviewerSession']) },
  { name: 'persona_validation_report', description: 'Save the persona fidelity JSON and Korean Markdown report.', inputSchema: schema({runDirectory:string},['runDirectory']) },
  { name: 'generate_trace', description: 'AI is the default; stochastic is explicit regression-only. Generate an intent-level trace for a registered tab mission or explicit snapshot. AI attention observes at most 100 model decisions; natural termination wins, otherwise the system walks to checkout and submits the unchanged current basket, including an empty basket, then waits for acceptance and exits. The controller suffix is marked separately from actor choices. Repetition alone does not stop generation. Smaller maxActions/maxCalls/time budgets remain technical errors. learnerFile loads verified personal experience and locks the actor identity. Saves JSON; never uploads gameplay logs.', inputSchema: schema({ personaId: string, seed, tabId: string, snapshot: object, snapshotFilePath: string, outputPath: string, learnerFile: string, mode: { enum: ['stochastic', 'llm'] }, timingProfile: { enum: ['original', 'compact'] }, maxActions: { type: 'integer', minimum: 1, maximum: 2000 }, timeBudgetMs: { type: 'integer', minimum: 1000, maximum: 3600000 }, attentionExperience: schema({ visit: { enum: ['first-play', 'revisit'] }, previousLayoutKey: string, memory: object, learning: object }, ['visit']), llm }, ['personaId', 'seed']) },
  { name: 'validate_trace', description: 'Validate a trace and its target mission snapshot with the shared schema and game guards.', inputSchema: schema({ trace: object, traceFilePath: string, tabId: string, snapshot: object, snapshotFilePath: string }), annotations: { readOnlyHint: true } },
  { name: 'pair_app_session', description: 'Issue a five-minute, one-use pairing URL for one allowlisted local/staging test account. Open it in the development web app and log in with that account.', inputSchema: schema({ appOrigin: string, backendOrigin: string, memberId: string }, ['appOrigin', 'backendOrigin', 'memberId']) },
  { name: 'list_app_sessions', description: 'List authenticated development app tabs, mission readiness and per-tab replay status.', inputSchema: schema({}), annotations: { readOnlyHint: true } },
  { name: 'play_trace', description: 'Send a complete validated trace to one authenticated app tab for real-time replay through existing user inputs. One active replay per tab and test account.', inputSchema: schema({ tabId: string, trace: object, traceFilePath: string }, ['tabId']) },
  { name: 'replay_status', description: 'Read progress and smoothness measurements for a replay.', inputSchema: schema({ replayId: string, tabId: string }), annotations: { readOnlyHint: true } },
  { name: 'stop_replay', description: 'Stop replay on the selected tab and release its virtual input through the app.', inputSchema: schema({ tabId: string }, ['tabId']) },
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
function checkArguments(value, contract, at = 'arguments') {
  if (contract.anyOf) { if (!contract.anyOf.some(option => { try { checkArguments(value, option, at); return true; } catch { return false; } })) throw new Error(`${at}: invalid value`); return; }
  if (contract.enum && !contract.enum.includes(value)) throw new Error(`${at}: expected ${contract.enum.join(' | ')}`);
  if (contract.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at}: expected object`);
    for (const key of contract.required ?? []) if (!Object.hasOwn(value, key)) throw new Error(`${at}.${key}: required`);
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(contract.properties ?? {}, key)) checkArguments(child, contract.properties[key], `${at}.${key}`);
      else if (contract.additionalProperties === false) throw new Error(`${at}.${key}: unknown argument`);
    }
  }
  if (contract.type === 'string' && (typeof value !== 'string' || !value.trim())) throw new Error(`${at}: expected nonempty string`);
  if (contract.type === 'array' && !Array.isArray(value)) throw new Error(`${at}: expected array`);
  if (contract.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${at}: expected boolean`);
  if (['number', 'integer'].includes(contract.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (contract.type === 'integer' && !Number.isInteger(value))) throw new Error(`${at}: expected ${contract.type}`);
    if ((contract.minimum !== undefined && value < contract.minimum) || (contract.maximum !== undefined && value > contract.maximum)) throw new Error(`${at}: out of range`);
  }
}
function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }
function readTrace(args) {
  if (Boolean(args.trace) === Boolean(args.traceFilePath)) throw new Error('Provide exactly one of trace or traceFilePath.');
  return args.trace ?? readJson(args.traceFilePath);
}
function saveTrace(trace, snapshot, outputPath) {
  const destination = path.resolve(outputPath ?? path.join(__dirname, 'output', `trace-${crypto.randomUUID()}.json`));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const snapshotDestination = `${destination}.snapshot.json`;
  fs.writeFileSync(snapshotDestination, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.writeFileSync(destination, JSON.stringify(trace, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { fs.unlinkSync(snapshotDestination); throw error; }
  return { outputPath: destination, snapshotFilePath: snapshotDestination, traceId: trace.traceId,
    personaId: trace.personaId, personaVersion: trace.personaVersion, steps: trace.steps.length, target: trace.target,
    ending: require('./src/simulator.ts').summarizeTrace(trace).ending,
    controlledStop: trace.generation?.controlledStop ?? null,
    systemCompletion: trace.generation?.systemCompletion ?? null };
}
function createService(options = {}) {
  let bridge = options.bridge ?? null, starting = null;
  const planSessions = new Map();
  const wholeTraceSessions = new Map();
  const ownerId = crypto.randomUUID();
  const validate = options.validateTrace ?? ((trace, snapshot) => require('./src/traceValidation.ts').validateTrace(trace, snapshot));
  const generate = options.generateTrace ?? (args => require('./src/simulator.ts').generateTrace(args));
  async function generateAndSave(settings, snapshot, outputPath, onFailure) {
    const destination = path.resolve(outputPath ?? path.join(__dirname, 'output', `trace-${crypto.randomUUID()}.json`));
    let journal, stage = 'generation';
    try {
      const persona = require('./src/personas.ts').getPersona(settings.personaId);
      journal = beginGeneration(destination, snapshot, settings, { personaVersion: persona.version,
        actorPolicyVersion: settings.actorPolicyVersion ?? require('./src/llmPolicy.ts').ACTOR_POLICY_VERSION });
      const trace = await generate({ ...settings, snapshot, onCheckpoint: entry => journal.checkpoint(entry),
        onActorDecisionAccepted: () => settings.onActorDecisionAccepted?.() });
      const validation = validate(trace, snapshot);
      if (!validation.valid) throw new Error(`Generated trace invalid: ${validation.errors.join('; ')}`);
      stage = 'persistence';
      const result = saveTrace(trace, snapshot, destination);
      journal.complete(trace);
      return { ...result, diagnosticDirectory: journal.diagnosticDirectory };
    } catch (error) {
      try { journal?.fail(stage); } catch { /* Keep the original failure and the already captured evidence. */ }
      onFailure?.(stage);
      throw journal ? withDiagnostics(error, journal.diagnosticDirectory) : error;
    }
  }
  async function getBridge() {
    if (!bridge) bridge = new ReplayBridge(loadReplayConfig(), { validateTrace: validate });
    if (!starting) starting = bridge.start().catch(error => { starting = null; throw error; });
    await starting;
    return bridge;
  }
  async function getSnapshot(args) {
    if ([args.tabId, args.snapshot, args.snapshotFilePath].filter(Boolean).length !== 1) throw new Error('Provide exactly one of tabId, snapshot, or snapshotFilePath.');
    return args.tabId ? (await getBridge()).snapshot(args.tabId) : args.snapshot ?? readJson(args.snapshotFilePath);
  }
  async function invokeTool(name, args = {}) {
    const tool = definitions.find(item => item.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    checkArguments(args, tool.inputSchema);
    if (name === 'list_personas') {
      const personas = require('./src/personas.ts').listPersonas();
      return { personas: personas.map(({ prompt, ...profile }) => profile) };
    }
    if (['prepare_persona_validation','measure_persona_validation','prepare_blind_review','submit_blind_review','persona_validation_report'].includes(name)) {
      const runner=require('./src/personaValidationRun.cjs');
      return ({prepare_persona_validation:runner.prepare,measure_persona_validation:runner.measure,
        prepare_blind_review:runner.prepareBlind,submit_blind_review:runner.submitBlind,
        persona_validation_report:runner.report})[name](args);
    }
    if (name === 'begin_actor_plan') {
      const snapshot=await getSnapshot(args), coordinator=args.trialFile?require('./learning-trial.cjs'):null;
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
      const persona=require('./src/personas.ts').getPersona(settings.personaId);
      if(args.learnerFile){
        if(attentionExperience) throw new Error('learnerFile cannot be combined with manual experience');
        const store=require('./learner-store.cjs'), learner=store.readLearner(args.learnerFile); learnerIdentity=learner.identity;
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
        if(attentionExperience.learning) require('./src/actorLearning.ts').validateLearning(attentionExperience.learning);
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
      const session=new ActorPlanSession(), outputPath=path.resolve(args.outputPath ?? path.join(__dirname,'output',`luna-${session.id}.json`));
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
    if (name === 'prepare_whole_trace') {
      if(args.timingProfile!==undefined && args.timingProfile!=='original') throw new Error('Whole-trace-v3 preserves actor judgment timing; use original');
      if (args.trialFile && (args.learnerFile || args.attentionExperience)) throw new Error('A trial supplies its own verified learner memory');
      if (args.arm && !args.trialFile) throw new Error('arm requires a whole-trace trialFile');
      const snapshot=await getSnapshot(args), coordinator=args.trialFile?require('./learning-trial.cjs'):null;
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
        for(const key of ['personaId','seed','maxActions','timeBudgetMs','timingProfile'])
          if(args[key]!==undefined && args[key]!==settings[key]) throw new Error(`Whole-trace trial ${key} is frozen`);
        trialRound={trialFile:args.trialFile,arm:result.arm,roundId:result.roundId,phase:result.phase,expectedMemberId:result.expectedMemberId,experiencePolicy:result.experiencePolicy};
      }else{
        if(!args.personaId || args.seed===undefined) throw new Error('Provide personaId and seed, or a prepared whole-trace trialFile and arm');
        settings={personaId:args.personaId,seed:args.seed,maxActions:args.maxActions??100,timingProfile:args.timingProfile??'original',
          ...(args.timeBudgetMs===undefined?{}:{timeBudgetMs:args.timeBudgetMs})};
      }
      const controlSlot=settings.personaId==='neutral-adult-control'
        ? require('./src/personaValidationRun.cjs').lookupControlSlot(args,snapshot) : null;
      const persona=controlSlot?require('./src/personas.ts').withValidationPersona(()=>require('./src/personas.ts').getPersona(settings.personaId))
        :require('./src/personas.ts').getPersona(settings.personaId);
      if(args.learnerFile){
        if(attentionExperience) throw new Error('learnerFile cannot be combined with manual experience');
        const store=require('./learner-store.cjs'),learner=store.readLearner(args.learnerFile);learnerIdentity=learner.identity;
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
        if(attentionExperience.learning) require('./src/actorLearning.ts').validateLearning(attentionExperience.learning);
        if(attentionExperience.learning?.memberId && args.tabId){const member=(await getBridge()).list().sessions.find(s=>s.tabId===args.tabId)?.memberId;
          if(member!==attentionExperience.learning.memberId) throw new Error('Learning cannot cross test accounts');}
      }
      const {WholeTraceSession}=require('./src/wholeTraceSession.ts');
      const createSession=()=>new WholeTraceSession({snapshot,personaId:settings.personaId,seed:settings.seed,
        ...(args.outputPath?{outputPath:path.resolve(args.outputPath)}:{}),timingProfile:settings.timingProfile,
        maxActions:settings.maxActions,maxRepairs:args.maxRepairs??0,
        ...(settings.timeBudgetMs===undefined?{}:{timeBudgetMs:settings.timeBudgetMs}),
        ...(settings.llm?{llm:settings.llm}:{}),
        ...(attentionExperience?{attentionExperience}:{}),...(learnerIdentity?{learnerIdentity}:{}),
        ...(settings.trialBinding?{trialBinding:settings.trialBinding}:{})});
      const session=controlSlot?require('./src/personas.ts').withValidationPersona(createSession):createSession();
      const prepared=session.prepare();wholeTraceSessions.set(prepared.requestId,{session,trialRound,controlSlot,submitting:false,finished:false,trialFailureRecorded:false});
      return {...prepared,...(trialRound??{})};
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
      const deliver=()=>record.controlSlot?require('./src/personas.ts').withValidationPersona(()=>repairing?record.session.submitRepair(payload):record.session.submit(payload))
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
          require('./learning-trial.cjs').recordTrialFailure({trialFile:record.trialRound.trialFile,
            arm:record.trialRound.arm,roundId:record.trialRound.roundId,stage:'generation',code:'WHOLE_TRACE_GENERATION_FAILED'});
          record.trialFailureRecorded=true;
        }
        throw error;
      }finally{record.submitting=false;}
      record.finished=result.status==='invalid'?!result.canRepair:result.status==='failed'||Boolean(result.outputPath);
      if((result.status==='failed'||result.status==='invalid'&&!result.canRepair) && record.trialRound && !record.trialFailureRecorded){
        require('./learning-trial.cjs').recordTrialFailure({trialFile:record.trialRound.trialFile,arm:record.trialRound.arm,
          roundId:record.trialRound.roundId,stage:'generation',code:result.status==='failed'?'WHOLE_TRACE_GENERATION_FAILED':'WHOLE_TRACE_CANDIDATE_INVALID'});
        record.trialFailureRecorded=true;
      }
      return {...result,...(record.trialRound??{})};
    }
    if (name === 'create_learner') {
      const persona = require('./src/personas.ts').getPersona(args.personaId);
      const { directory, ...identity } = args;
      const result = require('./learner-store.cjs').createLearner({ directory, identity: { ...identity,
        personaVersion: persona.version, policyVersion: require('./src/llmPolicy.ts').ACTOR_POLICY_VERSION } });
      return { learnerFile: result.learnerFile, identity: result.state.identity };
    }
    if (name === 'create_luna_learner') {
      const persona=require('./src/personas.ts').getPersona(args.personaId);
      const {directory,...actor}=args;
      const identity={...actor,personaVersion:persona.version,model:ACTOR_PLAN_MODEL,policyVersion:'episodic-choice-v10',reasoningEffort:'low'};
      const result=require('./learner-store.cjs').createLearner({directory:args.directory,identity});
      return {learnerFile:result.learnerFile,identity:result.state.identity};
    }
    if(name==='create_whole_trace_learner'){
      const persona=require('./src/personas.ts').getPersona(args.personaId),{directory,...actor}=args;
      const identity={...actor,personaVersion:persona.version,model:ACTOR_PLAN_MODEL,policyVersion:'whole-trace-v3',reasoningEffort:'low'};
      const result=require('./learner-store.cjs').createLearner({directory,identity});
      return {learnerFile:result.learnerFile,identity:result.state.identity};
    }
    if (name === 'create_learning_trial') return require('./learning-trial.cjs').createTrial(readJson(args.optionsFilePath));
    if (name === 'prepare_learning_round' || name === 'generate_learning_round') {
      const snapshot = await getSnapshot(args);
      const coordinator = require('./learning-trial.cjs');
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
    if (name === 'record_learning_round') return require('./learning-trial.cjs').recordTrialRound({
      trialFile: args.trialFile, arm: args.arm, roundId: args.roundId,
      trace: readJson(args.traceFilePath), snapshot: readJson(args.snapshotFilePath ?? `${args.traceFilePath}.snapshot.json`),
      replay: readJson(args.replayFilePath), receipt: readJson(args.receiptFilePath) });
    if (name === 'record_learning_failure') return require('./learning-trial.cjs').recordTrialFailure(args);
    if (name === 'compare_learning_trial') return require('./learning-trial.cjs').compareTrial(args);
    if (name === 'generate_trace') {
      const snapshot = await getSnapshot(args);
      const { tabId, snapshot: supplied, snapshotFilePath, outputPath, learnerFile, ...settings } = args;
      if (learnerFile) {
        if (settings.attentionExperience) throw new Error('learnerFile cannot be combined with manual experience');
        if (settings.mode && settings.mode !== 'llm') throw new Error('Persistent learners require AI mode');
        const store = require('./learner-store.cjs'), state = store.readLearner(learnerFile), identity = state.identity;
        const persona = require('./src/personas.ts').getPersona(settings.personaId);
        const model = settings.llm?.model ?? process.env.MARKET_LLM_MODEL ?? identity.model;
        if (identity.personaId !== persona.id || identity.personaVersion !== persona.version || identity.model !== model
          || identity.policyVersion !== require('./src/llmPolicy.ts').ACTOR_POLICY_VERSION) throw new Error('Learner actor identity changed; start a new experiment');
        if (tabId) {
          const session = (await getBridge()).list().sessions.find(s => s.tabId === tabId);
          if (identity.memberId !== session?.memberId) throw new Error('Learner cannot cross test accounts');
        }
        settings.llm = { ...settings.llm, model }; settings.mode = 'llm';
        settings.learnerIdentity = identity;
        settings.attentionExperience = store.getLearnerExperience(learnerFile);
      }
      if (tabId && settings.attentionExperience?.learning) {
        const session=(await getBridge()).list().sessions.find(s=>s.tabId===tabId);
        if(settings.attentionExperience.learning.memberId!==session?.memberId) throw new Error('Learning cannot cross test accounts');
      }
      return generateAndSave(settings, snapshot, outputPath);
    }
    if (name === 'validate_trace') return validate(readTrace(args), await getSnapshot(args));
    const active = await getBridge();
    if (name === 'pair_app_session') return active.pair(args);
    if (name === 'list_app_sessions') return active.list();
    if (name === 'play_trace') return active.play(args.tabId, readTrace(args), ownerId);
    if (name === 'replay_status') return active.status(args);
    if (name === 'stop_replay') return active.stop(args.tabId, ownerId);
    throw new Error('Unsupported tool.');
  }
  async function dispatch(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    if (message.id === undefined) return null;
    let result;
    if (message.method === 'initialize') result = { protocolVersion: ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'].includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'oneuldo-market-replay', version: '2.0.0' } };
    else if (message.method === 'ping') result = {};
    else if (message.method === 'tools/list') result = { tools: definitions };
    else if (message.method === 'tools/call') {
      try { const value = await invokeTool(message.params?.name, message.params?.arguments ?? {}); result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false }; }
      catch (error) { result = { content: [{ type: 'text', text: error.message }], isError: true }; }
    } else return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
    return { jsonrpc: '2.0', id: message.id, result };
  }
  return { invokeTool, dispatch, close: async () => { if (bridge) await bridge.close(); }, getBridge };
}
const service = createService();
function start() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set();
  input.on('line', line => {
    if (!line.trim()) return;
    let message;
    try { if (Buffer.byteLength(line) > 4 * 1024 * 1024) throw new Error('too large'); message = JSON.parse(line); }
    catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON or request exceeds 4 MiB; use a file path.' } }) + '\n'); return; }
    const task = service.dispatch(message).then(response => { if (response) process.stdout.write(JSON.stringify(response) + '\n'); }).finally(() => pending.delete(task));
    pending.add(task);
  });
  input.on('close', async () => { await Promise.allSettled(pending); await service.close(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await service.close(); process.exit(0); });
}
module.exports = { definitions, createService, ...service, start };
if (require.main === module) start();
