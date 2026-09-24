import { isNearMarketStation } from './marketEnvironment';
import type { MarketLearningConfig } from './marketLearning';
import type { MarketSession } from './marketSession';
import { getMarketProduct } from './scenarios';

export type MarketCheckoutReviewState = {
  cartFingerprint: string;
  chargedCart: Record<string, number>;
  initialChargedCart: Record<string, number>;
  /** Research-only metadata. Never include this state object in an actor observation. */
  injectedError: { productId: string; additionalQuantity: 1 } | null;
  origin: 'system-cashier';
  response: string | null;
};
export type MarketCheckoutReviewView = {
  chargedCart: Record<string, number>;
  total: number;
  response: string | null;
};

const positiveCart = (cart: Record<string, number>) => Object.fromEntries(
  Object.entries(cart).filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b, 'en')),
);
export const getMarketCartFingerprint = (cart: Record<string, number>) => JSON.stringify(positiveCart(cart));

function randomFor(seed: string) {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Only the actual basket determines the bill; the shopping objectives are never consulted. */
export function createMarketCheckoutReview(seed: string | number, cart: Record<string, number>, mode: MarketLearningConfig['checkoutReviewMode']): MarketCheckoutReviewState {
  const chargedCart = positiveCart(cart);
  const cartFingerprint = getMarketCartFingerprint(cart);
  const random = randomFor(`${seed}:cashier-review:v1:${cartFingerprint}`);
  const inject = mode === 'overcharge' || (mode === 'random' && random() < 0.5);
  const ids = Object.keys(chargedCart);
  const productId = inject && ids.length ? ids[Math.floor(random() * ids.length)] : null;
  if (productId) chargedCart[productId] += 1;
  return {
    cartFingerprint, chargedCart, initialChargedCart: { ...chargedCart },
    injectedError: productId ? { productId, additionalQuantity: 1 } : null,
    origin: 'system-cashier', response: null,
  };
}

export function isStaffedCheckoutReviewReady(session: MarketSession) {
  const id = session.selectedCheckoutId;
  return session.phase === 'checkout' && session.view === 'world' && id !== null
    && session.activeStation === id && !session.selectedKioskId
    && session.environment.checkouts.some(counter => counter.id === id && counter.kind !== 'kiosk')
    && session.cashierAvailability[id]
    && isNearMarketStation(session.environment, id, session.playerPosition, undefined, session.cashierAvailability);
}

/** This is the only receipt representation returned to the UI or a simulated player. */
export function getMarketCheckoutReview(session: MarketSession): MarketCheckoutReviewView | null {
  const review = session.checkoutReview;
  if (!isStaffedCheckoutReviewReady(session) || !review || review.cartFingerprint !== getMarketCartFingerprint(session.cart)) return null;
  return {
    chargedCart: { ...review.chargedCart },
    total: Object.entries(review.chargedCart).reduce((sum, [id, quantity]) => sum + (getMarketProduct(id)?.price ?? 0) * quantity, 0),
    response: review.response,
  };
}

export function correctMarketCheckoutReview(review: MarketCheckoutReviewState, cart: Record<string, number>, productId: string, quantity: number) {
  const actual = cart[productId] ?? 0;
  const claimMatched = actual > 0 && actual === quantity && Number.isInteger(quantity);
  const corrected = claimMatched && review.chargedCart[productId] !== actual;
  const name = getMarketProduct(productId)?.name;
  const response = claimMatched
    ? corrected ? `확인했어요. ${name} ${quantity}개로 바로잡았어요.` : `확인했어요. ${name} ${quantity}개로 계산되어 있어요.`
    : '물건과 수량을 다시 확인해 주시겠어요?';
  return {
    review: { ...review, chargedCart: { ...review.chargedCart, ...(corrected ? { [productId]: actual } : {}) }, response },
    claimMatched, corrected,
  };
}

export function evaluateMarketCheckoutReview(review: MarketCheckoutReviewState, cart: Record<string, number>) {
  const ids = [...new Set([...Object.keys(cart), ...Object.keys(review.chargedCart)])].sort();
  const details = ids.filter(id => (cart[id] ?? 0) !== (review.chargedCart[id] ?? 0)).map(id =>
    `계산 확인: ${getMarketProduct(id)?.name ?? id}는 장바구니에 ${cart[id] ?? 0}개이고, 계산 내역에는 ${review.chargedCart[id] ?? 0}개예요.`,
  );
  return { success: details.length === 0, details, origin: 'system-cashier' as const };
}
