export type Point = { x: number; y: number };

export type Rect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type WorldMapId = 'village' | 'market' | 'home';

export type VillageNpcId = 'minsu' | 'driver' | 'jiyoung' | 'sujin';

export type VillageNpcDefinition = {
  accentColor: string;
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
export const MARKET_WORLD_WIDTH = 900;
export const MARKET_WORLD_HEIGHT = 1000;
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
  { height: 1405, id: 'west', width: 175, x: 365, y: 0 },
  { height: 190, id: 'main', width: 2200, x: 0, y: 675 },
  { height: 1700, id: 'east', width: 175, x: 1715, y: 0 },
  { height: 160, id: 'south', width: 1525, x: 365, y: 1405 },
  { height: 295, id: 'to-coast', width: 175, x: 1715, y: 1405 },
];

// The first town is intentionally larger than one viewport. Buildings are laid out as
// real destinations rather than miniature menu tiles, while the coastal town can later
// be connected below this map as a separate area.
export const INITIAL_PLAYER_POINT: Point = { x: 650, y: 920 };
export const NPC_POINT: Point = { x: 800, y: 920 };
export const MARKET_ENTRANCE_POINT: Point = { x: 1265, y: 600 };
export const MARKET_RETURN_POINT: Point = { x: 1265, y: 640 };
export const MARKET_PLAYER_POINT: Point = { x: 450, y: 820 };
export const MARKET_EXIT_POINT: Point = { x: 450, y: 950 };

export const HOUSE_ENTRANCE_POINT: Point = { x: 2050, y: 1210 };
export const HOUSE_RETURN_POINT: Point = { x: 1890, y: 1210 };
export const HOME_PLAYER_POINT: Point = { x: 450, y: 840 };
export const HOME_EXIT_POINT: Point = { x: 450, y: 930 };
export const HOME_FRIDGE_POINT: Point = { x: 170, y: 305 };

export const MARKET_BUS_STOP_POINT: Point = { x: 1005, y: 770 };
export const BUS_STOP_POINT: Point = { x: 1805, y: 770 };

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
    x: 576,
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
    x: 1067,
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
    x: 1455,
    y: 449,
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
    y: 400,
  },
  {
    color: '#A8B79E',
    entranceHeight: 75,
    height: 156,
    id: 'community',
    label: '주민센터',
    outlineWidth: 1.5,
    width: 266,
    x: 1415,
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
    x: 1941,
    y: 97,
  },
  {
    color: '#C99C78',
    entranceHeight: 75,
    height: 238,
    id: 'player-home',
    label: '우리 집',
    outlineWidth: 1.59,
    width: 246,
    x: 1930,
    y: 917,
  },
  {
    color: '#8EA891',
    entranceHeight: 93,
    height: 157,
    id: 'convenience',
    label: '편의점',
    outlineWidth: 1.07,
    width: 270,
    x: 1918,
    y: 1233,
  },
  {
    color: '#B795A5',
    entranceHeight: 87,
    height: 166,
    id: 'karaoke',
    label: '노래방',
    outlineWidth: 1.4,
    width: 261,
    x: 562,
    y: 999,
  },
  {
    color: '#D1A77D',
    entranceHeight: 84,
    height: 203,
    id: 'burger',
    label: '햄버거 가게',
    outlineWidth: 1.63,
    width: 305,
    x: 845,
    y: 907,
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
    y: 1149,
  },
  {
    color: '#C8A588',
    entranceHeight: 91,
    height: 186,
    id: 'cafe',
    label: '카페',
    outlineWidth: 1.36,
    width: 240,
    x: 1210,
    y: 924,
  },
  {
    color: '#9AAEAA',
    entranceHeight: 91,
    height: 217,
    id: 'bank',
    label: '은행',
    outlineWidth: 1.62,
    width: 392,
    x: 1190,
    y: 1123,
  },
  {
    color: '#C2AD8E',
    entranceHeight: 91,
    height: 163,
    id: 'estate',
    label: '부동산',
    outlineWidth: 1.38,
    width: 230,
    x: 1467,
    y: 940,
  },
  {
    color: '#91A6A0',
    entranceHeight: 84,
    height: 227,
    id: 'library',
    label: '도서관',
    outlineWidth: 1.62,
    width: 301,
    x: 37,
    y: 1038,
  },
];

