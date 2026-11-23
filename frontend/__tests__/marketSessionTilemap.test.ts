import { applyMarketAction, createMarketSession, replaceMarketSessionTilemap, type MarketSession } from '../src/game/marketSession';
import { getMarketStationApproachPoint, isMarketEnvironmentBlocked, type MarketEnvironmentStationId } from '../src/game/marketEnvironment';
import { createMarketTilemapFromEnvironment } from '../src/game/marketTilemap';

function visit(game: MarketSession, station: MarketEnvironmentStationId) {
  const point = getMarketStationApproachPoint(game.environment, station, game.playerPosition, game.cashierAvailability)!;
  const moved = applyMarketAction(game, { type: 'setPosition', point });
  const next = applyMarketAction(moved, { type: 'interact', station });
  expect(next.lastActionError).toBeNull();
  return next;
}
function initial() {
  return createMarketSession({ seed: 'grid-session', startedAt: '2026-10-17T00:00:00.000Z',
    environment: { cashierCount: 0, kioskLane: 'none', pillarCount: 0, employeeCount: 2, customerCount: 2 } });
}

it('applies an in-game layout atomically while preserving basket, stock, learning and the called cashier', () => {
  let game = initial();
  game = applyMarketAction(visit(game, 'produce'), { type: 'add', productId: 'apple', quantity: 2 });
  expect(game.cart.apple).toBe(2);
  game = applyMarketAction(game, { type: 'closeStation' });
  game = applyMarketAction(visit(game, `staff:${game.environment.employees[0].id}`), { type: 'requestCashier' });
  expect(game.cashierAvailability.checkout).toBe(true);
  game = applyMarketAction(game, { type: 'closeStation' });
  const original = JSON.stringify(game);
  const map = createMarketTilemapFromEnvironment(game.environment);
  map.people = map.people.filter(person => person.kind === 'employee');
  const edited = replaceMarketSessionTilemap(game, map, '2026-10-17T00:05:00.000Z');
  expect(JSON.stringify(game)).toBe(original);
  for (const field of ['id', 'cart', 'stock', 'initialStock', 'shelfSlots', 'objectives', 'learning', 'score', 'penaltyPoints',
    'alarmCount', 'alarmArmed', 'wrongWayEntryCount', 'wrongWayEntryArmed', 'paid', 'attempts', 'ratings', 'ratingSkipped', 'outcome'] as const) {
    expect(edited[field]).toEqual(game[field]);
  }
  expect(edited.environment.customers).toEqual([]);
  expect(edited.cashierAvailability).toEqual(game.cashierAvailability);
  expect(edited.environment.checkout.cashierPresent).toBe(true);
  expect(edited.environment.obstacles).toContainEqual(edited.environment.checkout.cashierCollider);
  expect(edited.playerPosition).toEqual(edited.environment.spawn);
  expect(isMarketEnvironmentBlocked(edited.environment, edited.playerPosition, edited.cashierAvailability)).toBe(false);
  expect(edited).toMatchObject({ activeStation: null, selectedCheckoutId: null, selectedKioskId: null, checkoutReview: null, phase: 'shopping', view: 'world' });
  expect(edited.events.slice(0, -1)).toEqual(game.events);
  expect(edited.events.at(-1)).toMatchObject({ type: 'layout_changed', timestamp: '2026-10-17T00:05:00.000Z', payload: { tilemap: map, previousTilemap: null } });
});

it('rejects a malformed or blocked replacement without modifying the running session', () => {
  const game = initial();
  const original = JSON.stringify(game);
  const map = createMarketTilemapFromEnvironment(game.environment);
  map.shelves[0].col = 0;
  expect(() => replaceMarketSessionTilemap(game, map)).toThrow();
  expect(() => replaceMarketSessionTilemap(game, { version: 2 } as never)).toThrow();
  expect(JSON.stringify(game)).toBe(original);
});

it.each(['checkout', 'feedback', 'finished'] as const)('does not edit a session during %s', phase => {
  const game = initial();
  const current = { ...game, phase };
  const original = JSON.stringify(current);
  expect(() => replaceMarketSessionTilemap(current, createMarketTilemapFromEnvironment(game.environment))).toThrow();
  expect(JSON.stringify(current)).toBe(original);
});

it('requires a closed conversation and returns the same playable purchase to the world', () => {
  const game = visit(initial(), 'produce');
  const map = createMarketTilemapFromEnvironment(game.environment);
  expect(() => replaceMarketSessionTilemap(game, map)).toThrow();
  const closed = applyMarketAction(game, { type: 'closeStation' });
  expect(replaceMarketSessionTilemap(closed, map).phase).toBe('shopping');
});
