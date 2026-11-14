export type Point = { x: number; y: number };

export type Rect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type WorldMapId = 'village' | 'market' | 'home';

export type VillageNpcId = 'minsu' | 'jiyoung' | 'sujin';

export type VillageNpcDefinition = {
  accentColor: string;
  activityLabel?: string;
  id: VillageNpcId;
  name: string;
  point: Point;
  questHint?: string;
  questId?: string;
  region: string;
  roleLabel: string;
  smallTalk: readonly string[];
};

export type VillageBuildingDefinition = Rect & {
  color: string;
  /** Estimated visible entrance height in world pixels after `contain` scaling. */
  entranceHeight: number;
  id: string;
  label: string;
  /** Estimated final dark-stroke width after the building art is scaled. */
  outlineWidth: number;
};

export type VillageDecorationKind =
  | 'bench'
  | 'bicycle'
  | 'fence'
  | 'flowerbed'
  | 'shrub'
  | 'streetlamp'
  | 'trash-bin'
  | 'tree';

export type VillageDecorationDefinition = Rect & {
  flipX?: boolean;
  id: string;
  kind: VillageDecorationKind;
  layer: 'back' | 'front';
  obstacle?: {
    height: number;
    offsetX: number;
    offsetY: number;
    width: number;
  };
  rotation?: number;
};

export type VillageRoadId = 'east' | 'main' | 'south' | 'to-coast' | 'west';

export type VillageRoadDefinition = Rect & {
  id: VillageRoadId;
};

export const VILLAGE_WORLD_WIDTH = 2200;
export const VILLAGE_WORLD_HEIGHT = 1700;
export const MARKET_WORLD_WIDTH = 1100;
export const MARKET_WORLD_HEIGHT = 1500;
export const HOME_WORLD_WIDTH = 900;
export const HOME_WORLD_HEIGHT = 1000;

export const WORLD_BOUNDS: Record<WorldMapId, { height: number; width: number }> = {
  home: { height: HOME_WORLD_HEIGHT, width: HOME_WORLD_WIDTH },
  market: { height: MARKET_WORLD_HEIGHT, width: MARKET_WORLD_WIDTH },
  village: { height: VILLAGE_WORLD_HEIGHT, width: VILLAGE_WORLD_WIDTH },
};

// Road surfaces share one globally aligned texture tile. Keeping the geometry in
// data prevents the generated texture layer from drifting away from collision and
// marking coordinates as the village layout evolves.
export const VILLAGE_ROADS: readonly VillageRoadDefinition[] = [
  { height: 1500, id: 'west', width: 175, x: 365, y: 0 },
  { height: 190, id: 'main', width: 2200, x: 0, y: 675 },
  { height: 1700, id: 'east', width: 175, x: 1715, y: 0 },
  { height: 145, id: 'south', width: 1525, x: 365, y: 1500 },
  { height: 200, id: 'to-coast', width: 175, x: 1715, y: 1500 },
];

// The first town is intentionally larger than one viewport. Buildings are laid out as
// real destinations rather than miniature menu tiles, while the coastal town can later
// be connected below this map as a separate area.
export const INITIAL_PLAYER_POINT: Point = { x: 650, y: 920 };
export const NPC_POINT: Point = { x: 800, y: 920 };
export const MARKET_ENTRANCE_POINT: Point = { x: 1265, y: 600 };
export const MARKET_RETURN_POINT: Point = { x: 1265, y: 640 };
// The cafe's right-hand doorway opens onto the pavement between the storefront
// and bank. Keep the whole approach clear, not only the final spawn point.
export const CAFE_ENTRANCE_POINT: Point = { x: 1455, y: 1168 };
export const CAFE_RETURN_POINT: Point = { x: 1420, y: 1168 };
export const LAUNDRY_ENTRANCE_POINT: Point = { x: 225, y: 1105 };
export const LAUNDRY_RETURN_POINT: Point = { x: 285, y: 1105 };
export const HOME_LAUNDRY_POINT: Point = { x: 650, y: 835 };
export const MARKET_FRONT_WALL_Y = 1020;
export const MARKET_PLAYER_POINT: Point = { x: 710, y: 1350 };
export const MARKET_INTERIOR_ENTRANCE_POINT: Point = { x: 480, y: MARKET_FRONT_WALL_Y + 10 };
export const MARKET_EXIT_POINT: Point = { x: 930, y: MARKET_FRONT_WALL_Y + 10 };
export const MARKET_COMMON_DOOR_POINT: Point = { x: 710, y: 1430 };

