import type { MarketAgentAction } from '../../frontend/src/game/marketSession';
import type { MarketEnvironmentStationId } from '../../frontend/src/game/marketEnvironment';
import type { Decision, Observation, Persona } from './types';
import { Random } from './random';
import { planWalk } from './navigation';
import { PersonaContext } from './personaContext';

type Product = Observation['products'][number];
type Objective = Observation['objectives'][number];
const compact = (s: string) => s.replace(/\s/g, '');
/** Language-level matching of visible labels; no catalog family IDs or hidden targets. */
function matches(p: Product, o: Objective): boolean {
  if (o.match === 'exact') return p.name === o.label;
  const category = suggestedCategory(o.label);
  if (category && category !== p.categoryId) return false;
  const normalize = (s: string) => compact(s).replace(/낱개|작은|큰|신선한/g, '').replace(/계란|특란|왕란/g, '달걀').replace(/요구르트/g, '요거트');
  return normalize(p.name).includes(normalize(o.label));
}
function suggestedCategory(label: string): string | undefined {
  if (/카레|라면|즉석밥|만두|미역국|피자|죽|우동|참치|스파게티/.test(label)) return 'meal';
  if (/주스|콜라|음료|커피|두유|탄산|생수|차$/.test(label)) return 'drink';
  if (/우유|달걀|두부|치즈|요거트|버터|햄|닭|맛살|어묵/.test(label)) return 'fresh';
  if (/사과|배$|딸기|토마토|감자|포도|수박|오이|당근|양파|귤|복숭아|레몬|오렌지|브로콜리|키위|바나나/.test(label)) return 'produce';
  if (/슬리퍼|욕실화|건전지|충전|세제|수세미|문구/.test(label)) return 'household';
  return undefined;
}

export class StochasticPolicy {
  private readonly random: Random;
  private readonly context: PersonaContext;
  private currentContext?: ReturnType<PersonaContext['snapshot']>;
  private queue: Decision[] = [];
  private known = new Map<string, Product>();
  private stock = new Map<string, number>();
  private feedbackDetails: string[] = [];
  private visited = new Set<string>();
  private unavailable = new Set<string>();
  private basket: Record<string, number> = {};
  private claimed = new Map<string, string>();
  private mistakenQuantity: { id: string; value: number } | null = null;
  private additionsSinceCheck = 0;
  private retryNeedsCheck = false;
  private repairs: { id: string; quantity: number }[] = [];
  private helpIntent: 'cashier' | 'return' | null = null;
  private progress = 0;
  private helpCheckpoint = '';
  private rejectedActionCount = 0;
  private actionsSinceReview = Infinity;
  private plannedStation: MarketEnvironmentStationId | null = null;
  private failedActions = new Map<string, number>();
  private lastFailure: { action: MarketAgentAction; count: number } | null = null;

