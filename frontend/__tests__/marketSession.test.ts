import {
  applyMarketAction, createMarketAgentAdapter, createMarketSession, exportMarketEpisode,
  getMarketObservation, MarketSession, parseMarketSessionConfig, serializeMarketEpisode,
} from '../src/game/marketSession';
import { MarketEnvironmentStationId } from '../src/game/marketEnvironment';
import { getMarketProduct, marketProducts } from '../src/game/scenarios';

function session(overrides: Parameters<typeof createMarketSession>[0] = {}) {
  return createMarketSession({ seed: 'session-test', startedAt: '2026-09-11T00:00:00.000Z', environment: { cashierCount: 2 }, ...overrides });
}
function visit(current: MarketSession, station: MarketEnvironmentStationId) {
  const moved = applyMarketAction(current, { type: 'setPosition', point: current.environment.stations[station] });
  expect(moved.lastActionError).toBeNull();
  const next = applyMarketAction(moved, { type: 'interact', station });
  expect(next.lastActionError).toBeNull();
  return next;
}
function add(current: MarketSession, productId: string, quantity = 1) {
  const ready = visit(current, getMarketProduct(productId)!.categoryId);
  const next = applyMarketAction(ready, { type: 'add', productId, quantity });
  expect(next.lastActionError).toBeNull();
  return next;
}
function submit(current: MarketSession) { return applyMarketAction(visit(current, 'checkout'), { type: 'submit' }); }

