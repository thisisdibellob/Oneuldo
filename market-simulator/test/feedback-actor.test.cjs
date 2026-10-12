const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { FEEDBACK_ACTOR_POLICY_VERSION, emptyFeedbackBeliefMemory, validateFeedbackBeliefMemory,
  projectFeedbackObservation, buildFeedbackActorFrame, feedbackDecisionFromChoice,
  feedbackChoiceMatchesDecision } = require('../src/feedbackActor.ts');
const { listPersonas, getPersona } = require('../src/personas.ts');
const { extendedActorChoices } = require('../src/actorChoices.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { createMarketEnvironment, DEFAULT_MARKET_ENVIRONMENT_CONFIG } = require('../../frontend/src/game/marketEnvironment.ts');
const { marketProducts } = require('../../frontend/src/game/scenarios.ts');

const persona = () => getPersona('mild-intellectual-disability-adult');
const guard = () => new TraceGuard(createMarketReplaySnapshot(createMarketSession({ seed: 'feedback-actor' })),
  undefined, undefined, undefined, true, true);
const step = (type, extra = {}) => ({ id: type, type, reactionDelayMs: 1, timeoutMs: 120000, reason: 'fixture', ...extra });
const frame = (observation, memory = emptyFeedbackBeliefMemory(), individual = persona(), decisionIndex = 0) =>
  buildFeedbackActorFrame({ observation, memory, persona: individual, seed: 'fixture', decisionIndex, policyVersion: 'feedback-choice-v1' });

test('belief schema preserves wrong quantities, confident mistakes and completion without any purchase', () => {
  const memory = {
    rememberedItems: [
      { name: '목록에 없는 기억 속 물건', quantity: 99, certainty: 'clear', status: 'done' },
      { name: null, quantity: 0, certainty: 'uncertain', status: 'pending' },
      { name: '잊어버린 선택', quantity: null, certainty: 'clear', status: 'abandoned' },
    ],
    currentTask: '이미 했다고 생각하며 다음 일을 살핀다', notes: ['이전에 고른 것 같음'],
  };
  assert.deepEqual(validateFeedbackBeliefMemory(memory), { valid: true, errors: [] });
  const g = guard();
  g.execute(step('readList', { durationMs: 2000 }));
  const result = frame(g.observeActor(), memory);
  assert.deepEqual(result.memory, memory, 'reading the actual list never overwrites authored beliefs');
  assert.deepEqual(frame(g.observeActor()).memory, emptyFeedbackBeliefMemory(), 'visible items need not be retained');
  result.memory.rememberedItems[0].name = 'changed output';
  result.memory.notes.push('changed output');
  assert.equal(memory.rememberedItems[0].name, '목록에 없는 기억 속 물건');
  assert.equal(memory.notes.length, 1);
});

test('memory validation rejects only malformed or oversized storage, not epistemic mistakes', () => {
  for (const invalid of [
    null, {}, { ...emptyFeedbackBeliefMemory(), rawSnapshot: {} },
    { ...emptyFeedbackBeliefMemory(), currentTask: 'x'.repeat(301) },
    { ...emptyFeedbackBeliefMemory(), notes: Array(9).fill('note') },
    { ...emptyFeedbackBeliefMemory(), notes: [''] },
    { ...emptyFeedbackBeliefMemory(), rememberedItems: Array(13).fill({ name: null, quantity: null, certainty: 'clear', status: 'done' }) },
    { ...emptyFeedbackBeliefMemory(), rememberedItems: [{ name: null, quantity: 1.5, certainty: 'clear', status: 'pending' }] },
    { ...emptyFeedbackBeliefMemory(), rememberedItems: [{ name: null, quantity: 100, certainty: 'clear', status: 'pending' }] },
    { ...emptyFeedbackBeliefMemory(), rememberedItems: [{ name: null, quantity: null, certainty: 'certain', status: 'done' }] },
    { ...emptyFeedbackBeliefMemory(), rememberedItems: [{ name: null, quantity: null, certainty: 'clear', status: 'done', goalId: 'hidden-answer' }] },
  ]) {
    assert.equal(validateFeedbackBeliefMemory(invalid).valid, false);
    assert.throws(() => frame(guard().observeActor(), invalid), /Invalid feedback belief memory/);
  }
  const empty = emptyFeedbackBeliefMemory();
  empty.notes.push('one instance');
  assert.deepEqual(emptyFeedbackBeliefMemory(), { rememberedItems: [], currentTask: null, notes: [] });
});

test('current observation deep allowlist removes nested hidden world, history and automatic memory', () => {
  const current = guard().observeActor();
  Object.assign(current, { worldReference: { secret: 'HIDDEN' }, history: ['HIDDEN'], observedThisVisit: { lastReadList: ['HIDDEN'] },
    lastReadList: ['HIDDEN'], activityFeedback: { previousAttempts: ['HIDDEN'] }, expectedAnswer: 'HIDDEN', snapshot: 'HIDDEN' });
  current.visibleStations = [{ id: 'fresh', kind: 'shelf', label: '현재 진열대', direction: 'east', distanceBand: 'near', near: true,
    products: ['HIDDEN'], coordinates: { x: 'HIDDEN' } }];
  current.anchors[0].history = ['HIDDEN'];
  current.products = [{ id: 'milk', categoryId: 'fresh', name: '현재 우유', detail: '900mL', price: 2200, stock: 3, hidden: 'HIDDEN' }];
  current.shelf = { page: 0, pageCount: 1, scrollFraction: 0, pageFractions: [0], allPages: ['HIDDEN'] };
  current.readObjectives = [{ id: 'objective-1', label: '현재 보이는 목표', quantity: 1, match: 'exact', productId: 'HIDDEN' }];
  current.instructions = { phase: 'entry', lines: ['현재 안내'], answer: 'HIDDEN' };
  current.supportText = ['현재 도움'];
  current.result = { accepted: true, actionType: 'readList', message: '현재 응답', evaluation: 'HIDDEN' };
  current.cart = { milk: 1, archive: { hidden: 'HIDDEN' } };
  current.cashiers = { checkout: true, archive: { hidden: 'HIDDEN' } };
  const projected = projectFeedbackObservation(current);
  assert.doesNotMatch(JSON.stringify(projected), /HIDDEN|observedThisVisit|lastReadList|worldReference|history|evaluation/);
  assert.deepEqual(projected.cart, { milk: 1 });
  assert.deepEqual(projected.cashiers, { checkout: true });
  assert.equal(projected.products[0].detail, '900mL');
  projected.instructions.lines.push('mutated');
  projected.shelf.pageFractions.push(1);
  projected.readObjectives[0].label = 'mutated';
  assert.deepEqual(current.instructions.lines, ['현재 안내']);
  assert.deepEqual(current.shelf.pageFractions, [0]);
  assert.equal(current.readObjectives[0].label, '현재 보이는 목표');
  const result = frame(current);
  assert.doesNotMatch(JSON.stringify(result.observation), /HIDDEN/);
  assert.doesNotMatch(JSON.stringify(result.availableChoices), /HIDDEN|recordedArrivals|currentLocation|observedThisVisit|lastReadList/);
});

test('different real hidden worlds produce identical actor frames until a current observation reveals their difference', () => {
  const environmentConfig = { ...DEFAULT_MARKET_ENVIRONMENT_CONFIG, seed: 'hidden-knowledge-fixture', cashierCount: 2 };
  const firstEnvironment = createMarketEnvironment(environmentConfig);
  const secondEnvironment = createMarketEnvironment({ ...environmentConfig, shelfOrder: ['fresh', 'produce', 'household', 'meal', 'drink'] });
  const freshIds = marketProducts.filter(product => product.categoryId === 'fresh').map(product => product.id);
  const firstInventory = freshIds.slice(0, 12), secondInventory = freshIds.slice(-12);
  const make = (environment, stockPerProduct, inventory, requiredQuantity) => {
    const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: environment.seed, stockPerProduct,
      inventoryProductIds: { fresh: inventory },
      objectives: [{ productId: inventory[0], quantity: requiredQuantity, match: 'exact' }],
    }, environment));
    return { snapshot, guard: new TraceGuard(snapshot, persona().id, persona().version, 'offline-fixture', true, true, true) };
  };
  const first = make(firstEnvironment, 5, firstInventory, 1);
  const second = make(secondEnvironment, 9, secondInventory, 3);
  assert.notEqual(first.snapshot.snapshotId, second.snapshot.snapshotId);
  assert.notDeepEqual(first.snapshot.environment.shelves.fresh, second.snapshot.environment.shelves.fresh);
  assert.notDeepEqual(first.snapshot.config.inventoryProductIds, second.snapshot.config.inventoryProductIds);
  assert.notDeepEqual(first.snapshot.config.objectives, second.snapshot.config.objectives);
  assert.notDeepEqual(first.snapshot.initialStock, second.snapshot.initialStock);
  assert.deepEqual(first.guard.observeActor(), second.guard.observeActor(), 'the genuine initial UI projections must be identical');
  const firstFrame = frame(first.guard.observeActor()), secondFrame = frame(second.guard.observeActor());
  assert.deepEqual(firstFrame, secondFrame, 'same visible input, persona, actor memory and presentation seed must yield identical complete frames');
  assert.equal(firstFrame.observation.readObjectives, undefined);
  assert.deepEqual(firstFrame.observation.products, []);
  for (const fixture of [first, second]) fixture.guard.execute(step('readList', { durationMs: 2000 }));
  const firstRead = frame(first.guard.observeActor()), secondRead = frame(second.guard.observeActor());
  assert.notDeepEqual(firstRead.observation.readObjectives, secondRead.observation.readObjectives);
  assert.equal(firstRead.observation.readObjectives[0].quantity, 1);
  assert.equal(secondRead.observation.readObjectives[0].quantity, 3);
  assert.notDeepEqual(firstRead, secondRead, 'the lists may differ after the actual readList input reveals them');
  assert.deepEqual(firstRead.memory, secondRead.memory, 'exposure does not automatically encode either list into actor memory');
  for (const fixture of [first, second]) fixture.guard.execute(step('pause', { durationMs: 1500 }));
  assert.deepEqual(frame(first.guard.observeActor()), frame(second.guard.observeActor()),
    'without actor-authored retained belief, the formerly displayed hidden difference must disappear from subsequent requests');
});

