import { applyMarketAction, createMarketSession, exportMarketEpisode, getMarketObservation, type MarketAction, type MarketSession, type MarketSessionConfig } from '../src/game/marketSession';
import { createMarketCheckoutReview, getMarketCheckoutReview } from '../src/game/marketCheckoutReview';
import { normalizeMarketLearningConfig } from '../src/game/marketLearning';
import type { MarketEnvironmentStationId } from '../src/game/marketEnvironment';
import { getMarketProduct } from '../src/game/scenarios';

function session(mode: 'normal' | 'overcharge' | 'random' = 'overcharge', overrides: Partial<MarketSessionConfig> = {}) {
  return createMarketSession({ seed: 'cashier-review-test', objectives: [{ productId: 'milk', quantity: 1, match: 'exact' }, { productId: 'apple', quantity: 1, match: 'exact' }],
    ...overrides, learning: { stockoutEnabled: false, budgetChoiceEnabled: false, checkoutReviewMode: mode, ...overrides.learning },
    environment: { cashierCount: 2, kioskLane: 'none', ...overrides.environment } });
}
function visit(game: MarketSession, station: MarketEnvironmentStationId) {
  game = applyMarketAction(game, { type: 'setPosition', point: game.environment.stations[station] });
  expect(game.lastActionError).toBeNull();
  game = applyMarketAction(game, { type: 'interact', station });
  expect(game.lastActionError).toBeNull();
  return game;
}
function add(game: MarketSession, productId: string, quantity = 1) {
  game = visit(game, getMarketProduct(productId)!.categoryId);
  game = applyMarketAction(game, { type: 'add', productId, quantity });
  expect(game.lastActionError).toBeNull();
  return game;
}
function basket(mode: 'normal' | 'overcharge' | 'random' = 'overcharge', overrides: Partial<MarketSessionConfig> = {}) {
  return add(add(session(mode, overrides), 'milk'), 'apple');
}
function correct(game: MarketSession, productId = game.checkoutReview!.injectedError!.productId, quantity = game.cart[productId]) {
  return applyMarketAction(game, { type: 'requestCheckoutCorrection', productId, quantity });
}

it('keeps old presets normal and validates the three explicit modes', () => {
  expect(normalizeMarketLearningConfig().checkoutReviewMode).toBe('normal');
  expect(createMarketSession({ learning: { stockoutEnabled: false } }).config.learning?.checkoutReviewMode).toBe('normal');
  expect(() => normalizeMarketLearningConfig({ checkoutReviewMode: 'always-wrong' as never })).toThrow('계산 확인');
  const game = visit(basket('normal'), 'checkout');
  expect(game.checkoutReview!.chargedCart).toEqual(game.cart);
  expect(game.checkoutReview!.injectedError).toBeNull();
  const checked = correct(game, 'milk', 1);
  expect(checked.checkoutReview!.chargedCart).toEqual(game.cart);
  expect(getMarketCheckoutReview(checked)?.response).toContain('계산되어 있어요');
  expect(checked).toMatchObject({ attempts: 0, score: 100, penaltyPoints: 0 });
  expect(applyMarketAction(checked, { type: 'submit' })).toMatchObject({ phase: 'finished', outcome: 'success', attempts: 1, paid: true });
});

it('adds exactly one charge to a held SKU and computes the visible bill using catalog prices', () => {
  const game = visit(basket(), 'checkout');
  const review = game.checkoutReview!;
  const wrongId = review.injectedError!.productId;
  expect(Object.keys(review.chargedCart).sort()).toEqual(Object.keys(game.cart).sort());
  expect(Object.entries(game.cart).map(([id, count]) => review.chargedCart[id] - count).sort()).toEqual([0, 1]);
  expect(review.chargedCart[wrongId]).toBe(game.cart[wrongId] + 1);
  expect(getMarketCheckoutReview(game)).toEqual({ chargedCart: review.chargedCart,
    total: Object.entries(review.chargedCart).reduce((sum, [id, quantity]) => sum + getMarketProduct(id)!.price * quantity, 0), response: null });
  expect(createMarketCheckoutReview('empty', {}, 'overcharge').injectedError).toBeNull();
});