  constructor(private readonly persona: Persona, seed: string | number) {
    this.random = new Random(`${seed}:policy:${persona.id}:${persona.version}`);
    this.context = new PersonaContext(persona);
  }
  private choose(action: MarketAgentAction, reason: string, multiplier = 1): Decision {
    const p = this.persona.parameters;
    const c = this.currentContext!;
    const demand = .25 + c.novelty * .6 + c.memoryLoad * .5 + c.stress * .75;
    const hesitation = this.random.chance(p.hesitationProbability * demand * (1 - c.support * .55) * (1 - c.familiarity * .25))
      ? this.random.between(1500, 7500) : 0;
    const processing = Math.max(.6, 1 + c.novelty * .25 + c.memoryLoad * .25 + c.stress * .45
      - c.familiarity * .15 - c.support * .12 - c.confidence * .08);
    const pauseReason = hesitation ? ';pause-before-next-step' : '';
    return { action, reason: `${reason}${pauseReason};${this.context.describe(c)}`,
      delayMs: Math.round(this.random.logNormal(p.reactionMedianMs, p.reactionSigma) * multiplier * processing + hesitation) };
  }
  private route(o: Observation, station: MarketEnvironmentStationId, reason: string): Decision {
    if (o.view !== 'world') return this.choose({ type: 'closeView' }, 'close-view-before-walking');
    if (o.activeStation) return this.choose({ type: 'closeStation' }, 'leave-current-station');
    const plan = planWalk(o, station, this.random, this.persona.parameters.walkSpeed);
    if (!plan) {
      this.unavailable.add(station);
      return this.choose({ type: 'viewHelp' }, `route-unavailable:${station}`);
    }
    this.queue = plan;
    this.plannedStation = station;
    const first = this.queue.shift()!;
    first.reason = `${reason};${first.reason};${this.context.describe(this.currentContext!)}`;
    return first;
  }
  private count(objective: Objective): number {
    return Object.entries(this.basket).reduce((sum, [id, quantity]) => {
      const product = this.known.get(id);
      return sum + (product && (matches(product, objective) || this.claimed.get(objective.id) === id) ? quantity : 0);
    }, 0);
  }
  private review(o: Observation) {
    if (!o.cart) return;
    this.basket = { ...o.cart };
    this.claimed.clear();
    this.additionsSinceCheck = 0;
    this.repairs = [];
    for (const [id, quantity] of Object.entries(this.basket)) {
      const product = this.known.get(id);
      const explicitlyWrong = product && (o.feedback?.details ?? this.feedbackDetails).some(detail => detail.startsWith(`${product.name} `) && detail.includes('구매 목록에 없어요'));
      if (product && (explicitlyWrong || !o.objectives.some(obj => matches(product, obj)))) this.repairs.push({ id, quantity });
    }
    for (const objective of o.objectives) {
      let excess = this.count(objective) - objective.quantity;
      for (const [id, quantity] of Object.entries(this.basket)) {
        if (excess <= 0) break;
        const product = this.known.get(id);
        if (product && matches(product, objective)) {
          const removed = Math.min(excess, quantity);
          this.repairs.push({ id, quantity: removed }); excess -= removed;
        }
      }
    }
  }
  onResult(action: MarketAgentAction, before: Observation, after: Observation) {
    this.context.record(action, before, after);
    this.actionsSinceReview++;
    if (after.lastActionError) {
      this.rejectedActionCount++;
      const { at: ignored, ...identity } = action;
      const key = JSON.stringify(identity);
      const count = (this.failedActions.get(key) ?? 0) + 1;
      this.failedActions.set(key, count);
      this.lastFailure = { action, count };
      if (count >= 2 && action.type === 'interact') this.unavailable.add(action.station);
      if (count >= 2 && action.type === 'move' && this.plannedStation) this.unavailable.add(this.plannedStation);
      if (['add', 'remove', 'requestReturn'].includes(action.type)) this.retryNeedsCheck = true;
      if (action.type === 'requestCashier' && after.cashierAvailable) this.helpIntent = null;
      this.queue = []; this.mistakenQuantity = null;
      return;
    }
    for (const product of after.products) { this.known.set(product.id, product); this.stock.set(product.id, after.stock[product.id]); }
    if (action.type === 'interact' && after.products.length) this.visited.add(action.station);
    if (action.type === 'add') {
      this.basket[action.productId] = (this.basket[action.productId] ?? 0) + (action.quantity ?? 1);
      if (this.mistakenQuantity?.id === action.productId) this.basket[action.productId] = this.mistakenQuantity.value;
      this.mistakenQuantity = null;
      this.additionsSinceCheck++;
      this.progress++;
    }
    if (action.type === 'remove' || action.type === 'requestReturn') {
      this.basket[action.productId] = Math.max(0, (this.basket[action.productId] ?? 0) - (action.quantity ?? 1));
      this.repairs = this.repairs.filter(r => r.id !== action.productId);
      this.helpIntent = null;
      this.progress++;
    }
    if (action.type === 'requestCashier') this.helpIntent = null;
    if (action.type === 'viewCart') { this.review(after); this.actionsSinceReview = 0; }
    if (action.type === 'viewHelp') this.helpCheckpoint = `${this.progress}:${after.attempts}:${this.rejectedActionCount}`;
    if (after.feedback?.details) this.feedbackDetails = [...after.feedback.details];
    if (action.type === 'retry') { this.retryNeedsCheck = true; this.claimed.clear(); this.unavailable.clear(); }
  }
  next(o: Observation, remainingMs?: number): Decision {
    const p = this.persona.parameters;
    const c = this.currentContext = this.context.snapshot(o, remainingMs);
    const recheck = p.recheckProbability * (.45 + c.memoryLoad * .8 + c.stress * .6 + c.novelty * .4)
      * (1 - c.support * .35) * (1 - c.familiarity * .25);
    const help = p.helpProbability * (.35 + c.memoryLoad * .5 + c.stress * .7 + c.novelty * .35)
      * (1 - c.confidence * .25);
    if (this.queue.length) {
      const step = this.queue.shift()!;
      if (step.action.type === 'interact') return this.choose(step.action, step.reason);
      return step;
    }
    if (o.phase === 'feedback') {
      const retry = p.retryProbability ** o.attempts * (1 - c.stress * .25) + c.support * .1 + c.confidence * .08;
      const continueTrying = this.random.chance(retry) && o.attempts < 5;
      return this.choose({ type: continueTrying ? 'retry' : 'giveUp' },
        continueTrying ? 'respond-to-visible-checkout-feedback;try-supported-correction' : 'respond-to-visible-checkout-feedback;stop-after-setback', 1.4);
    }
    if (o.lastActionError) {
      // Recovery uses observed rejection and remembered attempts; the same failed primitive cannot loop forever.
      if ((this.lastFailure?.count ?? 0) >= 3 || c.consecutiveErrors >= 4) return this.choose({ type: 'giveUp' }, 'recovery-options-exhausted-after-repeated-rejection');
      if (o.view !== 'world') return this.choose({ type: 'closeView' }, 'recover-rejected-action;close-obstructing-view');
      if (o.activeStation) return this.choose({ type: 'closeStation' }, 'recover-rejected-action;leave-obstructing-station');
      if (this.lastFailure?.action.type === 'interact' && this.lastFailure.count < 2) {
        return this.route(o, this.lastFailure.action.station, 'recover-rejected-action;approach-station-again');
      }
      return this.choose({ type: 'viewHelp' }, 'recover-rejected-action;check-help-before-replanning');
    }
    if (o.view === 'help') return this.choose({ type: 'closeView' }, 'finished-reading-help');
    if (o.view === 'cart') return this.choose({ type: 'closeView' }, 'finished-checking-basket');
    if (this.retryNeedsCheck) { this.retryNeedsCheck = false; return this.choose({ type: 'viewCart' }, 'inspect-basket-after-failed-checkout', 1.3); }
    if (o.phase === 'checkout') {
      if (!o.cashierAvailable) {
        this.helpIntent = 'cashier';
        return this.choose({ type: 'closeStation' }, 'find-employee-for-empty-checkout');
      }
      if (this.random.chance(recheck + o.attempts * .15)) {
        this.review(o);
        if (this.repairs.length || o.objectives.some(obj => this.count(obj) < obj.quantity)) {
          return this.choose({ type: 'closeStation' }, 'checkout-review-found-missing-or-extra-items');
        }
      }
      return this.choose({ type: 'submit' }, 'submit-selected-purchases');
    }
    const staff = o.environment.stationDetails.filter(s => s.kind === 'employee' && !this.unavailable.has(s.id));
    if (this.helpIntent === 'cashier') {
      if (!staff.length) return this.choose({ type: 'giveUp' }, 'no-reachable-employee');
      if (o.activeStation?.startsWith('staff:')) return this.choose({ type: 'requestCashier' }, 'ask-employee-to-open-checkout');
      return this.route(o, staff[0].id, 'seek-checkout-help');
    }
    if (this.repairs.length) {
      const repair = this.repairs[0], product = this.known.get(repair.id)!;
      if (o.activeStation?.startsWith('staff:')) return this.choose({ type: 'requestReturn', productId: repair.id, quantity: repair.quantity }, 'ask-employee-to-return-item');
      if (o.activeStation === product.categoryId) return this.choose({ type: 'remove', productId: repair.id, quantity: repair.quantity }, 'put-corrected-item-back-on-shelf');
      if (staff.length && (this.helpIntent === 'return' || this.random.chance(help))) {
        this.helpIntent = 'return';
        return this.route(o, staff[0].id, 'seek-help-with-return');
      }
      this.helpIntent = null;
      return this.route(o, product.categoryId, 'return-to-item-shelf');
    }
    if (this.additionsSinceCheck && this.random.chance(recheck / 2)) return this.choose({ type: 'viewCart' }, 'recheck-remembered-quantities');
    if ((c.memoryLoad > .55 || c.stress > .5 || c.novelty > .75) && c.support < .65
      && this.helpCheckpoint !== `${this.progress}:${o.attempts}:${this.rejectedActionCount}` && this.random.chance(help * .4)) {
      return this.choose({ type: 'viewHelp' }, 'use-help-for-current-unfamiliar-or-demanding-step');
    }
    const missing = o.objectives.filter(obj => this.count(obj) < obj.quantity);
    if (o.products.length) {
      const availableGoals = missing.filter(obj => o.products.some(prod => matches(prod, obj) && o.stock[prod.id] > 0));
      if (availableGoals.length) {
        const objective = this.random.pick(availableGoals);
        const choices = o.products.filter(prod => matches(prod, objective) && o.stock[prod.id] > 0);
        let product = this.random.weighted(choices, prod => (p.itemPreferenceWeights[prod.id] ?? 1)
          * (1 + this.context.productFamiliarity(prod) * p.familiarityBias) / ((prod.price / 1000) ** p.pricePreference));
        const urgency = remainingMs !== undefined && remainingMs < 45000 ? 1.5 : 1;
        const learning = (1 - p.feedbackLearningRate) ** o.attempts;
        const familiar = this.context.productFamiliarity(product);
        const freshlyConfirmedSimple = this.actionsSinceReview <= 2 && familiar >= .65 && objective.quantity <= 2;
        const lowDemand = c.memoryLoad <= .2 && c.stress <= .25 && familiar >= .65;
        const errorPressure = (.15 + c.novelty * .8 + c.memoryLoad * .65 + c.stress * .95)
          * (1 - familiar * .55) * (1 - c.support * .65) * (1 - c.confidence * .2);
        const causes: string[] = [];
        // Confusion is possible only among similar visible labels in an exact-label task.
        const token = objective.label.split(' ').at(-1)!;
        const similar = o.products.filter(prod => !matches(prod, objective) && prod.name.includes(token) && o.stock[prod.id] > 0);
        if (similar.length && objective.match === 'exact' && !freshlyConfirmedSimple && !lowDemand
          && this.random.chance(p.confusionProbability * learning * urgency * errorPressure)) {
          product = this.random.pick(similar); this.claimed.set(objective.id, product.id);
          causes.push('similar-visible-labels-at-unfamiliar-or-demanding-step');
        }
        const need = objective.quantity - this.count(objective);
        let quantity = Math.min(need, o.stock[product.id]);
        const remembered = (this.basket[product.id] ?? 0) + quantity;
        if (o.objectives.length > 1 && !freshlyConfirmedSimple && !lowDemand && (c.memoryLoad > .2 || c.stress > .25)
          && this.random.chance(p.quantitySlipProbability * learning * urgency * errorPressure)) {
          const selected = quantity > 1 && this.random.chance(.6) ? quantity - 1 : Math.min(quantity + 1, o.stock[product.id]);
          if (selected !== quantity) {
            quantity = selected;
            this.mistakenQuantity = { id: product.id, value: remembered };
            causes.push('several-quantities-to-track-without-fresh-confirmation');
          }
        }
        if (!causes.length) causes.push(familiar >= .65 ? 'use-familiar-product-strategy' : 'compare-current-visible-products');
        return this.choose({ type: 'add', productId: product.id, quantity }, `choose-visible-product-and-remember-quantity;${causes.join(';')}`);
      }
      return this.choose({ type: 'closeStation' }, 'finished-looking-at-shelf');
    }
    if (o.activeStation) return this.choose({ type: 'closeStation' }, 'finished-conversation');
    const shelves = o.environment.stationDetails.filter(s => s.kind === 'shelf' && !this.unavailable.has(s.id));
    if (!missing.length) {
      if (this.additionsSinceCheck && this.random.chance(recheck)) return this.choose({ type: 'viewCart' }, 'final-basket-check');
      const checkouts = o.environment.checkouts.filter(c => !this.unavailable.has(c.id));
      if (!checkouts.length) return this.choose({ type: 'giveUp' }, 'no-reachable-checkout');
      const staffed = checkouts.filter(c => o.cashierAvailability[c.id]);
      const checkout = this.random.weighted(staffed.length ? staffed : checkouts,
        c => 1 / (50 + Math.hypot(c.point.x - o.playerPosition.x, c.point.y - o.playerPosition.y)));
      return this.route(o, checkout.id, 'go-to-checkout');
    }
    const knownTargets = [...this.known.values()].filter(prod => missing.some(obj => matches(prod, obj)) && (this.stock.get(prod.id) ?? 0) > 0);
    const candidates = shelves.filter(s => !this.visited.has(s.id) || knownTargets.some(prod => prod.categoryId === s.id));
    if (!candidates.length) return this.choose({ type: 'giveUp' }, 'observed-stock-cannot-fill-list');
    const exploratory = this.random.chance(p.explorationProbability * (.3 + c.novelty * .7 + c.confidence * .3) * (1 - c.stress * .6));
    const target = this.random.weighted(candidates, station => {
      const known = knownTargets.some(prod => prod.categoryId === station.id);
      const familiar = missing.some(obj => suggestedCategory(obj.label) === station.id);
      const distance = Math.hypot(station.point.x - o.playerPosition.x, station.point.y - o.playerPosition.y);
      const practiced = this.persona.character?.familiarCategories.includes(station.id) ?? false;
      return (exploratory ? 1 : known ? 24 : familiar ? 10 : .8)
        * (practiced ? 1 + p.familiarityBias * .2 : 1) / Math.sqrt(distance + 30);
    });
    return this.route(o, target.id, exploratory ? 'look-around-before-next-purchase' : 'search-for-next-list-item');
  }
}
