import type { ActorObservation, ActorObjective, Persona } from './types';

export const WHOLE_TRACE_GOAL_FIELDS = ['name', 'specification', 'requiredQuantity'] as const;
export type WholeTraceGoalField = typeof WHOLE_TRACE_GOAL_FIELDS[number];
export type WholeTraceMemoryValue = string | number;
export type WholeTraceMemoryUse = {
  goalId: string; field: WholeTraceGoalField;
  mode: 'remembered' | 'guess' | 'current-display'; value: WholeTraceMemoryValue;
};
export type WholeTraceMemoryUpdate = (
  | { type: 'selfRecall'; goalId: string; values: Partial<Record<WholeTraceGoalField, WholeTraceMemoryValue>> }
  | { type: 'deactivate'; goalId: string }
  | { type: 'uncertain'; goalId: string; fields: WholeTraceGoalField[] }
)[];
export type WholeTraceMemoryField = {
  value: WholeTraceMemoryValue | null; status: 'clear' | 'uncertain' | 'unavailable';
  pressure: number; ageMs: number; source: 'displayed-list' | 'self-recall' | null;
};
export type WholeTraceWorkingGoal = {
  goalId: string; fields: Record<WholeTraceGoalField, WholeTraceMemoryField>;
};
const RULES = {
  uncertainThreshold: .7, unavailableThreshold: 1.6,
  delayUnitMs: 60000, interestUnitMs: 12000, ambiguityUnitMs: 10000, countUnitMs: 16000,
  nameRetentionFactor: .45, specificationRetentionFactor: .9, quantityRetentionFactor: 1,
  familiarAmbiguityFactor: .55, selfRecallPressure: .7,
} as const;
export type WholeTraceCognitionProfile = {
  cognitionVersion: 'context-cognition-v1'; goalMemoryCapacity: number;
  sourceParameters: { switchMemoryDecay: number; confusionProbability: number; quantitySlipProbability: number };
  coefficients: { delay: number; interest: number; labelConfusion: number; countTracking: number };
  rules: typeof RULES; familiarProductIds: string[];
  interpretation: string;
};
export type WholeTraceCognitionState = {
  cognitionVersion: 'context-cognition-v1'; decisionIndex: number; processedTimeMs: number;
  /** Identity/field exposure metadata only: inactive goal values are never archived here. */
  knownGoalIds: string[]; knownGoalFields: Record<string, WholeTraceGoalField[]>;
  activeGoals: WholeTraceWorkingGoal[]; uncertainGoalIds: string[];
  /** A cart observation confirms purchased counts, never the requested quantity. */
  purchasedCounts: Record<string, number> | null;
  displayedProductSpecifications: { productId: string; specification: string | null }[];
  context: { activity: string | null; listAgeMs: number; interestRunMs: number;
    unreviewedQuantityChanges: number; ambiguityByGoal: Record<string, number> };
  lastResultKey: string | null;
};
export type WholeTraceCognitionActorState = {
  activity: string; heldGoalIds: string[]; uncertainGoalIds?: string[];
  focusedGoalId?: string | null; focusedProductId?: string | null; memoryUpdate?: WholeTraceMemoryUpdate;
};
export type WholeTraceCognitionEvent = {
  kind: 'list-read' | 'deactivated' | 'self-recall' | 'declared-uncertain' | 'decayed';
  goalId: string; fields: WholeTraceGoalField[];
};
export type WholeTraceCognitionPreview = {
  valid: boolean; errors: string[]; state: WholeTraceCognitionState; events: WholeTraceCognitionEvent[];
};