it('uses independent deterministic fifty-percent random scenarios and ignores cart insertion order', () => {
  let errors = 0;
  for (let seed = 0; seed < 120; seed++) {
    const first = createMarketCheckoutReview(seed, { milk: 1, apple: 2 }, 'random');
    expect(createMarketCheckoutReview(seed, { apple: 2, milk: 1 }, 'random')).toEqual(first);
    if (first.injectedError) errors++;
  }
  expect(errors).toBeGreaterThan(40);
  expect(errors).toBeLessThan(80);
  expect(session('normal').environment).toEqual(session('overcharge').environment);
});

it('answers incorrect item or count claims neutrally and changes only the correctly disputed line', () => {
  const original = visit(basket(), 'checkout');
  const wrongId = original.checkoutReview!.injectedError!.productId;
  const otherId = Object.keys(original.cart).find(id => id !== wrongId)!;
  const wrongCount = correct(original, wrongId, original.cart[wrongId] + 1);
  const wrongItem = correct(wrongCount, 'curry', 1);
  const normalLine = correct(wrongItem, otherId, original.cart[otherId]);
  expect(wrongCount.checkoutReview!.response).toBe('물건과 수량을 다시 확인해 주시겠어요?');
  expect(wrongItem.checkoutReview!.response).toBe(wrongCount.checkoutReview!.response);
  expect(normalLine.checkoutReview!.chargedCart).toEqual(original.checkoutReview!.chargedCart);
  const fixed = correct(normalLine, wrongId);
  expect(fixed.checkoutReview!.chargedCart).toEqual(original.cart);
  expect(fixed.checkoutReview!.response).toContain('바로잡았어요');
  const repeated = correct(fixed, wrongId);
  expect(repeated.checkoutReview!.chargedCart).toEqual(fixed.checkoutReview!.chargedCart);
  expect(repeated.checkoutReview!.response).toContain('계산되어 있어요');
  for (const game of [wrongCount, wrongItem, normalLine, fixed, repeated]) {
    expect(game.lastActionError).toBeNull();
    expect(game).toMatchObject({ cart: original.cart, stock: original.stock, objectives: original.objectives,
      attempts: 0, score: 100, penaltyPoints: 0, phase: 'checkout' });
  }
});

it('checks a claim against held items rather than revealing the shopping-list answer', () => {
  let game = visit(add(basket(), 'milk'), 'checkout');
  game = correct(game, 'milk', 2);
  expect(game.checkoutReview!.chargedCart.milk).toBe(2);
  expect(game.checkoutReview!.response).toContain('2개');
  expect(game.objectives.find(item => item.productId === 'milk')!.quantity).toBe(1);
  const submitted = applyMarketAction(game, { type: 'submit' });
  expect(submitted).toMatchObject({ phase: 'feedback', feedback: { success: false }, attempts: 1 });
  expect(submitted.feedback).not.toHaveProperty('details');
});

it('keeps the same receipt and correction when closing, switching counters and retrying without basket changes', () => {
  const original = visit(basket(), 'checkout');
  const fingerprint = original.checkoutReview!.cartFingerprint;
  const reopened = visit(applyMarketAction(original, { type: 'closeStation' }), 'checkout-2');
  expect(reopened.checkoutReview).toEqual(original.checkoutReview);
  const failed = applyMarketAction(reopened, { type: 'submit' });
  expect(failed.feedback).toEqual({ success: false });
  const retried = visit(applyMarketAction(failed, { type: 'retry' }), 'checkout');
  expect(retried.checkoutReview).toEqual(original.checkoutReview);
  const fixed = correct(retried);
  const fixedReopened = visit(applyMarketAction(fixed, { type: 'closeStation' }), 'checkout-2');
  expect(fixedReopened.checkoutReview).toEqual(fixed.checkoutReview);
  expect(fixedReopened.checkoutReview!.cartFingerprint).toBe(fingerprint);
  expect(fixedReopened.events.filter(event => event.type === 'checkout_bill_generated')).toHaveLength(1);
  expect(applyMarketAction(fixedReopened, { type: 'submit' })).toMatchObject({ attempts: 2, outcome: 'success' });
});

