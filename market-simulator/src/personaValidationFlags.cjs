'use strict';
const spec = require('../validation/persona-validation-spec.json');
const { actorEvents, validationGoals, isGoalProduct, selectedEvent, feedbackOf, independentChoice,
  basketAt, goalError, interestRuns, selectionErrors, correctionOpportunities } = require('./personaValidationMetrics.cjs');

function flagsForTrace(trace, snapshot, audit, persona, evidence = {}, patterns = spec.patterns) {
  const events = actorEvents(trace, audit, evidence), flags = [];
  const add = (code, entries) => flags.push({ code,
    severity: ['no-independent-choice', 'all-familiar-goals-failed', 'familiar-goals-unattempted'].includes(code) ? 'review' : 'warning',
    stepIds: [...new Set(entries.flatMap(s => s.stepIds))],
    decisionIndexes: entries.map(s => s.decisionIndex).filter(Number.isInteger) });
  const repeats = new Map();
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const feedback = event.after?.lastActionError || (event.after?.result?.accepted === false
      ? event.after.result.message || 'rejected-action' : null) || feedbackOf(events[i + 1]);
    if (event.type !== 'dragProduct' || !feedback) continue;
    const key = JSON.stringify([event.productId, event.quantity, event.gesture?.outcome, feedback]);
    const repeated = [...(repeats.get(key) ?? []), event];
    repeats.set(key, repeated);
    if (repeated.length === patterns.sameWrongChoiceMinimum) add('same-wrong-choice-after-feedback', repeated);
  }
  const familiar = new Set((persona ?? require('../personas/neutral-adult-control.json')).character?.familiarProductIds ?? []);
  const goals = validationGoals(snapshot), choices = events.filter(selectedEvent), basket = basketAt(events);
  // This flag concerns the actual purchase outcome, regardless of its declared motive.
  const familiarGoals = goals.filter(g => [...familiar].some(id => isGoalProduct(id, g)));
  if (familiarGoals.length && familiarGoals.every(g => goalError(basket, g) > 0)) {
    // Ending before any attempt is a different finding from attempting and missing the goals.
    const attempts = events.filter(e => e.type === 'dragProduct' && familiarGoals.some(g => isGoalProduct(e.productId, g)));
    if (attempts.length) add('all-familiar-goals-failed', choices.length ? choices : attempts);
    else add('familiar-goals-unattempted', events.length ? [events.at(-1)] : []);
  }
  if (choices.length && choices.every(s => !independentChoice(s, events))) add('no-independent-choice', choices);
  for (const event of events) if (/장애|연기|페르소나|persona|disability|role.?play/i.test(`${event.reason ?? ''} ${event.currentTask ?? ''} ${trace.steps[event.sourceStepIndex]?.reason ?? ''} ${trace.steps[event.sourceStepIndex]?.currentTask ?? ''}`))
    add('role-or-disability-mentioned', [event]);
  return flags;
}

function collectionDiagnostics(samples) {
  return samples.map(sample => {
    const audit = sample.audit ?? sample.actorDecisions ?? null;
    const events = actorEvents(sample.trace, audit, { actorDecisions: sample.actorDecisions });
    const wholeTrace = sample.trace.generation?.actorPolicyVersion?.startsWith('whole-trace-') || events.some(event => event.action);
    const goals = validationGoals(sample.snapshot ?? {});
    const errors = selectionErrors(events, goals);
    // Absence of the task snapshot prevents distinguishing intentional interest purchases from goal errors.
    const errorCount = goals.length || !wholeTrace ? errors.length : null;
    const interestAvailable = events.some(s => s.attentionAvailable) || !wholeTrace;
    const runs = interestRuns(events);
    const corrections = sample.metrics?.correctionRate ?? (goals.length ? (() => {
      const opportunities = correctionOpportunities(events, goals);
      return { denominator: opportunities.length, numerator: opportunities.filter(o => o.correctedBy).length,
        evidence: opportunities.flatMap(o => o.event.stepIds) };
    })() : null);
    return { condition: sample.condition ?? 'unspecified', tracePath: sample.tracePath,
      errorCount, errorStepIds: errors.flatMap(error => error.events.flatMap(event => event.stepIds)),
      interestCount: interestAvailable ? runs.length : null,
      interestStepIds: runs.flatMap(run => run.events.flatMap(event => event.stepIds)), correction: corrections };
  });
}
function collectionFindings(samples, patterns = spec.patterns) {
  const rows = collectionDiagnostics(samples), findings = [];
  const add = (code, selected, condition, stepField) => findings.push({ code,
    severity: code === 'zero-error-variance' && selected.every(row => row.errorCount === 0) ? 'info' : 'review',
    interpretation: code.startsWith('zero-') && code.endsWith('-variance')
      ? 'Equal counts are a descriptive review signal, not evidence that errors or interest must be inserted.'
      : 'Review the observed opportunities and responses; this finding is not by itself a personality failure.',
    ...(condition ? { condition } : {}),
    traces: selected.map(row => ({ tracePath: row.tracePath,
      stepIds: stepField === 'correction' ? row.correction?.evidence ?? [] : row[stepField] ?? [] })) });
  const conditions = [...new Set(rows.map(row => row.condition))];
  for (const condition of conditions) {
    const group = rows.filter(row => row.condition === condition);
    const corrections = group.filter(row => row.correction?.denominator > 0);
    if (corrections.length && corrections.every(row => row.correction.numerator === 0))
      add('zero-correction-after-feedback', corrections, condition, 'correction');
    for (const kind of ['error', 'interest']) {
      const available = group.filter(row => Number.isFinite(row[`${kind}Count`]));
      if (available.length === group.length && available.length >= patterns.minimumVarianceSamples
        && new Set(available.map(row => row[`${kind}Count`])).size === 1)
        add(`zero-${kind}-variance`, available, condition, `${kind}StepIds`);
      if (kind === 'error' && available.length === group.length && available.length
        && available.every(row => row.errorCount > 0)) add('every-trace-has-error', available, condition, 'errorStepIds');
    }
  }
  return findings;
}
function collectionFlags(samples) { return [...new Set(collectionFindings(samples).map(finding => finding.code))]; }
module.exports = { flagsForTrace, collectionFlags, collectionDiagnostics, collectionFindings };
