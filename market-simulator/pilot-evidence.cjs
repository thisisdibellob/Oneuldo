'use strict';
// Experimental measurements only; no changes to production AI judgments or actor error rates.
const { createHash } = require('node:crypto');
require('./runtime.cjs');
const { marketReplayTraceId, validateMarketReplayTrace, canonicalMarketReplayJson, marketReplayFingerprint } = require('../frontend/src/game/marketReplayTrace.ts');
const { validateAttentionMemory } = require('./src/attentionPolicy.ts');
const {validateLearning,validateLearnerIdentity,assertLearnerIdentity,assertPersonaLearningEligible,LEARNER_IDENTITY_KEYS,learnerIdentityFrom} = require('./src/actorLearning.ts');
const {TraceGuard} = require('./src/traceValidation.ts');
const { marketProducts } = require('../frontend/src/game/scenarios.ts');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const need = (value, message) => { if (!value) throw new Error(message); };

function positiveCart(cart, message) {
  need(cart && typeof cart === 'object' && !Array.isArray(cart)
    && Object.values(cart).every(q => Number.isSafeInteger(q) && q >= 0), message);
  return Object.fromEntries(Object.entries(cart).filter(([,quantity]) => quantity > 0));
}
function verifySystemCompletion(trace, replay) {
  const completion = trace.generation?.systemCompletion;
  if (!completion) return;
  const expected = canonicalMarketReplayJson(completion.cartAtStart);
  need(replay.report.submission?.source === 'app-ui-before-submit', 'System completion requires actual app submission evidence');
  need(canonicalMarketReplayJson(positiveCart(replay.report.submission.cart, 'Invalid actual cart')) === expected,
    'System completion submitted cart differs from the actor boundary');
  const observed = replay.report.systemCompletion;
  if (observed !== undefined) {
    need(observed && typeof observed === 'object' && !Array.isArray(observed), 'Invalid app system completion boundary');
    const {observedCartAtStart, startedAt, source, ...metadata} = observed;
    need(source === 'app-ui-before-system-completion' && Number.isFinite(Date.parse(startedAt))
      && canonicalMarketReplayJson(metadata) === canonicalMarketReplayJson(completion), 'App system completion boundary differs from trace');
    need(canonicalMarketReplayJson(positiveCart(observedCartAtStart, 'Invalid observed system completion cart')) === expected,
      'Observed system completion cart differs from the actor boundary');
  }
}
function actorSteps(trace) {
  const firstStepId = trace.generation?.systemCompletion?.firstStepId;
  if (!firstStepId) return trace.steps;
  const first = trace.steps.findIndex(step => step.id === firstStepId);
  need(first >= 0, 'System completion actor boundary is missing');
  return trace.steps.slice(0, first);
}

function verifyExecution(trace, snapshot, replay, receipt, options = {}) {
  need(validateMarketReplayTrace(trace, snapshot).valid && marketReplayTraceId(trace) === trace.traceId, 'Trace/snapshot mismatch');
  need(replay.traceId === trace.traceId && replay.traceHash === hash(trace) && replay.snapshotId === snapshot.snapshotId, 'Replay binding mismatch');
  need(replay.status === 'completed' && replay.report?.acknowledged === true, 'Actual app replay did not complete');
  const done = replay.report.completedSteps;
  need(Array.isArray(done) && done.length === trace.steps.length && done.every((s, i) => s.id === trace.steps[i].id && s.type === trace.steps[i].type), 'Not every planned step was executed in order');
  need(replay.report.displacementViolations === 0 && replay.report.inputViolations === 0, 'Invalid movement measurements');
  need(receipt.sessionId === replay.sessionId && receipt.memberId === replay.memberId && receipt.eventCount > 0
    && receipt.firstSequence === 1 && receipt.lastSequence === receipt.eventCount
    && receipt.uniqueSequences === receipt.eventCount && receipt.uniqueClientEvents === receipt.eventCount
    && receipt.endEvents === 1, 'App logs not confirmed in the isolated database');
  if (receipt.timeReversals !== 0) {
    const details = receipt.timeReversalDetails;
    need(options.allowNonMonotonicMovementTimestamps === true && Array.isArray(details)
      && details.length === receipt.timeReversals && details.length > 0
      && details.every(d => d.eventCode === 'SHOP.MOVEMENT_SAMPLED' && d.previousEventCode === 'SHOP.MOVEMENT_SAMPLED'
        && Number.isFinite(d.reversalMs) && d.reversalMs > 0), 'Non-monotonic event time requires an explicit movement-only audit');
  }
  verifySystemCompletion(trace,replay);
  return true;
}

