'use strict';
// Local files only. Generation never invokes measurement, grading or reporting.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertSpec, powerWarning, preserveMeasurement, historicalReport } = require('./personaValidationSpec.cjs');
const { movementOptions, assertMovementBinding, assertMovementManifest, assertMovementEvidence, movementReportFields, movementMarkdown } = require('./personaValidationMovement.cjs');
const analysis = require('./personaValidationAnalysis.cjs');
const reviewers = require('./personaValidationReviewers.cjs');
const spec = require('../validation/persona-validation-spec.json');
const { WHOLE_TRACE_POLICY_VERSION, WHOLE_TRACE_BUNDLE_VERSION, WHOLE_TRACE_CANDIDATE_VERSION, WHOLE_TRACE_MODEL } = require('./wholeTraceContracts.ts');
const { canonicalMarketReplayJson, marketReplayTraceId, validateMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const CONTROL = spec.controlPersonaId;
const IDS = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', CONTROL];
const CONDITIONS = ['low', 'high'];
const SCHEMA = 'oneuldo.persona-fidelity-run';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
const fileHash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const profile = id => { if (!IDS.includes(id)) throw new Error('Unknown validation persona'); return read(path.join(__dirname, '..', 'personas', `${id}.json`)); };
function write(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.partial`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function manifestAt(directory) { return path.join(path.resolve(directory), 'manifest.json'); }
function validateConfiguration({ runId, outputDirectory, snapshotFilePaths, seeds, personaIds }) {
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId)) throw new Error('Invalid runId');
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) throw new Error('outputDirectory is required');
  if (!snapshotFilePaths || CONDITIONS.some(k => typeof snapshotFilePaths[k] !== 'string' || !snapshotFilePaths[k])) throw new Error('Both low and high snapshotFilePaths are required');
  if (!Array.isArray(seeds) || !seeds.length || seeds.some(s => !['string', 'number'].includes(typeof s) || !String(s).trim() || String(s).length > 200 || typeof s === 'number' && !Number.isFinite(s)) || new Set(seeds.map(String)).size !== seeds.length) throw new Error('Provide unique finite or nonempty seeds');
  if (!Array.isArray(personaIds) || personaIds.length !== IDS.length || new Set(personaIds).size !== IDS.length || !IDS.every(id => personaIds.includes(id))) throw new Error('Use the three personas and neutral adult control');
}
function assertSnapshots(m) {
  for (const condition of CONDITIONS) {
    const record = m.snapshots[condition];
    if (!record || fileHash(record.filePath) !== record.sha256) throw new Error(`Snapshot file changed: ${condition}`);
    const snapshot = read(record.filePath);
    if (snapshot.snapshotId !== record.snapshotId) throw new Error(`Mixed snapshot: ${condition}`);
  }
}
function assertManifest(m, directory = m?.runDirectory) {
  if (!m || m.schema !== SCHEMA || m.version !== 2 || path.resolve(directory) !== m.runDirectory) throw new Error('Invalid validation manifest; use a new runId for the current run format');
  assertMovementManifest(m);
  validateConfiguration({ ...m, outputDirectory: path.dirname(m.runDirectory), snapshotFilePaths: Object.fromEntries(CONDITIONS.map(c => [c, m.snapshots?.[c]?.filePath])) });
  assertSpec(m, spec, 'legacy');
  if (m.analysisVersion === 1 && (!m.opportunityAudit || m.opportunityAuditHash !== digest(m.opportunityAudit))) throw new Error('Opportunity audit changed');
  if (digest(m.versions) !== digest({ policyVersion: WHOLE_TRACE_POLICY_VERSION, bundleVersion: WHOLE_TRACE_BUNDLE_VERSION, candidateVersion: WHOLE_TRACE_CANDIDATE_VERSION, model: WHOLE_TRACE_MODEL })) throw new Error('Validation generation versions changed');
  for (const id of IDS) if (m.profiles?.[id]?.hash !== digest(profile(id)) || m.profiles[id].version !== profile(id).version) throw new Error(`Persona definition changed: ${id}`);
  if (!Array.isArray(m.slots) || m.slots.length !== IDS.length * CONDITIONS.length * m.seeds.length) throw new Error('Invalid validation slot grid');
  const keys = new Set();
  for (const slot of m.slots) {
    const index = m.seeds.findIndex(s => String(s) === String(slot.seed));
    const key = `${slot.condition}:${index}:${slot.personaId}`;
    const expectedPath = path.join(m.runDirectory, 'traces', slot.condition, seedDirectory(slot.seed, index), `${slot.personaId}.json`);
    if (!CONDITIONS.includes(slot.condition) || index < 0 || !IDS.includes(slot.personaId) || keys.has(key) || slot.tracePath !== expectedPath || slot.snapshotId !== m.snapshots[slot.condition].snapshotId) throw new Error('Invalid validation slot binding');
    if (Object.entries(m.versions).some(([key, value]) => slot[key] !== value) || slot.personaVersion !== m.profiles[slot.personaId].version) throw new Error('Mixed slot versions');
    keys.add(key);
  }
  assertSnapshots(m);
  return m;
}
function readManifest(directory) { return assertManifest(read(manifestAt(directory)), path.resolve(directory)); }
function seedDirectory(seed, index) { return `${String(index + 1).padStart(4, '0')}-${digest(String(seed)).slice(0, 12)}`; }
function prepare(args) {
  const movement = movementOptions(args);
  validateConfiguration(args);
  const { runId, outputDirectory, snapshotFilePaths, seeds, personaIds } = args;
  const dir = path.resolve(outputDirectory, runId), file = manifestAt(dir);
  if (fs.existsSync(file)) {
    const m = readManifest(dir);
    assertMovementBinding(m, args, 'Existing run movement binding');
    if (digest(m.seeds) !== digest(seeds) || digest(m.personaIds) !== digest(personaIds) || CONDITIONS.some(k => path.resolve(snapshotFilePaths[k]) !== m.snapshots[k].filePath)) throw new Error('Existing run configuration differs');
    return refresh(m);
  }
  const snapshots = Object.fromEntries(CONDITIONS.map(condition => {
    const source = path.resolve(snapshotFilePaths[condition]), snapshot = read(source);
    const valid = validateMarketReplaySnapshot(snapshot);
    if (!valid.valid) throw new Error(`Invalid ${condition} snapshot: ${valid.errors.join('; ')}`);
    const goals = snapshot.config.objectives;
    if (goals.length !== (condition === 'low' ? 2 : 5)) throw new Error(`${condition} snapshot requires ${condition === 'low' ? 2 : 5} goals`);
    if (condition === 'high' && !goals.some(g => g.quantity > 1)) throw new Error('High snapshot requires a quantity greater than one');
    return [condition, { filePath: source, snapshotId: snapshot.snapshotId, sha256: fileHash(source) }];
  }));
  const versions = { policyVersion: WHOLE_TRACE_POLICY_VERSION, bundleVersion: WHOLE_TRACE_BUNDLE_VERSION, candidateVersion: WHOLE_TRACE_CANDIDATE_VERSION, model: WHOLE_TRACE_MODEL };
  const slots = CONDITIONS.flatMap(condition => seeds.flatMap((seed, index) => personaIds.map(personaId => ({
    condition, seed, personaId, tracePath: path.join(dir, 'traces', condition, seedDirectory(seed, index), `${personaId}.json`),
    snapshotId: snapshots[condition].snapshotId, ...versions, ...movement, personaVersion: profile(personaId).version, traceId: null, exists: false,
  }))));
  const m = { schema: SCHEMA, version: 2, runId, runDirectory: dir, ...movement, snapshots, seeds, personaIds, slots, versions, specHash: digest(spec), specVersion: spec.version, analysisVersion: spec.analysisVersion,
    profiles: Object.fromEntries(IDS.map(id => [id, { version: profile(id).version, hash: digest(profile(id)) }])), fixtureOnly: false };
  m.opportunityAudit = require('./personaValidationOpportunity.cjs').auditManifestSnapshots(m);
  m.opportunityAuditHash = digest(m.opportunityAudit);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  write(file, m);
  return refresh(m);
}
function evidencePaths(slot) {
  return { trace: slot.tracePath, snapshot: `${slot.tracePath}.snapshot.json`, actorDecisions: `${slot.tracePath}.actor-decisions.json`,
    knowledgeAudit: `${slot.tracePath}.knowledge-audit.json`, personaReview: `${slot.tracePath}.persona-review.json`, bundle: path.join(`${slot.tracePath}.whole-trace`, 'bundle.json') };
}
function inventory(m) {
  assertManifest(m);
  return digest({ ...movementOptions(m), ...(m.analysisVersion ? { analysisVersion: m.analysisVersion, opportunityAuditHash: m.opportunityAuditHash } : {}), specHash: m.specHash, snapshots: m.snapshots, sources: m.slots.map(slot => Object.fromEntries(Object.entries(evidencePaths(slot)).map(([key, file]) => [key, fs.existsSync(file) ? fileHash(file) : null]))) });
}
function observeSlot(slot, manifest) {
  if (!fs.existsSync(slot.tracePath)) { if (slot.traceId) throw new Error(`Recorded trace removed: ${slot.tracePath}`); slot.exists = false; return; }
  const trace = read(slot.tracePath), paths = evidencePaths(slot);
  if (manifest?.movementValidationVersion) {
    if (trace.generationPolicy === 'stochastic') throw new Error('Validation movement evidence cannot use stochastic fixtures');
    assertMovementEvidence(manifest, { trace,
      bundle: fs.existsSync(paths.bundle) ? read(paths.bundle) : null,
      audit: fs.existsSync(paths.knowledgeAudit) ? read(paths.knowledgeAudit) : null });
  }
  const hashes = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.existsSync(file) ? fileHash(file) : null]));
  if (slot.evidenceHashes && digest(slot.evidenceHashes) !== digest(hashes)) throw new Error(`Recorded trace evidence changed: ${slot.tracePath}`);
  if (slot.traceId && slot.traceId !== trace.traceId) throw new Error(`Mixed trace identity: ${slot.tracePath}`);
  slot.exists = true;
  slot.traceId = trace.traceId;
  slot.observed = { personaVersion: trace.personaVersion, policyVersion: trace.generation?.actorPolicyVersion ?? trace.generationPolicy,
    bundleVersion: fs.existsSync(paths.bundle) ? read(paths.bundle).bundleVersion : null,
    candidateVersion: fs.existsSync(paths.knowledgeAudit) ? read(paths.knowledgeAudit).candidateVersion : null };
  slot.evidenceHashes = hashes;
}
function refresh(m) {
  assertManifest(m);
  m.slots.forEach(slot => observeSlot(slot, m));
  if (m.analysisVersion !== undefined) write(manifestAt(m.runDirectory), m);
  return { runDirectory: m.runDirectory, manifestPath: manifestAt(m.runDirectory), ...movementOptions(m), slots: m.slots.map(slot => ({ ...slot,
    prepareWholeTrace: { personaId: slot.personaId, seed: slot.seed, snapshotFilePath: m.snapshots[slot.condition].filePath, outputPath: slot.tracePath, attentionExperience: { visit: 'first-play' }, ...movementOptions(m) },
  })), complete: m.slots.filter(s => s.exists).length, required: m.slots.length,
    recommendedSeedCount: 20, powerWarning: powerWarning(m.seeds), opportunityAudit: m.opportunityAudit ?? null };
}
function lookupControlSlot(args, snapshot) {
  if (args.personaId !== CONTROL) {
    const requested = movementOptions(args);
    if (!args.outputPath) {
      if (requested.movementValidationVersion) throw new Error('Movement validation requires an explicit run slot');
      return null;
    }
    const file = manifestAt(path.dirname(path.dirname(path.dirname(path.dirname(path.resolve(args.outputPath))))));
    if (!fs.existsSync(file)) {
      if (requested.movementValidationVersion) throw new Error('Movement validation outputPath is outside a validation run');
      return null;
    }
    const saved = read(file);
    if (saved.movementValidationVersion === undefined) {
      assertMovementBinding(saved, args, 'Historical validation request movement binding');
      return null;
    }
  }
  if (!args.outputPath || ['trialFile', 'learnerFile', 'tabId', 'arm', 'jobFilePath', 'generationFilePath'].some(k => args[k] !== undefined)
    || !args.attentionExperience || digest(args.attentionExperience) !== digest({ visit: 'first-play' })) throw new Error('Control requires an explicit first-play validation run slot without memory or learner');
  const directory = path.dirname(path.dirname(path.dirname(path.dirname(path.resolve(args.outputPath)))));
  if (!fs.existsSync(manifestAt(directory))) throw new Error('Control outputPath is outside a validation run');
  const m = readManifest(directory), slot = m.slots.find(s => s.tracePath === path.resolve(args.outputPath));
  assertMovementBinding(m, args, 'Validation request movement binding');
  if (!slot || slot.personaId !== args.personaId || String(slot.seed) !== String(args.seed) || slot.snapshotId !== snapshot.snapshotId || fs.existsSync(slot.tracePath)
    || digest(snapshot) !== digest(read(m.snapshots[slot.condition].filePath))) throw new Error('Control slot binding mismatch');
  return m.movementValidationVersion ? { ...slot, persona: profile(slot.personaId), validationRunDirectory: directory } : slot;
}
function load(m, { allowFixture = false } = {}) {
  assertManifest(m);
  const { extract } = require('./personaValidationMetrics.cjs');
  const { flagsForTrace } = require('./personaValidationFlags.cjs');
  const samples = [], missing = [];
  for (const slot of m.slots) {
    if (!fs.existsSync(slot.tracePath)) { if (slot.traceId) throw new Error(`Recorded trace removed: ${slot.tracePath}`); missing.push(slot); continue; }
    const paths = evidencePaths(slot), trace = read(slot.tracePath), snapshot = read(m.snapshots[slot.condition].filePath), fixture = trace.generationPolicy === 'stochastic';
    if (fixture && m.movementValidationVersion) throw new Error('Validation movement evidence cannot use stochastic fixtures');
    if (fixture && !allowFixture) throw new Error(`Stochastic trace cannot be validation evidence: ${slot.tracePath}`);
    if (trace.personaId !== slot.personaId || String(trace.seed) !== String(slot.seed) || trace.target?.snapshotId !== slot.snapshotId || slot.traceId && trace.traceId !== slot.traceId) throw new Error(`Mixed trace identity: ${slot.tracePath}`);
    if (trace.personaVersion !== m.profiles[slot.personaId].version) throw new Error(`Mixed persona version: ${slot.tracePath}`);
    const audit = fs.existsSync(paths.knowledgeAudit) ? read(paths.knowledgeAudit) : null;
    const actorDecisions = fs.existsSync(paths.actorDecisions) ? read(paths.actorDecisions) : null;
    const personaReview = fs.existsSync(paths.personaReview) ? read(paths.personaReview) : null;
    const bundle = fs.existsSync(paths.bundle) ? read(paths.bundle) : null;
    if (!fixture) {
      if (trace.experienceMode !== 'first-play') throw new Error(`Mixed experience: ${slot.tracePath}`);
      if (trace.generationPolicy !== 'llm' || trace.generation?.actorPolicyVersion !== m.versions.policyVersion || trace.generation?.model !== m.versions.model) throw new Error(`Mixed policy/model: ${slot.tracePath}`);
      if (trace.generation?.learnerIdentity || trace.generation?.trialBinding) throw new Error('Validation samples cannot carry learner/trial identities');
      if (!audit || !bundle || bundle.bundleVersion !== m.versions.bundleVersion || audit.candidateVersion !== m.versions.candidateVersion) throw new Error(`Missing or mixed bundle/candidate version: ${slot.tracePath}`);
      assertMovementEvidence(m, { trace, bundle, audit });
      if (trace.traceId !== marketReplayTraceId(trace) || audit.traceId !== trace.traceId || audit.requestId !== bundle.requestId || audit.inputHash !== bundle.inputHash
        || audit.policyVersion !== m.versions.policyVersion || bundle.policyVersion !== m.versions.policyVersion || bundle.model !== m.versions.model
        || bundle.snapshotId !== slot.snapshotId || bundle.persona?.id !== slot.personaId || bundle.persona?.version !== trace.personaVersion || String(bundle.seed) !== String(slot.seed)) throw new Error(`Mixed or altered whole-trace evidence: ${slot.tracePath}`);
      if (!fs.existsSync(paths.snapshot) || digest(read(paths.snapshot)) !== digest(snapshot)) throw new Error(`Mixed saved snapshot: ${slot.tracePath}`);
      if (bundle.persona?.behavior?.source?.promptHash !== crypto.createHash('sha256').update(profile(slot.personaId).prompt).digest('hex')) throw new Error(`Mixed persona prompt: ${slot.tracePath}`);
      if (personaReview && (personaReview.traceId !== trace.traceId || personaReview.requestId !== bundle.requestId || personaReview.knowledgeAuditHash !== digest(audit))) throw new Error(`Mixed persona review: ${slot.tracePath}`);
      if (actorDecisions && !Array.isArray(actorDecisions) && actorDecisions.traceId && actorDecisions.traceId !== trace.traceId) throw new Error('Mixed actor decisions');
    }
    observeSlot(slot, m);
    const evidenceAudit = audit ?? (actorDecisions ? { decisions: Array.isArray(actorDecisions) ? actorDecisions : actorDecisions.decisions ?? [] } : null);
    const person = profile(slot.personaId), evidence = { actorDecisions, personaReview,
      ...(m.movementValidationVersion ? { bundle } : {}) };
    const movement = m.movementValidationVersion ? require('./personaValidationMetrics.cjs').extractUniversal(
      trace, snapshot, person, evidenceAudit, evidence, { analysisVersion: 2, routeOpportunityVersion: 'continuous-route-v1' }) : null;
    samples.push({ ...slot, trace, snapshot, persona: person, audit: evidenceAudit, actorDecisions, personaReview,
      ...(movement ? { movementOpportunities: { version: 'continuous-route-v1', descriptiveOnly: true,
        metrics: movement.metrics, coverage: movement.coverage } } : {}),
      metrics: extract(trace, snapshot, person, evidenceAudit, evidence), flags: flagsForTrace(trace, snapshot, evidenceAudit, person, evidence), fixture,
      evidenceSources: Object.fromEntries(Object.entries(paths).filter(([, file]) => fs.existsSync(file))) });
  }
  if (new Set(samples.map(s => s.fixture)).size > 1) throw new Error('Fixture and whole-trace samples cannot be mixed');
  return { samples, missing };
}
function measure({ runDirectory, allowFixture = false }) {
  const m = readManifest(runDirectory), { samples, missing } = load(m, { allowFixture });
  const { cliffsDelta, bootstrap, judge } = require('./personaValidationStatistics.cjs');
  const { collectionFlags, collectionDiagnostics, collectionFindings } = require('./personaValidationFlags.cjs');
  const byKey = new Map(samples.map(s => [`${s.condition}:${s.seed}:${s.personaId}`, s]));
  const findings = [];
  for (const metric of spec.metrics) for (const condition of CONDITIONS) {
    if (metric.applies !== 'both' && metric.applies !== condition) continue;
    const pairs = []; let unexercised = 0, missingPairs = 0;
    for (const seed of m.seeds) {
      const actor = byKey.get(`${condition}:${seed}:${metric.personaId}`), control = byKey.get(`${condition}:${seed}:${CONTROL}`);
      if (!actor || !control) { missingPairs++; continue; }
      const a = actor.metrics[metric.kind], b = control.metrics[metric.kind];
      if (a?.status !== 'measured' || b?.status !== 'measured') { unexercised++; continue; }
      pairs.push([a.value, b.value]);
    }
    const delta = cliffsDelta(pairs.map(p => p[0]), pairs.map(p => p[1]));
    const interval = bootstrap(pairs, `${m.runId}:${metric.id}:${condition}`, spec.bootstrapReplicates);
    findings.push({ metricId: metric.id, traitIndex: metric.traitIndex, personaId: metric.personaId, condition, pairs: pairs.length, missingPairs, unexercised, delta, interval,
      status: judge(delta, interval, metric.expectedAgainstControl, metric.minAbsDelta ?? spec.minAbsDelta, pairs.length, metric.minValidPairs ?? spec.minValidPairs) });
  }
  const flags = Object.fromEntries(m.personaIds.map(id => {
    const rows = samples.filter(s => s.personaId === id), flagged = rows.filter(s => s.flags.length), collection = collectionFlags(rows), diagnostics = collectionDiagnostics(rows);
    const unavailableErrorCount = diagnostics.some(s => s.errorCount === null);
    const unavailableInterestCount = diagnostics.some(s => s.interestCount === null);
    const unknown = unavailableErrorCount || unavailableInterestCount;
    return [id, { traces: rows.length, flaggedTraces: flagged.length, flagRate: rows.length ? flagged.length / rows.length : null,
      collectionFlags: collection, collectionDiagnostics: diagnostics, collectionEvidence: collectionFindings(rows), unavailableErrorCount, unavailableInterestCount,
      status: !rows.length ? 'insufficient' : flagged.length / rows.length > spec.maxFlaggedTraceRate || collection.length ? 'fail' : unknown ? 'inconclusive' : 'pass',
      evidence: rows.flatMap(s => s.flags.map(f => ({ ...f, tracePath: s.tracePath }))) }];
  }));
  // Compare order within each load: incomplete grids must not confound the load mix.
  const expectedOrders = spec.expectedOrders.flatMap(order => CONDITIONS.map(condition => {
    const pairedSeeds = m.seeds.filter(seed => order.order.every(id => byKey.get(`${condition}:${seed}:${id}`)?.metrics[order.kind]?.status === 'measured'));
    const values = Object.fromEntries(order.order.map(id => { const nums = pairedSeeds.map(seed => byKey.get(`${condition}:${seed}:${id}`).metrics[order.kind].value); return [id, nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null]; }));
    return { ...order, condition, pairedSeeds: pairedSeeds.length, values, status: !pairedSeeds.length ? 'unexercised' : pairedSeeds.length < spec.minValidPairs ? 'insufficient' : order.order.every((id, i) => !i || values[order.order[i - 1]] > values[id]) ? 'pass' : 'fail' };
  }));
  const result = { schema: 'oneuldo.persona-fidelity-measurements', runId: m.runId, ...movementOptions(m), specHash: m.specHash, dataFingerprint: inventory(m),
    fixtureOnly: samples.some(s => s.fixture), completed: samples.length, missing: missing.length,
    unexercised: findings.reduce((n, f) => n + f.unexercised, 0), pairedUnexercised: findings.reduce((n, f) => n + f.unexercised, 0),
    perTraceUnexercised: samples.reduce((n, s) => n + Object.values(s.metrics).filter(metric => metric.status === 'unexercised').length, 0),
    findings, expectedOrders, flags, perTraceMetrics: samples.map(s => ({ tracePath: s.tracePath, personaId: s.personaId, condition: s.condition, metrics: s.metrics, evidenceSources: s.evidenceSources,
      ...(s.movementOpportunities ? { seed: s.seed, movementOpportunities: s.movementOpportunities } : {}) })),
    metricVectors: samples.map(s => ({ personaId: s.personaId, condition: s.condition, seed: s.seed, tracePath: s.tracePath, values: Object.fromEntries(Object.entries(s.metrics).map(([k, v]) => [k, v.value])) })) };
  const readiness = require('./personaValidationReadiness.cjs').fromManifest(m, { samples });
  if (m.analysisVersion === 1) Object.assign(result, analysis.readinessFields(readiness, findings, samples),
    { opportunityAudit: m.opportunityAudit, powerWarning: powerWarning(m.seeds), analysisVersion: m.analysisVersion, specVersion: m.specVersion },
    analysis.analyze(m, samples, findings, spec));
  m.fixtureOnly = result.fixtureOnly;
  if (m.analysisVersion !== undefined) write(manifestAt(m.runDirectory), m);
  const measurementsPath = path.join(m.runDirectory, 'measurements.json');
  if (!preserveMeasurement(m, measurementsPath, result)) write(measurementsPath, result);
  return { readiness: readiness.readiness, readinessReasons: readiness.reasons, measurementsPath, completed: result.completed, missing: result.missing, unexercised: result.unexercised, pairedUnexercised: result.pairedUnexercised, perTraceUnexercised: result.perTraceUnexercised, fixtureOnly: result.fixtureOnly };
}
function readBlind(m) {
  const saved = read(path.join(m.runDirectory, 'blind-state.json'));
  if (saved.dataFingerprint !== inventory(m)) throw new Error('Blind sample set changed; use a separate run for a new review');
  for (const [name, hash] of Object.entries(saved.hashes)) if (fileHash(path.join(m.runDirectory, name)) !== hash) throw new Error('Blind evidence changed');
  return saved;
}
function prepareBlind({ runDirectory, allowFixture = false, panel = 'A', reviewerId, reviewerKind }) {
  const m = readManifest(runDirectory);
  if (!['A', 'B'].includes(panel)) throw new Error('Expected blind panel A or B');
  reviewers.assertPanelReady({ runDirectory: m.runDirectory, panel, reviewerId, reviewerKind });
  const statePath = path.join(m.runDirectory, 'blind-state.json');
  let state;
  if (fs.existsSync(statePath)) state = readBlind(m);
  else {
    const { samples } = load(m, { allowFixture });
    if (!samples.length) throw new Error('No saved traces for blind review');
    const { build } = require('./personaValidationBlind.cjs');
    const built = build(samples, m.personaIds.map(profile));
    const files = { 'blind-bundle.json': built.bundle, 'blind-key.json': built.key, 'blind-profiles.json': built.publicProfiles };
    for (const [name, value] of Object.entries(files)) write(path.join(m.runDirectory, name), value);
    state = { dataFingerprint: inventory(m), fixtureOnly: samples.some(s => s.fixture), hashes: Object.fromEntries(Object.keys(files).map(name => [name, fileHash(path.join(m.runDirectory, name))])) };
    write(statePath, state); if (m.analysisVersion !== undefined) write(manifestAt(m.runDirectory), m);
  }
  if (state.fixtureOnly && !allowFixture) throw new Error('Stochastic trace cannot be validation evidence');
  const panels = read(path.join(m.runDirectory, 'blind-bundle.json')).panels;
  const bundle = { panels: { [panel]: panels[panel] } }, publicProfiles = read(path.join(m.runDirectory, 'blind-profiles.json'));
  require('./personaValidationBlind.cjs').assertAnonymous(bundle, m.personaIds.map(profile));
  const publicPath = path.join(m.runDirectory, `blind-${panel}.json`); write(publicPath, bundle);
  return { reviewerId: reviewerId ?? null, reviewerKind: reviewerKind ?? null, panel, bundlePath: publicPath, bundle, publicProfiles, fixtureOnly: state.fixtureOnly };
}
function submitBlind({ runDirectory, panel, answers, reviewerId, reviewerKind, reviewerModel, reviewerSession }) {
  const m = readManifest(runDirectory), state = readBlind(m);
  return reviewers.submitReview({ runDirectory: m.runDirectory, panel, answers, reviewerId, reviewerKind, reviewerModel, reviewerSession,
    state, key: read(path.join(m.runDirectory, 'blind-key.json')), validationMode: 'legacy', traitKeys: undefined });
}
function report({ runDirectory }) {
  const m = readManifest(runDirectory), measurements = read(path.join(m.runDirectory, 'measurements.json'));
  if (measurements.dataFingerprint !== inventory(m)) throw new Error('Measurements are stale; call measure_persona_validation again');
  const reviewFile = path.join(m.runDirectory, 'blind-review.json'), review = fs.existsSync(reviewFile) ? read(reviewFile) : null;
  if (review && review.dataFingerprint !== readBlind(m).dataFingerprint) throw new Error('Blind review does not match measurements');
  const traits = Object.fromEntries(IDS.filter(id => id !== CONTROL).map(id => [id, profile(id).character.selectedTraits.map((text, index) => {
    const rows = measurements.findings.filter(f => f.personaId === id && f.traitIndex === index);
    // Conditions belong to a metric; a metric has one vote, regardless of how many loads apply.
    const metrics = [...new Set(rows.map(f => f.metricId))].map(metricId => {
      const conditions = rows.filter(f => f.metricId === metricId);
      const exercised = conditions.filter(f => f.pairs > 0 || f.missingPairs > 0);
      return { metricId, status: !exercised.length ? 'unexercised' : exercised.every(f => f.status === 'pass') ? 'pass' : exercised.some(f => f.status === 'fail') ? 'fail' : 'inconclusive' };
    });
    const eligible = metrics.filter(metric => metric.status !== 'unexercised');
    return { selectedTrait: text, status: !eligible.length ? 'unexercised' : eligible.filter(v => v.status === 'pass').length > eligible.length / 2 ? 'expressed' : 'not-established', metrics, findings: rows };
  })]));
  const output = { schema: 'oneuldo.persona-fidelity-report', runId: m.runId,
    ...movementReportFields(m, measurements.perTraceMetrics), fixtureOnly: measurements.fixtureOnly, completed: measurements.completed, required: m.slots.length,
    dataFingerprint: measurements.dataFingerprint, specHash: m.specHash, coverage: { pairedUnexercised: measurements.pairedUnexercised, perTraceUnexercised: measurements.perTraceUnexercised },
    criteria: { conditionalMetricsAndEffects: measurements.findings, traits, expectedOrders: measurements.expectedOrders, prohibitedPatterns: measurements.flags, blind: review?.scores ?? null },
    traits, expectedOrders: measurements.expectedOrders, flags: measurements.flags, blindReview: review?.scores ?? null,
    blindReviewer: { model: review?.reviewerModel ?? null, session: review?.reviewerSession ?? null, independenceVerified: false, keyIsolationVerified: false },
    nearestCentroidLeaveOneOut: require('./personaValidationStatistics.cjs').nearestCentroidLeaveOneOut(measurements.metricVectors, IDS),
    limitations: '이 결과는 설계한 허구 인물이 대조군과 구별되게 행동하는지에 한정된다. 실제 지적장애인의 행동 유사성이나 임상적 타당성을 입증하지 않는다. 대조군은 지민의 취향을 공유하므로 서연·민수와의 비교에서는 취향 차이가 섞인다. 기준값은 임상 기준이 아닌 사전 설계값이다. 블라인드 세션 분리와 정답 키 미열람은 자기 신고이며 입증되지 않음으로 기록한다. 계획 trace는 실제 앱 수행이나 임상 관찰 자료가 아니다.' };
  if (fs.existsSync(path.join(m.runDirectory, 'blind-reviews.json'))) readBlind(m);
  Object.assign(output, analysis.reportFields(measurements), { referenceComparison: null },
    reviewers.summarizeReviews({ runDirectory: m.runDirectory, dataFingerprint: measurements.dataFingerprint,
      validationMode: 'legacy', traitKeys: undefined }));
  const preserved = historicalReport(m, measurements);
  if (preserved) return { validationMode: 'legacy', ...preserved };
  const reportPath = path.join(m.runDirectory, 'report.json'), markdownPath = path.join(m.runDirectory, 'report.ko.md');
  write(reportPath, output);
  const markdown = ['# 페르소나 충실도 보고서', ...analysis.readinessMarkdown(output), '', `Run: ${m.runId}. 저장 trace ${output.completed}/${output.required}. ${output.fixtureOnly ? 'stochastic fixture 파이프라인 확인용이며 검증 결과가 아님.' : 'whole-trace-v3 계획 표본.'}`, '', output.limitations,
    ...movementMarkdown(output), '', '## 조건별 효과와 특성', '', '| 인물 / 지표 | 조건 | 유효 쌍 | 미발생 | Cliff’s delta | 95% 구간 | 판정 |', '| --- | --- | ---: | ---: | ---: | --- | --- |',
    ...measurements.findings.map(f => `| ${f.metricId} | ${f.condition} | ${f.pairs} | ${f.unexercised} | ${f.delta ?? '—'} | ${f.interval?.join(' ~ ') ?? '—'} | ${f.status} |`), '',
    ...Object.entries(traits).flatMap(([id, rows]) => rows.map((r, i) => `- ${id} 특성 ${i + 1}: ${r.status} — ${r.selectedTrait}`)),
    '', '## 과장·금지 패턴', '', ...Object.entries(output.flags).map(([id, f]) => `- ${id}: ${f.status}, 플래그 ${f.flaggedTraces}/${f.traces}; 집합 ${f.collectionFlags.join(', ') || '없음'}. step ID와 파일 근거는 report.json에 보존.`),
    '', '## 블라인드 판별', '', `기존 단일 판별자: ${review ? `${review.reviewerModel} / ${review.reviewerSession}` : '저장 답안 없음'}. 명시 ID 판별자를 포함한 ${output.blindReviews.length}명의 점수는 아래 판별자별 표에 표시한다. 세션 독립성·키 미열람: 입증되지 않음.`, '', 'A판을 먼저 채점하며 B판 결과는 별도로 보고한다.', '', '```json', JSON.stringify(output.blindReview, null, 2), '```',
    ...analysis.blindMarkdown(output), ...analysis.supplementaryMarkdown(output),
    '', '## 최근접 중심 leave-one-out', '', '```json', JSON.stringify(output.nearestCentroidLeaveOneOut, null, 2), '```',
    '', '## 인물 간 기대 순서', '', ...output.expectedOrders.map(o => `- ${o.condition} ${o.kind}: ${o.status}; ${JSON.stringify(o.values)}`), '',
    `개별 trace 미발생 지표 ${output.coverage.perTraceUnexercised}건, 짝 비교 미발생 ${output.coverage.pairedUnexercised}건. 미발생은 통과·실패로 세지 않는다.`, ''].join('\n');
  fs.writeFileSync(markdownPath, markdown, { mode: 0o600 });
  return { readiness: output.readiness, readinessReasons: output.readinessReasons, reportPath, markdownPath, completed: output.completed, required: output.required, fixtureOnly: output.fixtureOnly };
}
module.exports = { prepare, refresh, lookupControlSlot, measure, prepareBlind, submitBlind, report, load, readManifest };
