import {
  MARKET_CASHIER_COLLIDER, MARKET_CASHIER_POINT, MARKET_CHECKOUT_POINT,
  MARKET_CHECKOUT_RECT, MARKET_EXIT_POINT, MARKET_PLAYER_POINT,
  MARKET_INTERIOR_ENTRANCE_POINT, MARKET_SECOND_CHECKOUT_RECT, MARKET_SECOND_CHECKOUT_POINT, MARKET_SECOND_CASHIER_POINT,
  MARKET_WORLD_HEIGHT, MARKET_WORLD_WIDTH, type Point, type Rect,
} from './prototypeWorld';
import type { MarketCategoryId } from './scenarios';
import { MARKET_CUSTOMER_APPEARANCES, MARKET_EMPLOYEE_APPEARANCES, getMarketPersonAppearance, type MarketPersonAppearanceId } from './marketPeople';

export type MarketCount = number | { min: number; max: number };
export type MarketCheckoutId = 'checkout' | 'checkout-2';
export type MarketCashierAvailability = Record<MarketCheckoutId, boolean>;
export type MarketEnvironmentStationId = MarketCategoryId | MarketCheckoutId | 'entrance' | 'exit' | `staff:${string}`;
export type MarketEnvironmentConfig = {
  seed: string | number;
  employeeCount: MarketCount;
  customerCount: MarketCount;
  pillarCount: MarketCount;
  chairCount: MarketCount;
  cashierCount: 0 | 1 | 2 | 'random';
  kioskPresent: boolean | 'random';
  /** Top left/right, middle left/center/right. Four-category legacy orders insert household in the middle left. */
  shelfOrder?: readonly MarketCategoryId[] | 'random';
  /** Optional candidate pools, restricted to the safe slots exported below. */
  employeeSlotIds?: readonly string[];
  customerSlotIds?: readonly string[];
  pillarSlotIds?: readonly string[];
  chairSlotIds?: readonly string[];
};
export type MarketPerson = {
  id: string; kind: 'employee' | 'customer'; label: string; slotId: string;
  point: Point; collider: Rect; appearance: number;
  /** Stable catalog ID recorded alongside the legacy numeric appearance index. */
  appearanceId?: MarketPersonAppearanceId;
};
export type MarketEnvironmentObject = {
  id: string; kind: 'pillar' | 'chair' | 'kiosk' | 'restSet' | 'atm' | 'elevator'; slotId: string; rect: Rect;
};
export type MarketShelfPlacement = Rect & { slotId: string; point: Point; orientation: 'horizontal' | 'vertical' };
export type MarketCheckoutPlacement = {
  id: MarketCheckoutId; rect: Rect; point: Point; cashierPresent: boolean; cashierPoint: Point; cashierCollider: Rect;
  cashierAppearance?: number;
};
export type MarketStationDetail = {
  id: MarketEnvironmentStationId;
  kind: 'shelf' | 'employee' | 'checkout' | 'entrance' | 'exit';
  point: Point;
  categoryId?: MarketCategoryId;
};
export type MarketEnvironment = {
  schemaVersion: 1;
  layoutVersion: 2;
  seed: string;
  config: MarketEnvironmentConfig;
  shelves: Record<MarketCategoryId, MarketShelfPlacement>;
  stations: Record<MarketEnvironmentStationId, Point>;
  stationDetails: MarketStationDetail[];
  employees: MarketPerson[];
  customers: MarketPerson[];
  objects: MarketEnvironmentObject[];
  /** First checkout alias retained for previous renderers and episode readers. */
  checkout: MarketCheckoutPlacement;
  checkouts: MarketCheckoutPlacement[];
  world: { width: number; height: number };
  walkableAreas: Array<Rect & { id: string }>;
  walls: Rect[];
  entrance: { point: Point; gate: Rect; alarmBoundaryY: number; rearmY: number };
  obstacles: Rect[];
  spawn: Point;
  exit: Point;
};

