const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { rememberedRouteCues } = require('../src/rememberedRoute.ts');
const { extendedActorChoices, presentActorChoices } = require('../src/actorChoices.ts');
const { ActorLearningMemory } = require('../src/actorLearning.ts');

const walk = (from, to, seen = []) => ({ action: 'walkToAnchor', from, to, seenStationIds: seen });
const anchor = (id, label = '눈앞의 통로') => ({ id, label, direction: 'east', distanceBand: 'near' });
const obs = (anchors, visibleStations = []) => ({ phase: 'shopping', view: 'store', activeStation: null, anchors, visibleStations,
  products: [], cart: {}, cashiers: {}, listAvailable: false, visibleApproachEnabled: true });
const labels = new Map([['checkout', '1번 계산대 · 계산 가능'], ['fresh', '냉장 식품'], ['exit', '출구']]);

test('remembered-route-v1 names only places the actor saw on its own earlier walked passages', () => {
  const routes = [walk('a1', 'a2', ['fresh']), walk('a2', 'a3', ['checkout', 'exit']), walk(null, 'a9', ['exit'])];
  const cues = rememberedRouteCues(routes, obs([anchor('a1'), anchor('a2'), anchor('a7')]), labels);
  // a1 itself saw nothing; walking on a1→a2 (2 passages) saw fresh, a2→a3 (3) saw checkout and exit.
  assert.deepEqual(cues.get('a1'), [{ id: 'fresh', label: '냉장 식품', passages: 2 },
    { id: 'checkout', label: '1번 계산대 · 계산 가능', passages: 3 }, { id: 'exit', label: '출구', passages: 3 }]);
  assert.deepEqual(cues.get('a2').map(p => [p.id, p.passages]), [['fresh', 1], ['checkout', 2], ['exit', 2]]);
  assert.equal(cues.has('a7'), false, 'an unwalked passage gets no cue');
});

test('remembered-route-v1 omits places usable now, unlabelled places, and routes beyond the passage limit', () => {
  const routes = [walk('a1', 'a2', ['fresh', 'mystery']), walk('a2', 'a3'), walk('a3', 'a4', ['checkout'])];
  const near = { id: 'fresh', label: '냉장 식품', kind: 'shelf', direction: 'east', distanceBand: 'near', near: true };
  const cues = rememberedRouteCues(routes, obs([anchor('a1')], [near]), labels, 3);
  assert.equal(cues.has('a1'), false, 'fresh is usable now, mystery is unlabelled, checkout needs 4 passages');
  assert.deepEqual(rememberedRouteCues(routes, obs([anchor('a1')], [near]), labels, 4).get('a1'),
    [{ id: 'checkout', label: '1번 계산대 · 계산 가능', passages: 4 }]);
});

test('remembered-route-v1 annotates passage choices without changing any control or its order', () => {
  const o = obs([anchor('a1'), anchor('a7')]);
  const cues = rememberedRouteCues([walk('a1', 'a2', ['checkout'])], o, labels);
  const plain = extendedActorChoices(o), recalled = extendedActorChoices(o, undefined, cues);
  const controls = list => list.map(({ id, action }) => ({ id, action }));
  assert.deepEqual(controls(recalled), controls(plain));
  assert.deepEqual(controls(presentActorChoices(recalled, 'seed', 3)), controls(presentActorChoices(plain, 'seed', 3)));
  const changed = recalled.filter((c, i) => c.label !== plain[i].label);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].action.anchorId, 'a1');
  assert.equal(changed[0].label, '눈앞의 통로로 걷기 (전에 이 길로 가서 본 곳: 1번 계산대 · 계산 가능)');
  assert.match(changed[0].effect, /not advice or a guarantee/);
  assert.deepEqual(changed[0].observedContext.rememberedFromEarlierRounds, [{ id: 'checkout', label: '1번 계산대 · 계산 가능', passages: 2 }]);
});

test('the route-recall contract marker is never shown as an experience and needs spatial memory to enable', () => {
  const ev = { sessionId: 's', replayId: 'r', traceId: 't', stepId: 'x', stepIndex: 0 };
  const e = action => ({ action, source: 'executed-app-action', result: action, evidence: ev });
  const episodes = [...Array.from({ length: 14 }, () => e('pause')), e('episode-route-recall')];
  const prior = { version: '1', source: 'confirmed-app-replay', memberId: 'm', sessionId: 's', replayId: 'r',
    episodes: episodes.map(({ evidence, ...rest }) => rest) };
  const state = new ActorLearningMemory(prior, true).getState();
  assert.equal(state.previousRouteRecall, undefined, 'no spatial memory: no recall');
  assert.equal(state.previousExecutedExperience.some(x => x.action === 'episode-route-recall'), false);
});
