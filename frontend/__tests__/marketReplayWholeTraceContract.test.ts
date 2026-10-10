import { marketReplayTraceId, validateMarketReplayTrace, type MarketReplayTrace } from '../src/game/marketReplayTrace';

type Generation = NonNullable<MarketReplayTrace['generation']>;
const actorIdentity = (policyVersion: string) => ({ learnerId: 'learner-fixture', memberId: 'member-fixture',
  personaId: 'persona-fixture', personaVersion: '6', experimentId: 'experiment-fixture', arm: 'A' as const,
  model: 'gpt-6-luna', policyVersion, reasoningEffort: 'low' as const });

function fixture(version: 'whole-trace-v1' | 'whole-trace-v2' | 'whole-trace-v3' = 'whole-trace-v2'): MarketReplayTrace {
  const body: Omit<MarketReplayTrace, 'traceId'> = {
    traceSchemaVersion: '2', personaId: 'persona-fixture', personaVersion: '6', seed: 'whole-contract-fixture',
    generationPolicy: 'llm', policyVersion: '6', target: { snapshotId: 'snapshot-fixture', completionMode: 'ai-review' },
    generation: { model: 'gpt-6-luna', reproducibility: 'captured-trace', actorPolicyVersion: version,
      reasoningEffort: 'low', planningMode: 'whole-trace', observationScope: 'whole-world',
      ...(version !== 'whole-trace-v1' ? { actorKnowledgeScope: 'observed-and-remembered' as const } : {}),
      ...(version === 'whole-trace-v3' ? { actorStateVersion: '1' as const, timingProfile: 'actor-preserved-v1' as const } : {}),
      planningSubmissions: 1, repairSubmissions: 0, learnerIdentity: actorIdentity(version) },
    steps: ['start', 'giveUp', 'skipRating', 'leave'].map((type, index) => ({
      id: `s${index}`, type: type as 'start' | 'giveUp' | 'skipRating' | 'leave',
      reactionDelayMs: 100, timeoutMs: 1000, reason: 'Shared metadata contract fixture, no real game execution',
    })),
  };
  return { ...body, traceId: marketReplayTraceId(body) };
}
function validate(trace: MarketReplayTrace) {
  trace.traceId = marketReplayTraceId(trace);
  return validateMarketReplayTrace(trace);
}

test('whole-trace-v2 declares whole-world model input and separate observed-and-remembered actor knowledge', () => {
  const trace = fixture();
  expect(validateMarketReplayTrace(trace)).toEqual({ valid: true, errors: [] });
  expect(trace.generation).toMatchObject({ actorPolicyVersion: 'whole-trace-v2', observationScope: 'whole-world',
    actorKnowledgeScope: 'observed-and-remembered' });
});

test('whole-trace-v3 declares actor state provenance and preserved timing alongside whole-world input and actor knowledge', () => {
  const trace = fixture('whole-trace-v3');
  expect(validateMarketReplayTrace(trace)).toEqual({ valid: true, errors: [] });
  expect(trace.generation).toMatchObject({ actorPolicyVersion: 'whole-trace-v3', planningMode: 'whole-trace',
    observationScope: 'whole-world', actorKnowledgeScope: 'observed-and-remembered',
    actorStateVersion: '1', timingProfile: 'actor-preserved-v1' });
});

test.each(['actorKnowledgeScope', 'actorStateVersion', 'timingProfile'] as const)(
  'whole-trace-v3 requires explicit %s metadata', field => {
    const trace = fixture('whole-trace-v3');
    delete trace.generation![field];
    expect(validate(trace)).toMatchObject({ valid: false, errors: expect.arrayContaining([
      expect.stringContaining(field === 'actorKnowledgeScope' ? 'observed-and-remembered'
        : field === 'actorStateVersion' ? 'actorStateVersion 1' : 'actor-preserved-v1 timing'),
    ]) });
  });

