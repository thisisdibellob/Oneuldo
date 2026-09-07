// Acquisition policy, shared by the live tracker and the offline replay tool.
// Coordinates are game-world units; this is not a user-ability threshold.
export const MOVEMENT_SAMPLING = {
  samplingVersion: 'market-movement-v2',
  maxIntervalMs: 1000,
  maxTimedPositionError: 0.5,
  samplingRule: 'time-aligned endpoints; preserve reversals, stop/resume, control/blocked changes and action boundaries; gaps are unknown; blocked frequency is not collision count',
} as const;

export type MovementReading = { time: number; x: number; y: number; blocked: boolean; controlMode: string };
export type MovementSpan = { fromMs: number; sampleCount: number; observedDistance: number; maxTimedPositionError: number };
type Point<T> = { event: T; reading: MovementReading };

export class MovementLogReducer<T> {
  private anchor: Point<T> | null = null;
  private pending: Point<T>[] = [];
  constructor(private readonly annotate: (event: T, span: MovementSpan) => T) {}

  push(event: T, reading: MovementReading | null): T[] {
    if (!reading || ![reading.time, reading.x, reading.y].every(Number.isFinite)) {
      return [...this.flush(), event];
    }
    const point = { event, reading };
    if (!this.anchor) { this.anchor = point; return [event]; }
    const previous = this.pending.at(-1) ?? this.anchor;
    const a = previous.reading;
    if (reading.time <= a.time || reading.time - a.time > MOVEMENT_SAMPLING.maxIntervalMs
      || reading.blocked !== a.blocked || reading.controlMode !== a.controlMode) {
      const out = this.flush(); this.anchor = point; return [...out, event];
    }
    const out: T[] = [];
    if (this.pending.length) {
      const before = (this.pending.at(-2) ?? this.anchor).reading;
      const ux = a.x - before.x, uy = a.y - before.y;
      const vx = reading.x - a.x, vy = reading.y - a.y;
      const stoppedBefore = ux === 0 && uy === 0, stoppedNow = vx === 0 && vy === 0;
      const reversal = ux * vx < 0 || uy * vy < 0 || (!stoppedBefore && !stoppedNow && ux * vx + uy * vy <= 0);
      if (stoppedBefore !== stoppedNow || reversal || this.error(point) > MOVEMENT_SAMPLING.maxTimedPositionError
        || reading.time - this.anchor.reading.time > MOVEMENT_SAMPLING.maxIntervalMs) {
        out.push(...this.commit());
      }
    }
    this.pending.push(point);
    if (reading.time - this.anchor!.reading.time >= MOVEMENT_SAMPLING.maxIntervalMs) out.push(...this.commit());
    return out;
  }

  // Flush before interactions, backgrounding, persistence and session completion.
  flush(): T[] {
    const out = this.commit(); this.anchor = null; return out;
  }

  private error(end: Point<T>): number {
    const start = this.anchor!.reading, last = end.reading;
    return this.pending.reduce((max, { reading: p }) => {
      const fraction = (p.time - start.time) / (last.time - start.time);
      return Math.max(max, Math.hypot(p.x - start.x - (last.x - start.x) * fraction,
        p.y - start.y - (last.y - start.y) * fraction));
    }, 0);
  }

  private commit(): T[] {
    if (!this.anchor || !this.pending.length) return [];
    const last = this.pending.at(-1)!;
    let previous = this.anchor.reading, distance = 0;
    for (const { reading } of this.pending) {
      distance += Math.hypot(reading.x - previous.x, reading.y - previous.y); previous = reading;
    }
    const event = this.pending.length > 1 ? this.annotate(last.event, {
      fromMs: this.anchor.reading.time, sampleCount: this.pending.length,
      observedDistance: Math.round(distance * 1000) / 1000, maxTimedPositionError: this.error(last),
    }) : last.event;
    this.anchor = last; this.pending = [];
    return [event];
  }
}
