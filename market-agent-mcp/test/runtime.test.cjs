const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { MarketAgentRuntime } = require('../src/runtime.cjs');

function runtime() {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-market-mcp-'));
  const instance = new MarketAgentRuntime({ dataDirectory });
  instance.testDataDirectory = dataDirectory;
  return instance;
}

function start(instance, overrides = {}) {
  return instance.start({
    sessionId: 'test-session',
    agentModel: 'test-model',
    personaId: 'test-persona',
    config: { seed: 'mcp-test', ...overrides },
  });
}

test('start returns a full screen observation without hidden shelf contents', () => {
  const instance = runtime();
  const response = start(instance);
  assert.equal(response.accepted, true);
  assert.equal(response.observation.screen.screenId, 'MARKET_SIMULATION');
  assert.ok(response.observation.screen.world.stations.length > 0);
  assert.ok(response.observation.screen.world.walls.length > 0);
  assert.ok(response.observation.screen.world.walkableAreas.length > 0);
  assert.ok(response.observation.screen.world.employees.length > 0);
  assert.deepEqual(response.observation.screen.visiblePanel.products, []);
  assert.deepEqual(response.observation.screen.visiblePanel.shelfSlots, {});
  assert.equal(response.observation.screen.visiblePanel.cart, null);
  assert.ok(response.observation.availableActions.some((action) => action.type === 'move'));
});

test('move is bounded, revisioned, and idempotent', () => {
  const instance = runtime();
  const initial = start(instance);
  const y = initial.observation.screen.player.position.y;
  const moved = instance.move({ sessionId: 'test-session', actionId: 'move-1', expectedRevision: 0, dx: 0, dy: -10 });
  assert.equal(moved.accepted, true);
  assert.equal(moved.revision, 1);
  assert.equal(moved.observation.screen.player.position.y, y - 10);
  assert.deepEqual(instance.move({ sessionId: 'test-session', actionId: 'move-1', expectedRevision: 0, dx: 0, dy: -10 }), moved);

  const rejected = instance.move({ sessionId: 'test-session', actionId: 'move-2', expectedRevision: 1, dx: 32, dy: 32 });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.error.code, 'ACTION_REJECTED');
  assert.equal(rejected.revision, 2);
});

test('market_act rejects movement and teleport actions', () => {
  const instance = runtime();
  start(instance);
  assert.throws(() => instance.act({ sessionId: 'test-session', actionId: 'bad-1', expectedRevision: 0, action: { type: 'move', dx: 1, dy: 1 } }), /지원하지 않는 행동/);
  assert.throws(() => instance.act({ sessionId: 'test-session', actionId: 'bad-2', expectedRevision: 0, action: { type: 'setPosition', point: { x: 1, y: 1 } } }), /지원하지 않는 행동/);
});

test('episode export is unavailable before finish and available after giveUp', () => {
  const instance = runtime();
  start(instance);
  assert.throws(() => instance.exportEpisode({ sessionId: 'test-session' }), /종료/);
  instance.act({ sessionId: 'test-session', actionId: 'finish-1', expectedRevision: 0, action: { type: 'giveUp' } });
  assert.equal(fs.existsSync(path.join(instance.testDataDirectory, 'test-session.episode.json')), true);
  const exported = instance.exportEpisode({ sessionId: 'test-session' });
  assert.equal(exported.episode.outcome, 'gave-up');
  assert.equal(exported.episode.provenance.source, 'synthetic');
});
