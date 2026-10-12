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
function validationGoals(snapshot = {}) {
  return (snapshot.config?.objectives ?? snapshot.mission?.objectives ?? []).map((goal, index) => ({
    ...goal, id: goal.id ?? `objective-${index + 1}`, match: goal.match ?? snapshot.config?.difficulty ?? 'exact',
    familyId: goal.familyId ?? getMarketProduct(goal.productId)?.familyId ?? goal.productId,
  }));
}
function isGoalProduct(id, goal) {
  if (!id) return false;
  if (Array.isArray(goal.acceptedProductIds)) return goal.acceptedProductIds.includes(id);
  try { return matchesObjective(id, goal); } catch { return false; }
}
function sameFamily(id, goal) {
  const product = getMarketProduct(id);
  return Boolean(product && (product.familyId ?? product.id) === goal.familyId);
}
function matchesAction(step, action) {
  if (!step || !action) return false;
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
function decisionRows(value) {
  const rows = Array.isArray(value) ? value : value?.decisions ?? value?.entries ?? value?.checkpoints ?? [];
  return rows.filter(row => !row.kind || row.kind === 'decision').map((row, index) => ({
    ...row, ...(row.decision ?? {}), decisionIndex: row.decisionIndex ?? index,
  }));
}
/** Audit indices count actor choices; replay also contains start, automatic closes and system completion. */
function actorEvents(trace, audit = null, evidence = {}) {
  const secondary = decisionRows(evidence.actorDecisions);
  const primary = decisionRows(audit);
  const decisions = (primary.length ? primary : secondary).map((row, index) => ({ ...secondary[index], ...row }));
  const hasActorActions = decisions.length > 0 && decisions.every(d => d.action);
  const systemStart = trace.generation?.systemCompletion?.firstStepId;
  const stop = systemStart ? trace.steps.findIndex(s => s.id === systemStart) : -1;
  const steps = stop < 0 ? trace.steps : trace.steps.slice(0, stop);
  if (!hasActorActions) return steps.filter(s => !['start', 'awaitReviewAccepted', 'leave', 'skipRating'].includes(s.type))
    .map((step, index) => {
      const row = decisions.find(d => d.decisionIndex === index);
      return { ...step, index, sourceStepIndex: steps.indexOf(step), stepIds: step.id ? [step.id] : [],
        interest: step.attentionTag === 'interest', attentionAvailable: step.attentionTag !== undefined,
        before: row?.before, after: row?.after, currentTask: row?.currentTask ?? step.currentTask };
    });
  let cursor = 0;
  return decisions.map((decision, index) => {
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
      before: decision.before, after: decision.after, actorState: decision.actorState, basis: decision.basis,
      knowledge: decision.knowledge, cognition: decision.cognition, taskMemory: decision.taskMemory,
      interest: decision.actorState?.activity === 'interest' || decision.basis?.intent === 'interest' || step.attentionTag === 'interest',
      attentionAvailable: Boolean(decision.actorState?.activity || decision.basis?.intent || step.attentionTag),
    };
  });
}
const selectedEvent = event => event.type === 'dragProduct' && event.gesture?.outcome === 'drop';
const returnEvent = event => event.type === 'removeProduct' || event.type === 'talkToStaff' && event.choice === 'returnProduct';
const helpEvent = event => event.type === 'viewHelp' || event.type === 'talkToStaff' && event.choice !== 'returnProduct';
function independentChoice(event, events) {
  const previous = events.slice(0, event.index).findLast(s => !['closeView', 'closeStation'].includes(s.type));
  return !previous || !helpEvent(previous);
}
function feedbackOf(event) {
  const before = event?.before;
  return before?.lastActionError || before?.feedback || before?.error
    || (before?.result?.accepted === false ? before.result.message || 'rejected-action' : null);
}
function applyCart(cart, event) {
  if (selectedEvent(event)) cart[event.productId] = (cart[event.productId] ?? 0) + (event.quantity ?? 1);
  if (returnEvent(event)) cart[event.productId] = Math.max(0, (cart[event.productId] ?? 0) - (event.quantity ?? 1));
  return cart;
}
function basketAt(events, end = events.length) {
  return events.slice(0, end).reduce(applyCart, {});
}
// An explicitly declared personal-interest purchase does not establish a task error,
// even when it happens to be another unit of the same product as a shopping goal.
function applyTaskCarts(task, interest, event) {
  if (selectedEvent(event)) applyCart(event.interest ? interest : task, event);
  if (returnEvent(event)) {
    const first = event.interest ? interest : task, second = event.interest ? task : interest;
    const quantity = event.quantity ?? 1, fromFirst = Math.min(first[event.productId] ?? 0, quantity);
    first[event.productId] = Math.max(0, (first[event.productId] ?? 0) - fromFirst);
    second[event.productId] = Math.max(0, (second[event.productId] ?? 0) - (quantity - fromFirst));
  }
}
function taskBasketsAt(events, end = events.length) {
  const task = {}, interest = {};
  for (const event of events.slice(0, end)) applyTaskCarts(task, interest, event);
  return { task, interest };
}
function taskBasketAt(events, end = events.length) { return taskBasketsAt(events, end).task; }
function goalError(cart, goal) {
  const quantity = Object.entries(cart).reduce((n, [id, q]) => n + (isGoalProduct(id, goal) ? q : 0), 0);
  const wrong = Object.entries(cart).reduce((n, [id, q]) => n + (sameFamily(id, goal) && !isGoalProduct(id, goal) ? q : 0), 0);
  return Math.abs(quantity - goal.quantity) + wrong;
}
function eventGoal(event, goals) {
  if (event.interest) return undefined;
  if (event.basis?.goalId) return goals.find(g => g.id === event.basis.goalId);
  return goals.find(g => isGoalProduct(event.productId, g) || sameFamily(event.productId, g));
}
function interestRuns(events) {
  const runs = [];
  for (let i = 0; i < events.length; i++) if (events[i].interest) {
    const start = i;
    while (i + 1 < events.length && events[i + 1].interest) i++;
    runs.push({ start, end: i, events: events.slice(start, i + 1) });
  }
  return runs;
}
/** Count completed selection episodes, not each unit of an intentional multi-drag purchase. */
function selectionErrors(events, goals) {
  const errors = [], pending = new Map(), cart = {}, interestCart = {};
  const flush = () => {
    for (const [goal, evidence] of pending) if (goalError(cart, goal) > 0) errors.push({ goalId: goal.id, events: evidence });
    pending.clear();
  };
  for (const event of events) {
    if (['closeStation', 'openShelf', 'readList', 'viewCart', 'checkout', 'submitForReview', 'giveUp'].includes(event.type)) flush();
    if (event.type === 'dragProduct' && event.gesture?.outcome !== 'drop') errors.push({ goalId: null, events: [event] });
    if (selectedEvent(event) && !event.interest) {
      const goal = eventGoal(event, goals);
      if (goal) {
        if (pending.size && !pending.has(goal)) flush();
        pending.set(goal, [...(pending.get(goal) ?? []), event]);
      }
    }
    applyTaskCarts(cart, interestCart, event);
  }
  flush();
  return errors;
}
/** Displayed cart/list discrepancies are opportunities; a later check alone is never a correction. */
function correctionOpportunities(events, goals) {
  const opportunities = [], active = new Map();
  let lastFeedbackKey = null;
  for (const event of events) {
    const prior = events.slice(0, event.index), attempted = goals.filter(g => prior.some(s => selectedEvent(s) && eventGoal(s, goals) === g));
    const known = new Set([...(event.before?.readObjectives ?? []).map(g => g.id),
      ...(event.knowledge?.cues ?? []).filter(c => c.kind === 'read-objective').map(c => c.value?.id)]);
    if (prior.some(s => s.type === 'readList')) goals.forEach(g => known.add(g.id));
    const interestCart = taskBasketsAt(events, event.index).interest;
    const cart = event.before?.cart && Object.fromEntries(Object.entries(event.before.cart)
      .map(([id, quantity]) => [id, Math.max(0, quantity - (interestCart[id] ?? 0))]));
    if (cart) for (const goal of attempted.filter(g => known.has(g.id))) {
      const amount = goalError(cart, goal);
      if (!amount) { active.delete(goal.id); continue; }
      // A persistent unchanged display is one opportunity, not another denominator on every pause.
      const signature = JSON.stringify([goal.id, cart]);
      if (active.get(goal.id) === signature) continue;
      active.set(goal.id, signature);
      opportunities.push({ event, goal, cart: { ...cart }, amount, kind: 'observed-mismatch' });
    }
    const feedback = feedbackOf(event);
    if (feedback) {
      const failed = prior.findLast(s => s.type === 'dragProduct' || returnEvent(s));
      const key = JSON.stringify([feedback, failed?.id]);
      if (key !== lastFeedbackKey) {
        const goal = failed && eventGoal(failed, goals);
        // Do not count the same displayed mismatch and feedback twice.
        if (!opportunities.some(o => o.event === event && o.goal === goal)) opportunities.push({ event, goal,
          cart: taskBasketAt(events, event.index), amount: goal ? goalError(taskBasketAt(events, event.index), goal) : null,
          kind: 'feedback', failed });
        lastFeedbackKey = key;
      }
    } else lastFeedbackKey = null;
  }
  for (const opportunity of opportunities) {
    const next = opportunities.find(o => o.event.index > opportunity.event.index && o.goal === opportunity.goal);
    const tail = events.slice(opportunity.event.index, next?.event.index ?? events.length), cart = { ...opportunity.cart };
    const interestCart = taskBasketsAt(events, opportunity.event.index).interest;
    opportunity.correctedBy = null;
    for (const event of tail) {
      const beforeError = opportunity.goal ? goalError(cart, opportunity.goal) : null;
      applyTaskCarts(cart, interestCart, event);
      if (!selectedEvent(event) && !returnEvent(event)) continue;
      if (opportunity.goal && goalError(cart, opportunity.goal) < beforeError) { opportunity.correctedBy = event; break; }
      // Technical rejected selections need an actually accepted changed choice, not a retry of the identical error.
      const nextEvent = events[event.index + 1];
      const after = event.after ?? nextEvent?.before;
      if (opportunity.kind === 'feedback' && after?.result?.accepted === true && opportunity.failed
        && (event.productId !== opportunity.failed.productId || event.quantity !== opportunity.failed.quantity || returnEvent(event))) {
        opportunity.correctedBy = event; break;
      }
    }
  }
  return opportunities;
}
function extract(trace, snapshot, persona, audit = null, evidence = {}) {
  const events = actorEvents(trace, audit, evidence), goals = validationGoals(snapshot), selected = events.filter(selectedEvent);
  const firstShelf = events.findIndex(s => s.type === 'openShelf');
  const checkout = events.findIndex(s => s.type === 'checkout' || s.type === 'submitForReview');
  const runs = interestRuns(events), results = {};
  function put(kind, numerator, denominator, evidenceEvents = []) {
    const unique = [...new Set(evidenceEvents)];
    const decisionIndexes = unique.map(s => s.decisionIndex).filter(Number.isInteger);
    results[kind] = { status: denominator ? 'measured' : 'unexercised', numerator, denominator,
      value: denominator ? numerator / denominator : null, evidence: [...new Set(unique.flatMap(s => s.stepIds))], decisionIndexes,
      reviewFindings: (evidence.personaReview?.findings ?? []).filter(f => f.decisionIndexes?.some(i => decisionIndexes.includes(i))),
    };
  }
  const postOpportunities = [], postChecks = [];
  for (const event of selected) {
    const goal = eventGoal(event, goals);
    if (!goal) continue;
    const next = events.find(s => s.index > event.index && (s.basis?.goalId && s.basis.goalId !== goal.id
      || selectedEvent(s) && eventGoal(s, goals) && eventGoal(s, goals).id !== goal.id));
    if (!next) continue; // Last selections have no next-goal opportunity.
    const check = events.slice(event.index + 1, next.index).find(s => s.type === 'readList');
    postOpportunities.push(event, next); if (check) postChecks.push(check);
  }
  put('postSelectionListRate', postChecks.length, postOpportunities.length / 2, [...postOpportunities, ...postChecks]);
  const orientation = firstShelf < 0 ? [] : events.slice(0, firstShelf).filter(s => ['lookAround', 'viewHelp'].includes(s.type)
    || helpEvent(s) || ['walkTo', 'walkToAnchor'].includes(s.type) && ['explore', 'orient'].includes(s.basis?.intent ?? s.attentionTag));
  put('firstShelfOrientationCount', orientation.length, firstShelf < 0 || trace.experienceMode === 'revisit' ? 0 : 1,
    firstShelf < 0 ? [] : [...orientation, events[firstShelf]]);
  const curryProducts = id => getMarketProduct(id)?.familyId === 'curry' || /curry/.test(id ?? '');
  const goalShelves = new Set(goals.map(g => getMarketProduct(g.productId)?.categoryId));
  const curryCues = events.filter(s => s.before?.products?.some(p => curryProducts(p.id))
    || s.before?.visibleStations?.some(station => /카레|curry/i.test(station.label ?? ''))
    || s.cueRefs?.some(c => c.startsWith('product:') && curryProducts(c.slice(8))));
  // One continuous visibility episode is one exposed opportunity, and only later entries count.
  const exposures = curryCues.filter((s, i) => i === 0 || curryCues[i - 1].index < s.index - 1);
  const eligibleExposures = !goalShelves.has('meal') ? exposures : [];
  const detours = eligibleExposures.map((cue, i) => events.slice(cue.index, eligibleExposures[i + 1]?.index ?? events.length)
    .find(s => s.type === 'openShelf' && s.stationId === 'meal' && s.interest)).filter(Boolean);
  put('curryDetourRate', detours.length, eligibleExposures.length, [...eligibleExposures, ...detours]);
  const recoveryRuns = runs.filter(run => goals.some(g => goalError(taskBasketAt(events, run.end + 1), g) > 0));
  const recoveries = [];
  for (const run of recoveryRuns) {
    const nextInterest = runs.find(other => other.start > run.end)?.start ?? events.length;
    const tail = events.slice(run.end + 1, nextInterest);
    const check = tail.find(s => ['readList', 'viewCart'].includes(s.type));
    const pending = new Set(goals.filter(g => goalError(taskBasketAt(events, run.end + 1), g) > 0).map(g => g.id));
    const goalAction = check && tail.find(s => s.index > check.index && (pending.has(s.basis?.goalId)
      || selectedEvent(s) && pending.has(eventGoal(s, goals)?.id)) && !['readList', 'viewCart', 'viewHelp'].includes(s.type));
    if (goalAction) recoveries.push(check, goalAction);
  }
  put('interestRecoveryRate', recoveries.length / 2, recoveryRuns.length, [...recoveryRuns.flatMap(r => r.events), ...recoveries]);
  put('interestRunLength', runs.reduce((n, r) => n + r.events.length, 0), runs.length, runs.flatMap(r => r.events));
  const detourRuns = runs.filter(run => detours.some(s => s.index >= run.start && s.index <= run.end));
  results.curryDetourRate.meanRunLength = detourRuns.length ? detourRuns.reduce((n, r) => n + r.events.length, 0) / detourRuns.length : null;
  const seen = new Set(), newShelves = events.filter(s => {
    if (s.type !== 'openShelf' || seen.has(s.stationId)) return false;
    seen.add(s.stationId);
    return trace.experienceMode !== 'revisit' && s.actorState?.orientation !== 'familiar';
  });
  put('newShelfDelayMs', newShelves.reduce((n, s) => n + s.reactionDelayMs, 0), newShelves.length, newShelves);
  const comparisonOpportunities = [], comparisons = [];
  for (const selection of selected) {
    const boundary = events.slice(0, selection.index).findLastIndex(s => ['openShelf', 'closeStation'].includes(s.type) || selectedEvent(s));
    const interval = events.slice(boundary + 1, selection.index + 1), goal = eventGoal(selection, goals);
    if (!goal) continue;
    const candidates = new Set(interval.flatMap(s => s.before?.products ?? []).filter(p => sameFamily(p.id, goal)).map(p => p.id));
    const pagesAvailable = interval.some(s => s.before?.shelf?.pageCount > 1);
    if (candidates.size < 2 && !pagesAvailable) continue;
    comparisonOpportunities.push(selection);
    const browse = interval.find(s => s.type === 'browse');
    // Inspecting one newly found page with only one candidate is search, not a demonstrated comparison.
    if (browse && candidates.size > 1) comparisons.push(browse);
  }
  put('comparisonRate', comparisons.length, comparisonOpportunities.length, [...comparisonOpportunities, ...comparisons]);
  const corrections = correctionOpportunities(events, goals);
  put('correctionRate', corrections.filter(o => o.correctedBy).length, corrections.length,
    corrections.flatMap(o => [o.event, ...(o.correctedBy ? [o.correctedBy] : [])]));
  put('independentSelectionRate', selected.filter(s => independentChoice(s, events)).length, selected.length, selected);
  const familiar = new Set(persona.character?.familiarProductIds ?? []);
  const familiarSelections = selected.filter(s => familiar.has(s.productId));
  put('familiarSelectionDelayMs', familiarSelections.reduce((n, s) => n + s.reactionDelayMs, 0), familiarSelections.length, familiarSelections);
  const basket = taskBasketAt(events), exercised = goals.filter(goal => selected.some(s => eventGoal(s, goals) === goal));
  put('highLoadMismatchRate', exercised.filter(goal => goalError(basket, goal) > 0).length, exercised.length, selected);
  const checkoutChecks = checkout < 0 ? [] : events.slice(selected.filter(s => s.index < checkout).at(-1)?.index ?? 0, checkout)
    .filter(s => s.type === 'viewCart');
  put('preCheckoutCartRate', Number(checkoutChecks.length > 0), checkout < 0 ? 0 : 1, checkout < 0 ? [] : [...checkoutChecks, events[checkout]]);
  return results;
}
/** Universal rules consume recorded opportunities, never a person's name or diagnosis. */
function extractUniversal(trace, snapshot, persona = {}, audit = null, evidence = {}) {
  const events = actorEvents(trace, audit, evidence), goals = validationGoals(snapshot);
  const legacy = extract(trace, snapshot, persona, audit, evidence), metrics = {};
  const observed = events.some(event => event.before || event.after);
  const uniqueEvents = rows => [...new Set(rows.filter(Boolean))];
  const eventEvidence = rows => [...new Set(uniqueEvents(rows).flatMap(event => event.stepIds ?? []))];
  function put(kind, numerator, denominator, rows, evidenceType, reason, extras = {}) {
    metrics[kind] = { status: denominator > 0 ? 'measured' : 'unexercised', numerator, denominator,
      value: denominator > 0 ? numerator / denominator : null, evidence: eventEvidence(rows),
      decisionIndexes: uniqueEvents(rows).map(row => row.decisionIndex).filter(Number.isInteger),
      evidenceType, ...(denominator ? {} : { reason }), ...extras };
  }
  for (const kind of ['postSelectionListRate', 'comparisonRate', 'preCheckoutCartRate']) {
    metrics[kind] = { ...legacy[kind], evidenceType: 'observed-action',
      ...(legacy[kind].denominator ? {} : { reason: kind === 'comparisonRate' && !observed
        ? 'missing-observation-evidence' : 'no-eligible-opportunity' }) };
  }
  // Missing authored timing must remain missing rather than turning into zero or NaN.
  const shelfIds = new Set(), firstShelves = events.filter(event => {
    if (event.type !== 'openShelf' || shelfIds.has(event.stationId)) return false;
    shelfIds.add(event.stationId);
    return trace.experienceMode !== 'revisit' && event.actorState?.orientation !== 'familiar';
  });
  const timedShelves = firstShelves.filter(event => Number.isFinite(event.reactionDelayMs) && event.reactionDelayMs >= 0);
  put('newShelfDelayMs', timedShelves.reduce((sum, event) => sum + event.reactionDelayMs, 0), timedShelves.length,
    timedShelves, 'authored-timing', firstShelves.length ? 'missing-authored-timing' : 'no-new-shelf-opportunity', {
      eligibleOpportunityCount: firstShelves.length, missingTimingCount: firstShelves.length - timedShelves.length,
      limitations: ['Actor-authored pre-action delay; not measured human reaction time or model latency.'],
    });

  const productSelectors = new Set(Object.entries(persona.attention?.interestProductWeights ?? {})
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0).map(([id]) => id));
  const categorySelectors = new Set(Object.entries(persona.attention?.interestCategoryWeights ?? {})
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0).map(([id]) => id));
  const interestProduct = id => {
    const product = getMarketProduct(id);
    return productSelectors.has(id) || productSelectors.has(product?.familyId) || categorySelectors.has(product?.categoryId);
  };
  const goalCategories = new Set(goals.map(goal => getMarketProduct(goal.productId)?.categoryId));
  const interestCategories = new Set([...categorySelectors, ...[...productSelectors].map(id => getMarketProduct(id)?.categoryId)].filter(Boolean));
  const isNonGoalInterest = id => interestProduct(id) && !goals.some(goal => isGoalProduct(id, goal));
  function exposedInterest(event) {
    return (event.before?.products ?? []).some(product => isNonGoalInterest(product.id))
      || (event.before?.visibleStations ?? []).some(station => interestCategories.has(station.id) && !goalCategories.has(station.id));
  }
  // Exposure must precede the detour. Opening a shelf cannot retroactively expose its products.
  const exposures = events.filter(exposedInterest).filter((event, index, rows) => index === 0 || rows[index - 1].index < event.index - 1);
  const detours = exposures.map((exposure, index) => events.slice(exposure.index, exposures[index + 1]?.index ?? events.length)
    .find(event => event.interest && (event.type === 'openShelf' && interestCategories.has(event.stationId) && !goalCategories.has(event.stationId)
      || selectedEvent(event) && isNonGoalInterest(event.productId)
      || event.type === 'browse' && (event.before?.products ?? []).some(product => isNonGoalInterest(product.id)))))
    .filter(Boolean);
  put('interestDetourRate', detours.length, exposures.length, [...exposures, ...detours],
    'observed-action+actor-declaration', !productSelectors.size && !categorySelectors.size ? 'no-profile-interest-selectors'
      : !observed ? 'missing-observation-evidence' : 'no-observed-non-goal-interest-cue', {
      selectors: { productOrFamilyIds: [...productSelectors], categoryIds: [...categorySelectors] },
      limitations: ['Interest motive comes from actor annotations; exposure and resulting actions come from recorded observations.'],
    });
  const runs = interestRuns(events), profileRuns = runs.filter(run => run.events.some(event =>
    interestProduct(event.productId) || interestCategories.has(event.stationId)
    || interestCategories.has(event.before?.activeStation) || (event.before?.products ?? []).some(product => interestProduct(product.id))));
  const recoveryRuns = profileRuns.filter(run => goals.some(goal => goalError(basketAt(events, run.end + 1), goal) > 0));
  const recoveries = recoveryRuns.map(run => {
    const pending = goals.filter(goal => goalError(basketAt(events, run.end + 1), goal) > 0);
    const nextRun = runs.find(other => other.start > run.end);
    return events.slice(run.end + 1, nextRun?.start ?? events.length).find(event => !event.interest
      && (selectedEvent(event) && pending.some(goal => eventGoal(event, goals) === goal)
        || !['readList', 'viewCart', 'viewHelp', 'pause', 'closeView', 'closeStation'].includes(event.type)
          && pending.some(goal => goal.id === event.basis?.goalId)));
  }).filter(Boolean);
  put('interestRecoveryRate', recoveries.length, recoveryRuns.length, [...recoveryRuns.flatMap(run => run.events), ...recoveries],
    'observed-action+actor-declaration', !productSelectors.size && !categorySelectors.size ? 'no-profile-interest-selectors'
      : 'no-profile-interest-episode-with-pending-goal', {
      interpretation: 'Descriptive recovery ability; spontaneous resumption also counts. Not a required increase over a control.',
    });

  const difficulties = difficultyOpportunities(events, goals);
  const responseEvents = [], helpEvents = [];
  const byEvidenceType = {};
  for (let index = 0; index < difficulties.length; index++) {
    const opportunity = difficulties[index], next = difficulties.find(item => item.event.index > opportunity.event.index);
    const tail = events.slice(opportunity.event.index, next?.event.index ?? events.length);
    const notRejected = event => (event.after ?? events[event.index + 1]?.before)?.result?.accepted !== false;
    const help = tail.find(event => notRejected(event)
      && (event.type === 'viewHelp' || event.type === 'talkToStaff' && event.choice === 'open'));
    const response = tail.find(event => {
      if (!notRejected(event)) return false;
      if (['readList', 'viewCart', 'lookAround', 'viewHelp'].includes(event.type)
        || event.type === 'talkToStaff' && event.choice === 'open') return true;
      if (!selectedEvent(event) && !returnEvent(event) && !['walkTo', 'walkToAnchor', 'openShelf', 'browse'].includes(event.type)) return false;
      const after = event.after ?? events[event.index + 1]?.before;
      if (after?.result?.accepted !== true || after?.lastActionError) return false;
      if (opportunity.failed && sameChoice(event, opportunity.failed)) return false;
      if (opportunity.goal && (selectedEvent(event) || returnEvent(event))) {
        const beforeCart = taskBasketAt(events, event.index), afterCart = taskBasketAt(events, event.index + 1);
        return goalError(afterCart, opportunity.goal) < goalError(beforeCart, opportunity.goal);
      }
      return Boolean(opportunity.failed) || selectedEvent(event) && Boolean(eventGoal(event, goals));
    });
    if (help) helpEvents.push(help);
    if (response) responseEvents.push(response);
    const category = byEvidenceType[opportunity.evidenceType] ??= { opportunities: 0, responses: 0, helpUses: 0 };
    category.opportunities++; category.responses += Number(Boolean(response)); category.helpUses += Number(Boolean(help));
  }
  const difficultyEvidenceType = difficulties.some(item => item.evidenceType === 'actor-declaration')
    ? 'observed-action+actor-declaration' : 'observed-action';
  const difficultyReason = observed ? 'no-recorded-difficulty-opportunity' : 'missing-observation-evidence';
  put('persistenceResponseRate', responseEvents.length, difficulties.length,
    [...difficulties.map(item => item.event), ...responseEvents], difficultyEvidenceType, difficultyReason, {
      byEvidenceType, interpretation: 'Response or strategy change after difficulty, not accuracy or a quota of deliberate errors.',
      limitations: ['Checking or requesting help is a response, not proof of correction; repeating an unchanged rejected action does not count.'],
    });
  put('helpSeekingRate', helpEvents.length, difficulties.length, [...difficulties.map(item => item.event), ...helpEvents],
    difficultyEvidenceType, difficultyReason, { byEvidenceType,
      limitations: ['Uncertain goal declarations are labeled separately from observed error feedback. Routine cashier requests are not help.'],
    });

  const cart = basketAt(events), attempts = events.filter(event => event.type === 'dragProduct');
  const goalOutcomes = goals.map(goal => {
    // Full task accounting includes a relevant physical selection even when its
    // stated motive is personal interest. Intent-only rates remain separate.
    const goalAttempts = attempts.filter(event => eventGoal(event, goals) === goal
      || isGoalProduct(event.productId, goal) || sameFamily(event.productId, goal));
    const quantity = Object.entries(cart).reduce((sum, [id, count]) => sum + (isGoalProduct(id, goal) ? count : 0), 0);
    return { goalId: goal.id, productId: goal.productId, requiredQuantity: goal.quantity, actualQuantity: quantity,
      attempted: goalAttempts.length > 0, completed: goalError(cart, goal) === 0,
      missingQuantity: Math.max(0, goal.quantity - quantity), evidence: eventEvidence(goalAttempts) };
  });
  const completedGoalCount = goalOutcomes.filter(goal => goal.completed).length;
  const attemptedGoalCount = goalOutcomes.filter(goal => goal.attempted).length;
  const terminal = events.findLast(event => ['submitForReview', 'giveUp'].includes(event.type));
  const nonGoalPurchases = Object.entries(cart).filter(([id, quantity]) => quantity > 0 && !goals.some(goal => isGoalProduct(id, goal)))
    .map(([productId, quantity]) => ({ productId, quantity, evidence: eventEvidence(events.filter(event => event.productId === productId)) }));
  const outcome = { goalCount: goals.length, attemptedGoalCount, completedGoalCount,
    missingGoalCount: goals.length - completedGoalCount, unattemptedGoalCount: goals.length - attemptedGoalCount,
    completionRate: goals.length ? completedGoalCount / goals.length : null,
    allGoalsCompleted: goals.length ? completedGoalCount === goals.length : null,
    goals: goalOutcomes, basket: cart, nonGoalPurchases,
    ending: terminal?.type === 'submitForReview' ? 'submit' : terminal?.type === 'giveUp' ? 'giveUp' : 'incomplete',
    actorCompleted: terminal?.type === 'submitForReview', actorDecisionCount: events.length,
    systemCompletion: { present: Boolean(trace.generation?.systemCompletion?.firstStepId),
      firstStepId: trace.generation?.systemCompletion?.firstStepId ?? null },
    evidence: eventEvidence([...attempts, terminal]), evidenceType: 'observed-action',
    limitations: ['Task outcome uses the actor basket including personal-interest purchases; system completion is excluded.'],
  };
  const priorDifficulties = difficulties.filter(item => !terminal || item.event.index <= terminal.index);
  const observedDifficulties = priorDifficulties.filter(item => item.evidenceType !== 'actor-declaration');
  const signals = [];
  if (outcome.ending === 'giveUp' && outcome.missingGoalCount > 0 && !observedDifficulties.length) signals.push({
    code: 'early-give-up-without-observed-difficulty', severity: 'review',
    evidence: eventEvidence([terminal]), declaredUncertaintyCount: priorDifficulties.length,
    explanation: 'Goals remain but no recorded feedback or displayed mismatch supports the stop. This is a review signal, not a personality failure.',
  });
  const coverage = Object.fromEntries(Object.entries(metrics).map(([kind, metric]) => [kind, {
    status: metric.status, opportunityCount: metric.denominator, evidenceType: metric.evidenceType,
    reason: metric.reason ?? null, ...(metric.byEvidenceType ? { byEvidenceType: metric.byEvidenceType } : {}),
  }]));
  return { metrics, outcome, coverage, terminationReview: { status: signals.length ? 'review' : 'clear', signals,
    observedDifficultyCount: observedDifficulties.length, declaredUncertaintyCount: priorDifficulties.length - observedDifficulties.length,
    evidence: eventEvidence(priorDifficulties.map(item => item.event)),
    limitation: 'Recorded context cannot establish every reason a person may stop.' } };
}
function sameChoice(left, right) {
  const choice = event => [event.type, event.productId, event.quantity ?? 1, event.stationId,
    event.target?.anchorId, event.target?.stationId, event.scrollFraction, event.choice];
  return JSON.stringify(choice(left)) === JSON.stringify(choice(right));
}
/** Contiguous, unchanged uncertainty is one episode; no difficulty is inferred from latency. */
function difficultyOpportunities(events, goals) {
  const opportunities = correctionOpportunities(events, goals).map(item => item.kind === 'feedback'
    ? { ...item, failed: events[item.event.index - 1], goal: eventGoal(events[item.event.index - 1] ?? {}, goals), evidenceType: 'observed-feedback' }
    : { ...item, evidenceType: 'observed-mismatch' });
  let lastFeedback = null, lastUncertainty = null;
  for (const event of events) {
    const feedback = feedbackOf(event);
    const failed = events[event.index - 1];
    if (feedback) {
      const key = JSON.stringify([feedback, failed?.id]);
      if (key !== lastFeedback && !opportunities.some(item => item.event === event && item.kind === 'feedback')) {
        opportunities.push({ event, failed, kind: 'feedback', evidenceType: 'observed-feedback' });
      }
      lastFeedback = key;
    } else lastFeedback = null;
    const uncertain = [...new Set(event.actorState?.uncertainGoalIds ?? event.taskMemory?.uncertainGoalIds ?? [])].sort();
    const signature = uncertain.length ? JSON.stringify(uncertain) : null;
    if (signature && signature !== lastUncertainty && !opportunities.some(item => item.event === event)) {
      opportunities.push({ event, goalIds: uncertain, kind: 'uncertainty', evidenceType: 'actor-declaration' });
    }
    lastUncertainty = signature;
  }
  return opportunities.sort((left, right) => left.event.index - right.event.index);
}
module.exports = { legacyCounts, extract, extractUniversal, actorEvents, validationGoals, isGoalProduct, selectedEvent, returnEvent, feedbackOf,
  independentChoice, basketAt, taskBasketAt, goalError, eventGoal, interestRuns, selectionErrors, correctionOpportunities, difficultyOpportunities };