test('whole-trace-v3 cannot claim compact timing, an unsupported state version or a narrower model input', () => {
  const compact = fixture('whole-trace-v3');
  compact.generation!.timingProfile = 'compact-v1';
  expect(validate(compact)).toMatchObject({ valid: false, errors: expect.arrayContaining([
    'Whole-trace-v3 requires actor-preserved-v1 timing.',
  ]) });
  const unsupported = fixture('whole-trace-v3');
  unsupported.generation!.actorStateVersion = '2' as Generation['actorStateVersion'];
  expect(validate(unsupported).valid).toBe(false);
  const dishonest = fixture('whole-trace-v3');
  dishonest.generation!.observationScope = 'actor-visible' as Generation['observationScope'];
  expect(validate(dishonest).valid).toBe(false);
  const missingInput = fixture('whole-trace-v3');
  delete missingInput.generation!.observationScope;
  expect(validate(missingInput)).toMatchObject({ valid: false, errors: expect.arrayContaining([
    expect.stringContaining('explicit whole-world scope'),
  ]) });
});

test('saved whole-trace-v1 metadata remains valid without pretending it used the new knowledge boundary', () => {
  const legacy = fixture('whole-trace-v1');
  expect(validateMarketReplayTrace(legacy)).toEqual({ valid: true, errors: [] });
  expect(legacy.generation?.actorKnowledgeScope).toBeUndefined();
  legacy.generation!.actorKnowledgeScope = 'observed-and-remembered';
  expect(validate(legacy)).toMatchObject({ valid: false, errors: expect.arrayContaining([
    expect.stringContaining('Legacy whole-trace-v1 cannot claim'),
  ]) });
});

test.each(['whole-trace-v1', 'whole-trace-v2'] as const)(
  'saved %s compact timing stays valid and carries no new actor state claim', version => {
    const trace = fixture(version);
    trace.generation!.timingProfile = 'compact-v1';
    expect(validate(trace)).toEqual({ valid: true, errors: [] });
    expect(trace.generation?.actorStateVersion).toBeUndefined();
  });

test.each(['whole-trace-v1', 'whole-trace-v2', 'episodic-choice-v10', undefined] as const)(
  'policy %s cannot claim whole-trace-v3 actor state or timing metadata', policy => {
    const legacy = policy === 'whole-trace-v1' || policy === 'whole-trace-v2' ? fixture(policy) : fixture();
    if (policy === 'episodic-choice-v10' || policy === undefined)
      legacy.generation = { model: 'gpt-6-luna', reproducibility: 'captured-trace',
        ...(policy ? { actorPolicyVersion: policy } : {}) };
    expect(validate(legacy)).toEqual({ valid: true, errors: [] });
    const stateClaim = structuredClone(legacy);
    stateClaim.generation!.actorStateVersion = '1';
    expect(validate(stateClaim)).toMatchObject({ valid: false, errors: expect.arrayContaining([
      'Actor state metadata requires the whole-trace-v3 policy.',
    ]) });
    const timingClaim = structuredClone(legacy);
    timingClaim.generation!.timingProfile = 'actor-preserved-v1';
    expect(validate(timingClaim)).toMatchObject({ valid: false, errors: expect.arrayContaining([
      'Actor-preserved timing requires the whole-trace-v3 policy.',
    ]) });
  });

test('whole-trace-v2 cannot omit the knowledge scope or claim a screen-only model input', () => {
  const missing = fixture();
  delete missing.generation!.actorKnowledgeScope;
  expect(validate(missing)).toMatchObject({ valid: false, errors: expect.arrayContaining([
    expect.stringContaining('requires explicit observed-and-remembered'),
  ]) });
  const dishonestInput = fixture();
  dishonestInput.generation!.observationScope = 'actor-visible' as Generation['observationScope'];
  expect(validate(dishonestInput).valid).toBe(false);
});

test('knowledge scope cannot be attached to an incremental policy or standalone generation metadata', () => {
  const trace = fixture();
  trace.generation!.actorPolicyVersion = 'episodic-choice-v10';
  trace.generation!.learnerIdentity = actorIdentity('episodic-choice-v10');
  delete trace.generation!.planningMode;
  delete trace.generation!.observationScope;
  delete trace.generation!.planningSubmissions;
  delete trace.generation!.repairSubmissions;
  expect(validate(trace).valid).toBe(false);
  delete trace.generation!.actorKnowledgeScope;
  expect(validate(trace)).toEqual({ valid: true, errors: [] });
  trace.generation!.actorKnowledgeScope = 'observed-and-remembered';
  delete trace.generation!.actorPolicyVersion;
  delete trace.generation!.learnerIdentity;
  expect(validate(trace).valid).toBe(false);
});

