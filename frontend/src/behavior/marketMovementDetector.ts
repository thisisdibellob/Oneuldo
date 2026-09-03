export type MarketTelemetryPoint = { x: number; y: number };
export type MarketTelemetryStation = 'fresh' | 'produce' | 'meal' | 'drink' | 'checkout';
export type MarketTelemetryControlMode = 'joystick' | 'touch' | 'accessibility';

export type MarketMovementEventDraft = {
  eventCode: string;
  microActionId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  priority?: 'high' | 'normal' | 'low';
};

export type MarketMovementSample = {
  point: MarketTelemetryPoint;
  occurredAt?: number;
  controlMode: MarketTelemetryControlMode;
  targetZoneIds: ReadonlySet<MarketTelemetryStation>;
  blocked?: boolean;
};

type Visit = {
  enteredAt: number;
  opened: boolean;
  station: MarketTelemetryStation;
  targetWhenEntered: boolean;
  visitIndex: number;
};

const SAMPLE_INTERVAL_MS = 250;
const SAMPLE_DISTANCE = 12;
const SEGMENT_DURATION_MS = 5000;
const OFF_TARGET_DWELL_MS = 8000;
const BLOCK_REPEAT_WINDOW_MS = 3000;
const BLOCK_REPEAT_COUNT = 3;

export class MarketMovementDetector {
  private activeVisit: Visit | null = null;
  private blockedAt: number[] = [];
  private lastAcceptedAt = 0;
  private lastPoint: MarketTelemetryPoint | null = null;
  private lastVisitEndedAt = new Map<MarketTelemetryStation, number>();
  private offTargetDwellReported = false;
  private recentStations: MarketTelemetryStation[] = [];
  private segmentDistance = 0;
  private segmentStartedAt = 0;
  private segmentStartPoint: MarketTelemetryPoint | null = null;
  private visitCounts = new Map<MarketTelemetryStation, number>();

  constructor(
    private readonly stations: Record<MarketTelemetryStation, MarketTelemetryPoint>,
    private readonly interactionDistance: number,
  ) {}

  observe(sample: MarketMovementSample): MarketMovementEventDraft[] {
    const now = sample.occurredAt ?? Date.now();
    const events: MarketMovementEventDraft[] = [];
    const distance = this.lastPoint
      ? Math.hypot(sample.point.x - this.lastPoint.x, sample.point.y - this.lastPoint.y)
      : Number.POSITIVE_INFINITY;
    if (now - this.lastAcceptedAt < SAMPLE_INTERVAL_MS && distance < SAMPLE_DISTANCE && !sample.blocked) {
      return events;
    }

    if (this.lastPoint) this.segmentDistance += distance;
    else {
      this.segmentStartedAt = now;
      this.segmentStartPoint = sample.point;
      events.push(this.event('SHOP.ITEM_SEARCH_STARTED', 'MOVE_IN_MARKET', now, {
        controlMode: sample.controlMode,
        x: sample.point.x,
        y: sample.point.y,
      }, 'low'));
    }
    this.lastPoint = sample.point;
    this.lastAcceptedAt = now;

    const nearby = this.closestStation(sample.point);
    if (nearby !== this.activeVisit?.station) {
      events.push(...this.finishVisit(now, sample.targetZoneIds));
      if (nearby) events.push(...this.startVisit(nearby, now, sample.targetZoneIds));
    } else if (this.activeVisit && this.activeVisit.station !== 'checkout'
      && !this.activeVisit.targetWhenEntered
      && !this.offTargetDwellReported
      && now - this.activeVisit.enteredAt >= OFF_TARGET_DWELL_MS) {
      this.offTargetDwellReported = true;
      events.push(this.event('SHOP.OFF_TARGET_DWELL', `DWELL_${this.activeVisit.station}`, now, {
        durationMs: now - this.activeVisit.enteredAt,
        pauseCount: 1,
        pauseDurationMs: now - this.activeVisit.enteredAt,
        stationId: this.activeVisit.station,
      }, 'high'));
    }

    if (sample.blocked) events.push(...this.recordBlocked(now, sample));
    if (now - this.segmentStartedAt >= SEGMENT_DURATION_MS) {
      events.push(this.summarizeSegment(now, sample.controlMode));
      this.segmentStartedAt = now;
      this.segmentStartPoint = sample.point;
      this.segmentDistance = 0;
    }
    return events;
  }

