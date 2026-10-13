import {
  BUS_INTERIOR_SIZE, BUS_INTERIOR_STATIONS, BUS_PASSENGER_PLACES, getBusPassengerPlace, BUS_SEATED_POSITION, BUS_SEAT_BACK, BUS_ROAD_REPEAT, busRoadBackdropLayout,
  BUS_PLAYER_SCALE, BUS_PLAYER_RADIUS, BUS_STREET, busRenderDepth, busWorldCamera, busWorldClearSegment, busWorldObstacles,
  busWorldSide, busWorldSpawn, busWorldStations, busWorldTargetEdge, findBusWorldPath, isBusWorldBlocked, moveBusWorldPlayer,
  type BusWorldGeometryOptions, type BusWorldPoint, type BusWorldScene,
} from '../src/game/busWorld';

describe('버스 동네의 보행과 충돌', () => {
  it('네 좌석과 세 손잡이는 서로 통로로 연결되며 등받이와 서 있는 위치가 실제 자리에 맞는다', () => {
    expect(BUS_PASSENGER_PLACES.filter(place => place.kind === 'seat')).toHaveLength(4);
    expect(BUS_PASSENGER_PLACES.filter(place => place.kind === 'handrail')).toHaveLength(3);
    expect(getBusPassengerPlace('unknown')).toBeUndefined();
    for (const from of BUS_PASSENGER_PLACES) {
      expect(isBusWorldBlocked(from.approach, { scene: 'bus' })).toBe(false);
      if (from.kind === 'handrail') expect(isBusWorldBlocked(from.position, { scene: 'bus' })).toBe(false);
      else {
        expect(isBusWorldBlocked(from.position, { scene: 'bus' })).toBe(true);
        expect(from.position.x).toBeGreaterThan(from.seatBack!.x);
        expect(from.position.x).toBeLessThan(from.seatBack!.x + from.seatBack!.width);
      }
      for (const to of BUS_PASSENGER_PLACES) {
        const path = findBusWorldPath(from.approach, to.approach, { scene: 'bus' });
        expect(path.at(-1)).toEqual(to.approach);
        let previous = from.approach;
        for (const point of path) { expect(busWorldClearSegment(previous, point, { scene: 'bus' })).toBe(true); previous = point; }
      }
    }
  });
  it.each([[375, 812], [1440, 900], [1920, 1200], [2560, 2160]])('도로 배경은 %i×%i 화면 전체 높이를 끊김 없이 덮는다', (width, height) => {
    const layout = busRoadBackdropLayout({ width, height });
    for (const offset of [0, BUS_ROAD_REPEAT / 2, BUS_ROAD_REPEAT]) {
      expect(layout.tileTop + offset).toBeLessThanOrEqual(0);
      expect(layout.tileTop + layout.tileHeight + offset).toBeGreaterThanOrEqual(height);
    }
    expect(layout.laneLeft).toBeGreaterThanOrEqual(0);
    expect(layout.laneLeft + layout.laneWidth).toBeLessThanOrEqual(width);
    expect(layout.roadLeft + layout.roadWidth / 2).toBe(width / 2);
  });
  it.each(['village', 'stop', 'district', 'bus'] as BusWorldScene[])('%s의 모든 접근점은 충돌 밖에 있고 서로 연결된다', scene => {
    for (const direction of ['inbound', 'outbound'] as const) {
      const options = { scene, direction, crossingAllowed: true, busPresent: true };
      const points = { spawn: busWorldSpawn(scene, direction), ...busWorldStations(options) };
      for (const [originName, from] of Object.entries(points)) {
        expect(isBusWorldBlocked(from!, options)).toBe(false);
        for (const [destinationName, to] of Object.entries(points)) {
          const path = findBusWorldPath(from!, to!, options);
          if (!path.length) throw new Error(`${scene} ${direction}: ${originName}에서 ${destinationName}로 갈 수 없음`);
          expect(path.at(-1)).toEqual(to);
          let anchor = from!;
          for (const point of path) { expect(busWorldClearSegment(anchor, point, options)).toBe(true); anchor = point; }
        }
      }
    }
  });

  it('차도에는 발 반경까지 진입할 수 없으며 횡단보도도 살피기 전에는 잠긴다', () => {
    const options = { scene: 'stop' as const, direction: 'outbound' as const };
    for (const x of [400, 1035, 1190]) {
      const start = { x, y: 903 };
      const end = moveBusWorldPlayer(start, 0, -600, options);
      expect(end.y).toBeGreaterThanOrEqual(BUS_STREET.bottom + BUS_PLAYER_RADIUS);
      expect(findBusWorldPath(start, { x, y: 580 }, options)).toEqual([]);
    }
  });

  it('살핀 후에는 횡단보도를 통해서만 반대 인도로 갈 수 있다', () => {
    const options = { scene: 'stop' as const, direction: 'outbound' as const, crossingAllowed: true };
    const from = { x: 600, y: 950 }; const to = { x: 600, y: 560 };
    const path = findBusWorldPath(from, to, options);
    expect(path.length).toBeGreaterThan(1);
    let previous = from;
    for (const point of path) {
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      for (let step = 0; step <= Math.ceil(distance); step++) {
        const ratio = step / Math.max(1, Math.ceil(distance));
        const actual = { x: previous.x + (point.x - previous.x) * ratio, y: previous.y + (point.y - previous.y) * ratio };
        if (actual.y > BUS_STREET.top - BUS_PLAYER_RADIUS && actual.y < BUS_STREET.bottom + BUS_PLAYER_RADIUS) {
          expect(actual.x).toBeGreaterThanOrEqual(BUS_STREET.crossingLeft + BUS_PLAYER_RADIUS);
          expect(actual.x).toBeLessThanOrEqual(BUS_STREET.crossingRight - BUS_PLAYER_RADIUS);
        }
      }
      previous = point;
    }
    expect(moveBusWorldPlayer({ x: 600, y: 950 }, 0, -550, options).y).toBeGreaterThanOrEqual(867);
  });

  it('큰 프레임 이동도 의자와 카드 단말기를 관통하지 않는다', () => {
    const options: BusWorldGeometryOptions = { scene: 'bus' };
    for (const rect of busWorldObstacles(options)) {
      const start = { x: rect.x + rect.width + BUS_PLAYER_RADIUS + 2, y: rect.y + rect.height / 2 };
      if (isBusWorldBlocked(start, options)) continue;
      const end = moveBusWorldPlayer(start, -800, 0, options);
      expect(isBusWorldBlocked(end, options)).toBe(false);
      expect(end.x).toBeGreaterThanOrEqual(rect.x + rect.width + BUS_PLAYER_RADIUS);
    }
  });

  it('한국형 앞문·중문은 오른쪽이고 중문 뒤에도 좌석 공간이 남는다', () => {
    const frontDoor = BUS_INTERIOR_STATIONS['door-front']!;
    const middleDoor = BUS_INTERIOR_STATIONS['door-rear']!;
    expect(frontDoor.x).toBeGreaterThan(BUS_INTERIOR_SIZE.width / 2);
    expect(middleDoor.x).toBeGreaterThan(BUS_INTERIOR_SIZE.width / 2);
    expect(frontDoor.y).toBeLessThan(BUS_INTERIOR_SIZE.height * 0.35);
    expect(middleDoor.y).toBeGreaterThan(BUS_INTERIOR_SIZE.height * 0.45);
    expect(middleDoor.y).toBeLessThan(BUS_INTERIOR_SIZE.height * 0.75);
    expect(BUS_INTERIOR_STATIONS.driver!.x).toBeLessThan(BUS_INTERIOR_STATIONS['reader-front']!.x);
    expect(busWorldObstacles({ scene: 'bus' }).some(rect => rect.y > middleDoor.y + BUS_PLAYER_RADIUS && rect.height > 60)).toBe(true);
  });

  it('앉는 몸 위치와 걸어 접근하는 위치를 분리하고 등받이는 앉은 몸과 같은 좌석에 있다', () => {
    const options = { scene: 'bus' as const };
    expect(isBusWorldBlocked(BUS_SEATED_POSITION, options)).toBe(true);
    expect(isBusWorldBlocked(BUS_INTERIOR_STATIONS.seat!, options)).toBe(false);
    expect(BUS_SEATED_POSITION.x).toBeGreaterThan(BUS_SEAT_BACK.x);
    expect(BUS_SEATED_POSITION.x).toBeLessThan(BUS_SEAT_BACK.x + BUS_SEAT_BACK.width);
    expect(BUS_SEATED_POSITION.y).toBeGreaterThan(BUS_SEAT_BACK.y);
    expect(BUS_SEATED_POSITION.y).toBeLessThan(BUS_SEAT_BACK.y + BUS_SEAT_BACK.height);
  });

  it('좌우 정류장 방향은 인도에 완전히 올라온 후에만 판정한다', () => {
    expect(busWorldSide({ x: 1035, y: 745 })).toBeNull();
    expect(busWorldSide({ x: 1035, y: 628 })).toBeNull();
    expect(busWorldSide({ x: 1035, y: 623 })).toBe('inbound');
    expect(busWorldSide({ x: 1035, y: 867 })).toBe('outbound');
  });

  it('마을 크기와 무관하게 캐릭터 크기를 유지하고 발 깊이는 정수로 계산한다', () => {
    expect(BUS_PLAYER_SCALE).toBe(0.55);
    expect(BUS_PLAYER_RADIUS).toBe(17);
    expect(busRenderDepth(562.26)).toBe(562);
    expect(busRenderDepth(562.74)).toBe(563);
  });

  it.each([667, 740, 812, 844, 900])('높이 %i 모바일에서 상단 전광판과 하단 조작 사이에 캐릭터 전체를 유지한다', height => {
    for (const scene of ['bus', 'village', 'district'] as const) {
      const options = { scene, crossingAllowed: true, busPresent: true };
      for (const point of [busWorldSpawn(scene), ...Object.values(busWorldStations(options))]) {
        const camera = busWorldCamera(point!, { width: 375, height }, scene);
        const foot = point!.y + camera.y;
        expect(foot - 106).toBeGreaterThanOrEqual(scene === 'bus' ? 248 : 190);
        expect(foot).toBeLessThanOrEqual(height - 185);
      }
    }
  });

  it.each([667, 740, 844, 900])('높이 %i 차내 입장에서 빈 도로 여백을 줄이고 뒤쪽 자리까지 계속 카메라가 따라간다', height => {
    const viewport = { width: 375, height };
    const front = busWorldCamera(busWorldSpawn('bus'), viewport, 'bus');
    expect(front.y).toBeLessThanOrEqual(185);
    const rearPlace = getBusPassengerPlace('handrail-rear')!;
    const rear = busWorldCamera(rearPlace.position, viewport, 'bus');
    expect(rear.y).toBeLessThan(front.y);
    expect(rearPlace.position.y + rear.y).toBeLessThanOrEqual(height - 185);
    expect(rearPlace.position.y + rear.y - 106).toBeGreaterThanOrEqual(248);
    // The front-left seat is visible at boarding even on a short mobile screen.
    const firstSeat = getBusPassengerPlace('seat-front-left')!;
    expect(firstSeat.hitbox.y + front.y).toBeGreaterThan(234);
    expect(firstSeat.hitbox.y + front.y).toBeLessThan(height - 200);
  });

  it('카메라를 반영해 HUD와 조작판 밖에 숨은 목표의 방향 하나만 알린다', () => {
    const viewport = { width: 390, height: 844 }; const camera = { x: -400, y: -200 };
    expect(busWorldTargetEdge(undefined, camera, viewport)).toBeNull();
    expect(busWorldTargetEdge({ x: 595, y: 620 }, camera, viewport)).toBeNull();
    expect(busWorldTargetEdge({ x: 410, y: 620 }, camera, viewport)).toBe('left');
    expect(busWorldTargetEdge({ x: 800, y: 620 }, camera, viewport)).toBe('right');
    expect(busWorldTargetEdge({ x: 595, y: 420 }, camera, viewport)).toBe('up');
    expect(busWorldTargetEdge({ x: 595, y: 820 }, camera, viewport)).toBe('down');
    expect(busWorldTargetEdge({ x: 1000, y: 900 }, camera, viewport)).toBe('right');
    // Both targets are on the physical display but concealed by the two HUD areas.
    expect(busWorldTargetEdge({ x: 195, y: 230 }, { x: 0, y: 0 }, viewport)).toBe('up');
    expect(busWorldTargetEdge({ x: 195, y: 610 }, { x: 0, y: 0 }, viewport)).toBe('down');
  });
});
