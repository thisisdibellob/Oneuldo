import { createMarketEnvironment, isMarketEnvironmentBlocked, MARKET_LAYOUT_OPTIONS, type MarketEnvironment } from '../src/game/marketEnvironment';
import { getMarketRecoveryPoint } from '../src/game/marketRecovery';
import { applyMarketAction, createMarketSession } from '../src/game/marketSession';
import type { Point } from '../src/game/prototypeWorld';

const environment = createMarketEnvironment({ seed: 'local-emergency', employeeCount: 3, customerCount: 5, cashierCount: 0 });
const called = { checkout: true, 'checkout-2': true };

function expectSafeSameSide(env: MarketEnvironment, current: Point, recovered: Point | null) {
  expect(recovered).not.toBeNull();
  expect(isMarketEnvironmentBlocked(env, recovered!, called)).toBe(false);
  for (const gate of env.alarmGates) {
    const before = (current[gate.axis] - gate.boundary) * gate.outward;
    const after = (recovered![gate.axis] - gate.boundary) * gate.outward;
    if (before <= 0) expect(after).toBeLessThanOrEqual(0);
    else expect(after).toBeGreaterThan(0);
  }
}

it('recovers from checkout locally without teleporting unpaid goods beyond the entrance alarm', () => {
  const current = { x: 807, y: 946 };
  const recovered = getMarketRecoveryPoint(environment, current, called);
  expectSafeSameSide(environment, current, recovered);
  expect(Math.hypot(recovered!.x - current.x, recovered!.y - current.y)).toBeGreaterThanOrEqual(48);
  expect(recovered).not.toEqual(environment.spawn);
  const session = {
    ...createMarketSession({ seed: environment.seed }, environment),
    cart: { milk: 1 },
    playerPosition: current,
    cashierAvailability: called,
  };
  const next = applyMarketAction(session, { type: 'setPosition', point: recovered! });
  expect(next.lastActionError).toBeNull();
  expect(next.cart).toEqual({ milk: 1 });
  expect(next.alarmCount).toBe(0);
  expect(next.score).toBe(session.score);
  expect(next.phase).toBe('shopping');
});

it.each([{ x: 200, y: 310 }, { x: 240, y: 800 }])('keeps west-side recovery west of the side-door alarm: %o', current => {
  const recovered = getMarketRecoveryPoint(environment, current, called);
  expectSafeSameSide(environment, current, recovered);
  expect(recovered!.x).toBeLessThan(298);
});

it('keeps a player already in the lobby outside the sales-floor alarm', () => {
  const current = environment.spawn;
  const recovered = getMarketRecoveryPoint(environment, current, called);
  expectSafeSameSide(environment, current, recovered);
  expect(recovered!.y).toBeGreaterThan(environment.entrance.alarmBoundaryY);
});

it('escapes a blocked elevator facade to a free point in front of it on the same west side', () => {
  const current = { x: 200, y: 170 };
  expect(isMarketEnvironmentBlocked(environment, current)).toBe(true);
  const recovered = getMarketRecoveryPoint(environment, current, called);
  expectSafeSameSide(environment, current, recovered);
  expect(recovered!.y).toBeGreaterThanOrEqual(256);
  expect(recovered!.x).toBeLessThan(298);
});

it('avoids actual employee, customer and newly called cashier footprints in seeded layouts', () => {
  for (const { id: layoutId } of MARKET_LAYOUT_OPTIONS) for (const entranceConstruction of [false, true]) for (let seed = 0; seed < 6; seed += 1) {
    const env = createMarketEnvironment({ layoutId, entranceConstruction, seed, employeeCount: 3, customerCount: 5, pillarCount: 4, cashierCount: 0 });
    for (const current of [...env.employees, ...env.customers].map(person => person.point)
      .concat(env.checkouts.map(counter => counter.cashierPoint))) {
      expect(isMarketEnvironmentBlocked(env, current, called)).toBe(true);
      const recovered = getMarketRecoveryPoint(env, current, called);
      expectSafeSameSide(env, current, recovered);
      expect(getMarketRecoveryPoint(env, current, called)).toEqual(recovered);
    }
  }
});

it('does not alter the environment and returns no unsafe fallback when no free point exists', () => {
  const snapshot = JSON.stringify(environment);
  getMarketRecoveryPoint(environment, { x: 807, y: 946 }, called);
  expect(JSON.stringify(environment)).toBe(snapshot);
  const noFreeArea = { ...environment, walkableAreas: [] };
  expect(getMarketRecoveryPoint(noFreeArea, { x: 807, y: 946 }, called)).toBeNull();
  expect(getMarketRecoveryPoint(environment, { x: NaN, y: 100 })).toBeNull();
});