test.each(['whole-trace-v1', 'episodic-choice-v10'])('learner policy %s cannot be mixed into a v2 generation', policyVersion => {
  const trace = fixture();
  trace.generation!.learnerIdentity!.policyVersion = policyVersion;
  expect(validate(trace)).toMatchObject({ valid: false, errors: expect.arrayContaining([
    'Learner policyVersion must match the generation actorPolicyVersion.',
  ]) });
});

test('whole-trace-v3 requires its own learner policy and cannot appear only in learner identity', () => {
  const mixed = fixture('whole-trace-v3');
  mixed.generation!.learnerIdentity!.policyVersion = 'whole-trace-v2';
  expect(validate(mixed)).toMatchObject({ valid: false, errors: expect.arrayContaining([
    'Learner policyVersion must match the generation actorPolicyVersion.',
  ]) });
  const standalone = fixture('whole-trace-v3');
  standalone.generation = { model: 'gpt-6-luna', reproducibility: 'captured-trace',
    learnerIdentity: actorIdentity('whole-trace-v3') };
  expect(validate(standalone)).toMatchObject({ valid: false, errors: expect.arrayContaining([
    'A whole-trace learner requires explicit whole-trace planning metadata.',
  ]) });
});

test('unrelated saved incremental metadata retains its existing replay compatibility', () => {
  const trace = fixture();
  trace.generation = { model: 'gpt-6-luna', reproducibility: 'captured-trace', actorPolicyVersion: 'episodic-choice-v10',
    reasoningEffort: 'low', learnerIdentity: actorIdentity('episodic-choice-v9') };
  // Current learner creation validates identity separately. A new whole-trace
  // contract must not retroactively change legacy incremental replay checks.
  expect(validate(trace)).toEqual({ valid: true, errors: [] });
});

test.each(['whole-trace-v1', 'whole-trace-v2', 'whole-trace-v3'] as const)('%s supports the unchanged-basket system checkout at 100 actor actions', version => {
  const trace = fixture(version);
  const intents = [
    { type: 'start' as const },
    ...Array.from({ length: 100 }, () => ({ type: 'pause' as const, durationMs: 100 })),
    { type: 'checkout' as const, checkoutId: 'checkout' as const },
    { type: 'submitForReview' as const }, { type: 'awaitReviewAccepted' as const }, { type: 'leave' as const },
  ];
  trace.steps = intents.map((step, index) => ({ ...step, id: `s${index}`, reactionDelayMs: 100,
    timeoutMs: 1000, reason: 'Unchanged basket completion metadata fixture' }));
  trace.generation!.systemCompletion = { reason: 'action-limit', afterDecisions: 100, actionLimit: 100,
    firstStepId: 's101', checkoutId: 'checkout', cartAtStart: {} };
  expect(validate(trace)).toEqual({ valid: true, errors: [] });
});

test('actor-preserved timing metadata keeps captured reaction and dwell times without adding actor state to app steps', () => {
  const trace = fixture('whole-trace-v3');
  trace.steps.splice(1, 0, { id: 'list', type: 'readList', reactionDelayMs: 2900,
    timeoutMs: 10000, durationMs: 4200, reason: 'Read the displayed list at the actor-selected pace' },
  { id: 'wait', type: 'pause', reactionDelayMs: 1800, timeoutMs: 10000,
    durationMs: 3200, reason: 'Pause before the next available activity' });
  const captured = structuredClone(trace.steps);
  expect(validate(trace)).toEqual({ valid: true, errors: [] });
  expect(trace.steps).toEqual(captured);
  expect(trace.generation!.sourceTraceId).toBeUndefined();
  Object.assign(trace.steps[1], { actorState: { focus: 'read-goal' } });
  expect(validate(trace)).toMatchObject({ valid: false, errors: expect.arrayContaining([
    expect.stringContaining('must match one supported intention shape'),
  ]) });
});