test('a real list read is transient and never becomes an automatically retained shopping list', () => {
  const g = guard();
  const before = frame(g.observeActor());
  assert.equal(before.observation.readObjectives, undefined);
  assert.match(before.availableChoices.find(choice => choice.action.type === 'readList').effect, /next current observation only/);
  g.execute(step('readList', { durationMs: 2000 }));
  const read = frame(g.observeActor());
  assert.ok(read.observation.readObjectives.length > 0);
  assert.deepEqual(read.memory, emptyFeedbackBeliefMemory());
  g.execute(step('pause', { durationMs: 1500 }));
  const after = frame(g.observeActor(), emptyFeedbackBeliefMemory());
  assert.equal(after.observation.readObjectives, undefined);
  assert.deepEqual(after.memory, emptyFeedbackBeliefMemory());
  assert.equal(after.observation.lastReadList, undefined);
});

test('choices retain every legal current action and have a neutral deterministic presentation', () => {
  const observation = guard().observeActor();
  const result = frame(observation);
  assert.equal(FEEDBACK_ACTOR_POLICY_VERSION, 'feedback-choice-v7');
  assert.equal(result.policyVersion, 'feedback-choice-v1');
  assert.deepEqual(result, frame(observation));
  assert.deepEqual(result.availableChoices.filter(choice => !choice.dragOutcome).map(choice => choice.id).sort(), extendedActorChoices(observation).map(choice => choice.id).sort());
  assert.ok(result.availableChoices.some(choice => choice.action.type === 'giveUp'));
  assert.ok(result.availableChoices.some(choice => choice.action.type === 'viewHelp'));
  assert.deepEqual(result.availableChoices.map(choice => choice.id).sort(), frame(observation, undefined, undefined, 3).availableChoices.map(choice => choice.id).sort());
  const wrongBelief = { rememberedItems: [{ name: '없는 상품', quantity: 3, certainty: 'clear', status: 'done' }], currentTask: null, notes: [] };
  assert.deepEqual(result.availableChoices, frame(observation, wrongBelief).availableChoices, 'belief contents must not prioritize choices');
});