function bindLearningIdentity(identity, trace, replay) {
  validateLearnerIdentity(identity);
  need(trace.generation?.learnerIdentity, 'Persistent learner traces require their generation learner identity');
  assertLearnerIdentity(trace.generation.learnerIdentity,identity);
  need(identity.memberId === replay.memberId, 'Learner identity mismatch: memberId');
  need(trace.generationPolicy === 'llm', 'Persistent learner experience requires an AI trace');
  for (const [key,value] of Object.entries({personaId:trace.personaId,personaVersion:trace.personaVersion,
    model:trace.generation?.model,policyVersion:trace.generation?.actorPolicyVersion}))
    need(identity[key] === value, `Learner identity mismatch: ${key}`);
}

/** Experimental condition episode-outcome-v1: what the actor's own executed ending left on screen
 * (how it ended, the final basket, whether purchase was confirmed). No list comparison, score or next-step advice.
 */
function episodeOutcome(trace, replay, guard) {
  // Lifecycle steps (skipRating, leave) follow the actor's own ending; locate the ending itself.
  const steps = actorSteps(trace), final = guard.observe();
  const endIndex = steps.findLastIndex(s => ['giveUp', 'submitForReview'].includes(s.type)), last = steps[endIndex >= 0 ? endIndex : steps.length - 1];
  const items = Object.entries(final.cart ?? {}).filter(([, q]) => q > 0).map(([id, q]) => {
    const p = marketProducts.find(p => p.id === id); return `${p ? `${p.name} ${p.detail ?? ''}`.trim() : id} ${q}개`;
  });
  const submitted = last.type === 'submitForReview';
  const ending = submitted ? '구매 확정을 눌러 끝났어요' : last.type === 'giveUp' ? '이번 장보기 그만하기로 끝났어요' : '장보기가 끝났어요';
  const result = `지난 장보기 결과: ${ending}. ${submitted ? '확정한' : '끝날 때'} 장바구니: ${items.length ? items.join(', ') : '비어 있음'}. 구매 확정: ${submitted ? '함' : '안 함'}.`;
  return { action: 'episode-outcome', result, source: 'executed-app-action',
    evidence: { sessionId: replay.sessionId, replayId: replay.replayId, traceId: trace.traceId, stepId: last.id, stepIndex: steps.indexOf(last) } };
}

/** Condition procedural-routine-v1: the actor's own executed step order, compressed. Waiting, closing views and
 * lifecycle steps are omitted; no step is added, reordered or judged. */
function routineToken(step, before) {
  const product = id => { const p = marketProducts.find(p => p.id === id); return p ? `${p.name} ${p.detail ?? ''}`.trim() : id; };
  switch (step.type) {
    case 'walkToAnchor': return '통로 걷기';
    case 'walkTo': return `${before.visibleStations.find(s => s.id === step.target.stationId)?.label ?? step.target.stationId} 쪽으로 걷기`;
    case 'openShelf': return `${before.visibleStations.find(s => s.id === step.stationId)?.label ?? step.stationId} 진열대 열기`;
    case 'dragProduct': return `${product(step.productId)} ${step.quantity}개 담기`;
    case 'removeProduct': return `${product(step.productId)} ${step.quantity}개 내려놓기`;
    case 'closeStation': return before.phase === 'checkout' ? '계산 화면에서 다시 고르기' : before.shelf ? '다 골랐어요(진열대 닫기)' : '대화 닫기';
    case 'checkout': return `${step.checkoutId === 'checkout-2' ? 2 : 1}번 계산대 이용하기`;
    case 'submitForReview': return '구매 확정';
    case 'giveUp': return '그만하기';
    case 'viewCart': return '장바구니 보기';
    case 'readList': return '목록 읽기';
    case 'viewHelp': return '이용 방법 보기';
    case 'talkToStaff': return '직원과 대화';
    default: return null;
  }
}
const EXPLORATION = new Set(['통로 걷기', '목록 읽기', '장바구니 보기', '이용 방법 보기']);
/** Task-analysis style chunking: a run of only exploration controls becomes one counted segment,
 *  so the executed milestones (shelf, add, close, checkout, confirm, stop) keep their order and stay visible. */