describe('configurable market session', () => {
  it('keeps the two checkout attendants independent and calls staff to the selected empty counter', () => {
    let game = session({ environment: { cashierCount: 0 } });
    game = visit(game, 'checkout-2');
    expect(game.selectedCheckoutId).toBe('checkout-2');
    expect(applyMarketAction(game, { type: 'submit' }).attempts).toBe(0);
    const staff = game.environment.stationDetails.find(station => station.kind === 'employee')!.id;
    game = visit(game, staff);
    game = applyMarketAction(game, { type: 'requestCashier' });
    expect(game.cashierAvailability).toEqual({ checkout: false, 'checkout-2': true });
    expect(game.events.at(-1)?.payload.checkoutId).toBe('checkout-2');
    game = visit(game, 'checkout');
    expect(game.cashierAvailable).toBe(false);
    expect(applyMarketAction(game, { type: 'submit' }).lastActionError).toContain('종업원');
    game = visit(game, staff);
    game = applyMarketAction(game, { type: 'requestCashier', checkoutId: 'checkout' });
    expect(game.cashierAvailability).toEqual({ checkout: true, 'checkout-2': true });
    expect(applyMarketAction(game, { type: 'requestCashier', checkoutId: 'checkout' }).lastActionError).toContain('이미');
  });

  it('deducts only when an unpaid basket crosses the entrance and rearms after a real return inside', () => {
    let game = add(session(), 'milk');
    game = applyMarketAction(game, { type: 'setPosition', point: { x: 470, y: 1018 } });
    game = applyMarketAction(game, { type: 'move', dx: 0, dy: 24 });
    expect(game).toMatchObject({ score: 90, penaltyPoints: 10, alarmCount: 1, alarmArmed: false, paid: false });
    for (let index = 0; index < 4; index++) {
      game = applyMarketAction(game, { type: 'move', dx: 0, dy: -20 });
      game = applyMarketAction(game, { type: 'move', dx: 0, dy: 20 });
    }
    expect(game.alarmCount).toBe(1);
    game = applyMarketAction(game, { type: 'setPosition', point: { x: 470, y: 970 } });
    expect(game.alarmArmed).toBe(true);
    game = applyMarketAction(game, { type: 'setPosition', point: { x: 470, y: 1060 } });
    expect(getMarketObservation(game)).toMatchObject({ score: 80, penaltyPoints: 20, alarmCount: 2 });
    const ended = applyMarketAction(game, { type: 'giveUp' });
    expect(exportMarketEpisode(ended)).toMatchObject({ score: 80, penaltyPoints: 20, alarmCount: 2, paid: false });
    expect(ended.events.filter(event => event.type === 'entrance_alarm').map(event => event.payload.delta)).toEqual([-10, -10]);
  });

  it('never alarms with an empty/paid basket and never reduces score below zero', () => {
    let empty = applyMarketAction(session(), { type: 'setPosition', point: { x: 470, y: 1060 } });
    expect(empty.alarmCount).toBe(0);
    let game = add(session({ alarmPenaltyPoints: 65 }), 'milk');
    for (let index = 0; index < 3; index++) {
      game = applyMarketAction(game, { type: 'setPosition', point: { x: 470, y: 970 } });
      game = applyMarketAction(game, { type: 'setPosition', point: { x: 470, y: 1060 } });
    }
    expect(game).toMatchObject({ score: 0, penaltyPoints: 100, alarmCount: 3 });
    expect(game.events.filter(event => event.type === 'entrance_alarm').map(event => event.payload.delta)).toEqual([-65, -35, 0]);
    const paid = applyMarketAction(visit(add(session({ objectives: [{ productId: 'milk', quantity: 1 }] }), 'milk'), 'checkout-2'), { type: 'submit' });
    expect(paid).toMatchObject({ paid: true, outcome: 'success', score: 100 });
    expect(applyMarketAction(paid, { type: 'setPosition', point: { x: 470, y: 1060 } }).alarmCount).toBe(0);
  });

  it('inner entrance and exit are passive passages; only the shared outside door ends the trip', () => {
    let game = add(session(), 'milk');
    expect(applyMarketAction(game, { type: 'interact', station: 'entrance' }).lastActionError).toContain('가까이');
    game = applyMarketAction(game, { type: 'setPosition', point: game.environment.stations.entrance });
    game = applyMarketAction(game, { type: 'interact', station: 'entrance' });
    expect(game).toMatchObject({ phase: 'shopping', outcome: null, activeStation: null, alarmCount: 1, score: 90 });
    game = visit(game, 'exit');
    expect(game).toMatchObject({ phase: 'shopping', outcome: null, activeStation: null });
    game = visit(game, 'common-door');
    expect(game).toMatchObject({ phase: 'finished', outcome: 'gave-up', alarmCount: 1, score: 90 });
    expect(game.events.filter(event => event.type === 'entrance_alarm')).toHaveLength(1);
    expect(game.events.at(-1)?.payload.station).toBe('common-door');
  });

  it('alarms at the upper side doorway but not while walking the shared lobby or west corridor', () => {
    let game = add(session(), 'milk');
    game = applyMarketAction(game, { type: 'setPosition', point: { x: 340, y: 315 } });
    game = applyMarketAction(game, { type: 'setPosition', point: { x: 285, y: 315 } });
    expect(game).toMatchObject({ score: 90, alarmCount: 1, alarmArmed: false });
    expect([...game.events].reverse().find(event => event.type === 'entrance_alarm')?.payload.gateId).toBe('west-door');
    for (const point of [{ x: 240, y: 315 }, { x: 240, y: 1280 }, { x: 930, y: 1280 }, { x: 710, y: 1370 }]) {
      game = applyMarketAction(game, { type: 'setPosition', point });
      expect(game.lastActionError).toBeNull();
      expect(game.alarmCount).toBe(1);
    }
  });

  it('replays the same configuration without nondeterministic layout, shelves, or log timestamps', () => {
    expect(session()).toEqual(session());
    expect(createMarketSession({ seed: 5 }).shelfSlots).toEqual(createMarketSession({ seed: 5 }).shelfSlots);
    expect(session({ seed: 'different' }).shelfSlots).not.toEqual(session().shelfSlots);
    const original = session();
    expect(createMarketSession(original.config)).toEqual(original);
    expect(() => createMarketSession({ seed: 'mismatched' }, original.environment)).toThrow('seed');
  });

  it('places twelve unique products in twelve slots while multiple purchases still share SKU stock', () => {
    const game = session();
    expect(applyMarketAction(game, null as never).lastActionError).toContain('알 수 없는');
    for (const slots of Object.values(game.shelfSlots)) {
      expect(slots).toHaveLength(12);
      expect(new Set(slots).size).toBe(12);
      for (const id of slots) expect(game.stock[id]).toBe(6);
    }
    expect(Object.keys(game.stock)).toHaveLength(60);
    const duplicate = game.shelfSlots.fresh[0];
    const changed = add(game, duplicate, 2);
    expect(changed.stock[duplicate]).toBe(4);
    expect(changed.cart[duplicate]).toBe(2);
    expect(game.stock[duplicate]).toBe(6);
  });

  it('reserves each task item and a similar variant over many seeds', () => {
    for (let seed = 0; seed < 24; seed++) {
      const game = session({ seed });
      for (const objective of game.objectives) {
        const product = getMarketProduct(objective.productId)!;
        const slots = game.shelfSlots[product.categoryId];
        expect(slots).toContain(objective.productId);
        expect(slots.some((id) => id !== objective.productId && getMarketProduct(id)?.familyId === product.familyId)).toBe(true);
      }
    }
  });

  it('accepts a different milk variant for a family task but rejects it for an exact task', () => {
    let generic = session({ objectives: [{ productId: 'low-fat-milk', quantity: 1 }] });
    const substitute = generic.shelfSlots.fresh.find((id) => id !== 'low-fat-milk' && getMarketProduct(id)?.familyId === 'milk')!;
    generic = submit(add(generic, substitute));
    expect(generic.outcome).toBe('success');
    let exact = session({ difficulty: 'exact', objectives: [{ productId: 'low-fat-milk', quantity: 1 }] });
    exact = submit(add(exact, substitute));
    expect(exact.feedback).toEqual({ success: false });
    expect(exact.outcome).toBeNull();
  });

  it('sums mixed variants for family quantities and rejects excess quantities', () => {
    let game = session({ objectives: [{ productId: 'milk', quantity: 2 }] });
    const sibling = game.shelfSlots.fresh.find((id) => id !== 'milk' && getMarketProduct(id)?.familyId === 'milk')!;
    game = add(add(game, 'milk'), sibling);
    expect(submit(game).outcome).toBe('success');
    expect(submit(add(game, 'milk')).feedback).toEqual({ success: false });
  });

  it('rejects ambiguous family objectives but allows distinct exact variants', () => {
    expect(() => session({ objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'low-fat-milk', quantity: 1 }] })).toThrow('겹치는');
    expect(() => session({ difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'milk', quantity: 2 }] })).toThrow('겹치는');
    expect(session({ difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'low-fat-milk', quantity: 1 }] }).objectives).toHaveLength(2);
  });

  it('rejects insufficient stock and restores stock when returning products', () => {
    expect(() => session({ difficulty: 'exact', stockOverrides: { milk: 0 } })).toThrow('재고');
    expect(() => session({ difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 7 }] })).toThrow('재고');
    let game = add(session({ stockOverrides: { milk: 2 } }), 'milk', 2);
    const out = applyMarketAction(game, { type: 'add', productId: 'milk' });
    expect(out.lastActionError).toContain('부족');
    expect(out.cart.milk).toBe(2);
    game = applyMarketAction(game, { type: 'remove', productId: 'milk', quantity: 2 });
    expect(game.stock.milk).toBe(2);
    expect(game.cart.milk).toBeUndefined();
  });

  it('allows direct returns only at the matching shelf, including its inline cart', () => {
    let game = add(session(), 'milk', 3);
    const stockBefore = game.stock.milk;
    game = applyMarketAction(game, { type: 'remove', productId: 'milk' });
    expect(game.lastActionError).toBeNull();
    expect(game.cart.milk).toBe(2);
    expect(game.stock.milk).toBe(stockBefore + 1);
    expect(game.events.at(-1)?.payload).toMatchObject({ operation: 'remove', method: 'shelf', categoryId: 'fresh', productId: 'milk', quantity: 1 });
    game = applyMarketAction(game, { type: 'viewCart' });
    game = applyMarketAction(game, { type: 'remove', productId: 'milk', quantity: 2 });
    expect(game.lastActionError).toBeNull();
    expect(game.cart).toEqual({});
    expect(game.stock.milk).toBe(game.initialStock.milk);
    expect(game.events.filter(event => event.type === 'return_help_requested')).toEqual([]);
    expect(game).toMatchObject({ score: 100, attempts: 0, feedback: null });
  });

  it('rejects direct returns from a general cart, a different shelf, help, checkout, or a distant position', () => {
    const basket = add(session(), 'milk', 2);
    const closed = applyMarketAction(basket, { type: 'closeStation' });
    const blockedContexts = [
      closed,
      applyMarketAction(closed, { type: 'viewCart' }),
      visit(basket, 'produce'),
      applyMarketAction(visit(basket, 'produce'), { type: 'viewCart' }),
      applyMarketAction(basket, { type: 'viewHelp' }),
      visit(basket, 'checkout'),
      applyMarketAction(visit(basket, 'checkout-2'), { type: 'viewCart' }),
      applyMarketAction(basket, { type: 'setPosition', point: basket.environment.spawn }),
    ];
    for (const current of blockedContexts) {
      const rejected = applyMarketAction(current, { type: 'remove', productId: 'milk' });
      expect(rejected.lastActionError).toContain('진열대');
      expect(rejected.cart).toEqual(current.cart);
      expect(rejected.stock).toEqual(current.stock);
      expect(rejected.events.at(-1)?.type).toBe('action_rejected');
      expect(rejected.score).toBe(current.score);
    }
  });

  it('lets a nearby employee return selected quantities without scoring or revealing correctness', () => {
    let game = add(add(session(), 'milk', 3), 'apple', 2);
    const staff = game.environment.stationDetails.find(station => station.kind === 'employee')!.id;
    game = visit(game, staff);
    expect(getMarketObservation(game)).toMatchObject({ cart: { milk: 3, apple: 2 }, products: [], stock: {}, feedback: null });
    game = applyMarketAction(game, { type: 'requestReturn', productId: 'milk', quantity: 2 });
    expect(game.lastActionError).toBeNull();
    expect(getMarketObservation(game).cart).toEqual({ milk: 1, apple: 2 });
    expect(game.stock.milk).toBe(game.initialStock.milk - 1);
    expect(game.stock.apple).toBe(game.initialStock.apple - 2);
    expect(game.events.slice(-2).map(event => event.type)).toEqual(['return_help_requested', 'cart_changed']);
    expect(game.events.at(-2)?.payload).toMatchObject({ staffStation: staff, categoryId: 'fresh', productId: 'milk', quantity: 2 });
    expect(game.events.at(-1)?.payload).toMatchObject({ operation: 'remove', method: 'employee', staffStation: staff, categoryId: 'fresh', productId: 'milk', quantity: 2 });
    game = applyMarketAction(game, { type: 'requestReturn', productId: 'milk' });
    expect(game.cart).toEqual({ apple: 2 });
    expect(game.stock.milk).toBe(game.initialStock.milk);
    expect(game).toMatchObject({ score: 100, penaltyPoints: 0, attempts: 0, feedback: null, activeStation: staff });
    const observation = getMarketObservation(game);
    expect(observation).not.toHaveProperty('events');
    expect(observation).not.toHaveProperty('config');
    expect(observation.objectives[0]).not.toHaveProperty('productId');
    game = applyMarketAction(game, { type: 'closeStation' });
    expect(getMarketObservation(game).cart).toBeNull();
    const episode = exportMarketEpisode(applyMarketAction(game, { type: 'giveUp' }));
    expect(episode.events.filter(event => event.type === 'return_help_requested')).toHaveLength(2);
    expect(episode).toMatchObject({ finalCart: { apple: 2 }, score: 100, penaltyPoints: 0, attempts: 0 });
  });

  it('rejects employee returns without an active nearby conversation and rejects invalid quantities atomically', () => {
    const basket = add(session(), 'milk', 3);
    const staff = basket.environment.stationDetails.find(station => station.kind === 'employee')!.id;
    const conversation = visit(basket, staff);
    const closedConversation = applyMarketAction(conversation, { type: 'closeStation' });
    const contexts = [
      basket, closedConversation,
      applyMarketAction(closedConversation, { type: 'viewCart' }),
      applyMarketAction(conversation, { type: 'viewCart' }),
      applyMarketAction(conversation, { type: 'viewHelp' }),
      applyMarketAction(conversation, { type: 'setPosition', point: basket.environment.spawn }),
      visit(basket, 'checkout'), submit(basket), applyMarketAction(conversation, { type: 'giveUp' }),
    ];
    for (const current of contexts) {
      const rejected = applyMarketAction(current, { type: 'requestReturn', productId: 'milk' });
      expect(rejected.lastActionError).toBeTruthy();
      expect(rejected.cart).toEqual(current.cart);
      expect(rejected.stock).toEqual(current.stock);
      expect(rejected.events.filter(event => event.type === 'return_help_requested')).toEqual([]);
    }
    for (const quantity of [-1, 0, 1.5, 4, 100, Number.NaN]) {
      const rejected = applyMarketAction(conversation, { type: 'requestReturn', productId: 'milk', quantity });
      expect(rejected.lastActionError).toBeTruthy();
      expect(rejected.cart).toEqual({ milk: 3 });
      expect(rejected.stock).toEqual(conversation.stock);
      expect(rejected.events.filter(event => event.type === 'return_help_requested')).toEqual([]);
    }
    for (const productId of ['unknown', 'apple', marketProducts.find(product => !(product.id in basket.initialStock))!.id]) {
      expect(applyMarketAction(conversation, { type: 'requestReturn', productId }).lastActionError).toBeTruthy();
    }
    expect(getMarketObservation(applyMarketAction(conversation, { type: 'viewHelp' })).cart).toBeNull();
  });

  it('keeps observations free of correctness hints until final submissions and hides the first mistakes', () => {
    let game = add(session(), 'milk');
    const before = getMarketObservation(game);
    expect(before.feedback).toBeNull();
    expect(before.objectives[0]).toEqual({ id: 'objective-1', label: '우유', quantity: 1, match: 'family' });
    expect(before).not.toHaveProperty('events');
    expect(before).not.toHaveProperty('config');
    expect(before.objectives[0]).not.toHaveProperty('productId');
    game = visit(game, 'checkout');
    expect(getMarketObservation(game).feedback).toBeNull();
    game = applyMarketAction(game, { type: 'submit' });
    expect(game.attempts).toBe(1);
    expect(getMarketObservation(game).feedback).toEqual({ success: false });
    expect(() => exportMarketEpisode(game)).toThrow('종료');
  });

  it('reveals mistakes only on the second and later submissions and supports unlimited retries', () => {
    let game = submit(session());
    expect(game.feedback).toEqual({ success: false });
    for (let attempt = 2; attempt <= 5; attempt++) {
      game = applyMarketAction(game, { type: 'retry' });
      expect(game.feedback).toBeNull();
      game = submit(game);
      expect(game.attempts).toBe(attempt);
      expect(game.feedback?.details).toHaveLength(3);
    }
    game = applyMarketAction(game, { type: 'retry' });
    game = add(add(add(game, 'milk'), 'apple', 2), 'curry');
    game = submit(game);
    expect(game.phase).toBe('finished');
    expect(game.outcome).toBe('success');
    expect(game.attempts).toBe(6);
  });

  it('allows giving up at zero attempts, during checkout, and after failed submissions', () => {
    for (const game of [session(), visit(session(), 'checkout'), submit(session())]) {
      const ended = applyMarketAction(game, { type: 'giveUp' });
      expect(ended.outcome).toBe('gave-up');
      expect(ended.attempts).toBe(game.attempts);
      expect(ended.phase).toBe('finished');
    }
  });

  it('does not count visits or rejected submissions; requires a nearby employee when cashier is absent', () => {
    let game = session({ environment: { cashierCount: 0 } });
    game = visit(game, 'checkout');
    game = applyMarketAction(game, { type: 'submit' });
    expect(game.attempts).toBe(0);
    expect(game.lastActionError).toContain('종업원');
    const staff = game.environment.stationDetails.find((station) => station.kind === 'employee')!.id;
    const remote = applyMarketAction(game, { type: 'interact', station: staff });
    expect(remote.cashierAvailable).toBe(false);
    expect(remote.lastActionError).toBeTruthy();
    expect(applyMarketAction(game, { type: 'requestCashier' }).cashierAvailable).toBe(false);
    game = visit(game, staff);
    expect(game.cashierAvailable).toBe(false);
    game = applyMarketAction(game, { type: 'requestCashier' });
    expect(game.cashierAvailable).toBe(true);
    expect(game.events.some((event) => event.type === 'cashier_requested')).toBe(true);
    game = submit(game);
    expect(game.attempts).toBe(1);
  });

  it('rejects remote shelf access, unavailable products and invalid quantities without changing stock', () => {
    const game = session();
    expect(applyMarketAction(game, { type: 'add', productId: 'milk' }).lastActionError).toContain('진열대');
    expect(applyMarketAction(game, { type: 'submit' }).attempts).toBe(0);
    const ready = visit(game, 'fresh');
    for (const quantity of [-1, 0, 1.5, 100, Number.NaN]) {
      const rejected = applyMarketAction(ready, { type: 'add', productId: 'milk', quantity });
      expect(rejected.cart).toEqual({});
      expect(rejected.lastActionError).toBeTruthy();
    }
    const absent = marketProducts.find((product) => !(product.id in game.initialStock))!;
    expect(applyMarketAction(ready, { type: 'add', productId: absent.id }).lastActionError).toContain('진열되지');
    expect(applyMarketAction(ready, { type: 'remove', productId: 'milk' }).lastActionError).toContain('담긴 수량');
  });

  it('supports optional ratings only after completion and keeps attempt counts frozen', () => {
    const active = session();
    expect(applyMarketAction(active, { type: 'rate', difficulty: 3, interest: 4 }).ratings).toBeNull();
    const ended = applyMarketAction(active, { type: 'giveUp' });
    expect(applyMarketAction(ended, { type: 'rate', difficulty: 0, interest: 5 }).lastActionError).toBeTruthy();
    const rated = applyMarketAction(ended, { type: 'rate', difficulty: 3, interest: 4 });
    expect(rated.ratings).toEqual({ difficulty: 3, interest: 4 });
    const skipped = applyMarketAction(ended, { type: 'skipRating' });
    expect(skipped.ratingSkipped).toBe(true);
    expect(skipped.ratings).toBeNull();
    expect(applyMarketAction(rated, { type: 'submit' }).attempts).toBe(0);
  });

  it('exports a JSON-roundtrippable audit trail with exact configuration and separate synthetic provenance', () => {
    const provenance = { source: 'synthetic' as const, agentModel: 'local-model', personaId: 'persona-example', personaVersion: '1' };
    let game = add(session({ provenance }), 'milk');
    game = submit(game);
    game = applyMarketAction(game, { type: 'giveUp' });
    game = applyMarketAction(game, { type: 'skipRating' });
    const episode = exportMarketEpisode(game);
    expect(JSON.parse(serializeMarketEpisode(game))).toEqual(episode);
    expect(episode.provenance).toEqual(provenance);
    expect(episode.syntheticDataIsNotClinicalEvidence).toBe(true);
    expect(episode.initialStock.milk).toBe(6);
    expect(episode.finalStock.milk).toBe(5);
    expect(episode.events.find((event) => event.type === 'purchase_submitted')?.payload).toMatchObject({ attempt: 1, shownFeedback: { success: false }, evaluation: { success: false } });
    expect(episode.events.map((event) => event.sequence)).toEqual(episode.events.map((_, index) => index));
    expect(episode.events.every((event, index) => index === 0 || event.timestamp >= episode.events[index - 1].timestamp)).toBe(true);
  });

  it('parses configuration and rejects invalid ranges, items, duplicate slots, and incomplete provenance', () => {
    expect(parseMarketSessionConfig(JSON.stringify({ seed: 42 })).seed).toBe(42);
    for (const config of [{ seed: '' }, { stockPerProduct: -1 }, { objectives: [] }, { objectives: [{ productId: 'unknown', quantity: 1 }] }, { provenance: { source: 'synthetic' } }]) {
      expect(() => parseMarketSessionConfig(JSON.stringify(config))).toThrow();
    }
    expect(() => session({ inventoryProductIds: { fresh: Array(9).fill('milk') } })).toThrow('서로 다른');
  });

  it('agent adapter excludes teleport actions, enforces bounded movement, and exposes no audit answers', () => {
    const adapter = createMarketAgentAdapter({ seed: 'agent', provenance: { source: 'synthetic', agentModel: 'model', personaId: 'test' } });
    const initial = adapter.observe();
    expect(() => adapter.act({ type: 'setPosition', point: { x: 350, y: 400 } } as never)).toThrow('not allowed');
    expect(adapter.act({ type: 'move', dx: 200, dy: 0 }).playerPosition).toEqual(initial.playerPosition);
    expect(adapter.act({ type: 'move', dx: 0, dy: -10 }).playerPosition).toEqual({ x: initial.playerPosition.x, y: initial.playerPosition.y - 10 });
    expect(adapter.observe()).not.toHaveProperty('events');
    expect(() => adapter.exportEpisode()).toThrow('종료');
    adapter.act({ type: 'giveUp' });
    expect(adapter.exportEpisode().outcome).toBe('gave-up');
  });

  it('reveals stock only at the active shelf and cart contents only after opening the cart or checkout', () => {
    let game = session();
    expect(getMarketObservation(game)).toMatchObject({ cart: null, shelfSlots: {}, products: [], stock: {} });
    game = add(game, 'milk');
    const shelf = getMarketObservation(game);
    expect(Object.keys(shelf.shelfSlots)).toEqual(['fresh']);
    expect(shelf.products).toHaveLength(12);
    expect(shelf.products.every((product) => product.categoryId === 'fresh')).toBe(true);
    expect(shelf.cart).toBeNull();
    expect(shelf.stock.milk).toBe(5);
    game = applyMarketAction(game, { type: 'viewCart' });
    expect(getMarketObservation(game)).toMatchObject({ view: 'cart', cart: { milk: 1 } });
    expect(getMarketObservation(game).products).toHaveLength(12);
    expect(game.events.at(-1)?.type).toBe('cart_viewed');
    const blocked = applyMarketAction(game, { type: 'move', dx: 0, dy: 10 });
    expect(blocked.playerPosition).toEqual(game.playerPosition);
    expect(blocked.lastActionError).toContain('화면');
    game = applyMarketAction(game, { type: 'closeView' });
    game = applyMarketAction(game, { type: 'viewHelp' });
    expect(getMarketObservation(game).cart).toBeNull();
    expect(game.events.at(-1)?.type).toBe('help_viewed');
    game = applyMarketAction(game, { type: 'closeView' });
    game = visit(game, 'checkout');
    expect(getMarketObservation(game).cart).toEqual({ milk: 1 });
    game = applyMarketAction(game, { type: 'submit' });
    expect(getMarketObservation(game).cart).toBeNull();
  });

  it('lets the player add from the same shelf while its inline cart is expanded without allowing remote purchases', () => {
    let game = add(session(), 'milk');
    game = applyMarketAction(game, { type: 'viewCart' });
    game = applyMarketAction(game, { type: 'add', productId: 'milk' });
    expect(game.lastActionError).toBeNull();
    expect(getMarketObservation(game).cart).toEqual({ milk: 2 });
    expect(getMarketObservation(game).stock.milk).toBe(4);
    expect(game.events.at(-1)?.payload).toMatchObject({ operation: 'add', productId: 'milk', quantity: 1 });
    const wrongShelf = applyMarketAction(game, { type: 'add', productId: 'apple' });
    expect(wrongShelf.lastActionError).toContain('진열대');
    expect(wrongShelf.cart.apple).toBeUndefined();
    game = applyMarketAction(game, { type: 'closeStation' });
    game = applyMarketAction(game, { type: 'viewCart' });
    expect(getMarketObservation(game).products).toEqual([]);
    expect(applyMarketAction(game, { type: 'add', productId: 'milk' }).lastActionError).toContain('진열대');
    game = visit(applyMarketAction(game, { type: 'closeView' }), 'fresh');
    game = applyMarketAction(game, { type: 'viewHelp' });
    expect(applyMarketAction(game, { type: 'add', productId: 'milk' }).lastActionError).toContain('진열대');
  });

  it('ends a physical shared-door departure as giving up and rejects remote departure', () => {
    const game = session();
    const remote = applyMarketAction(game, { type: 'interact', station: 'common-door' });
    expect(remote.lastActionError).toContain('가까이');
    expect(remote.outcome).toBeNull();
    const left = visit(game, 'common-door');
    expect(left.outcome).toBe('gave-up');
    expect(left.attempts).toBe(0);
    expect(left.phase).toBe('finished');
    expect(left.events.at(-1)?.payload).toMatchObject({ reason: 'player_left_market', outcome: 'gave-up' });
  });
});

