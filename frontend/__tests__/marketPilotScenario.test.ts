import { createHash } from 'node:crypto';
import { HARD_BASELINE_SCENARIO_ID, pilotScenario } from '../src/replay/pilotScenario';
import { HARD_SHARED_ENVIRONMENT_ID, pilotEnvironment, pilotSessionConfig } from '../src/replay/pilotEnvironment';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { applyMarketEnvironmentPlan, getMarketEnvironmentContext } from '../src/game/marketEnvironmentPlan';
import { createMissionSession } from '../src/game/marketMissionSession';
import { marketCatalogProducts, MARKET_CATALOG_VERSION, MARKET_SCENARIO_VERSION } from '../src/game/marketContent';
import { evaluateMarketCart, getMarketProduct, marketCategories } from '../src/game/scenarios';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function baseline() {
  const mission = pilotScenario(true, HARD_BASELINE_SCENARIO_ID)!;
  const environment = createMarketEnvironment(pilotEnvironment(true, HARD_SHARED_ENVIRONMENT_ID)!);
  const session = createMissionSession({ seed: environment.seed, ...pilotSessionConfig(true, HARD_SHARED_ENVIRONMENT_ID) }, mission, environment);
  return { mission, environment, session };
}

test('fixed control mission is unavailable outside development replay', () => {
  expect(pilotScenario(false, 'S01')).toBeNull();
  expect(pilotScenario(true)).toBeNull();
});
test('explicit pilot scenario is deterministic; an invalid scenario is not silently substituted', () => {
  expect(pilotScenario(true, 'S01')).toEqual(pilotScenario(true, 'S01'));
  expect(pilotScenario(true, 'S01')?.scenarioId).toBe('S01');
  expect(() => pilotScenario(true, 'UNKNOWN')).toThrow();
});

test('hard baseline uses achievable shared-catalog requirements and unchanged content versions', () => {
  const { mission, session } = baseline();
  expect(mission).toMatchObject({ id: 'market-pilot-hard-baseline-v1', scenarioId: 'CUSTOM',
    catalogVersion: MARKET_CATALOG_VERSION, scenarioVersion: MARKET_SCENARIO_VERSION, budget: 22000 });
  expect(mission.objectives.map(({ productId, quantity }) => ({ productId, quantity }))).toEqual([
    { productId: 'milk', quantity: 2 }, { productId: 'banana', quantity: 1 },
    { productId: 'instant-rice', quantity: 2 }, { productId: 'water', quantity: 3 },
  ]);
  for (const objective of mission.objectives) {
    expect(marketCatalogProducts.some(product => product.id === objective.productId)).toBe(true);
    expect(objective.acceptedProductIds).toBeUndefined();
    expect(session.initialStock[objective.productId]).toBe(6);
  }
  expect(evaluateMarketCart({ milk: 2, banana: 1, 'instant-rice': 2, water: 3 }, mission))
    .toMatchObject({ success: true, total: 19400, overBudget: 0 });
  expect(evaluateMarketCart({ 'milk-small': 2, 'banana-single': 1, 'instant-rice-single': 2, 'water-large': 3 }, mission).success).toBe(false);
  expect(session.config.learning).toMatchObject({ stockoutEnabled: false, budgetChoiceEnabled: false, checkoutReviewMode: 'normal' });
  expect(session.learning.stockout).toBeNull();
  expect(session.learning.choiceTask).toBeNull();
  expect(session.objectives[2]).toMatchObject({ label: '즉석밥 210g · 3개입 제품', quantity: 2, quantityUnit: '개' });
  expect(mission.briefing).toEqual(['목록에 필요한 물건을 골라요.', '상품의 규격과 구매 단위를 보고 목록과 비교해요.']);
});

test('all actual shelves retain twelve distinct real products, targets and unit contrasts', () => {
  const { session } = baseline();
  for (const category of marketCategories) {
    const ids = session.shelfSlots[category.id];
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    for (const id of ids) expect(getMarketProduct(id)?.categoryId).toBe(category.id);
  }
  expect(Object.values(session.shelfSlots).flat()).toEqual(expect.arrayContaining([
    'milk', 'banana', 'instant-rice', 'water', 'milk-small', 'milk-large',
    'banana-single', 'instant-rice-single', 'water-small', 'water-large',
  ]));
});

test('pilot environment and session controls are unavailable when disabled or unselected', () => {
  expect(pilotScenario(false, HARD_BASELINE_SCENARIO_ID)).toBeNull();
  expect(pilotEnvironment(false, HARD_SHARED_ENVIRONMENT_ID)).toBeNull();
  expect(pilotEnvironment(true)).toBeNull();
  expect(pilotSessionConfig(false, HARD_SHARED_ENVIRONMENT_ID)).toBeUndefined();
  expect(pilotSessionConfig(true)).toBeUndefined();
  expect(() => pilotEnvironment(true, 'UNKNOWN')).toThrow();
});

test('returned fixture instances cannot change later task or environment conditions', () => {
  const first = baseline();
  first.mission.objectives[0].quantity = 3;
  first.mission.briefing.push('altered');
  first.environment.config.cashierCount = 0;
  const config = pilotEnvironment(true, HARD_SHARED_ENVIRONMENT_ID)!;
  (config.shelfOrder as string[])[0] = 'drink';
  const next = baseline();
  expect(next.mission.objectives[0].quantity).toBe(2);
  expect(next.mission.briefing).toHaveLength(2);
  expect(next.environment.config.cashierCount).toBe(2);
  expect(next.environment.config.shelfOrder).toEqual(['produce', 'fresh', 'household', 'meal', 'drink']);
});

test('three personas share unchanged pre/post conditions while AI practice may relabel shelves', () => {
  const condition = ({ mission, environment, session }: ReturnType<typeof baseline>) => ({
    mission, environment, shelfSlots: session.shelfSlots, initialStock: session.initialStock,
    difficulty: session.config.difficulty, learning: session.config.learning,
  });
  const initialHash = hash(condition(baseline()));
  for (const persona of ['minjae', 'seoyeon', 'minsu']) {
    const before = baseline();
    expect(hash(condition(before))).toBe(initialHash);
    expect(before.environment.seed).toBe(HARD_SHARED_ENVIRONMENT_ID);
    expect(before.environment.employees).toHaveLength(1);
    expect(before.environment.customers).toHaveLength(1);
    expect(before.environment.checkouts.every(checkout => checkout.cashierPresent)).toBe(true);
    expect(before.environment.kiosks).toHaveLength(0);
    expect(getMarketEnvironmentContext(before.environment).preserveShelfOrder).toBe(false);
    const practice = applyMarketEnvironmentPlan(before.environment, {
      shelfOrder: ['drink', 'meal', 'fresh', 'produce', 'household'], rationale: `${persona}의 추천 매대 순서`,
    });
    expect(practice.config.shelfOrder).toEqual(['drink', 'meal', 'fresh', 'produce', 'household']);
    expect(practice.employees).toEqual(before.environment.employees);
    expect(practice.customers).toEqual(before.environment.customers);
    expect(practice.checkouts).toEqual(before.environment.checkouts);
    expect(hash(condition(baseline()))).toBe(initialHash);
  }
});
