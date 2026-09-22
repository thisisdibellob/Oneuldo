import type { MarketAgentAction } from '../../frontend/src/game/marketSession';
import type { Observation, Persona } from './types';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
export type PersonaSituation = {
  familiarity: number; novelty: number; memoryLoad: number; stress: number; confidence: number;
  support: number; failures: number; successfulSteps: number; consecutiveErrors: number;
  unreviewedChanges: number;
};

/** Simulation assumptions, not psychological measurements. Only actor-visible outcomes update state.
 * Walking ticks neither accumulate cognitive errors nor erase stress. Prior familiarity concerns
 * activities/products; it does not reveal the current store's layout, stock or hidden objectives.
 */
export class PersonaContext {
  private visits = new Map<string, number>();
  private handled = new Map<string, number>();
  private stress = 0;
  private confidence = .6;
  private support = 0;
  private failures = 0;
  private successfulSteps = 0;
  private consecutiveErrors = 0;
  private unreviewedChanges = 0;
  private feedback: string[] = [];

  constructor(private readonly persona: Persona) {}

  productFamiliarity(product: Observation['products'][number]): number {
    const prior = this.persona.character?.familiarProductIds.includes(product.id) ? .75
      : this.persona.character?.familiarCategories.includes(product.categoryId) ? .5 : .1;
    return clamp(prior + Math.min(.25, (this.handled.get(product.id) ?? 0) * .1));
  }

  snapshot(o: Observation, remainingMs?: number): PersonaSituation {
    const category = o.products[0]?.categoryId;
    const prior = category && this.persona.character?.familiarCategories.includes(category) ? .6 : .15;
    const experience = category ? Math.min(.35, (this.visits.get(category) ?? 0) * .12)
      : Math.min(.3, this.visits.size * .06);
    const familiarity = clamp(prior + experience);
    // A visible basket externalizes memory; prior practice and recent checks also reduce demand.
    const load = (Math.max(0, o.objectives.length - 1) / 4 + this.unreviewedChanges * .14)
      * (o.cart ? .25 : 1) * (1 - this.support * .65) * (1 - familiarity * .3);
    const pressure = remainingMs === undefined ? 0 : clamp((45000 - remainingMs) / 45000) * .25;
    return {
      familiarity, novelty: 1 - familiarity, memoryLoad: clamp(load), stress: clamp(this.stress + pressure),
      confidence: this.confidence, support: this.support, failures: this.failures,
      successfulSteps: this.successfulSteps, consecutiveErrors: this.consecutiveErrors,
      unreviewedChanges: this.unreviewedChanges,
    };
  }

  record(action: MarketAgentAction, before: Observation, after: Observation): void {
    if (after.lastActionError) {
      this.consecutiveErrors++;
      this.stress = clamp(this.stress + .12);
      this.confidence = clamp(this.confidence - .08);
      this.rememberFeedback(after.lastActionError);
      return;
    }
    this.consecutiveErrors = 0;
    if (action.type === 'move') return;
    if (action.type === 'submit' && after.feedback?.success === false) {
      this.failures++;
      const clear = Boolean(after.feedback.details?.length);
      this.stress = clamp(this.stress + (clear ? .1 : .22));
      this.confidence = clamp(this.confidence - .12);
      this.support = clear ? Math.max(this.support, .45) : this.support * .5;
      this.rememberFeedback(clear ? after.feedback.details!.join(' / ') : '결제 결과가 맞지 않지만 구체적인 이유는 아직 보이지 않는다.');
    }
    if (action.type === 'interact' && after.products.length) {
      const category = after.products[0].categoryId;
      const visits = this.visits.get(category) ?? 0;
      if (!visits && !this.persona.character?.familiarCategories.includes(category)) this.stress = clamp(this.stress + .04);
      this.visits.set(category, visits + 1);
      this.support *= .85;
    }
    if (action.type === 'add') {
      this.handled.set(action.productId, (this.handled.get(action.productId) ?? 0) + 1);
      this.unreviewedChanges++;
      this.support *= .6;
      // Accepted operation is progress, not proof that the hidden task answer was correct.
      this.successfulSteps++;
      this.confidence = clamp(this.confidence + .025);
    }
    if (action.type === 'viewCart' && after.cart) {
      this.unreviewedChanges = 0;
      this.support = .9;
      this.stress = clamp(this.stress - .07);
      this.confidence = clamp(this.confidence + .04);
    }
    if (action.type === 'viewHelp') {
      this.support = Math.max(this.support, .65);
      this.stress = clamp(this.stress - .06);
    }
    if (action.type === 'remove' || action.type === 'requestReturn' || action.type === 'requestCashier') {
      this.successfulSteps++;
      this.stress = clamp(this.stress - .12);
      this.confidence = clamp(this.confidence + .08);
      this.support = Math.max(this.support, action.type === 'remove' ? .55 : .9);
      this.rememberFeedback(action.type === 'requestCashier' ? '직원에게 요청한 뒤 계산대 이용이 가능해졌다.' : '선택을 수정하는 행동이 처리되었다.');
    }
    // Compare public feedback only; do not infer a diagnosis or inaccessible evaluation.
    if (after.feedback?.success && !before.feedback?.success) this.confidence = clamp(this.confidence + .15);
  }

  describe(s: PersonaSituation): string {
    return `context(familiarity=${s.familiarity.toFixed(2)},load=${s.memoryLoad.toFixed(2)},stress=${s.stress.toFixed(2)},support=${s.support.toFixed(2)},failures=${s.failures})`;
  }

  memory() {
    return { visitedCategories: Object.fromEntries(this.visits), handledProducts: Object.fromEntries(this.handled),
      recentVisibleFeedback: [...this.feedback], interpretation: 'synthetic contextual estimates; not clinical measurements' };
  }

  private rememberFeedback(value: string) { this.feedback.push(value); this.feedback = this.feedback.slice(-4); }
}