/** One rule source for the single model submission and independent post-submission replay. */
export const WHOLE_TRACE_COGNITION_INSTRUCTIONS = `Working memory is separate from the factual observation archive. In these rules cognitionProfile is shorthand for the supplied persona.behavior.cognition object. It is a fictional deterministic design, not a clinical probability model. Node recomputes it after the complete candidate is submitted. The offline authoring aid also reuses these execution checks for each supplied prefix and displays reference calculations before the next decision; it never fills or changes actor declarations. A full worldReference in the same model context cannot guarantee that hidden information had no influence.
Only heldGoalIds occupy active slots, at most cognitionProfile.goalMemoryCapacity. Removing a held goal deletes its working values; bringing its ID back never copies the archived list. Every goal field is {value,status:clear|uncertain|unavailable,pressure,ageMs,source}. Only an actual current readObjectives observation supplies exact name/requiredQuantity and an explicitly displayed specification; do not invent a specification from a product catalogue. A cart confirms purchasedCounts and a product detail confirms that product specification, never a forgotten requested quantity/specification.
actorState.memoryUpdate is optional: [{type:"selfRecall",goalId,values:{name?,specification?,requiredQuantity?}},{type:"uncertain",goalId,fields:["name","specification","requiredQuantity"]},{type:"deactivate",goalId}]. selfRecall supplies your own belief values for a previously read active goal, never reads the archive, and always produces uncertain fields. A deactivate goal must also be absent from heldGoalIds. Missing fields remain unavailable. Declared uncertain fields cannot be promoted to clear by recall or by an empty uncertainGoalIds array.
basis.memoryUses is an array (empty is allowed when no goal detail is used). Every entry is {goalId,field:"name|specification|requiredQuantity",mode:"remembered|guess|current-display",value}. value is REQUIRED: text for name/specification, integer 1..99 for requiredQuantity. remembered requires an active clear field and the same retained value. guess requires an active uncertain field and may supply a correct or mistaken value without a hidden-answer comparison. unavailable requires an explicit selfRecall or real list read first. current-display requires that exact field/value in the current actual readObjectives; prior archive, cart, products or help cannot substitute. Memory belief values never constrain the chosen action quantity or replace a selected product.
When focusedGoalId is non-null and activity is not interest, declare a name memoryUse for that focus goal. For an add/remove action under that focus, also declare its requiredQuantity memoryUse. The selected action quantity is not compared with that belief value or with the hidden task answer; a mistaken selection remains possible.
Time delta = max(0, observation.elapsedMs - previous processedTimeMs) + delayMs (without elapsedMs, use delayMs); processed time is monotonic. A newly displayed list resets its held fields to the displayed values, pressure 0 and age 0. Other fields accumulate pressure: retention = delta/${RULES.delayUnitMs} * profile.coefficients.delay; add delta/${RULES.interestUnitMs} * profile.coefficients.interest when this or the previous activity is interest. Apply retention factor name=${RULES.nameRetentionFactor}, specification=${RULES.specificationRetentionFactor}, requiredQuantity=${RULES.quantityRetentionFactor}. Related currently displayed product names sharing the remembered name's last word give ambiguity=min(3,relatedProductCount-1). Add delayMs/${RULES.ambiguityUnitMs} * profile.coefficients.labelConfusion * ambiguity to name/specification, multiplied by ${RULES.familiarAmbiguityFactor} when a related displayed product is personally familiar. Add delayMs/${RULES.countUnitMs} * profile.coefficients.countTracking * ((remembered requiredQuantity>1?1:0)+unreviewedQuantityChanges/3) to requiredQuantity. Accepted add/remove results increase unreviewedQuantityChanges by their quantity once; a real list/cart observation resets that counter. Thresholds: pressure>=${RULES.unavailableThreshold} deletes value and makes unavailable; otherwise pressure>=${RULES.uncertainThreshold} makes uncertain. Unavailable fields never automatically restore. selfRecall starts at pressure ${RULES.selfRecallPressure} and remains uncertain. Apply updates after deterministic decay, then validate memoryUses.
uncertainGoalIds must include every active goal whose name or requiredQuantity is uncertain/unavailable, or whose actually previously displayed specification is uncertain/unavailable. An undisplayed specification is excluded. Extra uncertainty annotations are allowed and never restore a field. These rules require coherent declared memory, not mistakes, detours, help quotas or a correct basket.`;

