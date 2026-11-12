'use strict';
const { getMarketProduct } = require('../../../frontend/src/game/scenarios.ts');
const { actorEvents, validationGoals, isGoalProduct, selectedEvent, returnEvent, eventGoal,
  taskBasketAt, goalError, difficultyOpportunities } = require('./personaValidationMetrics.cjs');

const evidenceIds = events => [...new Set(events.filter(Boolean).flatMap(event => event.stepIds ?? []))];
function quantile(sorted, probability) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability, lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  const mean = n ? sorted.reduce((sum, value) => sum + value, 0) / n : null;
  const standardDeviation = n > 1 ? Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : null;
  const upper = n ? sorted.slice(-Math.ceil(n * .1)) : [];
  return { status: n ? 'measured' : 'unexercised', n, median: quantile(sorted, .5),
    q1: quantile(sorted, .25), q3: quantile(sorted, .75), iqr: n ? quantile(sorted, .75) - quantile(sorted, .25) : null,
    mean, standardDeviation, coefficientOfVariation: mean > 0 && standardDeviation !== null ? standardDeviation / mean : null,
    upperTenPercent: n ? { p90: quantile(sorted, .9), n: upper.length,
      mean: upper.reduce((sum, value) => sum + value, 0) / upper.length, maximum: sorted.at(-1) } : null };
}
function transitionsFromBigrams(bigrams) {
  const n = bigrams.reduce((sum, row) => sum + row.count, 0), types = [...new Set(bigrams.flatMap(row => [row.from, row.to]))].sort();
  const counts = Object.fromEntries(types.map(from => [from, Object.fromEntries(types.map(to => [to, 0]))]));
  for (const row of bigrams) counts[row.from][row.to] += row.count;
  const probabilities = Object.fromEntries(types.map(from => {
    const total = Object.values(counts[from]).reduce((sum, count) => sum + count, 0);
    return [from, Object.fromEntries(types.map(to => [to, total ? counts[from][to] / total : null]))];
  }));
  let entropy = 0;
  for (const from of types) {
    const total = Object.values(counts[from]).reduce((sum, count) => sum + count, 0);
    if (!total) continue;
    entropy += total / n * Object.values(probabilities[from]).reduce((sum, probability) => sum - (probability ? probability * Math.log2(probability) : 0), 0);
  }
  return { status: n ? 'measured' : 'unexercised', n, counts: n ? counts : null,
    probabilities: n ? probabilities : null, entropyBits: n ? entropy : null,
    entropyDefinition: 'Empirical conditional entropy H(next action type | current action type), weighted by observed outgoing transitions; no cross-trace transitions.',
    bigrams: bigrams.map(row => ({ ...row, frequency: n ? row.count / n : null })) };
}
function actionTransitions(events) {
  const byKey = new Map();
  for (let index = 1; index < events.length; index++) {
    const previous = events[index - 1], current = events[index], key = JSON.stringify([previous.type, current.type]);
    const row = byKey.get(key) ?? { from: previous.type, to: current.type, count: 0, evidence: [] };
    row.count++; row.evidence.push({ stepIds: evidenceIds([previous, current]) }); byKey.set(key, row);
  }
  return transitionsFromBigrams([...byKey.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)));
}
function quantityFor(cart, goal) {
  return Object.entries(cart).reduce((sum, [id, quantity]) => sum + (isGoalProduct(id, goal) ? quantity : 0), 0);
}
function errorTaxonomy(events, goals) {
  const selections = events.filter(event => selectedEvent(event) && !event.interest), errors = [];
  const opportunities = { similarProductConfusion: 0, specificationMismatch: 0, quantityOmission: 0, quantityExcess: 0, nonTargetPurchase: selections.length };
  for (const event of selections) {
    const goal = eventGoal(event, goals), product = getMarketProduct(event.productId), target = goal && getMarketProduct(goal.productId);
    if (goal) {
      opportunities.similarProductConfusion++;
      if (goal.match !== 'family') opportunities.specificationMismatch++;
    }
    if (goals.some(item => isGoalProduct(event.productId, item)) && (!goal || isGoalProduct(event.productId, goal))) continue;
    const kind = goal && product && (product.familyId ?? product.id) === goal.familyId ? 'specificationMismatch'
      : goal && product && target && product.categoryId === target.categoryId ? 'similarProductConfusion' : 'nonTargetPurchase';
    errors.push({ kind, productId: event.productId, goalId: goal?.id ?? null, stepIds: evidenceIds([event]),
      evidenceType: 'observed-action', interpretation: kind === 'similarProductConfusion'
        ? 'Selected a different product in the linked target category; this records a mismatch, not a proven perceptual or cognitive cause.' : undefined });
  }
  // Quantity is evaluated at a selection-episode boundary, so two one-unit
  // drags for a two-unit objective are not mistaken for an omission.
  const pending = new Map();
  const flush = (end, boundary = null) => {
    for (const [goal, selectionsInEpisode] of pending) {
      const actualQuantity = quantityFor(taskBasketAt(events, end), goal);
      opportunities.quantityOmission++; opportunities.quantityExcess++;
      if (actualQuantity === goal.quantity) continue;
      errors.push({ kind: actualQuantity < goal.quantity ? 'quantityOmission' : 'quantityExcess', goalId: goal.id,
        requiredQuantity: goal.quantity, actualQuantity, stepIds: evidenceIds([...selectionsInEpisode, boundary]),
        evidenceType: 'observed-action', boundary: boundary?.type ?? 'end-of-recorded-trace' });
    }
    pending.clear();
  };
  for (const event of events) {
    if (['closeStation', 'openShelf', 'readList', 'viewCart', 'checkout', 'submitForReview', 'giveUp'].includes(event.type)) flush(event.index, event);
    if (selectedEvent(event) && !event.interest) {
      const goal = eventGoal(event, goals);
      if (goal && isGoalProduct(event.productId, goal)) {
        if (pending.size && !pending.has(goal)) flush(event.index, event);
        pending.set(goal, [...(pending.get(goal) ?? []), event]);
      }
    }
  }
  flush(events.length);
  return { status: goals.length && selections.length ? 'measured' : 'unexercised',
    counts: Object.fromEntries(Object.entries(opportunities).map(([kind, n]) => [kind, {
      status: goals.length && n ? 'measured' : 'unexercised', opportunityCount: goals.length ? n : 0,
      count: goals.length && n ? errors.filter(error => error.kind === kind).length : null,
    }])), errors: goals.length ? errors : [],
    limitations: ['Personal-interest purchases are excluded, including extra units of a target product.',
      'Only attempted selection episodes establish quantity errors. Unattempted goals are task outcomes, not inferred selection mistakes.',
      'One selection episode may have a product mismatch and a quantity mismatch; categories are descriptive and are not severity weights.',
      'No error quota is required; more errors do not imply greater fidelity to a person or disability.'] };
}
function resultAfter(event, events) { return event.after ?? events[event.index + 1]?.before; }
function rejected(event, events) {
  const after = resultAfter(event, events);
  return Boolean(after?.lastActionError || after?.result?.accepted === false);
}
function sameSelection(left, right) {
  return left && right && left.type === right.type && left.productId === right.productId && (left.quantity ?? 1) === (right.quantity ?? 1)
    && left.gesture?.outcome === right.gesture?.outcome;
}
function recoveryAndRepetition(events, goals) {
  const opportunities = difficultyOpportunities(events, goals).filter(opportunity => opportunity.evidenceType !== 'actor-declaration');
  const recoveries = [], repeats = new Map();
  let repeatOpportunities = 0;
  for (const opportunity of opportunities) {
    const beginning = opportunity.event.index;
    const failed = opportunity.failed ?? events.slice(0, beginning).findLast(event => selectedEvent(event)
      && !event.interest && (!opportunity.goal || eventGoal(event, goals) === opportunity.goal));
    let recovery = null, improvement = null;
    for (const event of events.slice(beginning)) {
      if (event.interest || rejected(event, events) || !selectedEvent(event) && !returnEvent(event)) continue;
      if (opportunity.goal) {
        const before = goalError(taskBasketAt(events, event.index), opportunity.goal), after = goalError(taskBasketAt(events, event.index + 1), opportunity.goal);
        if (!improvement && after < before) improvement = event;
        if (after === 0 && before > 0) { recovery = event; break; }
      } else if (failed && !sameSelection(event, failed) && resultAfter(event, events)?.result?.accepted === true) {
        improvement = recovery = event; break;
      }
    }
    recoveries.push({ kind: opportunity.kind, evidenceType: opportunity.evidenceType, goalId: opportunity.goal?.id ?? null,
      status: recovery ? 'recovered' : 'unresolved', startStepIds: evidenceIds([opportunity.event]),
      recoveryStepIds: recovery ? evidenceIds([recovery]) : [], firstImprovementStepIds: improvement ? evidenceIds([improvement]) : [],
      actionsToRecovery: recovery ? recovery.index - beginning + 1 : null,
      actionsToFirstImprovement: improvement ? improvement.index - beginning + 1 : null,
      observedActions: (recovery?.index ?? events.length - 1) - beginning + 1 });
    if (!failed || failed.type !== 'dragProduct' || failed.interest) continue;
    repeatOpportunities++;
    for (const event of events.slice(beginning, recovery ? recovery.index + 1 : events.length)) {
      if (event.interest || !sameSelection(event, failed)) continue;
      const goal = eventGoal(event, goals);
      const wrong = rejected(event, events) || event.gesture?.outcome !== 'drop'
        || goal && (!isGoalProduct(event.productId, goal) || quantityFor(taskBasketAt(events, event.index + 1), goal) > goal.quantity);
      if (wrong && !repeats.has(event.index)) repeats.set(event.index, { productId: event.productId, quantity: event.quantity ?? 1,
        originalStepIds: evidenceIds([failed]), opportunityStepIds: evidenceIds([opportunity.event]), repeatedStepIds: evidenceIds([event]) });
    }
  }
  return { recovery: { status: opportunities.length ? 'measured' : 'unexercised', opportunityCount: opportunities.length,
    recovered: opportunities.length ? recoveries.filter(row => row.status === 'recovered').length : null,
    unresolved: opportunities.length ? recoveries.filter(row => row.status === 'unresolved').length : null,
    actionsToRecovery: distribution(recoveries.map(row => row.actionsToRecovery).filter(Number.isFinite)), episodes: recoveries,
    definition: 'Count actor decisions from the first decision exposed to recorded feedback or mismatch, including the correcting decision. A goal mismatch recovers only when its task-basket discrepancy reaches zero.',
    limitations: ['Unresolved episodes retain null recovery time; summaries of recovered episodes exclude these censored observations.',
      'Generic feedback without a linked objective requires an accepted changed selection or return; checking alone is not recovery.'] },
    perseveration: { status: repeatOpportunities ? 'measured' : 'unexercised', opportunityCount: repeatOpportunities,
      count: repeatOpportunities ? repeats.size : null, repeats: [...repeats.values()],
      definition: 'Repeated identical product/quantity/outcome after recorded feedback or displayed mismatch, with the repeated selection itself still demonstrably wrong. Each repeated decision is counted once.' } };
}

