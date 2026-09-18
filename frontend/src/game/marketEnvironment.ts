import {
  MARKET_COMMON_DOOR_POINT, MARKET_FRONT_WALL_Y, MARKET_CASHIER_POINT, MARKET_CHECKOUT_POINT,
  MARKET_CHECKOUT_RECT, MARKET_EXIT_POINT, MARKET_PLAYER_POINT,
  MARKET_INTERIOR_ENTRANCE_POINT, MARKET_SECOND_CHECKOUT_RECT, MARKET_SECOND_CHECKOUT_POINT, MARKET_SECOND_CASHIER_POINT,
  MARKET_WORLD_HEIGHT, MARKET_WORLD_WIDTH, type Point, type Rect,
} from './prototypeWorld';
import { getMarketShelfUnitRects } from './marketFixtureLayout';
import { getMarketPersonCollider } from './marketPersonLayout';
import type { MarketCategoryId } from './scenarios';
import { MARKET_CUSTOMER_APPEARANCES, MARKET_EMPLOYEE_APPEARANCES, getMarketPersonAppearance, type MarketPersonAppearanceId } from './marketPeople';

export type MarketLayoutId = 'classic' | 'aisles' | 'corner';
export const MARKET_LAYOUT_OPTIONS = [
  { id: 'classic', label: '기본 배치' },
  { id: 'aisles', label: '가로 통로 배치' },
  { id: 'corner', label: '모퉁이 지점' },
] as const satisfies readonly { id: MarketLayoutId; label: string }[];
/** Upright art shares a painter order based on the bottom of its ground footprint. */
export function getMarketRenderDepth(groundY: number) { return 10 + Math.round(groundY); }

export type MarketCount = number | { min: number; max: number };
export type MarketCheckoutId = 'checkout' | 'checkout-2';
export type MarketKioskId = `kiosk:${MarketCheckoutId}:${1 | 2}`;
export type MarketKioskLane = 'none' | MarketCheckoutId | 'random';
export type MarketCashierAvailability = Record<MarketCheckoutId, boolean>;
export type MarketEnvironmentStationId = MarketCategoryId | MarketCheckoutId | MarketKioskId | 'entrance' | 'exit' | 'common-door' | `staff:${string}`;
export type MarketEnvironmentConfig = {
  /** Older configuration JSON omits this field and keeps the classic floor plan. */
  layoutId?: MarketLayoutId;
  /** Close the front entrance; the common door and inner side entrance remain open. */
  entranceConstruction?: boolean;
  seed: string | number;
  employeeCount: MarketCount;
  customerCount: MarketCount;
  pillarCount: MarketCount;
  chairCount: MarketCount;
  cashierCount: 0 | 1 | 2 | 'random';
  /** Legacy switch: true replaces lane 2; no decorative kiosk is generated. */
  kioskPresent: boolean | 'random';
  /** One entire checkout lane may hold two working self-checkout terminals. */
  kioskLane?: MarketKioskLane;
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
  id: string; kind: 'pillar' | 'chair' | 'kiosk' | 'restSet' | 'atm' | 'elevator' | 'planter'; slotId: string; rect: Rect;
};
export type MarketShelfPlacement = Rect & { slotId: string; point: Point; orientation: 'horizontal' | 'vertical' };
export type MarketCheckoutPlacement = {
  kind?: 'staffed' | 'kiosk';
  id: MarketCheckoutId; rect: Rect; point: Point; cashierPresent: boolean; cashierPoint: Point; cashierCollider: Rect;
  cashierAppearance?: number;
};
export type MarketKioskPlacement = { id: MarketKioskId; laneId: MarketCheckoutId; number: 1 | 2; rect: Rect; point: Point };
export type MarketStationDetail = {
  id: MarketEnvironmentStationId;
  kind: 'shelf' | 'employee' | 'checkout' | 'kiosk' | 'entrance' | 'exit' | 'common-door';
  point: Point;
  categoryId?: MarketCategoryId;
  /** A closed construction entrance remains visible in observations but cannot be approached/interacted with. */
  available?: boolean;
};
export type MarketAlarmGate = {
  id: 'entrance' | 'exit' | 'west-door' | 'east-door'; gate: Rect; axis: 'x' | 'y'; boundary: number; rearm: number; outward: 1 | -1;
};
export type MarketConstructionZone = {
  id: 'entrance-construction'; gateId: 'entrance'; rect: Rect; detourGateIds: MarketAlarmGate['id'][];
};
export type MarketEnvironment = {
  schemaVersion: 1;
  layoutVersion: 3;
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
  kiosks: MarketKioskPlacement[];
  world: { width: number; height: number };
  walkableAreas: Array<Rect & { id: string }>;
  walls: Rect[];
  entrance: { point: Point; gate: Rect; alarmBoundaryY: number; rearmY: number };
  alarmGates: MarketAlarmGate[];
  constructionZones: MarketConstructionZone[];
  commonDoor: { point: Point; gate: Rect };
  obstacles: Rect[];
  spawn: Point;
  exit: Point;
};

