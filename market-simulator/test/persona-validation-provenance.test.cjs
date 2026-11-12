'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { generateTrace } = require('../src/simulator.ts');
const run = require('../src/validation/personaValidationRun.cjs');
const { createService } = require('../server.cjs');
const ids = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control'];
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); };
function setup(t, seeds = ['seed-1']) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-provenance-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotFilePaths = {};
  for (const [condition, goals] of Object.entries({ low: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 }],
    high: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 }, { productId: 'curry', quantity: 1 }, { productId: 'water', quantity: 2 }, { productId: 'banana', quantity: 1 }] })) {
    snapshotFilePaths[condition] = path.join(directory, `${condition}.json`);
    write(snapshotFilePaths[condition], createMarketReplaySnapshot(createMarketSession({ seed: condition, difficulty: 'exact', objectives: goals })));
  }
  const args = { runId: 'validation', outputDirectory: directory, snapshotFilePaths, seeds, personaIds: ids, validationMode: 'legacy' };
  return { args, prepared: run.prepare(args), directory };
}
function fixture(slot) {
  return { traceSchemaVersion: '2', traceId: `fixture-${slot.condition}-${slot.seed}-${slot.personaId}`, generationPolicy: 'stochastic',
    personaId: slot.personaId, personaVersion: require(`../personas/${slot.personaId}.json`).version, seed: slot.seed,
    target: { snapshotId: slot.snapshotId }, steps: [{ id: 's1', type: 'giveUp', reactionDelayMs: 100, reason: 'finish' }] };
}
function populate(f, count = f.prepared.slots.length) { f.prepared.slots.slice(0, count).forEach(slot => write(slot.tracePath, fixture(slot))); }

test('prepare validates a safe grid, quantity load, immutable snapshots and resume configuration', t => {
  const f = setup(t, ['../unsafe/seed', 2]);
  assert.equal(f.prepared.required, 16);
  assert.ok(f.prepared.slots.every(slot => slot.tracePath.startsWith(path.join(f.prepared.runDirectory, 'traces') + path.sep)));
  assert.equal(run.prepare(f.args).complete, 0);
  assert.throws(() => run.prepare({ ...f.args, seeds: [] }), /unique/);
  assert.throws(() => run.prepare({ ...f.args, seeds: [1, '1'] }), /unique/);
  assert.throws(() => run.prepare({ ...f.args, personaIds: [...ids, ids[0]] }), /three personas/);
  assert.throws(() => run.prepare({ ...f.args, seeds: ['changed'] }), /configuration differs/);
  const snapshot = read(f.args.snapshotFilePaths.high); snapshot.config.objectives[0].quantity += 1;
  write(f.args.snapshotFilePaths.high, snapshot);
  assert.throws(() => run.prepare(f.args), /Snapshot file changed/);
});

test('missing slots are explicit and non-exercised data do not count as a passed trait', t => {
  const f = setup(t);
  const measured = run.measure({ runDirectory: f.prepared.runDirectory });
  assert.equal(measured.completed, 0); assert.equal(measured.missing, 8);
  const report = run.report({ runDirectory: f.prepared.runDirectory });
  const saved = read(report.reportPath);
  assert.ok(Object.values(saved.traits).flat().every(trait => trait.status !== 'expressed'));
  assert.ok(Object.values(saved.flags).every(group => group.status === 'insufficient'));
});

test('measurement rejects identity/version/policy corruption and never launders it during refresh', t => {
  const f = setup(t), slot = f.prepared.slots[0], source = fixture(slot);
  for (const change of [{ seed: 'other' }, { personaId: ids[1] }, { personaVersion: 'old' }, { target: { snapshotId: 'other' } }]) {
    write(slot.tracePath, { ...source, ...change });
    assert.throws(() => run.measure({ runDirectory: f.prepared.runDirectory, allowFixture: true }), /Mixed/);
  }
  write(slot.tracePath, source);
  run.prepare(f.args);
  write(slot.tracePath, { ...source, traceId: 'different' });
  assert.throws(() => run.prepare(f.args), /evidence changed|Mixed trace/);
});

test('changing sources invalidates measured reports and frozen blind evidence', t => {
  const f = setup(t); populate(f, 1);
  run.measure({ runDirectory: f.prepared.runDirectory, allowFixture: true });
  run.prepareBlind({ runDirectory: f.prepared.runDirectory, allowFixture: true });
  const next = f.prepared.slots[1]; write(next.tracePath, fixture(next));
  assert.throws(() => run.report({ runDirectory: f.prepared.runDirectory }), /stale/);
  assert.throws(() => run.prepareBlind({ runDirectory: f.prepared.runDirectory, allowFixture: true }), /sample set changed/);
});

