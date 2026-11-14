import { createShoppingErrand, getShoppingErrandDeliveryText, getShoppingErrandMarketConfig, reduceShoppingErrand, type ShoppingErrand } from '../src/game/shoppingErrand';
import { applyMarketAction, createMarketSession, exportMarketEpisode, getAvailableSubstitutions, type MarketSession } from '../src/game/marketSession';
import type { MarketEnvironmentStationId } from '../src/game/marketEnvironment';
import { getMarketProduct } from '../src/game/scenarios';

const at = Date.parse('2026-10-02T17:30:00.000Z');
function accepted(options: { allowSubstitution?: boolean; stockoutEnabled?: boolean } = {}) {
  let errand = createShoppingErrand({ id: 'minsu-test', offeredAt: at, ...options });
  errand = reduceShoppingErrand(errand, { type: 'accept', at: at + 1 });
  return reduceShoppingErrand(errand, { type: 'market-started', sessionId: 'errand-market', at: at + 2 });
}
function gameFor(errand: ShoppingErrand) {
  return createMarketSession({ ...getShoppingErrandMarketConfig(errand, { sessionId: errand.boundSessionId!, startedAt: new Date(at + 2).toISOString(), seed: 'errand-test' }), environment: { cashierCount: 2, kioskLane: 'none' } });
}
function visit(game: MarketSession, station: MarketEnvironmentStationId) {
  if (game.view !== 'world') game = applyMarketAction(game, { type: 'closeView' });
  game = applyMarketAction(game, { type: 'setPosition', point: game.environment.stations[station] });
  const next = applyMarketAction(game, { type: 'interact', station });
  expect(next.lastActionError).toBeNull(); return next;
}
function stockCheck(game: MarketSession) {
  game = visit(game, 'fresh');
  game = visit(game, game.environment.stationDetails.find(item => item.kind === 'employee')!.id);
  return applyMarketAction(applyMarketAction(game, { type: 'checkStock', productId: 'milk' }), { type: 'viewRequester' });
}
function purchase(game: MarketSession, items: Record<string, number>) {
  for (const [productId, quantity] of Object.entries(items)) {
    game = applyMarketAction(visit(game, getMarketProduct(productId)!.categoryId), { type: 'add', productId, quantity });
    expect(game.lastActionError).toBeNull();
  }
  return applyMarketAction(visit(game, 'checkout'), { type: 'submit' });
}

describe('민수의 퇴근길 부탁', () => {
  it('수락하거나 나중으로 미룰 수 있고 실제 결제 후에도 직접 전달해야 끝난다', () => {
    const offered = createShoppingErrand({ id: 'one', offeredAt: at, stockoutEnabled: false });
    expect(reduceShoppingErrand(offered, { type: 'defer', at }).phase).toBe('deferred');
    expect(reduceShoppingErrand(offered, { type: 'deliver', at }).phase).toBe('offered');
    let errand = accepted({ stockoutEnabled: false });
    const completed = purchase(gameFor(errand), { milk: 1, apple: 2 });
    expect(completed.paid).toBe(true);
    errand = reduceShoppingErrand(errand, { type: 'market-finished', episode: exportMarketEpisode(completed) });
    expect(errand).toMatchObject({ phase: 'ready', deliveredAt: null, purchase: { total: 4600, cart: { milk: 1, apple: 2 } } });
    errand = reduceShoppingErrand(errand, { type: 'deliver', at: at + 60000 });
    expect(errand.phase).toBe('delivered');
    expect(reduceShoppingErrand(errand, { type: 'accept', at: at + 70000 })).toBe(errand);
  });
  it('다른 세션, 포기, 결제 증거 누락, 수량 변조를 전달 가능한 물건으로 취급하지 않는다', () => {
    const errand = accepted({ stockoutEnabled: false });
    const game = gameFor(errand);
    const paid = exportMarketEpisode(purchase(game, { milk: 1, apple: 2 }));
    expect(reduceShoppingErrand(errand, { type: 'market-finished', episode: { ...paid, sessionId: 'old-game' } })).toBe(errand);
    expect(reduceShoppingErrand(errand, { type: 'market-finished', episode: exportMarketEpisode(applyMarketAction(game, { type: 'giveUp' })) }).phase).toBe('accepted');
    expect(reduceShoppingErrand(errand, { type: 'market-finished', episode: { ...paid, events: [] } }).purchase).toBeNull();
    expect(reduceShoppingErrand(errand, { type: 'market-finished', episode: { ...paid, finalCart: { milk: 1, apple: 3 } } }).purchase).toBeNull();
    const newer = reduceShoppingErrand(errand, { type: 'market-started', sessionId: 'second-visit', at: at + 20 });
    expect(reduceShoppingErrand(newer, { type: 'market-finished', episode: paid }).purchase).toBeNull();
  });
  it('품절 확인과 대체 동의를 거친 실제 우유 이름, 수량, 금액을 전달한다', () => {
    let errand = accepted();
    let game = stockCheck(gameFor(errand));
    const alternative = getAvailableSubstitutions(game)[0];
    expect(alternative).toBeDefined();
    game = applyMarketAction(game, { type: 'requestSubstitution', productId: alternative.id });
    const total = alternative.price + 2400;
    errand = reduceShoppingErrand(errand, { type: 'approve-budget', amount: Math.max(errand.budget, total) });
    game = purchase(game, { [alternative.id]: 1, apple: 2 });
    errand = reduceShoppingErrand(errand, { type: 'market-finished', episode: exportMarketEpisode(game) });
    expect(errand.phase).toBe('ready');
    expect(getShoppingErrandDeliveryText(errand)).toContain(alternative.name);
    expect(errand.purchase?.cart).toEqual({ [alternative.id]: 1, apple: 2 });
  });
  it('대체가 허용되지 않으면 사과만 구매하고 우유를 못 산 이유를 전달한다', () => {
    let errand = accepted({ allowSubstitution: false });
    let game = stockCheck(gameFor(errand));
    game = applyMarketAction(game, { type: 'reportUnavailable', reason: 'replacement-not-allowed' });
    game = purchase(game, { apple: 2 });
    errand = reduceShoppingErrand(errand, { type: 'market-finished', episode: exportMarketEpisode(game) });
    expect(errand).toMatchObject({ phase: 'ready', purchase: { cart: { apple: 2 }, total: 2400 } });
    expect(getShoppingErrandDeliveryText(errand)).toContain('바꾸기 어려워서 사지 못했어');
  });
  it('예산 초과 기록을 뒤늦게 가져와도 확인 없이 전달 완료되지 않는다', () => {
    let errand = accepted({ stockoutEnabled: false });
    errand = { ...errand, approvedBudget: 4000 };
    errand = reduceShoppingErrand(errand, { type: 'market-finished', episode: exportMarketEpisode(purchase(gameFor(errand), { milk: 1, apple: 2 })) });
    expect(errand.phase).toBe('budget-review');
    expect(reduceShoppingErrand(errand, { type: 'deliver', at: at + 60000 }).phase).toBe('budget-review');
    expect(reduceShoppingErrand(errand, { type: 'approve-budget', amount: 4600 }).phase).toBe('ready');
  });
});
