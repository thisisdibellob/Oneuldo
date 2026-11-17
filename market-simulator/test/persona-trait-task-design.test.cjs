'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createService, definitions } = require('../server.cjs');
const { writeSnapshotSet } = require('../scripts/build-validation-snapshots.cjs');
const { canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
const spec = require('../validation/persona-trait-validation-spec-v3.json');
const BASE = 'mild-intellectual-disability-adult';
function fixture(t, lowGoalCount = 2) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trait-task-design-'));
  const service = createService();
  t.after(async () => { await service.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const { snapshotFilePaths } = writeSnapshotSet({ outputDirectory: path.join(directory, 'snapshots'), lowGoalCount });
  const args = { runId: 'task-design', outputDirectory: directory, snapshotFilePaths, validationMode: 'traits',
    profiles: ['low', 'high'].map(level => ({ id: `checking-${level}`, basePersonaId: BASE,
      schemaVersion: 'persona-traits-v2', traits: { checking: level } })), seeds: ['s01'] };
  return { service, args, directory };
}
async function saveOneTrace(service, ready) {
  const slot = ready.missingSlots[0];
  const prepared = await service.invokeTool('prepare_whole_trace', slot.prepareWholeTrace);
  const requestId = prepared.requestId;
  await service.invokeTool('begin_whole_trace_authoring', { requestId });
  const decision = { choiceRef: { choiceId: 'control/giveUp' }, delayMs: 500, reason: '출처 연결 회귀 테스트의 종료',
    basis: { intent: 'finish', goalId: null, memoryUses: [] },
    actorState: { activity: 'finish', task: '테스트 종료', heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null,
      focusedProductId: null, orientation: 'unfamiliar' } };
  assert.equal((await service.invokeTool('append_whole_trace_decision', { requestId, decision })).accepted, true);
  const { candidate } = await service.invokeTool('finish_whole_trace_authoring', { requestId });
  assert.equal((await service.invokeTool('submit_whole_trace', { requestId, candidate })).status, 'complete');
}

for (const count of [undefined, 3]) test(`actual service preserves ${count === undefined ? 'the default two-goal contract' : 'an explicit three-goal design'} through prepare, readiness, measurement and report`, async t => {
  const { service, args } = fixture(t, count ?? 2);
  if (count !== undefined) args.lowGoalCount = count;
  const prepared = await service.invokeTool('prepare_persona_validation', args);
  const manifest = read(prepared.manifestPath), originalBytes = fs.readFileSync(prepared.manifestPath);
  assert.equal(manifest.specHash, hash(spec));
  assert.equal(manifest.slots.length, 4);
  const ready = await service.invokeTool('check_persona_validation_readiness', { runDirectory: prepared.runDirectory });
  assert.deepEqual(fs.readFileSync(prepared.manifestPath), originalBytes, 'Readiness is read-only');
  await saveOneTrace(service, ready);
  const after = await service.invokeTool('check_persona_validation_readiness', { runDirectory: prepared.runDirectory });
  assert.equal(after.complete, 1);
  assert.equal(after.technicalFailures.length, 0);
  const measured = await service.invokeTool('measure_persona_validation', { runDirectory: prepared.runDirectory });
  const data = read(measured.measurementsPath);
  const reported = await service.invokeTool('persona_validation_report', { runDirectory: prepared.runDirectory });
  const report = read(reported.reportPath);
  assert.equal(data.completed, 1); assert.equal(report.completed, 1);
  assert.equal(data.specHash, manifest.specHash); assert.equal(report.specHash, manifest.specHash);
  if (count === undefined) {
    for (const output of [manifest, prepared, ready, after, measured, data, reported, report]) {
      assert.equal(Object.hasOwn(output, 'taskDesign'), false);
      assert.equal(Object.hasOwn(output, 'taskDesignHash'), false);
    }
    assert.doesNotMatch(fs.readFileSync(reported.markdownPath, 'utf8'), /과제 설계:/);
  } else {
    const design = { version: 'goal-count-v1', goalCounts: { low: count, high: 5 } };
    for (const output of [manifest, prepared, ready, after, measured, data, reported, report]) {
      assert.deepEqual(output.taskDesign, design);
      assert.equal(output.taskDesignHash, hash(design));
    }
    assert.match(fs.readFileSync(reported.markdownPath, 'utf8'), /과제 설계: low 목표 3개 \/ high 목표 5개/);
    assert.equal(data.perTrace[0].outcome.goalCount, 3);
    assert.equal(data.perTrace[0].outcome.ending, 'giveUp');
  }
});

test('explicit task design cannot change or disappear on reprepare, and mismatched snapshots are rejected', async t => {
  const { service, args, directory } = fixture(t, 3);
  const prepared = await service.invokeTool('prepare_persona_validation', { ...args, lowGoalCount: 3 });
  const before = fs.readFileSync(prepared.manifestPath);
  await assert.rejects(service.invokeTool('prepare_persona_validation', args), /task design differs/);
  await assert.rejects(service.invokeTool('prepare_persona_validation', { ...args, lowGoalCount: 4 }), /task design differs/);
  assert.deepEqual(fs.readFileSync(prepared.manifestPath), before);
  assert.equal((await service.invokeTool('prepare_persona_validation', { ...args, lowGoalCount: 3 })).required, 4);
  await assert.rejects(service.invokeTool('prepare_persona_validation', { ...args, runId: 'wrong-count' }), /requires 2 goals/);
  assert.equal(fs.existsSync(path.join(directory, 'wrong-count')), false);
});

test('task-design hash, shape and actual snapshot goal counts are bound during readiness and measurement', async t => {
  const { service, args } = fixture(t, 3);
  const prepared = await service.invokeTool('prepare_persona_validation', { ...args, lowGoalCount: 3 });
  const original = read(prepared.manifestPath), originalBytes = fs.readFileSync(prepared.manifestPath);
  for (const change of [
    m => { m.taskDesignHash = '0'.repeat(64); },
    m => { m.taskDesign.goalCounts.low = 2; m.taskDesignHash = hash(m.taskDesign); },
    m => { delete m.taskDesign; delete m.taskDesignHash; },
    m => { m.taskDesign.extra = true; m.taskDesignHash = hash(m.taskDesign); },
  ]) {
    const changed = structuredClone(original); change(changed);
    fs.writeFileSync(prepared.manifestPath, JSON.stringify(changed));
    for (const tool of ['check_persona_validation_readiness', 'measure_persona_validation'])
      await assert.rejects(service.invokeTool(tool, { runDirectory: prepared.runDirectory }), /task design|Task design/);
    fs.writeFileSync(prepared.manifestPath, originalBytes);
  }
  assert.equal((await service.invokeTool('check_persona_validation_readiness', { runDirectory: prepared.runDirectory })).required, 4);
});

test('lowGoalCount is a bounded opt-in (traits v2 or legacy) and the tool schema exposes it', async t => {
  const { service, args, directory } = fixture(t, 4);
  assert.deepEqual(definitions.find(d => d.name === 'prepare_persona_validation').inputSchema.properties.lowGoalCount,
    { type: 'integer', minimum: 2, maximum: 4 });
  for (const count of [1, 5, 2.5, '3']) {
    await assert.rejects(service.invokeTool('prepare_persona_validation', { ...args, lowGoalCount: count }), /lowGoalCount/);
    assert.equal(fs.existsSync(path.join(directory, args.runId)), false);
  }
  const v1 = { ...args, lowGoalCount: 4, profiles: args.profiles.map(p => ({ ...p, schemaVersion: 'persona-traits-v1' })) };
  await assert.rejects(service.invokeTool('prepare_persona_validation', v1), /only for traits catalog v2/);
  const { profiles, ...withoutProfiles } = args;
  // Legacy runs accept an explicit lowGoalCount (see persona-validation-legacy-goal-count) but keep its bounds.
  await assert.rejects(service.invokeTool('prepare_persona_validation', { ...withoutProfiles, lowGoalCount: 5, validationMode: 'legacy',
    personaIds: ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control'] }), /lowGoalCount/);
  const prepared = await service.invokeTool('prepare_persona_validation', { ...args, lowGoalCount: 4 });
  assert.equal(prepared.taskDesign.goalCounts.low, 4);
});