it('deducts at the exit once per outward crossing after rearm and records its gate ID', () => {
  let game = add(session(), 'milk');
  game = applyMarketAction(game, { type: 'setPosition', point: { x: 930, y: 1018 } });
  game = applyMarketAction(game, { type: 'move', dx: 0, dy: 24 });
  expect(game.lastActionError).toBeNull();
  expect(game).toMatchObject({ score: 90, penaltyPoints: 10, alarmCount: 1, alarmArmed: false, phase: 'shopping' });
  expect([...game.events].reverse().find(event => event.type === 'entrance_alarm')?.payload).toMatchObject({ gateId: 'exit', delta: -10, trigger: 'boundary-crossed' });
  for (let index = 0; index < 4; index++) {
    game = applyMarketAction(game, { type: 'move', dx: 0, dy: -20 });
    expect(game.lastActionError).toBeNull();
    game = applyMarketAction(game, { type: 'move', dx: 0, dy: 20 });
    expect(game.lastActionError).toBeNull();
  }
  expect(game.alarmCount).toBe(1);
  for (const point of [{ x: 470, y: 1100 }, { x: 930, y: 1280 }, { x: 710, y: 1370 }]) {
    game = applyMarketAction(game, { type: 'setPosition', point });
    expect(game.lastActionError).toBeNull();
    expect(game.alarmCount).toBe(1);
  }
  game = applyMarketAction(game, { type: 'setPosition', point: { x: 930, y: 970 } });
  expect(game.lastActionError).toBeNull();
  expect(game.alarmArmed).toBe(true);
  game = applyMarketAction(game, { type: 'setPosition', point: { x: 930, y: 1018 } });
  game = applyMarketAction(game, { type: 'move', dx: 0, dy: 24 });
  expect(game).toMatchObject({ score: 80, penaltyPoints: 20, alarmCount: 2 });
  expect(game.events.filter(event => event.type === 'entrance_alarm').map(event => event.payload.gateId)).toEqual(['exit', 'exit']);
  expect(exportMarketEpisode(applyMarketAction(game, { type: 'giveUp' }))).toMatchObject({ score: 80, alarmCount: 2, penaltyPoints: 20 });
});