  markShelfOpened(station: MarketTelemetryStation) {
    if (this.activeVisit?.station === station) this.activeVisit.opened = true;
  }

  stop(occurredAt = Date.now(), controlMode: MarketTelemetryControlMode = 'joystick') {
    if (!this.lastPoint) return [];
    const events: MarketMovementEventDraft[] = [];
    if (this.segmentDistance > 0) events.push(this.summarizeSegment(occurredAt, controlMode));
    events.push(this.event('SHOP.MOVEMENT_STOPPED', 'MOVE_IN_MARKET', occurredAt, {
      controlMode,
      durationMs: Math.max(0, occurredAt - this.segmentStartedAt),
      travelDistance: this.round(this.segmentDistance),
    }, 'low'));
    this.lastPoint = null;
    this.segmentDistance = 0;
    this.segmentStartedAt = 0;
    this.segmentStartPoint = null;
    return events;
  }

  finish(targetZoneIds: ReadonlySet<MarketTelemetryStation>, occurredAt = Date.now()) {
    return [
      ...this.finishVisit(occurredAt, targetZoneIds),
      ...this.stop(occurredAt),
    ];
  }

  private closestStation(point: MarketTelemetryPoint): MarketTelemetryStation | null {
    let closest: MarketTelemetryStation | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    (Object.entries(this.stations) as Array<[MarketTelemetryStation, MarketTelemetryPoint]>)
      .forEach(([station, stationPoint]) => {
        const distance = Math.hypot(point.x - stationPoint.x, point.y - stationPoint.y);
        if (distance <= this.interactionDistance && distance < closestDistance) {
          closest = station;
          closestDistance = distance;
        }
      });
    return closest;
  }

  private startVisit(
    station: MarketTelemetryStation,
    now: number,
    targetZoneIds: ReadonlySet<MarketTelemetryStation>,
  ) {
    const visitIndex = (this.visitCounts.get(station) ?? 0) + 1;
    this.visitCounts.set(station, visitIndex);
    const target = station !== 'checkout' && targetZoneIds.has(station);
    this.activeVisit = { enteredAt: now, opened: false, station, targetWhenEntered: target, visitIndex };
    this.offTargetDwellReported = false;
    const events = [this.event(
      station === 'checkout' ? 'SHOP.CHECKOUT_PROXIMITY_ENTERED' : 'SHOP.SHELF_PROXIMITY_ENTERED',
      `APPROACH_${station}`,
      now,
      {
      intervalSinceLastVisitMs: this.lastVisitEndedAt.has(station)
        ? now - this.lastVisitEndedAt.get(station)!
        : undefined,
      isTargetZone: target,
      stationId: station,
      visitIndex,
      },
      target || station === 'checkout' ? 'high' : 'normal',
    )];
    if (visitIndex > 1 && station !== 'checkout') {
      events.push(this.event(target ? 'SHOP.TARGET_SHELF_REVISITED' : 'SHOP.SHELF_REVISITED',
        `REVISIT_${station}`, now, {
          intervalSinceLastVisitMs: now - (this.lastVisitEndedAt.get(station) ?? now),
          repeatedLocationCount: 1,
          stationId: station,
          visitIndex,
        }, target ? 'high' : 'normal'));
    }
    if (target) {
      events.push(this.event('SHOP.TARGET_SHELF_APPROACHED', `APPROACH_TARGET_${station}`, now, {
        stationId: station,
        visitIndex,
      }, 'high'));
    } else if (station !== 'checkout') {
      events.push(this.event('SHOP.WRONG_AISLE_ENTERED', `ENTER_NON_TARGET_${station}`, now, {
        wrongAisleCount: 1,
        stationId: station,
        visitIndex,
      }, 'normal'));
    }
    this.recordStationSequence(station, now, events);
    return events;
  }

