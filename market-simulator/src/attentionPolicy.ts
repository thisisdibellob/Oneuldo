import { Random } from './random';
import type { ActorAnchor, ActorDirection, ActorObjective, ActorObservation, ActorProduct, ActorStation,
  AttentionExperience, AttentionFocus, AttentionMemory, AttentionProfile, Decision, Persona, PolicyAction, ShoppingStyle } from './types';

type GoalMemory = ActorObjective & { confidence: number };
type StationMemory = AttentionMemory['stations'][number];
type AnchorMemory = { id: string; neighbors: Set<string>; visits: number };
const directions: ActorDirection[] = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const clean = (s: string) => s.replace(/\s/g, '').replace(/낱개|신선한/g, '');
const familyName = (s: string) => clean(s).replace(/작은|큰/g, '').replace(/계란|특란|왕란/g, '달걀').replace(/요구르트/g, '요거트');
const matches = (p: ActorProduct, goal: ActorObjective) => goal.match === 'exact'
  ? clean(p.name) === clean(goal.label)
  : (!categoryFor(goal.label) || categoryFor(goal.label) === p.categoryId) && familyName(p.name).includes(familyName(goal.label));
const related = (p: ActorProduct, goal: ActorObjective) => matches(p, goal)
  || clean(p.name).includes(clean(goal.label.split(' ').at(-1)!));
function categoryFor(label: string): string | undefined {
  if (/카레|라면|즉석밥|만두|미역국|피자|죽|우동|참치|스파게티/.test(label)) return 'meal';
  if (/주스|콜라|음료|커피|두유|탄산|생수|차$/.test(label)) return 'drink';
  if (/우유|달걀|계란|두부|치즈|요거트|버터|햄|닭|맛살|어묵/.test(label)) return 'fresh';
  if (/사과|배$|딸기|토마토|감자|포도|수박|오이|당근|양파|귤|복숭아|레몬|오렌지|브로콜리|키위|바나나/.test(label)) return 'produce';
  if (/슬리퍼|욕실화|건전지|충전|세제|수세미|문구/.test(label)) return 'household';
  return undefined;
}

export function validateAttentionProfile(p: AttentionProfile): void {
  if (p.version !== '1') throw new Error('Unsupported attention profile version.');
  for (const key of ['captureProbability', 'interestPurchaseProbability', 'resumeProbability', 'switchMemoryDecay'] as const) {
    if (!Number.isFinite(p[key]) || p[key] < 0 || p[key] > 1) throw new Error(`attention.${key} must be 0..1.`);
  }
  for (const key of ['minimumInterestActions', 'maximumInterestActions', 'goalMemoryCapacity', 'spatialMemoryCapacity', 'firstPlayOrientationActions'] as const) {
    if (!Number.isInteger(p[key]) || p[key] < (key === 'firstPlayOrientationActions' ? 0 : 1)) throw new Error(`Invalid attention.${key}.`);
  }
  if (p.maximumInterestActions < p.minimumInterestActions || p.spatialMemoryCapacity < 4) throw new Error('Invalid attention memory/dwell limits.');
  for (const map of [p.interestProductWeights, p.interestCategoryWeights]) {
    if (!map || Object.values(map).some(n => !Number.isFinite(n) || n < 0)) throw new Error('Interest weights must be finite and nonnegative.');
  }
}

export function validateShoppingStyle(style: ShoppingStyle): void {
  for (const key of ['comparisonProbability', 'listCheckAfterSelectionProbability', 'preCheckoutCheckProbability',
    'familiarShortcutProbability', 'headingPersistence'] as const) {
    if (!Number.isFinite(style[key]) || style[key] < 0 || style[key] > 1) throw new Error(`shoppingStyle.${key} must be 0..1.`);
  }
  if (!Number.isInteger(style.maxComparisonPages) || style.maxComparisonPages < 1 || style.maxComparisonPages > 4)
    throw new Error('shoppingStyle.maxComparisonPages must be 1..4.');
}

/** Validate the import boundary before remembered fields can enter an LLM observation.
 * This checks representation, not whether the supplied experience really occurred.
 */
export function validateAttentionMemory(value: unknown): asserts value is AttentionMemory {
  let stringCharacters = 0;
  const fail = (path: string): never => { throw new Error(`Invalid attention memory artifact: ${path}.`); };
  const object = (input: unknown, path: string, required: string[], optional: string[] = []): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail(path);
    const allowed = new Set([...required, ...optional]);
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || !allowed.has(key)) return fail(`${path}: unsupported field`);
      const property = Object.getOwnPropertyDescriptor(input, key)!;
      if (!('value' in property)) return fail(`${path}.${key}: expected a JSON value`);
    }
    if (required.some(key => !Object.prototype.hasOwnProperty.call(input, key))) return fail(`${path}: missing field`);
    return input as Record<string, unknown>;
  };
  const array = (input: unknown, path: string, max: number): unknown[] => {
    if (!Array.isArray(input) || input.length > max) return fail(`${path}: invalid array size`);
    // A sparse/custom array is not a JSON array produced by getMemory().
    if (Reflect.ownKeys(input).length !== input.length + 1) return fail(path);
    for (let index = 0; index < input.length; index++) {
      const property = Object.getOwnPropertyDescriptor(input, String(index));
      if (!property || !('value' in property)) return fail(path);
    }
    return input;
  };
  const string = (input: unknown, path: string, max = 200, allowEmpty = false) => {
    if (typeof input !== 'string' || (!allowEmpty && !input.trim()) || input.length > max) fail(path);
    // Stop oversized graphs before allocating their complete serialized representation.
    stringCharacters += JSON.stringify(input).length;
    if (stringCharacters > 250000) fail('memory: exceeds serialized size limit');
  };
  const count = (input: unknown, path: string) => { if (!Number.isSafeInteger(input) || (input as number) < 0) fail(path); };
  const unique = (items: unknown[], path: string) => { if (new Set(items).size !== items.length) fail(`${path}: duplicate entries`); };
  const memory = object(value, 'memory', ['version', 'stations', 'anchors', 'knownProducts', 'controlsPracticed']);
  if (memory.version !== '1') fail('memory.version');
  const stations = array(memory.stations, 'memory.stations', 256);
  const stationIds: unknown[] = [];
  for (const [i, input] of stations.entries()) {
    const path = `memory.stations[${i}]`;
    const station = object(input, path, ['id', 'label', 'kind', 'visits'], ['anchorId']);
    string(station.id, `${path}.id`); string(station.label, `${path}.label`, 500);
    if (!['shelf', 'employee', 'checkout', 'entrance', 'exit', 'common-door'].includes(station.kind as string)) fail(`${path}.kind`);
    count(station.visits, `${path}.visits`);
    if (station.anchorId !== undefined) string(station.anchorId, `${path}.anchorId`);
    stationIds.push(station.id);
  }
  unique(stationIds, 'memory.stations');
  const anchors = array(memory.anchors, 'memory.anchors', 2048);
  const anchorIds: unknown[] = [];
  for (const [i, input] of anchors.entries()) {
    const path = `memory.anchors[${i}]`;
    const anchor = object(input, path, ['id', 'neighbors', 'visits']);
    string(anchor.id, `${path}.id`); count(anchor.visits, `${path}.visits`);
    const neighbors = array(anchor.neighbors, `${path}.neighbors`, 2048);
    neighbors.forEach((id, j) => string(id, `${path}.neighbors[${j}]`));
    unique(neighbors, `${path}.neighbors`); anchorIds.push(anchor.id);
  }
  unique(anchorIds, 'memory.anchors');
  const products = array(memory.knownProducts, 'memory.knownProducts', 1024);
  const productIds: unknown[] = [];
  for (const [i, input] of products.entries()) {
    const path = `memory.knownProducts[${i}]`;
    const product = object(input, path, ['id', 'categoryId', 'name', 'price', 'stock'], ['detail']);
    string(product.id, `${path}.id`); string(product.categoryId, `${path}.categoryId`);
    string(product.name, `${path}.name`, 500);
    if (product.detail !== undefined) string(product.detail, `${path}.detail`, 1000, true);
    if (typeof product.price !== 'number' || !Number.isFinite(product.price) || product.price < 0) fail(`${path}.price`);
    count(product.stock, `${path}.stock`); productIds.push(product.id);
  }
  unique(productIds, 'memory.knownProducts');
  const controls = array(memory.controlsPracticed, 'memory.controlsPracticed', 32);
  const controlTypes: PolicyAction['type'][] = ['interact', 'add', 'remove', 'requestReturn', 'checkout', 'requestCashier',
    'submit', 'retry', 'giveUp', 'skipRating', 'closeStation', 'viewCart', 'viewHelp', 'closeView', 'rate',
    'walkTo', 'walkToAnchor', 'readList', 'pause', 'lookAround', 'browse'];
  controls.forEach((control, i) => { if (!controlTypes.includes(control as PolicyAction['type'])) fail(`memory.controlsPracticed[${i}]`); });
  unique(controls, 'memory.controlsPracticed');
  if (JSON.stringify(value).length > 250000) fail('memory: exceeds serialized size limit');
}