it('invalidates an old bill and reply only when the basket changes', () => {
  let game = correct(visit(basket(), 'checkout'));
  const before = game.checkoutReview!;
  game = add(applyMarketAction(game, { type: 'closeStation' }), 'milk');
  expect(game.checkoutReview).toBeNull();
  expect(getMarketCheckoutReview(game)).toBeNull();
  game = visit(game, 'checkout');
  expect(game.checkoutReview!.cartFingerprint).not.toBe(before.cartFingerprint);
  expect(game.checkoutReview!.response).toBeNull();
  expect(game.events.filter(event => event.type === 'checkout_bill_generated')).toHaveLength(2);
  expect(game.events.filter(event => event.type === 'checkout_bill_invalidated')).toHaveLength(1);
});

it('records deliberate basket inspection at the counter without closing or regenerating the bill', () => {
  const ready = visit(basket(), 'checkout');
  const inspected = applyMarketAction(ready, { type: 'viewCheckoutCart' });
  expect(inspected).toMatchObject({ phase: 'checkout', view: 'world', activeStation: 'checkout',
    attempts: 0, checkoutReview: ready.checkoutReview, cart: ready.cart, stock: ready.stock });
  expect(inspected.events.at(-1)).toMatchObject({ type: 'checkout_cart_viewed', payload: {
    origin: 'system-cashier', triggeredBy: 'player', checkoutId: 'checkout', cart: ready.cart,
  } });
  expect(inspected.events).toHaveLength(ready.events.length + 1);
  expect(getMarketCheckoutReview(inspected)).toEqual(getMarketCheckoutReview(ready));
  const closed = applyMarketAction(ready, { type: 'closeStation' });
  expect(applyMarketAction(closed, { type: 'viewCheckoutCart' }).lastActionError).toBeTruthy();
});

it('keeps first feedback generic and identifies a cashier discrepancy separately on the second submission', () => {
  let game = applyMarketAction(visit(basket(), 'checkout'), { type: 'submit' });
  expect(game.feedback).toEqual({ success: false });
  expect(getMarketCheckoutReview(game)).toBeNull();
  game = applyMarketAction(visit(applyMarketAction(game, { type: 'retry' }), 'checkout'), { type: 'submit' });
  expect(game.feedback).toMatchObject({ success: false, details: [expect.stringMatching(/^계산 확인:/)] });
  expect(game).toMatchObject({ attempts: 2, score: 100, penaltyPoints: 0, cart: { milk: 1, apple: 1 } });
  const audit = game.events.filter(event => event.type === 'purchase_submitted');
  expect(audit).toHaveLength(2);
  expect(audit[1].payload).toMatchObject({ evaluation: { success: true, details: [] },
    checkoutReviewEvaluation: { success: false, origin: 'system-cashier' }, purchaseSuccess: false });
});

it.each([NaN, Infinity, 0, -1, 1.5, 100, '' as unknown as number])('rejects malformed quantity %s without changing the receipt or attempts', quantity => {
  const before = visit(basket(), 'checkout');
  const game = correct(before, 'milk', quantity);
  expect(game.lastActionError).toBeTruthy();
  expect(game.checkoutReview).toEqual(before.checkoutReview);
  expect(game).toMatchObject({ attempts: 0, cart: before.cart, stock: before.stock, penaltyPoints: 0 });
});

