'use strict';
require('../runtime.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const source = require('../personas/research-learning-minjae-v2.json');
const { getPersona, listPersonas, assertPersonaLearningAllowed, assertNumericPersona,
  getWholeTracePersona } = require('../src/personas.ts');
const { buildFeedbackActorFrame, emptyFeedbackBeliefMemory, isExperienceFeedbackPolicy } = require('../src/feedbackActor.ts');
const { FeedbackExperience } = require('../src/feedbackExperience.ts');
const { ActorPlanSession } = require('../src/actorPlanSession.ts');
const { createLearner, readLearner, getLearnerExperience, recordLearnerRound } = require('../learner-store.cjs');
const { createService } = require('../server.cjs');
const { generateTrace, projectDecision } = require('../src/simulator.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');

// Synthetic empty screens only; these are registry/contract checks, not app plays.
const observation = sequence => ({ schemaVersion: 'attention-observation-v1', sequence, elapsedMs: sequence,
  phase: 'shopping', view: 'world', activeStation: null, listAvailable: true,
  visibleStations: [], anchors: [], products: [], shelf: null, cart: null, cashiers: {}, lastActionError: null });
const originalArrays = ['strengths', 'initialSupportNeeds', 'preferences', 'learningInstructions'];
function assertOriginal(persona) {
  for (const key of Object.keys(source)) assert.deepEqual(persona[key], source[key], key);
  for (const key of ['parameters', 'attention', 'shoppingStyle', 'character', 'traitProfile', 'memory', 'experience'])
    assert.equal(Object.hasOwn(persona, key), false, `${key} must not be synthesized or imported`);
}

test('Minjae is available only by explicit original identity and the ordinary three-person list is unchanged', async t => {
  assert.deepEqual(listPersonas().map(p => p.id), [
    'mild-intellectual-disability-adult', 'careful-checker', 'quick-decider',
  ]);
  assertOriginal(getPersona(source.id));
  const changed = getPersona(source.id);
  changed.strengths[0] = 'caller mutation';
  changed.initialSupportNeeds.push('caller mutation');
  assertOriginal(getPersona(source.id));
  assert.throws(() => getPersona('민재'), /Unknown persona/);
  assert.throws(() => getPersona('adult-minjae-unit-support-research-v1'), /Unknown persona/);
  const service = createService();
  t.after(() => service.close());
  assert.deepEqual((await service.invokeTool('list_personas')).personas.map(p => p.id), listPersonas().map(p => p.id));
});

test('every feedback policy preserves the source arrays in successive independent actor frames', () => {
  for (let version = 1; version <= 7; version++) {
    const policyVersion = `feedback-choice-v${version}`;
    const persona = getPersona(source.id);
    for (let decisionIndex = 0; decisionIndex < 2; decisionIndex++) {
      const current = observation(decisionIndex);
      const memory = emptyFeedbackBeliefMemory(policyVersion);
      memory.rememberedItems.push({ name: '틀릴 수 있는 개인 기억', quantity: 99, certainty: 'clear', status: 'done' });
      const frame = buildFeedbackActorFrame({ persona, observation: current, memory, policyVersion,
        seed: 'research-registry-contract', decisionIndex,
        ...(version >= 3 ? { movementPolicy: { version: version === 3 ? 'exploration-v1' : 'exploration-v2',
          mode: 'actor-choice', eligible: true, wanderProbability: .2, roll: .6, avoidedDirections: [] } } : {}),
        ...(isExperienceFeedbackPolicy(policyVersion) ? { experience: new FeedbackExperience({
          version: version === 7 ? 'bounded-observed-experience-v2' : 'bounded-observed-experience-v1',
        }).snapshot(current) } : {}),
      });
      assertOriginal(frame.persona);
      assert.equal(Object.hasOwn(frame.persona, 'timingBaseline'), false);
      for (const key of originalArrays) for (const instruction of source[key])
        assert.ok(frame.persona.individualInstructions.includes(instruction));
      assert.deepEqual(frame.memory, memory, 'registry projection does not correct authored beliefs');
      frame.persona.learningInstructions[0] = 'frame mutation';
      assertOriginal(persona);
    }
  }
});

test('direct actor-plan projection also retains the original research profile', async t => {
  const session = new ActorPlanSession();
  t.after(() => session.complete());
  const persona = getPersona(source.id);
  const pending = session.decide(observation(0), [], persona, {}, {});
  const frame = session.observe();
  assertOriginal(frame.persona);
  const choice = frame.availableChoices.find(item => item.action.type === 'giveUp');
  assert.ok(choice);
  session.append({ revision: frame.revision, choiceIds: [choice.id], delayMs: [1], reasons: ['contract fixture'] });
  assert.equal((await pending).action.type, 'giveUp');
  session.complete();
});

test('a new Minjae learner has the exact identity and no imported prior rounds or experience', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-research-registry-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.doesNotThrow(() => assertPersonaLearningAllowed(source.id));
  const service = createService();
  t.after(() => service.close());
  const created = await service.invokeTool('create_luna_learner', { directory, learnerId: 'minjae-contract',
    memberId: 'synthetic-member', personaId: source.id, experimentId: 'registry-contract', arm: 'A' });
  const state = readLearner(created.learnerFile);
  assert.equal(state.identity.personaId, source.id);
  assert.equal(state.identity.personaVersion, source.version);
  assert.deepEqual(state.rounds, []);
  assert.equal(getLearnerExperience(created.learnerFile, state.identity), undefined);
  assert.throws(() => createLearner({ directory, identity: state.identity }), /EEXIST/);
});

