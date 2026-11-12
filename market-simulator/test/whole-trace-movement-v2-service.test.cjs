'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../runtime.cjs');
const { createService, definitions } = require('../server.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-movement-v2-service-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'movement-v2-service', environment: { cashierCount: 2 } }));
  const prepare = extra => service.invokeTool('prepare_whole_trace', { personaId: 'careful-checker',
    seed: 'movement-v2-service', snapshot, outputPath: path.join(directory, 'trace.json'), ...extra });
  return { directory, service, prepare };
}

test('directional v2 is explicit and records separately optional recent movement feedback', async t => {
  const f = fixture(t);
  const schema = definitions.find(tool => tool.name === 'prepare_whole_trace').inputSchema;
  assert.deepEqual(schema.properties.movementFeedbackVersion.enum, ['recent-movement-v1', 'recent-movement-anchor-v1', 'recent-movement-anchor-capacity-v1']);
  const without = await f.prepare({ movementVersion: 'directional-v2' });
  assert.equal(without.bundle.movementVersion, 'directional-v2');
  assert.equal(Object.hasOwn(without.bundle, 'movementFeedbackVersion'), false);
  assert.match(without.bundle.initialChoiceFrame.source.location, /^P[0-9a-f]+$/);
  assert.match(without.bundle.initialChoiceFrame.source.navigationStateId, /^nav-v2-[0-9a-f]+$/);
  const withNotes = await f.prepare({ movementVersion: 'directional-v2', movementFeedbackVersion: 'recent-movement-v1',
    outputPath: path.join(f.directory, 'with-feedback.json') });
  assert.equal(withNotes.bundle.movementFeedbackVersion, 'recent-movement-v1');
  assert.notEqual(withNotes.bundle.inputHash, without.bundle.inputHash);
  const saved = JSON.parse(fs.readFileSync(path.join(withNotes.diagnosticDirectory, 'bundle.json'), 'utf8'));
  assert.equal(saved.movementVersion, 'directional-v2');
  assert.equal(saved.movementFeedbackVersion, 'recent-movement-v1');
  assert.equal(withNotes.bundle.initialChoiceFrame.availableChoices.filter(choice => choice.action.type === 'moveDirection').length, 8);
});

test('movement feedback cannot be silently enabled on default or directional v1 requests', async t => {
  const f = fixture(t);
  for (const options of [
    { movementFeedbackVersion: 'recent-movement-v1' },
    { movementVersion: 'directional-v1', movementFeedbackVersion: 'recent-movement-v1' },
    { movementVersion: 'directional-v2', movementFeedbackVersion: 'recent-movement-v2' },
    { movementVersion: 'directional-v2', movementFeedbackVersion: null },
  ]) await assert.rejects(f.prepare(options), /movementFeedbackVersion/);
  assert.equal(fs.existsSync(path.join(f.directory, 'trace.json.whole-trace')), false);
});
