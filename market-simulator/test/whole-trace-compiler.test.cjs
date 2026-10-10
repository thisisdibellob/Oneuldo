const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, isMarketReplaySystemCompletionStep } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketStationApproachPoint } = require('../../frontend/src/game/marketEnvironment.ts');
const { getReplayShelfPage } = require('../../frontend/src/game/marketReplayPerception.ts');
const { buildWholeTraceBundle } = require('../src/wholeTraceBundle.ts');
const { compileWholeTraceCandidate, WholeTraceCompileError } = require('../src/wholeTraceCompiler.ts');
const { validateWholeTraceCandidate } = require('../src/wholeTraceContracts.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { getPersona } = require('../src/personas.ts');
function fixture(personaId = 'mild-intellectual-disability-adult', near, cashierCount = 2) {
  const config = { seed: 'whole-compiler-fixture', stockPerProduct: 5, environment: { cashierCount } };
  const environment = structuredClone(createMarketSession(config).environment);
  if (near) environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment));
  const settings = { snapshot, personaId, seed: 'whole-candidate-fixture', timingProfile: 'original', maxActions: 100, llm: { model: 'gpt-6-luna', maxCalls: 1 } };
  return { settings, bundle: buildWholeTraceBundle(settings, 'compiler-request') };
}
const d = (action, cueRefs, intent = 'check') => ({ action, delayMs: 450,
  reason: '현재 화면에서 확인한 단서로 동작 계약을 검증한다', basis: { intent, cueRefs }, actorState: {
    activity: { explore: 'orient', task: 'shop', help: 'check' }[intent] ?? intent,
    task: '현재 화면의 단서로 동작 계약을 검증한다', heldGoalIds: [], uncertainGoalIds: [],
    orientation: 'unfamiliar', triggerCueRefs: [...cueRefs],
  } });