/** Owns perceived goals and discoveries. This policy never receives the raw game observation. */
export class AttentionPolicy {
  private readonly profile: AttentionProfile;
  private readonly attentionRandom: Random;
  private readonly choiceRandom: Random;
  private readonly timingRandom: Random;
  private readonly memoryRandom: Random;
  private focus: AttentionFocus = 'orient';
  private goals: GoalMemory[] = [];
  private hasReadList = false;
  private moreGoals = false;
  private goalActivation = 0;
  private readonly stations = new Map<string, StationMemory>();
  private readonly anchors = new Map<string, AnchorMemory>();
  private readonly products = new Map<string, ActorProduct>();
  private readonly controls = new Set<string>();
  private basket: Record<string, number> = {};
  private currentNode = 'entry';
  private previousNode: string | null = null;
  private readonly stationBearings = new Map<string, { node: string; direction: ActorDirection }>();
  private targetStation: string | null = null;
  private followingSign: { stationId: string; direction: ActorDirection; unseenSteps: number } | null = null;
  private interestStation: string | null = null;
  private interestProduct: string | null = null;
  private interestActions = 0;
  private interestPurchased = false;
  private readonly satiated = new Set<string>();
  private readonly evaluatedCues = new Set<string>();
  private readonly shelfPages = new Map<string, Set<number>>();
  private readonly productPages = new Map<string, { station: string; page: number }>();
  private orientationRemaining: number;
  private heading: ActorDirection;
  private lastObserved?: ActorObservation;
  private lastSequence?: number;
  private lastDecision?: Decision;
  private additionsSinceRead = 0;
  private disengagements = 0;
  private searchWithoutProgress = 0;
  private readonly rejected = new Map<string, number>();
  private readonly cashierMemory = new Map<string, boolean>();
  private checkoutNeedsStaff: 'checkout' | 'checkout-2' | null = null;
  private stress = 0;
  private confidence = .6;
  private support = 0;
  private failures = 0;
  private consecutiveErrors = 0;
  private successfulSteps = 0;
  private unreviewedChanges = 0;
  private disengagedSteps = 0;
  private readonly handled = new Map<string, number>();
  private readonly claimed = new Map<string, string>();
  private mistakenQuantity: { id: string; quantity: number } | null = null;
  private readonly consideredChecks = new Set<string>();
  private readonly consideredHelp = new Set<string>();
  private readonly contextualRandom: Random;
  private readonly styleRandom: Random;
  private readonly comparisons = new Map<string, { pages: Set<number>; finished: boolean; preferredId?: string }>();
  private readonly shortcutDecisions = new Set<string>();
  private readonly listChecks = new Set<number>();
  private readonly checkoutChecks = new Set<number>();
  private readonly unavailableGoals = new Set<string>();
  private readonly approachAttempts = new Map<string, Map<string, number>>();
  private readonly searchedShelves = new Map<string, Set<string>>();
  private readonly intentionalPurchases: Record<string, number> = {};
  private readonly corrections = new Map<string, { quantity: number; useHelp: boolean }>();
  private readonly correctionChecks = new Set<number>();

  constructor(private readonly persona: Persona, seed: string | number, private readonly experience: AttentionExperience = { visit: 'first-play' }) {
    if (!persona.attention) throw new Error('AttentionPolicy requires an attention profile.');
    validateAttentionProfile(persona.attention);
    if (persona.shoppingStyle) validateShoppingStyle(persona.shoppingStyle);
    if (!['first-play', 'revisit'].includes(experience.visit)) throw new Error('Attention experience must identify first-play or revisit.');
    if (experience.visit === 'revisit' && !experience.memory) throw new Error('Revisit requires memory from a previous recorded policy experience.');
    if (experience.memory !== undefined) validateAttentionMemory(experience.memory);
    this.profile = persona.attention;
    this.attentionRandom = new Random(`${seed}:attention:${persona.id}:${persona.version}`);
    this.choiceRandom = new Random(`${seed}:choice:${persona.id}:${persona.version}`);
    this.timingRandom = new Random(`${seed}:timing:${persona.id}:${persona.version}`);
    this.contextualRandom = new Random(`${seed}:context:${persona.id}:${persona.version}`);
    this.memoryRandom = new Random(`${seed}:memory:${persona.id}:${persona.version}`);
    this.styleRandom = new Random(`${seed}:shopping-style:${persona.id}:${persona.version}`);
    this.orientationRemaining = experience.visit === 'first-play' ? this.profile.firstPlayOrientationActions : 0;
    this.heading = this.choiceRandom.pick(directions);
    if (experience.visit === 'revisit' && experience.memory) {
      const m = experience.memory;
      m.controlsPracticed.forEach(x => this.controls.add(x));
      m.knownProducts.forEach(p => this.products.set(p.id, { ...p }));
      // A new shop layout never inherits a previous exact location belief.
      if (experience.layoutKey && experience.layoutKey === experience.previousLayoutKey) {
        m.stations.slice(-this.profile.spatialMemoryCapacity).forEach(s => this.stations.set(s.id, { ...s }));
        m.anchors.slice(-this.profile.spatialMemoryCapacity).forEach(a => this.anchors.set(a.id, { ...a, neighbors: new Set(a.neighbors) }));
      }
    }
  }

