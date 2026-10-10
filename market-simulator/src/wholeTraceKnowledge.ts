import { validateLearning, type ConfirmedLearning } from './actorLearning';
import { actorChoices } from './actorChoices';
import type { ActorObservation, Persona, PolicyAction } from './types';
import { validateWholeTraceMemoryUses, type WholeTraceMemoryUse } from './wholeTraceCognition';

export const WHOLE_TRACE_INTENTS = ['explore', 'interest', 'task', 'check', 'recover', 'help', 'finish', 'rest'] as const;
/** A short declared activity and observable references, not private model reasoning. */
export type WholeTraceBasis = { intent: typeof WHOLE_TRACE_INTENTS[number]; cueRefs: string[]; memoryUses?: WholeTraceMemoryUse[]; goalId?: string | null };
export type WholeTraceKnowledgeCue = {
  cueRef: string; kind: string;
  source: 'current-observation' | 'observed-this-visit' | 'persona-history' | 'confirmed-prior-experience';
  value: unknown; firstObservedAt?: number; lastObservedAt?: number;
};
export type WholeTraceKnowledgeSnapshot = {
  schemaVersion: 'actor-knowledge-v1'; observationIndex: number;
  visibleCueRefs: string[]; rememberedCueRefs: string[]; profileCueRefs: string[];
  previousExperienceCueRefs: string[]; cues: WholeTraceKnowledgeCue[];
};

/** A control reference records that this action type is available in the current UI. */
export function wholeTraceControlCueRefs(action: PolicyAction): string[] {
  return [`control:${action.type}`];
}

/** Defaults remain the strict wire/legacy bound; only trusted composition may add generated proof slots. */
export type WholeTraceBasisValidationOptions = { maximumCueRefs?: number; allowMemoryUses?: boolean; allowTaskMemory?: boolean };
export function validateWholeTraceBasis(value: unknown, options: WholeTraceBasisValidationOptions = {}): { valid: boolean; errors: string[] } {
  const x = value as WholeTraceBasis;
  const errors: string[] = [];
  const maximumCueRefs = options.maximumCueRefs ?? 24;
  if (!Number.isInteger(maximumCueRefs) || maximumCueRefs < 1)
    return { valid: false, errors: ['maximumCueRefs must be a positive integer'] };
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.getPrototypeOf(x) !== Object.prototype)
    return { valid: false, errors: ['basis must be a JSON object'] };
  if (Object.keys(x).some(k => !['intent', 'cueRefs', ...(options.allowMemoryUses ? ['memoryUses'] : []), ...(options.allowTaskMemory ? ['goalId'] : [])].includes(k))) errors.push('Unknown basis field');
  if (options.allowTaskMemory && (!Object.hasOwn(x, 'goalId') || x.goalId !== null &&
    (typeof x.goalId !== 'string' || !x.goalId.trim() || x.goalId.length > 300)))
    errors.push('basis.goalId is required: an explicit goal reference or null for non-goal decisions');
  if (options.allowMemoryUses && x.memoryUses !== undefined)
    errors.push(...validateWholeTraceMemoryUses(x.memoryUses).errors);
  if (!WHOLE_TRACE_INTENTS.includes(x.intent)) errors.push('Unsupported basis intent');
  if (!Array.isArray(x.cueRefs) || x.cueRefs.length < 1 || x.cueRefs.length > maximumCueRefs
    || x.cueRefs.some(c => typeof c !== 'string' || !c.trim() || c.length > 300)
    || new Set(x.cueRefs).size !== x.cueRefs.length) errors.push(`basis.cueRefs must contain 1..${maximumCueRefs} distinct short references`);
  return { valid: errors.length === 0, errors };
}

/**
 * Actor information boundary for whole-trace planning. The only scene input is
 * TraceGuard.observeActor(): this module does not accept a map, shelf catalogue,
 * inventory, mission answer, navigation graph or model-authored memory.
 * Remembering a displayed fact does not establish comprehension or mastery.
 */
