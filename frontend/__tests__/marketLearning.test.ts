import {
  applyMarketAction, createMarketSession, exportMarketEpisode, getAvailableSubstitutions,
  getMarketObservation, getStockoutStatus, type MarketSession, type MarketSessionConfig,
} from '../src/game/marketSession';
import { normalizeMarketLearningConfig } from '../src/game/marketLearning';
import type { MarketEnvironmentStationId } from '../src/game/marketEnvironment';
import { getMarketProduct, marketProducts } from '../src/game/scenarios';

function session(overrides: Partial<MarketSessionConfig> = {}) {
  return createMarketSession({ seed: 'learning-session', startedAt: '2026-09-16T00:00:00.000Z',
    objectives: [{ productId: 'milk', quantity: 1 }], learning: { budgetChoiceEnabled: false }, ...overrides,
    environment: { cashierCount: 2, kioskLane: 'none', ...overrides.environment } });
}
function visit(game: MarketSession, station: MarketEnvironmentStationId) {
  if (game.view !== 'world') game = applyMarketAction(game, { type: 'closeView' });
  game = applyMarketAction(game, { type: 'setPosition', point: game.environment.stations[station] });
  expect(game.lastActionError).toBeNull();
  game = applyMarketAction(game, { type: 'interact', station });
  expect(game.lastActionError).toBeNull();
  return game;
}
function staff(game: MarketSession) {
  return visit(game, game.environment.stationDetails.find(station => station.kind === 'employee')!.id);
}
function stockCheck(game: MarketSession) {
  const task = game.learning.stockout!;
  game = visit(game, getMarketProduct(task.requestedProductId)!.categoryId);
  game = applyMarketAction(staff(game), { type: 'checkStock', productId: task.requestedProductId });
  expect(game.lastActionError).toBeNull();
  return game;
}
function add(game: MarketSession, productId: string, quantity = 1) {
  game = visit(game, getMarketProduct(productId)!.categoryId);
  game = applyMarketAction(game, { type: 'add', productId, quantity });
  expect(game.lastActionError).toBeNull();
  return game;
}
function submit(game: MarketSession) {
  return applyMarketAction(visit(game, 'checkout'), { type: 'submit' });
}
function requester(game: MarketSession) { return applyMarketAction(game, { type: 'viewRequester' }); }