it.each(['entrance', 'exit', 'west-door'] as const)('%s exempts empty and already-paid baskets on an actual outward crossing', gateId => {
  for (const hasPaidBasket of [false, true]) {
    // A paid walking snapshot also exercises the paid guard independently of the finished-phase movement guard.
    let game: MarketSession = hasPaidBasket ? { ...add(session(), 'milk'), paid: true } : session();
    const gate = game.environment.alarmGates.find(candidate => candidate.id === gateId)!;
    const inside = gate.axis === 'x' ? { x: gate.boundary + 12, y: gate.gate.y + gate.gate.height / 2 }
      : { x: gate.gate.x + gate.gate.width / 2, y: gate.boundary - 12 };
    game = applyMarketAction(game, { type: 'setPosition', point: inside });
    expect(game.lastActionError).toBeNull();
    game = applyMarketAction(game, { type: 'move', dx: gate.axis === 'x' ? -24 : 0, dy: gate.axis === 'y' ? 24 : 0 });
    expect(game.lastActionError).toBeNull();
    expect(game).toMatchObject({ score: 100, penaltyPoints: 0, alarmCount: 0, alarmArmed: false });
  }
});

it('bounded player movement cannot step into the elevator wall gap', () => {
  const game = applyMarketAction(session(), { type: 'setPosition', point: { x: 165, y: 260 } });
  expect(game.lastActionError).toBeNull();
  const blocked = applyMarketAction(game, { type: 'move', dx: 0, dy: -20 });
  expect(blocked.lastActionError).toContain('장애물');
  expect(blocked.playerPosition).toEqual(game.playerPosition);
});


