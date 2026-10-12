import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canonicalMarketReplayJson } from '../../frontend/src/game/marketReplayTrace';
import { assertDecision } from './llmPolicy';
import { buildFeedbackActorFrame, emptyFeedbackBeliefMemory, FEEDBACK_ACTOR_POLICY_VERSION, feedbackDecisionFromChoice,
  validateFeedbackBeliefMemory, carryFeedbackBeliefMemory, projectFeedbackObservation, isExperienceFeedbackPolicy, isStructuredFeedbackPolicy, type FeedbackChoiceParameters, type FeedbackActorFrame, type FeedbackBeliefMemory, type FeedbackActorPolicyVersion } from './feedbackActor';
import type { ActorObservation, Decision, Persona, TraceEntry } from './types';
import { FeedbackMovementPolicy, type FeedbackMovementPolicyOptions } from './feedbackMovementPolicy';
import { FeedbackExperience } from './feedbackExperience';

export const FEEDBACK_PLAN_MODEL = 'gpt-6-luna' as const;
export const FEEDBACK_PLAN_REASONING = 'low' as const;
export type FeedbackPlanFrame = FeedbackActorFrame & { sessionId: string; revision: number };
export type FeedbackPlanStep = { requestId: string; revision: number; choiceId: string;
  durationMs: number; reason: string; memory: FeedbackBeliefMemory; choiceParameters?: FeedbackChoiceParameters };
type AppliedResult = Omit<NonNullable<ActorObservation['result']>, 'message'>;
export type FeedbackPlanTiming = { wallMs: number; actorWaitingMs: number; applicationMs: number;
  frameBuildMs: number; plannedElapsedMs: number };
export type FeedbackPlanCompletion = { status: 'complete'; result: AppliedResult | null };
export type FeedbackPlanStepResult = { requestId: string; revision: number; acceptedActions: 1;
  executedActions: 1; result: AppliedResult | null; timing: FeedbackPlanTiming }
  & ({ nextFrame: FeedbackPlanFrame; complete: false } | { complete: true });
type StepRecord = { fingerprint: string; input: FeedbackPlanStep; promise: Promise<FeedbackPlanStepResult>;
  resolve: (result: FeedbackPlanStepResult) => void; reject: (error: Error) => void;
  dispatchedAt: number; applied: boolean; result: AppliedResult | null; before: ActorObservation; decision: Decision };