function compressRoutine(tokens) {
  const out = [];
  for (const t of tokens) {
    const last = out.at(-1);
    if (EXPLORATION.has(t) && last?.explore) { last.counts[t] = (last.counts[t] ?? 0) + 1; continue; }
    if (EXPLORATION.has(t)) { out.push({ explore: true, counts: { [t]: 1 } }); continue; }
    if (last && !last.explore && last.t === t) last.n++; else out.push({ t, n: 1 });
  }
  return out.map(x => x.explore
    ? (Object.keys(x.counts).length === 1 && Object.values(x.counts)[0] === 1 ? Object.keys(x.counts)[0]
      : `둘러보기(${Object.entries(x.counts).map(([k, n]) => `${k} ${n}`).join('·')})`)
    : x.n > 1 ? `${x.t}×${x.n}` : x.t);
}
function episodeRoutine(trace, replay, tokens, guard) {
  const steps = actorSteps(trace), last = steps.at(-1), final = guard.observe();
  const items = Object.entries(final.cart ?? {}).filter(([, q]) => q > 0).map(([id, q]) => {
    const p = marketProducts.find(p => p.id === id); return `${p ? `${p.name} ${p.detail ?? ''}`.trim() : id} ${q}개`;
  });
  const tail = ` (끝날 때 장바구니: ${items.length ? items.join(', ') : '비어 있음'})`;
  const full = compressRoutine(tokens);
  const text = c => '지난 장보기에서 실제로 한 순서: ' + c.join(' → ') + tail;
  // Bounded to 500 chars: keep the first 3 steps and as many final steps as fit, marking the omitted middle.
  let chain = full;
  for (let keep = full.length - 4; text(chain).length > 500 && keep >= 1; keep--) chain = [...full.slice(0, 3), '…', ...full.slice(-keep)];
  return { action: 'episode-routine', result: text(chain).slice(0, 500), source: 'executed-app-action',
    evidence: { sessionId: replay.sessionId, replayId: replay.replayId, traceId: trace.traceId, stepId: last.id, stepIndex: steps.length - 1 } };
}

/** Reconstruct only content tied to executed controls, never AI analysis or task correctness.
 * Text comes from the shared app/guard presentation, not a claim of measured comprehension.
 */
