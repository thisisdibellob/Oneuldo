import { createMarketEnvironment, getMarketEnvironmentObstacles, getMarketStationApproachPoint, isMarketEnvironmentBlocked, MARKET_LAYOUT_OPTIONS } from '../src/game/marketEnvironment';
import { getMarketNavigationPath, isMarketNavigationSegmentClear } from '../src/game/marketNavigation';
import { getMarketRecoveryPoint } from '../src/game/marketRecovery';
import { applyMarketAction, createMarketSession, getMarketObservation, type MarketSession } from '../src/game/marketSession';
import type { Point } from '../src/game/prototypeWorld';

const states = MARKET_LAYOUT_OPTIONS.flatMap(layout => [false, true].map(entranceConstruction => ({ ...layout, entranceConstruction })));
const called = { checkout: true, 'checkout-2': true };
const make = (layoutId: typeof MARKET_LAYOUT_OPTIONS[number]['id'], entranceConstruction: boolean) => createMarketEnvironment({ layoutId, entranceConstruction,
  seed: 'construction-boundaries', employeeCount: 3, customerCount: 5, pillarCount: 4, cashierCount: 0, kioskPresent: true });
function walk(game: MarketSession, point: Point) {
  const from = game.playerPosition;
  const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / 12));
  for (let index = 0; index < steps; index++) {
    game = applyMarketAction(game, { type: 'move', dx: (point.x - from.x) / steps, dy: (point.y - from.y) / steps });
    expect(game.lastActionError).toBeNull();
  }
  return game;
}

it.each(states)('$label 공사=$entranceConstruction 경로는 막힌 문을 건너뛰지 않고 열린 우회문을 통과한다', ({ id, entranceConstruction }) => {
  const env = make(id, entranceConstruction);
  const from = { x: env.entrance.point.x, y: env.entrance.alarmBoundaryY + 60 };
  const to = { x: env.entrance.point.x, y: env.entrance.alarmBoundaryY - 60 };
  expect(isMarketNavigationSegmentClear(env, from, to, called)).toBe(!entranceConstruction);
  const path = getMarketNavigationPath(env, from, to, called);
  expect(path).not.toBeNull();
  if (entranceConstruction) expect(path!.length).toBeGreaterThan(1);
  let previous = from;
  for (const point of path!) { expect(isMarketNavigationSegmentClear(env, previous, point, called)).toBe(true); previous = point; }
  expect(previous).toEqual(to);
  const side = env.alarmGates.find(gate => gate.axis === 'x')!;
  const sideY = side.gate.y + side.gate.height * (id === 'corner' ? 0.75 : 0.4);
  expect(isMarketNavigationSegmentClear(env, { x: side.boundary - 64, y: sideY }, { x: side.boundary + 64, y: sideY }, called)).toBe(true);
  expect(getMarketNavigationPath(env, env.spawn, env.commonDoor.point, called)).not.toBeNull();
});

it.each(MARKET_LAYOUT_OPTIONS)('$label 공사 펜스는 관측·상호작용·이동·회복에서 일관되게 막힌다', ({ id }) => {
  const env = make(id, true);
  const outside = { x: env.entrance.point.x, y: env.entrance.alarmBoundaryY + 48 };
  let game = createMarketSession({ seed: env.seed }, env);
  expect(getMarketObservation(game).environment.stationDetails.find(station => station.id === 'entrance')!.available).toBe(false);
  expect(getMarketStationApproachPoint(env, 'entrance', outside)).toBeNull();
  game = applyMarketAction(game, { type: 'setPosition', point: outside });
  expect(applyMarketAction(game, { type: 'interact', station: 'entrance' }).lastActionError).toBe('안쪽 입구를 이용해 주세요.');
  expect(applyMarketAction(game, { type: 'move', dx: 0, dy: -32 }).lastActionError).toBe('안쪽 입구를 이용해 주세요.');
  expect(applyMarketAction(game, { type: 'move', dx: 0, dy: -32 }).playerPosition).toEqual(outside);
  expect(applyMarketAction(game, { type: 'setPosition', point: env.entrance.point }).lastActionError).toBeTruthy();
  for (const current of [outside, { x: outside.x, y: env.entrance.alarmBoundaryY - 48 }]) {
    const recovered = getMarketRecoveryPoint(env, current, called)!;
    expect(recovered).not.toBeNull();
    expect(isMarketNavigationSegmentClear(env, current, recovered, called)).toBe(true);
    expect((recovered.y - env.entrance.alarmBoundaryY) * (current.y - env.entrance.alarmBoundaryY)).toBeGreaterThan(0);
  }
  const missingSnapshotObstacle = { ...env, obstacles: env.obstacles.filter(rect => !env.constructionZones.some(zone => JSON.stringify(zone.rect) === JSON.stringify(rect))) };
  expect(getMarketEnvironmentObstacles(missingSnapshotObstacle)).toContainEqual(env.constructionZones[0].rect);
  expect(isMarketEnvironmentBlocked(missingSnapshotObstacle, env.entrance.point)).toBe(true);
});

it.each(states)('$label 공사=$entranceConstruction의 열린 모든 경보기는 미결제 반출만 감점하고 돌아온 뒤 재무장한다', ({ id, entranceConstruction }) => {
  const env = make(id, entranceConstruction);
  for (const gate of env.alarmGates.filter(gate => !entranceConstruction || gate.id !== 'entrance')) {
    const other = gate.axis === 'x' ? 'y' : 'x';
    const center = gate.gate[other] + (gate.axis === 'x' ? gate.gate.height * (id === 'corner' ? 0.75 : 0.4) : gate.gate.width * (id === 'corner' && gate.id === 'exit' ? 0.85 : 0.5));
    const inside = { [gate.axis]: gate.boundary - gate.outward * 64, [other]: center } as Point;
    const outside = { [gate.axis]: gate.boundary + gate.outward * 64, [other]: center } as Point;
    expect(isMarketNavigationSegmentClear(env, inside, outside, called)).toBe(true);
    for (const state of ['unpaid', 'empty', 'paid'] as const) {
      let game: MarketSession = { ...createMarketSession({ seed: env.seed }, env), playerPosition: inside, cart: state === 'empty' ? {} : { milk: 1 },
        paid: state === 'paid', cashierAvailability: called };
      game = walk(game, outside);
      expect(game.alarmCount).toBe(state === 'unpaid' ? 1 : 0);
      if (state === 'unpaid') {
        expect(game.events.filter(event => event.type === 'entrance_alarm').at(-1)!.payload.gateId).toBe(gate.id);
        game = walk(game, inside); expect(game.alarmArmed).toBe(true);
        game = walk(game, outside); expect(game.alarmCount).toBe(2); expect(game.wrongWayEntryCount).toBe(gate.id === 'exit' ? 1 : 0); expect(game.score).toBe(gate.id === 'exit' ? 70 : 80);
      }
    }
  }
});
