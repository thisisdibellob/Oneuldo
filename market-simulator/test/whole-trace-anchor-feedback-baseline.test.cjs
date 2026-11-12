'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { capture } = require('./fixtures/anchor-feedback-baseline.cjs');
const golden = require('./fixtures/anchor-feedback-baseline.json');

test('omitted anchor feedback preserves baseline bundle, inputHash, menus, candidate, audit and trace bytes', async () => {
  assert.deepEqual(await capture(), golden);
});

test('anchor feedback v1 retains its exact pre-capacity bundle, hash, menus, audit and trace bytes', async () => {
  const previous = require('./fixtures/anchor-feedback-v1-baseline.json');
  assert.deepEqual(await capture(undefined, 'recent-movement-anchor-v1'), previous);
});