export const MARKET_ENVIRONMENT_VERSION = 3;
export const MARKET_ENVIRONMENT_PLAYER_RADIUS = 12;
export const MARKET_ENVIRONMENT_INTERACTION_DISTANCE = 105;
export const DEFAULT_MARKET_ENVIRONMENT_CONFIG: MarketEnvironmentConfig = {
  layoutId: 'classic', entranceConstruction: false, seed: 'oneuldo-market-1', employeeCount: { min: 1, max: 3 },
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
  { id: 'main-sales-floor', x: 310, y: 80, width: 740, height: MARKET_FRONT_WALL_Y + 20 - 80 },
  { id: 'elevator-room', x: 50, y: 80, width: 260, height: 300 },
  { id: 'west-corridor', x: 120, y: 340, width: 190, height: MARKET_FRONT_WALL_Y + 20 - 340 },
  { id: 'entrance-lobby', x: 120, y: MARKET_FRONT_WALL_Y, width: 930, height: 1444 - MARKET_FRONT_WALL_Y },
  { id: 'common-door-threshold', x: 620, y: 1420, width: 180, height: 60 },
];
export const MARKET_WALLS: Rect[] = [
  { x: 26, y: 56, width: 1048, height: 24 },
  { x: 1050, y: 80, width: 24, height: 1364 },
  { x: 26, y: 80, width: 24, height: 300 },
  { x: 26, y: 380, width: 94, height: 24 },
  { x: 96, y: 404, width: 24, height: 1040 },
  { x: 120, y: 1420, width: 500, height: 24 },
  { x: 800, y: 1420, width: 250, height: 24 },
  { x: 286, y: 80, width: 24, height: 170 },
  { x: 286, y: 380, width: 24, height: MARKET_FRONT_WALL_Y - 380 },
  // The checkout divider meets the original inner frontage; the new lobby is below it.
  { x: 630, y: 780, width: 18, height: MARKET_FRONT_WALL_Y - 780 },
  { x: 310, y: MARKET_FRONT_WALL_Y, width: 100, height: 20 },
  { x: 550, y: MARKET_FRONT_WALL_Y, width: 300, height: 20 },
  { x: 1010, y: MARKET_FRONT_WALL_Y, width: 40, height: 20 },
  // Elevator doors sit directly on this backing wall, rather than in open floor space.
  { x: 50, y: 170, width: 236, height: 24 },
];
type PersonSlot = { id: string; point: Point; approach?: Point };
export const MARKET_EMPLOYEE_SLOTS: readonly PersonSlot[] = [
  { id: 'staff-west-aisle', point: { x: 500, y: 420 }, approach: { x: 556, y: 420 } },
  { id: 'staff-east-aisle', point: { x: 790, y: 420 } },
  { id: 'staff-southwest', point: { x: 535, y: 765 }, approach: { x: 591, y: 765 } },
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
  { id: 'customer-southeast', point: { x: 840, y: 990 } },
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
  { id: 'rest-set-lobby-1', kind: 'restSet', slotId: 'rest-lobby-west', rect: { x: 165, y: 1192, width: 100, height: 64 } },
  { id: 'rest-set-lobby-2', kind: 'restSet', slotId: 'rest-lobby-east', rect: { x: 330, y: 1192, width: 100, height: 64 } },
  { id: 'planter-lobby-1', kind: 'planter', slotId: 'planter-lobby-west', rect: { x: 150, y: 1320, width: 28, height: 30 } },
  // Art begins at x120, flush with the existing western wall's inner face.
  { id: 'atm-1', kind: 'atm', slotId: 'atm-west', rect: { x: 130, y: 880, width: 60, height: 70 } },
  { id: 'elevator-1', kind: 'elevator', slotId: 'elevator-west', rect: { x: 60, y: 194, width: 80, height: 50 } },
  { id: 'elevator-2', kind: 'elevator', slotId: 'elevator-east', rect: { x: 190, y: 194, width: 80, height: 50 } },
];

/** Stable slot IDs let saved candidate pools work in either plan; all coordinates are physical. */
export const MARKET_AISLE_SHELF_SLOTS: readonly MarketShelfPlacement[] = [
  { slotId: 'northwest', orientation: 'horizontal', width: 242, height: 64, x: 379, y: 196, point: { x: 500, y: 308 } },
  { slotId: 'northeast', orientation: 'horizontal', width: 242, height: 64, x: 739, y: 196, point: { x: 860, y: 308 } },
  { slotId: 'middle-west', orientation: 'horizontal', width: 242, height: 64, x: 379, y: 430, point: { x: 500, y: 542 } },
  { slotId: 'middle-center', orientation: 'horizontal', width: 242, height: 64, x: 739, y: 430, point: { x: 860, y: 542 } },
  { slotId: 'middle-east', orientation: 'horizontal', width: 242, height: 64, x: 559, y: 640, point: { x: 680, y: 752 } },
];
const AISLE_EMPLOYEE_SLOTS: readonly PersonSlot[] = MARKET_EMPLOYEE_SLOTS.map(slot => slot.id === 'staff-west-aisle'
  ? { id: slot.id, point: { x: 340, y: 350 }, approach: { x: 396, y: 350 } }
  : slot.id === 'staff-east-aisle' ? { id: slot.id, point: { x: 790, y: 350 } } : slot);
const AISLE_CUSTOMER_SLOTS: readonly PersonSlot[] = MARKET_CUSTOMER_SLOTS.map(slot => slot.id === 'customer-center-west'
  ? { id: slot.id, point: { x: 525, y: 580 } }
  : slot.id === 'customer-center-east' ? { id: slot.id, point: { x: 880, y: 590 } }
  : slot.id === 'customer-center' ? { id: slot.id, point: { x: 925, y: 720 } } : slot);

