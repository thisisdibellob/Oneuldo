import { getObjectiveProductIds, marketProducts, type MarketMission } from './scenarios';

/** Content contrasts, never an ability judgment. Accepted variants remain valid answers. */
export function getMarketContrastProductIds(mission: MarketMission): string[] {
  const targets = new Set(mission.objectives.flatMap(getObjectiveProductIds));
  const selected = marketProducts.filter(product => targets.has(product.id));
  return marketProducts.filter(product => selected.some(target =>
    product.categoryId === target.categoryId
    && product.attributes.kind === target.attributes.kind
    && product.attributes.flavor === target.attributes.flavor
    && product.attributes.brand === target.attributes.brand
    && (product.detail !== target.detail || product.salesUnit !== target.salesUnit)
  )).map(product => product.id);
}