export const VILLAGE_DECORATIONS: readonly VillageDecorationDefinition[] = [
  // 서북쪽 공원
  {
    height: 165,
    id: 'park-tree-west',
    kind: 'tree',
    layer: 'back',
    obstacle: { height: 24, offsetX: 61, offsetY: 137, width: 28 },
    width: 150,
    x: 18,
    y: 130,
  },
  {
    flipX: true,
    height: 138,
    id: 'park-tree-east',
    kind: 'tree',
    layer: 'back',
    obstacle: { height: 20, offsetX: 52, offsetY: 115, width: 24 },
    width: 128,
    x: 202,
    y: 255,
  },
  { height: 62, id: 'park-shrub-southwest', kind: 'shrub', layer: 'back', width: 104, x: 24, y: 470 },
  { flipX: true, height: 66, id: 'park-shrub-southeast', kind: 'shrub', layer: 'back', width: 112, x: 205, y: 468 },
  {
    height: 78,
    id: 'park-bench',
    kind: 'bench',
    layer: 'front',
    obstacle: { height: 20, offsetX: 12, offsetY: 53, width: 88 },
    width: 112,
    x: 92,
    y: 400,
  },
  { height: 68, id: 'park-flowerbed', kind: 'flowerbed', layer: 'front', width: 126, x: 94, y: 540 },

  // 학교 운동장과 마트 진입광장
  { height: 46, id: 'school-fence-one', kind: 'fence', layer: 'back', width: 92, x: 600, y: 165 },
  { height: 46, id: 'school-fence-two', kind: 'fence', layer: 'back', width: 92, x: 696, y: 165 },
  { height: 46, id: 'school-fence-three', kind: 'fence', layer: 'back', width: 92, x: 792, y: 165 },
  { height: 46, id: 'school-fence-four', kind: 'fence', layer: 'back', width: 92, x: 888, y: 165 },
  { height: 64, id: 'school-flowerbed-west', kind: 'flowerbed', layer: 'front', width: 116, x: 600, y: 545 },
  { flipX: true, height: 64, id: 'school-flowerbed-east', kind: 'flowerbed', layer: 'front', width: 116, x: 842, y: 545 },
  { height: 65, id: 'school-bicycle', kind: 'bicycle', layer: 'front', width: 102, x: 724, y: 555 },
  { height: 56, id: 'market-shrub-west', kind: 'shrub', layer: 'back', width: 94, x: 1020, y: 555 },
  { flipX: true, height: 56, id: 'market-shrub-east', kind: 'shrub', layer: 'back', width: 94, x: 1340, y: 555 },
  { height: 44, id: 'market-trash', kind: 'trash-bin', layer: 'front', width: 44, x: 1374, y: 582 },

  // 주민센터 사이 작은 정원
  {
    height: 128,
    id: 'civic-tree',
    kind: 'tree',
    layer: 'back',
    obstacle: { height: 18, offsetX: 46, offsetY: 107, width: 24 },
    width: 116,
    x: 1460,
    y: 285,
  },
  { height: 62, id: 'civic-bench', kind: 'bench', layer: 'front', width: 96, x: 1585, y: 330 },
  { flipX: true, height: 58, id: 'civic-shrub', kind: 'shrub', layer: 'back', width: 98, x: 1600, y: 275 },
  { height: 58, id: 'civic-flowerbed', kind: 'flowerbed', layer: 'front', width: 108, x: 1570, y: 390 },

  // 동쪽 주거지
  { height: 45, id: 'minsu-fence-one', kind: 'fence', layer: 'back', width: 90, x: 1925, y: 308 },
  { height: 45, id: 'minsu-fence-two', kind: 'fence', layer: 'back', width: 90, x: 2020, y: 308 },
  { flipX: true, height: 105, id: 'minsu-tree', kind: 'tree', layer: 'back', width: 95, x: 2084, y: 292 },
  { height: 52, id: 'minsu-shrub', kind: 'shrub', layer: 'back', width: 88, x: 1925, y: 345 },

  // 서남 문화공간과 남쪽 상점가
  {
    height: 125,
    id: 'library-tree',
    kind: 'tree',
    layer: 'back',
    obstacle: { height: 18, offsetX: 46, offsetY: 104, width: 24 },
    width: 114,
    x: 220,
    y: 925,
  },
  { height: 58, id: 'library-shrub', kind: 'shrub', layer: 'back', width: 98, x: 28, y: 960 },
  { height: 65, id: 'library-bench', kind: 'bench', layer: 'front', width: 102, x: 44, y: 1282 },
  { height: 61, id: 'library-bicycle', kind: 'bicycle', layer: 'front', width: 98, x: 220, y: 1288 },
  { height: 48, id: 'karaoke-trash', kind: 'trash-bin', layer: 'front', width: 48, x: 816, y: 1190 },
  { height: 60, id: 'shops-flowerbed-west', kind: 'flowerbed', layer: 'front', width: 112, x: 585, y: 1288 },
  { flipX: true, height: 60, id: 'shops-flowerbed-center', kind: 'flowerbed', layer: 'front', width: 112, x: 1010, y: 1288 },
  { height: 64, id: 'cafe-bench', kind: 'bench', layer: 'front', width: 102, x: 1575, y: 1092 },
  { flipX: true, height: 62, id: 'cafe-bicycle', kind: 'bicycle', layer: 'front', width: 100, x: 1562, y: 1125 },
  { height: 56, id: 'bank-flowerbed', kind: 'flowerbed', layer: 'front', width: 104, x: 1220, y: 1137 },
  { flipX: true, height: 56, id: 'estate-flowerbed', kind: 'flowerbed', layer: 'front', width: 104, x: 1544, y: 1137 },

  // 우리 집과 편의점 주변
  { height: 54, id: 'home-shrub-west', kind: 'shrub', layer: 'back', width: 92, x: 1928, y: 1160 },
  { flipX: true, height: 54, id: 'home-shrub-east', kind: 'shrub', layer: 'back', width: 92, x: 2092, y: 1160 },
  { height: 44, id: 'home-fence-one', kind: 'fence', layer: 'back', width: 88, x: 1925, y: 1450 },
  { height: 44, id: 'home-fence-two', kind: 'fence', layer: 'back', width: 88, x: 2018, y: 1450 },
  { height: 44, id: 'home-fence-three', kind: 'fence', layer: 'back', width: 88, x: 2111, y: 1450 },
  { height: 46, id: 'convenience-trash', kind: 'trash-bin', layer: 'front', width: 46, x: 2118, y: 1360 },

  // 주요 보행로를 잇는 가로등
  { height: 112, id: 'lamp-west-north', kind: 'streetlamp', layer: 'front', width: 48, x: 536, y: 548 },
  { height: 106, id: 'lamp-market-north', kind: 'streetlamp', layer: 'front', width: 45, x: 974, y: 553 },
  { height: 104, id: 'lamp-civic-north', kind: 'streetlamp', layer: 'front', width: 44, x: 1670, y: 606 },
  { height: 112, id: 'lamp-west-south', kind: 'streetlamp', layer: 'front', width: 48, x: 536, y: 858 },
  { height: 106, id: 'lamp-market-south', kind: 'streetlamp', layer: 'front', width: 45, x: 1112, y: 872 },
  { height: 108, id: 'lamp-east-south', kind: 'streetlamp', layer: 'front', width: 46, x: 1662, y: 858 },
  { height: 105, id: 'lamp-library', kind: 'streetlamp', layer: 'front', width: 44, x: 298, y: 1250 },
  { height: 108, id: 'lamp-residential', kind: 'streetlamp', layer: 'front', width: 46, x: 2120, y: 790 },
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
    accentColor: '#5D7F94',
    id: 'driver',
    name: '기사님',
    point: { x: 1990, y: 770 },
    questHint: '목적지까지 가는 버스를 함께 찾아봐요.',
    questId: 'bus-route',
    region: '동쪽 버스정류장',
    roleLabel: '버스 기사',
    smallTalk: ['오늘은 길이 한산하네요.', '버스를 타기 전에는 번호를 먼저 확인해요.'],
  },
  {
    accentColor: '#78A386',
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