  observe(o: ActorObservation): void {
    if (o.schemaVersion !== 'attention-observation-v1' || 'environment' in o || 'objectives' in o || 'playerPosition' in o) {
      throw new Error('Attention policy accepts only projected actor observations.');
    }
    if (o === this.lastObserved || o.sequence !== undefined && o.sequence === this.lastSequence) return;
    this.lastObserved = o; this.lastSequence = o.sequence;
    for (const station of o.visibleStations) {
      const previous = this.stations.get(station.id);
      this.stations.set(station.id, { id: station.id, kind: station.kind, label: station.label,
        visits: previous?.visits ?? 0, anchorId: this.currentNode !== 'entry' ? this.currentNode : previous?.anchorId });
      // Remember where a sign was actually seen, including before reaching its interaction area.
      this.stationBearings.set(station.id, { node: this.currentNode, direction: station.direction });
    }
    const node = this.anchors.get(this.currentNode);
    for (const anchor of o.anchors) {
      if (!this.anchors.has(anchor.id)) this.anchors.set(anchor.id, { id: anchor.id, visits: 0, neighbors: new Set() });
      if (node) { node.neighbors.add(anchor.id); this.anchors.get(anchor.id)!.neighbors.add(this.currentNode); }
    }
    for (const product of o.products) {
      this.products.set(product.id, { ...product });
      if (o.activeStation && o.shelf) this.productPages.set(product.id, { station: o.activeStation, page: o.shelf.page });
      if (product.stock > 0) for (const goal of this.goals) if (matches(product, goal)) this.unavailableGoals.delete(goal.id);
    }
    for (const [id, available] of Object.entries(o.cashiers)) if (available !== undefined) this.cashierMemory.set(id, available);
    if (o.activeStation && o.shelf) {
      const pages = this.shelfPages.get(o.activeStation) ?? new Set<number>();
      pages.add(o.shelf.page); this.shelfPages.set(o.activeStation, pages);
    }
    // readObjectives alone is not enough: content must follow this actor's accepted read.
    if (o.readObjectives && this.lastDecision?.action.type === 'readList' && !o.lastActionError && o.result?.accepted !== false) {
      const unmet = o.readObjectives.filter(g => this.count(g) < g.quantity && !this.unavailableGoals.has(g.id));
      this.goals = (unmet.length ? unmet : o.readObjectives).slice(0, this.profile.goalMemoryCapacity).map(g => ({ ...g, confidence: 1 }));
      this.moreGoals = unmet.length > this.profile.goalMemoryCapacity;
      this.hasReadList = true; this.goalActivation = 1; this.additionsSinceRead = 0;
      this.focus = 'goal-item'; this.targetStation = null;
    }
    this.trimMemory();
  }

  /** Accepts a validated external (e.g. LLM) choice without inventing game facts. */
  acceptDecision(decision: Decision): void {
    if (decision.attentionTag && !['orient', 'read-goal', 'goal-item', 'interest', 'recover-goal', 'checkout', 'disengaged'].includes(decision.attentionTag)) {
      throw new Error('Unsupported attention state tag.');
    }
    if (decision.attentionTag) this.focus = decision.attentionTag as AttentionFocus;
    this.lastDecision = decision;
  }

  record(decision: Decision, before: ActorObservation, after: ActorObservation): void {
    this.lastDecision = decision;
    const a = decision.action;
    if (after.lastActionError || after.result?.accepted === false) {
      const key = JSON.stringify(a); this.rejected.set(key, (this.rejected.get(key) ?? 0) + 1);
      this.failures++; this.consecutiveErrors++; this.stress = clamp(this.stress + .12);
      this.confidence = clamp(this.confidence - .08); this.mistakenQuantity = null;
      this.targetStation = null; this.searchWithoutProgress++;
      this.observe(after); return;
    }
    this.consecutiveErrors = 0;
    this.controls.add(a.type);
    if (a.type === 'walkToAnchor') {
      const previous = this.currentNode;
      this.previousNode = previous; this.currentNode = a.anchorId;
      const node = this.anchors.get(a.anchorId) ?? { id: a.anchorId, visits: 0, neighbors: new Set<string>() };
      node.visits++;
      if (this.anchors.has(previous)) { node.neighbors.add(previous); this.anchors.get(previous)!.neighbors.add(a.anchorId); }
      this.anchors.set(a.anchorId, node); this.searchWithoutProgress++;
    }
    if (a.type === 'interact') {
      const station = this.stations.get(a.station);
      if (station) { station.visits++; station.anchorId = this.currentNode; }
      this.searchWithoutProgress = 0;
      this.approachAttempts.delete(`station:${a.station}`);
    }
    if (a.type === 'add') {
      const quantity = after.result?.quantity ?? a.quantity ?? 1;
      this.basket[a.productId] = (this.basket[a.productId] ?? 0) + quantity;
      if (this.mistakenQuantity?.id === a.productId) this.basket[a.productId] = this.mistakenQuantity.quantity;
      this.mistakenQuantity = null; this.unreviewedChanges++; this.successfulSteps++;
      this.handled.set(a.productId, (this.handled.get(a.productId) ?? 0) + 1);
      this.confidence = clamp(this.confidence + .025); this.support *= .6;
      this.additionsSinceRead++;
      if (this.focus === 'interest') this.interestPurchased = true;
      if (this.focus === 'interest') this.intentionalPurchases[a.productId] = (this.intentionalPurchases[a.productId] ?? 0) + quantity;
    }
    if (a.type === 'remove' || a.type === 'requestReturn') {
      this.basket[a.productId] = Math.max(0, (this.basket[a.productId] ?? 0) - (after.result?.quantity ?? a.quantity ?? 1));
      this.corrections.delete(a.productId); this.successfulSteps++; this.unreviewedChanges++;
    }
    if (a.type === 'viewCart' && after.cart) {
      this.noticeCorrections(after.cart);
      this.basket = { ...after.cart }; this.claimed.clear(); this.unreviewedChanges = 0;
      this.support = .9; this.stress = clamp(this.stress - .07); this.confidence = clamp(this.confidence + .04);
    }
    if (a.type === 'readList') { this.support = Math.max(this.support, .65); this.stress = clamp(this.stress - .04); }
    if (a.type === 'viewHelp' || a.type === 'requestCashier') { this.support = Math.max(this.support, .75); this.stress = clamp(this.stress - .08); }
    if (this.focus === 'disengaged') { this.disengagedSteps++; this.goalActivation = clamp(this.goalActivation - this.profile.switchMemoryDecay * .3); }
    else this.disengagedSteps = 0;
    if (this.focus === 'interest' && ['browse', 'pause', 'lookAround', 'add'].includes(a.type)) this.interestActions++;
    if (a.type === 'lookAround' && this.orientationRemaining) this.orientationRemaining--;
    if (a.type === 'closeStation') this.targetStation = null;
    if (a.type === 'requestCashier') {
      // A valid request can be declined or answered with another counter. Only
      // subsequent observed availability/visible staff feedback updates memory.
      this.checkoutNeedsStaff = null;
    }
    this.observe(after);
  }

  getMemory(): AttentionMemory {
    return { version: '1', stations: [...this.stations.values()].map(s => ({ ...s })),
      anchors: [...this.anchors.values()].map(a => ({ id: a.id, neighbors: [...a.neighbors].filter(id => this.anchors.has(id)), visits: a.visits })),
      knownProducts: [...this.products.values()].map(p => ({ ...p })), controlsPracticed: [...this.controls] };
  }

