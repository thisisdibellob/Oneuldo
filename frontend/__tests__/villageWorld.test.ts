import {
  BUS_STOP_POINT,
  HOUSE_ENTRANCE_POINT,
  HOUSE_RETURN_POINT,
  INITIAL_PLAYER_POINT,
  MARKET_BUS_STOP_POINT,
  MARKET_ENTRANCE_POINT,
  MARKET_RETURN_POINT,
  VILLAGE_BUILDINGS,
  VILLAGE_NPCS,
  VILLAGE_WORLD_HEIGHT,
  VILLAGE_WORLD_WIDTH,
  type Point,
  type Rect,
} from '../src/game/prototypeWorld';

const PLAYER_RADIUS = 22;

function overlapsExpandedRect(point: Point, rect: Rect) {
  return (
    point.x + PLAYER_RADIUS > rect.x &&
    point.x - PLAYER_RADIUS < rect.x + rect.width &&
    point.y + PLAYER_RADIUS > rect.y &&
    point.y - PLAYER_RADIUS < rect.y + rect.height
  );
}

describe('확장 마을 배치', () => {
  it('건물이 월드 안에 있고 작은 메뉴 타일 크기로 돌아가지 않는다', () => {
    expect(VILLAGE_WORLD_WIDTH).toBeGreaterThanOrEqual(2200);
    expect(VILLAGE_WORLD_HEIGHT).toBeGreaterThanOrEqual(1700);

    VILLAGE_BUILDINGS.forEach((building) => {
      expect(building.x).toBeGreaterThanOrEqual(0);
      expect(building.y).toBeGreaterThanOrEqual(0);
      expect(building.x + building.width).toBeLessThanOrEqual(VILLAGE_WORLD_WIDTH);
      expect(building.y + building.height).toBeLessThanOrEqual(VILLAGE_WORLD_HEIGHT);
      expect(building.width).toBeGreaterThanOrEqual(150);
      expect(building.height).toBeGreaterThanOrEqual(140);
    });
  });

  it('스폰·NPC·출입구·정류장 좌표가 건물 충돌 영역 밖에 있다', () => {
    const interactionPoints = [
      INITIAL_PLAYER_POINT,
      MARKET_ENTRANCE_POINT,
      MARKET_RETURN_POINT,
      HOUSE_ENTRANCE_POINT,
      HOUSE_RETURN_POINT,
      MARKET_BUS_STOP_POINT,
      BUS_STOP_POINT,
      ...VILLAGE_NPCS.map((npc) => npc.point),
    ];

    interactionPoints.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
      expect(point.y).toBeGreaterThanOrEqual(PLAYER_RADIUS);
      expect(point.x).toBeLessThanOrEqual(VILLAGE_WORLD_WIDTH - PLAYER_RADIUS);
      expect(point.y).toBeLessThanOrEqual(VILLAGE_WORLD_HEIGHT - PLAYER_RADIUS);
      expect(VILLAGE_BUILDINGS.some((building) => overlapsExpandedRect(point, building))).toBe(
        false,
      );
    });
  });
});