export const MARKET_ENVIRONMENT_VERSION = 2;
export const MARKET_ENVIRONMENT_PLAYER_RADIUS = 22;
export const MARKET_ENVIRONMENT_INTERACTION_DISTANCE = 105;
export const DEFAULT_MARKET_ENVIRONMENT_CONFIG: MarketEnvironmentConfig = {
  seed: 'oneuldo-market-1', employeeCount: { min: 1, max: 3 },
  customerCount: { min: 1, max: 5 }, pillarCount: { min: 1, max: 3 },
  chairCount: 0, cashierCount: 'random', kioskPresent: 'random',
  shelfOrder: ['produce', 'fresh', 'household', 'meal', 'drink'],
};

export const MARKET_SHELF_SLOTS: readonly MarketShelfPlacement[] = [
  { slotId: 'northwest', orientation: 'horizontal', width: 242, height: 64, x: 379, y: 196, point: { x: 500, y: 308 } },
  { slotId: 'northeast', orientation: 'horizontal', width: 242, height: 64, x: 739, y: 196, point: { x: 860, y: 308 } },
  { slotId: 'middle-west', orientation: 'vertical', width: 110, height: 168, x: 345, y: 432, point: { x: 500, y: 536 } },
  { slotId: 'middle-center', orientation: 'vertical', width: 110, height: 168, x: 595, y: 432, point: { x: 550, y: 536 } },
  { slotId: 'middle-east', orientation: 'vertical', width: 110, height: 168, x: 845, y: 432, point: { x: 800, y: 536 } },
];
export const MARKET_WALKABLE_AREAS: Array<Rect & { id: string }> = [
  { id: 'main-sales-floor', x: 310, y: 80, width: 740, height: 960 },
  { id: 'elevator-room', x: 50, y: 80, width: 260, height: 300 },
  { id: 'west-corridor', x: 120, y: 340, width: 190, height: 700 },
  { id: 'entrance-lobby', x: 120, y: 1000, width: 930, height: 130 },
];
export const MARKET_WALLS: Rect[] = [
  { x: 26, y: 56, width: 1048, height: 24 },
  { x: 1050, y: 80, width: 24, height: 1074 },
  { x: 26, y: 80, width: 24, height: 300 },
  { x: 26, y: 380, width: 94, height: 24 },
  { x: 96, y: 404, width: 24, height: 750 },
  { x: 120, y: 1130, width: 930, height: 24 },
  { x: 286, y: 80, width: 24, height: 170 },
  { x: 286, y: 380, width: 24, height: 300 },
  { x: 630, y: 780, width: 18, height: 240 },
  { x: 310, y: 1020, width: 100, height: 20 },
  { x: 530, y: 1020, width: 260, height: 20 },
  { x: 950, y: 1020, width: 100, height: 20 },
];
type PersonSlot = { id: string; point: Point };
export const MARKET_EMPLOYEE_SLOTS: readonly PersonSlot[] = [
  { id: 'staff-west-aisle', point: { x: 500, y: 420 } },
  { id: 'staff-east-aisle', point: { x: 790, y: 420 } },
  { id: 'staff-southwest', point: { x: 535, y: 765 } },
  { id: 'staff-southeast', point: { x: 840, y: 720 } },
  { id: 'staff-northwest', point: { x: 680, y: 150 } },
  { id: 'staff-northeast', point: { x: 1010, y: 355 } },
];
export const MARKET_CUSTOMER_SLOTS: readonly PersonSlot[] = [
  { id: 'customer-center-west', point: { x: 525, y: 640 } },
  { id: 'customer-center-east', point: { x: 775, y: 640 } },
  { id: 'customer-west', point: { x: 215, y: 800 } },
  { id: 'customer-east', point: { x: 1010, y: 660 } },
  { id: 'customer-southwest', point: { x: 590, y: 935 } },
  { id: 'customer-southeast', point: { x: 820, y: 1005 } },
  { id: 'customer-northwest', point: { x: 680, y: 350 } },
  { id: 'customer-northeast', point: { x: 980, y: 135 } },
  { id: 'customer-center', point: { x: 670, y: 680 } },
];
type ObjectSlot = { id: string; rect: Rect };
export const MARKET_PILLAR_SLOTS: readonly ObjectSlot[] = [
  { id: 'pillar-west', rect: { x: 325, y: 645, width: 30, height: 30 } },
  { id: 'pillar-east', rect: { x: 1005, y: 515, width: 30, height: 30 } },
  { id: 'pillar-northwest', rect: { x: 325, y: 100, width: 30, height: 30 } },
  { id: 'pillar-northeast', rect: { x: 1005, y: 100, width: 30, height: 30 } },
];
export const MARKET_CHAIR_SLOTS: readonly ObjectSlot[] = [
  { id: 'chair-west-one', rect: { x: 140, y: 465, width: 38, height: 34 } },
  { id: 'chair-west-two', rect: { x: 140, y: 615, width: 38, height: 34 } },
  { id: 'chair-east-one', rect: { x: 1000, y: 415, width: 38, height: 34 } },
  { id: 'chair-east-two', rect: { x: 1000, y: 735, width: 38, height: 34 } },
];
export const MARKET_KIOSK_SLOT: ObjectSlot = {
  id: 'kiosk-north', rect: { x: 570, y: 105, width: 64, height: 48 },
};
export const MARKET_FIXED_OBJECTS: MarketEnvironmentObject[] = [
  { id: 'rest-set-1', kind: 'restSet', slotId: 'rest-west-one', rect: { x: 350, y: 738, width: 100, height: 64 } },
  { id: 'rest-set-2', kind: 'restSet', slotId: 'rest-west-two', rect: { x: 350, y: 838, width: 100, height: 64 } },
  { id: 'atm-1', kind: 'atm', slotId: 'atm-west', rect: { x: 140, y: 920, width: 60, height: 70 } },
  { id: 'elevator-1', kind: 'elevator', slotId: 'elevator-west', rect: { x: 60, y: 190, width: 80, height: 50 } },
  { id: 'elevator-2', kind: 'elevator', slotId: 'elevator-east', rect: { x: 190, y: 190, width: 80, height: 50 } },
];
const CATEGORY_IDS: MarketCategoryId[] = ['produce', 'fresh', 'household', 'meal', 'drink'];

