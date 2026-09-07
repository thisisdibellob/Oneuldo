import {
  MarketMovementDetector,
  type MarketTelemetryStation,
} from '../src/behavior/marketMovementDetector';

const stations: Record<MarketTelemetryStation, { x: number; y: number }> = {
  checkout: { x: 0, y: 0 },
  fresh: { x: 100, y: 0 },
  produce: { x: 200, y: 0 },
  meal: { x: 300, y: 0 },
  drink: { x: 400, y: 0 },
};

function observe(
  detector: MarketMovementDetector,
  x: number,
  occurredAt: number,
  targetZoneIds: MarketTelemetryStation[] = ['produce'],
) {
  return detector.observe({
    controlMode: 'joystick',
    occurredAt,
    point: { x, y: 0 },
    targetZoneIds: new Set(targetZoneIds),
  });
}

describe('장보기 이동 의미 이벤트 판정', () => {
  it('목표 진열장 반경을 상호작용 없이 벗어나면 통과 이벤트를 만든다', () => {
    const detector = new MarketMovementDetector(stations, 30);

    observe(detector, 200, 1000);
    const events = observe(detector, 250, 2000);

    expect(events.map(({ eventCode }) => eventCode)).toContain('SHOP.TARGET_PASSED');
    expect(events.find(({ eventCode }) => eventCode === 'SHOP.TARGET_PASSED')?.payload)
      .toMatchObject({ stationId: 'produce', visitIndex: 1 });
  });

  it('진열장을 열었다면 목표 진열장 통과로 기록하지 않는다', () => {
    const detector = new MarketMovementDetector(stations, 30);

    observe(detector, 200, 1000);
    detector.markShelfOpened('produce');
    const events = observe(detector, 250, 2000);

    expect(events.map(({ eventCode }) => eventCode)).not.toContain('SHOP.TARGET_PASSED');
  });

  it('같은 진열장 재방문과 A-B-A 경로 순환을 감지한다', () => {
    const detector = new MarketMovementDetector(stations, 30);
    const codes: string[] = [];

    codes.push(...observe(detector, 100, 1000, ['fresh']).map(({ eventCode }) => eventCode));
    codes.push(...observe(detector, 150, 2000, ['fresh']).map(({ eventCode }) => eventCode));
    codes.push(...observe(detector, 200, 3000, ['fresh']).map(({ eventCode }) => eventCode));
    codes.push(...observe(detector, 250, 4000, ['fresh']).map(({ eventCode }) => eventCode));
    codes.push(...observe(detector, 100, 5000, ['fresh']).map(({ eventCode }) => eventCode));

    expect(codes).toContain('SHOP.TARGET_SHELF_REVISITED');
    expect(codes).toContain('SHOP.ROUTE_LOOP_DETECTED');
  });

  it('목표가 없는 진열장 근처의 장기 체류를 감지한다', () => {
    const detector = new MarketMovementDetector(stations, 30);

    observe(detector, 400, 1000);
    const events = observe(detector, 400, 10000);

    expect(events.find(({ eventCode }) => eventCode === 'SHOP.OFF_TARGET_DWELL')?.payload)
      .toMatchObject({ durationMs: 9000, stationId: 'drink' });
  });

  it('고빈도 좌표도 수집 축약기에 전달하되 근접 이벤트는 중복하지 않는다', () => {
    const detector = new MarketMovementDetector(stations, 30);

    expect(observe(detector, 50, 1000)).not.toHaveLength(0);
    expect(observe(detector, 51, 1100).map(e => e.eventCode)).toEqual(['SHOP.MOVEMENT_SAMPLED']);
  });

  it('연속 막힘은 시작과 종료만 기록하고 서로 다른 막힘 시도만 센다', () => {
    const detector = new MarketMovementDetector(stations, 30);
    const sample = (time: number, blocked: boolean) => detector.observe({
      point: { x: 50, y: 50 }, occurredAt: time, controlMode: 'joystick', targetZoneIds: new Set(), blocked,
    });
    const events = [...sample(1000, true), ...sample(1010, true), ...sample(1300, true), ...sample(1400, false)];
    expect(events.filter(e => e.eventCode === 'SHOP.MOVEMENT_BLOCKED')).toHaveLength(1);
    expect(events.find(e => e.eventCode === 'SHOP.MOVEMENT_UNBLOCKED')?.payload.durationMs).toBe(400);
    expect(events.some(e => e.eventCode === 'SHOP.MOVEMENT_BLOCKED_REPEATEDLY')).toBe(false);
    sample(1500, true); detector.stop(1600);
    expect(sample(1700, true).some(e => e.eventCode === 'SHOP.MOVEMENT_BLOCKED_REPEATEDLY')).toBe(true);
  });

  it('수집기로 받아들인 모든 위치 샘플을 원시 이동 이벤트로 남긴다', () => {
    const detector = new MarketMovementDetector(stations, 30);

    const first = observe(detector, 43.12789, 1000);
    const second = detector.observe({
      blocked: true,
      controlMode: 'touch',
      occurredAt: 1100,
      point: { x: 44.12345, y: 9.98765 },
      targetZoneIds: new Set(['produce']),
    });

    expect(first.find(({ eventCode }) => eventCode === 'SHOP.MOVEMENT_SAMPLED')?.payload)
      .toMatchObject({ blocked: false, controlMode: 'joystick', x: 43.1, y: 0 });
    expect(second.find(({ eventCode }) => eventCode === 'SHOP.MOVEMENT_SAMPLED')?.payload)
      .toMatchObject({ blocked: true, controlMode: 'touch', x: 44.1, y: 10 });
  });
});
