import type { MarketStoredEpisode } from './marketEpisodeStore';
import type { MarketSessionConfig } from './marketSession';
import { getMarketProduct } from './scenarios';

export type ShoppingErrandPhase = 'offered' | 'deferred' | 'accepted' | 'budget-review' | 'ready' | 'delivered';
export type ShoppingErrandPurchase = {
  episodeId: string; cart: Record<string, number>; total: number; purchasedAt: number;
  replacementId: string | null; unavailableReason: string | null;
};
export type ShoppingErrand = {
  id: string; phase: ShoppingErrandPhase; offeredAt: number; acceptedAt: number | null;
  budget: number; approvedBudget: number; allowSubstitution: boolean; stockoutEnabled: boolean;
  boundSessionId: string | null; marketStartedAt: number | null; purchase: ShoppingErrandPurchase | null;
  deliveredAt: number | null; error: string | null;
};
export type ShoppingErrandAction =
  | { type: 'accept' | 'defer'; at: number }
  | { type: 'market-started'; sessionId: string; at: number }
  | { type: 'market-finished'; episode: MarketStoredEpisode }
  | { type: 'approve-budget'; amount: number }
  | { type: 'deliver'; at: number };

export function createShoppingErrand({ id, offeredAt, allowSubstitution = true, stockoutEnabled = true }: {
  id: string; offeredAt: number; allowSubstitution?: boolean; stockoutEnabled?: boolean;
}): ShoppingErrand {
  const budget = getMarketProduct('milk')!.price + getMarketProduct('apple')!.price * 2;
  return { id, offeredAt, phase: 'offered', acceptedAt: null, budget, approvedBudget: budget, allowSubstitution, stockoutEnabled,
    boundSessionId: null, marketStartedAt: null, purchase: null, deliveredAt: null, error: null };
}

export function getShoppingErrandMarketConfig(errand: ShoppingErrand, { sessionId, startedAt, seed }: {
  sessionId: string; startedAt: string; seed?: string | number;
}): Partial<MarketSessionConfig> {
  return { sessionId, startedAt, seed: seed ?? sessionId, difficulty: 'exact',
    objectives: [{ productId: 'milk', quantity: 1, match: 'exact' }, { productId: 'apple', quantity: 2, match: 'exact' }],
    learning: { stockoutEnabled: errand.stockoutEnabled, allowSubstitution: errand.allowSubstitution,
      budgetChoiceEnabled: false, checkoutReviewMode: 'normal' }, provenance: { source: 'human', notes: `shopping-errand:${errand.id}` } };
}

const fail = (state: ShoppingErrand, error: string): ShoppingErrand => ({ ...state, error });
const cartMatches = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, count]) => b[id] === count);

