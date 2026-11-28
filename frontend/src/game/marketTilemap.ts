import {
  createMarketEnvironment, getMarketLayoutStructure, getMarketStationDistance, getMarketWrongWayGate, getNearestMarketStation,
  isMarketEnvironmentBlocked, MARKET_ENVIRONMENT_PLAYER_RADIUS,
  type MarketEnvironment, type MarketEnvironmentConfig, type MarketLayoutId, type MarketPerson, type MarketShelfPlacement,
} from './marketEnvironment';
import {
  getMarketShelfUnitRects, MARKET_SHELF_PAIR_HEIGHT, MARKET_SHELF_PAIR_WIDTH,
  MARKET_SHELF_UNIT_WIDTH, MARKET_SHELF_VERTICAL_HEIGHT,
} from './marketFixtureLayout';
import { isMarketNavigationSegmentClear } from './marketNavigation';
import { getMarketPersonCollider } from './marketPersonLayout';
import { getMarketPersonAppearance, MARKET_CUSTOMER_APPEARANCES, MARKET_EMPLOYEE_APPEARANCES } from './marketPeople';
import type { Point, Rect } from './prototypeWorld';
import type { MarketCategoryId } from './scenarios';

/** Grid cells describe floor anchors, not screen/image pixels. Runtime art retains its scale. */
export const MARKET_TILE_SIZE = 20 as const;
export const MARKET_TILEMAP_FORMAT = 'oneuldo.market-layout' as const;
export const MARKET_TILEMAP_CATEGORY_IDS: readonly MarketCategoryId[] = ['produce', 'fresh', 'household', 'meal', 'drink'];
export type MarketTilemapShelf = { categoryId: MarketCategoryId; col: number; row: number; orientation: 'horizontal' | 'vertical' };
export type MarketTilemapPerson = { id: string; kind: 'employee' | 'customer'; col: number; row: number; appearance: number };
export type MarketTilemapV1 = {
  format: typeof MARKET_TILEMAP_FORMAT;
  version: 1;
  layoutId: MarketLayoutId;
  cellSize: typeof MARKET_TILE_SIZE;
  shelves: MarketTilemapShelf[];
  people: MarketTilemapPerson[];
};
export type MarketTilemapValidation = { valid: boolean; errors: string[] };
const MAX_JSON_LENGTH = 48_000;
const CATEGORY_LABELS: Record<MarketCategoryId, string> = { produce: '과일·채소', fresh: '냉장식품', household: '생활용품', meal: '간편식품', drink: '음료' };

