import { getMarketLayoutSlots, type MarketEnvironment, type MarketEnvironmentConfig, type MarketLayoutId } from './marketEnvironment';
import type { MarketCategoryId } from './scenarios';

const CATEGORY_IDS: readonly MarketCategoryId[] = ['produce', 'fresh', 'household', 'meal', 'drink'];

export type MarketEnvironmentPlan = {
  /** Category assignments to the existing preset's five shelf slots, in preset order. */
  shelfOrder: readonly MarketCategoryId[];
  rationale: string;
};
export type MarketEnvironmentContext = {
  runtimeContext?: import('./marketAdaptivePlan').MarketRuntimeContext;
  preserveShelfOrder: boolean;
  layoutId: MarketLayoutId;
  shelfSlots: Array<{ slotId: string; categoryId: MarketCategoryId; x: number; y: number; orientation: 'horizontal' | 'vertical' }>;
  world: { width: number; height: number };
  spawn: { x: number; y: number };
};

/** Old saved generations may omit the plan; a new generation must include it. */
export function resolveMarketEnvironmentPlan(value: unknown, required = false): MarketEnvironmentPlan | undefined {
  if (value === undefined || value === null) {
    if (required) throw new Error('AI 진열대 추천이 빠져 있어요. 다시 생성해 주세요.');
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('AI 진열대 추천 형식이 올바르지 않아요.');
  const plan = value as Record<string, unknown>;
  const order = plan.shelfOrder;
  if (Object.keys(plan).some(key => !['shelfOrder', 'rationale'].includes(key))
    || !Array.isArray(order) || order.length !== 5 || new Set(order).size !== 5
    || order.some(id => !CATEGORY_IDS.includes(id))
    || typeof plan.rationale !== 'string' || plan.rationale.trim().length === 0 || plan.rationale.length > 160) {
    throw new Error('AI 진열대 추천은 다섯 분류를 한 번씩 배치하고 근거를 포함해야 해요.');
  }
  return { shelfOrder: [...order] as MarketCategoryId[], rationale: plan.rationale };
}

/** Record the current physical map, including category assignments, without the visit's random seed. */
export function getMarketEnvironmentContext(environment: MarketEnvironment, preserveShelfOrder = false): MarketEnvironmentContext {
  const layoutId = environment.config.layoutId ?? 'classic';
  const slots = getMarketLayoutSlots(layoutId).shelves;
  const shelfSlots = slots.map(slot => {
    const assignments = CATEGORY_IDS.filter(id => environment.shelves[id]?.slotId === slot.slotId);
    if (assignments.length !== 1) throw new Error('실제 진열대 배치가 안전한 매장 슬롯과 일치하지 않아요.');
    const categoryId = assignments[0];
    const placement = environment.shelves[categoryId];
    if (![placement.x, placement.y].every(Number.isFinite) || placement.orientation !== slot.orientation) {
      throw new Error('실제 진열대 위치가 올바르지 않아요.');
    }
    return { slotId: placement.slotId, categoryId, x: placement.x, y: placement.y, orientation: placement.orientation };
  });
  return { preserveShelfOrder, layoutId, shelfSlots, world: { ...environment.world }, spawn: { ...environment.spawn } };
}

/** Manual setup choices take precedence over the recommendation. */
export function getMarketMissionEnvironmentConfig(
  plan: MarketEnvironmentPlan | undefined, overrides: Partial<MarketEnvironmentConfig> = {},
): Partial<MarketEnvironmentConfig> {
  const resolved = resolveMarketEnvironmentPlan(plan);
  return { ...(resolved ? { shelfOrder: resolved.shelfOrder } : {}), ...overrides };
}

/** Relabel existing safe fixtures, preserving people, obstacles, spawn, seed and checkout availability. */
export function applyMarketEnvironmentPlan(environment: MarketEnvironment, plan?: MarketEnvironmentPlan): MarketEnvironment {
  const resolved = resolveMarketEnvironmentPlan(plan);
  if (!resolved) return environment;
  const context = getMarketEnvironmentContext(environment);
  const copy = JSON.parse(JSON.stringify(environment)) as MarketEnvironment;
  const placements = context.shelfSlots.map(slot => environment.shelves[slot.categoryId]);
  resolved.shelfOrder.forEach((categoryId, index) => {
    copy.shelves[categoryId] = JSON.parse(JSON.stringify(placements[index]));
    copy.stations[categoryId] = { ...copy.shelves[categoryId].point };
  });
  copy.config.shelfOrder = [...resolved.shelfOrder];
  copy.stationDetails = copy.stationDetails.map(station => station.kind === 'shelf' && station.categoryId
    ? { ...station, point: { ...copy.shelves[station.categoryId].point } } : station);
  return copy;
}