export class WholeTraceKnowledgeLedger {
  private observed = new Map<string, WholeTraceKnowledgeCue>();
  private profile = new Map<string, WholeTraceKnowledgeCue>();
  private prior = new Map<string, WholeTraceKnowledgeCue>();
  private visible = new Set<string>();
  private observationIndex = -1;
  private latest?: ActorObservation;

  constructor(persona: Pick<Persona, 'id' | 'version' | 'character'>, prior?: ConfirmedLearning) {
    const remember = (cueRef: string, kind: string, value: unknown) => this.profile.set(cueRef,
      { cueRef, kind, source: 'persona-history', value: structuredClone(value) });
    const character = persona.character;
    if (character) {
      remember('persona:goal', 'personal-goal', character.goal);
      for (const [key, kind, values] of [
        ['preference', 'personal-preference', character.preferences],
        ['strategy', 'practiced-strategy', character.practicedStrategies],
        ['trait', 'selected-trait', character.selectedTraits],
        ['strength', 'personal-strength', character.strengths],
        ['familiar-category', 'familiar-category', character.familiarCategories],
        ['familiar-product', 'familiar-product', character.familiarProductIds],
      ] as const) values.forEach((value, index) => remember(`persona:${key}:${index}`, kind, value));
    }
    if (prior) {
      validateLearning(prior);
      // Past episodes remain explicitly historical. They do not insert current
      // objective/product/location references, even if their labels overlap.
      prior.episodes.slice(-24).forEach((episode, offset) => {
        const index = Math.max(0, prior.episodes.length - 24) + offset;
        const cueRef = `prior:episode:${index}`;
        this.prior.set(cueRef, { cueRef, kind: 'historical-executed-episode',
          source: 'confirmed-prior-experience', value: structuredClone(episode) });
      });
    }
  }

  observe(o: ActorObservation): { knowledge: WholeTraceKnowledgeSnapshot; newCueRefs: string[] } {
    this.observationIndex++;
    this.latest = structuredClone(o);
    this.visible.clear();
    const newCueRefs: string[] = [];
    const see = (cueRef: string, kind: string, value: unknown) => {
      const previous = this.observed.get(cueRef);
      if (!previous) newCueRefs.push(cueRef);
      this.observed.set(cueRef, { cueRef, kind, value: structuredClone(value), source: 'current-observation',
        firstObservedAt: previous?.firstObservedAt ?? this.observationIndex, lastObservedAt: this.observationIndex });
      this.visible.add(cueRef);
    };
    see(`phase:${o.phase}`, 'phase', o.phase);
    see(`view:${o.view}`, 'view', o.view);
    // Controls are projected from the same state-bound choice list as the actor
    // interface. Keep their values limited to action types: target/product data
    // belongs to its own observed cue and cart contents remain separately gated.
    const availableControls = new Set(actorChoices(o).flatMap(choice => wholeTraceControlCueRefs(choice.action)));
    for (const cueRef of availableControls) see(cueRef, 'available-ui-control', { type: cueRef.slice('control:'.length) });
    if (o.listAvailable) see('list', 'displayed-list-control', true);
    for (const anchor of o.anchors) see(`anchor:${anchor.id}`, 'visible-passage', anchor);
    for (const station of o.visibleStations) see(`station:${station.id}`, 'visible-station', station);
    if (o.activeStation && !o.visibleStations.some(s => s.id === o.activeStation))
      see(`station:${o.activeStation}`, 'open-station', { id: o.activeStation });
    for (const product of o.products) see(`product:${product.id}`, 'displayed-product', product);
    if (o.shelf) {
      see('shelf', 'open-shelf-control', { stationId: o.activeStation, ...o.shelf });
      see(`shelf-page:${o.activeStation}`, 'displayed-shelf-page', o.shelf);
    }
    for (const objective of o.readObjectives ?? []) see(`objective:${objective.id}`, 'read-objective', objective);
    if (o.cart !== null) {
      see('cart', 'displayed-cart', o.cart);
      for (const [productId, quantity] of Object.entries(o.cart))
        see(`cart:product:${productId}`, 'displayed-cart-item', { productId, quantity });
    }
    for (const [id, available] of Object.entries(o.cashiers)) see(`cashier:${id}`, 'displayed-cashier-state', available);
    o.instructions?.lines.forEach((line, index) => see(`instruction:${o.instructions!.phase}:${index}`, 'displayed-instruction', line));
    o.supportText?.forEach((line, index) => see(`support:${index}`, 'displayed-help', line));
    if (o.result) see('result', 'observed-action-result', o.result);
    if (o.lastActionError) see('error', 'displayed-action-error', o.lastActionError);
    // Technical bounds, not a model of an adult's forgetting or attention span.
    for (const [kind, limit] of [['visible-passage', 256], ['visible-station', 64], ['displayed-product', 96]] as const) {
      const retained = [...this.observed.values()].filter(c => c.kind === kind)
        .sort((a, b) => (b.lastObservedAt ?? 0) - (a.lastObservedAt ?? 0) || a.cueRef.localeCompare(b.cueRef));
      for (const cue of retained.slice(limit)) if (!this.visible.has(cue.cueRef)) this.observed.delete(cue.cueRef);
    }
    return { knowledge: this.snapshot(), newCueRefs: newCueRefs.sort() };
  }