/** A bound, paid receipt is required; opening the shop or finishing another mission cannot supply goods. */
export function reduceShoppingErrand(state: ShoppingErrand, action: ShoppingErrandAction): ShoppingErrand {
  if (state.phase === 'delivered') return state;
  if (action.type === 'accept') return ['offered', 'deferred'].includes(state.phase) && Number.isFinite(action.at) && action.at >= state.offeredAt
    ? { ...state, phase: 'accepted', acceptedAt: action.at, error: null } : state;
  if (action.type === 'defer') return ['offered', 'deferred'].includes(state.phase) ? { ...state, phase: 'deferred', error: null } : state;
  if (action.type === 'approve-budget') {
    if (!['accepted', 'budget-review'].includes(state.phase) || !Number.isInteger(action.amount)
      || action.amount < state.approvedBudget || action.amount > 10000) return state;
    return { ...state, approvedBudget: action.amount,
      phase: state.purchase && state.purchase.total <= action.amount ? 'ready' : state.phase, error: null };
  }
  if (action.type === 'market-started') return state.phase === 'accepted' && state.acceptedAt !== null && action.at >= state.acceptedAt && action.sessionId.trim()
    ? { ...state, boundSessionId: action.sessionId, marketStartedAt: action.at, error: null } : state;
  if (action.type === 'deliver') {
    if (state.phase !== 'ready' || !state.purchase) return fail(state, state.phase === 'budget-review' ? '예산을 넘긴 금액을 먼저 민수에게 알려 주세요.' : '계산을 마친 물건이 있어야 전달할 수 있어요.');
    return Number.isFinite(action.at) && action.at >= state.purchase.purchasedAt
      ? { ...state, phase: 'delivered', deliveredAt: action.at, error: null } : state;
  }
  if (state.phase !== 'accepted' || action.type !== 'market-finished') return state;
  const episode = action.episode;
  if (!state.boundSessionId || state.acceptedAt === null || state.marketStartedAt === null
    || episode.sessionId !== state.boundSessionId || episode.provenance.source !== 'human'
    || !Number.isFinite(Date.parse(episode.config.startedAt)) || Date.parse(episode.config.startedAt) < state.marketStartedAt) return state;
  if (episode.outcome !== 'success' || !episode.paid) return fail(state, '아직 구매가 완료되지 않았어요. 마트에서 다시 확인해요.');
  const requested = episode.config.objectives ?? [];
  if (requested.length !== 2 || !requested.some(item => item.productId === 'milk' && item.quantity === 1 && item.match === 'exact')
    || !requested.some(item => item.productId === 'apple' && item.quantity === 2 && item.match === 'exact'))
    return fail(state, '민수가 부탁한 목록으로 시작한 장보기 기록이 필요해요.');
  const submitted = episode.events.findLast(event => event.type === 'purchase_submitted' && event.payload.purchaseSuccess === true);
  const finished = episode.events.findLast(event => event.type === 'session_finished' && event.payload.paid === true && event.payload.outcome === 'success');
  if (!submitted || !finished || finished.sequence <= submitted.sequence
    || !cartMatches(episode.finalCart, submitted.payload.cart as Record<string, number> ?? {})
    || !cartMatches(episode.finalCart, finished.payload.cart as Record<string, number> ?? {}))
    return fail(state, '결제가 확인된 장보기 기록이 필요해요.');
  const purchasedAt = Date.parse(finished.timestamp);
  if (!Number.isFinite(purchasedAt) || purchasedAt < state.marketStartedAt) return state;
  const task = episode.learning.stockout;
  let milkId: string | null = 'milk'; let unavailableReason: string | null = null;
  if (task?.status === 'replacement-approved') {
    const product = task.approvedProductId ? getMarketProduct(task.approvedProductId) : undefined;
    if (!state.allowSubstitution || !task.staffChecked || task.requestedProductId !== 'milk' || task.requestedQuantity !== 1
      || !product || (product.familyId ?? product.id) !== 'milk'
      || !episode.events.some(event => event.type === 'substitution_approved'
        && (event.payload.approvedObjective as { productId?: string } | undefined)?.productId === product.id))
      return fail(state, '우유를 바꾸기 전에 민수에게 확인해 주세요.');
    milkId = product.id;
  } else if (task?.status === 'waived') {
    if (!task.staffChecked || task.requestedProductId !== 'milk' || task.requestedQuantity !== 1
      || !episode.events.some(event => event.type === 'unavailable_reported' && event.payload.reason === task.resolutionReason)
      || !(task.resolutionReason === 'no-substitute-in-stock' || task.resolutionReason === 'replacement-not-allowed'))
      return fail(state, '우유를 사지 못한 이유를 먼저 알려 주세요.');
    milkId = null; unavailableReason = task.resolutionReason;
  } else if (task && task.status === 'unresolved') return fail(state, '품절된 우유를 어떻게 할지 민수와 확인해 주세요.');
  const expected: Record<string, number> = { apple: 2, ...(milkId ? { [milkId]: 1 } : {}) };
  if (!cartMatches(expected, episode.finalCart)) return fail(state, '부탁한 수량은 우유 1개와 사과 2개예요. 구매 내역을 확인해 주세요.');
  const total = Object.entries(episode.finalCart).reduce((sum, [id, count]) => sum + (getMarketProduct(id)?.price ?? 0) * count, 0);
  const purchase = { episodeId: episode.sessionId, cart: { ...episode.finalCart }, total, purchasedAt,
    replacementId: milkId && milkId !== 'milk' ? milkId : null, unavailableReason };
  return { ...state, purchase, phase: total <= state.approvedBudget ? 'ready' : 'budget-review', error: null };
}

export function getShoppingErrandDeliveryText(errand: ShoppingErrand): string {
  if (!errand.purchase) return '흰 우유 1개와 사과 2개를 부탁받았어요.';
  const { cart, replacementId, unavailableReason, total } = errand.purchase;
  const items = Object.entries(cart).map(([id, count]) => `${getMarketProduct(id)!.name} ${count}개`).join(', ');
  const reason = unavailableReason ? unavailableReason === 'replacement-not-allowed'
    ? '우유는 품절이고 다른 상품으로 바꾸기 어려워서 사지 못했어. ' : '우유는 품절이고 대신 살 상품도 없어서 사지 못했어. ' : '';
  const replaced = replacementId ? `물어본 대로 ${getMarketProduct(replacementId)!.name}로 바꿨어. ` : '';
  return `${reason}${replaced}${items}를 샀어. ${total.toLocaleString('ko-KR')}원이야.`;
}
