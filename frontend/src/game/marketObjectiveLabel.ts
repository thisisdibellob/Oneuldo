import { getMarketProduct, type MarketObjective } from './scenarios';

/** Displays the mission's requirements, without judging the player's selection. */
export function marketObjectiveLabel(objective: MarketObjective): string {
  // Preset labels express allowed variants (e.g. S02 apples of either variety).
  if (objective.label?.trim()) {
    const label = objective.label.trim();
    const suffix = `${objective.quantity}${getMarketProduct(objective.productId)?.salesUnit ?? '개'}`;
    return label.endsWith(suffix) ? label.slice(0, -suffix.length).trim() : label;
  }
  const ids = objective.acceptedProductIds?.length ? objective.acceptedProductIds : [objective.productId];
  return ids.map(id => {
    const product = getMarketProduct(id);
    if (!product) throw new Error(`구매 목록에 등록되지 않은 상품이 있어요: ${id}`);
    return `${product.name} ${product.detail}`.trim();
  }).join(' 또는 ');
}
