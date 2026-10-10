import type { ActorObservation, PolicyAction } from './types';
import { validateWholeTraceMemoryUpdate, validateWholeTraceMemoryUses,
  type WholeTraceMemoryUpdate, type WholeTraceMemoryUse } from './wholeTraceCognition';

export type WholeTraceTaskUpdate = { type: 'select' | 'complete' | 'abandon'; goalId: string }[];
export type WholeTraceTaskActorState = {
  heldGoalIds: string[]; focusedGoalId?: string | null;
  memoryUpdate?: WholeTraceMemoryUpdate; taskUpdate?: WholeTraceTaskUpdate;
};
export type WholeTraceTaskBasis = {
  intent: 'explore' | 'interest' | 'task' | 'check' | 'recover' | 'help' | 'finish' | 'rest';
  goalId: string | null; memoryUses?: readonly WholeTraceMemoryUse[];
};
type ActionBinding = {
  actionType: PolicyAction['type']; goalId: string | null; decisionIndex: number;
  productId?: string; quantity?: number; observationSequence?: number;
};
export type WholeTraceTaskPurchaseEvidence = {
  goalId: string; decisionIndex: number; productId?: string; quantity?: number;
};
export type WholeTraceTaskState = {
  taskStateVersion: 'persistent-task-v1'; decisionIndex: number;
  /** IDs are exposure metadata only: no goal label, requested quantity or task answer is stored. */
  knownGoalIds: string[]; openGoalIds: string[];
  purchaseEvidence: WholeTraceTaskPurchaseEvidence[];
  lastAction: ActionBinding | null; lastResultKey: string | null;
};
export type WholeTraceTaskEvent = {
  kind: 'selected' | 'completed' | 'abandoned' | 'purchase-observed'; goalId: string;
  decisionIndex: number; productId?: string; quantity?: number;
};
export type WholeTraceTaskPreview = {
  valid: boolean; errors: string[]; state: WholeTraceTaskState; events: WholeTraceTaskEvent[];
};

export const WHOLE_TRACE_TASK_MEMORY_INSTRUCTIONS = `Pending tasks and momentary focus are separate. Node maintains openGoalIds after accepted actions; changing activity to interest/explore/rest, clearing focusedGoalId, or writing heldGoalIds=[] never silently removes a selected task. heldGoalIds must contain exactly the open goals so every working goal has a persistent task lifecycle and the actual working-memory engine applies its capacity and context pressure during a detour. No goal details are restored from the factual archive.
Every decision has basis.goalId (a goal reference or null). task/recover intent requires one currently open goal; check/help may use null or an open goal; explore/interest/rest/finish require null. Any goal-bound action declares that goal's name in memoryUses; readList/viewCart/viewHelp may first seek external cues when the name is unavailable. Every declared memoryUse belongs to basis.goalId; non-goal decisions cannot use a goal detail while claiming no task connection. An add/remove for a task also declares requiredQuantity in memoryUses, but the selected product and action quantity are never corrected against that belief or the task answer.
actorState.taskUpdate is optional and contains {type:"select|complete|abandon",goalId}. select requires that goal in the CURRENT actual readObjectives, or explicit selfRecall belief values in this same decision for a previously read goal. The memory engine independently validates those beliefs. After a real shopping-list read with no open task, select at least one displayed goal unless the actual action is checkout, submit, requestCashier or giveUp; a finish activity label alone is not an exception. The model chooses which goal: the system never chooses one automatically.
complete releases a goal only after an earlier accepted add action explicitly bound to that goal and confirmed by its real observed result. This means the actor believes that selection is done; it never means a hidden correct product or requested quantity was verified. Incorrect legal purchases may complete a task. abandon explicitly releases a goal without a purchase and records that behavioral choice. Capacity bounds pending tasks and working memory. Checkout, finish and giveUp are allowed with unfinished tasks; no purchase, detour, mistake or recovery quota is imposed.`;