describe('shopping exceptions and self-directed choices', () => {
  it('defaults to one visible sold-out task and an affordable choice without revealing the exception before a shelf visit', () => {
    for (let seed = 0; seed < 24; seed++) {
      const game = createMarketSession({ seed, learning: {}, environment: { kioskLane: 'none' } });
      const exception = game.learning.stockout!;
      expect(game.objectives[0]).toMatchObject({ productId: exception.requestedProductId, match: 'exact' });
      expect(game.shelfSlots.fresh).toContain(exception.requestedProductId);
      expect(game.stock[exception.requestedProductId]).toBe(0);
      expect(game.learning.choiceTask).toMatchObject({ categoryId: 'drink', quantity: 1, budget: 3000 });
      expect(game.shelfSlots.drink.some(id => getMarketProduct(id)!.price <= 3000 && game.stock[id] > 0)).toBe(true);
      expect(getStockoutStatus(game)).toBeNull();
      expect(getAvailableSubstitutions(game)).toEqual([]);
      expect(getMarketObservation(game).learning.stockout).toBeNull();
      expect(getMarketObservation(game)).not.toHaveProperty('events');
      expect(getMarketObservation(game)).not.toHaveProperty('cartTotal');
      expect(createMarketSession(game.config)).toEqual(game);
    }
  });

  it('requires the displayed target shelf and a live staff conversation for stock confirmation', () => {
    const initial = session();
    const early = applyMarketAction(staff(initial), { type: 'checkStock', productId: 'milk' });
    expect(early.lastActionError).toContain('진열대');
    expect(early.learning.stockout?.staffChecked).toBe(false);
    const seen = visit(initial, 'fresh');
    expect(getStockoutStatus(seen)).toMatchObject({ shelfVisited: true, staffChecked: false });
    expect(applyMarketAction(seen, { type: 'checkStock', productId: 'milk' }).lastActionError).toContain('직원');
    const talking = staff(seen);
    for (const game of [applyMarketAction(talking, { type: 'viewHelp' }), requester(talking),
      applyMarketAction(talking, { type: 'closeStation' }), { ...talking, playerPosition: initial.environment.spawn }]) {
      expect(applyMarketAction(game, { type: 'checkStock', productId: 'milk' }).learning.stockout?.staffChecked).toBe(false);
    }
    const confirmed = applyMarketAction(talking, { type: 'checkStock', productId: 'milk' });
    expect(confirmed.learning.stockout?.staffChecked).toBe(true);
    expect(confirmed.events.at(-1)).toMatchObject({ type: 'stock_checked', payload: { productId: 'milk', inStock: false } });
    expect(confirmed.feedback).toBeNull();
    expect(confirmed.score).toBe(100);
  });

  it('rejects remote and unconfirmed substitution and preserves the requested quantity after one approval', () => {
    let game = session({ objectives: [{ productId: 'milk', quantity: 2 }] });
    const original = game.objectives[0];
    const candidate = game.shelfSlots.fresh.find(id => id !== 'milk' && getMarketProduct(id)?.familyId === 'milk')!;
    expect(applyMarketAction(requester(game), { type: 'requestSubstitution', productId: candidate }).objectives[0]).toEqual(original);
    game = stockCheck(game);
    expect(applyMarketAction(game, { type: 'requestSubstitution', productId: candidate }).lastActionError).toContain('연락');
    expect(getAvailableSubstitutions(game).map(product => product.id)).toContain(candidate);
    game = applyMarketAction(requester(game), { type: 'requestSubstitution', productId: candidate });
    expect(game.objectives[0]).toMatchObject({ productId: candidate, quantity: 2, match: 'exact' });
    expect(game.learning.stockout).toMatchObject({ status: 'replacement-approved', approvedProductId: candidate });
    const twice = applyMarketAction(game, { type: 'requestSubstitution', productId: candidate });
    expect(twice.lastActionError).toBeTruthy();
    expect(twice.objectives).toEqual(game.objectives);
    game = submit(add(game, candidate));
    expect(game.feedback).toEqual({ success: false });
    game = applyMarketAction(game, { type: 'retry' });
    game = submit(add(game, candidate));
    expect(game.outcome).toBe('success');
    const episode = exportMarketEpisode(game);
    expect(episode.events.filter(event => event.type === 'substitution_approved')).toHaveLength(1);
    expect(episode.learning.stockout?.requestedProductId).toBe('milk');
    expect(episode.finalCart).toEqual({ [candidate]: 2 });
  });

  it('does not accept implicit family substitutes and keeps first-failure feedback general', () => {
    let game = session();
    const alternate = game.shelfSlots.fresh.find(id => id !== 'milk' && getMarketProduct(id)?.familyId === 'milk')!;
    game = add(game, alternate);
    expect(game.lastActionError).toBeNull();
    expect(getMarketObservation(game).feedback).toBeNull();
    game = submit(game);
    expect(game.feedback).toEqual({ success: false });
    game = submit(applyMarketAction(game, { type: 'retry' }));
    expect(game.feedback?.details?.some(detail => detail.includes('부탁한 분'))).toBe(true);
    expect(game.outcome).toBeNull();
  });

  it('waives only the affected objective after a verified and permitted reason, never an arbitrary reason', () => {
    let game = session({ objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 }],
      learning: { budgetChoiceEnabled: false, allowSubstitution: false } });
    expect(applyMarketAction(requester(game), { type: 'reportUnavailable', reason: 'replacement-not-allowed' }).learning.stockout?.status).toBe('unresolved');
    game = stockCheck(game);
    expect(getAvailableSubstitutions(game)).toEqual([]);
    game = requester(game);
    for (const reason of ['no-substitute-in-stock', 'because-I-say-so']) {
      const rejected = applyMarketAction(game, { type: 'reportUnavailable', reason } as never);
      expect(rejected.learning.stockout?.status).toBe('unresolved');
      expect(rejected.objectives).toHaveLength(2);
    }
    game = applyMarketAction(game, { type: 'reportUnavailable', reason: 'replacement-not-allowed' });
    expect(game.learning.stockout).toMatchObject({ status: 'waived', resolutionReason: 'replacement-not-allowed' });
    expect(game.objectives).toEqual([expect.objectContaining({ productId: 'apple', quantity: 2 })]);
    expect(game.events.at(-1)).toMatchObject({ type: 'unavailable_reported', payload: { productId: 'milk', reason: 'replacement-not-allowed' } });
    game = submit(add(game, 'apple', 2));
    expect(game.outcome).toBe('success');
  });

  it('allows a no-stock ending only when no compatible alternative has enough stock', () => {
    const missing = Object.fromEntries(marketProducts.filter(product => product.familyId === 'milk').map(product => [product.id, 0]));
    let game = requester(stockCheck(session({ stockOverrides: missing })));
    expect(getAvailableSubstitutions(game)).toEqual([]);
    game = applyMarketAction(game, { type: 'reportUnavailable', reason: 'no-substitute-in-stock' });
    expect(game.learning.stockout?.status).toBe('waived');
    expect(game.objectives).toEqual([]);
    expect(submit(game).outcome).toBe('success');
    const available = requester(stockCheck(session()));
    expect(applyMarketAction(available, { type: 'reportUnavailable', reason: 'no-substitute-in-stock' }).lastActionError).toBeTruthy();
  });

  it('does not approve a substitute that conflicts with another fixed task or lacks the full quantity', () => {
    let game = stockCheck(session({ difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 2 }, { productId: 'low-fat-milk', quantity: 1 }], stockOverrides: { 'strawberry-milk': 1 } }));
    expect(getAvailableSubstitutions(game).map(product => product.id)).not.toContain('low-fat-milk');
    expect(getAvailableSubstitutions(game).map(product => product.id)).not.toContain('strawberry-milk');
    game = requester(game);
    const rejected = applyMarketAction(game, { type: 'requestSubstitution', productId: 'low-fat-milk' });
    expect(rejected.lastActionError).toBeTruthy();
    expect(rejected.objectives[0].productId).toBe('milk');
  });

  it('provides factual location help only for current fixed or self-choice tasks without evaluating the cart', () => {
    let game = session({ learning: { stockoutEnabled: false, budgetChoiceEnabled: true } });
    expect(applyMarketAction(game, { type: 'askLocation', objectiveId: 'objective-1' }).lastActionError).toContain('직원');
    game = staff(game);
    for (const [objectiveId, categoryId] of [['objective-1', 'fresh'], ['choice-drink', 'drink']]) {
      game = applyMarketAction(game, { type: 'askLocation', objectiveId });
      expect(game.events.at(-1)).toMatchObject({ type: 'product_location_requested', payload: { objectiveId, categoryId } });
      expect(game.feedback).toBeNull();
      expect(game.attempts).toBe(0);
    }
    expect(applyMarketAction(game, { type: 'askLocation', objectiveId: 'unrelated-product' }).lastActionError).toBeTruthy();
  });

  it('accepts different personally chosen drinks within budget while preserving fixed-list quantities', () => {
    const original = session({ learning: { stockoutEnabled: false, budgetChoiceEnabled: true, choiceBudget: 3000 } });
    const choices = original.shelfSlots.drink.filter(id => getMarketProduct(id)!.price <= 3000);
    expect(choices.length).toBeGreaterThan(1);
    for (const choice of choices.slice(0, 2)) {
      const result = submit(add(add(original, 'milk'), choice));
      expect(result.outcome).toBe('success');
    }
    expect(submit(add(original, choices[0])).feedback).toEqual({ success: false });
    expect(submit(add(add(original, 'milk'), choices[0], 2)).feedback).toEqual({ success: false });
  });

  it('does not disclose budget correctness while shopping and reveals the reason only after the second submission', () => {
    let game = session({ learning: { stockoutEnabled: false, budgetChoiceEnabled: true, choiceBudget: 800 } });
    const costly = game.shelfSlots.drink.find(id => getMarketProduct(id)!.price > 800)!;
    game = add(add(game, 'milk'), costly);
    expect(game.lastActionError).toBeNull();
    const observation = getMarketObservation(game);
    expect(observation.feedback).toBeNull();
    expect(observation).not.toHaveProperty('choiceTotal');
    expect(observation).not.toHaveProperty('remainingBudget');
    game = submit(game);
    expect(game.feedback).toEqual({ success: false });
    game = submit(applyMarketAction(game, { type: 'retry' }));
    expect(game.feedback?.details).toEqual([expect.stringContaining('예산')]);
    expect(applyMarketAction(game, { type: 'giveUp' }).outcome).toBe('gave-up');
  });

  it('keeps extra items distinct from self-choice drinks and cannot double count a fixed drink', () => {
    let game = session({ objectives: [{ productId: 'water', quantity: 1 }],
      learning: { stockoutEnabled: false, budgetChoiceEnabled: true, choiceBudget: 3000 } });
    game = add(game, 'water');
    expect(submit(game).feedback).toEqual({ success: false });
    const drink = game.shelfSlots.drink.find(id => getMarketProduct(id)!.price <= 3000 && getMarketProduct(id)!.familyId !== getMarketProduct('water')!.familyId)!;
    expect(submit(add(game, drink)).outcome).toBe('success');
    const unrelated = game.shelfSlots.produce[0];
    expect(submit(add(add(game, drink), unrelated)).feedback).toEqual({ success: false });
  });

  it('exposes only current staff facts and requester choices while keeping evaluation and running totals private', () => {
    const initial = session();
    expect(getMarketObservation(initial)).toMatchObject({ staffLearningFeedback: null, requesterOptions: null });
    const earlyCall = getMarketObservation(requester(initial));
    expect(earlyCall.requesterOptions).toEqual({ substitutions: [], unavailableReasons: [] });
    expect(earlyCall.learning.stockout).toBeNull();
    let game = stockCheck(initial);
    expect(getMarketObservation(game).staffLearningFeedback).toMatchObject({ kind: 'stock_checked', productId: 'milk', inStock: false });
    expect(getMarketObservation(game).requesterOptions).toBeNull();
    game = requester(game);
    const call = getMarketObservation(game);
    expect(call.staffLearningFeedback).toBeNull();
    expect(call.requesterOptions?.substitutions.map(product => product.id)).toEqual(getAvailableSubstitutions(game).map(product => product.id));
    expect(call.requesterOptions?.unavailableReasons).toEqual([]);
    expect(call.cart).toBeNull();
    expect(call.feedback).toBeNull();
    expect(call).not.toHaveProperty('events');
    expect(call).not.toHaveProperty('remainingBudget');
    const originalOnly = getMarketObservation(requester(stockCheck(session({ learning: { budgetChoiceEnabled: false, allowSubstitution: false } }))));
    expect(originalOnly.requesterOptions).toEqual({ substitutions: [], unavailableReasons: ['replacement-not-allowed'] });
  });

  it('validates options and preserves explicit fixed-list-only compatibility', () => {
    const legacy = session({ learning: { stockoutEnabled: false, budgetChoiceEnabled: false } });
    expect(legacy.learning).toEqual({ stockout: null, choiceTask: null, visitedCategoryIds: [] });
    expect(submit(add(legacy, 'milk')).outcome).toBe('success');
    for (const choiceBudget of [0, -1, 0.5, NaN, 1000001]) expect(() => normalizeMarketLearningConfig({ choiceBudget })).toThrow('예산');
    expect(() => normalizeMarketLearningConfig({ stockoutEnabled: 'yes' } as never)).toThrow('true');
    expect(() => session({ learning: { budgetChoiceEnabled: true, choiceBudget: 1 } })).toThrow('예산');
    const preset = legacy.shelfSlots.fresh.filter(id => id !== 'milk');
    preset.push(marketProducts.find(product => product.categoryId === 'fresh' && !preset.includes(product.id) && product.id !== 'milk')!.id);
    expect(() => session({ inventoryProductIds: { fresh: preset } })).toThrow('품절을 확인할 목표 상품');
  });
});

