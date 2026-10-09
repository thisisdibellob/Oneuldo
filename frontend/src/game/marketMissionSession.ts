import { createMarketSession, type MarketSessionConfig } from './marketSession';
import type { MarketEnvironment } from './marketEnvironment';
import { getMarketContrastProductIds } from './marketAlternatives';
import { enabledMarketScenarios } from './marketContent';
import { getMarketProduct, marketCategories, marketProducts, type MarketMission } from './scenarios';
import { marketObjectiveLabel } from './marketObjectiveLabel';

/** Preserve task targets, accepted variants, and packaging contrasts in the rendered shelf. */
export function createMissionSession(config: Partial<MarketSessionConfig>, mission?: MarketMission, environment?: MarketEnvironment) {
  if (!mission) return createMarketSession(config, environment);
  const missionConfig = { ...config, difficulty: 'exact' as const,
    objectives: mission.objectives.map(({ productId, quantity }) => ({ productId, quantity, match: 'exact' as const })) };
  const draft = createMarketSession(missionConfig, environment);
  const preset = enabledMarketScenarios.find(candidate => candidate.id === mission.scenarioId);
  const required = new Set([
    ...mission.objectives.flatMap(objective => [objective.productId, ...(objective.acceptedProductIds ?? [])]),
    ...getMarketContrastProductIds(mission),
    ...(preset?.mandatoryProductIds ?? []), ...(preset?.distractorProductIds ?? []),
    ...(mission.scene?.products.map(product => product.id) ?? []),
  ]);
  const inventoryProductIds = { ...draft.shelfSlots };
  for (const category of marketCategories) {
    const mandatory = marketProducts.filter(product => product.categoryId === category.id && required.has(product.id)).map(product => product.id);
    if (mandatory.length > 12) throw new Error('시나리오 필수 상품이 진열대 용량을 초과했어요.');
    inventoryProductIds[category.id] = [...mandatory, ...draft.shelfSlots[category.id].filter(id => !required.has(id))].slice(0, 12);
  }
  const session = createMarketSession({ ...draft.config, inventoryProductIds }, draft.environment);
  return { ...session, objectives: session.objectives.map((objective, index) => ({
    ...objective, label: marketObjectiveLabel(mission.objectives[index]),
    quantityUnit: getMarketProduct(objective.productId)?.salesUnit ?? '개',
  })) };
}