// The checkout footprint is shared by both the village-embedded market and its
// standalone preview. Leave a real staff aisle between the back wall and counter.
export const MARKET_CHECKOUT_SIZE_MULTIPLIER = 1.15;
export const MARKET_CHECKOUT_SCALE = 0.7 * 0.75 * MARKET_CHECKOUT_SIZE_MULTIPLIER;
// The visible counter base is about 53.3 source px after contain scaling.
// Its ground box must cover both outer edges, not only the conveyor belt.
export const MARKET_CHECKOUT_WIDTH = 54 * MARKET_CHECKOUT_SIZE_MULTIPLIER;
export const MARKET_KIOSK_WIDTH = 50 * MARKET_CHECKOUT_SIZE_MULTIPLIER;
export const MARKET_CHECKOUT_LENGTH = 117 * MARKET_CHECKOUT_SIZE_MULTIPLIER;
// Keep the front floor edge and lane centers fixed as furniture grows.
export const MARKET_CHECKOUT_FRONT_Y = 946;
export const MARKET_CHECKOUT_RECT: Rect = { x: 744 - MARKET_CHECKOUT_WIDTH / 2,
  y: MARKET_CHECKOUT_FRONT_Y - MARKET_CHECKOUT_LENGTH, width: MARKET_CHECKOUT_WIDTH, height: MARKET_CHECKOUT_LENGTH };
export const MARKET_CHECKOUT_POINT: Point = { x: 807, y: MARKET_CHECKOUT_RECT.y + 60 * MARKET_CHECKOUT_SIZE_MULTIPLIER };
export const MARKET_CASHIER_POINT: Point = { x: 684, y: MARKET_CHECKOUT_POINT.y };
export const MARKET_CASHIER_COLLIDER: Rect = {
  height: 18,
  width: 26,
  x: MARKET_CASHIER_POINT.x - 13,
  y: MARKET_CASHIER_POINT.y - 10,
};
export const MARKET_SECOND_CHECKOUT_RECT: Rect = { x: 949 - MARKET_CHECKOUT_WIDTH / 2,
  y: MARKET_CHECKOUT_FRONT_Y - MARKET_CHECKOUT_LENGTH, width: MARKET_CHECKOUT_WIDTH, height: MARKET_CHECKOUT_LENGTH };
export const MARKET_SECOND_CHECKOUT_POINT: Point = { x: 1012, y: MARKET_SECOND_CHECKOUT_RECT.y + 60 * MARKET_CHECKOUT_SIZE_MULTIPLIER };
export const MARKET_SECOND_CASHIER_POINT: Point = { x: 889, y: MARKET_SECOND_CHECKOUT_POINT.y };

export const HOUSE_ENTRANCE_POINT: Point = { x: 2073, y: 1200 };
export const HOUSE_RETURN_POINT: Point = { x: 2073, y: 1200 };
export const HOME_PLAYER_POINT: Point = { x: 450, y: 840 };
export const HOME_EXIT_POINT: Point = { x: 450, y: 930 };
export const HOME_FRIDGE_POINT: Point = { x: 170, y: 305 };

// Pedestrian waiting points, set back from the carriageway. Shelter art stands behind them.
export const MARKET_BUS_STOP_POINT: Point = { x: 1010, y: 638 };
export const BUS_STOP_POINT: Point = { x: 2060, y: 644 };