// This L-shaped branch has its own building dimensions, circulation and service wing.
// Its coordinates are authored directly; no mirrored physics or visual transforms are used.
export const MARKET_CORNER_SHELF_SLOTS: readonly MarketShelfPlacement[] = [
  { slotId: 'northwest', orientation: 'horizontal', x: 190, y: 330, width: 242, height: 64, point: { x: 311, y: 442 } },
  { slotId: 'northeast', orientation: 'horizontal', x: 550, y: 330, width: 242, height: 64, point: { x: 671, y: 442 } },
  { slotId: 'middle-west', orientation: 'vertical', x: 170, y: 555, width: 110, height: 168, point: { x: 325, y: 650 } },
  { slotId: 'middle-center', orientation: 'vertical', x: 440, y: 555, width: 110, height: 168, point: { x: 595, y: 650 } },
  { slotId: 'middle-east', orientation: 'horizontal', x: 650, y: 590, width: 242, height: 64, point: { x: 771, y: 702 } },
];
const CORNER_EMPLOYEE_SLOTS: readonly PersonSlot[] = [
  { id: 'staff-west-aisle', point: { x: 330, y: 520 }, approach: { x: 386, y: 520 } },
  { id: 'staff-east-aisle', point: { x: 730, y: 520 } },
  { id: 'staff-southwest', point: { x: 325, y: 770 } },
  { id: 'staff-southeast', point: { x: 820, y: 710 }, approach: { x: 764, y: 710 } },
  { id: 'staff-northwest', point: { x: 330, y: 270 }, approach: { x: 386, y: 270 } },
  { id: 'staff-northeast', point: { x: 855, y: 390 } },
];
const CORNER_CUSTOMER_SLOTS: readonly PersonSlot[] = [
  { id: 'customer-center-west', point: { x: 345, y: 690 } },
  { id: 'customer-center-east', point: { x: 610, y: 750 } },
  { id: 'customer-west', point: { x: 125, y: 920 } },
  { id: 'customer-east', point: { x: 1060, y: 710 } },
  { id: 'customer-southwest', point: { x: 530, y: 985 } },
  { id: 'customer-southeast', point: { x: 815, y: 990 } },
  { id: 'customer-northwest', point: { x: 480, y: 440 } },
  { id: 'customer-northeast', point: { x: 1100, y: 340 } },
  { id: 'customer-center', point: { x: 950, y: 1160 } },
];
const CORNER_PILLAR_SLOTS: readonly ObjectSlot[] = [
  { id: 'pillar-west', rect: { x: 105, y: 610, width: 30, height: 30 } },
  { id: 'pillar-east', rect: { x: 870, y: 480, width: 30, height: 30 } },
  { id: 'pillar-northwest', rect: { x: 105, y: 255, width: 30, height: 30 } },
  { id: 'pillar-northeast', rect: { x: 870, y: 255, width: 30, height: 30 } },
];
type MarketLayoutStructure = {
  world: MarketEnvironment['world']; walkableAreas: MarketEnvironment['walkableAreas']; walls: Rect[];
  fixedObjects: MarketEnvironmentObject[]; kiosk: ObjectSlot;
  checkouts: Array<Pick<MarketCheckoutPlacement, 'id' | 'rect' | 'point' | 'cashierPoint'>>;
  entrance: MarketEnvironment['entrance']; exitPoint: Point;
  alarmGates: MarketAlarmGate[]; commonDoor: MarketEnvironment['commonDoor']; spawn: Point;
};
export function getMarketLayoutStructure(layoutId: MarketLayoutId = 'classic'): MarketLayoutStructure {
  if (layoutId === 'corner') return {
    world: { width: 1280, height: 1380 },
    walkableAreas: [
      { id: 'main-sales-floor', x: 80, y: 220, width: 864, height: 840 },
      { id: 'elevator-room', x: 944, y: 80, width: 256, height: 340 },
      { id: 'east-corridor', x: 944, y: 380, width: 256, height: 684 },
      { id: 'entrance-lobby', x: 80, y: 1040, width: 1120, height: 264 },
      { id: 'common-door-threshold', x: 970, y: 1280, width: 180, height: 64 },
    ],
    walls: [
      { x: 56, y: 196, width: 864, height: 24 },
      { x: 920, y: 56, width: 304, height: 24 },
      { x: 56, y: 220, width: 24, height: 1060 },
      { x: 1200, y: 80, width: 24, height: 1200 },
      { x: 56, y: 1280, width: 914, height: 24 },
      { x: 1150, y: 1280, width: 74, height: 24 },
      { x: 920, y: 80, width: 24, height: 350 },
      { x: 920, y: 560, width: 24, height: 480 },
      { x: 580, y: 780, width: 18, height: 260 },
      { x: 80, y: 1040, width: 270, height: 20 },
      { x: 510, y: 1040, width: 140, height: 20 },
      { x: 810, y: 1040, width: 134, height: 20 },
      { x: 944, y: 170, width: 256, height: 24 },
    ],
    fixedObjects: [
      { id: 'rest-set-1', kind: 'restSet', slotId: 'rest-west-one', rect: { x: 785, y: 750, width: 100, height: 64 } },
      { id: 'rest-set-2', kind: 'restSet', slotId: 'rest-west-two', rect: { x: 785, y: 875, width: 100, height: 64 } },
      { id: 'rest-set-lobby-1', kind: 'restSet', slotId: 'rest-lobby-west', rect: { x: 150, y: 1150, width: 100, height: 64 } },
      { id: 'rest-set-lobby-2', kind: 'restSet', slotId: 'rest-lobby-east', rect: { x: 320, y: 1150, width: 100, height: 64 } },
      { id: 'planter-lobby-1', kind: 'planter', slotId: 'planter-lobby-west', rect: { x: 110, y: 1230, width: 28, height: 30 } },
      { id: 'atm-1', kind: 'atm', slotId: 'atm-west', rect: { x: 1130, y: 900, width: 60, height: 70 } },
      { id: 'elevator-1', kind: 'elevator', slotId: 'elevator-west', rect: { x: 954, y: 194, width: 80, height: 50 } },
      { id: 'elevator-2', kind: 'elevator', slotId: 'elevator-east', rect: { x: 1084, y: 194, width: 80, height: 50 } },
    ],
    kiosk: { id: 'kiosk-north', rect: { x: 420, y: 245, width: 64, height: 48 } },
    checkouts: [
      { id: 'checkout', rect: { x: 200, y: 870, width: 48, height: 117 }, point: { x: 287, y: 930 }, cashierPoint: { x: 164, y: 930 } },
      { id: 'checkout-2', rect: { x: 405, y: 870, width: 48, height: 117 }, point: { x: 492, y: 930 }, cashierPoint: { x: 369, y: 930 } },
    ],
    entrance: { point: { x: 730, y: 1050 }, gate: { x: 650, y: 1030, width: 160, height: 40 }, alarmBoundaryY: 1050, rearmY: 990 },
    exitPoint: { x: 430, y: 1050 },
    alarmGates: [
      { id: 'entrance', gate: { x: 650, y: 1030, width: 160, height: 40 }, axis: 'y', boundary: 1050, rearm: 990, outward: 1 },
      { id: 'east-door', gate: { x: 912, y: 430, width: 40, height: 130 }, axis: 'x', boundary: 932, rearm: 875, outward: 1 },
      { id: 'exit', gate: { x: 350, y: 1030, width: 160, height: 40 }, axis: 'y', boundary: 1050, rearm: 990, outward: 1 },
    ],
    commonDoor: { point: { x: 1060, y: 1290 }, gate: { x: 970, y: 1280, width: 180, height: 24 } },
    spawn: { x: 1060, y: 1210 },
  };
  return {
    world: { width: MARKET_WORLD_WIDTH, height: MARKET_WORLD_HEIGHT },
    walkableAreas: MARKET_WALKABLE_AREAS, walls: MARKET_WALLS, fixedObjects: MARKET_FIXED_OBJECTS, kiosk: MARKET_KIOSK_SLOT,
    checkouts: [
      { id: 'checkout', rect: MARKET_CHECKOUT_RECT, point: MARKET_CHECKOUT_POINT, cashierPoint: MARKET_CASHIER_POINT },
      { id: 'checkout-2', rect: MARKET_SECOND_CHECKOUT_RECT, point: MARKET_SECOND_CHECKOUT_POINT, cashierPoint: MARKET_SECOND_CASHIER_POINT },
    ],
    entrance: { point: MARKET_INTERIOR_ENTRANCE_POINT, gate: { x: 410, y: MARKET_FRONT_WALL_Y - 10, width: 140, height: 40 }, alarmBoundaryY: MARKET_FRONT_WALL_Y + 10, rearmY: MARKET_FRONT_WALL_Y - 50 },
    exitPoint: MARKET_EXIT_POINT,
    alarmGates: [
      { id: 'entrance', gate: { x: 410, y: MARKET_FRONT_WALL_Y - 10, width: 140, height: 40 }, axis: 'y', boundary: MARKET_FRONT_WALL_Y + 10, rearm: MARKET_FRONT_WALL_Y - 50, outward: 1 },
      { id: 'west-door', gate: { x: 278, y: 250, width: 40, height: 130 }, axis: 'x', boundary: 298, rearm: 355, outward: -1 },
      { id: 'exit', gate: { x: 850, y: MARKET_FRONT_WALL_Y - 10, width: 160, height: 40 }, axis: 'y', boundary: MARKET_FRONT_WALL_Y + 10, rearm: MARKET_FRONT_WALL_Y - 50, outward: 1 },
    ],
    commonDoor: { point: MARKET_COMMON_DOOR_POINT, gate: { x: 620, y: 1420, width: 180, height: 24 } },
    spawn: MARKET_PLAYER_POINT,
  };
}