  getState() {
    return { currentFocus: this.focus, rememberedGoal: this.goals.map(g => ({ ...g })), hasReadList: this.hasReadList,
      goalActivation: this.goalActivation, moreGoals: this.moreGoals, rememberedCart: { ...this.basket },
      interest: this.interestStation ? { stationId: this.interestStation, productId: this.interestProduct, actions: this.interestActions } : null,
      familiarity: { products: [...(this.persona.character?.familiarProductIds ?? [])],
        layout: this.stations.size, controls: [...this.controls], visit: this.experience.visit },
      discovered: this.getMemory(), orientationRemaining: this.orientationRemaining,
      context: this.lastObserved ? this.situation(this.lastObserved) : null };
  }

  next(o: ActorObservation): Decision {
    this.observe(o);
    if (o.lastActionError) {
      if (this.consecutiveErrors >= 3 && !this.contextualRandom.chance(this.persona.parameters.retryProbability * (1 - this.stress * .3)))
        return this.choose({ type: 'giveUp' }, 'stop-after-repeated-visible-rejections');
      if (o.view !== 'world') return this.choose({ type: 'closeView' }, 'close-the-view-after-a-rejected-input');
      if (o.activeStation) return this.choose({ type: 'closeStation' }, 'leave-the-station-after-a-rejected-input');
      if (this.support < .65) return this.choose({ type: 'viewHelp' }, 'check-the-help-after-an-input-was-rejected');
      return this.explore(o, 'try-another-visible-passage-after-rejection');
    }
    if (o.view !== 'world') return this.choose({ type: 'closeView' }, o.view === 'cart' ? 'finish-looking-at-the-visible-basket' : 'finish-reading-the-visible-help');
    const correction = this.correctObservedMistake(o);
    if (correction) return correction;
    if (o.phase === 'checkout') {
      const active = o.activeStation ?? this.targetStation;
      if ((active === 'checkout' || active === 'checkout-2') && this.cashierMemory.get(active) === false) {
        this.checkoutNeedsStaff = active;
        return this.choose({ type: 'closeStation' }, 'leave-the-counter-with-no-visible-cashier');
      }
      if (!this.hasReadList || this.goalActivation < .25) {
        this.focus = 'recover-goal'; return this.choose({ type: 'closeStation' }, 'step-back-to-recover-the-shopping-list');
      }
      // The visible checkout basket is a chance to review, not an automatic perfect correction.
      const c = this.situation(o);
      if (o.cart && this.contextualRandom.chance(this.persona.parameters.recheckProbability * (.5 + c.memoryLoad + c.stress))) {
        this.noticeCorrections(o.cart);
        this.basket = { ...o.cart }; this.claimed.clear(); this.unreviewedChanges = 0; this.support = .9;
        if (this.corrections.size) return this.choose({ type: 'closeStation' }, 'leave-checkout-to-correct-an-observed-selection');
        if (this.goals.some(g => this.count(g) < g.quantity && !this.unavailableGoals.has(g.id)) || this.moreGoals) {
          this.focus = 'goal-item'; return this.choose({ type: 'closeStation' }, 'notice-an-unfinished-remembered-item-while-checking-the-visible-basket');
        }
      }
      return this.choose({ type: 'submit' }, 'confirm-the-purchases-currently-in-the-basket');
    }
    if (this.orientationRemaining && !o.activeStation) {
      this.focus = 'orient'; return this.choose({ type: 'lookAround', durationMs: this.duration(1300, 2800) }, 'look-at-the-unfamiliar-controls-and-visible-surroundings');
    }
    if (this.checkoutNeedsStaff) {
      // Legacy stochastic previews should not walk past an observed reachable
      // employee forever while pursuing an older, no-longer-visible staff cue.
      // This class is not instantiated by the AI actor/research learner modes.
      const staff = o.visibleStations.find(s => s.kind === 'employee' && s.near)
        ?? o.visibleStations.find(s => s.kind === 'employee')
        ?? [...this.stations.values()].find(s => s.kind === 'employee');
      if (o.activeStation?.startsWith('staff:')) return this.choose({ type: 'requestCashier', checkoutId: this.checkoutNeedsStaff }, 'ask-the-employee-about-the-counter-just-visited', [`station:${o.activeStation}`]);
      if (o.activeStation) return this.choose({ type: 'closeStation' }, 'leave-this-station-to-find-counter-help');
      return this.navigate(o, staff?.id ?? null, 'look-for-a-visible-employee-after-the-empty-counter');
    }
    if ((!this.hasReadList || this.focus === 'recover-goal' || this.focus === 'read-goal') && o.listAvailable) {
      if (o.activeStation) return this.choose({ type: 'closeStation' }, 'leave-the-shelf-to-look-at-the-list');
      this.focus = this.hasReadList ? 'recover-goal' : 'read-goal';
      return this.choose({ type: 'readList', durationMs: this.duration(1800, 3400) }, this.hasReadList ? 'read-the-visible-list-again-to-recover-the-next-item' : 'read-the-visible-shopping-list-for-the-first-time', ['list']);
    }
    if (this.focus === 'disengaged') {
      if (this.attentionRandom.chance(this.profile.resumeProbability * (.5 + this.goalActivation) + (o.listAvailable ? .1 : 0))) {
        this.focus = 'recover-goal';
        return o.activeStation ? this.choose({ type: 'closeStation' }, 'finish-looking-around-and-return-to-the-list')
          : this.choose({ type: 'readList', durationMs: this.duration(1800, 3400) }, 'look-back-at-the-list-after-following-an-interest', ['list']);
      }
      if (this.disengagements >= 1 && this.disengagedSteps >= 3 && this.goalActivation < .35 && this.attentionRandom.chance(.12)) return this.choose({ type: 'giveUp' }, 'finish-this-visit-without-resuming-the-shopping-task');
    }
    if (this.focus !== 'interest') this.captureInterest(o);
    if (this.focus === 'interest') {
      if (o.activeStation && o.activeStation !== this.interestStation) return this.choose({ type: 'closeStation' }, 'leave-this-shelf-to-follow-the-noticed-interest');
      if (o.activeStation === this.interestStation && o.shelf) return this.inspectInterest(o);
      return this.navigate(o, this.interestStation, 'approach-the-noticed-personal-interest');
    }
    const contextual = this.considerSupport(o);
    if (contextual) return contextual;
    if (o.activeStation && o.shelf) return this.shopFromMemory(o);
    if (o.activeStation) return this.choose({ type: 'closeStation' }, 'finish-this-conversation');
    if (!this.hasReadList || this.focus === 'disengaged') return this.explore(o, 'follow-a-visible-passage-while-orienting');
    const style = this.persona.shoppingStyle;
    if (style && o.listAvailable && this.additionsSinceRead > 0 && !this.listChecks.has(this.successfulSteps)) {
      this.listChecks.add(this.successfulSteps);
      const c = this.situation(o);
      if (this.styleRandom.chance(style.listCheckAfterSelectionProbability * (.8 + c.memoryLoad * .4 + c.stress * .3))) {
        this.focus = 'recover-goal';
        return this.choose({ type: 'readList', durationMs: this.duration(1800, 3400) }, 'recheck-the-list-after-a-selection', ['list']);
      }
    }
    const missing = this.goals.filter(g => this.count(g) < g.quantity && !this.unavailableGoals.has(g.id));
    if (!missing.length) {
      if (this.moreGoals) { this.focus = 'recover-goal'; return this.choose({ type: 'readList', durationMs: this.duration(1800, 3400) }, 'read-the-items-not-held-in-current-memory', ['list']); }
      if (this.goals.some(g => this.unavailableGoals.has(g.id)) && !Object.values(this.basket).some(n => n > 0))
        return this.choose({ type: 'giveUp' }, 'leave-after-observing-that-the-remembered-items-are-unavailable');
      if (style && this.unreviewedChanges && !this.checkoutChecks.has(this.successfulSteps)) {
        this.checkoutChecks.add(this.successfulSteps);
        if (this.styleRandom.chance(style.preCheckoutCheckProbability))
          return this.choose({ type: 'viewCart' }, 'check-the-basket-before-looking-for-checkout');
      }
      this.focus = 'checkout';
      const knownCheckouts = [...this.stations.values()].filter(s => s.kind === 'checkout');
      const staffed = knownCheckouts.filter(s => this.cashierMemory.get(s.id) === true);
      const checkouts = staffed.length ? staffed : knownCheckouts.filter(s => this.cashierMemory.get(s.id) !== false);
      if (!checkouts.length && knownCheckouts.length && ![...this.cashierMemory.values()].some(available => available)) {
        this.checkoutNeedsStaff = knownCheckouts[0].id === 'checkout-2' ? 'checkout-2' : 'checkout';
        return this.explore(o, 'look-for-staff-after-observing-empty-counters');
      }
      return this.navigate(o, checkouts[0]?.id ?? null, 'look-for-a-counter-after-the-remembered-items');
    }
    if (this.additionsSinceRead >= 2 && this.attentionRandom.chance(this.persona.parameters.recheckProbability * .35)) {
      this.focus = 'recover-goal'; return this.choose({ type: 'readList', durationMs: this.duration(1800, 3400) }, 'recover-the-next-quantity-from-the-visible-list', ['list']);
    }
    this.focus = 'goal-item';
    const visibleGoal = missing.find(g => o.visibleStations.some(s => s.kind === 'shelf' && s.id === categoryFor(g.label)));
    const discoveredGoal = missing.find(g => this.stations.has(categoryFor(g.label) ?? ''));
    const goal = visibleGoal ?? discoveredGoal ?? missing[0];
    const known = [...this.products.values()].find(p => matches(p, goal));
    const category = known?.categoryId ?? categoryFor(goal.label);
    const target = category ? [...this.stations.values()].find(s => s.kind === 'shelf' && s.id === category)
      : [...this.stations.values()].filter(s => s.kind === 'shelf' && !this.searchedShelves.get(goal.id)?.has(s.id))
        .sort((a, b) => a.visits - b.visits)[0];
    return this.navigate(o, target?.id ?? null, 'search-the-discovered-area-for-the-remembered-item');
  }