test('blind review gates panels, validates confidence, freezes answers and reports self-declaration', t => {
  const f = setup(t); populate(f);
  run.measure({ runDirectory: f.prepared.runDirectory, allowFixture: true });
  assert.throws(() => run.prepareBlind({ runDirectory: f.prepared.runDirectory, panel: 'B', allowFixture: true }), /Score panel A/);
  const prepared = run.prepareBlind({ runDirectory: f.prepared.runDirectory, allowFixture: true });
  assert.equal(prepared.publicProfiles.length, 4);
  assert.equal(prepared.bundle.publicProfiles, undefined);
  assert.ok(!JSON.stringify(prepared.bundle).includes('personaId'));
  assert.throws(() => run.prepareBlind({ runDirectory: f.prepared.runDirectory }), /Stochastic/);
  const key = read(path.join(f.prepared.runDirectory, 'blind-key.json'));
  const answers = Object.fromEntries(key.filter(row => row.version === 'A').map(row => [row.opaqueId, { personaId: row.personaId, confidence: .8 }]));
  const args = { runDirectory: f.prepared.runDirectory, panel: 'A', answers, reviewerModel: 'self-reported', reviewerSession: 'new-session' };
  const invalid = structuredClone(answers); Object.values(invalid)[0].confidence = 1.1;
  assert.throws(() => run.submitBlind({ ...args, answers: invalid }), /confidence/);
  assert.equal(run.submitBlind(args).score.accuracy, 1);
  assert.equal(run.submitBlind(args).score.accuracy, 1);
  const changed = structuredClone(answers); Object.values(changed)[0].personaId = ids[1];
  if (JSON.stringify(changed) === JSON.stringify(answers)) Object.values(changed)[0].personaId = ids[2];
  assert.throws(() => run.submitBlind({ ...args, answers: changed }), /frozen/);
  const b = run.prepareBlind({ runDirectory: f.prepared.runDirectory, panel: 'B', allowFixture: true });
  const aIds = new Set(prepared.bundle.panels.A.map(row => row.opaqueId));
  assert.ok(b.bundle.panels.B.every(row => !aIds.has(row.opaqueId)));
  const report = read(run.report({ runDirectory: f.prepared.runDirectory }).reportPath);
  assert.equal(report.blindReviewer.independenceVerified, false);
  assert.equal(report.blindReviewer.keyIsolationVerified, false);
  assert.match(report.limitations, /입증되지 않음/);
});

test('control slot rejects spoofed snapshots, additional experience and stale existence', t => {
  const f = setup(t), slot = f.prepared.slots.find(row => row.personaId === ids[3]);
  const snapshot = read(f.args.snapshotFilePaths.low), args = slot.prepareWholeTrace;
  assert.ok(run.lookupControlSlot(args, snapshot));
  assert.throws(() => run.lookupControlSlot({ ...args, attentionExperience: { visit: 'first-play', memory: {} } }, snapshot), /without memory/);
  const spoofed = structuredClone(snapshot); spoofed.config.objectives[0].quantity += 1;
  assert.throws(() => run.lookupControlSlot(args, spoofed), /binding mismatch/);
  write(slot.tracePath, fixture(slot));
  assert.throws(() => run.lookupControlSlot(args, snapshot), /binding mismatch/);
});

test('real stochastic outputs serve only as pipeline fixtures, including interactive CLI', async t => {
  const f = setup(t), service = createService({ bridge: { start() { throw new Error('No app/backend'); }, close() {} } });
  t.after(() => service.close());
  for (const condition of ['low', 'high']) {
    const snapshot = read(f.args.snapshotFilePaths[condition]);
    const source = await generateTrace({ snapshot, personaId: ids[0], seed: 'seed-1', mode: 'stochastic', timingProfile: 'original' });
    for (const slot of f.prepared.slots.filter(row => row.condition === condition)) {
      const trace = structuredClone(source);
      // Explicit pipeline fixture copies: never presented as independently generated persona evidence.
      Object.assign(trace, { personaId: slot.personaId, personaVersion: require(`../personas/${slot.personaId}.json`).version });
      write(slot.tracePath, trace);
    }
  }
  await assert.rejects(service.invokeTool('measure_persona_validation', { runDirectory: f.prepared.runDirectory }), /Stochastic/);
  const measured = await service.invokeTool('measure_persona_validation', { runDirectory: f.prepared.runDirectory, allowFixture: true });
  assert.equal(measured.completed, 8); assert.equal(measured.fixtureOnly, true);
  const child = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs'), 'interactive'], {
    input: JSON.stringify({ tool: 'persona_validation_report', arguments: { runDirectory: f.prepared.runDirectory } }) + '\n', encoding: 'utf8', timeout: 30000,
  });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /fixtureOnly/);
  assert.match(fs.readFileSync(path.join(f.prepared.runDirectory, 'report.ko.md'), 'utf8'), /파이프라인 확인용/);
});