export function getMarketLayoutSlots(layoutId: MarketLayoutId = 'classic') {
  if (layoutId === 'corner') return { shelves: MARKET_CORNER_SHELF_SLOTS, employees: CORNER_EMPLOYEE_SLOTS,
    customers: CORNER_CUSTOMER_SLOTS, pillars: CORNER_PILLAR_SLOTS, chairs: MARKET_CHAIR_SLOTS };
  return { shelves: layoutId === 'aisles' ? MARKET_AISLE_SHELF_SLOTS : MARKET_SHELF_SLOTS,
    employees: layoutId === 'aisles' ? AISLE_EMPLOYEE_SLOTS : MARKET_EMPLOYEE_SLOTS,
    customers: layoutId === 'aisles' ? AISLE_CUSTOMER_SLOTS : MARKET_CUSTOMER_SLOTS,
    pillars: MARKET_PILLAR_SLOTS, chairs: MARKET_CHAIR_SLOTS };
}

/** One continuous decorative elevator wall: rendering and collision share the same bounds. */
export function getMarketElevatorFacadeRect(objects: readonly MarketEnvironmentObject[], walls: readonly Rect[]): Rect | null {
  const elevators = objects.filter(object => object.kind === 'elevator');
  if (!elevators.length) return null;
  const left = Math.min(...elevators.map(object => object.rect.x));
  const right = Math.max(...elevators.map(object => object.rect.x + object.rect.width));
  const bottom = Math.max(...elevators.map(object => object.rect.y + object.rect.height));
  const backingWall = walls.find(wall => elevators.some(object => wall.y + wall.height === object.rect.y)
    && wall.x <= left && wall.x + wall.width >= right);
  return { x: backingWall?.x ?? left - 10, y: bottom - 148,
    width: backingWall?.width ?? right - left + 20, height: 148 };
}
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
    collider: getMarketPersonCollider(slot.point, kind, appearances[index]),
  }));
}

