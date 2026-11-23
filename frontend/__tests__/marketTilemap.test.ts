import { createMarketEnvironment, getMarketStationDistance, isMarketEnvironmentBlocked, type MarketLayoutId } from '../src/game/marketEnvironment';
import { getMarketShelfUnitRects } from '../src/game/marketFixtureLayout';
import { createMarketSession, parseMarketSessionConfig } from '../src/game/marketSession';
import {
  applyMarketTilemapToConfig, clearMarketTilemapFromConfig, createMarketTilemapFromEnvironment, getMarketTilemapPoint,
  parseMarketTilemapJson, serializeMarketTilemap, validateMarketTilemapPlacement,
} from '../src/game/marketTilemap';

const baseConfig = { seed: 'grid-test', employeeCount: 2, customerCount: 2, pillarCount: 0, chairCount: 0, cashierCount: 2 as const, kioskPresent: false };
const makeDraft = (layoutId: MarketLayoutId = 'classic') => createMarketTilemapFromEnvironment(createMarketEnvironment({ ...baseConfig, layoutId }));

describe('grid-authored market layouts', () => {
  test.each(['classic', 'aisles', 'corner'] as const)('%s existing floor plan can become a playable grid draft', layoutId => {
    const map = makeDraft(layoutId);
    const result = validateMarketTilemapPlacement(map, createMarketEnvironment({ ...baseConfig, layoutId }).config);
    expect(result).toEqual({ valid: true, errors: [] });
    const environment = createMarketEnvironment({ ...baseConfig, tilemap: map });
    expect(environment.config.layoutId).toBe(layoutId);
    expect(environment.shelves.produce.slotId).toBe('grid-shelf-produce');
    expect(isMarketEnvironmentBlocked(environment, environment.spawn)).toBe(false);
  });

  test.each(['classic', 'aisles', 'corner'] as const)('%s converts crowded preset maps with both staffed and self-checkout lanes', layoutId => {
    for (const seed of ['oneuldo-market-1', 'grid-crowded', '0']) {
      const preset = createMarketEnvironment({ layoutId, seed, employeeCount: 3, customerCount: 5, pillarCount: 4,
        kioskLane: 'checkout-2', cashierCount: 0, entranceConstruction: true });
      expect(validateMarketTilemapPlacement(createMarketTilemapFromEnvironment(preset), preset.config)).toEqual({ valid: true, errors: [] });
    }
  });

  it('uses exact grid anchors for people, shelf ground collision and station interactions', () => {
    const map = makeDraft();
    const environment = createMarketEnvironment({ ...baseConfig, tilemap: map });
    for (const person of map.people) {
      const actual = [...environment.employees, ...environment.customers].find(entry => entry.id === person.id)!;
      expect(actual.point).toEqual(getMarketTilemapPoint(person));
      expect(environment.obstacles).toContainEqual(actual.collider);
      if (person.kind === 'employee') expect(environment.stations[`staff:${person.id}`]).toBeDefined();
    }
    for (const shelf of Object.values(environment.shelves)) {
      for (const rect of getMarketShelfUnitRects(shelf)) {
        expect(environment.obstacles).toContainEqual(rect);
        expect(isMarketEnvironmentBlocked(environment, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })).toBe(true);
      }
    }
    expect(Number.isFinite(getMarketStationDistance(environment, 'produce', environment.shelves.produce.point))).toBe(true);
  });

  it('round-trips layout JSON and session config without losing explicit IDs, zero customers or appearances', () => {
    const map = makeDraft();
    map.people = map.people.filter(person => person.kind === 'employee');
    map.people[0].id = 'employee-west';
    const parsed = parseMarketTilemapJson(serializeMarketTilemap(map));
    expect(parsed).toEqual(map);
    const config = applyMarketTilemapToConfig(createMarketEnvironment(baseConfig).config, parsed);
    const session = createMarketSession({ seed: 'grid-test', environment: config });
    const restored = createMarketSession(parseMarketSessionConfig(JSON.stringify(session.config)));
    expect(restored.environment.shelves).toEqual(session.environment.shelves);
    expect(restored.environment.employees).toEqual(session.environment.employees);
    expect(restored.environment.customers).toEqual([]);
    expect(restored.config.environment?.tilemap).toEqual(map);
  });

  it('rejects unsupported fields, versions, noninteger/out-of-range coordinates and duplicate categories/IDs', () => {
    const map = makeDraft();
    const invalid = [
      null, false, 0, [], { ...map, version: 2 }, { ...map, cellSize: 40 }, { ...map, secret: true },
      { ...map, shelves: null }, { ...map, people: {} }, { ...map, people: [...map.people, ...map.people, ...map.people] },
      { ...map, shelves: map.shelves.map((shelf, index) => index ? shelf : { ...shelf, col: 1.2 }) },
      { ...map, shelves: map.shelves.map((shelf, index) => index ? shelf : { ...shelf, col: 999 }) },
      { ...map, shelves: map.shelves.map((shelf, index) => index ? shelf : { ...shelf, categoryId: map.shelves[1].categoryId }) },
      { ...map, people: map.people.map((person, index) => index ? person : { ...person, id: map.people[1].id }) },
      { ...map, people: map.people.map((person, index) => index ? person : { ...person, appearance: 999 }) },
    ];
    invalid.forEach(value => expect(() => parseMarketTilemapJson(JSON.stringify(value))).toThrow());
    expect(() => parseMarketTilemapJson(' '.repeat(48_001))).toThrow();
    expect(() => parseMarketTilemapJson('{')).toThrow();
    for (const tilemap of [null, false, 0]) expect(() => createMarketEnvironment({ ...baseConfig, tilemap } as never)).toThrow();
  });

  it('can return to preset layouts after a zero-customer grid layout', () => {
    const map = makeDraft();
    map.people = map.people.filter(person => person.kind === 'employee');
    const custom = createMarketEnvironment({ ...baseConfig, tilemap: map });
    const preset = clearMarketTilemapFromConfig(custom.config);
    expect(preset.tilemap).toBeUndefined();
    expect(createMarketEnvironment(preset).customers).toHaveLength(1);
  });

  it('rejects an isolated employee even though every placement has non-overlapping ground footprints', () => {
    const map = makeDraft();
    map.shelves = map.shelves.map(shelf => shelf.categoryId === 'produce' ? { ...shelf, col: 23, row: 8 }
      : shelf.categoryId === 'fresh' ? { ...shelf, col: 38, row: 8 } : shelf);
    map.people = [
      { id: 'isolated-staff', kind: 'employee', col: 32, row: 5, appearance: 0 },
      ...[47, 49, 51].map((col, index) => ({ id: `aisle-customer-${index}`, kind: 'customer' as const, col, row: 9, appearance: 0 })),
    ];
    const result = validateMarketTilemapPlacement(map, createMarketEnvironment(baseConfig).config);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('까지 갈 수 없습니다');
  });

  it('rejects shelf/person overlap, fixed walls and player spawn blockage without mutating the input', () => {
    const map = makeDraft();
    const original = serializeMarketTilemap(map);
    const shelf = map.shelves[0];
    const overlap = { ...map, shelves: map.shelves.map((entry, index) => index === 1 ? { ...entry, col: shelf.col, row: shelf.row } : entry) };
    expect(validateMarketTilemapPlacement(overlap, createMarketEnvironment(baseConfig).config).valid).toBe(false);
    const wall = { ...map, shelves: map.shelves.map((entry, index) => index === 0 ? { ...entry, col: 0, row: 0 } : entry) };
    expect(validateMarketTilemapPlacement(wall, createMarketEnvironment(baseConfig).config).valid).toBe(false);
    const spawn = createMarketEnvironment(baseConfig).spawn;
    const blocked = { ...map, people: map.people.map((person, index) => index === 0 ? { ...person, col: Math.floor(spawn.x / 20), row: Math.floor(spawn.y / 20) } : person) };
    expect(validateMarketTilemapPlacement(blocked, createMarketEnvironment(baseConfig).config).valid).toBe(false);
    expect(serializeMarketTilemap(map)).toBe(original);
  });
});