test('missing load conditions cannot be dropped to promote a trait', t => {
  const f = setup(t);
  const measured = run.measure({ runDirectory: f.prepared.runDirectory });
  const data = read(measured.measurementsPath);
  const rows = data.findings.filter(row => row.personaId === 'careful-checker' && row.traitIndex === 0);
  Object.assign(rows.find(row => row.condition === 'low'), { pairs: 8, missingPairs: 0, status: 'pass' });
  Object.assign(rows.find(row => row.condition === 'high'), { pairs: 0, missingPairs: 8, status: 'insufficient' });
  write(measured.measurementsPath, data);
  const report = read(run.report({ runDirectory: f.prepared.runDirectory }).reportPath);
  assert.equal(report.traits['careful-checker'][0].status, 'not-established');
});

test('a persistent process rejects a changed on-disk metric spec', t => {
  const f = setup(t), original = fs.readFileSync;
  fs.readFileSync = function(file, ...args) {
    const text = original.call(this, file, ...args);
    if (String(file).endsWith('/validation/persona-validation-spec.json')) {
      const altered = JSON.parse(text); altered.minAbsDelta = .01; return JSON.stringify(altered);
    }
    return text;
  };
  try { assert.throws(() => run.measure({ runDirectory: f.prepared.runDirectory }), /spec changed/); }
  finally { fs.readFileSync = original; }
});

test('ordinary generation, whole submission and actor finalize do not load the fidelity validator', async t => {
  const f = setup(t), Module = require('node:module'), originalLoad = Module._load;
  Module._load = function(request, ...args) {
    if (String(request).includes('personaValidation')) throw new Error('Fidelity validator must stay manual');
    return originalLoad.call(this, request, ...args);
  };
  const service = createService();
  try {
    const snapshot = read(f.args.snapshotFilePaths.low);
    await service.invokeTool('generate_trace', { personaId: ids[0], seed: 'isolation', snapshot, mode: 'stochastic', outputPath: path.join(f.directory, 'generated.json') });
    const prepared = await service.invokeTool('prepare_whole_trace', { personaId: ids[1], seed: 'isolation', snapshot, outputPath: path.join(f.directory, 'whole.json') });
    const saved = await service.invokeTool('submit_whole_trace', { requestId: prepared.requestId, candidate: { candidateVersion: '7', requestId: prepared.requestId, decisions: [{
      choiceRef: { source: prepared.bundle.initialChoiceFrame.source, choiceId: 'control/giveUp' }, delayMs: 100, reason: '장보기를 마친다',
      basis: { intent: 'finish', goalId: null, memoryUses: [] }, actorState: { activity: 'finish', task: '장보기를 마친다', heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' },
    }] } });
    assert.equal(saved.status, 'complete');
    const begun = await service.invokeTool('begin_actor_plan', { personaId: ids[2], seed: 'isolation', snapshot, outputPath: path.join(f.directory, 'actor.json') });
    const frame = await service.invokeTool('observe_actor_plan', { sessionId: begun.sessionId });
    const exit = frame.availableChoices.find(choice => choice.action.type === 'giveUp');
    assert.ok(exit);
    await service.invokeTool('append_actor_plan', { sessionId: begun.sessionId, revision: frame.revision, choiceIds: [exit.id], delayMs: [100], reasons: ['장보기를 마친다'] });
    for (let i = 0; i < 100; i++) {
      const current = await service.invokeTool('observe_actor_plan', { sessionId: begun.sessionId });
      if (current.status === 'complete') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const completed = await service.invokeTool('finalize_actor_plan', { sessionId: begun.sessionId });
    assert.ok(fs.existsSync(completed.outputPath));
  } finally { Module._load = originalLoad; await service.close(); }
});
