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
  id: string;
  label: string;
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

// The first town is intentionally larger than one viewport. Buildings are laid out as
// real destinations rather than miniature menu tiles, while the coastal town can later
// be connected below this map as a separate area.
export const INITIAL_PLAYER_POINT: Point = { x: 600, y: 900 };
export const NPC_POINT: Point = { x: 760, y: 900 };
export const MARKET_ENTRANCE_POINT: Point = { x: 1215, y: 525 };
export const MARKET_RETURN_POINT: Point = { x: 1215, y: 585 };
export const MARKET_PLAYER_POINT: Point = { x: 450, y: 820 };
export const MARKET_EXIT_POINT: Point = { x: 450, y: 950 };

export const HOUSE_ENTRANCE_POINT: Point = { x: 2025, y: 1195 };
export const HOUSE_RETURN_POINT: Point = { x: 1870, y: 1195 };
export const HOME_PLAYER_POINT: Point = { x: 450, y: 840 };
export const HOME_EXIT_POINT: Point = { x: 450, y: 930 };
export const HOME_FRIDGE_POINT: Point = { x: 170, y: 305 };

export const MARKET_BUS_STOP_POINT: Point = { x: 990, y: 730 };
export const BUS_STOP_POINT: Point = { x: 1805, y: 730 };

export const VILLAGE_PORTAL_INTERACTION_DISTANCE = 92;
export const HOME_STATION_INTERACTION_DISTANCE = 100;
export const VILLAGE_NPC_INTERACTION_DISTANCE = 116;
export const VILLAGE_NPC_EXIT_DISTANCE = 137;

export const VILLAGE_BUILDINGS: readonly VillageBuildingDefinition[] = [
  { color: '#C7B38F', height: 450, id: 'school', label: '학교', width: 360, x: 570, y: 100 },
  {
    color: '#98AC99',
    height: 350,
    id: 'market',
    label: '하늘마트',
    width: 450,
    x: 990,
    y: 120,
  },
  {
    color: '#D2AE8F',
    height: 170,
    id: 'restaurant',
    label: '식당',
    width: 210,
    x: 1480,
    y: 80,
  },
  {
    color: '#94A8A7',
    height: 230,
    id: 'subway',
    label: '지하철역',
    width: 230,
    x: 1920,
    y: 330,
  },
  {
    color: '#A8B79E',
    height: 190,
    id: 'community',
    label: '주민센터',
    width: 210,
    x: 1480,
    y: 300,
  },
  {
    color: '#BDA28A',
    height: 190,
    id: 'minsu-home',
    label: '민수네',
    width: 210,
    x: 1930,
    y: 80,
  },
  {
    color: '#C99C78',
    height: 250,
    id: 'player-home',
    label: '우리 집',
    width: 250,
    x: 1900,
    y: 900,
  },
  {
    color: '#8EA891',
    height: 140,
    id: 'convenience',
    label: '편의점',
    width: 230,
    x: 1910,
    y: 1230,
  },
  {
    color: '#B795A5',
    height: 300,
    id: 'karaoke',
    label: '노래방',
    width: 300,
    x: 570,
    y: 930,
  },
  {
    color: '#D1A77D',
    height: 140,
    id: 'burger',
    label: '햄버거 가게',
    width: 210,
    x: 900,
    y: 930,
  },
  {
    color: '#8FA6B2',
    height: 150,
    id: 'pc-room',
    label: 'PC방',
    width: 210,
    x: 900,
    y: 1110,
  },
  {
    color: '#C8A588',
    height: 250,
    id: 'cafe',
    label: '카페',
    width: 330,
    x: 1350,
    y: 930,
  },
  {
    color: '#9AAEAA',
    height: 155,
    id: 'bank',
    label: '은행',
    width: 150,
    x: 1350,
    y: 1210,
  },
  {
    color: '#C2AD8E',
    height: 155,
    id: 'estate',
    label: '부동산',
    width: 150,
    x: 1530,
    y: 1210,
  },
  {
    color: '#91A6A0',
    height: 390,
    id: 'library',
    label: '도서관',
    width: 260,
    x: 55,
    y: 930,
  },
];

export const villageObstacles: readonly Rect[] = VILLAGE_BUILDINGS.map(
  ({ height, width, x, y }) => ({ height, width, x, y }),
);

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
    point: { x: 1950, y: 730 },
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
    point: { x: 1400, y: 550 },
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
    point: { x: 1585, y: 690 },
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