  snapshot(): WholeTraceKnowledgeSnapshot {
    const sorted = (refs: Iterable<string>) => [...refs].sort();
    const observed = [...this.observed.values()].map(c => ({ ...c,
      source: this.visible.has(c.cueRef) ? 'current-observation' as const : 'observed-this-visit' as const }));
    return structuredClone({ schemaVersion: 'actor-knowledge-v1', observationIndex: this.observationIndex,
      visibleCueRefs: sorted(this.visible), rememberedCueRefs: sorted([...this.observed.keys()].filter(r => !this.visible.has(r))),
      profileCueRefs: sorted(this.profile.keys()), previousExperienceCueRefs: sorted(this.prior.keys()),
      cues: [...observed, ...this.profile.values(), ...this.prior.values()].sort((a, b) => a.cueRef.localeCompare(b.cueRef)) });
  }

  assertBasis(value: WholeTraceBasis, action?: PolicyAction, options: WholeTraceBasisValidationOptions = {}): void {
    const shape = validateWholeTraceBasis(value, options);
    if (!shape.valid) throw Object.assign(new Error(shape.errors.join('; ')), { code: 'ACTOR_BASIS_SCHEMA' });
    const available = new Set([...this.observed.keys(), ...this.profile.keys(), ...this.prior.keys()]);
    for (const ref of value.cueRefs) if (!available.has(ref))
      throw Object.assign(new Error(`Unobserved actor basis reference: ${ref}`), { code: 'UNOBSERVED_ACTOR_BASIS' });
    const required = this.actionTargetRefs(action);
    if (required.length && !required.some(ref => value.cueRefs.includes(ref)))
      throw Object.assign(new Error(`Actor basis must reference the selected control: ${required.join(' or ')}`),
        { code: 'ACTOR_BASIS_TARGET_MISMATCH' });
  }

  private actionTargetRefs(action?: PolicyAction): string[] {
    if (!action) return [];
    if (action.type === 'walkToAnchor') return [`anchor:${action.anchorId}`];
    if (action.type === 'walkTo' || action.type === 'interact') return [`station:${action.station}`];
    if (action.type === 'add') return [`product:${action.productId}`];
    if (action.type === 'remove') return [`product:${action.productId}`, `cart:product:${action.productId}`];
    if (action.type === 'readList') return ['list'];
    if (action.type === 'browse') return ['shelf', `shelf-page:${this.latest?.activeStation}`];
    if (action.type === 'requestCashier') return [`cashier:${action.checkoutId ?? 'checkout'}`];
    if (action.type === 'checkout') return [`station:${action.checkoutId ?? 'checkout'}`];
    return [];
  }
}
