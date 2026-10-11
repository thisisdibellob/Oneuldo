'use strict';
const { getMarketProduct } = require('../../frontend/src/game/scenarios.ts');
const { matchesObjective } = require('../../frontend/src/game/marketSession.ts');
const comparisonReasons = ['compare-visible-options-before-selecting','compare-another-observed-shelf-page','return-to-a-compared-option'];
const starts = (step, prefix) => String(step.reason ?? '').startsWith(prefix);
function legacyCounts(trace, persona, goals = []) {
  const steps=trace.steps, familiar=new Set(persona.character?.familiarProductIds ?? []);
  const selections=steps.filter(s=>s.type==='dragProduct' && s.gesture?.outcome==='drop');
  const returns=steps.filter(s=>s.type==='removeProduct'||s.type==='talkToStaff'&&s.choice==='returnProduct');
  const goalShelves=new Set(goals.map(o=>{try{return getMarketProduct(o.productId).categoryId}catch{return null}}));
  const listReads=steps.filter(s=>s.type==='readList').length;
  return {interestShelfOpens:steps.filter(s=>s.type==='openShelf'&&s.attentionTag==='interest').length,
    nonGoalShelfOpens:steps.filter(s=>s.type==='openShelf'&&!goalShelves.has(s.stationId)).length,
    comparisonBrowses:steps.filter(s=>s.type==='browse'&&comparisonReasons.some(r=>starts(s,r))).length,
    listRechecks:Math.max(0,listReads-1),cartChecks:steps.filter(s=>s.type==='viewCart').length,
    familiarSelections:selections.filter(s=>familiar.has(s.productId)).length,
    familiarShortcuts:selections.filter(s=>starts(s,'choose-a-familiar-visible-variant-before-checking-all-details')).length,
    selections:selections.length,returnActions:returns.length,returnedQuantity:returns.reduce((n,s)=>n+(s.quantity??0),0),
    staffReturnRequests:returns.filter(s=>s.type==='talkToStaff').length,
    postSelectionListRechecks:steps.filter(s=>s.type==='readList'&&starts(s,'recheck-the-list-after-a-selection')).length,
    preCheckoutCartChecks:steps.filter(s=>s.type==='viewCart'&&starts(s,'check-the-basket-before-looking-for-checkout')).length};
}
function validationGoals(snapshot) {
  return (snapshot.config?.objectives ?? snapshot.mission?.objectives ?? []).map((goal, index) => ({
    ...goal, id: goal.id ?? `objective-${index + 1}`, match: goal.match ?? snapshot.config?.difficulty ?? 'exact',
    familyId: goal.familyId ?? getMarketProduct(goal.productId)?.familyId ?? goal.productId,
  }));
}
function isGoalProduct(id, goal) {
  if (!id) return false;
  try { return matchesObjective(id, goal); } catch { return false; }
}
function sameFamily(id, goal) {
  const product = getMarketProduct(id);
  return Boolean(product && (product.familyId ?? product.id) === goal.familyId);
}
function matchesAction(step, action) {
  if (!action) return false;
  switch (action.type) {
    case 'interact': return (step.type === 'openShelf' || step.type === 'talkToStaff' && step.choice === 'open')
      && step.stationId === action.station || step.type === 'checkout' && step.checkoutId === action.station;
    case 'add': return step.type === 'dragProduct' && step.productId === action.productId && step.quantity === (action.quantity ?? 1);
    case 'remove': return step.type === 'removeProduct' && step.productId === action.productId && step.quantity === (action.quantity ?? 1);
    case 'requestReturn': return step.type === 'talkToStaff' && step.choice === 'returnProduct'
      && step.productId === action.productId && step.quantity === (action.quantity ?? 1);
    case 'requestCashier': return step.type === 'talkToStaff' && step.choice === 'requestCashier'
      && (!action.checkoutId || step.checkoutId === action.checkoutId);
    case 'walkToAnchor': return step.type === 'walkToAnchor' && step.target?.anchorId === action.anchorId;
    case 'walkTo': return step.type === 'walkTo' && step.target?.stationId === action.station;
    case 'submit': return step.type === 'submitForReview';
    case 'browse': return step.type === 'browse' && step.scrollFraction === action.scrollFraction;
    case 'checkout': return step.type === 'checkout' && (!action.checkoutId || step.checkoutId === action.checkoutId);
    default: return step.type === action.type;
  }
}
/** Audit indices count actor choices. Replay also contains start, inserted closes and system completion. */
function actorEvents(trace, audit = null) {
  const decisions = audit?.decisions;
  const hasActorActions = Array.isArray(decisions) && decisions.length > 0 && decisions.every(d => d.action);
  const systemStart = trace.generation?.systemCompletion?.firstStepId;
  const stop = systemStart ? trace.steps.findIndex(s => s.id === systemStart) : -1;
  const steps = stop < 0 ? trace.steps : trace.steps.slice(0, stop);
  if (!hasActorActions) return steps.filter(s => !['start', 'awaitReviewAccepted', 'leave', 'skipRating'].includes(s.type))
    .map((step, index) => ({ ...step, index, sourceStepIndex: steps.indexOf(step), stepIds: step.id ? [step.id] : [],
      interest: step.attentionTag === 'interest', attentionAvailable: step.attentionTag !== undefined,
      before: decisions?.find(d => d.decisionIndex === index)?.before }));
  let cursor = 0;
  return decisions.map((decision, index) => {
    // sequence is the count of replay steps already applied before this actor choice.
    // A generated closeStation can occur before the chosen step within this interval.
    const begin = Number.isInteger(decision.before?.sequence) ? decision.before.sequence : cursor;
    const nextSequence = decisions[index + 1]?.before?.sequence;
    const end = Number.isInteger(nextSequence) ? nextSequence : steps.length;
    let stepIndex = -1;
    for (let i = Math.max(cursor, begin); i < end; i++) if (matchesAction(steps[i], decision.action)) { stepIndex = i; break; }
    if (stepIndex < 0) throw new Error(`Actor decision ${decision.decisionIndex ?? index} has no matching replay step`);
    cursor = stepIndex + 1;
    const step = steps[stepIndex];
    return { ...step, reason: decision.reason ?? step.reason, currentTask: decision.currentTask ?? decision.actorState?.task,
      reactionDelayMs: decision.delayMs ?? step.reactionDelayMs, index,
      decisionIndex: decision.decisionIndex ?? index, sourceStepIndex: stepIndex, stepIds: [step.id], action: decision.action,
      before: decision.before, actorState: decision.actorState, basis: decision.basis,
      interest: decision.actorState?.activity === 'interest' || decision.basis?.intent === 'interest',
      attentionAvailable: Boolean(decision.actorState?.activity || decision.basis?.intent),
    };
  });
}
const selectedEvent = event => event.type === 'dragProduct' && event.gesture?.outcome === 'drop';
const returnEvent = event => event.type === 'removeProduct' || event.type === 'talkToStaff' && event.choice === 'returnProduct';
function feedbackOf(event) {
  const before = event?.before;
  return before?.lastActionError || before?.feedback || before?.error
    || (before?.result?.accepted === false ? before.result.message || 'rejected-action' : null);
}
function extract(trace, snapshot, persona, audit = null) {
  const events = actorEvents(trace, audit), goals = validationGoals(snapshot), selected = events.filter(selectedEvent);
  const firstShelf = events.findIndex(s => s.type === 'openShelf');
  const checkout = events.findIndex(s => s.type === 'checkout' || s.type === 'submitForReview');
  const interest = events.filter(s => s.interest), results = {};
  function put(kind, numerator, denominator, evidence = []) {
    results[kind] = { status: denominator ? 'measured' : 'unexercised', numerator, denominator,
      value: denominator ? numerator / denominator : null, evidence: evidence.flatMap(s => s.stepIds),
      decisionIndexes: evidence.map(s => s.decisionIndex).filter(Number.isInteger) };
  }
  let post = 0;
  for (const event of selected) {
    const next = selected.find(s => s.index > event.index)?.index ?? (checkout < 0 ? events.length : checkout);
    if (events.slice(event.index + 1, next).some(s => s.type === 'readList')) post++;
  }
  put('postSelectionListRate', post, selected.length, selected);
  put('firstShelfOrientationCount', firstShelf < 0 ? 0 : events.slice(0, firstShelf).filter(s => ['lookAround', 'viewHelp', 'pause'].includes(s.type)).length,
    firstShelf < 0 ? 0 : 1, firstShelf < 0 ? [] : [events[firstShelf]]);
  const curryGoal = goals.some(g => isGoalProduct('curry', g));
  const curryVisible = events.some(s => s.before?.products?.some(p => p.id === 'curry')
    || s.cueRefs?.some(c => c === 'product:curry'));
  const detours = events.filter(s => s.type === 'openShelf' && s.stationId === 'meal' && s.interest);
  put('curryDetourRate', detours.length, curryVisible && !curryGoal && events.some(s => s.attentionAvailable) ? 1 : 0, detours);
  let recovered = 0;
  const lengths = [];
  for (let i = 0; i < events.length; i++) {
    if (!events[i].interest) continue;
    const start = i;
    while (i + 1 < events.length && events[i + 1].interest) i++;
    lengths.push(i - start + 1);
    const nextInterest = events.findIndex((s, j) => j > i && s.interest);
    const tail = events.slice(i + 1, nextInterest < 0 ? events.length : nextInterest);
    if (tail.some((s, j) => ['readList', 'viewCart'].includes(s.type) && tail.slice(j + 1).some(t =>
      (t.type === 'openShelf' || selectedEvent(t)) && (t.basis ? Boolean(t.basis.goalId) : true)))) recovered++;
  }
  put('interestRecoveryRate', recovered, lengths.length, interest);
  put('interestRunLength', lengths.reduce((a, b) => a + b, 0), lengths.length, interest);
  results.curryDetourRate.meanRunLength = results.interestRunLength.value;
  const seen = new Set(), newShelves = events.filter(s => {
    if (s.type !== 'openShelf' || seen.has(s.stationId)) return false;
    seen.add(s.stationId); return true;
  });
  put('newShelfDelayMs', newShelves.reduce((n, s) => n + s.reactionDelayMs, 0), newShelves.length, newShelves);
  const comparisons = selected.filter(s => {
    const prior = events.slice(Math.max(0, s.index - 5), s.index);
    const lastEntry = prior.findLastIndex(t => t.type === 'openShelf' || t.type === 'closeStation' || selectedEvent(t));
    return prior.slice(lastEntry + 1).some(t => t.type === 'browse' || comparisonReasons.some(r => starts(t, r)));
  });
  put('comparisonRate', comparisons.length, selected.length, selected);
  const feedback = events.filter(feedbackOf);
  const corrections = feedback.filter(s => {
    const nextFeedback = events.findIndex((t, i) => i > s.index && feedbackOf(t));
    return events.slice(s.index, nextFeedback < 0 ? events.length : nextFeedback)
      .some(t => returnEvent(t) || ['readList', 'viewCart'].includes(t.type));
  });
  put('correctionRate', corrections.length, feedback.length, feedback);
  put('independentSelectionRate', selected.filter(s => !events.slice(Math.max(0, s.index - 2), s.index)
    .some(t => t.type === 'viewHelp' || t.type === 'talkToStaff')).length, selected.length, selected);
  const familiar = new Set(persona.character?.familiarProductIds ?? []);
  const familiarSelections = selected.filter(s => familiar.has(s.productId));
  put('familiarSelectionDelayMs', familiarSelections.reduce((n, s) => n + s.reactionDelayMs, 0), familiarSelections.length, familiarSelections);
  const basket = new Map();
  for (const event of events) {
    if (selectedEvent(event)) basket.set(event.productId, (basket.get(event.productId) ?? 0) + event.quantity);
    if (returnEvent(event)) basket.set(event.productId, (basket.get(event.productId) ?? 0) - event.quantity);
  }
  // A wrong exact variant still exercises the goal. Unattempted goals remain unexercised.
  const exercised = goals.filter(goal => selected.some(s => s.basis?.goalId === goal.id || isGoalProduct(s.productId, goal)
    || !s.basis && sameFamily(s.productId, goal)));
  const mismatch = exercised.filter(goal => {
    const quantity = [...basket].reduce((sum, [id, n]) => sum + (isGoalProduct(id, goal) ? n : 0), 0);
    const wrongVariantRemaining = [...basket].some(([id, n]) => n > 0 && sameFamily(id, goal) && !isGoalProduct(id, goal));
    return quantity !== goal.quantity || wrongVariantRemaining;
  });
  put('highLoadMismatchRate', mismatch.length, exercised.length, selected);
  put('preCheckoutCartRate', checkout < 0 ? 0 : Number(events.slice(selected.at(-1)?.index ?? 0, checkout).some(s => s.type === 'viewCart')),
    checkout < 0 ? 0 : 1, checkout < 0 ? [] : [events[checkout]]);
  return results;
}
module.exports = { legacyCounts, extract, actorEvents, validationGoals, isGoalProduct, selectedEvent, returnEvent, feedbackOf };
