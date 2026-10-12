import { createMarketEnvironment, type MarketEnvironment } from '../src/game/marketEnvironment';
import { resolveMarketEnvironmentMovement } from '../src/game/marketMovement';
import { applyMarketAction, createMarketAgentAdapter, createMarketSession, type MarketSession } from '../src/game/marketSession';

function fixture() {
  const environment: MarketEnvironment = {
    ...createMarketEnvironment({ seed: 'move-input', cashierCount: 0, kioskLane: 'none' }),
    world: { width: 200, height: 200 }, walkableAreas: [{ id: 'room', x: 0, y: 0, width: 200, height: 200 }],
    walls: [], objects: [], checkouts: [], constructionZones: [], alarmGates: [],
    obstacles: [{ x: 100, y: 0, width: 8, height: 200 }], spawn: { x: 88, y: 50 },
  };
  return createMarketSession({ seed: 'move-input', learning: { stockoutEnabled: false, budgetChoiceEnabled: false } }, environment);
}

describe('bounded joystick input actions', () => {
  it('accepts a wall bump, records zero actual motion, and keeps the next decision available', () => {
    const before = fixture();
    const after = applyMarketAction(before, { type: 'moveInput', dx: 12, dy: 0 });
    expect(after.lastActionError).toBeNull();
    expect(after.playerPosition).toEqual(before.playerPosition);
    expect(after.events.at(-1)).toMatchObject({ type: 'player_moved', payload: { input: 'bounded-joystick-input',
      requestedDelta: { x: 12, y: 0 }, actualDelta: { x: 0, y: 0 }, outcome: 'blocked' } });
    expect(applyMarketAction(after, { type: 'viewCart' })).toMatchObject({ view: 'cart', lastActionError: null });
    expect(before.events).toHaveLength(1);
  });

  it('slides along a wall using the same resolver as the rendered player', () => {
    const before = fixture();
    const expected = resolveMarketEnvironmentMovement(before.environment, before.playerPosition, { x: 12, y: 12 }, before.cashierAvailability);
    const after = applyMarketAction(before, { type: 'moveInput', dx: 12, dy: 12 });
    expect(after).toMatchObject({ playerPosition: { x: 88, y: 62 }, lastActionError: null });
    expect(after.playerPosition).toEqual(expected.position);
    expect(after.events.at(-1)?.payload).toMatchObject({ actualDelta: { x: 0, y: 12 }, movedDistancePx: 12, outcome: 'partially-blocked' });
    // The older primitive remains an all-or-nothing path check for saved actors.
    const legacy = applyMarketAction(before, { type: 'move', dx: 12, dy: 12 });
    expect(legacy.playerPosition).toEqual(before.playerPosition);
    expect(legacy.lastActionError).toContain('장애물');
  });

  it('clamps at the world edge without turning that contact into a rejected action', () => {
    const before = { ...fixture(), playerPosition: { x: 13, y: 50 } };
    const after = applyMarketAction(before, { type: 'moveInput', dx: -10, dy: 0 });
    expect(after).toMatchObject({ playerPosition: { x: 12, y: 50 }, lastActionError: null });
    expect(after.events.at(-1)?.payload).toMatchObject({ actualDelta: { x: -1, y: 0 }, outcome: 'partially-blocked' });
  });

  it.each([{ dx: 33, dy: 0 }, { dx: 23, dy: 23 }, { dx: NaN, dy: 0 }, { dx: 0, dy: Infinity }])(
    'rejects invalid or oversized movement %j without applying a prefix', delta => {
      const before = fixture();
      const after = applyMarketAction(before, { type: 'moveInput', ...delta });
      expect(after.playerPosition).toEqual(before.playerPosition);
      expect(after.lastActionError).toContain('최대 32픽셀');
      expect(after.events.at(-1)?.type).toBe('action_rejected');
    },
  );

  it.each([
    { view: 'cart' }, { view: 'help' }, { view: 'requester' }, { activeStation: 'fresh' },
    { phase: 'checkout' }, { phase: 'feedback' }, { phase: 'finished' },
  ] as Partial<MarketSession>[])('preserves control locks %j', state => {
    const before = { ...fixture(), ...state };
    const after = applyMarketAction(before, { type: 'moveInput', dx: -6, dy: 0 });
    expect(after.playerPosition).toEqual(before.playerPosition);
    expect(after.lastActionError).not.toBeNull();
    expect(after.events.at(-1)?.type).toBe('action_rejected');
  });

  it('makes the new bounded primitive available through the synthetic adapter', () => {
    const game = fixture();
    const adapter = createMarketAgentAdapter({ ...game.config,
      provenance: { source: 'synthetic', agentModel: 'test', personaId: 'test' } }, game.environment);
    expect(adapter.act({ type: 'moveInput', dx: 12, dy: 12 }).playerPosition).toEqual({ x: 88, y: 62 });
  });

  it('preserves exit alarms and wrong-way entry when actual movement crosses a gate', () => {
    const game = createMarketSession({ seed: 'movement-gates', learning: { stockoutEnabled: false, budgetChoiceEnabled: false },
      environment: { customerCount: 1, customerSlotIds: ['customer-west'], pillarCount: 0, kioskLane: 'none' } });
    const gate = game.environment.alarmGates.find(item => item.id === 'exit')!;
    const x = gate.gate.x + gate.gate.width / 2;
    const outward = applyMarketAction({ ...game, playerPosition: { x, y: gate.boundary - 12 }, cart: { milk: 1 } },
      { type: 'moveInput', dx: 0, dy: 24 });
    expect(outward.lastActionError).toBeNull();
    expect(outward).toMatchObject({ alarmCount: 1, score: 90, wrongWayEntryCount: 0 });
    const inward = applyMarketAction({ ...game, playerPosition: { x, y: gate.boundary + 12 } }, { type: 'moveInput', dx: 0, dy: -24 });
    expect(inward.lastActionError).toBeNull();
    expect(inward).toMatchObject({ alarmCount: 0, score: 90, wrongWayEntryCount: 1 });
  });
});
