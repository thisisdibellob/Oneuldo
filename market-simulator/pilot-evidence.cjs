'use strict';
// Experimental measurements only; no changes to production AI judgments or actor error rates.
const { createHash } = require('node:crypto');
require('./runtime.cjs');
const { marketReplayTraceId, validateMarketReplayTrace } = require('../frontend/src/game/marketReplayTrace.ts');
const { validateAttentionMemory } = require('./src/attentionPolicy.ts');
const {validateLearning} = require('./src/actorLearning.ts');
const {TraceGuard} = require('./src/traceValidation.ts');
const { marketProducts } = require('../frontend/src/game/scenarios.ts');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const need = (value, message) => { if (!value) throw new Error(message); };

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
  return true;
}

/** Reconstruct only content tied to executed controls, never AI analysis or task correctness. */
function executedLearning(trace, snapshot, replay, prior) {
  if (prior) { validateLearning(prior); need(prior.memberId === replay.memberId, 'Learning cannot cross test accounts'); }
  const episodes = [...(prior?.episodes ?? [])];
  const guard = new TraceGuard(snapshot,trace.personaId,trace.personaVersion,'confirmed-experience',true);
  for(const step of trace.steps) {
    const before=guard.observeActor(); guard.execute(step); const after=guard.observeActor();
    const e={action:step.type,source:'executed-app-action'};
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
    if(step.type==='viewHelp') e.result='Help opened; help text not captured; comprehension unknown.';
    if(Object.keys(e).length>2) episodes.push(e);
  }
  const artifact={version:'1',source:'confirmed-app-replay',memberId:replay.memberId,sessionId:replay.sessionId,replayId:replay.replayId,episodes:episodes.slice(-24)};
  validateLearning(artifact);return artifact;
}

/** Conservative memory: retain only controls actually completed and products actually dragged.
 * Deliberately does not import planned-trace memory, goals, analysis, or the next quest's answer.
 * Spatial/visual discoveries and comprehension are unmeasured, so are not invented here.
 */
function confirmedExperience(trace, snapshot, replay, receipt, prior, options = {}) {
  verifyExecution(trace, snapshot, replay, receipt, options);
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
  for (const step of trace.steps) {
    if (mapping[step.type]) controls.add(mapping[step.type]);
    if (step.type === 'dragProduct') {
      const p = marketProducts.find(p => p.id === step.productId);
      need(p, 'Unknown executed product');
      // Historical stock is not a prediction of the next visit's stock.
      products.set(p.id, { id:p.id, categoryId:p.categoryId, name:p.name, ...(p.detail ? { detail:p.detail } : {}), price:p.price, stock:0 });
    }
  }
  const memory = { version:'1', stations:[], anchors:[], knownProducts:[...products.values()], controlsPracticed:[...controls] };
  validateAttentionMemory(memory);
  return { visit:'revisit', previousLayoutKey:trace.attentionExperience.layoutKey, memory,
    ...(trace.generationPolicy==='llm' ? {learning:executedLearning(trace,snapshot,replay,prior?.learning)} : {}),
    provenance:{ source:'confirmed-app-replay', replayId:replay.replayId, sessionId:replay.sessionId, memberId:replay.memberId,
      traceHash:hash(trace), databaseReceiptHash:hash(receipt), comprehensionMeasured:false, spatialMemoryRetained:false,
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
  if (receipt.timeReversals) measurement.temporalWarning = {
    code:'NON_MONOTONIC_MOVEMENT_TIMESTAMPS', details:receipt.timeReversalDetails,
    limitation:'Purchase and completed-action evidence retained; do not infer movement timing across reversed samples. Original timestamps were not changed.'
  };
  if (!submission) return measurement;
  need(submission.source === 'app-ui-before-submit', 'Submission must be captured from the actual app');
  const cart = submission.cart;
  need(Object.values(cart).every(q => Number.isSafeInteger(q) && q >= 0), 'Invalid actual cart');
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
module.exports = { verifyExecution, confirmedExperience, measureRound, requirePersonalizedContinuation };