export const VILLAGE_PORTAL_INTERACTION_DISTANCE = 92;
export const HOME_STATION_INTERACTION_DISTANCE = 100;
export const VILLAGE_NPC_INTERACTION_DISTANCE = 116;
export const VILLAGE_NPC_EXIT_DISTANCE = 137;

// The original illustrations use different source resolutions, dark-line colors,
// and stroke widths. Values below are measured after `contain` scaling. Outliers
// are resized toward a 1.5px visual stroke while keeping entrances about 75px or
// taller against the roughly 89px-tall player.
export const VILLAGE_BUILDINGS: readonly VillageBuildingDefinition[] = [
  {
    color: '#C7B38F',
    entranceHeight: 75,
    height: 228,
    id: 'school',
    label: '학교',
    outlineWidth: 1.67,
    width: 451,
    x: 630,
    y: 224,
  },
  {
    color: '#98AC99',
    entranceHeight: 91,
    height: 260,
    id: 'market',
    label: '하늘마트',
    outlineWidth: 1.52,
    width: 388,
    x: 1089,
    y: 275,
  },
  {
    color: '#D2AE8F',
    entranceHeight: 84,
    height: 161,
    id: 'restaurant',
    label: '식당',
    outlineWidth: 1.46,
    width: 260,
    x: 1100,
    y: 65,
  },
  {
    color: '#94A8A7',
    entranceHeight: 106,
    height: 266,
    id: 'subway',
    label: '지하철역',
    outlineWidth: 1.48,
    width: 150,
    x: 1975,
    y: 265,
  },
  {
    color: '#A8B79E',
    entranceHeight: 75,
    height: 156,
    id: 'community',
    label: '주민센터',
    outlineWidth: 1.5,
    width: 266,
    x: 1363,
    y: 114,
  },
  {
    color: '#BDA28A',
    entranceHeight: 75,
    height: 203,
    id: 'minsu-home',
    label: '민수네',
    outlineWidth: 1.56,
    width: 209,
    x: 1975,
    y: 25,
  },
  {
    color: '#C99C78',
    entranceHeight: 75,
    height: 226,
    id: 'player-home',
    label: '우리 집',
    outlineWidth: 1.59,
    width: 234,
    x: 1966,
    y: 945,
  },
  {
    color: '#8EA891',
    entranceHeight: 83,
    height: 140,
    id: 'convenience',
    label: '편의점',
    outlineWidth: 1.07,
    width: 235,
    x: 1965,
    y: 1260,
  },
  {
    color: '#B795A5',
    entranceHeight: 87,
    height: 166,
    id: 'karaoke',
    label: '노래방',
    outlineWidth: 1.4,
    width: 261,
    x: 630,
    y: 950,
  },
  {
    color: '#D1A77D',
    entranceHeight: 84,
    height: 203,
    id: 'burger',
    label: '햄버거 가게',
    outlineWidth: 1.63,
    width: 305,
    x: 908,
    y: 951,
  },
  {
    color: '#8FA6B2',
    entranceHeight: 75,
    height: 241,
    id: 'pc-room',
    label: 'PC방',
    outlineWidth: 1.57,
    width: 314,
    x: 861,
    y: 1176,
  },
  {
    color: '#C8A588',
    entranceHeight: 91,
    height: 186,
    id: 'cafe',
    label: '카페',
    outlineWidth: 1.36,
    width: 240,
    x: 1290,
    y: 951,
  },
  {
    color: '#9AAEAA',
    entranceHeight: 91,
    height: 217,
    id: 'bank',
    label: '은행',
    outlineWidth: 1.62,
    width: 392,
    x: 1232,
    y: 1200,
  },
  {
    color: '#C2AD8E',
    entranceHeight: 91,
    height: 163,
    id: 'laundry',
    label: '동네 빨래방',
    outlineWidth: 1.38,
    width: 230,
    x: 45,
    y: 920,
  },
  {
    color: '#91A6A0',
    entranceHeight: 79,
    height: 213,
    id: 'library',
    label: '마을회관',
    outlineWidth: 1.52,
    width: 283,
    x: 0,
    y: 1130,
  },
];

