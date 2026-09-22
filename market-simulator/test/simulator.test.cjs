const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { generateEpisode, generateBatch, validateEpisodeReplay } = require('../src/simulator.ts');
const { createMarketAgentAdapter } = require('../../frontend/src/game/marketSession.ts');
const { isMarketNavigationSegmentClear } = require('../../frontend/src/game/marketNavigation.ts');
const { marketProducts } = require('../../frontend/src/game/scenarios.ts');

test('offline seeded episodes reproduce exactly and use physical, bounded movement', async () => {
  const fetch = global.fetch;
  global.fetch = () => { throw new Error('Network forbidden for stochastic generation'); };
  try {
    const options = { personaId: 'careful-checker', seed: 'repro-test', environmentSeed: 'same-store' };
    const a = await generateEpisode(options), b = await generateEpisode(options);
    assert.deepEqual(a, b);
    assert.equal(a.episode.outcome, 'success');
    assert.deepEqual(validateEpisodeReplay(a), { valid: true, errors: [] });
    const actor = createMarketAgentAdapter(a.episode.config);
    for (const step of a.trace) {
      assert.notEqual(step.action.type, 'setPosition');
      const before = actor.observe();
      const after = actor.act(step.action);
      assert.equal(after.lastActionError, null);
      if (step.action.type === 'move') {
        const distance = Math.hypot(after.playerPosition.x - before.playerPosition.x, after.playerPosition.y - before.playerPosition.y);
        assert.ok(distance <= 32 + 1e-7);
        assert.ok(distance / (step.delayMs / 1000) <= 180);
        assert.ok(isMarketNavigationSegmentClear(before.environment, before.playerPosition, after.playerPosition, before.cashierAvailability));
      }
    }
    const changed = structuredClone(a);
    changed.trace.find(step => step.action.type === 'move').action.dx = 100;
    assert.equal(validateEpisodeReplay(changed).valid, false);
  } finally { global.fetch = fetch; }
});

test('policy seeds change decisions even in the same store; family alternatives use visible names', async () => {
  const fingerprints = new Set();
  for (let i = 0; i < 5; i++) {
    const result = await generateEpisode({ personaId: 'quick-decider', seed: `variant-${i}`, environmentSeed: 'same-store' });
    fingerprints.add(result.summary.actionFingerprint);
    assert.ok(result.summary.maxMoveDistance <= 32);
  }
  assert.equal(fingerprints.size, 5);
  const inventory = ['premium-eggs', ...marketProducts.filter(p => p.categoryId === 'fresh' && (p.familyId ?? p.id) !== 'eggs').slice(0, 11).map(p => p.id)];
  const eggs = await generateEpisode({ personaId: 'careful-checker', seed: 'review-1', config: {
    objectives: [{ productId: 'premium-eggs', quantity: 1 }], inventoryProductIds: { fresh: inventory },
  } });
  assert.equal(eggs.episode.outcome, 'success');
  assert.equal(eggs.episode.finalCart['premium-eggs'], 1);
});

test('worker scheduling does not change dataset order/IDs and output cannot overwrite existing data', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'market-workers-'));
  try {
    const base = { count: 6, seed: 'worker-test', environmentSeed: 'same-store' };
    const one = await generateBatch({ ...base, concurrency: 1, outputPath: path.join(folder, 'one.jsonl') });
    const three = await generateBatch({ ...base, concurrency: 3, outputPath: path.join(folder, 'three.jsonl') });
    assert.equal(three.summary.workers, 3);
    assert.equal(await fs.readFile(one.outputPath, 'utf8'), await fs.readFile(three.outputPath, 'utf8'));
    await assert.rejects(generateBatch({ ...base, outputPath: one.outputPath }), /already exists/);
    assert.equal((await fs.readFile(one.outputPath, 'utf8')).trim().split('\n').length, 6);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test('explicit execution limits finish through the game and replay their reason', async () => {
  const options = { personaId: 'careful-checker', seed: 'time-limit', timeBudgetMs: 1000 };
  const timed = await generateEpisode(options);
  assert.equal(timed.episode.outcome, 'gave-up');
  assert.equal(timed.summary.termination, 'time-budget');
  assert.ok(timed.summary.elapsedMs <= 1001);
  const replay = await generateEpisode({ ...options, replayTrace: timed.trace });
  assert.deepEqual(replay, timed);
  const capped = await generateEpisode({ personaId: 'quick-decider', seed: 'action-limit', maxActions: 2 });
  assert.equal(capped.summary.termination, 'action-limit');
  assert.equal(capped.trace.at(-1).action.type, 'giveUp');
  assert.ok(validateEpisodeReplay(capped).valid);
  await assert.rejects(generateEpisode({ ...options, personaId: 'quick-decider', sessionId: timed.episode.sessionId, replayTrace: timed.trace }), /context\/provenance mismatch/);
  const damagedTrace = structuredClone(timed.trace);
  damagedTrace[0].action.at = '1900-01-01T00:00:00.000Z';
  await assert.rejects(generateEpisode({ ...options, replayTrace: damagedTrace }), /timestamp mismatch/);
});

test('stock-aware choices use available alternatives and impossible tasks retain the original game guard', async () => {
  const milkStock = Object.fromEntries(marketProducts.filter(p => (p.familyId ?? p.id) === 'milk').map(p => [p.id, 0]));
  const result = await generateEpisode({ personaId: 'careful-checker', seed: 'stock-shortage', config: {
    objectives: [{ productId: 'milk', quantity: 1 }], stockOverrides: { milk: 0 },
  } });
  assert.equal(result.episode.outcome, 'success');
  assert.equal(result.summary.rejectedActions, 0);
  assert.equal(result.episode.finalCart.milk, undefined);
  assert.ok(validateEpisodeReplay(result).valid);
  await assert.rejects(generateEpisode({ personaId: 'careful-checker', seed: 'impossible-stock', config: {
    objectives: [{ productId: 'milk', quantity: 1 }], stockOverrides: milkStock,
  } }), /재고가 구매 수량보다 적어/);
});
