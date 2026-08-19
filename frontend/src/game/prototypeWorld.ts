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

export const VILLAGE_WORLD_WIDTH = 1500;
export const VILLAGE_WORLD_HEIGHT = 1200;
export const MARKET_WORLD_WIDTH = 900;
export const MARKET_WORLD_HEIGHT = 1000;
export const HOME_WORLD_WIDTH = 900;
export const HOME_WORLD_HEIGHT = 1000;

export const WORLD_BOUNDS: Record<WorldMapId, { height: number; width: number }> = {
  home: { height: HOME_WORLD_HEIGHT, width: HOME_WORLD_WIDTH },
  market: { height: MARKET_WORLD_HEIGHT, width: MARKET_WORLD_WIDTH },
  village: { height: VILLAGE_WORLD_HEIGHT, width: VILLAGE_WORLD_WIDTH },
};

// Existing coordinates are intentionally preserved so the current movement and market
// scenario tests can keep using the same accessibility-step paths.
export const INITIAL_PLAYER_POINT: Point = { x: 480, y: 700 };
export const NPC_POINT: Point = { x: 610, y: 520 };
export const MARKET_ENTRANCE_POINT: Point = { x: 775, y: 346 };
export const MARKET_RETURN_POINT: Point = { x: 775, y: 404 };
export const MARKET_PLAYER_POINT: Point = { x: 450, y: 820 };
export const MARKET_EXIT_POINT: Point = { x: 450, y: 950 };

export const HOUSE_ENTRANCE_POINT: Point = { x: 231, y: 346 };
export const HOUSE_RETURN_POINT: Point = { x: 231, y: 392 };
export const HOME_PLAYER_POINT: Point = { x: 450, y: 840 };
export const HOME_EXIT_POINT: Point = { x: 450, y: 930 };
export const HOME_FRIDGE_POINT: Point = { x: 170, y: 305 };

export const VILLAGE_PORTAL_INTERACTION_DISTANCE = 92;
export const HOME_STATION_INTERACTION_DISTANCE = 100;
export const VILLAGE_NPC_INTERACTION_DISTANCE = 116;
export const VILLAGE_NPC_EXIT_DISTANCE = 137;

const originalVillageObstacles: readonly Rect[] = [
  { height: 184, width: 238, x: 112, y: 116 },
  { height: 190, width: 230, x: 660, y: 122 },
  { height: 105, width: 150, x: 406, y: 330 },
  { height: 110, width: 184, x: 120, y: 548 },
];

export const villageExpansionObstacles: readonly Rect[] = [
  { height: 170, width: 290, x: 1030, y: 180 },
  { height: 160, width: 240, x: 650, y: 800 },
  { height: 180, width: 280, x: 1080, y: 720 },
  { height: 90, width: 160, x: 900, y: 555 },
  { height: 100, width: 220, x: 350, y: 910 },
];

export const villageObstacles: readonly Rect[] = [
  ...originalVillageObstacles,
  ...villageExpansionObstacles,
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
    point: { x: 1120, y: 410 },
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
    point: { x: 940, y: 370 },
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
    point: { x: 980, y: 820 },
    region: '주민센터 산책길',
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