function villageProp(id: string, kind: VillageDecorationKind, x: number, y: number,
  width: number, height: number, solid = false, flipX = false): VillageDecorationDefinition {
  const footprintWidth = kind === 'tree' ? width * 0.24 : kind === 'streetlamp' ? 8 : width * 0.82;
  const footprintHeight = kind === 'tree' ? 10 : Math.min(12, height * 0.25);
  return { id, kind, x, y, width, height, flipX, layer: kind === 'tree' || kind === 'shrub' ? 'back' : 'front',
    ...(solid ? { obstacle: { width: footprintWidth, height: footprintHeight,
      offsetX: (width - footprintWidth) / 2, offsetY: height - footprintHeight } } : {}) };
}

// All art is bottom-aligned. Only its grounded base blocks walking; canopies never do.
export const VILLAGE_DECORATIONS: readonly VillageDecorationDefinition[] = [
  villageProp('park-tree-west', 'tree', 32, 104, 148, 165, true),
  villageProp('park-tree-east', 'tree', 213, 280, 112, 125, true, true),
  villageProp('park-tree-north', 'tree', 213, 42, 104, 116, true),
  villageProp('park-shrub-west', 'shrub', 26, 356, 94, 30, true),
  villageProp('park-shrub-east', 'shrub', 204, 503, 88, 28, true),
  villageProp('park-shrub-north', 'shrub', 36, 42, 102, 33),
  villageProp('park-bench', 'bench', 93, 432, 112, 47, true),
  villageProp('park-flowerbed', 'flowerbed', 85, 568, 156, 27, true),
  villageProp('park-flowerbed-small', 'flowerbed', 32, 294, 104, 18, true),
  villageProp('school-fence-one', 'fence', 640, 165, 90, 45),
  villageProp('school-fence-two', 'fence', 734, 165, 90, 45),
  villageProp('school-fence-three', 'fence', 828, 165, 90, 45),
  villageProp('school-flowerbed-west', 'flowerbed', 627, 530, 118, 20, true),
  villageProp('school-flowerbed-east', 'flowerbed', 870, 516, 130, 22, true),
  villageProp('school-bench', 'bench', 740, 510, 112, 47, true),
  villageProp('school-bicycle', 'bicycle', 774, 572, 72, 46),
  villageProp('market-shrub-west', 'shrub', 1103, 557, 100, 32, true),
  villageProp('market-shrub-east', 'shrub', 1303, 548, 94, 30, true),
  villageProp('market-trash', 'trash-bin', 1328, 605, 29, 33),
  villageProp('civic-tree', 'tree', 1515, 301, 128, 143, true),
  villageProp('civic-bench', 'bench', 1514, 478, 108, 46, true),
  villageProp('civic-shrub', 'shrub', 1566, 546, 66, 21, true),
  villageProp('civic-flowerbed', 'flowerbed', 1483, 561, 120, 21, true),
  villageProp('minsu-shrub', 'shrub', 2142, 310, 57, 18),
  villageProp('station-flowerbed', 'flowerbed', 2125, 553, 68, 12, true),
  villageProp('library-tree', 'tree', 214, 1361, 106, 118, true),
  villageProp('library-shrub', 'shrub', 36, 1090, 98, 31, true),
  villageProp('library-bench', 'bench', 42, 1390, 104, 44, true),
  villageProp('library-flowerbed', 'flowerbed', 25, 1501, 152, 26, true),
  villageProp('shops-flowerbed-west', 'flowerbed', 620, 1390, 132, 23, true),
  villageProp('shops-tree-west', 'tree', 599, 1221, 110, 123, true),
  villageProp('shops-bench-west', 'bench', 711, 1370, 100, 42, true),
  villageProp('cafe-bench', 'bench', 1540, 1138, 102, 43, true),
  villageProp('cafe-bicycle', 'bicycle', 1560, 1194, 72, 46),
  villageProp('bank-flowerbed', 'flowerbed', 1340, 1398, 136, 23, true),
  villageProp('home-shrub-west', 'shrub', 1968, 1170, 77, 25, true),
  villageProp('home-shrub-east', 'shrub', 2120, 1170, 77, 25, true),
  villageProp('home-flowerbed', 'flowerbed', 2010, 1470, 150, 26, true),
  villageProp('convenience-trash', 'trash-bin', 2158, 1420, 29, 33),
  villageProp('lamp-west-north', 'streetlamp', 635, 489, 27, 96, true),
  villageProp('lamp-market-north', 'streetlamp', 1363, 489, 27, 96, true),
  villageProp('lamp-civic-north', 'streetlamp', 1605, 489, 27, 96, true),
  villageProp('lamp-west-south', 'streetlamp', 628, 1045, 27, 96, true),
  villageProp('lamp-east-south', 'streetlamp', 1611, 941, 27, 96, true),
  villageProp('lamp-library', 'streetlamp', 263, 1420, 27, 96, true),
];
const villageBuildingObstacles: readonly Rect[] = VILLAGE_BUILDINGS.map(
  ({ height, width, x, y }) => ({ height, width, x, y }),
);