function plain(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
}
function ref(x: unknown): x is string { return typeof x === 'string' && !!x.trim() && x.length <= 300; }
function field(x: unknown): x is WholeTraceGoalField { return WHOLE_TRACE_GOAL_FIELDS.includes(x as WholeTraceGoalField); }
function validValue(key: WholeTraceGoalField, value: unknown): value is WholeTraceMemoryValue {
  return key === 'requiredQuantity' ? Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 99
    : typeof value === 'string' && !!value.trim() && value.length <= 300;
}
export function validateWholeTraceMemoryUses(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [], used = new Set<string>();
  if (!Array.isArray(value) || value.length > 24) return { valid: false, errors: ['basis.memoryUses must be an array of at most 24 field uses'] };
  value.forEach((x, index) => {
    const at = `basis.memoryUses[${index}]`;
    if (!plain(x)) { errors.push(`${at} must be a JSON object`); return; }
    if (Object.keys(x).some(key => !['goalId', 'field', 'mode', 'value'].includes(key))) errors.push(`${at}: unknown field`);
    if (!ref(x.goalId)) errors.push(`${at}: invalid goalId`);
    if (!field(x.field)) errors.push(`${at}: invalid goal field`);
    if (!['remembered', 'guess', 'current-display'].includes(x.mode as string)) errors.push(`${at}: invalid memory mode`);
    if (field(x.field) && !validValue(x.field, x.value)) errors.push(`${at}: value is required and must match its field type`);
    const key = `${x.goalId}:${x.field}`;
    if (used.has(key)) errors.push(`${at}: duplicate goal field use`);
    used.add(key);
  });
  return { valid: !errors.length, errors };
}
export function validateWholeTraceMemoryUpdate(value: unknown): { valid: boolean; errors: string[] } {
  if (value === undefined) return { valid: true, errors: [] };
  const errors: string[] = [], touched = new Set<string>();
  if (!Array.isArray(value) || value.length > 24) return { valid: false, errors: ['actorState.memoryUpdate must be an array of at most 24 updates'] };
  value.forEach((x, index) => {
    const at = `actorState.memoryUpdate[${index}]`;
    if (!plain(x)) { errors.push(`${at} must be a JSON object`); return; }
    if (!ref(x.goalId)) errors.push(`${at}: invalid goalId`);
    const allowed = x.type === 'selfRecall' ? ['type', 'goalId', 'values'] : x.type === 'uncertain' ? ['type', 'goalId', 'fields'] : ['type', 'goalId'];
    if (Object.keys(x).some(key => !allowed.includes(key))) errors.push(`${at}: unknown field`);
    let keys: WholeTraceGoalField[] = [];
    if (x.type === 'selfRecall') {
      if (!plain(x.values) || !Object.keys(x.values).length) errors.push(`${at}: selfRecall requires nonempty values`);
      else for (const [key, item] of Object.entries(x.values)) {
        if (!field(key) || !validValue(key, item)) errors.push(`${at}: invalid recalled field/value ${key}`);
        else keys.push(key);
      }
    } else if (x.type === 'uncertain') {
      if (!Array.isArray(x.fields) || !x.fields.length || x.fields.length > 3 || x.fields.some(key => !field(key)) || new Set(x.fields).size !== x.fields.length)
        errors.push(`${at}: uncertain requires 1..3 distinct goal fields`);
      else keys = x.fields as WholeTraceGoalField[];
    } else if (x.type === 'deactivate') keys = [...WHOLE_TRACE_GOAL_FIELDS];
    else errors.push(`${at}: unsupported memory update`);
    for (const key of keys) {
      const target = `${x.goalId}:${key}`;
      if (touched.has(target)) errors.push(`${at}: conflicting update for ${target}`);
      touched.add(target);
    }
  });
  return { valid: !errors.length, errors };
}

