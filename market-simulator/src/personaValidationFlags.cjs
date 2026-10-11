'use strict';
const { actorEvents, validationGoals, isGoalProduct, selectedEvent, feedbackOf } = require('./personaValidationMetrics.cjs');

function flagsForTrace(trace, snapshot, audit, persona) {
  const events = actorEvents(trace, audit), flags = [];
  const add = (code, evidence) => flags.push({ code, stepIds: evidence.flatMap(s => s.stepIds),
    decisionIndexes: evidence.map(s => s.decisionIndex).filter(Number.isInteger) });
  let key = '', repeated = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    // Feedback in before belongs to the previous actor choice, not replay index i + 1.
    const feedback = feedbackOf(events[i + 1])
      ?? (event.decisionIndex === undefined ? feedbackOf({ before: audit?.decisions?.find(d => d.decisionIndex === i + 1)?.before }) : null);
    if (event.type === 'dragProduct' && feedback) {
      const nextKey = JSON.stringify([event.productId, event.quantity, event.gesture?.outcome, feedback]);
      if (nextKey !== key) { key = nextKey; repeated = []; }
      repeated.push(event);
      if (repeated.length === 3) add('same-wrong-choice-after-feedback', repeated);
    } else if (!['readList', 'viewCart', 'viewHelp'].includes(event.type)) { key = ''; repeated = []; }
  }
  const familiar = new Set((persona ?? require('../personas/neutral-adult-control.json')).character?.familiarProductIds ?? []);
  const goals = validationGoals(snapshot), choices = events.filter(selectedEvent);
  const familiarGoals = goals.filter(g => [...familiar].some(id => isGoalProduct(id, g)));
  if (familiarGoals.length && familiarGoals.every(g => !choices.some(s => isGoalProduct(s.productId, g))))
    add('all-familiar-goals-failed', events.length ? [events.at(-1)] : []);
  if (choices.length && choices.every(s => events.slice(Math.max(0, s.index - 2), s.index)
    .some(t => t.type === 'viewHelp' || t.type === 'talkToStaff'))) add('no-independent-choice', choices);
  for (const event of events) if (/장애|연기|페르소나|persona|disability|role.?play/i.test(`${event.reason ?? ''} ${event.currentTask ?? ''}`))
    add('role-or-disability-mentioned', [event]);
  return flags;
}

function collectionDiagnostics(samples) {
  return samples.map(sample => {
    const audit = sample.audit ?? (sample.actorDecisions ? {
      decisions: Array.isArray(sample.actorDecisions) ? sample.actorDecisions : sample.actorDecisions.decisions,
    } : null);
    const events = actorEvents(sample.trace, audit);
    const wholeTrace = sample.trace.generation?.actorPolicyVersion?.startsWith('whole-trace-')
      || events.some(event => event.action);
    // Whole-trace projects every add to a drop; motor misses are unavailable there.
    const errorCount = wholeTrace ? null : events.filter(s => s.type === 'dragProduct' && s.gesture?.outcome !== 'drop').length;
    const interestAvailable = events.some(s => s.attentionAvailable) || !wholeTrace;
    return { condition: sample.condition ?? 'unspecified', tracePath: sample.tracePath,
      errorCount, interestCount: interestAvailable ? events.filter(s => s.interest).length : null,
      correction: sample.metrics?.correctionRate ?? null };
  });
}

function collectionFlags(samples) {
  const rows = collectionDiagnostics(samples), flags = [];
  const corrections = rows.map(s => s.correction).filter(m => m?.denominator);
  if (corrections.length && corrections.every(m => m.numerator === 0)) flags.push('zero-correction-after-feedback');
  for (const kind of ['error', 'interest']) {
    const available = rows.filter(s => Number.isFinite(s[`${kind}Count`]));
    // Different loads are not repeated samples of the same opportunity.
    const conditions = [...new Set(available.map(s => s.condition))];
    const repeatedGroups = conditions.map(condition => available.filter(s => s.condition === condition)).filter(group => group.length >= 2);
    if (repeatedGroups.length && repeatedGroups.every(group => new Set(group.map(s => s[`${kind}Count`])).size === 1))
      flags.push(`zero-${kind}-variance`);
    if (kind === 'error' && available.length && available.length === rows.length && available.every(s => s.errorCount > 0))
      flags.push('every-trace-has-error');
  }
  return flags;
}
module.exports = { flagsForTrace, collectionFlags, collectionDiagnostics };