function executedLearning(trace, snapshot, replay, prior, identity, options = {}) {
  if (prior) {
    validateLearning(prior); need(prior.memberId === replay.memberId, 'Learning cannot cross test accounts');
    if (identity) {
      need(prior.version === '2', 'Legacy unbound experience cannot seed a persistent learner');
      assertLearnerIdentity(learnerIdentityFrom(prior),identity);
    }
  }
  if (identity) bindLearningIdentity(identity,trace,replay);
  const episodes = [...(prior?.episodes ?? [])];
  const spatialEnabled=identity?.policyVersion==='episodic-choice-v11';
  if(spatialEnabled)need(trace.attentionExperience?.layoutKey===marketReplayFingerprint(snapshot.environment),'Spatial memory layout must match actual replay geometry');
  const spatialModule=spatialEnabled?require('./src/confirmedSpatialMemory.ts'):null;
  const spatialRecorder=spatialEnabled?new spatialModule.ConfirmedSpatialRecorder(trace.attentionExperience.layoutKey,prior?.spatial,
    prior?{sessionId:prior.sessionId,replayId:prior.replayId}:undefined,spatialModule.navigationGeometryKey(snapshot.environment)):null;
  const guard = new TraceGuard(snapshot,trace.personaId,trace.personaVersion,'confirmed-experience',true,Boolean(identity),false,false,false,false,true,false,undefined,spatialEnabled);
  const routineTokens=[];
  for(const [stepIndex,step] of actorSteps(trace).entries()) {
    const before=guard.observeActor(); const applied=guard.execute(step); const after=guard.observeActor();
    const token=routineToken(step,before);if(token)routineTokens.push(token);
    const e={action:step.type,source:'executed-app-action'};
    if(spatialRecorder){
      spatialRecorder.record(step,before,after,{sessionId:replay.sessionId,replayId:replay.replayId,traceId:trace.traceId,stepId:step.id,stepIndex},
        spatialModule.navigationGeometryKey(applied.before.environment,applied.before.cashierAvailability));
      if(step.type==='walkToAnchor'||step.type==='walkTo'){
        const target=step.type==='walkToAnchor'?before.anchors.find(a=>a.id===step.target.anchorId):before.visibleStations.find(s=>s.id===step.target.stationId);
        e.target=target.label;e.seenStations=after.visibleStations.slice(0,20).map(s=>s.label);
        e.result=`Walked toward observed ${target.label} (${target.direction}, ${target.distanceBand}); arrived using ordinary app controls. Directions describe that historical observation only.`;
      }
    }
    if(step.type==='start' && before.instructions) e.instructions=before.instructions.lines;
    if(step.type==='readList' && after.readObjectives) e.readList=after.readObjectives.map(x=>({label:x.label,quantity:x.quantity}));
    if(['openShelf','browse'].includes(step.type) && after.products.length) {
      e.target=after.activeStation;
      e.seenProducts=after.products.slice(0,20).map(p=>`${p.name} ${p.detail??''}`.trim().slice(0,200));
    }
    if(['dragProduct','removeProduct'].includes(step.type)) {
      const p=marketProducts.find(p=>p.id===step.productId);
      e.product=p?`${p.name} ${p.detail??''}`.trim():step.productId;e.quantity=step.quantity;
      e.result='Action executed; correctness was not displayed by this action.';
    }
    if(step.type==='viewCart') e.result=('Displayed basket: '+JSON.stringify(after.cart)).slice(0,500);
    if(step.type==='checkout' && after.instructions) e.instructions=after.instructions.lines;
    if(step.type==='viewHelp') {
      if(after.supportText?.length) e.supportText=[...after.supportText];
      e.result=after.supportText?.length ? 'Help text displayed; comprehension unknown.' : 'Help opened; help text not captured; comprehension unknown.';
    }
    if(step.type==='talkToStaff' && ['requestCashier','returnProduct','askLocation'].includes(step.choice) && after.result?.message) {
      e.target=step.stationId;e.result=after.result.message;
      if(step.choice==='returnProduct') {
        const p=marketProducts.find(p=>p.id===step.productId);e.product=p?`${p.name} ${p.detail??''}`.trim():step.productId;e.quantity=step.quantity;
      }
    }
    if (identity) {
      e.evidence={sessionId:replay.sessionId,replayId:replay.replayId,traceId:trace.traceId,stepId:step.id,stepIndex};
      // Retain executed actor history; the automatic checkout suffix is never actor learning.
      episodes.push(e);
    } else if(Object.keys(e).length>2) episodes.push(e);
  }
  if (identity && options.outcomeFeedback === 'episode-outcome-v1') episodes.push(episodeOutcome(trace, replay, guard));
  if (identity && options.routineMemory === 'procedural-routine-v1') episodes.push(episodeRoutine(trace, replay, routineTokens, guard));
  // remembered-route-v1: a contract marker (not an experience) that lets later rounds annotate passages from spatial memory.
  if (identity && spatialEnabled && options.recallMove === 'remembered-route-v1') {
    const steps = actorSteps(trace), last = steps.at(-1);
    episodes.push({ action: 'episode-route-recall', result: 'remembered-route-v1', source: 'executed-app-action',
      evidence: { sessionId: replay.sessionId, replayId: replay.replayId, traceId: trace.traceId, stepId: last.id, stepIndex: steps.length - 1 } });
  }
  const artifact={version:identity?'2':'1',source:'confirmed-app-replay',...(identity??{}),memberId:replay.memberId,
    sessionId:replay.sessionId,replayId:replay.replayId,episodes:identity?episodes:episodes.slice(-24),...(spatialRecorder?{spatial:spatialRecorder.snapshot()}:{})};
  validateLearning(artifact);return artifact;
}

