import { createMarketSession, type MarketSessionConfig } from './marketSession';
import type { MarketEnvironment } from './marketEnvironment';
import { getMarketContrastProductIds } from './marketAlternatives';
import { enabledMarketScenarios } from './marketContent';
import { getMarketProduct, marketCategories, marketProducts, type MarketMission } from './scenarios';
import { marketObjectiveLabel } from './marketObjectiveLabel';
import { getMarketMissionEnvironmentConfig } from './marketEnvironmentPlan';
import { resolveMarketRuntimePlan, runtimeSessionConfig } from './marketAdaptivePlan';

/** Preserve task targets, accepted variants, and packaging contrasts in the rendered shelf. */
export function createMissionSession(config: Partial<MarketSessionConfig>, mission?: MarketMission, environment?: MarketEnvironment, manualOverride=false) {
  if (!mission) return createMarketSession(config, environment);
  const runtime=resolveMarketRuntimePlan(mission.runtimePlan);
  const adaptive=runtime?runtimeSessionConfig(runtime):{};
  const selected=manualOverride?{...adaptive,...config}:{...config,...adaptive};
  const listChanged=config.objectives&&JSON.stringify(config.objectives.map(({productId,quantity})=>({productId,quantity})))!==JSON.stringify(mission.objectives.map(({productId,quantity})=>({productId,quantity})));
  const objectives=manualOverride&&listChanged?config.objectives!:mission.objectives;
  const missionConfig = { ...selected, difficulty: (runtime||manualOverride?selected.difficulty:undefined) ?? 'exact' as const,
    // Adaptive plans carry executable practice conditions; legacy quests retain their original semantics.
    learning: runtime||manualOverride?selected.learning:{ ...config.learning, stockoutEnabled: false, budgetChoiceEnabled: false, checkoutReviewMode: 'normal' as const },
    environment: { ...getMarketMissionEnvironmentConfig(mission.environmentPlan, selected.environment), kioskLane: selected.environment?.kioskLane ?? 'none' as const },
    objectives: objectives.map(({ productId, quantity }) => ({ productId, quantity, match: (runtime||manualOverride?selected.difficulty:undefined) ?? 'exact' as const })) };
  const draft = createMarketSession(missionConfig, environment);
  const preset = enabledMarketScenarios.find(candidate => candidate.id === mission.scenarioId);
  const required = new Set([
    ...objectives.flatMap(objective => [objective.productId, ...('acceptedProductIds' in objective?objective.acceptedProductIds??[]:[])]),
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
    ...objective, label: marketObjectiveLabel(objectives[index]),
    quantityUnit: getMarketProduct(objective.productId)?.salesUnit ?? '개',
  })) };
}
