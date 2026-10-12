import type { MarketReplayMovementPolicy, MarketReplayMovementPolicyDecision } from '../../frontend/src/game/marketReplayTrace';
import { Random } from './random';
import type { ActorDirection, ActorObservation } from './types';

export const FEEDBACK_MOVEMENT_POLICY_VERSION = 'exploration-v1' as const;
export type FeedbackMovementPolicyOptions = { wanderProbability?: number };
export type FeedbackMovementPolicyConfiguration = MarketReplayMovementPolicy;
export type FeedbackMovementPolicyContext = MarketReplayMovementPolicyDecision;

const DIRECTIONS: readonly ActorDirection[] = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
type LocalBlock = { remaining: number; dx: number; dy: number };
const copyContext = (context: FeedbackMovementPolicyContext): FeedbackMovementPolicyContext => ({
  ...context, avoidedDirections: [...context.avoidedDirections],
});

/** An opt-in v3 controller policy. It never chooses a direction, duration, target or route. */
export class FeedbackMovementPolicy {
  private readonly settings: FeedbackMovementPolicyConfiguration;
  private readonly prepared = new Map<number, FeedbackMovementPolicyContext>();
  private readonly blocked = new Map<ActorDirection, LocalBlock>();
  private lastObservationSequence = -1;
  private lastDecisionIndex = -1;
  private pendingRecovery = false;
  private lastArrival: { type: 'walkToAnchor' | 'walkTo'; id: string } | null = null;

  constructor(private readonly seed: string | number, options: FeedbackMovementPolicyOptions = {},
    version: FeedbackMovementPolicyConfiguration['version'] = FEEDBACK_MOVEMENT_POLICY_VERSION) {
    if (version !== 'exploration-v1' && version !== 'exploration-v2') throw new Error('Unsupported feedback movement policy version');
    if (options === null || typeof options !== 'object' || Array.isArray(options)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(options)))
      throw new Error('Feedback movement policy options must be a plain object');
    if (Reflect.ownKeys(options).some(key => key !== 'wanderProbability'))
      throw new Error('Feedback movement policy options may only contain wanderProbability');
    const wanderProbability = options.wanderProbability === undefined ? .2 : options.wanderProbability;
    if (typeof wanderProbability !== 'number' || !Number.isFinite(wanderProbability)
      || wanderProbability < 0 || wanderProbability > 1)
      throw new RangeError('wanderProbability must be a finite number in 0..1');
    this.settings = { version, wanderProbability,
      blockedDirectionCooldown: 4, unblockDistancePx: 24 };
  }

  get configuration(): FeedbackMovementPolicyConfiguration { return { ...this.settings }; }

  prepare(observation: ActorObservation, decisionIndex: number): FeedbackMovementPolicyContext {
    if (!Number.isSafeInteger(decisionIndex) || decisionIndex < 0)
      throw new RangeError('decisionIndex must be a non-negative safe integer');
    const previous = this.prepared.get(decisionIndex);
    if (previous) return copyContext(previous);
    if (decisionIndex < this.lastDecisionIndex)
      throw new RangeError('New decisions must be prepared in increasing index order');
    this.lastDecisionIndex = decisionIndex;
    this.observeResult(observation);

    const world = observation.phase === 'shopping' && observation.view === 'world' && !observation.activeStation;
    const avoidedDirections = DIRECTIONS.filter(direction => this.blocked.has(direction));
    // Retain nonmovement controls if every direction is excluded; do not invent a way out.
    const eligible = world && avoidedDirections.length < DIRECTIONS.length;
    let mode: FeedbackMovementPolicyContext['mode'] = 'actor-choice';
    let roll: number | null = null;
    if (eligible) {
      if (this.pendingRecovery) mode = 'blocked-recovery';
      else {
        roll = new Random(`${this.seed}:feedback-movement:${this.settings.version}:${decisionIndex}`).next();
        if (roll < this.settings.wanderProbability) mode = 'random-wander';
      }
    }
    const context: FeedbackMovementPolicyContext = { version: this.settings.version,
      mode, eligible, wanderProbability: this.settings.wanderProbability, roll, avoidedDirections };
    this.prepared.set(decisionIndex, context);
    // The current unlocked-world decision is one of the four excluded decisions.
    // Panel frames and retries do not age memory; a full-block fallback can still age out.
    if (world) for (const [direction, block] of this.blocked) {
      if (--block.remaining === 0) this.blocked.delete(direction);
    }
    return copyContext(context);
  }

  private observeResult(observation: ActorObservation): void {
    const sequence = observation.sequence;
    // Without a new sequence there is no evidence of a new applied action.
    if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0 || sequence <= this.lastObservationSequence) return;
    this.lastObservationSequence = sequence;
    const result = observation.result;
    if (!result) return;
    if (!result.accepted) return;

    if (result.actionType === 'moveDirection' && result.movement) {
      // Panels, stationary actions and rejected inputs cannot consume a pending
      // recovery. An applied directional attempt can; a fresh block renews it.
      this.pendingRecovery = false;
      const movement = result.movement, { dx, dy } = movement.actualDelta;
      if (Number.isFinite(dx) && Number.isFinite(dy)) {
        if (dx !== 0 || dy !== 0) this.lastArrival = null;
        for (const [direction, block] of this.blocked) {
          block.dx += dx; block.dy += dy;
          if (Math.hypot(block.dx, block.dy) >= this.settings.unblockDistancePx) this.blocked.delete(direction);
        }
      }
      if (movement.outcome === 'blocked' && DIRECTIONS.includes(movement.direction)) {
        this.blocked.set(movement.direction, { remaining: this.settings.blockedDirectionCooldown, dx: 0, dy: 0 });
        this.pendingRecovery = true;
      }
    } else if (result.actionType === 'walkToAnchor' || result.actionType === 'walkTo') {
      const id = result.actionType === 'walkToAnchor' ? result.anchorId : result.stationId;
      if (id) {
        // Re-selecting the last observed arrival may be stationary. A different accepted
        // arrival is the only available location-change signal for legacy walking.
        if (this.lastArrival?.type !== result.actionType || this.lastArrival.id !== id) {
          this.blocked.clear();
          this.pendingRecovery = false;
        }
        this.lastArrival = { type: result.actionType, id };
      }
    }
  }
}