function probability(value: number | undefined, name: string): number {
  const result = value ?? 0;
  if (!Number.isFinite(result) || result < 0 || result > 1) throw new Error(`${name} must be a synthetic design setting in 0..1`);
  return result;
}
export function buildWholeTraceCognitionProfile(persona: Pick<Persona, 'attention' | 'parameters' | 'character'>): WholeTraceCognitionProfile {
  const goalMemoryCapacity = persona.attention?.goalMemoryCapacity ?? 2;
  if (!Number.isInteger(goalMemoryCapacity) || goalMemoryCapacity < 1 || goalMemoryCapacity > 24) throw new Error('goalMemoryCapacity must be 1..24');
  const sourceParameters = {
    switchMemoryDecay: probability(persona.attention?.switchMemoryDecay, 'switchMemoryDecay'),
    confusionProbability: probability(persona.parameters.confusionProbability, 'confusionProbability'),
    quantitySlipProbability: probability(persona.parameters.quantitySlipProbability, 'quantitySlipProbability'),
  };
  return {
    cognitionVersion: 'context-cognition-v1', goalMemoryCapacity, sourceParameters,
    coefficients: { delay: .04 + sourceParameters.switchMemoryDecay, interest: 6 * sourceParameters.switchMemoryDecay,
      labelConfusion: sourceParameters.confusionProbability, countTracking: sourceParameters.quantitySlipProbability },
    rules: { ...RULES }, familiarProductIds: [...(persona.character?.familiarProductIds ?? [])],
    interpretation: 'Original synthetic settings become deterministic context-pressure coefficients, not Bernoulli error rates, human memory measurements or mandatory mistakes. Actions and belief correctness are never changed.',
  };
}
function emptyField(): WholeTraceMemoryField { return { value: null, status: 'unavailable', pressure: 0, ageMs: 0, source: null }; }
function emptyGoal(goalId: string): WholeTraceWorkingGoal {
  return { goalId, fields: { name: emptyField(), specification: emptyField(), requiredQuantity: emptyField() } };
}
function initialState(): WholeTraceCognitionState {
  return { cognitionVersion: 'context-cognition-v1', decisionIndex: -1, processedTimeMs: 0,
    knownGoalIds: [], knownGoalFields: {}, activeGoals: [], uncertainGoalIds: [], purchasedCounts: null,
    displayedProductSpecifications: [], lastResultKey: null,
    context: { activity: null, listAgeMs: 0, interestRunMs: 0, unreviewedQuantityChanges: 0, ambiguityByGoal: {} } };
}
/** The existing actor projection has no implicit target specification. This optional field must actually be displayed. */
type DisplayedGoal = ActorObjective & { specification?: string };
function displayedValue(goal: DisplayedGoal | undefined, key: WholeTraceGoalField): WholeTraceMemoryValue | undefined {
  if (!goal) return undefined;
  return key === 'name' ? goal.label : key === 'requiredQuantity' ? goal.quantity
    : typeof goal.specification === 'string' && goal.specification.trim() ? goal.specification : undefined;
}
function relatedProducts(name: WholeTraceMemoryValue | null, products: ActorObservation['products']) {
  if (typeof name !== 'string') return [];
  const token = name.trim().split(/\s+/).at(-1)!;
  return products.filter(product => product.name.includes(token));
}
function rounded(value: number): number { return Math.round(value * 1000000) / 1000000; }

/**
 * Pure preview of one virtual pre-action frame. No factual ledger, world catalogue,
 * task answer, random generator or action correction is accepted by this engine.
 * commit() is called only after the unchanged actor action was accepted.
 */