const candidate = (...decisions) => ({ candidateVersion: '3', requestId: 'compiler-request', decisions });
const readList = () => d({ type: 'readList' }, ['list']);
const pause = () => d({ type: 'pause' }, ['phase:shopping'], 'rest');
const quit = () => d({ type: 'giveUp' }, ['persona:goal'], 'finish');
const interact = station => d({ type: 'interact', station }, [`station:${station}`], 'explore');
const add = (productId, quantity = 1) => d({ type: 'add', productId, quantity }, [`product:${productId}`], 'interest');
test('bundle uses current structured character and whole-world reference while keeping observed memory separate', () => {
  for (const personaId of ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider']) {
    const { bundle } = fixture(personaId);
    assert.deepEqual(bundle.persona.character, getPersona(personaId).character);
    assert.equal(bundle.observationScope, 'whole-world');
    assert.equal(bundle.actorKnowledgeScope, 'observed-and-remembered');
    assert.equal(bundle.generationLimits.technicalActionBudget, 100);
    assert.equal(bundle.bundleVersion, '8');
    assert.equal(bundle.policyVersion, 'whole-trace-v3');
    assert.ok(bundle.persona.behavior.individualInstructions.includes(getPersona(personaId).character.name));
    assert.equal(bundle.persona.behavior.behavioralContext.goalMemoryCapacity, getPersona(personaId).attention.goalMemoryCapacity);
    assert.equal(bundle.worldReference.navigation.view, 'world');
    assert.ok(bundle.sourceFiles.some(f => f.path.endsWith('marketReplayPerception.ts') && /^[a-f0-9]{64}$/.test(f.sha256)));
    assert.equal(Object.hasOwn(bundle, 'generatorReference'), false);
    assert.ok(bundle.worldReference.waypoints.length > bundle.actorState.initialObservation.anchors.length);
    assert.equal(bundle.actorState.experience.observedThisVisit.discoveries.knownProducts.length, 0);
    assert.equal(bundle.actorState.experience.observedThisVisit.discoveries.anchors.length, bundle.actorState.initialObservation.anchors.length);
    assert.equal(bundle.actorState.knowledge.cues.some(cue => cue.cueRef.startsWith('product:') || cue.cueRef.startsWith('objective:')), false);
    assert.ok(bundle.actorState.knowledge.visibleCueRefs.includes('list'));
    assert.ok(bundle.actorState.knowledge.profileCueRefs.includes('persona:goal'));
    assert.ok(bundle.worldReference.shelves.every(s => s.products.length > 0 && s.pages.length > 0 && s.products.every(p => Number.isInteger(p.stock))));
    for (const shelf of bundle.worldReference.shelves) for (const page of shelf.pages)
      assert.ok(page.visibleProductIds.every(id => shelf.products.some(p => p.id === id)));
  }
});
test('a whole candidate preserves chosen visible movement and expands it into guarded <=32px moves', async () => {
  const { settings, bundle } = fixture();
  const target = bundle.worldReference.waypoints.find(w => w.anchorId === bundle.actorState.initialObservation.anchors[0].id);
  assert.ok(target);
  const result = await compileWholeTraceCandidate(settings, bundle,
    candidate(readList(), d({ type: 'walk', waypointId: target.waypointId }, [`anchor:${target.anchorId}`], 'explore'),
      d({ type: 'lookAround' }, ['phase:shopping'], 'explore'), quit()));
  const walk = result.trace.steps.find(s => s.type === 'walkToAnchor');
  assert.equal(walk.target.anchorId, target.anchorId);
  assert.equal(result.acceptedActions, 4);
  const guard = new TraceGuard(settings.snapshot, result.trace.personaId, result.trace.personaVersion, 'offline-test', true);
  const moves = result.trace.steps.flatMap(s => guard.execute(s).actions).filter(a => a.type === 'move');
  assert.ok(moves.length > 1);
  assert.ok(moves.every(a => Math.hypot(a.dx, a.dy) <= 32));
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
  assert.equal(result.trace.generation.planningSubmissions, 1);
  assert.equal(result.trace.generation.timingProfile, 'actor-preserved-v1');
  assert.equal(result.trace.generation.actorStateVersion, '1');
  assert.equal(walk.reactionDelayMs, 450);
  assert.equal(walk.movement.speedMultiplier, Math.round(Math.max(.4, Math.min(1, getPersona(settings.personaId).parameters.walkSpeed / 190)) * 1000) / 1000);
  assert.equal(result.trace.steps.find(s => s.type === 'readList').durationMs, 2000);
  assert.equal(result.trace.steps.find(s => s.type === 'lookAround').durationMs, 1500);
  assert.equal(result.knowledgeAudit[1].currentTask, result.knowledgeAudit[1].actorState.task);
});
test('a global waypoint outside the current screen is rejected without routing toward it', async () => {
  const { settings, bundle } = fixture();
  const hidden = bundle.worldReference.waypoints.find(w => !bundle.actorState.initialObservation.anchors.some(a => a.id === w.anchorId));
  await assert.rejects(compileWholeTraceCandidate(settings, bundle,
    candidate(readList(), d({ type: 'walk', waypointId: hidden.waypointId }, [`anchor:${hidden.anchorId}`], 'explore'), quit())), error => {
    assert.ok(error instanceof WholeTraceCompileError);
    assert.equal(error.validation.failedDecisionIndex, 1);
    assert.equal(error.validation.acceptedPrefixLength, 1);
    assert.equal(error.validation.validPrefix[0].action.type, 'readList');
    return true;
  });
});
test('an available action cannot cite an unread objective, while reading the list establishes that cue', async () => {
  const { settings, bundle } = fixture();
  const objective = bundle.worldReference.objectives[0];
  assert.ok(objective);
  const objectiveRef = `objective:${objective.id}`;
  const first = pause();
  const unread = d({ type: 'readList' }, ['list', objectiveRef]);
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(first, unread, quit())), error => {
    assert.ok(error instanceof WholeTraceCompileError);
    assert.equal(error.validation.code, 'KNOWLEDGE_BASIS');
    assert.equal(error.validation.failedDecisionIndex, 1);
    assert.equal(error.validation.acceptedPrefixLength, 1);
    assert.deepEqual(error.validation.validPrefix, [first]);
    assert.equal(error.validation.before.listAvailable, true, 'The list action itself is currently available');
    assert.equal(error.validation.before.result.actionType, 'pause');
    assert.ok(error.validation.knowledge.visibleCueRefs.includes('list'));
    assert.equal(error.validation.knowledge.cues.some(cue => cue.cueRef === objectiveRef), false);
    assert.match(error.validation.errors.join(' '), /Unobserved actor basis reference/);
    return true;
  });
  const recalled = d({ type: 'pause' }, [objectiveRef], 'check');
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(readList(), recalled, quit()));
  assert.equal(result.acceptedActions, 3);
  assert.deepEqual(result.knowledgeAudit[1].basis, recalled.basis);
  const observed = result.knowledgeAudit[1].knowledge.cues.find(cue => cue.cueRef === objectiveRef);
  assert.ok(observed, 'Only the real readList result establishes the objective');
  assert.deepEqual(observed.value, objective);
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
});
test('a currently legal walk cannot use a hidden product as its declared destination cue', async () => {
  const { settings, bundle } = fixture();
  const target = bundle.worldReference.waypoints.find(w => w.anchorId === bundle.actorState.initialObservation.anchors[0].id);
  const hiddenProduct = bundle.worldReference.shelves[0].products[0];
  assert.ok(target && hiddenProduct);
  assert.equal(bundle.actorState.initialObservation.products.some(product => product.id === hiddenProduct.id), false);
  const productRef = `product:${hiddenProduct.id}`;
  const first = readList();
  const walk = d({ type: 'walk', waypointId: target.waypointId }, [`anchor:${target.anchorId}`, productRef], 'task');
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(first, walk, quit())), error => {
    assert.ok(error instanceof WholeTraceCompileError);
    assert.equal(error.validation.code, 'KNOWLEDGE_BASIS');
    assert.equal(error.validation.failedDecisionIndex, 1);
    assert.equal(error.validation.acceptedPrefixLength, 1);
    assert.deepEqual(error.validation.validPrefix, [first]);
    assert.ok(error.validation.before.anchors.some(anchor => anchor.id === target.anchorId), 'The chosen movement control is actually visible');
    assert.ok(error.validation.knowledge.visibleCueRefs.includes(`anchor:${target.anchorId}`));
    assert.equal(error.validation.knowledge.cues.some(cue => cue.cueRef === productRef), false);
    assert.match(error.validation.errors.join(' '), /Unobserved actor basis reference/);
    return true;
  });
});
test('shelf page and stock are checked; object key ordering does not change valid action identity', async () => {
  const { settings, bundle } = fixture('careful-checker', 'fresh');
  const shelf = bundle.worldReference.shelves.find(s => s.stationId === 'fresh');
  const id = shelf.pages[0].visibleProductIds[0];
  const valid = await compileWholeTraceCandidate(settings, bundle, candidate(
    interact('fresh'), { ...add(id), action: { quantity: 1, productId: id, type: 'add' } }, quit()));
  assert.equal(valid.trace.steps.filter(s => s.type === 'dragProduct').length, 1);
  const stock = shelf.products.find(p => p.id === id).stock;
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(
    interact('fresh'), add(id, stock + 1), quit())), /not an available control/);
  const offPage = shelf.products.find(p => !shelf.pages[0].visibleProductIds.includes(p.id));
  if (offPage) await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(
    interact('fresh'), add(offPage.id), quit())), error => {
      assert.equal(error.validation.failedDecisionIndex, 1);
      assert.equal(error.validation.acceptedPrefixLength, 1);
      return true;
    });
  if (shelf.pages.length > 1) {
    const page = shelf.pages.find(p => p.visibleProductIds.length && p.pageIndex > 0);
    const result = await compileWholeTraceCandidate(settings, bundle, candidate(interact('fresh'),
      d({ type: 'browse', pageIndex: page.pageIndex }, ['shelf-page:fresh'], 'explore'), add(page.visibleProductIds[0]), quit()));
    const browse = result.trace.steps.find(s => s.type === 'browse');
    assert.equal(getReplayShelfPage(shelf.products.map(p => p.id), bundle.worldReference.presentation, browse.scrollFraction).page, page.pageIndex);
  }
});
test('100 candidate actions preserve partial basket and append the existing staffed or unstaffed system checkout', async () => {
  for (const cashierCount of [0, 2]) {
    const { settings, bundle } = fixture('quick-decider', 'fresh', cashierCount);
    const id = bundle.worldReference.shelves.find(s => s.stationId === 'fresh').pages[0].visibleProductIds[0];
    const actions = [interact('fresh'), add(id), ...Array.from({ length: 98 }, pause)];
    const result = await compileWholeTraceCandidate(settings, bundle, candidate(...actions));
    assert.equal(result.acceptedActions, 100);
    assert.deepEqual(result.trace.generation.systemCompletion.cartAtStart, { [id]: 1 });
    const tail = result.trace.steps.filter(s => isMarketReplaySystemCompletionStep(result.trace, s.id));
    assert.equal(tail.some(s => ['dragProduct', 'removeProduct', 'giveUp'].includes(s.type)), false);
    assert.equal(tail.some(s => s.type === 'talkToStaff' && s.choice === 'requestCashier'), cashierCount === 0);
    assert.deepEqual(tail.slice(-3).map(s => s.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
  }
});
test('incomplete, oversized, primitive or trailing-after-termination candidates cannot become replay files', () => {
  const bad = [candidate(pause()), candidate(...Array.from({ length: 101 }, pause)),
    candidate(d({ type: 'move', dx: 20, dy: 0 }, ['phase:shopping'], 'explore'), quit()),
    candidate(quit(), readList()), ...['1', '2'].map(candidateVersion => ({ ...candidate(quit()), candidateVersion }))];
  for (const value of bad) assert.equal(validateWholeTraceCandidate(value, 'compiler-request').valid, false);
});
test('new whole candidates require an explicit intent and observed cue references instead of an ungrounded reason', () => {
  const valid = candidate(quit());
  assert.equal(validateWholeTraceCandidate(valid, 'compiler-request').valid, true);
  const missing = structuredClone(valid); delete missing.decisions[0].basis;
  const empty = structuredClone(valid); empty.decisions[0].basis.cueRefs = [];
  const invalidIntent = structuredClone(valid); invalidIntent.decisions[0].basis.intent = 'omniscient-best-route';
  for (const value of [missing, empty, invalidIntent]) {
    const result = validateWholeTraceCandidate(value, 'compiler-request');
    assert.equal(result.valid, false);
    assert.equal(result.code, 'CANDIDATE_SCHEMA');
    assert.ok(result.errors.some(message => /basis|intent|cueRefs/.test(message)));
  }
});
test('actor-state schema is mandatory and obsolete currentTask cannot replace the public state', () => {
  const missing = candidate(quit()); delete missing.decisions[0].actorState;
  const obsolete = candidate(quit()); obsolete.decisions[0].currentTask = '예전 단일 과제 설명';
  for (const value of [missing, obsolete]) {
    const validation = validateWholeTraceCandidate(value, 'compiler-request');
    assert.equal(validation.valid, false);
    assert.equal(validation.code, 'CANDIDATE_SCHEMA');
  }
});
test('a legal available control cannot declare an unread held goal, and actual reads establish later state goals', async () => {
  const { settings, bundle } = fixture(), objective = bundle.worldReference.objectives[0];
  const first = pause(), unread = readList();
  unread.actorState.heldGoalIds = [objective.id];
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(first, unread, quit())), error => {
    assert.equal(error.validation.code, 'ACTOR_STATE');
    assert.equal(error.validation.failedDecisionIndex, 1);
    assert.equal(error.validation.acceptedPrefixLength, 1);
    assert.deepEqual(error.validation.validPrefix, [first]);
    assert.equal(error.validation.before.listAvailable, true);
    assert.equal(error.validation.knowledge.cues.some(cue => cue.cueRef === `objective:${objective.id}`), false);
    assert.match(error.validation.errors.join(' '), /unread objective/);
    return true;
  });
  const remembered = d({ type: 'pause' }, [`objective:${objective.id}`], 'recover');
  remembered.actorState.heldGoalIds = [objective.id];
  const valid = await compileWholeTraceCandidate(settings, bundle, candidate(readList(), remembered, quit()));
  assert.deepEqual(valid.knowledgeAudit[1].actorState.heldGoalIds, [objective.id]);
  const noTransition = pause(); noTransition.actorState.heldGoalIds = [objective.id];
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(readList(), noTransition, quit())), error => {
    assert.equal(error.validation.code, 'ACTOR_STATE');
    assert.match(error.validation.errors.join(' '), /Newly held goal/);
    return true;
  });
});
test('fixed fixture delays can raise a persona review while the complete trace remains valid', async () => {
  const { settings, bundle } = fixture();
  const decisions = Array.from({ length: 8 }, (_, i) => i % 2 ? pause() : d({ type: 'lookAround' }, ['phase:shopping'], 'explore'));
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(...decisions, quit()));
  assert.equal(result.personaReview.status, 'review');
  assert.ok(result.personaReview.findings.some(finding => finding.code === 'UNIFORM_REACTION_DELAYS'));
  assert.equal(result.acceptedActions, 9);
  assert.deepEqual(validateTrace(result.trace, settings.snapshot), { valid: true, errors: [] });
  assert.deepEqual(result.knowledgeAudit.map(entry => entry.delayMs), Array(9).fill(450));
});
test('new whole bundles reject compact execution timing instead of shortening actor reaction and movement', () => {
  const { settings } = fixture();
  assert.throws(() => buildWholeTraceBundle({ ...settings, timingProfile: 'compact' }, 'compiler-request'), /preserves actor judgment timing/);
});
test('natural checkout completion remains voluntary and is not a system-assisted ending', async () => {
  const { settings, bundle } = fixture('careful-checker', 'checkout');
  const result = await compileWholeTraceCandidate(settings, bundle, candidate(
    d({ type: 'checkout', checkoutId: 'checkout' }, ['station:checkout'], 'finish'),
    d({ type: 'submit' }, ['phase:checkout'], 'finish')));
  assert.equal(result.trace.generation.systemCompletion, undefined);
  assert.deepEqual(result.trace.steps.slice(-3).map(s => s.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
});
test('candidate and input references cannot mutate a pending compilation', async () => {
  const { settings, bundle } = fixture();
  const c = candidate(pause(), quit());
  const original = c.decisions[1].reason;
  const pending = compileWholeTraceCandidate(settings, bundle, c);
  c.decisions[1].reason = '외부에서 변경한 값'; settings.seed = 'changed'; bundle.worldReference.waypoints.length = 0;
  const result = await pending;
  assert.equal(result.trace.steps.find(s => s.type === 'giveUp').reason, original);
  assert.equal(result.trace.seed, 'whole-candidate-fixture');
});
test('foreign prepared inputs and diagnostic I/O errors are not repaired as gameplay mistakes', async () => {
  const { settings, bundle } = fixture();
  await assert.rejects(compileWholeTraceCandidate({ ...settings, seed: 'foreign' }, bundle, candidate(quit())), error => error.validation.code === 'PREPARED_INPUT_MISMATCH');
  await assert.rejects(compileWholeTraceCandidate(settings, { ...bundle, bundleVersion: '1' }, candidate(quit())), error => error.validation.code === 'PREPARED_INPUT_MISMATCH');
  await assert.rejects(compileWholeTraceCandidate(settings, bundle, candidate(pause(), quit()), 1,
    () => { throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' }); }), error => {
      assert.equal(error.code, 'ENOSPC'); assert.equal(error.stage, 'persistence');
      assert.equal(error instanceof WholeTraceCompileError, false); return true;
    });
});