export function getMarketTilemapGrid(layoutId: MarketLayoutId) {
  const { width, height } = getMarketLayoutStructure(layoutId).world;
  return { width, height, columns: Math.ceil(width / MARKET_TILE_SIZE), rows: Math.ceil(height / MARKET_TILE_SIZE), cellSize: MARKET_TILE_SIZE };
}
export function getMarketTilemapPoint(entry: { col: number; row: number }): Point {
  return { x: (entry.col + 0.5) * MARKET_TILE_SIZE, y: (entry.row + 0.5) * MARKET_TILE_SIZE };
}
export function getMarketTilemapFootprint(entry: MarketTilemapShelf | MarketTilemapPerson): Rect {
  const point = getMarketTilemapPoint(entry);
  if ('kind' in entry) return getMarketPersonCollider(point, entry.kind, entry.appearance);
  const width = entry.orientation === 'horizontal' ? MARKET_SHELF_PAIR_WIDTH : MARKET_SHELF_UNIT_WIDTH;
  const height = entry.orientation === 'horizontal' ? MARKET_SHELF_PAIR_HEIGHT : MARKET_SHELF_VERTICAL_HEIGHT;
  return { x: point.x - width / 2, y: point.y - height / 2, width, height };
}
function object(value: unknown, keys: string[], name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) {
    throw new Error(`${name}: 지원하지 않는 필드 또는 형식입니다.`);
  }
}
/** Strict, bounded input parsing. Never coerce fractional coordinates or silently drop unknown fields. */
export function parseMarketTilemap(value: unknown): MarketTilemapV1 {
  object(value, ['format', 'version', 'layoutId', 'cellSize', 'shelves', 'people'], '배치 JSON');
  if (value.format !== MARKET_TILEMAP_FORMAT || value.version !== 1) throw new Error('배치 JSON의 format 또는 version이 올바르지 않습니다.');
  if (!['classic', 'aisles', 'corner'].includes(value.layoutId as string)) throw new Error('배치 JSON의 layoutId가 올바르지 않습니다.');
  if (value.cellSize !== MARKET_TILE_SIZE) throw new Error('배치 JSON의 cellSize는 20이어야 합니다.');
  const layoutId = value.layoutId as MarketLayoutId;
  const grid = getMarketTilemapGrid(layoutId);
  const coordinates = (entry: Record<string, unknown>) => {
    if (!Number.isInteger(entry.col) || !Number.isInteger(entry.row) || (entry.col as number) < 0 || (entry.row as number) < 0
      || (entry.col as number) >= grid.columns || (entry.row as number) >= grid.rows) throw new Error('배치 좌표 col/row는 지도 안의 0부터 시작하는 정수여야 합니다.');
    return { col: entry.col as number, row: entry.row as number };
  };
  if (!Array.isArray(value.shelves) || value.shelves.length !== 5) throw new Error('다섯 종류의 진열대를 각각 하나씩 배치하세요.');
  const shelves = value.shelves.map((entry): MarketTilemapShelf => {
    object(entry, ['categoryId', 'col', 'row', 'orientation'], '진열대');
    if (!MARKET_TILEMAP_CATEGORY_IDS.includes(entry.categoryId as MarketCategoryId)) throw new Error('진열대 categoryId가 올바르지 않습니다.');
    if (entry.orientation !== 'horizontal' && entry.orientation !== 'vertical') throw new Error('진열대 방향은 horizontal 또는 vertical이어야 합니다.');
    return { categoryId: entry.categoryId as MarketCategoryId, ...coordinates(entry), orientation: entry.orientation };
  });
  if (new Set(shelves.map(shelf => shelf.categoryId)).size !== 5) throw new Error('다섯 종류의 진열대를 중복 없이 배치하세요.');
  if (!Array.isArray(value.people) || value.people.length > 8) throw new Error('종업원은 1~3명, 손님은 0~5명까지 배치할 수 있습니다.');
  const people = value.people.map((entry): MarketTilemapPerson => {
    object(entry, ['id', 'kind', 'col', 'row', 'appearance'], '인물');
    if (typeof entry.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(entry.id)) throw new Error('인물 id는 영문자로 시작하는 48자 이내 영문·숫자·밑줄·하이픈이어야 합니다.');
    if (entry.kind !== 'employee' && entry.kind !== 'customer') throw new Error('인물 kind는 employee 또는 customer여야 합니다.');
    const count = entry.kind === 'employee' ? MARKET_EMPLOYEE_APPEARANCES.length : MARKET_CUSTOMER_APPEARANCES.length;
    if (!Number.isInteger(entry.appearance) || (entry.appearance as number) < 0 || (entry.appearance as number) >= count) throw new Error('인물 appearance가 지원되는 이미지 범위를 벗어났습니다.');
    return { id: entry.id, kind: entry.kind, ...coordinates(entry), appearance: entry.appearance as number };
  });
  if (new Set(people.map(person => person.id)).size !== people.length) throw new Error('인물 id는 서로 달라야 합니다.');
  const employees = people.filter(person => person.kind === 'employee').length;
  const customers = people.length - employees;
  if (employees < 1 || employees > 3 || customers > 5) throw new Error('종업원은 1~3명, 손님은 0~5명까지 배치할 수 있습니다.');
  return { format: MARKET_TILEMAP_FORMAT, version: 1, layoutId, cellSize: MARKET_TILE_SIZE, shelves, people };
}
export function parseMarketTilemapJson(json: string): MarketTilemapV1 {
  if (typeof json !== 'string' || json.length > MAX_JSON_LENGTH) throw new Error('배치 JSON은 48,000자 이내여야 합니다.');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('JSON 문법을 확인하세요. 쉼표와 따옴표가 올바르게 입력되어야 합니다.'); }
  return parseMarketTilemap(value);
}
export function serializeMarketTilemap(tilemap: MarketTilemapV1): string {
  return JSON.stringify(parseMarketTilemap(tilemap), null, 2);
}
/** Explicit placements replace random people/order controls; other scenario options are retained. */
export function applyMarketTilemapToConfig(config: MarketEnvironmentConfig, value: MarketTilemapV1): MarketEnvironmentConfig {
  const tilemap = parseMarketTilemap(value);
  return { ...config, layoutId: tilemap.layoutId, tilemap,
    employeeCount: tilemap.people.filter(person => person.kind === 'employee').length,
    customerCount: tilemap.people.filter(person => person.kind === 'customer').length,
    employeeSlotIds: undefined, customerSlotIds: undefined };
}
/** Preset layouts historically require a customer; custom layouts may intentionally have none. */
export function clearMarketTilemapFromConfig(config: MarketEnvironmentConfig): MarketEnvironmentConfig {
  const { tilemap: _tilemap, ...preset } = config;
  const customerCount = typeof preset.customerCount === 'number' ? Math.max(1, preset.customerCount)
    : { min: Math.max(1, preset.customerCount.min), max: Math.max(1, preset.customerCount.max) };
  return { ...preset, customerCount };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width - 1e-7 && a.x + a.width > b.x + 1e-7 && a.y < b.y + b.height - 1e-7 && a.y + a.height > b.y + 1e-7;
const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
function movingRects(environment: MarketEnvironment): Rect[] {
  return [...Object.values(environment.shelves).flatMap(getMarketShelfUnitRects), ...environment.employees.map(person => person.collider), ...environment.customers.map(person => person.collider)];
}
/** No pixel transform: all renderers, collision queries and navigation consume this one environment. */
export function applyMarketTilemapToEnvironment(base: MarketEnvironment, tilemap: MarketTilemapV1): MarketEnvironment {
  const oldRects = movingRects(base);
  const fixed = base.obstacles.filter(rect => !oldRects.some(old => sameRect(rect, old)));
  const shelves = Object.fromEntries(tilemap.shelves.map(entry => {
    const rect = getMarketTilemapFootprint(entry);
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height + MARKET_ENVIRONMENT_PLAYER_RADIUS + 12 };
    return [entry.categoryId, { ...rect, slotId: `grid-shelf-${entry.categoryId}`, orientation: entry.orientation, point }];
  })) as Record<MarketCategoryId, MarketShelfPlacement>;
  const makePerson = (entry: MarketTilemapPerson, index: number): MarketPerson => {
    const point = getMarketTilemapPoint(entry);
    return { id: entry.id, kind: entry.kind, label: `${entry.kind === 'employee' ? '종업원' : '손님'} ${index + 1}`,
      slotId: `grid-${entry.id}`, point, collider: getMarketTilemapFootprint(entry), appearance: entry.appearance,
      appearanceId: getMarketPersonAppearance(entry.kind, entry.appearance).id };
  };
  const employees = tilemap.people.filter(person => person.kind === 'employee').map(makePerson);
  const customers = tilemap.people.filter(person => person.kind === 'customer').map(makePerson);
  const stationDetails = [
    ...base.stationDetails.filter(station => station.kind !== 'shelf' && station.kind !== 'employee'),
    ...tilemap.shelves.map(entry => ({ id: entry.categoryId, kind: 'shelf' as const, categoryId: entry.categoryId, point: shelves[entry.categoryId].point })),
    ...employees.map(person => ({ id: `staff:${person.id}` as const, kind: 'employee' as const, point: { x: person.point.x, y: person.point.y + 50 } })),
  ];
  const result = { ...base, shelves, employees, customers, stationDetails,
    stations: Object.fromEntries(stationDetails.map(station => [station.id, station.point])) as MarketEnvironment['stations'],
    obstacles: [...fixed, ...Object.values(shelves).flatMap(getMarketShelfUnitRects), ...employees.map(person => person.collider), ...customers.map(person => person.collider)] };
  assertMarketTilemapEnvironment(result, fixed);
  return result;
}

