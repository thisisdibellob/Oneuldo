import { createMarketEnvironment, isMarketEnvironmentBlocked } from '../src/game/marketEnvironment';
import { resolveMarketEnvironmentMovement, resolveMarketMovement } from '../src/game/marketMovement';
import type { Point } from '../src/game/prototypeWorld';

const unclamped = (point: Point) => point;

describe('shared market movement', () => {
  it('preserves unobstructed displacement without changing either input', () => {
    const position = Object.freeze({ x: 20, y: 30 });
    const delta = Object.freeze({ x: 12, y: -9 });
    const result = resolveMarketMovement(position, delta, { clamp: unclamped, isBlocked: () => false });
    expect(result).toEqual({ position: { x: 32, y: 21 }, requestedDelta: delta, actualDelta: delta,
      requestedDistancePx: 15, movedDistancePx: 15, outcome: 'moved' });
    expect(position).toEqual({ x: 20, y: 30 });
    expect(delta).toEqual({ x: 12, y: -9 });
  });

  it('samples an accessibility step before a thin wall and slides along its free axis', () => {
    const constraints = { clamp: unclamped, isBlocked: (point: Point) => point.x >= 10 && point.x <= 16 };
    const movement = resolveMarketMovement({ x: 0, y: 0 }, { x: 30, y: 15 }, constraints);
    expect(movement).toMatchObject({ position: { x: 6, y: 15 }, actualDelta: { x: 6, y: 15 }, outcome: 'partially-blocked' });
    const blocked = resolveMarketMovement(movement.position, { x: 6, y: 0 }, constraints);
    expect(blocked).toMatchObject({ position: movement.position, movedDistancePx: 0, outcome: 'blocked' });
  });

  it('clamps to boundaries and reports the displacement that actually occurred', () => {
    const result = resolveMarketMovement({ x: 18, y: 10 }, { x: 12, y: -12 }, {
      clamp: point => ({ x: Math.min(20, Math.max(0, point.x)), y: Math.min(20, Math.max(0, point.y)) }),
      isBlocked: () => false,
    });
    expect(result).toMatchObject({ position: { x: 20, y: 0 }, actualDelta: { x: 2, y: -10 }, outcome: 'partially-blocked' });
    expect(result.movedDistancePx).toBeCloseTo(Math.hypot(2, 10));
  });

  it('treats zero input as a completed stationary input', () => {
    expect(resolveMarketMovement({ x: 1, y: 2 }, { x: 0, y: 0 }, { clamp: unclamped, isBlocked: () => false }))
      .toMatchObject({ position: { x: 1, y: 2 }, movedDistancePx: 0, outcome: 'moved' });
  });

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite input %s before sampling', value => {
    expect(() => resolveMarketMovement({ x: 0, y: 0 }, { x: value, y: 0 }, { clamp: unclamped, isBlocked: () => false })).toThrow('finite');
  });

  it('uses the market player radius and runtime cashier colliders', () => {
    const environment = createMarketEnvironment({ seed: 'movement-cashier', cashierCount: 0, kioskLane: 'none' });
    const cashier = environment.checkouts[0];
    const from = { x: cashier.cashierCollider.x - 12, y: cashier.cashierCollider.y + cashier.cashierCollider.height / 2 };
    expect(isMarketEnvironmentBlocked(environment, from, { [cashier.id]: true })).toBe(false);
    const empty = resolveMarketEnvironmentMovement(environment, from, { x: 6, y: 0 });
    const occupied = resolveMarketEnvironmentMovement(environment, from, { x: 6, y: 0 }, { [cashier.id]: true });
    expect(empty.actualDelta.x).toBe(6);
    expect(occupied).toMatchObject({ position: from, outcome: 'blocked' });
  });
});
