import {
  BUS_STOP_POINT,
  HOUSE_ENTRANCE_POINT,
  HOUSE_RETURN_POINT,
  INITIAL_PLAYER_POINT,
  MARKET_BUS_STOP_POINT,
  MARKET_ENTRANCE_POINT,
  MARKET_RETURN_POINT,
  VILLAGE_BUILDINGS,
  VILLAGE_DECORATIONS,
  VILLAGE_NPCS,
  VILLAGE_ROADS,
  VILLAGE_WORLD_HEIGHT,
  VILLAGE_WORLD_WIDTH,
  villageObstacles,
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
      expect(building.outlineWidth).toBeGreaterThanOrEqual(1.05);
      expect(building.outlineWidth).toBeLessThanOrEqual(1.7);
      expect(building.entranceHeight).toBeGreaterThanOrEqual(75);
      expect(building.entranceHeight).toBeLessThanOrEqual(106);
    });
  });

  it('도로 텍스처 구간이 고유한 ID를 사용하며 월드 경계를 벗어나지 않는다', () => {
    expect(VILLAGE_ROADS).toHaveLength(5);
    expect(new Set(VILLAGE_ROADS.map(({ id }) => id)).size).toBe(VILLAGE_ROADS.length);

    VILLAGE_ROADS.forEach((road) => {
      expect(road.x).toBeGreaterThanOrEqual(0);
      expect(road.y).toBeGreaterThanOrEqual(0);
      expect(road.x + road.width).toBeLessThanOrEqual(VILLAGE_WORLD_WIDTH);
      expect(road.y + road.height).toBeLessThanOrEqual(VILLAGE_WORLD_HEIGHT);
    });
  });

  it('건물끼리 겹치지 않아 크기를 맞춘 뒤에도 이동 공간이 유지된다', () => {
    VILLAGE_BUILDINGS.forEach((building, index) => {
      VILLAGE_BUILDINGS.slice(index + 1).forEach((otherBuilding) => {
        const overlaps =
          building.x < otherBuilding.x + otherBuilding.width &&
          building.x + building.width > otherBuilding.x &&
          building.y < otherBuilding.y + otherBuilding.height &&
          building.y + building.height > otherBuilding.y;

        expect(overlaps).toBe(false);
      });
    });
  });

  it('환경 장식이 월드 안에 있고 고유한 ID를 사용한다', () => {
    expect(VILLAGE_DECORATIONS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(VILLAGE_DECORATIONS.map(({ id }) => id)).size).toBe(
      VILLAGE_DECORATIONS.length,
    );

    VILLAGE_DECORATIONS.forEach((decoration) => {
      expect(decoration.x).toBeGreaterThanOrEqual(0);
      expect(decoration.y).toBeGreaterThanOrEqual(0);
      expect(decoration.x + decoration.width).toBeLessThanOrEqual(VILLAGE_WORLD_WIDTH);
      expect(decoration.y + decoration.height).toBeLessThanOrEqual(VILLAGE_WORLD_HEIGHT);
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
      expect(villageObstacles.some((obstacle) => overlapsExpandedRect(point, obstacle))).toBe(false);
    });
  });
});