export function createMarketEnvironment(overrides: Partial<MarketEnvironmentConfig> = {}): MarketEnvironment {
  const knownKeys = ['layoutId', 'entranceConstruction', 'seed', 'employeeCount', 'customerCount', 'pillarCount', 'chairCount', 'cashierCount',
    'kioskPresent', 'kioskLane', 'shelfOrder', 'employeeSlotIds', 'customerSlotIds', 'pillarSlotIds', 'chairSlotIds'];
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) ||
    Object.keys(overrides).some((key) => !knownKeys.includes(key))) throw new Error('알 수 없는 마트 환경 변수입니다.');
  const config: MarketEnvironmentConfig = { ...DEFAULT_MARKET_ENVIRONMENT_CONFIG, ...overrides };
  if (config.layoutId === undefined) config.layoutId = 'classic';
  if (!MARKET_LAYOUT_OPTIONS.some(layout => layout.id === config.layoutId)) throw new Error('layoutId는 classic, aisles, corner 중 하나를 지정하세요.');
  if (config.entranceConstruction === undefined) config.entranceConstruction = false;
  if (typeof config.entranceConstruction !== 'boolean') throw new Error('entranceConstruction은 true 또는 false를 지정하세요.');
  const slots = getMarketLayoutSlots(config.layoutId);
  const structure = getMarketLayoutStructure(config.layoutId);
  if ((typeof config.seed !== 'string' && typeof config.seed !== 'number') ||
    String(config.seed).trim().length === 0 ||
    (typeof config.seed === 'number' && !Number.isFinite(config.seed))) throw new Error('seed를 지정하세요.');
  if (![0, 1, 2, 'random'].includes(config.cashierCount)) throw new Error('cashierCount는 0, 1, 2, random 중 하나입니다.');
  if (![true, false, 'random'].includes(config.kioskPresent)) throw new Error('kioskPresent는 true, false, random 중 하나입니다.');
  if (config.kioskLane !== undefined && !['none', 'checkout', 'checkout-2', 'random'].includes(config.kioskLane)) throw new Error('kioskLane은 none, checkout, checkout-2, random 중 하나입니다.');
  if (config.shelfOrder !== 'random') {
    const order = config.shelfOrder;
    if (!Array.isArray(order) || ![4, 5].includes(order.length) || new Set(order).size !== order.length ||
      order.some((id) => !CATEGORY_IDS.includes(id)) || (order.length === 4 && order.includes('household'))) {
      throw new Error('shelfOrder에 5개 카테고리를 각각 한 번 지정하거나 random을 사용하세요. 이전 4개 순서도 가져올 수 있습니다.');
    }
    if (order.length === 4) config.shelfOrder = [...order.slice(0, 2), 'household', ...order.slice(2)];
  }
  for (const [count, name, min, max, candidates, ids] of [
    [config.employeeCount, 'employeeCount', 1, 3, slots.employees, config.employeeSlotIds],
    [config.customerCount, 'customerCount', 1, 5, slots.customers, config.customerSlotIds],
    [config.pillarCount, 'pillarCount', 0, 4, slots.pillars, config.pillarSlotIds],
    [config.chairCount, 'chairCount', 0, 4, slots.chairs, config.chairSlotIds],
  ] as const) {
    const range = countRange(count, name, min, max);
    const pool = candidateSlots<{ id: string }>(candidates, ids, name);
    if (pool.length < range.max) throw new Error(`${name}: 최대 배치 개수보다 후보 위치가 적습니다.`);
  }
  // Legacy settings are accepted, but seating now consists of fixed paired sets in the store and common lobby.
  config.chairCount = 0;
  const random = createMarketRandom(`${config.seed}:environment:v2`);
  const order = config.shelfOrder === 'random' ? shuffle(CATEGORY_IDS, random) : config.shelfOrder!;
  const shelves = Object.fromEntries(order.map((id, index) => [id, {
    ...slots.shelves[index], point: { ...slots.shelves[index].point },
  }])) as Record<MarketCategoryId, MarketShelfPlacement>;
  const employees = makePeople('employee', chooseSlots(slots.employees, config.employeeSlotIds,
    drawCount(config.employeeCount, 'employeeCount', 1, 3, random), 'employeeSlotIds', random),
    createMarketRandom(`${config.seed}:employee-appearance:v1`));
  const customers = makePeople('customer', chooseSlots(slots.customers, config.customerSlotIds,
    drawCount(config.customerCount, 'customerCount', 1, 5, random), 'customerSlotIds', random),
    createMarketRandom(`${config.seed}:customer-appearance:v1`));
  const objects: MarketEnvironmentObject[] = [
    ...structure.fixedObjects.map(object => ({ ...object, rect: { ...object.rect } })),
    ...chooseSlots(slots.pillars, config.pillarSlotIds,
      drawCount(config.pillarCount, 'pillarCount', 0, 4, random), 'pillarSlotIds', random)
      .map((slot, index) => ({ id: `pillar-${index + 1}`, kind: 'pillar' as const, slotId: slot.id, rect: { ...slot.rect } })),
  ];
  const kioskRandom = createMarketRandom(`${config.seed}:kiosk-lane:v1`);
  const requestedLane = config.kioskLane ?? (config.kioskPresent === 'random' ? 'random' : config.kioskPresent ? 'checkout-2' : 'none');
  const kioskLane: MarketCheckoutId | 'none' = requestedLane === 'random'
    ? (kioskRandom() < 0.5 ? 'none' : kioskRandom() < 0.5 ? 'checkout' : 'checkout-2') : requestedLane;
  const staffedPool = [0, 1].filter(index => structure.checkouts[index].id !== kioskLane);
  const cashierCount = config.cashierCount === 'random' ? Math.floor(random() * (staffedPool.length + 1)) : Math.min(config.cashierCount, staffedPool.length);
  const staffedIndexes = shuffle(staffedPool, random).slice(0, cashierCount);
  // Use a separate random stream so new art never changes existing floor layouts.
  const cashierAppearances = shuffle(MARKET_EMPLOYEE_APPEARANCES.map((_, index) => index),
    createMarketRandom(`${config.seed}:cashier-appearance:v1`))
    .sort((a, b) => Number(employees.some(person => person.appearance === a)) - Number(employees.some(person => person.appearance === b)));
  const checkouts: MarketCheckoutPlacement[] = structure.checkouts.map((counter, index) => ({
    ...counter, kind: counter.id === kioskLane ? 'kiosk' : 'staffed', rect: { ...counter.rect }, point: { ...counter.point }, cashierPoint: { ...counter.cashierPoint },
    cashierCollider: getMarketPersonCollider(counter.cashierPoint, 'employee', cashierAppearances[index]),
    cashierPresent: staffedIndexes.includes(index), cashierAppearance: cashierAppearances[index],
  }));
  const kiosks: MarketKioskPlacement[] = checkouts.filter(counter => counter.kind === 'kiosk').flatMap(counter =>
    ([1, 2] as const).map((number) => {
      const rect = { x: counter.rect.x, y: counter.rect.y + (number - 1) * 77, width: counter.rect.width, height: 40 };
      return { id: `kiosk:${counter.id}:${number}` as MarketKioskId, laneId: counter.id, number, rect,
        point: { x: counter.point.x, y: rect.y + rect.height / 2 } };
    }));
  const stationDetails: MarketStationDetail[] = [
    ...CATEGORY_IDS.map((categoryId) => ({ id: categoryId, kind: 'shelf' as const, categoryId, point: shelves[categoryId].point })),
    ...checkouts.filter(checkout => checkout.kind !== 'kiosk').map(checkout => ({ id: checkout.id, kind: 'checkout' as const, point: { ...checkout.point } })),
    ...kiosks.map(kiosk => ({ id: kiosk.id, kind: 'kiosk' as const, point: { ...kiosk.point } })),
    { id: 'entrance', kind: 'entrance', point: { ...structure.entrance.point }, available: !config.entranceConstruction },
    { id: 'exit', kind: 'exit', point: { ...structure.exitPoint } },
    { id: 'common-door', kind: 'common-door', point: { ...structure.commonDoor.point } },
    ...employees.map((person) => ({ id: `staff:${person.id}` as const, kind: 'employee' as const,
      point: { ...(slots.employees.find(slot => slot.id === person.slotId)?.approach
        ?? { x: person.point.x, y: person.point.y + 56 }) } })),
  ];
  const constructionZones: MarketConstructionZone[] = config.entranceConstruction ? [{
    id: 'entrance-construction', gateId: 'entrance',
    rect: { x: structure.entrance.gate.x, y: structure.entrance.alarmBoundaryY - 25, width: structure.entrance.gate.width, height: 50 },
    detourGateIds: structure.alarmGates.filter(gate => gate.id !== 'entrance' && gate.id !== 'exit').map(gate => gate.id),
  }] : [];
  const elevatorFacade = getMarketElevatorFacadeRect(objects, structure.walls);
  // The facade replaces its contained door/backing-wall colliders, keeping the obstacle map disjoint.
  const insideFacade = (rect: Rect) => !!elevatorFacade && rect.x >= elevatorFacade.x && rect.y >= elevatorFacade.y
    && rect.x + rect.width <= elevatorFacade.x + elevatorFacade.width && rect.y + rect.height <= elevatorFacade.y + elevatorFacade.height;
  const environment: MarketEnvironment = {
    schemaVersion: 1, layoutVersion: 3, seed: String(config.seed), config: JSON.parse(JSON.stringify(config)) as MarketEnvironmentConfig,
    shelves, stationDetails, stations: Object.fromEntries(stationDetails.map(({ id, point }) => [id, point])) as MarketEnvironment['stations'],
    employees, customers, objects,
    checkout: checkouts[0], checkouts, kiosks, world: { ...structure.world },
    walkableAreas: structure.walkableAreas.map(area => ({ ...area })), walls: structure.walls.map(rect => ({ ...rect })),
    entrance: { ...structure.entrance, point: { ...structure.entrance.point }, gate: { ...structure.entrance.gate } },
    alarmGates: structure.alarmGates.map(gate => ({ ...gate, gate: { ...gate.gate } })), constructionZones,
    commonDoor: { point: { ...structure.commonDoor.point }, gate: { ...structure.commonDoor.gate } },
    obstacles: [...constructionZones.map(zone => zone.rect), ...structure.walls.filter(wall => !insideFacade(wall)), ...(elevatorFacade ? [elevatorFacade] : []), ...checkouts.filter(checkout => checkout.kind !== 'kiosk').map(checkout => checkout.rect), ...kiosks.map(kiosk => kiosk.rect), ...Object.values(shelves).flatMap(getMarketShelfUnitRects), ...employees.map((person) => person.collider),
      ...customers.map((person) => person.collider), ...objects.filter(object => object.kind !== 'elevator' || !insideFacade(object.rect)).map((object) => object.rect),
      ...checkouts.filter(checkout => checkout.cashierPresent).map(checkout => checkout.cashierCollider)].map((rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })),
    spawn: { ...structure.spawn }, exit: { ...structure.commonDoor.point },
  };
  return environment;
}

