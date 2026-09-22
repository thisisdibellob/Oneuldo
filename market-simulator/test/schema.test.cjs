const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs').register();
const { generateEpisode } = require('../src/simulator.ts');
const { validateBehaviorLogs, validateGeneratedEpisode, validateBatchResponse } = require('../src/schemaValidation.ts');
let sample;
const generated = async () => sample ??= await generateEpisode({ personaId: 'careful-checker', seed: 'schema-test' });
test('generated episode matches the frontend return type and BehaviorLogRequest', async () => {
  const result = validateGeneratedEpisode(await generated());
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.ok(result.eventCount > 1);
});
test('frontend literal types, required fields, extra fields, UUIDs and provenance are enforced', async () => {
  const original = (await generated()).behaviorLogs;
  for (const corrupt of [
    (item) => { item.metadata.eventSchemaVersion = 'invented-v2'; },
    (item) => { delete item.simulation; },
    (item) => { item.metadata.newUndeclaredField = true; },
    (item) => { item.identity.sessionId = 'session-not-uuid'; },
    (item) => { item.payload.marketContent.provenance.source = 'human'; },
    (item) => { delete item.payload.marketContent.provenance.personaVersion; },
  ]) {
    const events = structuredClone(original); corrupt(events[0]);
    assert.equal(validateBehaviorLogs(events).valid, false);
  }
});
test('frontend batch response contract accepts statuses and rejects fabricated status', () => {
  const response = { batchId: 'id', events: [{ id: 'id', clientEventId: 'event', eventSequence: 1, status: 'ACCEPTED', receivedAt: '2026-01-01T00:00:00.000Z' }] };
  assert.equal(validateBatchResponse(response).valid, true);
  response.events[0].status = 'OK';
  assert.equal(validateBatchResponse(response).valid, false);
});
test('chronology and session/provenance agreement are enforced', async () => {
  const result = structuredClone(await generated());
  result.behaviorLogs[1].metadata.occurredAt = '1900-01-01T00:00:00.000Z';
  assert.equal(validateGeneratedEpisode(result).valid, false);
});
