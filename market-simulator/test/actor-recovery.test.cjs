const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { generateTrace, summarizeTrace } = require('../src/simulator.ts');
const { extendedActorChoices: actorChoices, presentActorChoices } = require('../src/actorChoices.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const snapshot = () => createMarketReplaySnapshot(createMarketSession({ seed: 'actor-recovery' }));
const personaId = 'mild-intellectual-disability-adult';
const choose = action => ({ action, delayMs: 300, reason: '현재 보이는 곳을 살핀다' });

test('stable action IDs survive candidate order changes and presentation never removes alternatives', () => {
  const observation = new TraceGuard(snapshot()).observeActor();
  const a = actorChoices(observation), b = actorChoices({ ...observation, anchors: [...observation.anchors].reverse() });
  const map = choices => Object.fromEntries(choices.map(c => [JSON.stringify(c.action), c.id]));
  assert.deepEqual(map(a), map(b));
  assert.equal(new Set(a.map(c => c.id)).size, a.length);
  const presented = presentActorChoices(a, 'neutral', 0);
  assert.deepEqual(map(presented), map(a));
  assert.deepEqual(presented, presentActorChoices(a, 'neutral', 0));
  assert.notDeepEqual(presented.map(c => c.id), presentActorChoices(a, 'neutral', 1).map(c => c.id));
  assert.ok(presented.some(c => c.action.type === 'giveUp'));
  assert.ok(presented.some(c => c.action.type === 'pause'));
});


test('repetition remains observable through 100 actor decisions and ends only at the fixed horizon', async () => {
  const initial = snapshot(), checkpoints = [];
  let calls = 0;
  const trace = await generateTrace({ personaId, seed: 'stuck', snapshot: initial, mode: 'llm', actorPolicyVersion: 'episodic-choice-v9',
    maxActions: 100, llm: { model: 'fixture', maxCalls: 100 }, onCheckpoint: e => checkpoints.push(e),
    actorDecisionProvider: async (_o, _history, _persona, feedback) => {
      calls++;
      assert.equal(feedback.controlledStop, undefined);
      assert.equal(feedback.review, undefined);
      return { ...choose({ type: 'lookAround', durationMs: 800 }), currentTask: `둘러보기 ${calls}`,
        exchange: { request: 'PRIVATE MODEL EXCHANGE', response: 'PRIVATE MODEL EXCHANGE' } };
    } });
  assert.equal(calls, 100);
  assert.equal(trace.generation.controlledStop, undefined);
  assert.equal(trace.generation.systemCompletion.afterDecisions, 100);
  assert.deepEqual(trace.generation.systemCompletion.cartAtStart, {});
  assert.equal(summarizeTrace(trace).ending, 'assisted-review-requested');
  assert.ok(trace.steps.length > 104);
  assert.deepEqual(trace.steps.slice(-3).map(s => s.type), ['submitForReview', 'awaitReviewAccepted', 'leave']);
  assert.equal(trace.steps.filter(s => s.type === 'lookAround').length, 100);
  assert.equal(trace.steps.some(s => ['dragProduct', 'giveUp', 'skipRating'].includes(s.type)), false);
  assert.equal(checkpoints.at(-1).kind, 'system-completion');
  assert.equal(checkpoints.at(-1).index, 100);
  assert.equal(checkpoints.filter(e => e.kind === 'decision').length, 100);
  assert.equal(JSON.stringify(checkpoints).includes('PRIVATE MODEL EXCHANGE'), false);
  assert.ok(validateTrace(trace, initial).valid);
});

test('model receives descriptive repetition facts without review or stop instructions, and may choose to stop', async () => {
  const original = global.fetch, requests = [];
  global.fetch = async (_url, init) => {
    const wire = JSON.parse(init.body), content = JSON.parse(wire.messages[1].content);
    requests.push(content);
    assert.equal(content.activityFeedback.review, undefined);
    assert.equal(content.activityFeedback.controlledStop, undefined);
    assert.doesNotMatch(wire.messages[0].content, /If review is present|pause your current plan to reconsider/);
    assert.deepEqual(new Set(content.availableChoices.map(c => c.id)), new Set(actorChoices(content.observation).map(c => c.id)));
    for (const key of ['environment', 'objectives', 'playerPosition', 'evaluation']) assert.equal(content.observation[key], undefined);
    const type = requests.length === 51 ? 'giveUp' : requests.length === 1 ? 'readList' : 'lookAround';
    const choice = content.availableChoices.find(c => c.action.type === type);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ choiceId: choice.id,
      delayMs: 300, reason: '둘러본 뒤 오늘은 그만한다', currentTask: '주변 살피기' }) } }] }));
  };
  try {
    const trace = await generateTrace({ personaId, seed: 'descriptive', snapshot: snapshot(), mode: 'llm', actorPolicyVersion: 'episodic-choice-v9',
      llm: { model: 'fixture', baseUrl: 'http://127.0.0.1:1/v1' } });
    assert.equal(requests.length, 51);
    assert.ok(requests.at(-1).activityFeedback.repetition.repeatedActionsWithoutNewObservation > 36);
    assert.equal(trace.generation.controlledStop, undefined);
    assert.equal(trace.steps.filter(s => s.type === 'lookAround').length, 49);
    assert.equal(trace.steps.at(-3).type, 'giveUp');
  } finally { global.fetch = original; }
});

