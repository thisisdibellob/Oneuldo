/**
 * Post-compilation summary of task expression and evidence exercised by a
 * whole-trace plan. This module is descriptive: it never chooses or repairs
 * an action and does not infer cognition from natural-language reasons.
 */
export type WholeTraceTaskExpressionEntry = {
  decisionIndex: number;
  actorState: {
    activity: string;
    focusedGoalId?: string | null;
    focusedProductId?: string | null;
    uncertainGoalIds?: string[];
    memoryUpdate?: { type: string; goalId?: string }[];
  };
  basis: {
    intent: string;
    goalId?: string | null;
    memoryUses?: { goalId: string; field: string; mode: string; value?: string | number }[];
  };
  action: { type: string };
  delayMs: number;
  before?: { products?: { id: string }[] };
  cognition?: {
    valid?: boolean;
    state: {
      knownGoalFields?: Record<string, string[]>;
      uncertainGoalIds?: string[];
      activeGoals?: { goalId: string; fields?: Record<string, { status: string }> }[];
    };
    events?: { kind: string; goalId: string; fields?: string[] }[];
  };
  taskMemory?: {
    state: { openGoalIds: string[] };
    events?: { kind: string; goalId?: string; fields?: string[] }[];
  };
};

export type WholeTraceTaskExpressionFinding = {
  code: 'INTEREST_PRODUCTS_WITHOUT_FOCUS' | 'UNIFORM_ORIENT_WALK_DELAYS';
  severity: 'warning';
  decisionIndexes: number[];
  message: string;
  productIds?: string[];
};

export type WholeTraceTaskExpressionReview = {
  version: 'task-expression-v1';
  coverage: {
    status: 'exercised' | 'unexercised';
    goalMemoryDuringMovementDecisions: number[];
    interestWithPendingGoalsDecisions: number[];
    uncertainFieldDecisions: number[];
    contextUncertaintyDecisions: number[];
    declaredUncertaintyDecisions: number[];
    recoveryAfterUncertaintyDecisions: number[];
    focusedInterestProductDecisions: number[];
    goalDirectedDecisions: number[];
  };
  findings: WholeTraceTaskExpressionFinding[];
};

const knownFields = new Set(['name', 'specification', 'requiredQuantity']);
const certaintyEvidenceKinds = new Set(['decayed', 'declared-uncertain', 'self-recall']);
const realChecks = new Set(['readList', 'viewCart', 'viewHelp']);
const movementActions = new Set(['walkToAnchor', 'walkTo', 'walk']);

function knownFieldSet(entry: WholeTraceTaskExpressionEntry, goalId: string): Set<string> {
  return new Set((entry.cognition?.state.knownGoalFields?.[goalId] ?? []).filter(field => knownFields.has(field)));
}

function uncertainFields(entry: WholeTraceTaskExpressionEntry, goalId: string): Set<string> {
  const known = knownFieldSet(entry, goalId);
  const uncertain = new Set<string>();
  const active = entry.cognition?.state.activeGoals?.find(goal => goal.goalId === goalId);
  for (const field of known) if (['uncertain', 'unavailable'].includes(active?.fields?.[field]?.status ?? '')) uncertain.add(field);
  for (const event of entry.cognition?.events ?? []) {
    if (event.goalId !== goalId || !certaintyEvidenceKinds.has(event.kind)) continue;
    for (const field of event.fields ?? []) if (known.has(field)) uncertain.add(field);
  }
  return uncertain;
}

function uncertaintyGoals(entry: WholeTraceTaskExpressionEntry): Map<string, Set<string>> {
  const goals = new Map<string, Set<string>>();
  const add = (goalId: string, fields: Iterable<string>) => {
    const known = knownFieldSet(entry, goalId);
    const selected = [...fields].filter(field => known.has(field));
    if (selected.length) goals.set(goalId, new Set([...(goals.get(goalId) ?? []), ...selected]));
  };
  for (const id of entry.cognition?.state.uncertainGoalIds ?? []) add(id, uncertainFields(entry, id));
  for (const event of entry.cognition?.events ?? [])
    if (certaintyEvidenceKinds.has(event.kind)) add(event.goalId, event.fields ?? []);
  return goals;
}

function pendingGoalIds(entry: WholeTraceTaskExpressionEntry): string[] {
  return entry.taskMemory?.state.openGoalIds ?? entry.cognition?.state.activeGoals?.map(goal => goal.goalId) ?? [];
}

function recoversGoal(entry: WholeTraceTaskExpressionEntry, goalId: string, priorEntries: readonly WholeTraceTaskExpressionEntry[]): boolean {
  if ((entry.cognition?.events ?? []).some(event => event.kind === 'list-read' && event.goalId === goalId)
    && priorEntries.some(previous => previous.action.type === 'readList')) return true;
  if ((entry.cognition?.events ?? []).some(event => event.kind === 'self-recall' && event.goalId === goalId)) return true;
  if ((entry.taskMemory?.events ?? []).some(event => event.kind === 'self-recall' && event.goalId === goalId)) return true;
  if ((entry.actorState.memoryUpdate ?? []).some(update => update.type === 'selfRecall' && update.goalId === goalId)) return true;
  if (realChecks.has(entry.action.type) && (entry.actorState.focusedGoalId === goalId || entry.basis.goalId === goalId)) return true;
  return (entry.basis.memoryUses ?? []).some(use => use.goalId === goalId && use.mode === 'guess'
    && knownFieldSet(entry, goalId).has(use.field)
    && uncertainFields(entry, goalId).has(use.field));
}

