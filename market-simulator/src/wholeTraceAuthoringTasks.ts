import type { WholeTraceAction, WholeTraceChoiceSource, WholeTraceTaskChoiceDecision } from './wholeTraceContracts';

/** IDs copied from explicit draft declarations, never a runtime memory snapshot. */
export type WholeTraceAuthoringTaskState = {
  kind: 'symbolic-task-declarations-v1';
  knownGoalIds: string[];
  openGoalIds: string[];
  completedGoalIds: string[];
  previousActionType: WholeTraceAction['type'] | null;
};
export type WholeTraceAuthoringTaskIssue = { path: string; rule: string; message: string };
type InitialTaskState = {
  knownGoalIds?: readonly string[]; openGoalIds?: readonly string[]; completedGoalIds?: readonly string[];
  previousActionType?: WholeTraceAction['type'] | null;
};
export function createWholeTraceAuthoringTaskState(initial: InitialTaskState = {}): WholeTraceAuthoringTaskState {
  return { kind: 'symbolic-task-declarations-v1', knownGoalIds: [...(initial.knownGoalIds ?? [])],
    openGoalIds: [...(initial.openGoalIds ?? [])], completedGoalIds: [...(initial.completedGoalIds ?? [])],
    previousActionType: initial.previousActionType ?? null };
}

const endingActions = new Set<WholeTraceAction['type']>(['checkout', 'submit', 'requestCashier', 'giveUp']);
const externalCheckActions = new Set<WholeTraceAction['type']>(['readList', 'viewCart', 'viewHelp']);
const unboundIntents = new Set(['explore', 'interest', 'rest', 'finish']);

/**
 * Reject contradictory declarations while the whole plan is being authored.
 * Call only after the existing candidate-7 syntax validator succeeds. This is a
 * necessary-consistency check, not an acceptance oracle: the saved source/menu
 * checks and final knowledge, cognition, purchase-result and task validators
 * still apply. In particular, an explicit complete declaration is tracked here
 * without claiming that its required prior add was actually accepted/observed.
 *
 * The previous drafted readList predicts list exposure for this decision only.
 * We inspect IDs and presence of actor-authored fields, never list/recall values,
 * memory certainty, pressure, quantities, products or a desired action. No
 * ActorObservation or runtime engine is constructed. Neither input nor state is
 * changed; an issue returns the original state as a fresh copy.
 */