for (const stopAt of [9, 99, 100]) {
  test(`voluntary exit at decision ${stopAt} wins over the observation horizon`, async () => {
    let calls = 0;
    const trace = await generateTrace({ personaId, seed: 'natural-stop', snapshot: snapshot(), mode: 'llm', actorPolicyVersion: 'episodic-choice-v9',
      llm:{model:'fixture'}, actorDecisionProvider:async () => {
        calls++;
        return choose(calls === stopAt ? {type:'giveUp'} : {type:'pause',durationMs:100});
      } });
    assert.equal(calls, stopAt);
    assert.equal(trace.generation.controlledStop, undefined);
    assert.equal(summarizeTrace(trace).ending, 'gave-up');
    assert.equal(trace.steps.filter(s => s.type === 'giveUp').length, 1);
    assert.equal(trace.steps.filter(s => s.type === 'pause').length, stopAt - 1);
  });
}

test('natural review submission at decision 100 is retained without any system giveUp', async () => {
  const config = {seed:'submission-boundary',environment:{cashierCount:2}};
  const environment = structuredClone(createMarketSession(config).environment);
  environment.spawn = {...environment.checkout.point};
  const initial = createMarketReplaySnapshot(createMarketSession(config,environment));
  let calls=0;
  const trace = await generateTrace({personaId,seed:'submit-at-100',snapshot:initial,mode:'llm',actorPolicyVersion:'episodic-choice-v9',llm:{model:'fixture'},
    actorDecisionProvider:async()=>choose(++calls < 99 ? {type:'pause',durationMs:100}
      : calls === 99 ? {type:'checkout',checkoutId:'checkout'} : {type:'submit'})});
  assert.equal(calls,100);
  assert.equal(trace.generation.controlledStop,undefined);
  assert.equal(summarizeTrace(trace).ending,'review-requested');
  assert.deepEqual(trace.steps.slice(-3).map(s=>s.type),['submitForReview','awaitReviewAccepted','leave']);
  assert.equal(trace.steps.some(s=>s.type==='giveUp'),false);
  assert.ok(validateTrace(trace,initial).valid);
});

test('short wandering, revisits, and interest pauses stay as selected', async () => {
  let count = 0, visited = [];
  const kinds = [];
  const trace = await generateTrace({ personaId, seed: 'wandering', snapshot: snapshot(), mode: 'llm', actorPolicyVersion: 'episodic-choice-v9', llm: { model: 'fixture' },
    actorDecisionProvider: async o => {
      count++;
      let action;
      if (count <= 4) {
        const target = o.anchors.find(a => a.id === visited.at(-2)) ?? o.anchors[0];
        visited.push(target.id); action = { type: 'walkToAnchor', anchorId: target.id };
      } else action = count <= 8 ? { type: 'pause', durationMs: 900 } : { type: 'giveUp' };
      kinds.push(action.type); return choose(action);
    } });
  assert.equal(trace.generation.controlledStop, undefined);
  assert.deepEqual(trace.steps.slice(1, -2).map(s => s.type), kinds);
  assert.equal(trace.steps.filter(s => s.type === 'pause').length, 4);
});

for (const id of ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider']) {
  test(`${id}: guarded repeated movement continues unchanged until 100 model decisions`, async () => {
    const initial = snapshot(), selected = [];
    const trace = await generateTrace({ personaId: id, seed: 'old-loop', snapshot: initial, mode: 'llm', actorPolicyVersion: 'episodic-choice-v9',
      maxActions: 100, llm: { model: 'persistent-first-passage-fixture', maxCalls: 100 },
      actorDecisionProvider: async o => {
        const anchorId = o.anchors[0].id; selected.push(anchorId);
        return choose({ type: 'walkToAnchor', anchorId });
      } });
    assert.equal(selected.length, 100);
    assert.equal(trace.generation.systemCompletion.reason,'action-limit');
    assert.deepEqual(trace.steps.filter(s => s.type === 'walkToAnchor').map(s => s.target.anchorId), selected);
    assert.equal(new Set(selected.slice(-12)).size, 2, 'fixture must reproduce the actual two-place loop');
    assert.equal(trace.steps.some(s => s.type === 'dragProduct'), false);
    assert.ok(validateTrace(trace, initial).valid);
  });
}

for (const [settings,code] of [[{maxActions:35},'action-limit'],[{llm:{model:'fixture',maxCalls:35}},'model-call-limit']]) {
  test(`smaller technical ${code} does not masquerade as a completed 100-action observation`,async()=>{
    let calls=0;
    await assert.rejects(generateTrace({personaId,seed:'technical-limit',snapshot:snapshot(),mode:'llm',actorPolicyVersion:'episodic-choice-v9',llm:{model:'fixture'},
      ...settings,actorDecisionProvider:async()=>{calls++;return choose({type:'lookAround',durationMs:100});}}),
      new RegExp(`ATTENTION_GENERATION_LIMIT: ${code}`));
    assert.equal(calls,35);
  });
}