/** Exact directional crossing, independent of world axis and outward sign. */
export function crossesMarketGate(gate: MarketAlarmGate, previous: Point, next: Point, direction: 'inward' | 'outward') {
  const side = (point: Point) => { const value = (point[gate.axis] - gate.boundary) * gate.outward; return Math.abs(value) < 1e-7 ? 0 : value; };
  const before = side(previous);
  const after = side(next);
  const crossed = direction === 'inward' ? (before > 0 && after <= 0) || (before === 0 && after < 0)
    : (before < 0 && after >= 0) || (before === 0 && after > 0);
  if (!crossed || previous[gate.axis] === next[gate.axis]) return false;
  const fraction = (gate.boundary - previous[gate.axis]) / (next[gate.axis] - previous[gate.axis]);
  const other = gate.axis === 'x' ? 'y' : 'x';
  const crossing = previous[other] + (next[other] - previous[other]) * fraction;
  const start = gate.gate[other], length = gate.axis === 'x' ? gate.gate.height : gate.gate.width;
  return crossing >= start && crossing <= start + length;
}
export function getMarketWrongWayGate(environment: MarketEnvironment, previous: Point, next: Point) {
  return environment.alarmGates.find(gate => gate.id === 'exit' && crossesMarketGate(gate, previous, next, 'inward')) ?? null;
}
/** A full step into the public corridor rearms entry-direction feedback, never a threshold jitter. */
export function getMarketWrongWayRearm(gate: MarketAlarmGate) {
  return gate.boundary + gate.outward * Math.max(40, Math.abs(gate.boundary - gate.rearm));
}

