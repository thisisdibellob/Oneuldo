'use strict';
// Legacy feedback-choice incremental generation (frozen; reproduction and comparison only).
// Handler bodies were moved verbatim from server.cjs.
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const { string, seed, object, schema, feedbackMovement } = require('../schema.cjs');
const { ACTOR_PLAN_MODEL } = require('../../src/legacy/actorPlanSession.ts');
const { FeedbackPlanSession } = require('../../src/legacy/feedbackPlanSession.ts');
const definitions = [
  { name: 'begin_feedback_plan', description: 'Default feedback-choice-v7 persona planning with changes since the last basket check (explicit feedback-choice-v8 adds the shelf in-cart cue, controller-recorded lastAction and memory.nextStep in place of currentTask; explicit feedback-choice-v9 also adds worded revisitNotes for repeatedly opened shelves, offers no giveUp choice and ends an unfinished 100-action run with the recorded system checkout of the unchanged basket), actor-authored quantity/source beliefs, current basket text, grouped incremental actions, bounded observed experience, persistent intent and configurable 20% wandering (explicit v1-v6 retain their contracts): start a fresh offline actor with one action per observation. Returns the first current-screen frame and bounded recent observed experience, never a whole map or unbounded audit memory. Use an independent model context for each frame. No web action is executed. Retry with the same requestId and arguments to recover the same session.', inputSchema: schema({requestId:string,personaId:string,seed,actorPolicyVersion:{enum:['feedback-choice-v1','feedback-choice-v2','feedback-choice-v3','feedback-choice-v4', 'feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7', 'feedback-choice-v8', 'feedback-choice-v9', 'feedback-choice-v10', 'feedback-choice-v11', 'feedback-choice-v12', 'feedback-choice-v13']},feedbackMovement,tabId:string,snapshot:object,snapshotFilePath:string,outputPath:string,maxActions:{type:'integer',minimum:1,maximum:100},timeBudgetMs:{type:'integer',minimum:1000,maximum:3600000}}, ['requestId','personaId','seed']) },
  { name: 'step_feedback_plan', description: 'Choose exactly one current choice and replace the actor belief memory. v8 to v13 memory uses nextStep (what follows this choice) and rejects currentTask. v5/v6 grouped add/remove choices require choiceParameters matching the current catalog; omit parameters for other choices. In v4/v5/v6, optional memory.ongoingIntent persists when omitted, updates when a string is supplied and clears when null is supplied. Apply it offline and return its visible outcome and next frame or completion in one response. Same requestId and payload retries never execute twice. moveDirection holds a direction for 100..2000 ms even without a visible target; durationMs is 0 for other ordinary actions; pause/lookAround/readList/browse require 100..120000 ms during the activity, and viewCart/viewHelp allow 0..120000 ms after opening. No pre-action wait. Incorrect beliefs, cart contents and early stopping are preserved.', inputSchema: schema({sessionId:string,requestId:string,revision:{type:'integer',minimum:1},choiceId:string,choiceParameters:schema({productId:string,quantity:{type:'integer',minimum:1,maximum:99},dragOutcome:{enum:['drop','miss','cancel']}}, ['productId','quantity']),durationMs:{type:'integer',minimum:0,maximum:120000},reason:string,memory:object}, ['sessionId','requestId','revision','choiceId','durationMs','reason','memory']) },
  { name: 'observe_feedback_plan', description: 'Recover the current actor frame after a connection timeout. Does not reapply an action. A pending step must be retried with its original requestId.', inputSchema: schema({sessionId:string}, ['sessionId']), annotations:{readOnlyHint:true} },
  { name: 'finalize_feedback_plan', description: 'Return the complete saved versioned feedback trace and counts. Generation is offline; validate and explicitly replay the saved trace separately.', inputSchema: schema({sessionId:string}, ['sessionId']), annotations:{readOnlyHint:true} },
];
async function invoke(name, args, ctx) {
  const { getSnapshot, generateAndSave, feedbackSessions, feedbackBegins } = ctx;
  if (name === 'begin_feedback_plan') {
    const key = require('../../../frontend/src/game/marketReplayTrace.ts').canonicalMarketReplayJson(args);
    const previous = feedbackBegins.get(args.requestId);
    if (previous) {
      if (previous.key !== key) throw new Error('Feedback begin requestId was reused with different arguments');
      return previous.promise;
    }
    const promise = (async () => {
      const snapshot = await getSnapshot(args);
      // Omitted versions use the shared feedback default in FeedbackPlanSession.
      const session = new FeedbackPlanSession(args.seed, args.actorPolicyVersion, args.feedbackMovement);
      const outputPath = path.resolve(args.outputPath ?? path.join(ROOT, 'output', `feedback-${session.id}.json`));
      const settings = { personaId:args.personaId,seed:args.seed,mode:'llm',llm:{model:ACTOR_PLAN_MODEL,maxCalls:300},
        tracePolicyVersion:'6',actorPolicyVersion:session.policyVersion,reasoningEffort:'low',timingProfile:'original',maxActions:args.maxActions??100,
        ...(args.timeBudgetMs === undefined ? {} : {timeBudgetMs:args.timeBudgetMs}),
        ...(args.feedbackMovement === undefined ? {} : {feedbackMovement:args.feedbackMovement}),
        feedbackDecisionProvider:frame=>session.decideFrame(frame),
        onActorDecisionApplied:after=>session.recordApplied(after) };
      const record = {session,outputPath,done:null,error:null};
      feedbackSessions.set(session.id, record);
      record.done = generateAndSave(settings,snapshot,outputPath).then(result=>{session.complete();return result;})
        .catch(error=>{record.error=error;session.fail(error);throw error;});
      record.done.catch(()=>{});
      const frame = await session.awaitObserve();
      if (record.error) throw record.error;
      return {sessionId:session.id,model:ACTOR_PLAN_MODEL,reasoningEffort:'low',actorPolicyVersion:session.policyVersion,policyVersion:'6',frame};
    })();
    feedbackBegins.set(args.requestId, {key,promise});
    return promise;
  }
  if (['step_feedback_plan','observe_feedback_plan','finalize_feedback_plan'].includes(name)) {
    const record=feedbackSessions.get(args.sessionId); if(!record) throw new Error('Unknown feedback plan session');
    if(name==='step_feedback_plan') {
      const {sessionId:_sessionId,...input}=args;
      return record.session.step(input);
    }
    if(record.error) throw record.error;
    if(name==='observe_feedback_plan') return record.session.awaitObserve();
    if(!record.session.status.complete) throw new Error('Feedback trace is still running; apply the current frame first');
    return {...await record.done,model:ACTOR_PLAN_MODEL,reasoningEffort:'low',actorPolicyVersion:record.session.policyVersion,...record.session.status};
  }
  throw new Error('Unsupported tool.');
}
module.exports = { definitions, invoke };
