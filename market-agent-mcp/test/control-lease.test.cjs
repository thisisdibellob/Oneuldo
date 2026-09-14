const assert = require('node:assert/strict');
const test = require('node:test');

const { ControlLease } = require('../src/control-lease.cjs');

test('control lease isolates MCP clients and releases ownership', () => {
  const lease = new ControlLease({ timeoutMs: 10000 });
  lease.acquire('client-a');
  lease.bind('client-a', 'game-a', 'browser-a');
  lease.assertSession('client-a', 'game-a');
  assert.throws(() => lease.acquire('client-b'), error => error.code === 'BROWSER_BUSY');
  assert.throws(() => lease.assertSession('client-b', 'game-a'), error => error.code === 'BROWSER_BUSY');
  assert.deepEqual(lease.describe('client-b'), {
    controlled: true, controlledByCurrentClient: false, sessionId: null, browserId: null, leaseTimeoutMs: 10000,
  });
  assert.equal(lease.releaseOwner('client-a'), true);
  lease.acquire('client-b');
  lease.releaseAll();
});
