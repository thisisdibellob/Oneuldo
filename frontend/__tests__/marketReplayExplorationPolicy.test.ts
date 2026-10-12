import {
  marketReplayTraceId, validateMarketReplayTrace, type MarketReplayTrace,
  type MarketReplayMovementPolicyDecision,
} from '../src/game/marketReplayTrace';

const provenance = (overrides: Partial<MarketReplayMovementPolicyDecision> = {}): MarketReplayMovementPolicyDecision => ({
  version: 'exploration-v1', mode: 'actor-choice', eligible: true, wanderProbability: .25,
  roll: .75, avoidedDirections: ['south'], ...overrides,
});
const base = (id: string) => ({ id, reactionDelayMs: 0, timeoutMs: 10000, reason: 'observed action' });
function traceFor(policy = provenance()): MarketReplayTrace {
  return seal({
    traceSchemaVersion: '2', traceId: '', personaId: 'mild-intellectual-disability-adult', personaVersion: '5',
    seed: 'exploration-policy-test', generationPolicy: 'llm', policyVersion: '6', experienceMode: 'first-play',
    generation: { model: 'gpt-6-luna', reproducibility: 'captured-trace', actorPolicyVersion: 'feedback-choice-v3',
      timingProfile: 'activity-duration-v2', movementContract: 'joystick-direction-v1',
      movementPolicy: { version: 'exploration-v1', wanderProbability: policy.wanderProbability,
        blockedDirectionCooldown: 4, unblockDistancePx: 24 },
      feedback: { version: '1', observationScope: 'current-screen', memory: 'actor-authored', contextDelivery: 'external-frame', decisions: 2 } },
    target: { snapshotId: 'snapshot-test', completionMode: 'ai-review' },
    steps: [
      { ...base('start'), type: 'start' },
      { ...base('move'), type: 'moveDirection', direction: 'north', durationMs: 1000,
        movement: { speedMultiplier: .8, accelerationMs: 180 }, movementPolicy: policy },
      { ...base('give-up'), type: 'giveUp', movementPolicy: provenance({ eligible: false, roll: null, wanderProbability: policy.wanderProbability }) },
      { ...base('skip'), type: 'skipRating' }, { ...base('leave'), type: 'leave' },
    ],
  });
}
function seal(trace: MarketReplayTrace) { trace.traceId = marketReplayTraceId(trace); return trace; }
const validate = (trace: MarketReplayTrace) => validateMarketReplayTrace(seal(trace));

test.each([
  provenance(),
  provenance({ mode: 'random-wander', roll: .1 }),
  provenance({ mode: 'blocked-recovery', roll: null }),
  provenance({ eligible: false, roll: null }),
  provenance({ wanderProbability: 0, roll: 0 }),
  provenance({ wanderProbability: 1, mode: 'random-wander', roll: .999 }),
])('v3 preserves valid $mode provenance at probability $wanderProbability', policy => {
  expect(validate(traceFor(policy))).toEqual({ valid: true, errors: [] });
});

test('saved v2 directional traces and v1 activity traces need no exploration metadata', () => {
  const v2 = traceFor(); v2.generation!.actorPolicyVersion = 'feedback-choice-v2'; delete v2.generation!.movementPolicy;
  for (const step of v2.steps) delete step.movementPolicy;
  expect(validate(v2)).toEqual({ valid: true, errors: [] });
  const v1 = structuredClone(v2); v1.generation!.actorPolicyVersion = 'feedback-choice-v1';
  v1.generation!.timingProfile = 'activity-duration-v1'; delete v1.generation!.movementContract;
  v1.steps[1] = { ...base('pause'), type: 'pause', durationMs: 1000 };
  expect(validate(v1)).toEqual({ valid: true, errors: [] });
});

test.each(['feedback-choice-v1', 'feedback-choice-v2'] as const)('%s cannot acquire exploration provenance retroactively', actorPolicyVersion => {
  const trace = traceFor(); trace.generation!.actorPolicyVersion = actorPolicyVersion;
  if (actorPolicyVersion === 'feedback-choice-v1') {
    trace.generation!.timingProfile = 'activity-duration-v1'; delete trace.generation!.movementContract;
    trace.steps[1] = { ...base('pause'), type: 'pause', durationMs: 1000, movementPolicy: provenance() };
  }
  expect(validate(trace).errors).toContain('Exploration movement policy metadata requires feedback-choice-v3 or feedback-choice-v4.');
  delete trace.generation!.movementPolicy;
  expect(validate(trace).errors).toContain('Exploration movement policy metadata requires feedback-choice-v3 or feedback-choice-v4.');
});

