import catalog from '../../../shared/market/catalog.json';
import scenarios from '../../../shared/market/quests.json';
import runtime from '../../../shared/market/runtime.json';

export const MARKET_CATALOG_VERSION = catalog.content_version;
export const MARKET_SCENARIO_VERSION = runtime.version;
export const MARKET_INITIAL_STOCK = runtime.initialStockPerSku;
export const MARKET_CONTENT_DISCLAIMER = catalog.disclaimer_ko;
export const MARKET_SUPPORT_OPTIONS = runtime.implementedSupportOptions;
export const marketCatalogProducts = catalog.products.map((product) => ({
  id: product.id, categoryId: product.category_id as 'fresh' | 'produce' | 'meal' | 'drink',
  name: product.name, detail: product.detail, price: product.price_won,
  salesUnit: product.sales_unit, storage: product.storage,
  attributes: product.attributes as unknown as Record<string, string | number>, initialStock: MARKET_INITIAL_STOCK,
}));

type ScenarioDefinition = {
  id: string; title: string; budget_won: number;
  objectives: Array<{ id: string; label: string; quantity: number; match: Record<string, string | number> }>;
  mandatory_skus: string[]; distractor_skus: string[];
};
export const marketScenarioDefinitions = scenarios.quests;
export const enabledMarketScenarios = (scenarios.quests as ScenarioDefinition[])
  .filter((scenario) => runtime.enabledScenarioIds.includes(scenario.id))
  .map((scenario) => ({
    id: scenario.id, title: scenario.title, budget: scenario.budget_won,
    objectives: scenario.objectives.map((objective) => ({
      productId: objective.id, quantity: objective.quantity, label: objective.label,
      match: objective.match,
      acceptedProductIds: marketCatalogProducts.filter((product) =>
        Object.entries(objective.match).every(([key, value]) => product.attributes[key] === value),
      ).map((product) => product.id),
    })),
    mandatoryProductIds: scenario.mandatory_skus, distractorProductIds: scenario.distractor_skus,
    supportedOptions: MARKET_SUPPORT_OPTIONS,
  }));

export function getEnabledMarketScenario(id: string) {
  const scenario = enabledMarketScenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error('아직 실행할 수 없는 장보기 시나리오입니다.');
  return scenario;
}

if (MARKET_CATALOG_VERSION !== runtime.catalogVersion || marketCatalogProducts.length !== 60
  || new Set(marketCatalogProducts.map((product) => product.id)).size !== 60) {
  throw new Error('장보기 공통 콘텐츠 버전 또는 상품 ID가 올바르지 않습니다.');
}
