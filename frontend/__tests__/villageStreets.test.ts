import {
  BUS_STOP_POINT,
  MARKET_BUS_STOP_POINT,
  VILLAGE_ROADS,
  type Point,
  type Rect,
} from '../src/game/prototypeWorld';
import {
  isVillageNavigationBlocked,
  isVillageNavigationSegmentClear,
  isVillagePedestrianSegmentClear,
  VILLAGE_PLAYER_RADIUS,
} from '../src/game/villageNavigation';
import {
  VILLAGE_CROSSINGS,
  VILLAGE_JUNCTIONS,
  VILLAGE_ROAD_DASHES,
  VILLAGE_STREET_BLOCKS,
  extendVillageBlock,
  type VillageCrossing,
} from '../src/game/villageStreets';

// Independent geometry checks: a broken marking filter must not validate itself.
function overlaps(a: Rect, b: Rect) {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
    && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
}

function roadFor(crossing: VillageCrossing) {
  return VILLAGE_ROADS.find(road => {
    const correctDirection = crossing.direction === 'across-main'
      ? road.width > road.height : road.height > road.width;
    return correctDirection && road.x <= crossing.x && road.y <= crossing.y
      && road.x + road.width >= crossing.x + crossing.width
      && road.y + road.height >= crossing.y + crossing.height;
  });
}

function crossingLandings(crossing: VillageCrossing): [Point, Point] {
  const road = roadFor(crossing)!;
  // Leave enough space for the player's whole footprint to leave the carriageway.
  const clearance = VILLAGE_PLAYER_RADIUS + 1;
  return crossing.direction === 'across-main'
    ? [
      { x: crossing.x + crossing.width / 2, y: road.y - clearance },
      { x: crossing.x + crossing.width / 2, y: road.y + road.height + clearance },
    ]
    : [
      { x: road.x - clearance, y: crossing.y + crossing.height / 2 },
      { x: road.x + road.width + clearance, y: crossing.y + crossing.height / 2 },
    ];
}

describe('마을 도로와 보행 시설 배치', () => {
  it.each([
    ['학교·마트 앞', {x:582,y:631}, {x:1673,y:631}],
    ['남쪽 상가 앞', {x:582,y:907}, {x:1673,y:907}],
    ['상가 아래쪽', {x:582,y:1458}, {x:1673,y:1458}],
    ['공원 오른쪽', {x:323,y:80}, {x:323,y:631}],
    ['마을회관 오른쪽', {x:323,y:907}, {x:323,y:1640}],
    ['학교 왼쪽', {x:582,y:80}, {x:582,y:631}],
    ['상가 왼쪽', {x:582,y:907}, {x:582,y:1458}],
    ['주민센터 오른쪽', {x:1673,y:80}, {x:1673,y:631}],
    ['상가 오른쪽', {x:1673,y:907}, {x:1673,y:1458}],
    ['동쪽 주택가 위쪽', {x:1932,y:80}, {x:1932,y:631}],
    ['동쪽 주택가 아래쪽', {x:1932,y:907}, {x:1932,y:1640}],
    ['우리 집 앞 블록', {x:1932,y:907}, {x:2160,y:907}],
  ] as const)('%s 보행로는 차도에 내려가지 않고 64px 폭을 연속해서 확보한다', (_name, from, to) => {
    // Wider than the live 44px footprint: test real steering clearance, not just paint.
    for (const offset of [-10, 0, 10]) {
      const delta = from.x === to.x ? {x:offset,y:0} : {x:0,y:offset};
      const start = {x:from.x+delta.x,y:from.y+delta.y};
      const end = {x:to.x+delta.x,y:to.y+delta.y};
      expect(isVillagePedestrianSegmentClear(start,end)).toBe(true);
      // The entire foot must stay on the pavement even at either outer steering edge.
      const footprintLane = {x:Math.min(start.x,end.x)-22,y:Math.min(start.y,end.y)-22,
        width:Math.abs(end.x-start.x)+44,height:Math.abs(end.y-start.y)+44};
      expect(VILLAGE_ROADS.filter(road=>overlaps(footprintLane,road))).toEqual([]);
    }
  });

  it('보이는 블록만 경계 밖으로 계속 이어지고 원래 도로 가장자리는 유지된다', () => {
    for (const block of VILLAGE_STREET_BLOCKS) {
      const extended=extendVillageBlock(block);
      if(block.x>=0) expect(extended.x).toBe(block.x);
      if(block.y>=0) expect(extended.y).toBe(block.y);
      if(block.x+block.width<=2200) expect(extended.x+extended.width).toBe(block.x+block.width);
      if(block.y+block.height<=1700) expect(extended.y+extended.height).toBe(block.y+block.height);
    }
    expect(isVillageNavigationBlocked({x:-24,y:700})).toBe(true);
    expect(isVillageNavigationBlocked({x:2224,y:700})).toBe(true);
  });
  it.each(VILLAGE_CROSSINGS)('$id 횡단보도는 도로 위이면서 교차로 중앙을 피한다', crossing => {
    expect(roadFor(crossing)).toBeDefined();
    expect(VILLAGE_JUNCTIONS.filter(junction => overlaps(crossing, junction))).toEqual([]);
  });

  it('차선 표시가 교차로나 횡단보도 위를 지나가지 않는다', () => {
    const pedestrianAndJunctionAreas = [...VILLAGE_CROSSINGS, ...VILLAGE_JUNCTIONS];
    const overlappingDashes = VILLAGE_ROAD_DASHES.filter(dash =>
      pedestrianAndJunctionAreas.some(area => overlaps(dash, area)));
    expect(overlappingDashes).toEqual([]);
  });

  it.each(VILLAGE_CROSSINGS)('$id 횡단보도를 건너 양쪽 보도에 완전히 올라설 수 있다', crossing => {
    const [from, to] = crossingLandings(crossing);
    expect(isVillageNavigationBlocked(from)).toBe(false);
    expect(isVillageNavigationBlocked(to)).toBe(false);
    // Buildings, flower beds, tree bases and the world edge cannot block the crossing.
    expect(isVillageNavigationSegmentClear(from, to)).toBe(true);
  });

  it.each([
    ['마트 앞 대기점', MARKET_BUS_STOP_POINT],
    ['동쪽 정류장 대기점', BUS_STOP_POINT],
  ] as const)('%s에서는 차도나 장애물에 걸치지 않고 설 수 있다', (_name, point) => {
    const footprint = {
      x: point.x - VILLAGE_PLAYER_RADIUS,
      y: point.y - VILLAGE_PLAYER_RADIUS,
      width: VILLAGE_PLAYER_RADIUS * 2,
      height: VILLAGE_PLAYER_RADIUS * 2,
    };
    expect(VILLAGE_ROADS.filter(road => overlaps(footprint, road))).toEqual([]);
    expect(isVillageNavigationBlocked(point)).toBe(false);
  });
});
