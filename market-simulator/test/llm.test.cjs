const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { generateTrace } = require('../src/simulator.ts');
const { validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const snapshot = () => createMarketReplaySnapshot(createMarketSession({ seed: 'llm-fixture' }));

for (const personaId of ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider']) test(`${personaId}: LLM sees actor-only information and captured traces validate offline`, async () => {
  const initial = snapshot();
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    const content = JSON.parse(request.messages[1].content);
    assert.equal(content.observation.events, undefined);
    assert.equal(content.observation.config, undefined);
    assert.equal(content.observation.schemaVersion, 'attention-observation-v1');
    assert.equal(content.observation.objectives, undefined);
    assert.equal(content.observation.environment, undefined);
    assert.equal(content.observation.playerPosition, undefined);
    assert.equal(content.observation.readObjectives, undefined);
    assert.equal(content.observation.stock, undefined);
    assert.deepEqual(content.observation.products, []);
    assert.equal(content.personalState.hasReadList, false);
    assert.equal(content.collisionFreeLocalMoves, undefined);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      action: { type: requests.length === 1 ? 'viewHelp' : 'giveUp' }, delayMs: 900, reason: '안내를 확인하고 오늘은 그만한다.',
    }) } }] }) };
  };
  let trace;
  try {
    trace = await generateTrace({ personaId, seed: 'llm', snapshot: initial, mode: 'llm',
      llm: { model: 'fixture', baseUrl: 'http://127.0.0.1:1/v1' } });
    assert.equal(requests.length, 2);
    assert.equal(trace.generation.reproducibility, 'captured-trace');
    assert.equal(trace.generation.model, 'fixture');
    assert.ok(requests[0].messages[0].content.includes('ONE next high-level action'));
    assert.ok(trace.generation.requestId);
  } finally { global.fetch = originalFetch; }
  global.fetch = () => { throw new Error('No LLM allowed during trace validation'); };
  try { assert.ok(validateTrace(trace, initial).valid); }
  finally { global.fetch = originalFetch; }
});

test('invalid primitive or renderer responses fail visibly without policy fallback', async () => {
  for (const action of [{ type: 'setPosition', point: { x: 0, y: 0 } }, { type: 'move', dx: 24, dy: 0 }, { type: 'retry' }]) {
    await assert.rejects(generateTrace({ personaId: 'careful-checker', seed: 'invalid', snapshot: snapshot(), mode: 'llm', llm: { model: 'fixture' },
      actorDecisionProvider: async () => ({ action, delayMs: 1000, reason: 'invalid' }),
    }), /unsupported/);
  }
  await assert.rejects(generateTrace({ personaId: 'careful-checker', seed: 1, snapshot: snapshot(), mode: 'llm', llm: { model: 'fixture' },
    actorDecisionProvider: async () => ({ action: { type: 'add', productId: 'milk' }, delayMs: 1000, reason: 'remote product' }),
  }), /observed by browsing/);
});

test('LLM call budget counts decisions rather than movement frames', async () => {
  let calls = 0;
  await assert.rejects(generateTrace({ personaId: 'careful-checker', seed: 'limit', snapshot: snapshot(), mode: 'llm',
    llm: { model: 'fixture', maxCalls: 2 }, actorDecisionProvider: async observation => {
      calls++;
      assert.ok(observation.anchors.length, 'fixture must expose a real local movement choice');
      return { action: calls === 1 ? { type: 'walkToAnchor', anchorId: observation.anchors[0].id } : { type: 'lookAround', durationMs: 800 }, delayMs: 800, reason: 'inspect a visible passage' };
    },
  }), /ATTENTION_GENERATION_LIMIT: model-call-limit/);
  assert.equal(calls, 2, 'the provider call budget must not count movement frames or terminal normalization');
});

for (const personaId of ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider']) {
  test(`${personaId}: goals enter actor input only after an explicit read, and raw providers are rejected`, async () => {
    await assert.rejects(generateTrace({ personaId, seed: 'raw-provider', snapshot: snapshot(), mode: 'llm', llm: { model: 'fixture' },
      decisionProvider: async () => ({ action: { type: 'giveUp' }, delayMs: 600, reason: 'invalid raw contract' }),
    }), /actorDecisionProvider/);
    const seen = [];
    const actions = [{ type: 'readList', durationMs: 1200 }, { type: 'viewHelp' }, { type: 'giveUp' }];
    const trace = await generateTrace({ personaId, seed: 'explicit-list-read', snapshot: snapshot(), mode: 'llm', llm: { model: 'fixture' },
      actorDecisionProvider: async observation => {
        seen.push(observation);
        for (const key of ['environment', 'objectives', 'playerPosition', 'stock', 'config', 'events', 'evaluation']) assert.equal(observation[key], undefined);
        return { action: actions[seen.length - 1], delayMs: 600, reason: 'use the currently visible interface' };
      },
    });
    assert.equal(seen.length, 3);
    assert.equal(seen[0].readObjectives, undefined);
    assert.ok(seen[1].readObjectives.length > 0);
    assert.equal(seen[2].readObjectives, undefined);
    assert.equal(trace.traceSchemaVersion, '2'); assert.equal(trace.policyVersion, '5');
    assert.deepEqual(trace.steps.slice(-3).map(step => step.type), ['giveUp', 'skipRating', 'leave']);
  });
}

test('provider HTTP and malformed JSON failures propagate without invoking a stochastic fallback', async () => {
  const original = global.fetch;
  try {
    for (const response of [
      { response: { ok: false, status: 503 }, expected: /HTTP 503; no stochastic fallback/ },
      { response: { ok: true, json: async () => ({ choices: [{ message: { content: 'not-json' } }] }) }, expected: /invalid JSON/ },
    ]) {
      let calls = 0;
      global.fetch = async () => { calls++; return response.response; };
      await assert.rejects(generateTrace({ personaId: 'quick-decider', seed: 'provider-error', snapshot: snapshot(), mode: 'llm',
        llm: { model: 'fixture', baseUrl: 'http://127.0.0.1:1/v1' } }), response.expected);
      assert.equal(calls, 1);
    }
  } finally { global.fetch = original; }
});
