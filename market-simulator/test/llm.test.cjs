const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
require('../runtime.cjs');
const { generateEpisode, validateEpisodeReplay } = require('../src/simulator.ts');

test('LLM mode calls the decision endpoint for every primitive step and replays offline', async () => {
  const reference = await generateEpisode({ personaId: 'quick-decider', seed: 'llm-contract' });
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks));
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(request.model, 'local-contract-fixture');
    const observed = JSON.parse(request.messages[1].content).observation;
    assert.equal(observed.events, undefined);
    assert.equal(observed.config, undefined);
    assert.equal(observed.objectives[0].productId, undefined);
    const { action: { at, ...action }, delayMs, reason } = reference.trace[calls++];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'local-contract-fixture', choices: [{ message: { content: JSON.stringify({ action, delayMs, reason }) } }] }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const options = { personaId: 'quick-decider', seed: 'llm-contract', mode: 'llm', llm: {
    model: 'local-contract-fixture', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, maxCalls: 1000,
  } };
  let result;
  try {
    result = await generateEpisode(options);
    assert.equal(result.episode.outcome, reference.episode.outcome);
    assert.deepEqual(result.episode.finalCart, reference.episode.finalCart);
    assert.equal(calls, result.trace.length);
    assert.ok(result.trace.every(t => t.source === 'llm' && t.exchange.request && t.exchange.response));
    assert.equal(result.episode.provenance.agentModel, 'local-contract-fixture');
    assert.ok(validateEpisodeReplay(result).valid);
  } finally { await new Promise(resolve => server.close(resolve)); }
  const fetch = global.fetch;
  global.fetch = () => { throw new Error('Replay must not call model'); };
  try { assert.deepEqual(await generateEpisode({ ...options, sessionId: result.episode.sessionId, replayTrace: result.trace }), result); }
  finally { global.fetch = fetch; }
});

test('bad model actions fail visibly instead of teleporting or silently switching policy', async () => {
  await assert.rejects(generateEpisode({ personaId: 'careful-checker', seed: 'bad-model', mode: 'llm', llm: { model: 'fixture' },
    decisionProvider: async () => ({ action: { type: 'setPosition', point: { x: 0, y: 0 } }, delayMs: 1000, reason: 'invalid' }),
  }), /unsupported/);
  await assert.rejects(generateEpisode({ personaId: 'careful-checker', seed: 'too-fast', mode: 'llm', llm: { model: 'fixture' },
    decisionProvider: async () => ({ action: { type: 'move', dx: 24, dy: 0 }, delayMs: 1, reason: 'invalid-speed' }),
  }), /too short/);
});

test('model call budget is enforced before another provider request', async () => {
  let calls = 0;
  const result = await generateEpisode({ personaId: 'careful-checker', seed: 'model-limit', mode: 'llm',
    llm: { model: 'fixture', maxCalls: 2 }, decisionProvider: async () => {
      calls++; return { action: { type: calls === 1 ? 'viewHelp' : 'closeView' }, delayMs: 800, reason: 'read-help' };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.summary.termination, 'model-call-limit');
  assert.equal(result.episode.outcome, 'gave-up');
  assert.equal(result.trace.at(-1).source, 'limit');
  assert.ok(validateEpisodeReplay(result).valid);
});