it('rejects remote, unattended, closed, wrong-view, wrong-counter, feedback and finished correction requests', () => {
  const initial = basket();
  const ready = visit(initial, 'checkout');
  const invalidStates: MarketSession[] = [initial,
    applyMarketAction(ready, { type: 'closeStation' }),
    applyMarketAction(ready, { type: 'viewCart' }),
    applyMarketAction(ready, { type: 'viewHelp' }),
    { ...ready, playerPosition: ready.environment.spawn },
    { ...ready, selectedCheckoutId: 'checkout-2' },
    { ...ready, cashierAvailability: { checkout: false, 'checkout-2': true } },
    applyMarketAction(ready, { type: 'submit' }),
    applyMarketAction(ready, { type: 'giveUp' }),
  ];
  for (const before of invalidStates) {
    expect(getMarketCheckoutReview(before)).toBeNull();
    const rejected = correct(before, 'milk', 1);
    expect(rejected.lastActionError).toBeTruthy();
    expect(rejected.checkoutReview).toEqual(before.checkoutReview);
    expect(rejected).toMatchObject({ attempts: before.attempts, stock: before.stock, cart: before.cart, score: before.score, penaltyPoints: before.penaltyPoints });
  }
  const unattended = visit(basket('overcharge', { environment: { cashierCount: 0 } }), 'checkout');
  expect(unattended.checkoutReview).toBeNull();
  expect(correct(unattended, 'milk', 1).lastActionError).toBeTruthy();
  const unknown = applyMarketAction(ready, { type: 'requestCheckoutCorrection', productId: 'missing-product', quantity: 1 } as MarketAction);
  expect(unknown.lastActionError).toBeTruthy();
});

it('leaves kiosk scanning independent of a staffed-counter error and disallows staff corrections there', () => {
  let game = basket('overcharge', { environment: { kioskLane: 'checkout-2' } });
  game = visit(game, 'checkout');
  expect(game.checkoutReview!.injectedError).toBeTruthy();
  game = visit(applyMarketAction(game, { type: 'closeStation' }), game.environment.kiosks[0].id);
  expect(getMarketCheckoutReview(game)).toBeNull();
  expect(correct(game, 'milk', 1).lastActionError).toBeTruthy();
  expect(applyMarketAction(game, { type: 'submit' }).lastActionError).toBeTruthy();
  expect(applyMarketAction(game, { type: 'submitKiosk', scannedCart: { ...game.cart } })).toMatchObject({ phase: 'finished', outcome: 'success', paid: true, attempts: 1 });
});

it('exports system-cashier provenance while actor observations expose only the visible bill and staff reply', () => {
  const ready = visit(basket(), 'checkout');
  const observed = getMarketObservation(ready);
  expect(observed.checkoutReview).toEqual(getMarketCheckoutReview(ready));
  expect(Object.keys(observed.checkoutReview!).sort()).toEqual(['chargedCart', 'response', 'total']);
  const serialized = JSON.stringify(observed);
  for (const hidden of ['injectedError', 'additionalQuantity', 'initialChargedCart', 'cartFingerprint', 'checkoutReviewMode', 'system-cashier']) expect(serialized).not.toContain(hidden);
  expect(getMarketObservation(applyMarketAction(ready, { type: 'closeStation' })).checkoutReview).toBeNull();
  const fixed = correct(ready);
  const finished = applyMarketAction(fixed, { type: 'submit' });
  const exported = exportMarketEpisode(finished);
  expect(exported.checkoutReview).toMatchObject({ origin: 'system-cashier', injectedError: ready.checkoutReview!.injectedError, chargedCart: ready.cart });
  for (const event of exported.events.filter(item => item.type.startsWith('checkout_'))) expect(event.payload.origin).toBe('system-cashier');
  expect(exported.events.map(event => event.type)).toEqual(expect.arrayContaining(['checkout_bill_generated', 'checkout_correction_requested', 'checkout_bill_corrected', 'checkout_review_submitted']));
});