function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function ref(value: unknown): value is string { return typeof value === 'string' && !!value.trim() && value.length <= 300; }
export function validateWholeTraceTaskUpdate(value: unknown): { valid: boolean; errors: string[] } {
  if (value === undefined) return { valid: true, errors: [] };
  if (!Array.isArray(value) || value.length > 24)
    return { valid: false, errors: ['actorState.taskUpdate must be an array of at most 24 updates'] };
  const errors: string[] = [], touched = new Set<string>();
  value.forEach((item, index) => {
    const at = `actorState.taskUpdate[${index}]`;
    if (!plain(item)) { errors.push(`${at} must be a JSON object`); return; }
    if (Object.keys(item).some(key => !['type', 'goalId'].includes(key))) errors.push(`${at}: unknown field`);
    if (!['select', 'complete', 'abandon'].includes(item.type as string)) errors.push(`${at}: unsupported task update`);
    if (!ref(item.goalId)) errors.push(`${at}: invalid goalId`);
    else {
      if (touched.has(item.goalId)) errors.push(`${at}: conflicting task updates for ${item.goalId}`);
      touched.add(item.goalId);
    }
  });
  return { valid: !errors.length, errors };
}
function initialState(): WholeTraceTaskState {
  return { taskStateVersion: 'persistent-task-v1', decisionIndex: -1, knownGoalIds: [],
    openGoalIds: [], purchaseEvidence: [], lastAction: null, lastResultKey: null };
}
const recoveringActions = new Set<PolicyAction['type']>(['readList', 'viewCart', 'viewHelp']);
const endingActions = new Set<PolicyAction['type']>(['checkout', 'submit', 'requestCashier', 'giveUp']);
const unboundIntents = new Set(['explore', 'interest', 'rest', 'finish']);

/**
 * Persistent declared tasks, with no world, catalogue, goal answer or action policy.
 * Preview changes only the pending transaction; committed state changes only when
 * the unchanged app/offline action was actually accepted and commit() is called.
 */