  private captureInterest(o: ActorObservation) {
    const candidates: { cue: string; station: string; product: string | null; weight: number }[] = [];
    for (const s of o.visibleStations) if (s.kind === 'shelf') candidates.push({ cue: `station:${s.id}`, station: s.id, product: null, weight: this.profile.interestCategoryWeights[s.id] ?? 0 });
    for (const p of o.products) candidates.push({ cue: `product:${p.id}`, station: p.categoryId, product: p.id, weight: this.profile.interestProductWeights[p.id] ?? 0 });
    for (const cue of candidates.filter(c => c.weight > 0 && !this.satiated.has(c.station) && !this.evaluatedCues.has(c.cue))) {
      this.evaluatedCues.add(cue.cue);
      const unfamiliar = this.experience.visit === 'first-play' ? 1 : .6;
      if (!this.attentionRandom.chance(this.profile.captureProbability * Math.min(1, cue.weight / 1.6) * unfamiliar)) continue;
      this.focus = 'interest'; this.interestStation = cue.station; this.interestProduct = cue.product;
      this.interestActions = 0; this.interestPurchased = false;
      this.goalActivation = clamp(this.goalActivation - this.profile.switchMemoryDecay);
      for (const goal of this.goals) if (this.memoryRandom.chance(this.profile.switchMemoryDecay)) goal.confidence *= .75;
      this.targetStation = cue.station; return;
    }
  }

  private inspectInterest(o: ActorObservation): Decision {
    const desired = o.products.filter(p => p.stock > 0 && (this.profile.interestProductWeights[p.id] ?? 0) > 0);
    if (!this.interestProduct && desired.length) this.interestProduct = this.choiceRandom.weighted(desired, p => this.profile.interestProductWeights[p.id]).id;
    if (this.interestActions < this.profile.minimumInterestActions) {
      return this.browse(o, 'spend-time-looking-at-the-noticed-interest', false);
    }
    const chosen = o.products.find(p => p.id === this.interestProduct && p.stock > 0);
    if (chosen && !this.interestPurchased && this.interestActions < this.profile.maximumInterestActions
      && this.attentionRandom.chance(this.profile.interestPurchaseProbability)) {
      return this.choose({ type: 'add', productId: chosen.id, quantity: 1 }, 'choose-one-of-the-personally-interesting-products', [`product:${chosen.id}`]);
    }
    if (this.interestActions < this.profile.maximumInterestActions) {
      const observedPages = this.shelfPages.get(o.activeStation!)?.size ?? 0;
      const coverage = Math.min(1, observedPages / Math.max(1, o.shelf!.pageCount));
      const confirmedInterest = this.interestProduct !== null && this.products.has(this.interestProduct);
      const beyondMinimum = (this.interestActions - this.profile.minimumInterestActions)
        / Math.max(1, this.profile.maximumInterestActions - this.profile.minimumInterestActions);
      // Having inspected the desired item, already browsed these pages or bought one can
      // end this bout of interest. The maximum is a cap, not a mandatory dwell duration.
      const finishChance = clamp(.08 + coverage * .22 + (confirmedInterest ? .18 : 0)
        + (this.interestPurchased ? .5 : 0) + beyondMinimum * .22);
      if (!this.attentionRandom.chance(finishChance)) return this.browse(o, 'continue-looking-beyond-the-shopping-list', true);
    }
    this.satiated.add(this.interestStation!); this.disengagements++;
    this.goalActivation = clamp(this.goalActivation - this.profile.switchMemoryDecay * this.interestActions);
    this.focus = this.attentionRandom.chance(this.profile.resumeProbability * (.5 + this.goalActivation)) ? 'recover-goal' : 'disengaged';
    this.interestStation = null; this.interestProduct = null;
    return this.choose({ type: 'closeStation' }, this.focus === 'recover-goal' ? 'finish-this-interest-and-look-back-at-the-list' : 'finish-this-interest-without-recovering-the-list-yet');
  }