describe('kiosk submission and staffed checkout separation', () => {
  it.each(['checkout', 'checkout-2'] as const)('uses both kiosks in %s and requires all actual basket items to be scanned before a purchase attempt', lane => {
    const original = session({ learning: { stockoutEnabled: false, budgetChoiceEnabled: false }, environment: { kioskLane: lane, cashierCount: 0 } });
    for (const kiosk of original.environment.kiosks) {
      let game = visit(add(original, 'milk'), kiosk.id);
      expect(game).toMatchObject({ phase: 'checkout', selectedKioskId: kiosk.id, selectedCheckoutId: lane });
      expect(applyMarketAction(game, { type: 'submit' }).attempts).toBe(0);
      for (const scannedCart of [{}, { milk: 2 }, { milk: 1, apple: 1 }] as Record<string, number>[]) {
        const mismatch = applyMarketAction(game, { type: 'submitKiosk', scannedCart });
        expect(mismatch.attempts).toBe(0);
        expect(mismatch.lastActionError).toContain('스캔');
      }
      game = applyMarketAction(game, { type: 'submitKiosk', scannedCart: { milk: 1 } });
      expect(game).toMatchObject({ outcome: 'success', paid: true, attempts: 1 });
      expect(game.events.find(event => event.type === 'purchase_submitted')?.payload).toMatchObject({ kioskId: kiosk.id, checkoutId: lane });
    }
  });

  it('keeps objective errors staged at kiosks and calls the remaining staffed lane rather than the replaced lane', () => {
    let game = session({ learning: { stockoutEnabled: false, budgetChoiceEnabled: false }, environment: { kioskLane: 'checkout', cashierCount: 0 } });
    game = applyMarketAction(staff(game), { type: 'requestCashier' });
    expect(game).toMatchObject({ cashierAvailability: { checkout: false, 'checkout-2': true }, selectedCheckoutId: 'checkout-2' });
    expect(game.events.at(-1)?.payload.message).toContain('2번');
    const kiosk = game.environment.kiosks[0];
    game = applyMarketAction(visit(game, kiosk.id), { type: 'submitKiosk', scannedCart: {} });
    expect(game.feedback).toEqual({ success: false });
    game = applyMarketAction(game, { type: 'retry' });
    game = applyMarketAction(visit(game, kiosk.id), { type: 'submitKiosk', scannedCart: {} });
    expect(game.feedback?.details).toHaveLength(1);
  });
});