/** FNV-1a + mulberry32: stable across browsers, devices, and execution order. */
export function createMarketRandom(seed: string | number): () => number {
  let state = 2166136261;
  for (const char of String(seed)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}
function countRange(value: MarketCount, name: string, low: number, high: number) {
  const range = typeof value === 'number' ? { min: value, max: value } : value;
  if (!range || !Number.isInteger(range.min) || !Number.isInteger(range.max) ||
    range.min < low || range.max > high || range.min > range.max) {
    throw new Error(`${name}: ${low}~${high} 사이의 정수 또는 min/max 범위를 지정하세요.`);
  }
  return range;
}
function drawCount(value: MarketCount, name: string, low: number, high: number, random: () => number) {
  const range = countRange(value, name, low, high);
  return range.min + Math.floor(random() * (range.max - range.min + 1));
}
function candidateSlots<T extends { id: string }>(all: readonly T[], ids: readonly string[] | undefined, name: string) {
  if (!ids) return [...all];
  if (new Set(ids).size !== ids.length || ids.some((id) => !all.some((slot) => slot.id === id))) {
    throw new Error(`${name}: 중복되지 않는 사전 지정 위치 ID를 사용하세요.`);
  }
  return ids.map((id) => all.find((slot) => slot.id === id)!);
}
function chooseSlots<T extends { id: string }>(all: readonly T[], ids: readonly string[] | undefined, count: number, name: string, random: () => number) {
  const pool = candidateSlots(all, ids, name);
  if (pool.length < count) throw new Error(`${name}: 배치 개수보다 후보 위치가 적습니다.`);
  return shuffle(pool, random).slice(0, count);
}
function makePeople(kind: MarketPerson['kind'], slots: PersonSlot[], appearanceRandom: () => number): MarketPerson[] {
  const pool = kind === 'employee' ? MARKET_EMPLOYEE_APPEARANCES : MARKET_CUSTOMER_APPEARANCES;
  const appearances = shuffle(pool.map((_, index) => index), appearanceRandom);
  return slots.map((slot, index) => ({
    id: `${kind}-${index + 1}`, kind, label: `${kind === 'employee' ? '종업원' : '손님'} ${index + 1}`,
    slotId: slot.id, point: { ...slot.point }, appearance: appearances[index],
    appearanceId: getMarketPersonAppearance(kind, appearances[index]).id,
    collider: { x: slot.point.x - 13, y: slot.point.y - 10, width: 26, height: 18 },
  }));
}

export function createMarketEnvironment(overrides: Partial<MarketEnvironmentConfig> = {}): MarketEnvironment {
  const knownKeys = ['seed', 'employeeCount', 'customerCount', 'pillarCount', 'chairCount', 'cashierCount',
    'kioskPresent', 'shelfOrder', 'employeeSlotIds', 'customerSlotIds', 'pillarSlotIds', 'chairSlotIds'];
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) ||
    Object.keys(overrides).some((key) => !knownKeys.includes(key))) throw new Error('알 수 없는 마트 환경 변수입니다.');
  const config: MarketEnvironmentConfig = { ...DEFAULT_MARKET_ENVIRONMENT_CONFIG, ...overrides };
  if ((typeof config.seed !== 'string' && typeof config.seed !== 'number') ||
    String(config.seed).trim().length === 0 ||
    (typeof config.seed === 'number' && !Number.isFinite(config.seed))) throw new Error('seed를 지정하세요.');
  if (![0, 1, 2, 'random'].includes(config.cashierCount)) throw new Error('cashierCount는 0, 1, 2, random 중 하나입니다.');
  if (![true, false, 'random'].includes(config.kioskPresent)) throw new Error('kioskPresent는 true, false, random 중 하나입니다.');
  if (config.shelfOrder !== 'random') {
    const order = config.shelfOrder;
    if (!Array.isArray(order) || ![4, 5].includes(order.length) || new Set(order).size !== order.length ||
      order.some((id) => !CATEGORY_IDS.includes(id)) || (order.length === 4 && order.includes('household'))) {
      throw new Error('shelfOrder에 5개 카테고리를 각각 한 번 지정하거나 random을 사용하세요. 이전 4개 순서도 가져올 수 있습니다.');
    }
    if (order.length === 4) config.shelfOrder = [...order.slice(0, 2), 'household', ...order.slice(2)];
  }
  for (const [count, name, min, max, slots, ids] of [
    [config.employeeCount, 'employeeCount', 1, 3, MARKET_EMPLOYEE_SLOTS, config.employeeSlotIds],
    [config.customerCount, 'customerCount', 1, 5, MARKET_CUSTOMER_SLOTS, config.customerSlotIds],
    [config.pillarCount, 'pillarCount', 0, 4, MARKET_PILLAR_SLOTS, config.pillarSlotIds],
    [config.chairCount, 'chairCount', 0, 4, MARKET_CHAIR_SLOTS, config.chairSlotIds],
  ] as const) {
    const range = countRange(count, name, min, max);
    const pool = candidateSlots<{ id: string }>(slots, ids, name);
    if (pool.length < range.max) throw new Error(`${name}: 최대 배치 개수보다 후보 위치가 적습니다.`);
  }
  // Legacy settings are accepted, but seating now always consists of the two fixed sets.
  config.chairCount = 0;
  const random = createMarketRandom(`${config.seed}:environment:v2`);
  const order = config.shelfOrder === 'random' ? shuffle(CATEGORY_IDS, random) : config.shelfOrder!;
  const shelves = Object.fromEntries(order.map((id, index) => [id, {
    ...MARKET_SHELF_SLOTS[index], point: { ...MARKET_SHELF_SLOTS[index].point },
  }])) as Record<MarketCategoryId, MarketShelfPlacement>;
  const employees = makePeople('employee', chooseSlots(MARKET_EMPLOYEE_SLOTS, config.employeeSlotIds,
    drawCount(config.employeeCount, 'employeeCount', 1, 3, random), 'employeeSlotIds', random),
    createMarketRandom(`${config.seed}:employee-appearance:v1`));
  const customers = makePeople('customer', chooseSlots(MARKET_CUSTOMER_SLOTS, config.customerSlotIds,
    drawCount(config.customerCount, 'customerCount', 1, 5, random), 'customerSlotIds', random),
    createMarketRandom(`${config.seed}:customer-appearance:v1`));
  const objects: MarketEnvironmentObject[] = [
    ...MARKET_FIXED_OBJECTS.map(object => ({ ...object, rect: { ...object.rect } })),
    ...chooseSlots(MARKET_PILLAR_SLOTS, config.pillarSlotIds,
      drawCount(config.pillarCount, 'pillarCount', 0, 4, random), 'pillarSlotIds', random)
      .map((slot, index) => ({ id: `pillar-${index + 1}`, kind: 'pillar' as const, slotId: slot.id, rect: { ...slot.rect } })),
  ];
  const cashierCount = config.cashierCount === 'random' ? Math.floor(random() * 3) : config.cashierCount;
  const staffedIndexes = shuffle([0, 1], random).slice(0, cashierCount);
  // Use a separate random stream so new art never changes existing floor layouts.
  const cashierAppearances = shuffle(MARKET_EMPLOYEE_APPEARANCES.map((_, index) => index),
    createMarketRandom(`${config.seed}:cashier-appearance:v1`))
    .sort((a, b) => Number(employees.some(person => person.appearance === a)) - Number(employees.some(person => person.appearance === b)));
  const checkouts: MarketCheckoutPlacement[] = [
    { id: 'checkout', rect: { ...MARKET_CHECKOUT_RECT }, point: { ...MARKET_CHECKOUT_POINT }, cashierPoint: { ...MARKET_CASHIER_POINT },
      cashierCollider: { ...MARKET_CASHIER_COLLIDER }, cashierPresent: staffedIndexes.includes(0), cashierAppearance: cashierAppearances[0] },
    { id: 'checkout-2', rect: { ...MARKET_SECOND_CHECKOUT_RECT }, point: { ...MARKET_SECOND_CHECKOUT_POINT }, cashierPoint: { ...MARKET_SECOND_CASHIER_POINT },
      cashierCollider: { x: MARKET_SECOND_CASHIER_POINT.x - 13, y: MARKET_SECOND_CASHIER_POINT.y - 10, width: 26, height: 18 }, cashierPresent: staffedIndexes.includes(1), cashierAppearance: cashierAppearances[1] },
  ];
  const kioskPresent = config.kioskPresent === 'random' ? random() < 0.5 : config.kioskPresent;
  if (kioskPresent) objects.push({ id: 'kiosk-1', kind: 'kiosk', slotId: MARKET_KIOSK_SLOT.id, rect: { ...MARKET_KIOSK_SLOT.rect } });
  const stationDetails: MarketStationDetail[] = [
    ...CATEGORY_IDS.map((categoryId) => ({ id: categoryId, kind: 'shelf' as const, categoryId, point: shelves[categoryId].point })),
    ...checkouts.map(checkout => ({ id: checkout.id, kind: 'checkout' as const, point: { ...checkout.point } })),
    { id: 'entrance', kind: 'entrance', point: { ...MARKET_INTERIOR_ENTRANCE_POINT } },
    { id: 'exit', kind: 'exit', point: { ...MARKET_EXIT_POINT } },
    ...employees.map((person) => ({ id: `staff:${person.id}` as const, kind: 'employee' as const,
      point: person.slotId === 'staff-west-aisle' ? { x: person.point.x + 56, y: person.point.y }
        : person.slotId === 'staff-southwest' ? { x: person.point.x + 56, y: person.point.y }
        : { x: person.point.x, y: person.point.y + 56 } })),
  ];
  const environment: MarketEnvironment = {
    schemaVersion: 1, layoutVersion: 2, seed: String(config.seed), config: JSON.parse(JSON.stringify(config)) as MarketEnvironmentConfig,
    shelves, stationDetails, stations: Object.fromEntries(stationDetails.map(({ id, point }) => [id, point])) as MarketEnvironment['stations'],
    employees, customers, objects,
    checkout: checkouts[0], checkouts, world: { width: MARKET_WORLD_WIDTH, height: MARKET_WORLD_HEIGHT },
    walkableAreas: MARKET_WALKABLE_AREAS.map(area => ({ ...area })), walls: MARKET_WALLS.map(rect => ({ ...rect })),
    entrance: { point: { ...MARKET_INTERIOR_ENTRANCE_POINT }, gate: { x: 410, y: 1010, width: 120, height: 40 }, alarmBoundaryY: 1030, rearmY: 970 },
    obstacles: [...MARKET_WALLS, ...checkouts.map(checkout => checkout.rect), ...Object.values(shelves), ...employees.map((person) => person.collider),
      ...customers.map((person) => person.collider), ...objects.map((object) => object.rect),
      ...checkouts.filter(checkout => checkout.cashierPresent).map(checkout => checkout.cashierCollider)].map((rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })),
    spawn: { ...MARKET_PLAYER_POINT }, exit: { ...MARKET_EXIT_POINT },
  };
  return environment;
}