export class WholeTraceTaskMemoryEngine {
  private state = initialState();
  private pending?: WholeTraceTaskState;
  readonly goalMemoryCapacity: number;
  constructor(goalMemoryCapacity: number) {
    if (!Number.isInteger(goalMemoryCapacity) || goalMemoryCapacity < 1 || goalMemoryCapacity > 24)
      throw new Error('goalMemoryCapacity must be 1..24');
    this.goalMemoryCapacity = goalMemoryCapacity;
  }
  snapshot(): WholeTraceTaskState { return structuredClone(this.state); }
  preview(observation: ActorObservation, actorState: WholeTraceTaskActorState,
    basis: WholeTraceTaskBasis, action: PolicyAction): WholeTraceTaskPreview {
    this.pending = undefined;
    const next = structuredClone(this.state), errors: string[] = [], events: WholeTraceTaskEvent[] = [];
    errors.push(...validateWholeTraceTaskUpdate(actorState.taskUpdate).errors);
    errors.push(...validateWholeTraceMemoryUpdate(actorState.memoryUpdate).errors);
    errors.push(...validateWholeTraceMemoryUses(basis.memoryUses ?? []).errors);
    if (!Object.hasOwn(basis, 'goalId') || !(basis.goalId === null || ref(basis.goalId)))
      errors.push('basis.goalId is required and must be a short goal reference or null');
    if (!['explore', 'interest', 'task', 'check', 'recover', 'help', 'finish', 'rest'].includes(basis.intent))
      errors.push('Unsupported basis intent');
    if (!Array.isArray(actorState.heldGoalIds) || actorState.heldGoalIds.some(id => !ref(id))
      || new Set(actorState.heldGoalIds).size !== actorState.heldGoalIds.length)
      errors.push('heldGoalIds must contain distinct short goal references');
    else if (actorState.heldGoalIds.length > this.goalMemoryCapacity)
      errors.push(`Working memory exceeds goalMemoryCapacity (${this.goalMemoryCapacity})`);
    if (errors.length) return { valid: false, errors, state: next, events };

    const displayed = new Set((observation.readObjectives ?? []).map(goal => goal.id));
    for (const goalId of displayed) if (!next.knownGoalIds.includes(goalId)) next.knownGoalIds.push(goalId);
    next.knownGoalIds.sort();
    const previous = next.lastAction, result = observation.result;
    const resultKey = result ? JSON.stringify([observation.sequence ?? observation.elapsedMs ?? next.decisionIndex + 1, result]) : null;
    const newerSequence = previous?.observationSequence === undefined || observation.sequence === undefined
      || observation.sequence > previous.observationSequence;
    if (previous?.actionType === 'add' && previous.goalId && next.openGoalIds.includes(previous.goalId)
      && result?.accepted && result.actionType === 'add' && resultKey !== next.lastResultKey && newerSequence
      && (previous.productId === undefined || result.productId === previous.productId)
      && (previous.quantity === undefined || result.quantity === previous.quantity)) {
      const evidence = { goalId: previous.goalId, decisionIndex: previous.decisionIndex,
        ...(result.productId !== undefined ? { productId: result.productId } : {}),
        ...(result.quantity !== undefined ? { quantity: result.quantity } : {}) };
      next.purchaseEvidence.push(evidence);
      events.push({ kind: 'purchase-observed', ...evidence });
    }
    next.lastResultKey = resultKey;

    let newlySelected = 0;
    for (const update of actorState.taskUpdate ?? []) {
      const open = next.openGoalIds.includes(update.goalId);
      if (update.type === 'select') {
        if (open) { errors.push(`Task ${update.goalId} is already open`); continue; }
        const recalled = actorState.memoryUpdate?.some(change => change.type === 'selfRecall' && change.goalId === update.goalId
          && Object.hasOwn(change.values, 'name'));
        if (!displayed.has(update.goalId) && !(next.knownGoalIds.includes(update.goalId) && recalled)) {
          errors.push(`Selecting task ${update.goalId} requires a current displayed goal or explicit selfRecall name belief`); continue;
        }
        next.openGoalIds.push(update.goalId); newlySelected++;
        events.push({ kind: 'selected', goalId: update.goalId, decisionIndex: next.decisionIndex + 1 });
      } else {
        if (!open) { errors.push(`Cannot ${update.type} unopened task ${update.goalId}`); continue; }
        if (update.type === 'complete' && !next.purchaseEvidence.some(item => item.goalId === update.goalId)) {
          errors.push(`Completing task ${update.goalId} requires an earlier accepted add bound to that goal and its observed result`); continue;
        }
        next.openGoalIds = next.openGoalIds.filter(id => id !== update.goalId);
        next.purchaseEvidence = next.purchaseEvidence.filter(item => item.goalId !== update.goalId);
        events.push({ kind: update.type === 'complete' ? 'completed' : 'abandoned', goalId: update.goalId,
          decisionIndex: next.decisionIndex + 1 });
      }
    }
    if (next.openGoalIds.length > this.goalMemoryCapacity)
      errors.push(`Pending tasks exceed goalMemoryCapacity (${this.goalMemoryCapacity})`);
    const held = new Set(actorState.heldGoalIds);
    for (const goalId of next.openGoalIds) {
      if (!held.has(goalId)) errors.push(`Open task ${goalId} must stay in heldGoalIds during focus changes and detours; complete or abandon explicitly`);
      if (actorState.memoryUpdate?.some(update => update.type === 'deactivate' && update.goalId === goalId))
        errors.push(`Cannot deactivate working memory for open task ${goalId}; complete or abandon explicitly`);
    }
    for (const goalId of held) if (!next.openGoalIds.includes(goalId))
      errors.push(`heldGoalIds contains unselected task ${goalId}; select or release it through taskUpdate`);
    if (displayed.size && !this.state.openGoalIds.length && observation.phase === 'shopping'
      && !endingActions.has(action.type) && !newlySelected)
      errors.push('After a real list read with no open task, select at least one currently displayed goal');

    if (basis.intent === 'task' || basis.intent === 'recover') {
      if (basis.goalId === null) errors.push(`${basis.intent} intent requires basis.goalId for the open task`);
    } else if (unboundIntents.has(basis.intent) && basis.goalId !== null)
      errors.push(`${basis.intent} intent must use basis.goalId=null without releasing pending tasks`);
    if (basis.goalId && !recoveringActions.has(action.type)
      && !basis.memoryUses?.some(use => use.goalId === basis.goalId && use.field === 'name'))
      errors.push(`Goal-directed ${basis.intent} action requires a name memoryUse for ${basis.goalId}`);
    for (const use of basis.memoryUses ?? []) if (use.goalId !== basis.goalId)
      errors.push(`memoryUses for ${use.goalId} must bind to the same non-null basis.goalId`);
    if (basis.goalId && !next.openGoalIds.includes(basis.goalId)) errors.push(`basis.goalId ${basis.goalId} must refer to an open task`);
    if (actorState.focusedGoalId && (!next.openGoalIds.includes(actorState.focusedGoalId)
      || actorState.focusedGoalId !== basis.goalId))
      errors.push('focusedGoalId must match basis.goalId for an open task (use null while attention is elsewhere)');
    if ((action.type === 'add' || action.type === 'remove') && basis.goalId
      && !basis.memoryUses?.some(use => use.goalId === basis.goalId && use.field === 'requiredQuantity'))
      errors.push(`Goal-directed ${action.type} requires a requiredQuantity memoryUse for ${basis.goalId}`);

    next.decisionIndex++;
    next.lastAction = { actionType: action.type, goalId: basis.goalId, decisionIndex: next.decisionIndex,
      ...('productId' in action ? { productId: action.productId } : {}),
      ...('quantity' in action ? { quantity: action.quantity } : {}),
      ...(observation.sequence !== undefined ? { observationSequence: observation.sequence } : {}) };
    if (!errors.length) this.pending = structuredClone(next);
    return { valid: !errors.length, errors, state: structuredClone(next), events: structuredClone(events) };
  }
  commit(): WholeTraceTaskState {
    if (!this.pending) throw new Error('Task memory commit requires a valid preview of an accepted action');
    this.state = this.pending; this.pending = undefined;
    return this.snapshot();
  }
}