function interestDecision(entry: WholeTraceTaskExpressionEntry): boolean {
  return entry.actorState.activity === 'interest' || entry.basis.intent === 'interest';
}

/** Summarize exercised cognition cues and task expression after accepted execution. */
export function reviewWholeTraceTaskExpression(entries: readonly WholeTraceTaskExpressionEntry[]): WholeTraceTaskExpressionReview {
  const coverage = {
    status: 'unexercised' as 'exercised' | 'unexercised',
    goalMemoryDuringMovementDecisions: [] as number[],
    interestWithPendingGoalsDecisions: [] as number[],
    uncertainFieldDecisions: [] as number[],
    contextUncertaintyDecisions: [] as number[],
    declaredUncertaintyDecisions: [] as number[],
    recoveryAfterUncertaintyDecisions: [] as number[],
    focusedInterestProductDecisions: [] as number[],
    goalDirectedDecisions: [] as number[],
  };
  const findings: WholeTraceTaskExpressionFinding[] = [];
  const uncertaintyIndexesByGoal = new Map<string, number[]>();
  const exercisedGoals = new Set<string>();

  for (const entry of entries) {
    const pendingGoals = pendingGoalIds(entry);
    if (movementActions.has(entry.action.type) && (pendingGoals.length > 0 || (entry.basis.memoryUses?.length ?? 0) > 0))
      coverage.goalMemoryDuringMovementDecisions.push(entry.decisionIndex);
    if (interestDecision(entry) && pendingGoals.length > 0)
      coverage.interestWithPendingGoalsDecisions.push(entry.decisionIndex);
    if (interestDecision(entry) && entry.actorState.focusedProductId)
      coverage.focusedInterestProductDecisions.push(entry.decisionIndex);
    if (entry.basis.goalId || entry.actorState.focusedGoalId && (entry.actorState.activity === 'shop' || entry.basis.intent === 'task'))
      coverage.goalDirectedDecisions.push(entry.decisionIndex);

    const knownDecay = (entry.cognition?.events ?? []).some(event => event.kind === 'decayed'
      && event.fields?.some(field => knownFieldSet(entry, event.goalId).has(field)));
    const declaredUncertainty = (entry.cognition?.events ?? []).some(event => ['declared-uncertain', 'self-recall'].includes(event.kind)
      && event.fields?.some(field => knownFieldSet(entry, event.goalId).has(field)));
    if (knownDecay) coverage.contextUncertaintyDecisions.push(entry.decisionIndex);
    if (declaredUncertainty) coverage.declaredUncertaintyDecisions.push(entry.decisionIndex);

    for (const [goalId, fields] of uncertaintyGoals(entry)) {
      if (!fields.size) continue;
      coverage.uncertainFieldDecisions.push(entry.decisionIndex);
      const indexes = uncertaintyIndexesByGoal.get(goalId) ?? [];
      indexes.push(entry.decisionIndex); uncertaintyIndexesByGoal.set(goalId, indexes);
    }
  }

  for (const [goalId, indexes] of uncertaintyIndexesByGoal) {
    const firstUncertain = Math.min(...indexes);
    const recovery = entries.find(entry => entry.decisionIndex > firstUncertain
      && recoversGoal(entry, goalId, entries.filter(previous => previous.decisionIndex >= firstUncertain
        && previous.decisionIndex <= entry.decisionIndex)));
    if (recovery) {
      coverage.recoveryAfterUncertaintyDecisions.push(recovery.decisionIndex);
      exercisedGoals.add(goalId);
    }
  }
  coverage.status = exercisedGoals.size ? 'exercised' : 'unexercised';

  for (let start = 0; start < entries.length;) {
    if (!interestDecision(entries[start])) { start++; continue; }
    let end = start + 1;
    while (end < entries.length && interestDecision(entries[end])) end++;
    const interval = entries.slice(start, end);
    const productIds = [...new Set(interval.flatMap(entry => (entry.before?.products ?? []).map(product => product.id)))];
    if (productIds.length && interval.every(entry => entry.actorState.focusedProductId === null)) findings.push({
      code: 'INTEREST_PRODUCTS_WITHOUT_FOCUS', severity: 'warning', decisionIndexes: interval.map(entry => entry.decisionIndex), productIds,
      message: 'Products were displayed during an interest interval, but every decision explicitly recorded no focused product. Review the task-state annotations; this is not evidence of a required attention shift.',
    });
    start = end;
  }

  const orientWalk = entries.filter(entry => entry.actorState.activity === 'orient' || movementActions.has(entry.action.type));
  if (orientWalk.length >= 8 && new Set(orientWalk.map(entry => entry.delayMs)).size === 1) findings.push({
    code: 'UNIFORM_ORIENT_WALK_DELAYS', severity: 'warning', decisionIndexes: orientWalk.map(entry => entry.decisionIndex),
    message: 'At least eight orientation or movement decisions use an identical delay; review whether the chosen timing reflects the different observed situations.',
  });

  coverage.uncertainFieldDecisions = [...new Set(coverage.uncertainFieldDecisions)].sort((a, b) => a - b);
  coverage.contextUncertaintyDecisions = [...new Set(coverage.contextUncertaintyDecisions)].sort((a, b) => a - b);
  coverage.declaredUncertaintyDecisions = [...new Set(coverage.declaredUncertaintyDecisions)].sort((a, b) => a - b);
  coverage.recoveryAfterUncertaintyDecisions = [...new Set(coverage.recoveryAfterUncertaintyDecisions)].sort((a, b) => a - b);

  return { version: 'task-expression-v1', coverage, findings };
}
