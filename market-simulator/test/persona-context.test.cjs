const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { PersonaContext } = require('../src/personaContext.ts');
const { getPersona } = require('../src/personas.ts');
const { createLlmPolicy } = require('../src/llmPolicy.ts');
const { createMarketAgentAdapter } = require('../../frontend/src/game/marketSession.ts');

function fixture() {
  const persona = getPersona('mild-intellectual-disability-adult');
  const actor = createMarketAgentAdapter({ seed: 'context-test', provenance: {
    source: 'synthetic', agentModel: 'context-test', personaId: persona.id, personaVersion: persona.version,
  } });
  return { persona, o: actor.observe() };
}

test('personal prior practice, observation, and memory support affect the same task differently', () => {
  const { persona, o } = fixture();
  const context = new PersonaContext(persona);
  const familiar = { ...o, products: [{ id: 'milk', categoryId: 'fresh' }] };
  const novel = { ...o, products: [{ id: 'new-product', categoryId: 'household' }] };
  assert.ok(context.snapshot(familiar).familiarity > context.snapshot(novel).familiarity);
  assert.ok(context.productFamiliarity(familiar.products[0]) > context.productFamiliarity(novel.products[0]));
  context.record({ type: 'interact', station: 'household' }, o, novel);
  assert.ok(context.snapshot(novel).familiarity > new PersonaContext(persona).snapshot(novel).familiarity);
  for (let i = 0; i < 3; i++) context.record({ type: 'add', productId: 'new-product' }, novel, novel);
  const beforeReview = context.snapshot(novel);
  const visibleCart = { ...novel, view: 'cart', cart: { 'new-product': 3 } };
  context.record({ type: 'viewCart' }, novel, visibleCart);
  const afterReview = context.snapshot({ ...novel, view: 'world', cart: null });
  assert.ok(afterReview.memoryLoad < beforeReview.memoryLoad);
  assert.ok(afterReview.support > beforeReview.support);
  assert.equal(afterReview.unreviewedChanges, 0);
  assert.deepEqual(context.snapshot(novel), context.snapshot(novel), 'reading state must not change it');
});

test('unclear failures accumulate stress, walking cannot erase it, and concrete support permits recovery', () => {
  const { persona, o } = fixture();
  const context = new PersonaContext(persona);
  const failed = { ...o, phase: 'feedback', attempts: 1, feedback: { success: false } };
  context.record({ type: 'submit' }, o, failed);
  const once = context.snapshot(failed);
  context.record({ type: 'submit' }, o, { ...failed, attempts: 2 });
  const twice = context.snapshot(failed);
  assert.ok(twice.stress > once.stress);
  assert.ok(twice.confidence < once.confidence);
  for (let i = 0; i < 100; i++) context.record({ type: 'move', dx: 1, dy: 0 }, o, o);
  assert.equal(context.snapshot(failed).stress, twice.stress);
  context.record({ type: 'viewHelp' }, o, { ...o, view: 'help' });
  assert.ok(context.snapshot(o).stress < twice.stress);
  assert.ok(context.snapshot(o).support > twice.support);
  assert.ok(context.snapshot(o, 5000).stress > context.snapshot(o).stress, 'current time pressure is contextual');
  assert.equal(context.snapshot(o).failures, 2);
  assert.ok(context.memory().recentVisibleFeedback.length);
});

test('LLM requests retain the full sources, stable character and cumulative feedback beyond recent actions', async () => {
  const { persona, o } = fixture();
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      action: { type: 'viewHelp' }, delayMs: 1000, reason: '안내를 확인한다.',
    }) } }] }) };
  };
  try {
    const provider = createLlmPolicy({ baseUrl: 'http://127.0.0.1:1/v1', model: 'fixture' });
    const history = [];
    await provider(o, history, persona);
    history.push({ action: { type: 'submit' }, delayMs: 1000, reason: '결제 결과를 확인한다.' });
    const failed = { ...o, phase: 'feedback', feedback: { success: false }, attempts: 1 };
    await provider(failed, history, persona);
    for (let i = 0; i < 20; i++) {
      history.push({ action: { type: 'move', dx: 1, dy: 0 }, delayMs: 1000, reason: '통로를 따라 이동한다.' });
      await provider(o, history, persona);
    }
    const last = JSON.parse(requests.at(-1).messages[1].content);
    assert.equal(last.recentActions.length, 16);
    assert.equal(last.situation.failures, 1);
    assert.ok(last.experience.recentVisibleFeedback.some(s => s.includes('구체적인 이유')));
    assert.deepEqual(last.personaCharacter, persona.character);
    assert.ok(requests.every(r => r.messages[0].content.startsWith(persona.prompt)));
    assert.ok(!('events' in last.observation) && !('config' in last.observation));
    await provider({ ...o, sessionId: 'another-session' }, [], persona);
    const reset = JSON.parse(requests.at(-1).messages[1].content);
    assert.equal(reset.situation.failures, 0);
    assert.deepEqual(reset.experience.recentVisibleFeedback, []);
  } finally { global.fetch = originalFetch; }
});