  private shopFromMemory(o: ActorObservation): Decision {
    for (const goal of this.goals.filter(g => this.count(g) < g.quantity)) {
      const comparison = this.compareOptions(o, goal);
      if (comparison) return comparison;
      const choices = o.products.filter(p => p.stock > 0 && matches(p, goal));
      if (!choices.length) continue;
      if (goal.confidence < .55) { this.focus = 'recover-goal'; return this.choose({ type: 'closeStation' }, 'check-the-list-before-guessing-an-uncertain-quantity'); }
      const p = this.persona.parameters, c = this.situation(o);
      const compared = this.comparisons.get(`${goal.id}:${o.activeStation}`);
      let selected = choices.find(p => p.id === compared?.preferredId) ?? this.choiceRandom.weighted(choices, item => this.preferenceWeight(item));
      const familiar = this.productFamiliarity(selected);
      const stale = this.additionsSinceRead > 0 || this.goalActivation < .9;
      const lowDemand = !stale || c.memoryLoad <= .2 && c.stress <= .25 && familiar >= .65;
      const pressure = (.15 + c.novelty * .8 + c.memoryLoad * .65 + c.stress * .95)
        * (1 - familiar * .55) * (1 - c.support * .65) * (1 - c.confidence * .2)
        * Math.pow(1 - p.feedbackLearningRate, this.failures);
      let reason = compared?.preferredId === selected.id ? 'choose-an-option-after-comparing-observed-prices-and-labels' : 'choose-the-visible-item-from-the-remembered-list';
      const shortcutKey = `${goal.id}:${o.activeStation}`;
      const familiarVariants = o.products.filter(item => item.stock > 0 && related(item, goal) && this.productFamiliarity(item) >= .5);
      const style = this.persona.shoppingStyle;
      // A quick choice uses an actually visible, personally familiar cue. It may be correct;
      // unlike a forced slip it can never select an arbitrary or unseen product.
      if (style && !compared?.preferredId && familiarVariants.length && !this.shortcutDecisions.has(shortcutKey)) {
        this.shortcutDecisions.add(shortcutKey);
        if (this.styleRandom.chance(style.familiarShortcutProbability * (1 - c.stress * .2)
          * Math.pow(1 - p.feedbackLearningRate, this.failures))) {
          selected = this.choiceRandom.weighted(familiarVariants, item => (p.itemPreferenceWeights[item.id] ?? 1) * (1 + this.productFamiliarity(item) * p.familiarityBias));
          if (!matches(selected, goal)) this.claimed.set(goal.id, selected.id);
          reason = 'choose-a-familiar-visible-variant-before-checking-all-details';
        }
      }
      const token = goal.label.split(' ').at(-1)!;
      const similar = o.products.filter(item => item.stock > 0 && !matches(item, goal) && item.name.includes(token));
      if (reason !== 'choose-a-familiar-visible-variant-before-checking-all-details' && goal.match === 'exact' && similar.length && !lowDemand && this.contextualRandom.chance(p.confusionProbability * pressure)) {
        selected = this.choiceRandom.pick(similar); this.claimed.set(goal.id, selected.id);
        reason = 'select-a-similar-visible-label-while-the-remembered-detail-is-uncertain';
      }
      const intended = Math.min(goal.quantity - this.count(goal), selected.stock);
      let quantity = intended;
      if (intended > 1 && !lowDemand && c.memoryLoad > .25 && this.contextualRandom.chance(p.quantitySlipProbability * pressure)) {
        quantity = this.contextualRandom.chance(.5) ? intended - 1 : Math.min(selected.stock, intended + 1);
        if (quantity !== intended) {
          this.mistakenQuantity = { id: selected.id, quantity: (this.basket[selected.id] ?? 0) + intended };
          reason = 'lose-count-of-a-multiple-item-selection-after-unreviewed-changes';
        }
      }
      return this.choose({ type: 'add', productId: selected.id, quantity }, reason, [`product:${selected.id}`]);
    }
    const pages = this.shelfPages.get(o.activeStation!) ?? new Set<number>();
    const rememberedProduct = [...this.products.values()].find(p => p.stock > 0 && this.goals.some(g => this.count(g) < g.quantity && matches(p, g))
      && this.productPages.get(p.id)?.station === o.activeStation && this.productPages.get(p.id)?.page !== o.shelf!.page);
    if (rememberedProduct) {
      const page = this.productPages.get(rememberedProduct.id)!.page;
      return this.choose({ type: 'browse', durationMs: this.duration(1100, 2300), scrollFraction: o.shelf!.pageFractions?.[page]
        ?? (o.shelf!.pageCount <= 1 ? 0 : page / (o.shelf!.pageCount - 1)) }, 'look-back-at-the-shelf-page-previously-observed');
    }
    const unread = Array.from({ length: o.shelf!.pageCount }, (_, i) => i).find(i => !pages.has(i));
    if (unread !== undefined && this.goals.some(g => this.count(g) < g.quantity && (!categoryFor(g.label) || categoryFor(g.label) === o.activeStation))) {
      return this.choose({ type: 'browse', durationMs: this.duration(1100, 2300), scrollFraction: o.shelf!.pageFractions?.[unread] ?? (o.shelf!.pageCount <= 1 ? 0 : unread / (o.shelf!.pageCount - 1)) }, 'look-at-another-visible-shelf-page');
    }
    if (unread === undefined) for (const goal of this.goals.filter(g => this.count(g) < g.quantity)) {
      const checked = this.searchedShelves.get(goal.id) ?? new Set<string>();
      checked.add(o.activeStation!); this.searchedShelves.set(goal.id, checked);
    }
    const unavailable = this.goals.filter(g => this.count(g) < g.quantity
      && (categoryFor(g.label) ?? [...this.products.values()].find(p => matches(p, g))?.categoryId) === o.activeStation
      && ![...this.products.values()].some(p => p.categoryId === o.activeStation && p.stock > 0 && matches(p, g)));
    if (unread === undefined && unavailable.length) {
      unavailable.forEach(g => this.unavailableGoals.add(g.id));
      return this.choose({ type: 'closeStation' }, 'remember-the-checked-shelf-has-no-available-matching-item', [`station:${o.activeStation}`]);
    }
    return this.choose({ type: 'closeStation' }, 'leave-after-looking-at-this-shelf-page');
  }

  private noticeCorrections(cart: Record<string, number>) {
    if (this.correctionChecks.has(this.successfulSteps)) return;
    this.correctionChecks.add(this.successfulSteps);
    const p = this.persona.parameters;
    if (!this.contextualRandom.chance(p.recheckProbability * (.5 + p.feedbackLearningRate * .5))) return;
    const queue = (id: string, quantity: number) => {
      const available = Math.max(0, (cart[id] ?? 0) - (this.intentionalPurchases[id] ?? 0));
      if (available && quantity > 0) this.corrections.set(id, { quantity: Math.min(available, quantity), useHelp: this.contextualRandom.chance(p.helpProbability) });
    };
    for (const goal of this.goals) {
      const assumed = this.claimed.get(goal.id);
      if (assumed && this.products.has(assumed) && !matches(this.products.get(assumed)!, goal)) queue(assumed, cart[assumed] ?? 0);
      const selected = Object.entries(cart).filter(([id]) => this.products.has(id) && matches(this.products.get(id)!, goal));
      let extra = selected.reduce((n, [id, count]) => n + Math.max(0, count - (this.intentionalPurchases[id] ?? 0)), 0) - goal.quantity;
      for (const [id, quantity] of selected) if (extra > 0) {
        const amount = Math.min(extra, Math.max(0, quantity - (this.intentionalPurchases[id] ?? 0)));
        queue(id, amount); extra -= amount;
      }
    }
  }

  private correctObservedMistake(o: ActorObservation): Decision | null {
    const pending = this.corrections.entries().next().value;
    if (!pending) return null;
    const [id, correction] = pending, product = this.products.get(id);
    if (!product || !(this.basket[id] > 0)) { this.corrections.delete(id); return null; }
    const quantity = Math.min(this.basket[id], correction.quantity);
    if (o.activeStation === product.categoryId && o.shelf)
      return this.choose({ type: 'remove', productId: id, quantity }, 'return-an-observed-mismatch-or-extra-quantity-to-its-shelf', [`product:${id}`]);
    if (o.activeStation?.startsWith('staff:'))
      return this.choose({ type: 'requestReturn', productId: id, quantity }, 'ask-for-help-returning-an-observed-selection-error', [`product:${id}`, `station:${o.activeStation}`]);
    if (o.activeStation) return this.choose({ type: 'closeStation' }, 'leave-this-station-to-correct-the-checked-basket');
    const staff = correction.useHelp ? [...this.stations.values()].find(s => s.kind === 'employee') : undefined;
    const shelf = this.stations.get(product.categoryId);
    this.focus = 'goal-item';
    return this.navigate(o, staff?.id ?? shelf?.id ?? null, 'return-to-a-known-place-to-correct-the-checked-basket');
  }