export const villageDecorationObstacles: readonly Rect[] = VILLAGE_DECORATIONS.flatMap(
  ({ obstacle, x, y }) =>
    obstacle
      ? [
          {
            height: obstacle.height,
            width: obstacle.width,
            x: x + obstacle.offsetX,
            y: y + obstacle.offsetY,
          },
        ]
      : [],
);

export const villageObstacles: readonly Rect[] = [
  ...villageBuildingObstacles,
  ...villageDecorationObstacles,
];

export const homeObstacles: readonly Rect[] = [
  { height: 25, width: 100, x: 690, y: 845 },
  { height: 170, width: 150, x: 95, y: 90 },
  { height: 105, width: 530, x: 270, y: 90 },
  { height: 125, width: 250, x: 300, y: 330 },
  { height: 165, width: 170, x: 90, y: 550 },
  { height: 105, width: 220, x: 560, y: 570 },
  { height: 55, width: 150, x: 610, y: 390 },
];

export const VILLAGE_NPCS: readonly VillageNpcDefinition[] = [
  {
    accentColor: '#7D8FA6',
    id: 'minsu',
    name: '민수',
    point: NPC_POINT,
    questHint: '횡단보도를 안전하게 건너는 연습을 함께 해요.',
    questId: 'minsu-safety',
    region: '마을 중앙',
    roleLabel: '친구',
    smallTalk: ['오늘도 만나서 반가워!', '천천히 마을을 한 바퀴 걸어볼까?'],
  },
  {
    accentColor: '#78A386',
    activityLabel: '계산 알바',
    id: 'jiyoung',
    name: '지영',
    point: { x: 1390, y: 610 },
    questHint: '장보기 목록에 적힌 물건을 찾아봐요.',
    questId: 'market-shopping',
    region: '하늘마트 앞',
    roleLabel: '마트 점원',
    smallTalk: ['오늘은 과일이 아주 싱싱해요.', '필요한 물건을 못 찾으면 언제든 물어봐요.'],
  },
  {
    accentColor: '#B58C93',
    id: 'sujin',
    name: '수진',
    point: { x: 1590, y: 905 },
    region: '주민센터 앞길',
    roleLabel: '마을 주민',
    smallTalk: ['공원에 바람이 시원하게 불어요.', '오늘 마을 구경은 재미있어?'],
  },
];

export const VILLAGE_NPC_BY_ID = Object.fromEntries(
  VILLAGE_NPCS.map((npc) => [npc.id, npc]),
) as Record<VillageNpcId, VillageNpcDefinition>;

export const WORLD_OBSTACLES: Record<Exclude<WorldMapId, 'market'>, readonly Rect[]> = {
  home: homeObstacles,
  village: villageObstacles,
};