test('stochastic, remote-provider and whole-trace policies reject Minjae without borrowing another configuration', async () => {
  assert.throws(() => assertNumericPersona(getPersona(source.id)), /requires direct MCP actor control/);
  assert.throws(() => getWholeTracePersona(source.id), /requires direct MCP actor control/);
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'research-registry-contract' }));
  for (const mode of ['stochastic', 'llm']) await assert.rejects(generateTrace({
    personaId: source.id, seed: 'contract', snapshot, mode, llm: { model: 'synthetic-provider' },
  }), /requires direct MCP actor control/);
});

test('research motor projection preserves the chosen target and quantity without persona settings or motor sampling', () => {
  const persona = getPersona(source.id);
  const motor = { between() { throw new Error('Research motor projection must not sample a persona distribution'); } };
  const walk = projectDecision({ action: { type: 'walkToAnchor', anchorId: 'synthetic-visible-anchor' },
    delayMs: 731, reason: 'synthetic fixture' }, {}, persona, {}, 'contract', 0, motor);
  assert.deepEqual(walk.target, { anchorId: 'synthetic-visible-anchor' });
  assert.equal(walk.movement.speedMultiplier, 1);
  assert.equal(walk.movement.accelerationMs, 220);
  const drag = projectDecision({ action: { type: 'add', productId: 'synthetic-visible-product', quantity: 3 },
    delayMs: 731, reason: 'pause-before-next-step' }, {}, persona, {}, 'contract', 1, motor);
  assert.equal(drag.productId, 'synthetic-visible-product');
  assert.equal(drag.quantity, 3);
  assert.equal(drag.gesture.durationMs, 450);
  assert.equal(drag.gesture.hesitationMs, 0);
  assertOriginal(persona);
});

test('MCP v10 planning and recordLearnerRound retain Minjae identity through a fresh and a remembered round', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-research-plan-contract-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const service = createService();
  t.after(() => service.close());
  const { learnerFile } = await service.invokeTool('create_luna_learner', { directory, learnerId: 'minjae-v10',
    memberId: 'synthetic-member', personaId: source.id, experimentId: 'v10-registry-contract', arm: 'A' });
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'minjae-v10-contract' }));
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (let round = 0; round < 2; round++) {
    const outputPath = path.join(directory, `round-${round}.trace.json`);
    const began = await service.invokeTool('begin_actor_plan', { personaId: source.id, seed: `contract-${round}`,
      snapshot, learnerFile, outputPath, timingProfile: 'original' });
    for (const actionType of ['readList', 'giveUp']) {
      const frame = await service.invokeTool('observe_actor_plan', { sessionId: began.sessionId });
      assertOriginal(frame.persona);
      if (round === 0) assert.deepEqual(frame.experience.previousExecutedExperience, []);
      else assert.ok(frame.experience.previousExecutedExperience.length > 0);
      const choice = frame.availableChoices.find(item => item.action.type === actionType);
      assert.ok(choice, actionType);
      await service.invokeTool('append_actor_plan', { sessionId: began.sessionId, revision: frame.revision,
        choiceIds: [choice.id], delayMs: [731], reasons: ['synthetic contract fixture'] });
    }
    assert.equal((await service.invokeTool('observe_actor_plan', { sessionId: began.sessionId })).status, 'complete');
    await service.invokeTool('finalize_actor_plan', { sessionId: began.sessionId });
    const trace = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(trace.personaId, source.id);
    assert.equal(trace.personaVersion, source.version);
    assert.equal(trace.generation.actorPolicyVersion, 'episodic-choice-v10');
    assert.equal(trace.steps.find(step => step.type === 'readList').reactionDelayMs, 731);
    assert.equal(trace.steps.find(step => step.type === 'giveUp').reactionDelayMs, 731);
    // Deliberately synthetic evidence exercises storage contracts only. No UI,
    // database or actual playback has taken place in this registry test.
    const replay = { replayId: `synthetic-replay-${round}`, sessionId: `synthetic-session-${round}`,
      memberId: 'synthetic-member', traceId: trace.traceId, traceHash: hash(trace), snapshotId: snapshot.snapshotId,
      status: 'completed', report: { acknowledged: true, completedSteps: trace.steps.map(step => ({ id: step.id, type: step.type })),
        displacementViolations: 0, inputViolations: 0 } };
    const receipt = { sessionId: replay.sessionId, memberId: replay.memberId, eventCount: 100,
      firstSequence: 1, lastSequence: 100, uniqueSequences: 100, uniqueClientEvents: 100, endEvents: 1, timeReversals: 0 };
    const saved = recordLearnerRound({ learnerFile, trace, snapshot, replay, receipt });
    assert.equal(saved.state.identity.personaId, source.id);
    assert.equal(saved.state.rounds.length, round + 1);
    assert.equal(saved.experience.learning.personaId, source.id);
    assert.equal(saved.experience.learning.personaVersion, source.version);
    assert.throws(() => getLearnerExperience(learnerFile, {
      ...saved.state.identity, personaId: 'mild-intellectual-disability-adult',
    }), /personaId/);
  }
});