  private preferenceWeight(item: ActorProduct) {
    const p = this.persona.parameters;
    return (p.itemPreferenceWeights[item.id] ?? 1) * (1 + this.productFamiliarity(item) * p.familiarityBias)
      / Math.pow(Math.max(.1, item.price / 1000), p.pricePreference);
  }

  private compareOptions(o: ActorObservation, goal: GoalMemory): Decision | null {
    const style = this.persona.shoppingStyle;
    if (!style || !o.shelf || categoryFor(goal.label) && categoryFor(goal.label) !== o.activeStation) return null;
    const key = `${goal.id}:${o.activeStation}`;
    let comparison = this.comparisons.get(key);
    if (!comparison) {
      const candidates = o.products.filter(p => p.stock > 0 && related(p, goal));
      if (!candidates.length) return null;
      const eligible = candidates.length > 1 || o.shelf.pageCount > 1;
      comparison = { pages: new Set(), finished: !eligible || !this.styleRandom.chance(style.comparisonProbability) };
      this.comparisons.set(key, comparison);
      if (!comparison.finished) {
        comparison.pages.add(o.shelf.page);
        return this.choose({ type: 'browse', durationMs: this.duration(1600, 3600), scrollFraction: o.shelf.scrollFraction },
          'compare-visible-options-before-selecting', candidates.slice(0, 4).map(p => `product:${p.id}`));
      }
    }
    if (comparison.finished) return null;
    comparison.pages.add(o.shelf.page);
    const nextPage = Array.from({ length: o.shelf.pageCount }, (_, i) => i).find(i => !comparison!.pages.has(i));
    if (comparison.pages.size < style.maxComparisonPages && nextPage !== undefined) {
      return this.choose({ type: 'browse', durationMs: this.duration(1500, 3300), scrollFraction: o.shelf.pageFractions?.[nextPage]
        ?? nextPage / (o.shelf.pageCount - 1) }, 'compare-another-observed-shelf-page', [`station:${o.activeStation}`]);
    }
    const observed = [...this.products.values()].filter(p => p.stock > 0 && matches(p, goal)
      && this.productPages.get(p.id)?.station === o.activeStation);
    if (!comparison.preferredId && observed.length)
      comparison.preferredId = this.choiceRandom.weighted(observed, p => this.preferenceWeight(p)).id;
    const page = comparison.preferredId ? this.productPages.get(comparison.preferredId)?.page : undefined;
    if (page !== undefined && page !== o.shelf.page) {
      // Finish before returning so an unavailable row cannot restart the comparison loop.
      comparison.finished = true;
      return this.choose({ type: 'browse', durationMs: this.duration(1100, 2300), scrollFraction: o.shelf.pageFractions?.[page]
        ?? page / Math.max(1, o.shelf.pageCount - 1) }, 'return-to-a-compared-option', [`product:${comparison.preferredId}`]);
    }
    comparison.finished = true;
    return null;
  }

  private navigate(o: ActorObservation, stationId: string | null, reason: string): Decision {
    const visible = o.visibleStations.find(s => s.id === stationId);
    if (visible?.near) {
      this.targetStation = visible.id;
      return this.choose({ type: 'interact', station: visible.id }, 'open-the-station-now-within-reach', [`station:${visible.id}`]);
    }
    if (visible) {
      this.followingSign = { stationId: visible.id, direction: visible.direction, unseenSteps: 0 };
      return this.approach(o, visible.direction, reason, `station:${visible.id}`);
    }
    // A sign can leave the viewport/HUD while walking toward it. Briefly maintain the
    // observed bearing instead of immediately reversing to the previous viewing point.
    if (stationId && this.followingSign?.stationId === stationId && this.followingSign.unseenSteps < 3) {
      this.followingSign.unseenSteps++;
      return this.approach(o, this.followingSign.direction, 'continue-along-the-recently-observed-sign-direction', `station:${stationId}`);
    }
    const rememberedAnchor = stationId ? this.stations.get(stationId)?.anchorId : undefined;
    if (rememberedAnchor) {
      const route = this.memoryRoute(rememberedAnchor);
      const next = route.find(id => o.anchors.some(a => a.id === id));
      if (next) return this.choose({ type: 'walkToAnchor', anchorId: next }, 'return-through-a-previously-observed-passage', [`anchor:${next}`]);
    }
    const bearing = stationId ? this.stationBearings.get(stationId) : undefined;
    if (bearing?.node === this.currentNode) return this.approach(o, bearing.direction, 'continue-from-the-place-where-the-sign-was-seen', `station:${stationId}`);
    return this.explore(o, reason);
  }

  private approach(o: ActorObservation, heading: ActorDirection, reason: string, cue: string): Decision {
    const candidates = o.anchors.filter(a => (this.rejected.get(JSON.stringify({ type: 'walkToAnchor', anchorId: a.id })) ?? 0) < 2);
    if (!candidates.length) return this.explore(o, reason);
    const attempts = this.approachAttempts.get(cue) ?? new Map<string, number>();
    attempts.set(this.currentNode, (attempts.get(this.currentNode) ?? 0) + 1);
    this.approachAttempts.set(cue, attempts);
    const turn = (a: ActorAnchor) => {
      const difference = Math.abs(directions.indexOf(a.direction) - directions.indexOf(heading));
      return Math.min(difference, 8 - difference);
    };
    // A visible destination outranks novelty. Going back through a familiar passage is useful
    // when it leads toward the sign; unexplored passages behind the actor are not a new goal.
    const bestTurn = Math.min(...candidates.map(turn));
    const advancing = candidates.filter(a => turn(a) <= Math.min(2, bestTurn + 1));
    // A visible sign can be across a shelf or counter. After returning to the same place
    // several times, try a different visible passage instead of repeating that approach.
    // This uses remembered attempts, never the hidden route or destination coordinates.
    if ((attempts.get(this.currentNode) ?? 0) >= 3) {
      const minimum = Math.min(...candidates.map(a => attempts.get(a.id) ?? 0));
      const alternatives = candidates.filter(a => (attempts.get(a.id) ?? 0) === minimum);
      const target = this.choiceRandom.weighted(alternatives, a => (a.id === this.previousNode ? .2 : 1) * (5 - turn(a)));
      return this.choose({ type: 'walkToAnchor', anchorId: target.id }, 'try-another-visible-way-after-repeated-approach', [cue, `anchor:${target.id}`]);
    }
    const target = this.choiceRandom.weighted(advancing.length ? advancing : candidates, a =>
      Math.pow(5 - turn(a), 4) * (a.id === this.previousNode ? .08 : 1)
      / (1 + Math.min(4, this.anchors.get(a.id)?.visits ?? 0) * .2));
    return this.choose({ type: 'walkToAnchor', anchorId: target.id }, reason, [cue, `anchor:${target.id}`]);
  }

