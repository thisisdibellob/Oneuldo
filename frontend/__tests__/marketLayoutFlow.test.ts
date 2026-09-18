import { applyMarketAction, createMarketSession, exportMarketEpisode, type MarketSession } from '../src/game/marketSession';
import { getMarketStationApproachPoint, MARKET_LAYOUT_OPTIONS, type MarketEnvironmentStationId } from '../src/game/marketEnvironment';
import { getMarketNavigationPath } from '../src/game/marketNavigation';

function visit(game: MarketSession, station: MarketEnvironmentStationId) {
  game = applyMarketAction(game, { type: 'closeStation' });
  const target = getMarketStationApproachPoint(game.environment, station, game.playerPosition, game.cashierAvailability)!;
  const path = getMarketNavigationPath(game.environment, game.playerPosition, target, game.cashierAvailability);
  expect(path).not.toBeNull();
  for (const waypoint of path!) {
    const start = game.playerPosition;
    const dx = waypoint.x - start.x; const dy = waypoint.y - start.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 12));
    for (let step = 0; step < steps; step++) {
      game = applyMarketAction(game, { type: 'move', dx: dx / steps, dy: dy / steps });
      if (game.lastActionError) throw new Error(JSON.stringify({ station, path, waypoint, start, current: game.playerPosition, dx: dx / steps, dy: dy / steps, error: game.lastActionError }));
      expect(game.lastActionError).toBeNull();
    }
    expect(game.playerPosition.x).toBeCloseTo(waypoint.x);
    expect(game.playerPosition.y).toBeCloseTo(waypoint.y);
  }
  game = applyMarketAction(game, { type: 'interact', station });
  expect(game.lastActionError).toBeNull();
  return game;
}

it.each(MARKET_LAYOUT_OPTIONS.flatMap(layout => [false, true].map(entranceConstruction => ({ ...layout, entranceConstruction }))))('$label 공사=$entranceConstruction에서 반납·직원 도움·계산원 호출을 걸어서 수행하고 구매에 성공한다', ({ id: layoutId, entranceConstruction }) => {
  let game = createMarketSession({ seed: 'both-layout-return-route', difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 1 }],
    learning: { stockoutEnabled: false, budgetChoiceEnabled: false },
    environment: { layoutId, entranceConstruction, shelfOrder: 'random', cashierCount: 0, employeeCount: 3, customerCount: 5, pillarCount: 4, kioskPresent: true } });
  game = visit(game, 'fresh');
  game = applyMarketAction(game, { type: 'add', productId: 'milk', quantity: 3 });
  expect(game.cart.milk).toBe(3);
  game = visit(game, 'produce');
  game = applyMarketAction(game, { type: 'remove', productId: 'milk' });
  expect(game.lastActionError).toBeTruthy();
  expect(game.cart.milk).toBe(3);
  game = visit(game, 'fresh');
  game = applyMarketAction(game, { type: 'remove', productId: 'milk' });
  expect(game.cart.milk).toBe(2);
  const staff = game.environment.stationDetails.find(station => station.kind === 'employee')!.id;
  game = visit(game, staff);
  game = applyMarketAction(game, { type: 'requestReturn', productId: 'milk' });
  expect(game.cart.milk).toBe(1);
  game = applyMarketAction(game, { type: 'requestCashier' });
  expect(game.cashierAvailability).toEqual({ checkout: true, 'checkout-2': false });
  game = visit(game, 'checkout');
  game = applyMarketAction(game, { type: 'submit' });
  expect(game).toMatchObject({ outcome: 'success', attempts: 1, paid: true, score: 100, alarmCount: 0 });
  expect(exportMarketEpisode(game).environment.config.layoutId).toBe(layoutId);
  expect(exportMarketEpisode(game).environment.config.entranceConstruction).toBe(entranceConstruction);
});