/** Legacy memory retains executed controls and products; explicit v11 also reconstructs
 * bounded observed passages/landmarks from the actor prefix under the shared guard.
 * Planned-trace memory, analysis, next-quest answers and comprehension are never imported.
 */
function confirmedExperience(trace, snapshot, replay, receipt, prior, options = {}) {
  verifyExecution(trace, snapshot, replay, receipt, options);
  assertPersonaLearningEligible(trace);
  const identity=options.identity ?? (prior?.learning?.version==='2' ? learnerIdentityFrom(prior.learning) : undefined);
  if (identity) bindLearningIdentity(identity,trace,replay);
  if (prior) {
    need(prior.provenance?.source === 'confirmed-app-replay' && prior.provenance.memberId === replay.memberId, 'Memory cannot cross test arms/accounts');
    validateAttentionMemory(prior.memory);
  }
  const controls = new Set(prior?.memory.controlsPracticed ?? []);
  const products = new Map((prior?.memory.knownProducts ?? []).map(p => [p.id, p]));
  const mapping = { openShelf:'interact', walkTo:'walkTo', walkToAnchor:'walkToAnchor', readList:'readList',
    browse:'browse', pause:'pause', lookAround:'lookAround', dragProduct:'add', removeProduct:'remove',
    viewCart:'viewCart', viewHelp:'viewHelp', closeView:'closeView', closeStation:'closeStation',
    checkout:'checkout', requestCashier:'requestCashier', requestReturn:'requestReturn', submitForReview:'submit',
    giveUp:'giveUp', skipRating:'skipRating' };
  for (const step of actorSteps(trace)) {
    if (mapping[step.type]) controls.add(mapping[step.type]);
    if (step.type === 'talkToStaff' && ['openLocationHelp','askLocation','backToStaff'].includes(step.choice)) controls.add(step.choice);
    if (step.type === 'dragProduct') {
      const p = marketProducts.find(p => p.id === step.productId);
      need(p, 'Unknown executed product');
      // Historical stock is not a prediction of the next visit's stock.
      products.set(p.id, { id:p.id, categoryId:p.categoryId, name:p.name, ...(p.detail ? { detail:p.detail } : {}), price:p.price, stock:0 });
    }
  }
  const learning=trace.generationPolicy==='llm'?executedLearning(trace,snapshot,replay,prior?.learning,identity,options):undefined;
  const memory = { version:'1', stations:learning?.spatial?.stations??[], anchors:learning?.spatial?.anchors??[], knownProducts:[...products.values()], controlsPracticed:[...controls] };
  validateAttentionMemory(memory);
  return { visit:'revisit', previousLayoutKey:trace.attentionExperience.layoutKey, memory,
    ...(learning ? {learning} : {}),
    provenance:{ source:'confirmed-app-replay', replayId:replay.replayId, sessionId:replay.sessionId, memberId:replay.memberId,
      traceHash:hash(trace), databaseReceiptHash:hash(receipt), ...(identity ? {identity:{...identity}} : {}), comprehensionMeasured:false, spatialMemoryRetained:!!learning?.spatial,
      ...(trace.generation?.systemCompletion ? {learningScope:'actor-prefix',
        systemCompletionFirstStepId:trace.generation.systemCompletion.firstStepId} : {}),
      ...(receipt.timeReversals ? { temporalWarning:'NON_MONOTONIC_MOVEMENT_TIMESTAMPS', timeReversals:receipt.timeReversals } : {}) } };
}