export function getMarketEnvironmentObstacles(environment: MarketEnvironment, cashierCalled: boolean | Partial<MarketCashierAvailability> = false): Rect[] {
  const availability = typeof cashierCalled === 'boolean' ? { checkout: cashierCalled } : cashierCalled;
  // Older exported layout-v3 environments may predate the continuous wall collider.
  const facade = getMarketElevatorFacadeRect(environment.objects, environment.walls);
  const missingFacade = facade && !environment.obstacles.some(rect => sameRect(rect, facade)) ? [facade] : [];
  const missingConstruction = (environment.constructionZones ?? []).map(zone => zone.rect)
    .filter(rect => !environment.obstacles.some(obstacle => sameRect(rect, obstacle)));
  return [...environment.obstacles, ...missingFacade, ...missingConstruction, ...environment.checkouts.filter(checkout =>
    checkout.kind !== 'kiosk' && availability[checkout.id] && !checkout.cashierPresent).map(checkout => checkout.cashierCollider)];
}
export function isMarketEnvironmentBlocked(environment: MarketEnvironment, point: Point, cashierCalled: boolean | Partial<MarketCashierAvailability> = false) {
  const radius = MARKET_ENVIRONMENT_PLAYER_RADIUS;
  // Repeated bounded movement may land 1e-12px past an exact tangent. Preserve
  // the same geometric boundary used by swept pathfinding rather than blocking that step.
  const epsilon = 1e-7;
  const inWalkableArea = (x: number, y: number) => environment.walkableAreas.some(area =>
    x >= area.x - epsilon && x <= area.x + area.width + epsilon && y >= area.y - epsilon && y <= area.y + area.height + epsilon);
  return !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < radius || point.y < radius ||
    point.x > environment.world.width - radius || point.y > environment.world.height - radius ||
    [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]].some(([dx, dy]) => !inWalkableArea(point.x + dx, point.y + dy)) ||
    getMarketEnvironmentObstacles(environment, cashierCalled).some((rect) =>
      point.x + radius > rect.x + epsilon && point.x - radius < rect.x + rect.width - epsilon &&
      point.y + radius > rect.y + epsilon && point.y - radius < rect.y + rect.height - epsilon);
}
function closestPointOnRect(point: Point, rect: Rect): Point {
  return { x: Math.max(rect.x, Math.min(rect.x + rect.width, point.x)), y: Math.max(rect.y, Math.min(rect.y + rect.height, point.y)) };
}
function sameRect(a: Rect, b: Rect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
/** Sight line to a real surface, never through a wall, another fixture, or a person. */
function clearInteractionLine(environment: MarketEnvironment, from: Point, to: Point, ignored: Rect[], cashierCalled: boolean | Partial<MarketCashierAvailability>) {
  const blockers = getMarketEnvironmentObstacles(environment, cashierCalled).filter(rect => !ignored.some(target => sameRect(rect, target)));
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
  for (let index = 0; index <= steps; index += 1) {
    const x = from.x + (to.x - from.x) * index / steps;
    const y = from.y + (to.y - from.y) * index / steps;
    if (blockers.some(rect => x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height)) return false;
  }
  return true;
}
function stationReach(environment: MarketEnvironment, stationId: MarketEnvironmentStationId, maximum = MARKET_ENVIRONMENT_INTERACTION_DISTANCE) {
  const kind = environment.stationDetails.find(station => station.id === stationId)?.kind;
  return Math.min(maximum, kind === 'shelf' ? 64 : (kind === 'checkout' || kind === 'kiosk') ? 60 : kind === 'common-door' ? 56 : 88);
}
/** Distance to the nearest accessible ground surface; approach anchors are only navigation hints. */
export function getMarketStationDistance(environment: MarketEnvironment, stationId: MarketEnvironmentStationId, position: Point,
  cashierCalled: boolean | Partial<MarketCashierAvailability> = false): number {
  const station = environment.stationDetails.find(detail => detail.id === stationId);
  if (!station || station.available === false || isMarketEnvironmentBlocked(environment, position, cashierCalled)) return Infinity;
  if (station.kind === 'shelf' && station.categoryId) {
    const units = getMarketShelfUnitRects(environment.shelves[station.categoryId]);
    return Math.min(...units.map(rect => {
      const target = closestPointOnRect(position, rect);
      return clearInteractionLine(environment, position, target, units, cashierCalled) ? Math.hypot(position.x - target.x, position.y - target.y) : Infinity;
    }));
  }
  if (station.kind === 'checkout' || station.kind === 'kiosk') {
    const checkout = station.kind === 'kiosk' ? environment.kiosks?.find(kiosk => kiosk.id === stationId)
      : environment.checkouts.find(counter => counter.id === stationId);
    if (!checkout) return Infinity;
    const rect = checkout.rect;
    // Both lanes have staff on the left and the customer/payment aisle on the right.
    if (position.x < rect.x + rect.width + MARKET_ENVIRONMENT_PLAYER_RADIUS || position.y < rect.y - 20 || position.y > rect.y + rect.height + 20) return Infinity;
    const target = { x: rect.x + rect.width, y: Math.max(rect.y, Math.min(rect.y + rect.height, position.y)) };
    return clearInteractionLine(environment, position, target, [rect], cashierCalled) ? Math.hypot(position.x - target.x, position.y - target.y) : Infinity;
  }
  if (station.kind === 'employee') {
    const person = environment.employees.find(employee => stationId === 'staff:' + employee.id)!;
    const target = closestPointOnRect(position, person.collider);
    return clearInteractionLine(environment, position, target, [person.collider], cashierCalled) ? Math.hypot(position.x - target.x, position.y - target.y) : Infinity;
  }
  return clearInteractionLine(environment, position, station.point, [], cashierCalled) ? Math.hypot(position.x - station.point.x, position.y - station.point.y) : Infinity;
}
export function isNearMarketStation(environment: MarketEnvironment, stationId: MarketEnvironmentStationId, position: Point,
  maxDistance = MARKET_ENVIRONMENT_INTERACTION_DISTANCE, cashierCalled: boolean | Partial<MarketCashierAvailability> = false) {
  return getMarketStationDistance(environment, stationId, position, cashierCalled) <= stationReach(environment, stationId, maxDistance);
}
/** Passive inner entrance/exit markings do not compete with real actions. */
export function getNearestMarketStation(environment: MarketEnvironment, position: Point,
  cashierCalled: boolean | Partial<MarketCashierAvailability> = false): MarketStationDetail | null {
  return environment.stationDetails.filter(station => station.kind !== 'entrance' && station.kind !== 'exit')
    .map(station => ({ station, distance: getMarketStationDistance(environment, station.id, position, cashierCalled) }))
    .filter(({ station, distance }) => distance <= stationReach(environment, station.id))
    .sort((a, b) => a.distance - b.distance)[0]?.station ?? null;
}
/** Nearest free face of either shelf unit, suitable for press-to-walk pathfinding. */
export function getMarketStationApproachPoint(environment: MarketEnvironment, stationId: MarketEnvironmentStationId, position: Point,
  cashierCalled: boolean | Partial<MarketCashierAvailability> = false): Point | null {
  const station = environment.stationDetails.find(detail => detail.id === stationId);
  if (!station || station.available === false) return null;
  // Being within reach is not enough when a neighbouring fixture owns the action button.
  if (getNearestMarketStation(environment, position, cashierCalled)?.id === stationId) return { ...position };
  const candidates: Point[] = [{ ...station.point }];
  const padding = MARKET_ENVIRONMENT_PLAYER_RADIUS + 10;
  const addRectEdges = (rect: Rect, rightOnly = false) => {
    for (let y = rect.y; y <= rect.y + rect.height; y += 16) {
      candidates.push({ x: rect.x + rect.width + padding, y });
      if (!rightOnly) candidates.push({ x: rect.x - padding, y });
    }
    if (!rightOnly) for (let x = rect.x; x <= rect.x + rect.width; x += 16) {
      candidates.push({ x, y: rect.y - padding }, { x, y: rect.y + rect.height + padding });
    }
  };
  if (station.kind === 'shelf' && station.categoryId) getMarketShelfUnitRects(environment.shelves[station.categoryId]).forEach(rect => addRectEdges(rect));
  else if (station.kind === 'checkout') addRectEdges(environment.checkouts.find(counter => counter.id === stationId)!.rect, true);
  else if (station.kind === 'kiosk') { const kiosk = environment.kiosks?.find(item => item.id === stationId); if (kiosk) addRectEdges(kiosk.rect, true); }
  else if (station.kind === 'employee') addRectEdges(environment.employees.find(person => stationId === 'staff:' + person.id)!.collider);
  const reachable = candidates.filter(point => isNearMarketStation(environment, stationId, point, undefined, cashierCalled));
  // Prefer a free face where the requested person/fixture is also the selected action.
  // This keeps touch navigation and the automatic HUD target consistent in both maps.
  const unambiguous = reachable.filter(point => getNearestMarketStation(environment, point, cashierCalled)?.id === stationId);
  return (unambiguous.length ? unambiguous : reachable)
    .sort((a, b) => Math.hypot(a.x - position.x, a.y - position.y) - Math.hypot(b.x - position.x, b.y - position.y))[0] ?? null;
}