type Observer = { resolve: (value: FeedbackPlanFrame | FeedbackPlanCompletion) => void;
  reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

function failure(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}
/** Keep terminal feedback independent of the guard's hypothetical correctness verdict. */
function actionResult(observation: ActorObservation): AppliedResult | null {
  const result = observation.result;
  if (!result) return null;
  return { accepted: result.accepted, actionType: result.actionType,
    ...(result.productId === undefined ? {} : { productId: result.productId }),
    ...(result.quantity === undefined ? {} : { quantity: result.quantity }),
    ...(result.stationId === undefined ? {} : { stationId: result.stationId }),
    ...(result.anchorId === undefined ? {} : { anchorId: result.anchorId }),
    ...(result.movement === undefined ? {} : { movement: projectFeedbackObservation(observation).result!.movement }) };
}

/** One actor decision, one applied observation, then one next frame. No world or archive is forwarded. */
export class FeedbackPlanSession {
  readonly id = randomUUID();
  readonly model = FEEDBACK_PLAN_MODEL;
  readonly reasoning = FEEDBACK_PLAN_REASONING;
  private revision = 0;
  private frame: FeedbackPlanFrame | null = null;
  private memory: FeedbackBeliefMemory;
  private readonly experience: FeedbackExperience;
  private waiter: { resolve: (decision: Decision) => void; reject: (error: Error) => void } | null = null;
  private readonly observers = new Set<Observer>();
  private readonly requests = new Map<string, StepRecord>();
  private active: StepRecord | null = null;
  private stopped = false;
  private error: Error | null = null;
  private submitted = 0;
  private accepted = 0;
  private executed = 0;
  private lastResult: AppliedResult | null = null;
  private readonly startedAt = performance.now();
  private endedAt: number | null = null;
  private waitingSince: number | null = null;
  private actorWaitingMs = 0;
  private applicationMs = 0;
  private frameBuildMs = 0;
  private firstElapsedMs: number | null = null;
  private plannedElapsedMs = 0;
  private readonly movementPolicy: FeedbackMovementPolicy | null;

  constructor(private readonly seed: string | number, readonly policyVersion: FeedbackActorPolicyVersion = FEEDBACK_ACTOR_POLICY_VERSION,
    movementOptions?: FeedbackMovementPolicyOptions) {
    if (!(typeof seed === 'string' || typeof seed === 'number' && Number.isFinite(seed)))
      throw failure('Feedback plan seed must be a string or finite number', 'FEEDBACK_SEED');
    this.memory = emptyFeedbackBeliefMemory(policyVersion);
    this.experience = new FeedbackExperience({ version: policyVersion === 'feedback-choice-v7' ? 'bounded-observed-experience-v2' : 'bounded-observed-experience-v1' });
    const exploration = policyVersion === 'feedback-choice-v3' || isExperienceFeedbackPolicy(policyVersion);
    if (movementOptions !== undefined && !exploration) throw failure('feedbackMovement requires feedback-choice-v3 or feedback-choice-v4', 'FEEDBACK_MOVEMENT_POLICY');
    this.movementPolicy = exploration ? new FeedbackMovementPolicy(seed, movementOptions,
      isExperienceFeedbackPolicy(policyVersion) ? 'exploration-v2' : 'exploration-v1') : null;
  }

  private timing(): FeedbackPlanTiming {
    const now = this.endedAt ?? performance.now();
    return { wallMs: Math.max(0, now - this.startedAt),
      actorWaitingMs: this.actorWaitingMs + (this.waitingSince === null ? 0 : Math.max(0, now - this.waitingSince)),
      applicationMs: this.applicationMs, frameBuildMs: this.frameBuildMs, plannedElapsedMs: this.plannedElapsedMs };
  }

  get status() {
    return { sessionId: this.id, revision: this.revision, submittedActions: this.submitted,
      acceptedActions: this.accepted, executedActions: this.executed, waiting: Boolean(this.waiter),
      complete: this.stopped && !this.error, failed: Boolean(this.error), timing: this.timing(),
      ...(this.error ? { error: { message: this.error.message, code: (this.error as Error & { code?: string }).code } } : {}),
      timingNote: 'Actor waiting includes model, transport and caller idle time; plannedElapsedMs is the separate simulated action clock.' };
  }

  observe(): FeedbackPlanFrame | FeedbackPlanCompletion {
    if (this.error) throw this.error;
    if (this.frame) return structuredClone(this.frame);
    if (this.stopped) return { status: 'complete', result: structuredClone(this.lastResult) };
    throw failure('No feedback actor observation is waiting', 'FEEDBACK_NOT_READY');
  }

  awaitObserve(timeoutMs = 30000): Promise<FeedbackPlanFrame | FeedbackPlanCompletion> {
    if (this.error) return Promise.reject(this.error);
    if (this.frame || this.stopped) return Promise.resolve(this.observe());
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
      return Promise.reject(failure('Observation timeout must be 1..120000 milliseconds', 'FEEDBACK_TIMEOUT_VALUE'));
    return new Promise((resolve, reject) => {
      const observer: Observer = { resolve, reject, timer: setTimeout(() => {
        this.observers.delete(observer);
        reject(Object.assign(failure('Feedback observation wait timed out; retry without resubmitting a new action', 'FEEDBACK_OBSERVE_TIMEOUT'), { retryable: true }));
      }, timeoutMs) };
      this.observers.add(observer);
    });
  }

  /** Idempotency records outlive caller timeouts and are retained until the session itself is discarded. */
  step(input: FeedbackPlanStep): Promise<FeedbackPlanStepResult> {
    try {
      if (!input || typeof input.requestId !== 'string' || !input.requestId.trim() || input.requestId.length > 200)
        throw failure('A nonempty requestId of at most 200 characters is required', 'FEEDBACK_REQUEST_ID');
      const fingerprint = canonicalMarketReplayJson(input);
      const previous = this.requests.get(input.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw failure('requestId was already used with a different payload', 'FEEDBACK_REQUEST_CONFLICT');
        return previous.promise;
      }
      if (this.error) throw this.error;
      if (this.stopped) throw failure('Feedback plan session is complete', 'FEEDBACK_SESSION_CLOSED');
      this.submitted++;
      if (!Number.isInteger(input.revision) || input.revision !== this.revision)
        throw failure('Stale feedback plan revision', 'FEEDBACK_STALE_REVISION');
      if (!this.frame || !this.waiter || this.active)
        throw failure('Feedback plan session is not awaiting a decision', 'FEEDBACK_NOT_WAITING');
      if (Object.prototype.hasOwnProperty.call(input, 'delayMs'))
        throw failure('Feedback steps use durationMs for the action itself; legacy delayMs is not accepted', 'FEEDBACK_LEGACY_DELAY');
      const keys = Object.keys(input).filter(key => !(isStructuredFeedbackPolicy(this.policyVersion) && key === 'choiceParameters')).sort();
      if (canonicalMarketReplayJson(keys) !== canonicalMarketReplayJson(['choiceId', 'durationMs', 'memory', 'reason', 'requestId', 'revision']))
        throw failure('A feedback step requires exactly one choice, durationMs, reason and full replacement memory', 'FEEDBACK_STEP_SHAPE');
      const choice = this.frame.availableChoices.find(candidate => candidate.id === input.choiceId);
      if (!choice) throw failure('Choice is not available in the current feedback revision', 'FEEDBACK_CHOICE');
      const validMemory = validateFeedbackBeliefMemory(input.memory, this.policyVersion);
      if (!validMemory.valid) throw failure(validMemory.errors.join('; '), 'FEEDBACK_MEMORY');
      const decision = feedbackDecisionFromChoice(choice, input.durationMs, input.reason, input.memory, input.choiceParameters);
      if (this.frame.movementPolicy) decision.movementPolicy = structuredClone(this.frame.movementPolicy);
      assertDecision(decision, true);
      let resolve!: StepRecord['resolve'], reject!: StepRecord['reject'];
      const promise = new Promise<FeedbackPlanStepResult>((yes, no) => { resolve = yes; reject = no; });
      // An RPC disconnect must not create an unhandled rejection or erase the request record.
      void promise.catch(() => {});
      const record: StepRecord = { fingerprint, input: structuredClone(input), promise, resolve, reject,
        dispatchedAt: performance.now(), applied: false, result: null,
        before: structuredClone(this.frame.observation), decision: structuredClone(decision) };
      this.requests.set(input.requestId, record);
      this.active = record;
      this.memory = carryFeedbackBeliefMemory(this.frame.memory, input.memory, this.policyVersion);
      this.accepted++;
      this.stopActorWait();
      const waiter = this.waiter;
      this.waiter = null;
      this.frame = null;
      waiter.resolve(decision);
      return promise;
    } catch (error) { return Promise.reject(error); }
  }

  async decide(observation: ActorObservation, _history: TraceEntry[], persona: Persona,
    _activity: unknown, _state: unknown): Promise<Decision> {
    try {
      const buildStarted = performance.now();
      const actorFrame = buildFeedbackActorFrame({ observation, persona, memory: structuredClone(this.memory),
        seed: this.seed, decisionIndex: this.executed, policyVersion: this.policyVersion,
        ...(this.movementPolicy ? { movementPolicy: this.movementPolicy.prepare(observation, this.executed) } : {}),
        ...(isExperienceFeedbackPolicy(this.policyVersion) ? { experience: this.experience.snapshot(projectFeedbackObservation(observation, this.policyVersion)) } : {}) });
      this.frameBuildMs += performance.now() - buildStarted;
      return this.decideFrame(actorFrame);
    } catch (error) { this.fail(error); throw error; }
  }

  /** The simulator supplies this frame through its dedicated current-only callback boundary. */
  async decideFrame(actorFrame: FeedbackActorFrame): Promise<Decision> {
    if (this.error) throw this.error;
    if (actorFrame.policyVersion !== this.policyVersion) throw failure('Feedback frame policy differs from its session', 'FEEDBACK_POLICY_MISMATCH');
    if (this.stopped) throw failure('Feedback plan session is complete', 'FEEDBACK_SESSION_CLOSED');
    if (this.waiter || this.frame) throw failure('Another feedback decision is already waiting', 'FEEDBACK_DECISION_PENDING');
    if (this.active && !this.active.applied) {
      const error = failure('A new observation arrived before the previous action was recorded as applied', 'FEEDBACK_APPLICATION_MISSING');
      this.fail(error); throw error;
    }
    try {
      this.revision++;
      this.frame = { ...structuredClone(actorFrame), sessionId: this.id, revision: this.revision };
      this.noteElapsed(actorFrame.observation);
      const pending = new Promise<Decision>((resolve, reject) => { this.waiter = { resolve, reject }; });
      void pending.catch(() => {});
      this.waitingSince = performance.now();
      this.finishStep(this.frame);
      this.wakeObservers();
      return pending;
    } catch (error) { this.fail(error); throw error; }
  }

  /** Called for the outcome of the simulator attempt, including a legitimate rejected UI attempt. */
  recordApplied(after: ActorObservation): void {
    if (this.error) throw this.error;
    if (!this.active || this.active.applied || this.stopped)
      throw failure('No unapplied feedback decision is pending', 'FEEDBACK_APPLICATION_STATE');
    this.active.applied = true;
    if (isExperienceFeedbackPolicy(this.policyVersion))
      this.experience.record(this.active.decision, this.active.before, projectFeedbackObservation(after, this.policyVersion));
    this.active.result = actionResult(after);
    this.lastResult = structuredClone(this.active.result);
    this.executed++;
    this.applicationMs += Math.max(0, performance.now() - this.active.dispatchedAt);
    this.noteElapsed(after);
  }

  complete(): void {
    if (this.stopped) return;
    if (this.waiter || this.active && !this.active.applied) {
      this.fail(failure('Feedback plan completed before its pending decision was applied', 'FEEDBACK_UNAPPLIED_COMPLETION'));
      return;
    }
    this.stopped = true;
    this.stopActorWait();
    this.endedAt = performance.now();
    this.frame = null;
    this.finishStep(null);
    this.wakeObservers();
  }

  fail(value: unknown): void {
    if (this.stopped) return;
    this.error = value instanceof Error ? value : new Error(String(value));
    this.stopped = true;
    this.stopActorWait();
    this.endedAt = performance.now();
    this.frame = null;
    this.waiter?.reject(this.error);
    this.waiter = null;
    this.active?.reject(this.error);
    this.active = null;
    this.wakeObservers();
  }

  close(): void {
    if (!this.stopped) this.fail(failure('Feedback plan session was closed before completion', 'FEEDBACK_SESSION_CLOSED'));
  }

  private noteElapsed(observation: ActorObservation): void {
    if (observation.elapsedMs === undefined || !Number.isFinite(observation.elapsedMs)) return;
    this.firstElapsedMs ??= observation.elapsedMs;
    this.plannedElapsedMs = Math.max(this.plannedElapsedMs, observation.elapsedMs - this.firstElapsedMs);
  }
  private stopActorWait(): void {
    if (this.waitingSince !== null) this.actorWaitingMs += Math.max(0, performance.now() - this.waitingSince);
    this.waitingSince = null;
  }
  private finishStep(nextFrame: FeedbackPlanFrame | null): void {
    const record = this.active;
    if (!record || !record.applied) return;
    this.active = null;
    const result = { requestId: record.input.requestId, revision: record.input.revision,
      acceptedActions: 1 as const, executedActions: 1 as const, result: structuredClone(record.result), timing: this.timing(),
      ...(nextFrame ? { nextFrame: structuredClone(nextFrame), complete: false as const } : { complete: true as const }) };
    // The response has no references to mutable session state; retries receive this exact result.
    record.resolve(result);
  }
  private wakeObservers(): void {
    for (const observer of this.observers) {
      clearTimeout(observer.timer);
      if (this.error) observer.reject(this.error);
      else observer.resolve(this.observe());
    }
    this.observers.clear();
  }
}