function measureRound(trace, snapshot, replay, receipt, options = {}) {
  verifyExecution(trace, snapshot, replay, receipt, options);
  const submission = replay.report.submission;
  const elapsedMs = Date.parse(replay.report.endedAt) - Date.parse(replay.report.startedAt);
  need(Number.isFinite(elapsedMs) && elapsedMs >= 0, 'Invalid replay timing');
  const counts = {};
  for (const s of replay.report.completedSteps) counts[s.type] = (counts[s.type] ?? 0) + 1;
  const measurement = { source:'actual-app-replay-and-database', sessionId:replay.sessionId, elapsedMs,
    eventCount:receipt.eventCount, actionCounts:counts, submitted:!!submission, purchase:null,
    interpretation:'Task measurements, not an ability score or evidence of real human learning.' };
  if (trace.generation?.controlledStop) {
    need(!submission, 'A system-controlled stop cannot have submission evidence');
    return {...measurement, outcome:'system-intervention', learningEligible:false, performanceEligible:false,
      intervention:structuredClone(trace.generation.controlledStop),
      ...(trace.generation.controlledStop.reason === 'action-limit' ? {completion:'action-limit-incomplete',
        actorDecisionCount:trace.generation.controlledStop.afterDecisions,
        systemEndingStepIds:trace.steps.slice(-3).map(step=>step.id)} : {}),
      interpretation:trace.generation.controlledStop.reason === 'action-limit'
        ? 'Observation ended at 100 actor decisions. The final three controls were added by the system, not chosen by the persona. The task is incomplete, not scored as a failure. Whole-session learning and analysis-effect comparisons remain excluded pending actor-prefix support.'
        : 'Technical termination by the generation watchdog. Action counts are execution diagnostics only; exclude this run from persona performance, learning and quest-effect comparisons.'};
  }
  if (trace.generation?.systemCompletion) {
    const completion = trace.generation.systemCompletion;
    const actor = actorSteps(trace), actorActionCounts = {};
    for (const step of actor) actorActionCounts[step.type] = (actorActionCounts[step.type] ?? 0) + 1;
    Object.assign(measurement,{outcome:'assisted-completion',completion:'assisted-submission',
      learningEligible:true,learningScope:'actor-prefix',analysisEligible:true,performanceEligible:false,
      actorDecisionCount:completion.afterDecisions,actorActionCounts,
      systemCompletion:structuredClone(completion),systemCompletionStepIds:trace.steps.slice(actor.length).map(step=>step.id),
      interpretation:'The unchanged actor basket was submitted by the system after 100 decisions. Purchase content may be measured, but automatic checkout is not independent persona completion. Only the executed actor prefix may enter learning; analysis readiness requires its separate server result.'});
  }
  if (receipt.timeReversals) measurement.temporalWarning = {
    code:'NON_MONOTONIC_MOVEMENT_TIMESTAMPS', details:receipt.timeReversalDetails,
    limitation:'Purchase and completed-action evidence retained; do not infer movement timing across reversed samples. Original timestamps were not changed.'
  };
  if (!submission) return measurement;
  need(submission.source === 'app-ui-before-submit', 'Submission must be captured from the actual app');
  const cart = submission.cart;
  positiveCart(cart, 'Invalid actual cart');
  const allowed = new Set();
  const objectives = snapshot.mission.objectives.map(o => {
    const ids = o.acceptedProductIds?.length ? o.acceptedProductIds : [o.productId];
    ids.forEach(id => { need(!allowed.has(id), 'Overlapping objectives cannot be scored independently'); allowed.add(id); });
    const actual = ids.reduce((n,id) => n + (cart[id] ?? 0),0);
    return { productId:o.productId, requested:o.quantity, actual, missing:Math.max(0,o.quantity-actual), excess:Math.max(0,actual-o.quantity) };
  });
  let total=0, offListUnits=0;
  for (const [id,qty] of Object.entries(cart)) {
    const p=marketProducts.find(p => p.id === id); need(p, 'Unknown cart price'); total+=p.price*qty;
    if (!allowed.has(id)) offListUnits+=qty;
  }
  measurement.purchase = { objectives, cart:{...cart}, total, budget:snapshot.mission.budget, withinBudget:total<=snapshot.mission.budget,
    offListUnits, exact:objectives.every(o => o.missing===0 && o.excess===0) && offListUnits===0 && total<=snapshot.mission.budget };
  return measurement;
}

function requirePersonalizedContinuation(job, generation, expected) {
  need(job?.status === 'READY' && job.sessionId === expected.sessionId && job.analysisId, 'Previous session analysis/profile is not ready');
  need(generation?.source === 'AI' && generation.analysisId === job.analysisId && generation.profileId && generation.generationId,
    'Quest is not an AI result linked to the completed analysis');
  return true;
}
module.exports = { verifyExecution, confirmedExperience, measureRound, requirePersonalizedContinuation, bindLearningIdentity };