  private finishVisit(now: number, targetZoneIds: ReadonlySet<MarketTelemetryStation>) {
    const visit = this.activeVisit;
    if (!visit) return [];
    this.activeVisit = null;
    this.lastVisitEndedAt.set(visit.station, now);
    const durationMs = Math.max(0, now - visit.enteredAt);
    const targetStillRemaining = visit.station !== 'checkout' && targetZoneIds.has(visit.station);
    const events = [this.event(
      visit.station === 'checkout' ? 'SHOP.CHECKOUT_PROXIMITY_EXITED' : 'SHOP.SHELF_PROXIMITY_EXITED',
      `LEAVE_${visit.station}`,
      now,
      {
      durationMs,
      shelfOpened: visit.opened,
      stationId: visit.station,
      visitIndex: visit.visitIndex,
      },
      'normal',
    )];
    if (targetStillRemaining && !visit.opened) {
      events.push(this.event('SHOP.TARGET_PASSED', `PASS_TARGET_${visit.station}`, now, {
        proximityDurationMs: durationMs,
        stationId: visit.station,
        targetPassedWithoutSelectionCount: 1,
        visitIndex: visit.visitIndex,
      }, 'high'));
    }
    return events;
  }

  private recordStationSequence(
    station: MarketTelemetryStation,
    now: number,
    events: MarketMovementEventDraft[],
  ) {
    if (this.recentStations.at(-1) === station) return;
    this.recentStations.push(station);
    if (this.recentStations.length > 6) this.recentStations.shift();
    const lastThree = this.recentStations.slice(-3);
    if (lastThree.length === 3 && lastThree[0] === lastThree[2] && lastThree[0] !== lastThree[1]) {
      events.push(this.event('SHOP.ROUTE_LOOP_DETECTED', 'ROUTE_LOOP', now, {
        stationSequence: lastThree,
      }, 'high'));
    }
  }

  private recordBlocked(now: number, sample: MarketMovementSample) {
    this.blockedAt = [...this.blockedAt.filter((at) => now - at <= BLOCK_REPEAT_WINDOW_MS), now];
    const events = [this.event('SHOP.MOVEMENT_BLOCKED', 'MOVE_BLOCKED', now, {
      controlMode: sample.controlMode,
      x: sample.point.x,
      y: sample.point.y,
    }, 'low')];
    if (this.blockedAt.length === BLOCK_REPEAT_COUNT) {
      events.push(this.event('SHOP.MOVEMENT_BLOCKED_REPEATEDLY', 'MOVE_BLOCKED_REPEATEDLY', now, {
        blockedCount: this.blockedAt.length,
        observationWindowMs: BLOCK_REPEAT_WINDOW_MS,
      }, 'normal'));
    }
    return events;
  }

  private summarizeSegment(now: number, controlMode: MarketTelemetryControlMode) {
    const end = this.lastPoint!;
    const start = this.segmentStartPoint ?? end;
    return this.event('SHOP.MOVEMENT_SEGMENT_SUMMARIZED', 'MOVE_SEGMENT', now, {
      controlMode,
      durationMs: Math.max(0, now - this.segmentStartedAt),
      pathDistance: this.round(this.segmentDistance),
      straightDistance: this.round(Math.hypot(end.x - start.x, end.y - start.y)),
      travelDistance: this.round(this.segmentDistance),
    }, 'low');
  }

  private event(
    eventCode: string,
    microActionId: string,
    occurredAt: number,
    payload: Record<string, unknown>,
    priority: 'high' | 'normal' | 'low',
  ): MarketMovementEventDraft {
    return { eventCode, microActionId, occurredAt: new Date(occurredAt).toISOString(), payload, priority };
  }

  private round(value: number) {
    return Math.round(value * 10) / 10;
  }
}