test('v3 requires explicit configuration, shared movement contract and provenance for every directional step', () => {
  const missingConfig = traceFor(); delete missingConfig.generation!.movementPolicy;
  expect(validate(missingConfig).valid).toBe(false);
  const missingStep = traceFor(); delete missingStep.steps[1].movementPolicy;
  expect(validate(missingStep).errors).toContain('move: directional movement requires exploration policy provenance.');
  const missingMovement = traceFor(); delete missingMovement.generation!.movementContract;
  expect(validate(missingMovement).valid).toBe(false);
  const oldTiming = traceFor(); oldTiming.generation!.timingProfile = 'activity-duration-v1';
  expect(validate(oldTiming).valid).toBe(false);
});

test('every nonmovement actor step also requires provenance while system steps remain unannotated', () => {
  const trace = traceFor();
  trace.steps[1] = { ...base('pause'), type: 'pause', durationMs: 1000, movementPolicy: provenance() };
  expect(validate(trace)).toEqual({ valid: true, errors: [] });
  const missingPause = structuredClone(trace); delete missingPause.steps[1].movementPolicy;
  expect(validate(missingPause).errors).toContain('pause: actor steps require exploration policy provenance.');
  const missingGiveUp = structuredClone(trace); delete missingGiveUp.steps[2].movementPolicy;
  expect(validate(missingGiveUp).errors).toContain('give-up: actor steps require exploration policy provenance.');
  for (const step of trace.steps.filter(step => ['start', 'skipRating', 'leave'].includes(step.type)))
    expect(step.movementPolicy).toBeUndefined();
});

test.each([1, 3, 100])('recorded decision count %s cannot disagree with the number of policy decisions', decisions => {
  const trace = traceFor(); trace.generation!.feedback!.decisions = decisions;
  expect(validate(trace).errors).toContain('Exploration policy provenance count must match the recorded feedback decision count.');
});

test.each([-1, 1.01, NaN, Infinity])('probability %s cannot be recorded as valid exploration configuration', wanderProbability => {
  const trace = traceFor(); trace.generation!.movementPolicy!.wanderProbability = wanderProbability;
  expect(validate(trace).valid).toBe(false);
  const stepOnly = traceFor(); stepOnly.steps[1].movementPolicy!.wanderProbability = wanderProbability;
  expect(validate(stepOnly).valid).toBe(false);
});

test.each([
  { blockedDirectionCooldown: 5 }, { unblockDistancePx: 25 }, { version: 'exploration-v2' },
  { target: { stationId: 'fresh' } }, { wanderProbability: '0.25' },
])('generation policy rejects altered contract fields %j', changes => {
  const trace = traceFor(); Object.assign(trace.generation!.movementPolicy!, changes);
  expect(validate(trace).valid).toBe(false);
});

test.each([
  { mode: 'random-wander', roll: .25 }, { mode: 'random-wander', roll: null },
  { mode: 'random-wander', eligible: false, roll: .1 },
  { mode: 'actor-choice', roll: .1 }, { mode: 'actor-choice', roll: null },
  { mode: 'actor-choice', eligible: false, roll: .75 },
  { mode: 'blocked-recovery', roll: .1 }, { mode: 'blocked-recovery', eligible: false, roll: null },
  { roll: 1 }, { roll: -0.1 }, { roll: '0.75' }, { roll: {} },
  { eligible: 'true' }, { mode: 'goal-route' }, { wanderProbability: .5 },
  { avoidedDirections: ['south', 'south'] }, { avoidedDirections: ['fresh'] },
  { avoidedDirections: ['north'] }, { avoidedDirections: Array(9).fill('south') },
  { target: { stationId: 'fresh' } },
])('forged or contradictory step provenance is rejected: %j', changes => {
  const trace = traceFor(); Object.assign(trace.steps[1].movementPolicy!, changes);
  expect(validate(trace).valid).toBe(false);
});

test.each(['random-wander', 'blocked-recovery'] as const)('%s cannot be attached to a nonmovement action', mode => {
  const trace = traceFor(provenance({ mode, roll: mode === 'random-wander' ? .1 : null }));
  trace.steps[1] = { ...base('pause'), type: 'pause', durationMs: 1000, movementPolicy: trace.steps[1].movementPolicy };
  expect(validate(trace).errors).toContain('pause: automatic movement policy modes require a directional movement step.');
});