export class WholeTraceCognitionEngine {
  private state = initialState();
  private pending?: WholeTraceCognitionState;
  readonly profile: WholeTraceCognitionProfile;
  constructor(profile: WholeTraceCognitionProfile) {
    this.profile = structuredClone(profile);
    if (profile.cognitionVersion !== 'context-cognition-v1' || !Number.isInteger(profile.goalMemoryCapacity)
      || profile.goalMemoryCapacity < 1 || profile.goalMemoryCapacity > 24) throw new Error('Invalid whole-trace cognition profile');
    for (const [name, coefficient] of Object.entries(profile.coefficients))
      if (!Number.isFinite(coefficient) || coefficient < 0) throw new Error(`Invalid cognition coefficient ${name}`);
    if (JSON.stringify(profile.rules) !== JSON.stringify(RULES)) throw new Error('Unsupported whole-trace cognition rules');
    Object.freeze(this.profile.sourceParameters); Object.freeze(this.profile.coefficients);
    Object.freeze(this.profile.rules); Object.freeze(this.profile.familiarProductIds); Object.freeze(this.profile);
  }
  snapshot(): WholeTraceCognitionState { return structuredClone(this.state); }
  preview(observation: ActorObservation, actorState: WholeTraceCognitionActorState,
    memoryUses: readonly WholeTraceMemoryUse[] = [], delayMs = 1): WholeTraceCognitionPreview {
    return this.evaluate(observation, actorState, memoryUses, delayMs, false);
  }
  /** Reference calculation only: carries current slots, never supplies an actor declaration. */
  project(observation: ActorObservation, context?: { activity: string; delayMs: number }): WholeTraceCognitionState {
    return this.evaluate(observation, { activity: context?.activity ?? this.state.context.activity ?? 'orient',
      heldGoalIds: this.state.activeGoals.map(goal => goal.goalId), uncertainGoalIds: this.state.uncertainGoalIds },
      [], context?.delayMs ?? 0, true).state;
  }
  private evaluate(observation: ActorObservation, actorState: WholeTraceCognitionActorState,
    memoryUses: readonly WholeTraceMemoryUse[], delayMs: number, projection: boolean): WholeTraceCognitionPreview {
    if (!projection) this.pending = undefined;
    const next = structuredClone(this.state), errors: string[] = [], events: WholeTraceCognitionEvent[] = [];
    const useCheck = validateWholeTraceMemoryUses(memoryUses), updateCheck = validateWholeTraceMemoryUpdate(actorState.memoryUpdate);
    errors.push(...useCheck.errors, ...updateCheck.errors);
    if (!Array.isArray(actorState.heldGoalIds) || actorState.heldGoalIds.some(id => !ref(id))
      || new Set(actorState.heldGoalIds).size !== actorState.heldGoalIds.length) errors.push('heldGoalIds must contain distinct short references');
    if (actorState.heldGoalIds?.length > this.profile.goalMemoryCapacity) errors.push(`Working memory exceeds goalMemoryCapacity (${this.profile.goalMemoryCapacity})`);
    if (actorState.uncertainGoalIds !== undefined && (!Array.isArray(actorState.uncertainGoalIds)
      || actorState.uncertainGoalIds.some(id => !ref(id)) || new Set(actorState.uncertainGoalIds).size !== actorState.uncertainGoalIds.length)) errors.push('uncertainGoalIds must contain distinct short references');
    if (!Number.isInteger(delayMs) || delayMs < (projection ? 0 : 1) || delayMs > 120000) errors.push('Cognition delayMs must be 1..120000');
    if (errors.length) return { valid: false, errors, state: next, events };

    const held = new Set(actorState.heldGoalIds);
    const displayed = new Map((observation.readObjectives ?? []).map(goal => [goal.id, goal as DisplayedGoal]));
    for (const [goalId, goal] of displayed) {
      if (!next.knownGoalIds.includes(goalId)) next.knownGoalIds.push(goalId);
      next.knownGoalFields[goalId] = [...new Set([...(next.knownGoalFields[goalId] ?? []),
        ...WHOLE_TRACE_GOAL_FIELDS.filter(key => displayedValue(goal, key) !== undefined)])];
    }
    next.knownGoalIds.sort();
    for (const goalId of held) if (!next.knownGoalIds.includes(goalId)) errors.push(`Working memory cannot introduce unread goal ${goalId}`);
    for (const goalId of actorState.uncertainGoalIds ?? []) if (!next.knownGoalIds.includes(goalId)) errors.push(`Uncertainty cannot introduce unread goal ${goalId}`);
    // Unknown wire references must return diagnostics before touching keyed goal metadata.
    if (errors.length) return { valid: false, errors, state: next, events };
    for (const previous of next.activeGoals.filter(goal => !held.has(goal.goalId))) events.push({ kind: 'deactivated', goalId: previous.goalId, fields: [...WHOLE_TRACE_GOAL_FIELDS] });
    next.activeGoals = actorState.heldGoalIds.map(goalId => next.activeGoals.find(goal => goal.goalId === goalId) ?? emptyGoal(goalId));
    if (actorState.focusedGoalId && !held.has(actorState.focusedGoalId)) errors.push('Focused goal must occupy an active working-memory slot');

    const observedTime = observation.elapsedMs !== undefined && Number.isFinite(observation.elapsedMs)
      ? Math.max(next.processedTimeMs, observation.elapsedMs) : next.processedTimeMs;
    const deltaMs = observedTime - next.processedTimeMs + delayMs;
    next.processedTimeMs = observedTime + delayMs;
    const interest = actorState.activity === 'interest' || next.context.activity === 'interest';
    next.context.interestRunMs = interest ? next.context.interestRunMs + deltaMs : 0;
    next.context.listAgeMs = displayed.size ? 0 : next.context.listAgeMs + deltaMs;
    const result = observation.result;
    const resultKey = result ? JSON.stringify([observation.sequence ?? observation.elapsedMs ?? next.decisionIndex + 1, result]) : null;
    if (result?.accepted && resultKey !== next.lastResultKey && (result.actionType === 'add' || result.actionType === 'remove'))
      next.context.unreviewedQuantityChanges += result.quantity ?? 1;
    next.lastResultKey = resultKey;
    if (displayed.size || observation.cart !== null) next.context.unreviewedQuantityChanges = 0;
    if (observation.cart !== null) next.purchasedCounts = structuredClone(observation.cart);
    next.displayedProductSpecifications = observation.products.map(product => ({ productId: product.id, specification: product.detail ?? null }));
    next.context.ambiguityByGoal = {};

    for (const goal of next.activeGoals) {
      const readGoal = displayed.get(goal.goalId), refreshed: WholeTraceGoalField[] = [];
      for (const key of WHOLE_TRACE_GOAL_FIELDS) {
        const value = displayedValue(readGoal, key);
        if (value !== undefined) {
          goal.fields[key] = { value, status: 'clear', pressure: 0, ageMs: 0, source: 'displayed-list' };
          refreshed.push(key);
        }
      }
      if (refreshed.length) events.push({ kind: 'list-read', goalId: goal.goalId, fields: refreshed });
      const related = relatedProducts(goal.fields.name.value, observation.products);
      const ambiguity = Math.min(3, Math.max(0, related.length - 1));
      next.context.ambiguityByGoal[goal.goalId] = ambiguity;
      const familiarity = related.some(product => this.profile.familiarProductIds.includes(product.id)) ? RULES.familiarAmbiguityFactor : 1;
      const retention = deltaMs / RULES.delayUnitMs * this.profile.coefficients.delay
        + (interest ? deltaMs / RULES.interestUnitMs * this.profile.coefficients.interest : 0);
      const labelPressure = delayMs / RULES.ambiguityUnitMs * this.profile.coefficients.labelConfusion * ambiguity * familiarity;
      const quantityLoad = (Number(goal.fields.requiredQuantity.value) > 1 ? 1 : 0) + next.context.unreviewedQuantityChanges / 3;
      const countPressure = delayMs / RULES.countUnitMs * this.profile.coefficients.countTracking * quantityLoad;
      const changed: WholeTraceGoalField[] = [];
      for (const key of WHOLE_TRACE_GOAL_FIELDS) {
        const remembered = goal.fields[key];
        if (refreshed.includes(key) || remembered.status === 'unavailable') continue;
        const factor = key === 'name' ? RULES.nameRetentionFactor : key === 'specification' ? RULES.specificationRetentionFactor : RULES.quantityRetentionFactor;
        remembered.ageMs += deltaMs;
        remembered.pressure = rounded(remembered.pressure + retention * factor + (key === 'requiredQuantity' ? countPressure : labelPressure));
        const old = remembered.status;
        if (remembered.pressure >= RULES.unavailableThreshold) { remembered.value = null; remembered.status = 'unavailable'; }
        else if (remembered.pressure >= RULES.uncertainThreshold) remembered.status = 'uncertain';
        if (old !== remembered.status) changed.push(key);
      }
      if (changed.length) events.push({ kind: 'decayed', goalId: goal.goalId, fields: changed });
    }

    for (const update of actorState.memoryUpdate ?? []) {
      const active = next.activeGoals.find(goal => goal.goalId === update.goalId);
      if (!next.knownGoalIds.includes(update.goalId)) { errors.push(`Memory update cannot introduce unread goal ${update.goalId}`); continue; }
      if (update.type === 'deactivate') {
        if (held.has(update.goalId)) errors.push(`Deactivated goal ${update.goalId} must be removed from heldGoalIds`);
        continue;
      }
      if (!active) { errors.push(`Memory update requires an active slot for ${update.goalId}`); continue; }
      const keys = update.type === 'selfRecall' ? Object.keys(update.values) as WholeTraceGoalField[] : update.fields;
      for (const key of keys) {
        if (!next.knownGoalFields[update.goalId]?.includes(key)) { errors.push(`Never-displayed goal field ${update.goalId}.${key} cannot be recalled or annotated`); continue; }
        const remembered = active.fields[key];
        if (update.type === 'selfRecall') active.fields[key] = { value: update.values[key]!, status: 'uncertain', pressure: RULES.selfRecallPressure, ageMs: 0, source: 'self-recall' };
        else if (remembered.status === 'unavailable') errors.push(`Unavailable field ${update.goalId}.${key} needs explicit belief values or a real list read`);
        else { remembered.status = 'uncertain'; remembered.pressure = Math.max(remembered.pressure, RULES.uncertainThreshold); }
      }
      events.push({ kind: update.type === 'selfRecall' ? 'self-recall' : 'declared-uncertain', goalId: update.goalId, fields: keys });
    }
    next.uncertainGoalIds = next.activeGoals.filter(goal => (next.knownGoalFields[goal.goalId] ?? ['name', 'requiredQuantity'])
      .some(key => goal.fields[key].status !== 'clear')).map(goal => goal.goalId);
    for (const goalId of next.uncertainGoalIds) if (!(actorState.uncertainGoalIds ?? []).includes(goalId)) {
      const goal = next.activeGoals.find(goal => goal.goalId === goalId)!;
      const previous = this.state.activeGoals.find(goal => goal.goalId === goalId);
      const evidence = (next.knownGoalFields[goalId] ?? ['name', 'requiredQuantity']).filter(key => goal.fields[key].status !== 'clear')
        .map(key => `${goalId}.${key} pressure ${previous?.fields[key].pressure ?? 0}→${goal.fields[key].pressure}, threshold ${RULES.uncertainThreshold} (${goal.fields[key].status})`);
      errors.push(`actorState.uncertainGoalIds must include ${goalId}: working goal fields are uncertain or unavailable; ${evidence.join('; ')}`);
    }

    for (const use of memoryUses) {
      if (use.mode === 'current-display') {
        const value = displayedValue(displayed.get(use.goalId), use.field);
        if (value === undefined || value !== use.value) errors.push(`No current displayed list field/value for ${use.goalId}.${use.field}`);
        continue;
      }
      const active = next.activeGoals.find(goal => goal.goalId === use.goalId);
      if (!active) { errors.push(`Memory use ${use.goalId}.${use.field} exceeds active working-memory access`); continue; }
      const remembered = active.fields[use.field];
      if (use.mode === 'remembered' && (remembered.status !== 'clear' || remembered.value !== use.value))
        errors.push(`remembered use ${use.goalId}.${use.field} requires a clear retained matching value`);
      if (use.mode === 'guess' && remembered.status !== 'uncertain')
        errors.push(`guess use ${use.goalId}.${use.field} requires an uncertain active field (selfRecall first if unavailable)`);
    }
    next.context.activity = actorState.activity;
    next.decisionIndex++;
    if (!errors.length && !projection) this.pending = structuredClone(next);
    return { valid: !errors.length, errors, state: structuredClone(next), events: structuredClone(events) };
  }
  commit(): WholeTraceCognitionState {
    if (!this.pending) throw new Error('Cognition commit requires a valid preview of an accepted action');
    this.state = this.pending; this.pending = undefined;
    return this.snapshot();
  }
}