export function getMarketEnvironmentObstacles(environment: MarketEnvironment, cashierCalled: boolean | Partial<MarketCashierAvailability> = false): Rect[] {
  const availability = typeof cashierCalled === 'boolean' ? { checkout: cashierCalled } : cashierCalled;
  return [...environment.obstacles, ...environment.checkouts.filter(checkout =>
    availability[checkout.id] && !checkout.cashierPresent).map(checkout => checkout.cashierCollider)];
}
export function isMarketEnvironmentBlocked(environment: MarketEnvironment, point: Point, cashierCalled: boolean | Partial<MarketCashierAvailability> = false) {
  const radius = MARKET_ENVIRONMENT_PLAYER_RADIUS;
  const inWalkableArea = (x: number, y: number) => environment.walkableAreas.some(area =>
    x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height);
  return !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < radius || point.y < radius ||
    point.x > MARKET_WORLD_WIDTH - radius || point.y > MARKET_WORLD_HEIGHT - radius ||
    [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]].some(([dx, dy]) => !inWalkableArea(point.x + dx, point.y + dy)) ||
    getMarketEnvironmentObstacles(environment, cashierCalled).some((rect) =>
      point.x + radius > rect.x && point.x - radius < rect.x + rect.width &&
      point.y + radius > rect.y && point.y - radius < rect.y + rect.height);
}
export function isNearMarketStation(environment: MarketEnvironment, stationId: MarketEnvironmentStationId, position: Point, maxDistance = MARKET_ENVIRONMENT_INTERACTION_DISTANCE) {
  const point = environment.stations[stationId];
  return !!point && !isMarketEnvironmentBlocked(environment, position) &&
    Math.hypot(position.x - point.x, position.y - point.y) <= maxDistance;
}