  private explore(o: ActorObservation, reason: string, heading: ActorDirection = this.heading): Decision {
    const candidates = o.anchors.filter(a => (this.rejected.get(JSON.stringify({ type: 'walkToAnchor', anchorId: a.id })) ?? 0) < 2);
    if (!candidates.length) {
      this.heading = directions[(directions.indexOf(this.heading) + 2) % directions.length];
      return this.choose({ type: 'lookAround', durationMs: this.duration(1000, 2200) }, 'look-for-another-passable-visible-opening');
    }
    const target = this.choiceRandom.weighted(candidates, a => {
      const visited = this.anchors.get(a.id)?.visits ?? 0;
      const turn = Math.min(Math.abs(directions.indexOf(a.direction) - directions.indexOf(heading)), 8 - Math.abs(directions.indexOf(a.direction) - directions.indexOf(heading)));
      const persistence = this.persona.shoppingStyle?.headingPersistence;
      return (visited ? 1 / (1 + visited * 4) : 6 + this.persona.parameters.explorationProbability * 25)
        * Math.pow(5 - turn, persistence === undefined ? 3 : 1 + persistence * 4) * (a.id === this.previousNode ? .1 : 1);
    });
    this.heading = target.direction;
    if (this.searchWithoutProgress > 24) { this.heading = this.choiceRandom.pick(directions); this.searchWithoutProgress = 0; }
    return this.choose({ type: 'walkToAnchor', anchorId: target.id }, reason, [`anchor:${target.id}`]);
  }

  private memoryRoute(target: string): string[] {
    const queue = [[this.currentNode]], seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const route = queue[i], id = route.at(-1)!;
      if (id === target) return route.slice(1);
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of this.anchors.get(id)?.neighbors ?? []) if (!seen.has(next)) queue.push([...route, next]);
    }
    return [];
  }

  private browse(o: ActorObservation, reason: string, changePage: boolean): Decision {
    const shelf = o.shelf!;
    const nextPage = changePage && shelf.pageCount > 1 ? (shelf.page + 1) % shelf.pageCount : shelf.page;
    return this.choose({ type: 'browse', durationMs: this.duration(1400, 3200), scrollFraction: shelf.pageFractions?.[nextPage] ?? (shelf.pageCount <= 1 ? 0 : nextPage / (shelf.pageCount - 1)) }, reason,
      this.interestProduct && o.products.some(p => p.id === this.interestProduct) ? [`product:${this.interestProduct}`] : [`station:${o.activeStation}`]);
  }

  private count(goal: ActorObjective): number {
    return Object.entries(this.basket).reduce((sum, [id, quantity]) => {
      const p = this.products.get(id); return sum + (p && (matches(p, goal) || this.claimed.get(goal.id) === id) ? quantity : 0);
    }, 0);
  }

  private productFamiliarity(p: ActorProduct): number {
    const prior = this.persona.character?.familiarProductIds.includes(p.id) ? .75
      : this.persona.character?.familiarCategories.includes(p.categoryId) ? .5 : .1;
    return clamp(prior + Math.min(.25, (this.handled.get(p.id) ?? 0) * .1));
  }
  private situation(o: ActorObservation) {
    const category = o.products[0]?.categoryId;
    const prior = category && this.persona.character?.familiarCategories.includes(category) ? .6 : .15;
    const familiarity = clamp(prior + (category ? Math.min(.35, (this.stations.get(category)?.visits ?? 0) * .12) : 0));
    const memoryLoad = clamp((Math.max(0, this.goals.length - 1) / 4 + this.unreviewedChanges * .14 + (1 - this.goalActivation) * .3)
      * (o.cart ? .25 : 1) * (1 - this.support * .65) * (1 - familiarity * .3));
    return { familiarity, novelty: 1 - familiarity, memoryLoad, stress: this.stress, confidence: this.confidence,
      support: this.support, failures: this.failures, successfulSteps: this.successfulSteps,
      consecutiveErrors: this.consecutiveErrors, unreviewedChanges: this.unreviewedChanges };
  }
  private considerSupport(o: ActorObservation): Decision | null {
    if (this.focus === 'interest' || this.focus === 'disengaged') return null;
    const p = this.persona.parameters, c = this.situation(o);
    const key = `${this.successfulSteps}:${this.failures}:${o.activeStation ?? 'world'}`;
    if (this.unreviewedChanges && !this.consideredChecks.has(key)) {
      this.consideredChecks.add(key);
      if (this.contextualRandom.chance(p.recheckProbability * (.45 + c.memoryLoad * .8 + c.stress * .6 + c.novelty * .4) * (1 - c.support * .35)))
        return this.choose({ type: 'viewCart' }, 'recheck-the-basket-after-remembered-selections');
    }
    const helpKey = `${this.failures}:${this.hasReadList}:${this.controls.has('interact')}`;
    if (!o.activeStation && this.support < .65 && (c.memoryLoad > .55 || c.stress > .5 || c.novelty > .75)
      && !this.consideredHelp.has(helpKey)) {
      this.consideredHelp.add(helpKey);
      if (this.contextualRandom.chance(p.helpProbability * (.35 + c.memoryLoad * .5 + c.stress * .7 + c.novelty * .35)))
        return this.choose({ type: 'viewHelp' }, 'use-visible-help-for-the-current-unfamiliar-step');
    }
    return null;
  }

  private duration(min: number, max: number) { return Math.round(this.timingRandom.between(min, max)); }
  private choose(action: PolicyAction, reason: string, cueRefs: string[] = []): Decision {
    const novelty = this.experience.visit === 'first-play' && !this.controls.has(action.type) ? 1.2 : 1;
    const c = this.lastObserved ? this.situation(this.lastObserved) : { novelty: 1, memoryLoad: 0, stress: 0, support: 0, familiarity: 0, confidence: .6 };
    const hesitation = this.timingRandom.chance(this.persona.parameters.hesitationProbability * (.25 + c.novelty * .6 + c.memoryLoad * .5 + c.stress * .75) * (1 - c.support * .55))
      ? this.timingRandom.between(1500, 7500) : 0;
    const processing = Math.max(.6, 1 + c.memoryLoad * .25 + c.stress * .45 - c.familiarity * .15 - c.support * .12);
    const description = `context(familiarity=${c.familiarity.toFixed(2)},load=${c.memoryLoad.toFixed(2)},stress=${c.stress.toFixed(2)},support=${c.support.toFixed(2)},failures=${this.failures})`;
    const decision: Decision = { action, reason: `${reason}${hesitation ? ';pause-before-next-step' : ''};${description}`, delayMs: Math.round(this.timingRandom.logNormal(this.persona.parameters.reactionMedianMs, this.persona.parameters.reactionSigma) * novelty * processing + hesitation),
      attentionTag: this.focus, cueRefs };
    this.acceptDecision(decision); return decision;
  }
  private trimMemory() {
    while (this.anchors.size > this.profile.spatialMemoryCapacity) {
      const landmarks = new Set([...this.stations.values()].map(s => s.anchorId));
      const removable = [...this.anchors.values()].filter(a => a.id !== this.currentNode && a.id !== this.previousNode);
      const remove = (removable.find(a => !a.visits && !landmarks.has(a.id))
        ?? removable.find(a => !landmarks.has(a.id)) ?? removable[0])?.id;
      if (!remove) break; this.anchors.delete(remove);
      for (const node of this.anchors.values()) node.neighbors.delete(remove);
    }
  }
}