it('preserves a fixed twelve-product assortment and upgrades old nine-product presets without duplicate slots', () => {
  const original = session();
  const fixed = [...original.shelfSlots.fresh];
  const twelve = session({ inventoryProductIds: { fresh: fixed } });
  expect(twelve.shelfSlots.fresh).toEqual(fixed);
  const legacy = ['milk', ...fixed.filter(id => id !== 'milk')].slice(0, 9);
  const upgraded = session({ inventoryProductIds: { fresh: legacy } });
  expect(upgraded.shelfSlots.fresh.slice(0, 9)).toEqual(legacy);
  expect(new Set(upgraded.shelfSlots.fresh).size).toBe(12);
  expect(upgraded.config.inventoryProductIds?.fresh).toEqual(upgraded.shelfSlots.fresh);
  expect(createMarketSession(upgraded.config)).toEqual(upgraded);
  expect(() => session({ inventoryProductIds: { fresh: [...fixed.slice(0, 11), fixed[0]] } })).toThrow('서로 다른');
});

it('never repeats a product in any category over one hundred seeds', () => {
  for (let seed = 0; seed < 100; seed++) {
    const generated = session({ seed });
    for (const slots of Object.values(generated.shelfSlots)) expect(new Set(slots).size).toBe(12);
  }
});