export function previewWholeTraceAuthoringTasks(input: {
  state: WholeTraceAuthoringTaskState;
  objectiveIds: readonly string[];
  decision: Pick<WholeTraceTaskChoiceDecision, 'basis' | 'actorState'>;
  actionType: WholeTraceAction['type'];
  phase: WholeTraceChoiceSource['phase'];
  goalMemoryCapacity?: number;
}): { issues: WholeTraceAuthoringTaskIssue[]; nextState: WholeTraceAuthoringTaskState } {
  const { state, decision: { actorState, basis }, actionType, phase, objectiveIds, goalMemoryCapacity } = input;
  const next = structuredClone(state), issues: WholeTraceAuthoringTaskIssue[] = [];
  const issue = (path: string, rule: string, message: string) => issues.push({ path, rule, message });
  // Merely selecting readList now must not expose its future result in this decision.
  const displayed = new Set(state.previousActionType === 'readList' ? objectiveIds : []);
  for (const id of displayed) if (!next.knownGoalIds.includes(id)) next.knownGoalIds.push(id);
  next.knownGoalIds.sort();
  let newlySelected = 0;
  for (const [index, update] of (actorState.taskUpdate ?? []).entries()) {
    const at = `actorState.taskUpdate[${index}]`, open = next.openGoalIds.includes(update.goalId);
    if (update.type === 'select') {
      if (open) {
        issue(at, 'select_already_open', `Task ${update.goalId} is already declared open; duplicate select is not a new selection.`);
        continue;
      }
      const recalled = actorState.memoryUpdate?.some(change => change.type === 'selfRecall'
        && change.goalId === update.goalId && Object.hasOwn(change.values, 'name'));
      if (!displayed.has(update.goalId) && !(next.knownGoalIds.includes(update.goalId) && recalled)) {
        issue(at, 'select_requires_display_or_recall',
          `Selecting task ${update.goalId} requires the previous drafted readList's current display or explicit selfRecall name for a previously read ID; no goal or belief is supplied.`);
        continue;
      }
      next.openGoalIds.push(update.goalId);
      next.completedGoalIds = next.completedGoalIds.filter(id => id !== update.goalId);
      newlySelected++;
    } else if (!open) {
      issue(at, 'release_requires_open', `Cannot ${update.type} unopened task ${update.goalId}.`);
    } else {
      next.openGoalIds = next.openGoalIds.filter(id => id !== update.goalId);
      if (update.type === 'complete') next.completedGoalIds.push(update.goalId);
      // This tracks the author's declaration only. Actual add-result evidence is
      // intentionally checked by the unchanged final task validator, not invented.
    }
  }
  if (goalMemoryCapacity !== undefined) {
    if (!Number.isInteger(goalMemoryCapacity) || goalMemoryCapacity < 1 || goalMemoryCapacity > 24)
      throw new Error('Authoring task goalMemoryCapacity must be 1..24');
    if (actorState.heldGoalIds.length > goalMemoryCapacity)
      issue('actorState.heldGoalIds', 'held_capacity', `Declared held goals exceed goalMemoryCapacity (${goalMemoryCapacity}); no goals are dropped.`);
    if (next.openGoalIds.length > goalMemoryCapacity)
      issue('actorState.taskUpdate', 'open_capacity', `Declared pending tasks exceed goalMemoryCapacity (${goalMemoryCapacity}); no task is released.`);
  }
  const held = new Set(actorState.heldGoalIds);
  for (const id of next.openGoalIds) {
    if (!held.has(id)) issue('actorState.heldGoalIds', 'held_missing_open',
      `Open task ${id} must stay in heldGoalIds after this decision's taskUpdate, including focus changes and detours; complete or abandon must be explicit.`);
    for (const [index, update] of (actorState.memoryUpdate ?? []).entries()) {
      if (update.type === 'deactivate' && update.goalId === id)
        issue(`actorState.memoryUpdate[${index}]`, 'deactivate_open',
          `Cannot deactivate working memory for open task ${id}; complete or abandon must be explicit.`);
    }
  }
  for (const id of held) if (!next.openGoalIds.includes(id))
    issue('actorState.heldGoalIds', 'held_unselected',
      `heldGoalIds contains unselected task ${id}; it must agree with the actor's explicit taskUpdate lifecycle.`);
  if ([...displayed].some(id => !next.completedGoalIds.includes(id)) && !state.openGoalIds.length
    && phase === 'shopping' && !endingActions.has(actionType) && !newlySelected)
    issue('actorState.taskUpdate', 'selection_after_list',
      'After a drafted readList with no open task, explicitly select at least one currently displayed unfinished goal; a finish activity label alone is not an ending action. No goal is chosen automatically.');

  if ((basis.intent === 'task' || basis.intent === 'recover') && basis.goalId === null)
    issue('basis.goalId', 'bound_intent_requires_goal',
      `${basis.intent} intent requires basis.goalId for an open task; neither the goal nor a replacement intent is supplied.`);
  else if (unboundIntents.has(basis.intent) && basis.goalId !== null)
    issue('basis.goalId', 'unbound_intent_requires_null',
      `${basis.intent} intent requires basis.goalId=null without releasing pending tasks.`);
  if (basis.goalId && !externalCheckActions.has(actionType)
    && !basis.memoryUses.some(use => use.goalId === basis.goalId && use.field === 'name'))
    issue('basis.memoryUses', 'goal_name_use_required',
      `Goal-directed ${basis.intent} action requires an actor-authored name memoryUse for ${basis.goalId}; no name or memory mode is filled.`);
  for (const [index, use] of basis.memoryUses.entries()) {
    if (use.goalId !== basis.goalId)
      issue(`basis.memoryUses[${index}].goalId`, 'memory_goal_binding',
        `memoryUses for ${use.goalId} must bind to the same non-null basis.goalId.`);
  }
  if (basis.goalId && !next.openGoalIds.includes(basis.goalId))
    issue('basis.goalId', 'basis_requires_open', `basis.goalId ${basis.goalId} must refer to a task still open after this decision's taskUpdate.`);
  if (actorState.focusedGoalId && (!next.openGoalIds.includes(actorState.focusedGoalId)
    || actorState.focusedGoalId !== basis.goalId))
    issue('actorState.focusedGoalId', 'focus_goal_binding',
      'focusedGoalId must match basis.goalId for an open task; attention elsewhere may use null while retaining pending goals.');
  if ((actionType === 'add' || actionType === 'remove') && basis.goalId
    && !basis.memoryUses.some(use => use.goalId === basis.goalId && use.field === 'requiredQuantity'))
    issue('basis.memoryUses', 'goal_quantity_use_required',
      `Goal-directed ${actionType} requires an actor-authored requiredQuantity memoryUse for ${basis.goalId}; this never sets or corrects the chosen action quantity.`);

  next.previousActionType = actionType;
  return { issues, nextState: structuredClone(issues.length ? state : next) };
}