test.each(['start', 'awaitReviewAccepted', 'skipRating', 'leave'] as const)('%s is a system step and cannot claim an actor exploration decision', type => {
  const trace = traceFor();
  if (type === 'awaitReviewAccepted') {
    trace.steps[2] = { ...base('submit'), type: 'submitForReview', movementPolicy: provenance({ eligible: false, roll: null }) };
    trace.steps[3] = { ...base(type), type };
  }
  trace.steps.find(step => step.type === type)!.movementPolicy = provenance({ eligible: false, roll: null });
  expect(validate(trace).errors.some(error => error.includes('system steps cannot carry actor movement policy provenance'))).toBe(true);
});

test('every provenance field is required even when the policy is inactive', () => {
  for (const key of Object.keys(provenance())) {
    const trace = traceFor(provenance({ eligible: false, roll: null }));
    delete (trace.steps[1].movementPolicy as unknown as Record<string, unknown>)[key];
    expect(validate(trace).valid).toBe(false);
  }
});

function experienceTrace(policy = provenance({ version: 'exploration-v2' })): MarketReplayTrace {
  const trace = traceFor(policy);
  trace.generation!.actorPolicyVersion = 'feedback-choice-v4';
  trace.generation!.movementPolicy!.version = 'exploration-v2';
  trace.generation!.feedback = { version: '2', observationScope: 'current-screen',
    memory: 'actor-authored-with-recent-experience', contextDelivery: 'external-frame', decisions: 2,
    experienceContract: 'bounded-observed-experience-v1', intentContract: 'persistent-intent-v1' };
  for (const step of trace.steps) if (step.movementPolicy) step.movementPolicy.version = 'exploration-v2';
  return trace;
}

test.each(['random-wander', 'blocked-recovery'] as const)('v4 %s preserves checks, pauses, nearby interactions and stopping', mode => {
  const policy = provenance({ version: 'exploration-v2', mode, roll: mode === 'random-wander' ? .1 : null });
  for (const action of [
    { type: 'pause', durationMs: 1000 }, { type: 'lookAround', durationMs: 1000 },
    { type: 'readList', durationMs: 1000 }, { type: 'viewCart', durationMs: 1000 },
    { type: 'openShelf', stationId: 'drink' },
  ] as const) {
    const trace = experienceTrace(policy);
    trace.steps[1] = { ...base('interaction'), ...action, movementPolicy: policy };
    expect(validate(trace)).toEqual({ valid: true, errors: [] });
  }
  const stopped = experienceTrace(policy);
  stopped.steps.splice(1, 1);
  stopped.steps[1].movementPolicy = policy;
  stopped.generation!.feedback!.decisions = 1;
  expect(validate(stopped)).toEqual({ valid: true, errors: [] });
});

test('v4 still rejects an avoided direction even when nonmovement controls are retained', () => {
  const trace = experienceTrace(provenance({ version: 'exploration-v2', mode: 'random-wander', roll: .1,
    avoidedDirections: ['north'] }));
  expect(validate(trace).errors).toContain('move: selected movement direction is currently avoided.');
});

test('v4 experience and intent contracts cannot be omitted, mixed or retroactively attached to older feedback', () => {
  const valid = experienceTrace();
  expect(validate(valid)).toEqual({ valid: true, errors: [] });
  for (const key of ['experienceContract', 'intentContract', 'memory', 'version']) {
    const missing = structuredClone(valid);
    delete (missing.generation!.feedback as unknown as Record<string, unknown>)[key];
    expect(validate(missing).valid).toBe(false);
  }
  const oldBeliefs = structuredClone(valid);
  oldBeliefs.generation!.feedback = traceFor().generation!.feedback;
  expect(validate(oldBeliefs).valid).toBe(false);
  for (const actorPolicyVersion of ['feedback-choice-v1', 'feedback-choice-v2', 'feedback-choice-v3'] as const) {
    const legacy = traceFor();
    legacy.generation!.actorPolicyVersion = actorPolicyVersion;
    legacy.generation!.feedback = valid.generation!.feedback;
    expect(validate(legacy).valid).toBe(false);
  }
  const oldMovement = structuredClone(valid); oldMovement.generation!.movementPolicy!.version = 'exploration-v1';
  expect(validate(oldMovement).valid).toBe(false);
  const oldStep = structuredClone(valid); oldStep.steps[1].movementPolicy!.version = 'exploration-v1';
  expect(validate(oldStep).errors).toContain('move: movement policy version must match its actor policy contract.');
  const forgedLegacy = traceFor(); forgedLegacy.steps[1].movementPolicy!.version = 'exploration-v2';
  expect(validate(forgedLegacy).valid).toBe(false);
});