test('visible shelf products offer optional missed and cancelled drags alongside every existing successful quantity', () => {
  const g = new TraceGuard(createMarketReplaySnapshot(createMarketSession({ seed: 'feedback-drag-choice' })),
    undefined, undefined, undefined, false, true);
  g.execute(step('walkTo', { target: { stationId: 'fresh' }, movement: { style: 'steady', speedMultiplier: 1, motorSeed: 'fixture' } }));
  g.execute(step('openShelf', { stationId: 'fresh' }));
  const observation = g.observeActor(), result = frame(observation);
  assert.deepEqual(result.availableChoices.filter(choice => !choice.dragOutcome).map(choice => choice.id).sort(),
    extendedActorChoices(observation).map(choice => choice.id).sort());
  for (const product of observation.products.filter(product => product.stock > 0)) {
    const alternatives = result.availableChoices.filter(choice => choice.action.type === 'add'
      && choice.action.productId === product.id && choice.dragOutcome);
    assert.deepEqual(alternatives.map(choice => choice.dragOutcome).sort(), ['cancel', 'miss']);
    assert.ok(alternatives.every(choice => choice.action.quantity === 1));
  }
});

test('stable individual profiles retain personal traits but exclude full references and whole-trace cognition rules', () => {
  for (const individual of listPersonas()) {
    const result = frame(guard().observeActor(), undefined, individual);
    const visible = result.persona;
    assert.deepEqual(visible.character.selectedTraits, individual.character.selectedTraits);
    assert.deepEqual(visible.character.practicedStrategies, individual.character.practicedStrategies);
    assert.deepEqual(visible.character.familiarProductIds, individual.character.familiarProductIds);
    for (const trait of individual.character.selectedTraits) assert.ok(visible.individualInstructions.includes(trait));
    assert.doesNotMatch(visible.individualInstructions, /## 공통 전제|## 원자료|## 자료와 구조화된 설정의 연결/);
    assert.equal(visible.cognition, undefined);
    assert.equal(visible.parameters, undefined);
    assert.equal(visible.prompt, undefined);
    assert.doesNotMatch(result.instructions, /must.*correct basket|must.*complete.*goal|uncertainThreshold|heldGoalIds/);
  }
});

test('feedback choices leave activity durations for the actor and cannot change a target through timing', () => {
  const current = frame(guard().observeActor());
  assert.equal(current.persona.timingBaseline.reactionMedianMs, undefined);
  const read = current.availableChoices.find(choice => choice.action.type === 'readList');
  assert.equal(read.action.durationMs, 0, 'legacy fixed list reading time is not a recommendation');
  assert.deepEqual(read.timing, { minimumMs: 100, maximumMs: 120000, phase: 'during-action' });
  const decision = feedbackDecisionFromChoice(read, 7310, '목록을 확인한다', emptyFeedbackBeliefMemory());
  assert.equal(decision.action.durationMs, 7310);
  assert.equal(decision.delayMs, 0);
  assert.equal(feedbackChoiceMatchesDecision(read, decision), true);
  assert.equal(read.action.durationMs, 0);
  const walk = current.availableChoices.find(choice => choice.action.type === 'walkToAnchor');
  const moved = feedbackDecisionFromChoice(walk, 0, '이동한다', emptyFeedbackBeliefMemory());
  moved.action.anchorId = 'anchor-00000000';
  assert.equal(feedbackChoiceMatchesDecision(walk, moved), false);
});

test('panel inspection is counted once in the next feedback observation clock', () => {
  for (const type of ['viewCart', 'viewHelp']) {
    const g = guard();
    const before = g.observeActor().elapsedMs;
    g.execute(step(type, { reactionDelayMs: 0, durationMs: 1734 }));
    assert.equal(g.observeActor().elapsedMs - before, 1735, '1734 ms inspection plus existing 1 ms input timestamp');
  }
});

test('maximum actor duration is preserved with room before the replay deadline', async () => {
  const { generateTrace } = require('../src/simulator.ts');
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'activity-deadline' }));
  let index = 0;
  const trace = await generateTrace({ personaId: persona().id, seed: 'activity-deadline', snapshot,
    actorPolicyVersion: 'feedback-choice-v1', llm: { model: 'authored-test-fixture' },
    feedbackDecisionProvider: async current => {
      const type = ['viewCart', 'closeView', 'pause', 'giveUp'][index++];
      return feedbackDecisionFromChoice(current.availableChoices.find(choice => choice.action.type === type),
        ['viewCart', 'pause'].includes(type) ? 120000 : 0, '작성된 시간 계약 시험', emptyFeedbackBeliefMemory());
    } });
  for (const item of trace.steps.filter(item => ['pause', 'viewCart'].includes(item.type))) {
    assert.equal(item.durationMs, 120000);
    assert.ok(item.timeoutMs >= item.durationMs + 5000);
  }
  assert.ok(trace.steps.every(item => item.reactionDelayMs === 0));
});
