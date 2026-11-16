'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createService } = require('../server.cjs');
const { writeSnapshotSet } = require('../scripts/build-validation-snapshots.cjs');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const PERSONAS = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control'];

function fixture(t, lowGoalCount) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-goal-count-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const { snapshotFilePaths } = writeSnapshotSet({ outputDirectory: path.join(directory, 'snapshots'), lowGoalCount });
  const args = { runId: 'legacy-goal-count', outputDirectory: directory, snapshotFilePaths, validationMode: 'legacy',
    seeds: ['s01'], personaIds: PERSONAS, movementValidationVersion: '1', wayfindingVersion: 'wayfinding-v4' };
  return { service, args, directory };
}

test('legacy runs keep the two-goal default and reject a four-goal low snapshot without lowGoalCount', async t => {
  const { service, args, directory } = fixture(t, 4);
  await assert.rejects(service.invokeTool('prepare_persona_validation', args), /low snapshot requires 2 goals/);
  assert.equal(fs.existsSync(path.join(directory, args.runId)), false);
});

test('an explicit legacy lowGoalCount and 200 horizon bind every slot, including the validation control', async t => {
  const { service, args } = fixture(t, 4);
  const prepared = await service.invokeTool('prepare_persona_validation', { ...args, lowGoalCount: 4, actionHorizon: 200 });
  const manifest = read(prepared.manifestPath);
  assert.equal(manifest.lowGoalCount, 4);
  assert.equal(manifest.actionHorizon, 200);
  await assert.rejects(service.invokeTool('prepare_persona_validation', { ...args, actionHorizon: 200 }), /differs/);
  await assert.rejects(service.invokeTool('prepare_persona_validation', { ...args, lowGoalCount: 4 }), /differs/);
  const slot = prepared.slots.find(entry => entry.condition === 'low' && entry.personaId === 'neutral-adult-control');
  assert.equal(slot.prepareWholeTrace.actionHorizon, 200);
  const unbound = { ...slot.prepareWholeTrace }; delete unbound.actionHorizon;
  await assert.rejects(service.invokeTool('prepare_whole_trace', unbound), /differs|frozen/);
  const ready = await service.invokeTool('prepare_whole_trace', slot.prepareWholeTrace);
  assert.equal(ready.bundle.persona.id, 'neutral-adult-control');
  assert.equal(ready.bundle.generationLimits.acceptedActionHorizon, 200);
  assert.equal(ready.bundle.worldReference.objectives.length, 4);
});
