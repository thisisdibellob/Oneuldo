import policy from '../../../shared/market/time-policy.json';

export const MARKET_QUEST_TIME_POLICY = Object.freeze(policy);

export type MarketQuestTiming = {
  timeLimitSeconds: number;
  policyVersion: string;
  startedAt: string | null;
  elapsedMs: number;
  remainingMs: number;
  expired: boolean;
  clockBasis: 'WALL_CLOCK';
};

/** Missing legacy/static limits use the policy default. Present invalid values are never repaired. */
export function resolveMarketTimeLimitSeconds(value: unknown, required = false): number {
  if (value === undefined || value === null) {
    if (required) throw new Error('AI 장보기 시간 제한이 빠져 있어요. 다시 생성해 주세요.');
    return policy.defaultSeconds;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)
    || value < policy.minimumSeconds || value > policy.maximumSeconds) {
    throw new Error(`장보기 시간 제한은 ${policy.minimumSeconds}~${policy.maximumSeconds}초 사이의 정수여야 해요.`);
  }
  return value;
}

/** Wall time includes background time; monotonic time and the high-water mark prevent clock rollback. */
export class MarketQuestClock {
  private wallStartedAt: number | null = null;
  private monotonicStartedAt: number | null = null;
  private elapsedMs = 0;
  private frozen: MarketQuestTiming | null = null;

  constructor(readonly timeLimitSeconds: number,
    private readonly wallNow: () => number = Date.now,
    private readonly monotonicNow: () => number = () => globalThis.performance?.now() ?? Date.now()) {
    resolveMarketTimeLimitSeconds(timeLimitSeconds, true);
  }

  start(): MarketQuestTiming {
    if (this.wallStartedAt === null) {
      this.wallStartedAt = this.wallNow();
      this.monotonicStartedAt = this.monotonicNow();
    }
    return this.snapshot();
  }

  snapshot(): MarketQuestTiming {
    if (this.frozen) return { ...this.frozen };
    if (this.wallStartedAt !== null) {
      this.elapsedMs = Math.max(this.elapsedMs, 0, this.wallNow() - this.wallStartedAt,
        this.monotonicNow() - this.monotonicStartedAt!);
    }
    const remainingMs = Math.max(0, this.timeLimitSeconds * 1000 - this.elapsedMs);
    return { timeLimitSeconds: this.timeLimitSeconds, policyVersion: policy.policyVersion,
      startedAt: this.wallStartedAt === null ? null : new Date(this.wallStartedAt).toISOString(),
      elapsedMs: Math.floor(this.elapsedMs), remainingMs: Math.ceil(remainingMs),
      expired: this.wallStartedAt !== null && remainingMs === 0, clockBasis: 'WALL_CLOCK' };
  }

  freeze(): MarketQuestTiming {
    this.frozen ??= this.snapshot();
    return { ...this.frozen };
  }
}

export function formatMarketTime(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