/** Fill the connected free space once, preserving the runtime's full player footprint and gate direction. */
function reachableFloor(environment: MarketEnvironment): Point[] {
  const step = 16;
  const columns = Math.floor(environment.world.width / step) + 1;
  const rows = Math.floor(environment.world.height / step) + 1;
  const visited = new Uint8Array(columns * rows);
  const free = new Uint8Array(columns * rows);
  const queue: number[] = [];
  const pointAt = (node: number) => ({ x: (node % columns) * step, y: Math.floor(node / columns) * step });
  const isFree = (node: number) => {
    if (!free[node]) free[node] = isMarketEnvironmentBlocked(environment, pointAt(node), { checkout: true, 'checkout-2': true }) ? 2 : 1;
    return free[node] === 1;
  };
  const clear = (a: Point, b: Point) => !getMarketWrongWayGate(environment, a, b)
    && isMarketNavigationSegmentClear(environment, a, b, { checkout: true, 'checkout-2': true });
  const cx = Math.round(environment.spawn.x / step), cy = Math.round(environment.spawn.y / step);
  for (let y = Math.max(0, cy - 2); y <= Math.min(rows - 1, cy + 2); y++) for (let x = Math.max(0, cx - 2); x <= Math.min(columns - 1, cx + 2); x++) {
    const node = y * columns + x;
    if (isFree(node) && clear(environment.spawn, pointAt(node))) { visited[node] = 1; queue.push(node); }
  }
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head], x = node % columns, y = Math.floor(node / columns), point = pointAt(node);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (x + dx < 0 || x + dx >= columns || y + dy < 0 || y + dy >= rows) continue;
      const next = (y + dy) * columns + x + dx;
      if (!visited[next] && isFree(next) && clear(point, pointAt(next))) { visited[next] = 1; queue.push(next); }
    }
  }
  return queue.map(pointAt);
}
function assertMarketTilemapEnvironment(environment: MarketEnvironment, fixed: Rect[]): void {
  const entries: Array<{ label: string; rects: Rect[] }> = [
    ...Object.entries(environment.shelves).map(([id, shelf]) => ({ label: `${CATEGORY_LABELS[id as MarketCategoryId]} 진열대`, rects: getMarketShelfUnitRects(shelf) })),
    ...[...environment.employees, ...environment.customers].map(person => ({ label: person.label, rects: [person.collider] })),
  ];
  // Reserve cashier standing space even before the player calls the cashier.
  const reserved = [...fixed, ...environment.checkouts.filter(counter => counter.kind !== 'kiosk').map(counter => counter.cashierCollider),
    ...environment.alarmGates.map(gate => gate.gate), environment.commonDoor.gate];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    for (const rect of entry.rects) {
      const inside = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]
        .every(([x, y]) => environment.walkableAreas.some(area => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height));
      if (!inside || reserved.some(obstacle => overlaps(rect, obstacle))) throw new Error(`${entry.label}: 벽·고정 시설·출입구와 겹칩니다. 빈 바닥으로 옮겨 주세요.`);
      if (entries.slice(0, index).some(previous => previous.rects.some(other => overlaps(rect, other)))) throw new Error(`${entry.label}: 다른 진열대 또는 사람과 겹칩니다.`);
    }
  }
  if (isMarketEnvironmentBlocked(environment, environment.spawn, { checkout: true, 'checkout-2': true })) throw new Error('플레이어 시작 위치를 비워 주세요.');
  const floor = reachableFloor(environment);
  for (const station of environment.stationDetails) {
    if (station.available === false) continue;
    const limit = station.kind === 'shelf' ? 64 : ['checkout', 'kiosk'].includes(station.kind) ? 60 : station.kind === 'common-door' ? 56 : 88;
    const movable = station.kind === 'shelf' || station.kind === 'employee';
    const candidates = floor.filter(point => Math.abs(point.x - station.point.x) < 420 && Math.abs(point.y - station.point.y) < 420
      && getMarketStationDistance(environment, station.id, point, { checkout: true, 'checkout-2': true }) <= limit);
    candidates.sort((a, b) => Math.hypot(a.x - station.point.x, a.y - station.point.y) - Math.hypot(b.x - station.point.x, b.y - station.point.y));
    const approach = movable ? candidates.find(point => getNearestMarketStation(environment, point, { checkout: true, 'checkout-2': true })?.id === station.id) : candidates[0];
    if (!approach) throw new Error(`${station.kind === 'shelf' ? CATEGORY_LABELS[station.categoryId!] + ' 진열대' : station.kind === 'employee' ? '종업원' : station.kind === 'checkout' || station.kind === 'kiosk' ? '계산대' : '출입구'}까지 갈 수 없습니다. 이동 통로를 넓혀 주세요.`);
    if (movable) {
      // AI observations and touch-to-walk hints receive a genuinely reachable action anchor too.
      station.point = { ...approach };
      environment.stations[station.id] = station.point;
      if (station.categoryId) environment.shelves[station.categoryId].point = station.point;
    }
  }
}
export function validateMarketTilemapPlacement(tilemap: MarketTilemapV1, config: MarketEnvironmentConfig): MarketTilemapValidation {
  try { createMarketEnvironment(applyMarketTilemapToConfig(config, tilemap)); return { valid: true, errors: [] }; }
  catch (error) { return { valid: false, errors: [error instanceof Error ? error.message : '배치를 확인할 수 없습니다.'] }; }
}
/** Existing saved layouts remain unchanged until the author explicitly applies this snapped draft. */
export function createMarketTilemapFromEnvironment(environment: MarketEnvironment): MarketTilemapV1 {
  if (environment.config.tilemap) return parseMarketTilemap(environment.config.tilemap);
  const cell = (value: number) => Math.max(0, Math.round(value / MARKET_TILE_SIZE - 0.5));
  return {
    format: MARKET_TILEMAP_FORMAT, version: 1, layoutId: environment.config.layoutId ?? 'classic', cellSize: MARKET_TILE_SIZE,
    shelves: MARKET_TILEMAP_CATEGORY_IDS.map(categoryId => {
      const shelf = environment.shelves[categoryId];
      return { categoryId, col: cell(shelf.x + shelf.width / 2), row: cell(shelf.y + shelf.height / 2), orientation: shelf.orientation };
    }),
    people: [...environment.employees, ...environment.customers].map(person => ({ id: person.id, kind: person.kind, col: cell(person.point.x), row: cell(person.point.y), appearance: person.appearance })),
  };
}