/** Pure trace-to-description extraction; neither source/provider labels nor
 * primary validation thresholds take part in these calculations. */
function extractSequenceMetrics(trace, snapshot, persona = {}, audit = null, evidence = {}) {
  const events = actorEvents(trace, audit, evidence), goals = validationGoals(snapshot);
  const timed = events.filter(event => Number.isFinite(event.reactionDelayMs) && event.reactionDelayMs >= 0);
  const observations = timed.map(event => ({ value: event.reactionDelayMs, stepIds: evidenceIds([event]) }));
  return { version: 1, descriptiveOnly: true, usedForPrimaryVerdict: false, actorDecisionCount: events.length,
    delayDistribution: { ...distribution(observations.map(row => row.value)), unit: 'ms', evidenceType: 'authored-timing',
      missingTimingCount: events.length - timed.length, observations,
      definition: 'Linear-interpolated quantiles; sample standard deviation / mean for CV; upper tail is the largest ceil(n * 0.10) observed delays.',
      limitations: ['Actor-authored pre-action delay, not measured human reaction time or model latency.',
        'Actor decision mapping excludes automatic start, automatic replay closes and system completion when decision evidence is present.'] },
    actionTransitions: actionTransitions(events), errorTaxonomy: errorTaxonomy(events, goals), ...recoveryAndRepetition(events, goals),
    interpretation: '설명 지표이며 주 판정에 사용하지 않는다. 실수를 강제하지 않으며 오류가 많을수록 특정 인물이나 지적장애인과 더 비슷하다고 해석하지 않는다.' };
}

function summarizeSequenceMetrics(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.personaId, row.condition]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return { descriptiveOnly: true, usedForPrimaryVerdict: false, groups: [...groups.entries()].map(([key, group]) => {
    const [personaId, condition] = JSON.parse(key), bigrams = new Map();
    for (const row of group) for (const bigram of row.sequenceMetrics.actionTransitions.bigrams) {
      const key = JSON.stringify([bigram.from, bigram.to]), existing = bigrams.get(key) ?? { from: bigram.from, to: bigram.to, count: 0 };
      existing.count += bigram.count; bigrams.set(key, existing);
    }
    const timed = group.flatMap(row => row.sequenceMetrics.delayDistribution.observations);
    return { personaId, condition, traceCount: group.length,
      delayDistribution: { ...distribution(timed.map(row => row.value)), unit: 'ms', evidenceType: 'authored-timing',
        aggregation: 'Pooled observed actor decisions; traces with more timed actions contribute more observations.' },
      actionTransitions: transitionsFromBigrams([...bigrams.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))) };
  }) };
}

module.exports = { extractSequenceMetrics, summarizeSequenceMetrics };
