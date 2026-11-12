'use strict';
// Pure file-based evaluation. Actors, app replay and model judges are supplied externally.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertSpec, powerWarning, preserveMeasurement, historicalReport } = require('./personaValidationSpec.cjs');
const { movementOptions, assertMovementBinding, assertMovementManifest, assertMovementEvidence, movementReportFields, movementMarkdown } = require('./personaValidationMovement.cjs');
const analysis = require('./personaValidationAnalysis.cjs');
const reviewers = require('./personaValidationReviewers.cjs');
const { getCatalog, getTraitKeys, resolveProfiles } = require('./personaTraitProfiles.cjs');
const currentSpec = require('../../validation/persona-trait-validation-spec-v3.json');
const previousSpec = require('../../validation/persona-trait-validation-spec.json');
const { WHOLE_TRACE_POLICY_VERSION, WHOLE_TRACE_BUNDLE_VERSION, WHOLE_TRACE_CANDIDATE_VERSION, WHOLE_TRACE_MODEL } = require('../wholeTrace/wholeTraceContracts.ts');
const { canonicalMarketReplayJson, marketReplayTraceId, validateMarketReplaySnapshot } = require('../../../frontend/src/game/marketReplayTrace.ts');
const CONDITIONS = ['low', 'high'];
const catalogVersion = m => m.catalogSchemaVersion ?? Object.values(m.profiles ?? {}).find(p => p.persona?.traitProfile)?.persona.traitProfile.schemaVersion ?? 'persona-traits-v1';
const specFor = m => assertSpec(m, currentSpec, 'traits');
const writableManifest = m => m.analysisVersion === 2 || m.movementValidationVersion === '1';
const LEVEL = { low: 0, medium: 1, high: 2 };
const DEFAULT_PERSONAS = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider'];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
// Present only for trait-omitted baselines so earlier outputs keep their bytes.
const traitModeOf = profile => profile.definition?.traitMode ? { traitMode: profile.definition.traitMode } : {};
const baselineIds = m => Object.values(m.profiles).filter(p => p.traits === null).map(p => p.id);
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
const fileHash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestAt = directory => path.join(path.resolve(directory), 'manifest.json');
const taskDesignFields = m => m.taskDesign === undefined ? {} : {
  taskDesign: structuredClone(m.taskDesign), taskDesignHash: m.taskDesignHash };
function requestedTaskDesign(args, schemaVersion) {
  if (args.lowGoalCount === undefined) return {};
  if (schemaVersion !== 'persona-traits-v2') throw new Error('lowGoalCount is supported only for traits catalog v2');
  const taskDesign = { version: 'goal-count-v1', goalCounts: { low: args.lowGoalCount, high: 5 } };
  return { taskDesign, taskDesignHash: digest(taskDesign) };
}
function assertTaskDesign(m) {
  if (m.taskDesign === undefined) {
    if (m.taskDesignHash !== undefined) throw new Error('Task design hash has no task design');
    return { low: 2, high: 5 };
  }
  const low = m.taskDesign?.goalCounts?.low;
  if (catalogVersion(m) !== 'persona-traits-v2' || !Number.isInteger(low) || low < 2 || low > 4)
    throw new Error('Invalid task design goal count or catalog');
  const expected = { version: 'goal-count-v1', goalCounts: { low, high: 5 } };
  if (digest(m.taskDesign) !== digest(expected) || m.taskDesignHash !== digest(expected)) throw new Error('Task design changed');
  return expected.goalCounts;
}
const seedDirectory = (seed, index) => `${String(index + 1).padStart(4, '0')}-${digest(String(seed)).slice(0, 12)}`;
const versions = () => ({ policyVersion: WHOLE_TRACE_POLICY_VERSION, bundleVersion: WHOLE_TRACE_BUNDLE_VERSION,
  candidateVersion: WHOLE_TRACE_CANDIDATE_VERSION, model: WHOLE_TRACE_MODEL });
function write(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.partial`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function validateConfiguration(args) {
  if (typeof args.runId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(args.runId)) throw new Error('Invalid runId');
  if (typeof args.outputDirectory !== 'string' || !args.outputDirectory.trim()) throw new Error('outputDirectory is required');
  if (!args.snapshotFilePaths || CONDITIONS.some(c => typeof args.snapshotFilePaths[c] !== 'string' || !args.snapshotFilePaths[c])) throw new Error('Both low and high snapshotFilePaths are required');
  if (!Array.isArray(args.seeds) || !args.seeds.length || args.seeds.some(s => !['string', 'number'].includes(typeof s)
    || !String(s).trim() || String(s).length > 200 || typeof s === 'number' && !Number.isFinite(s))
    || new Set(args.seeds.map(String)).size !== args.seeds.length) throw new Error('Provide unique finite or nonempty seeds');
  if (args.profiles !== undefined && args.personaIds !== undefined) throw new Error('Use profiles or personaIds, not both');
  if (args.lowGoalCount !== undefined && (!Number.isInteger(args.lowGoalCount) || args.lowGoalCount < 2 || args.lowGoalCount > 4))
    throw new Error('lowGoalCount must be an integer from 2 to 4');
}
function selectionOf(args) {
  return args.profiles !== undefined ? { profiles: args.profiles } : { personaIds: args.personaIds ?? DEFAULT_PERSONAS };
}
function profileMap(selection, schemaVersion) { return Object.fromEntries(resolveProfiles(selection, schemaVersion).map(p => [p.id, p])); }
function assertManifest(m, directory = m?.runDirectory) {
  if (!m || m.schema !== 'oneuldo.persona-fidelity-run' || m.version !== 3 || path.resolve(directory) !== m.runDirectory) throw new Error('Invalid trait validation manifest');
  assertMovementManifest(m);
  validateConfiguration({ runId: m.runId, seeds: m.seeds, outputDirectory: path.dirname(m.runDirectory),
    snapshotFilePaths: Object.fromEntries(CONDITIONS.map(c => [c, m.snapshots?.[c]?.filePath])) });
  const spec = specFor(m), schemaVersion = catalogVersion(m), catalog = getCatalog(schemaVersion);
  const goalCounts = assertTaskDesign(m);
  if (spec.analysisVersion === 2 && schemaVersion !== spec.catalogSchemaVersion || spec.analysisVersion !== 2 && schemaVersion !== 'persona-traits-v1') throw new Error('Trait catalog and analysis version differ');
  if (m.analysisVersion >= 1 && (!m.opportunityAudit || m.opportunityAuditHash !== digest(m.opportunityAudit))) throw new Error('Opportunity audit changed');
  const catalogFile = schemaVersion === 'persona-traits-v1' ? 'persona-traits.json' : 'persona-traits-v2.json';
  if (m.catalogHash !== digest(catalog) || m.catalogHash !== digest(read(path.join(__dirname, '../../validation', catalogFile)))) throw new Error('Trait catalog changed; create a separate run');
  if (digest(m.versions) !== digest(versions())) throw new Error('Validation generation versions changed');
  const current = profileMap(m.profileSelection, schemaVersion);
  if (digest(Object.keys(current)) !== digest(m.personaIds) || digest(current) !== digest(m.profiles)) throw new Error('Trait profile definition changed');
  for (const [id, hash] of Object.entries(m.baseHashes))
    if (fileHash(path.join(__dirname, '../../personas', `${id}.json`)) !== hash) throw new Error(`Base persona definition changed: ${id}`);
  for (const condition of CONDITIONS) {
    const snapshot = m.snapshots[condition];
    if (!snapshot || fileHash(snapshot.filePath) !== snapshot.sha256 || read(snapshot.filePath).snapshotId !== snapshot.snapshotId) throw new Error(`Snapshot file changed: ${condition}`);
    if (read(snapshot.filePath).config.objectives.length !== goalCounts[condition]) throw new Error(`${condition} snapshot goal count differs from task design`);
  }
  if (!Array.isArray(m.slots) || m.slots.length !== m.personaIds.length * CONDITIONS.length * m.seeds.length) throw new Error('Invalid validation slot grid');
  const seen = new Set();
  for (const slot of m.slots) {
    const index = m.seeds.findIndex(seed => String(seed) === String(slot.seed));
    const key = `${slot.condition}:${index}:${slot.personaId}`;
    const expected = path.join(m.runDirectory, 'traces', slot.condition, seedDirectory(slot.seed, index), `${slot.personaId}.json`);
    if (index < 0 || !CONDITIONS.includes(slot.condition) || !m.personaIds.includes(slot.personaId) || seen.has(key)
      || slot.tracePath !== expected || slot.snapshotId !== m.snapshots[slot.condition].snapshotId
      || slot.personaVersion !== current[slot.personaId].persona.version
      || Object.entries(m.versions).some(([key, value]) => slot[key] !== value)) throw new Error('Invalid validation slot binding');
    seen.add(key);
  }
  return m;
}
function readManifest(directory) { return assertManifest(read(manifestAt(directory)), path.resolve(directory)); }
function evidencePaths(slot) {
  return { trace: slot.tracePath, snapshot: `${slot.tracePath}.snapshot.json`, actorDecisions: `${slot.tracePath}.actor-decisions.json`,
    knowledgeAudit: `${slot.tracePath}.knowledge-audit.json`, personaReview: `${slot.tracePath}.persona-review.json`,
    bundle: path.join(`${slot.tracePath}.whole-trace`, 'bundle.json') };
}
function evidenceHashes(slot) { return Object.fromEntries(Object.entries(evidencePaths(slot)).map(([key, file]) => [key, fs.existsSync(file) ? fileHash(file) : null])); }
function inventory(m) {
  assertManifest(m);
  return digest({ ...movementOptions(m), ...taskDesignFields(m), ...(m.analysisVersion ? { analysisVersion: m.analysisVersion, opportunityAuditHash: m.opportunityAuditHash } : {}), specHash: m.specHash, catalogHash: m.catalogHash, profiles: m.profiles, snapshots: m.snapshots,
    sources: m.slots.map(evidenceHashes) });
}
function observeSlot(slot, manifest) {
  if (!fs.existsSync(slot.tracePath)) {
    if (slot.traceId) throw new Error(`Recorded trace removed: ${slot.tracePath}`);
    slot.exists = false; return;
  }
  const trace = read(slot.tracePath), hashes = evidenceHashes(slot);
  if (manifest?.movementValidationVersion) {
    if (trace.generationPolicy === 'stochastic') throw new Error('Validation movement evidence cannot use stochastic fixtures');
    const paths = evidencePaths(slot);
    assertMovementEvidence(manifest, { trace,
      bundle: fs.existsSync(paths.bundle) ? read(paths.bundle) : null,
      audit: fs.existsSync(paths.knowledgeAudit) ? read(paths.knowledgeAudit) : null });
  }
  if (slot.evidenceHashes && digest(slot.evidenceHashes) !== digest(hashes)) throw new Error(`Recorded trace evidence changed: ${slot.tracePath}`);
  if (slot.traceId && slot.traceId !== trace.traceId) throw new Error('Mixed trace identity');
  slot.exists = true; slot.traceId = trace.traceId; slot.evidenceHashes = hashes;
}
function refresh(m) {
  assertManifest(m); m.slots.forEach(slot => observeSlot(slot, m)); if (writableManifest(m)) write(manifestAt(m.runDirectory), m);
  return { validationMode: 'traits', runDirectory: m.runDirectory, manifestPath: manifestAt(m.runDirectory), ...movementOptions(m), ...taskDesignFields(m),
    catalog: getCatalog(catalogVersion(m)), profiles: Object.values(m.profiles).map(p => ({ id: p.id, presetId: p.presetId, traits: p.traits, ...traitModeOf(p), contextHash: p.contextHash })),
    slots: m.slots.map(slot => ({ ...slot, prepareWholeTrace: { personaId: slot.personaId, seed: slot.seed,
      snapshotFilePath: m.snapshots[slot.condition].filePath, outputPath: slot.tracePath, attentionExperience: { visit: 'first-play' }, ...movementOptions(m) } })),
    complete: m.slots.filter(s => s.exists).length, required: m.slots.length,
    recommendedSeedCount: 20, powerWarning: powerWarning(m.seeds), opportunityAudit: m.opportunityAudit ?? null };
}
function prepare(args) {
  const movement = movementOptions(args);
  validateConfiguration(args);
  const profileSelection = selectionOf(args);
  const requestedVersion = args.catalogSchemaVersion ?? args.profiles?.find(p => p.schemaVersion)?.schemaVersion;
  const dir = path.resolve(args.outputDirectory, args.runId), file = manifestAt(dir);
  if (fs.existsSync(file)) {
    const m = readManifest(dir);
    assertMovementBinding(m, args, 'Existing run movement binding');
    if (requestedVersion !== undefined && requestedVersion !== catalogVersion(m)) throw new Error('Existing run catalog differs');
    if (digest(taskDesignFields(m)) !== digest(requestedTaskDesign(args, catalogVersion(m)))) throw new Error('Existing run task design differs');
    if (digest(m.profileSelection) !== digest(profileSelection) || digest(m.seeds) !== digest(args.seeds)
      || CONDITIONS.some(c => path.resolve(args.snapshotFilePaths[c]) !== m.snapshots[c].filePath)) throw new Error('Existing run configuration differs');
    return refresh(m);
  }
  const schemaVersion = requestedVersion ?? 'persona-traits-v2', catalog = getCatalog(schemaVersion);
  const task = requestedTaskDesign(args, schemaVersion), goalCounts = task.taskDesign?.goalCounts ?? { low: 2, high: 5 };
  const spec = schemaVersion === 'persona-traits-v1' ? previousSpec : currentSpec;
  const profiles = profileMap(profileSelection, schemaVersion), personaIds = Object.keys(profiles);
  const snapshots = Object.fromEntries(CONDITIONS.map(condition => {
    const filePath = path.resolve(args.snapshotFilePaths[condition]), snapshot = read(filePath), validation = validateMarketReplaySnapshot(snapshot);
    if (!validation.valid) throw new Error(`Invalid ${condition} snapshot: ${validation.errors.join('; ')}`);
    if (snapshot.config.objectives.length !== goalCounts[condition]) throw new Error(`${condition} snapshot requires ${goalCounts[condition]} goals`);
    if (condition === 'high' && !snapshot.config.objectives.some(g => g.quantity > 1)) throw new Error('High snapshot requires a quantity greater than one');
    return [condition, { filePath, snapshotId: snapshot.snapshotId, sha256: fileHash(filePath) }];
  }));
  const v = versions();
  const slots = CONDITIONS.flatMap(condition => args.seeds.flatMap((seed, index) => personaIds.map(personaId => ({
    condition, seed, personaId, tracePath: path.join(dir, 'traces', condition, seedDirectory(seed, index), `${personaId}.json`),
    snapshotId: snapshots[condition].snapshotId, ...v, ...movement, personaVersion: profiles[personaId].persona.version, traceId: null, exists: false,
  }))));
  const baseIds = [...new Set(Object.values(profiles).map(p => p.basePersonaId))];
  const m = { schema: 'oneuldo.persona-fidelity-run', version: 3, validationMode: 'traits', runId: args.runId, runDirectory: dir, ...movement, ...task,
    snapshots, seeds: args.seeds, personaIds, profileSelection, profiles, slots, versions: v, specHash: digest(spec), specVersion: spec.version, analysisVersion: spec.analysisVersion, ...(schemaVersion === 'persona-traits-v2' ? { catalogSchemaVersion: schemaVersion } : {}), catalogHash: digest(catalog),
    baseHashes: Object.fromEntries(baseIds.map(id => [id, fileHash(path.join(__dirname, '../../personas', `${id}.json`))])), fixtureOnly: false };
  m.opportunityAudit = require('./personaValidationOpportunity.cjs').auditManifestSnapshots(m);
  m.opportunityAuditHash = digest(m.opportunityAudit);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); write(file, m); return refresh(m);
}
function lookupValidationSlot(args, snapshot) {
  if (!args.outputPath || ['trialFile', 'learnerFile', 'tabId', 'arm', 'jobFilePath', 'generationFilePath'].some(k => args[k] !== undefined)
    || !args.attentionExperience || digest(args.attentionExperience) !== digest({ visit: 'first-play' })) throw new Error('Trait profiles require a first-play validation slot without learner or app');
  const directory = path.dirname(path.dirname(path.dirname(path.dirname(path.resolve(args.outputPath)))));
  const m = readManifest(directory), slot = m.slots.find(s => s.tracePath === path.resolve(args.outputPath));
  assertMovementBinding(m, args, 'Validation request movement binding');
  if (!slot || slot.personaId !== args.personaId || String(slot.seed) !== String(args.seed) || slot.snapshotId !== snapshot.snapshotId
    || fs.existsSync(slot.tracePath) || digest(snapshot) !== digest(read(m.snapshots[slot.condition].filePath))) throw new Error('Trait profile slot binding mismatch');
  return { ...slot, persona: structuredClone(m.profiles[slot.personaId].persona), validationRunDirectory: directory };
}
function load(m, { allowFixture = false } = {}) {
  assertManifest(m);
  const spec = specFor(m);
  const { extractUniversal } = require('./personaValidationMetrics.cjs'), { flagsForTrace } = require('./personaValidationFlags.cjs');
  const samples = [], missing = [];
  for (const slot of m.slots) {
    if (!fs.existsSync(slot.tracePath)) { if (slot.traceId) throw new Error('Recorded trace removed'); missing.push(slot); continue; }
    const paths = evidencePaths(slot), trace = read(slot.tracePath), snapshot = read(m.snapshots[slot.condition].filePath);
    const profile = m.profiles[slot.personaId], persona = profile.persona, fixture = trace.generationPolicy === 'stochastic';
    if (fixture && m.movementValidationVersion) throw new Error('Validation movement evidence cannot use stochastic fixtures');
    if (fixture && !allowFixture) throw new Error('Stochastic trace cannot be validation evidence');
    if (trace.personaId !== slot.personaId || String(trace.seed) !== String(slot.seed) || trace.personaVersion !== persona.version
      || trace.target?.snapshotId !== slot.snapshotId || slot.traceId && trace.traceId !== slot.traceId) throw new Error('Mixed trace identity or persona version');
    const audit = fs.existsSync(paths.knowledgeAudit) ? read(paths.knowledgeAudit) : null;
    const actorDecisions = fs.existsSync(paths.actorDecisions) ? read(paths.actorDecisions) : null;
    const personaReview = fs.existsSync(paths.personaReview) ? read(paths.personaReview) : null;
    const bundle = fs.existsSync(paths.bundle) ? read(paths.bundle) : null;
    if (!fixture) {
      assertMovementEvidence(m, { trace, bundle, audit });
      if (trace.experienceMode !== 'first-play' || trace.generationPolicy !== 'llm'
        || trace.generation?.actorPolicyVersion !== m.versions.policyVersion || trace.generation?.model !== m.versions.model
        || trace.generation?.learnerIdentity || trace.generation?.trialBinding) throw new Error('Mixed policy/model/experience');
      if (!audit || !bundle || audit.candidateVersion !== m.versions.candidateVersion || bundle.bundleVersion !== m.versions.bundleVersion
        || trace.traceId !== marketReplayTraceId(trace) || audit.traceId !== trace.traceId || audit.requestId !== bundle.requestId || audit.inputHash !== bundle.inputHash
        || audit.policyVersion !== m.versions.policyVersion || bundle.policyVersion !== m.versions.policyVersion || bundle.model !== m.versions.model
        || bundle.snapshotId !== slot.snapshotId || bundle.persona?.id !== slot.personaId || bundle.persona?.version !== persona.version
        || String(bundle.seed) !== String(slot.seed)) throw new Error('Mixed or altered whole-trace evidence');
      if (!fs.existsSync(paths.snapshot) || digest(read(paths.snapshot)) !== digest(snapshot)) throw new Error('Mixed saved snapshot');
      if (bundle.persona?.behavior?.source?.promptHash !== crypto.createHash('sha256').update(persona.prompt).digest('hex')) throw new Error('Mixed persona prompt');
      if (personaReview && (personaReview.traceId !== trace.traceId || personaReview.requestId !== bundle.requestId || personaReview.knowledgeAuditHash !== digest(audit))) throw new Error('Mixed persona review');
      if (actorDecisions && !Array.isArray(actorDecisions) && actorDecisions.traceId && actorDecisions.traceId !== trace.traceId) throw new Error('Mixed actor decisions');
    }
    observeSlot(slot, m);
    const evidenceAudit = audit ?? (actorDecisions ? { decisions: Array.isArray(actorDecisions) ? actorDecisions : actorDecisions.decisions ?? [] } : null);
    const evidence = { actorDecisions, personaReview, ...(m.analysisVersion === 2 || m.movementValidationVersion ? { bundle } : {}) };
    const extracted = extractUniversal(trace, snapshot, persona, evidenceAudit, evidence, { analysisVersion: m.analysisVersion,
      ...(spec.positionStability?.enabled ? { opportunityRows: true } : {}),
      ...(m.movementValidationVersion && m.analysisVersion === 2 ? { routeOpportunityVersion: 'continuous-route-v1' } : {}) });
    const movement = m.movementValidationVersion && m.analysisVersion !== 2 ? extractUniversal(trace, snapshot, persona,
      evidenceAudit, evidence, { analysisVersion: 2, routeOpportunityVersion: 'continuous-route-v1' }) : null;
    samples.push({ ...slot, trace, snapshot, persona, profile, audit: evidenceAudit, actorDecisions, personaReview, ...extracted,
      ...(movement ? { movementOpportunities: { version: 'continuous-route-v1', descriptiveOnly: true,
        metrics: movement.metrics, coverage: movement.coverage } } : {}),
      flags: flagsForTrace(trace, snapshot, evidenceAudit, persona, evidence, spec.patterns), fixture,
      evidenceSources: Object.fromEntries(Object.entries(paths).filter(([, file]) => fs.existsSync(file))) });
  }
  if (new Set(samples.map(s => s.fixture)).size > 1) throw new Error('Fixture and whole-trace samples cannot be mixed');
  return { samples, missing };
}
/** A contrast isolates one configured trait. Preset groups remain descriptive. */
function matchedContrasts(profiles, schemaVersion) {
  const contrasts = [], rows = Object.values(profiles).filter(p => p.traits);
  const TRAITS = getTraitKeys(schemaVersion ?? rows.find(p => p.persona?.traitProfile)?.persona.traitProfile.schemaVersion
    ?? (rows.some(p => Object.hasOwn(p.traits, 'initialCaution')) ? 'persona-traits-v2' : 'persona-traits-v1'));
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    const changed = TRAITS.filter(key => a.traits[key] !== b.traits[key]);
    if (a.contextHash !== b.contextHash || changed.length !== 1) continue;
    const traitKey = changed[0], [higher, lower] = LEVEL[a.traits[traitKey]] > LEVEL[b.traits[traitKey]] ? [a, b] : [b, a];
    contrasts.push({ id: `${traitKey}:${higher.id}:${lower.id}`, traitKey, higherProfileId: higher.id, lowerProfileId: lower.id,
      higherLevel: higher.traits[traitKey], lowerLevel: lower.traits[traitKey], contextHash: a.contextHash });
  }
  return contrasts;
}
/** Each trait-omitted baseline pairs with every trait profile sharing its unchanged context. Descriptive only. */
function baselineContrasts(profiles) {
  const rows = Object.values(profiles);
  return rows.filter(p => p.traits === null).flatMap(baseline => rows.filter(p => p.traits && p.contextHash === baseline.contextHash)
    .map(p => ({ id: `baseline:${baseline.id}:${p.id}`, baselineProfileId: baseline.id, profileId: p.id, contextHash: p.contextHash, traits: p.traits })));
}
function firstPlayDiagnostics(rows, spec) {
  const warnings = [];
  for (const condition of CONDITIONS) for (const metric of spec.metrics.filter(rule =>
    ['initialCaution', 'operationLearning', 'routeReliance', 'textCueLoad'].includes(rule.traitKey))) {
    const observed = rows.filter(row => row.condition === condition && row.metrics?.[metric.kind]?.status === 'measured'
      && row.metrics[metric.kind].denominator > 0 && Number.isFinite(row.metrics[metric.kind].value));
    if (observed.length < 2 || new Set(observed.map(row => row.metrics[metric.kind].value)).size !== 1) continue;
    warnings.push({ code: 'zero-first-play-trait-variance', severity: 'info', condition, traitKey: metric.traitKey, kind: metric.kind,
      value: observed[0].metrics[metric.kind].value, descriptiveOnly: true, usedForPrimaryDecision: false,
      interpretation: '같은 인물·조건의 관찰 기회가 있는 trace에서 값이 같다. 변동 진단이며 성향 판정이나 행동 의무가 아니다.',
      traces: observed.map(row => ({ tracePath: row.tracePath, seed: row.seed, stepIds: row.metrics[metric.kind].evidence })) });
  }
  return warnings;
}
function summarizeFlags(samples, ids, spec = previousSpec) {
  const { collectionDiagnostics, collectionFindings } = require('./personaValidationFlags.cjs');
  const prohibited = new Set(['same-wrong-choice-after-feedback', 'role-or-disability-mentioned']);
  return Object.fromEntries(ids.map(id => {
    const rows = samples.filter(s => s.personaId === id), flagged = rows.filter(s => s.flags.length);
    const diagnostics = collectionDiagnostics(rows), findings = collectionFindings(rows, spec.patterns);
    // Help use, accuracy and equal counts require interpretation, not a personality penalty.
    const violationRows = rows.filter(s => s.flags.some(f => prohibited.has(f.code)));
    const reviewSignals = rows.flatMap(s => s.flags.filter(f => !prohibited.has(f.code)).map(f => ({ ...f, tracePath: s.tracePath })));
    const unavailable = diagnostics.some(d => d.errorCount === null || d.interestCount === null);
    return [id, { traces: rows.length, flaggedTraces: flagged.length, flagRate: rows.length ? flagged.length / rows.length : null,
      scope: 'prohibited-patterns', violationTraces: violationRows.length,
      violationRate: rows.length ? violationRows.length / rows.length : null,
      status: !rows.length ? 'insufficient' : violationRows.length / rows.length > (spec.maxFlaggedTraceRate ?? .1) ? 'fail' : unavailable ? 'inconclusive' : 'pass',
      diagnosticWarnings: [...findings, ...(spec.analysisVersion === 2 ? firstPlayDiagnostics(rows, spec) : [])], reviewSignals, collectionViolations: [], collectionDiagnostics: diagnostics,
      evidence: rows.flatMap(s => s.flags.map(f => ({ ...f, tracePath: s.tracePath }))) }];
  }));
}
function measure({ runDirectory, allowFixture = false }) {
  const m = readManifest(runDirectory), { samples, missing } = load(m, { allowFixture });
  const spec = specFor(m), TRAITS = getTraitKeys(catalogVersion(m));
  const { cliffsDelta, bootstrap, judge } = require('./personaValidationStatistics.cjs');
  const contrasts = matchedContrasts(m.profiles, catalogVersion(m)), findings = [];
  const byKey = new Map(samples.map(s => [`${s.condition}:${String(s.seed)}:${s.personaId}`, s]));
  for (const contrast of contrasts) for (const metric of spec.metrics.filter(rule => rule.traitKey === contrast.traitKey)) for (const condition of CONDITIONS) {
    if (metric.applies !== 'both' && metric.applies !== condition) continue;
    const pairs = [], evidence = []; let missingPairs = 0, unexercised = 0;
    for (const seed of m.seeds) {
      const high = byKey.get(`${condition}:${String(seed)}:${contrast.higherProfileId}`), low = byKey.get(`${condition}:${String(seed)}:${contrast.lowerProfileId}`);
      if (!high || !low) { missingPairs++; continue; }
      const a = high.metrics[metric.kind], b = low.metrics[metric.kind];
      if (a?.status !== 'measured' || b?.status !== 'measured') { unexercised++; continue; }
      pairs.push([a.value, b.value]);
      evidence.push({ seed, higher: { tracePath: high.tracePath, ...a }, lower: { tracePath: low.tracePath, ...b } });
    }
    const delta = cliffsDelta(pairs.map(p => p[0]), pairs.map(p => p[1]));
    const interval = bootstrap(pairs, `${m.runId}:${contrast.id}:${metric.id}:${condition}`, spec.bootstrapReplicates);
    const status = !pairs.length && !missingPairs && unexercised ? 'unexercised'
      : judge(delta, interval, metric.expectedDirection, spec.minAbsDelta, pairs.length, spec.minValidPairs);
    findings.push({ ...contrast, metricId: metric.id, kind: metric.kind, condition, pairs: pairs.length, missingPairs, unexercised,
      delta, interval, status, estimator: 'two-sample-cliffs-delta', intervalMethod: 'matched-pair-bootstrap',
      evidenceType: metric.evidenceType, evidence });
  }
  const groups = TRAITS.flatMap(traitKey => Object.keys(LEVEL).flatMap(level => CONDITIONS.map(condition => {
    const rows = samples.filter(s => s.condition === condition && s.profile.traits?.[traitKey] === level);
    const kinds = [...new Set(spec.metrics.filter(metric => metric.traitKey === traitKey).map(metric => metric.kind))];
    return { traitKey, level, condition, traces: rows.length, personaIds: [...new Set(rows.map(s => s.personaId))], descriptiveOnly: true,
      metrics: Object.fromEntries(kinds.map(kind => {
        const observed = rows.map(s => s.metrics[kind]).filter(metric => metric?.status === 'measured');
        return [kind, { n: observed.length, unexercised: rows.length - observed.length,
          mean: observed.length ? observed.reduce((n, metric) => n + metric.value, 0) / observed.length : null,
          opportunities: observed.reduce((n, metric) => n + metric.denominator, 0) }];
      })) };
  })));
  const result = { schema: 'oneuldo.persona-trait-measurements', version: 1, runId: m.runId, ...movementOptions(m), ...taskDesignFields(m), specHash: m.specHash, catalogHash: m.catalogHash,
    dataFingerprint: inventory(m), fixtureOnly: samples.some(s => s.fixture), completed: samples.length, missing: missing.length,
    contrasts, findings, groups, flags: summarizeFlags(samples, m.personaIds, spec),
    unmatchedTraits: TRAITS.filter(key => !contrasts.some(c => c.traitKey === key)),
    perTrace: samples.map(s => ({ personaId: s.personaId, presetId: s.profile.presetId, traits: s.profile.traits, ...traitModeOf(s.profile), condition: s.condition,
      seed: s.seed, tracePath: s.tracePath, metrics: s.metrics, outcome: s.outcome, coverage: s.coverage,
      terminationReview: s.terminationReview, annotationReview: s.personaReview?.annotationReview ?? null,
      evidenceSources: s.evidenceSources, ...(s.movementOpportunities ? { movementOpportunities: s.movementOpportunities } : {}) })),
    missingSlots: missing.map(s => ({ personaId: s.personaId, condition: s.condition, seed: s.seed, tracePath: s.tracePath })) };
  const readiness = require('./personaValidationReadiness.cjs').fromManifest(m, { samples });
  if (m.analysisVersion >= 1) Object.assign(result, analysis.readinessFields(readiness, findings, samples),
    { opportunityAudit: m.opportunityAudit, powerWarning: powerWarning(m.seeds), analysisVersion: m.analysisVersion, specVersion: m.specVersion },
    analysis.analyze(m, samples, findings, spec, { contrasts, baselineContrasts: baselineContrasts(m.profiles) }));
  m.fixtureOnly = result.fixtureOnly; if (writableManifest(m)) write(manifestAt(m.runDirectory), m);
  const measurementsPath = path.join(m.runDirectory, 'measurements.json');
  if (m.movementValidationVersion || !preserveMeasurement(m, measurementsPath, result)) write(measurementsPath, result);
  return { validationMode: 'traits', ...taskDesignFields(m), readiness: readiness.readiness, readinessReasons: readiness.reasons, measurementsPath, completed: result.completed, missing: result.missing,
    comparisons: contrasts.length, unmatchedTraits: result.unmatchedTraits, fixtureOnly: result.fixtureOnly };
}
function readBlind(m) {
  const saved = read(path.join(m.runDirectory, 'blind-state.json'));
  if (saved.dataFingerprint !== inventory(m)) throw new Error('Blind sample set changed; use a separate run');
  for (const [file, hash] of Object.entries(saved.hashes)) if (fileHash(path.join(m.runDirectory, file)) !== hash) throw new Error('Blind evidence changed');
  return saved;
}
function prepareBlind({ runDirectory, allowFixture = false, panel = 'A', reviewerId, reviewerKind }) {
  const m = readManifest(runDirectory), catalog = getCatalog(catalogVersion(m)), TRAITS = getTraitKeys(catalogVersion(m));
  if (!['A', 'B'].includes(panel)) throw new Error('Expected blind panel A or B');
  reviewers.assertPanelReady({ runDirectory: m.runDirectory, panel, reviewerId, reviewerKind });
  const statePath = path.join(m.runDirectory, 'blind-state.json'); let state;
  if (fs.existsSync(statePath)) state = readBlind(m);
  else {
    const { samples } = load(m, { allowFixture }); if (!samples.length) throw new Error('No saved traces for blind review');
    const built = require('./personaValidationBlind.cjs').buildTraits(samples, Object.values(m.profiles), catalog);
    const files = { 'blind-bundle.json': built.bundle, 'blind-key.json': built.key,
      'blind-rubric.json': { traitRubric: built.traitRubric, publicStyles: built.publicStyles } };
    for (const [file, value] of Object.entries(files)) write(path.join(m.runDirectory, file), value);
    state = { dataFingerprint: inventory(m), fixtureOnly: samples.some(s => s.fixture),
      hashes: Object.fromEntries(Object.keys(files).map(file => [file, fileHash(path.join(m.runDirectory, file))])),
      ...(baselineIds(m).length ? { excludedBaselineTraces: built.excludedBaselineTraces } : {}) };
    write(statePath, state); if (writableManifest(m)) write(manifestAt(m.runDirectory), m);
  }
  if (state.fixtureOnly && !allowFixture) throw new Error('Stochastic trace cannot be validation evidence');
  const bundle = { panels: { [panel]: read(path.join(m.runDirectory, 'blind-bundle.json')).panels[panel] } };
  require('./personaValidationBlind.cjs').assertAnonymous(bundle, Object.values(m.profiles));
  const bundlePath = path.join(m.runDirectory, `blind-${panel}.json`); write(bundlePath, bundle);
  return { validationMode: 'traits', reviewerId: reviewerId ?? null, reviewerKind: reviewerKind ?? null, panel, bundlePath, bundle, ...read(path.join(m.runDirectory, 'blind-rubric.json')),
    answerFormat: { traits: Object.fromEntries(TRAITS.map(key => [key, 'low|medium|high|unknown'])), confidence: 'optional 0..1' }, fixtureOnly: state.fixtureOnly,
    excludedBaselineTraces: state.excludedBaselineTraces ?? 0 };
}
function submitBlind({ runDirectory, panel, answers, reviewerId, reviewerKind, reviewerModel, reviewerSession }) {
  const m = readManifest(runDirectory), state = readBlind(m), TRAITS = getTraitKeys(catalogVersion(m));
  return reviewers.submitReview({ runDirectory: m.runDirectory, panel, answers, reviewerId, reviewerKind, reviewerModel, reviewerSession,
    state, key: read(path.join(m.runDirectory, 'blind-key.json')), validationMode: 'traits', traitKeys: TRAITS });
}
function summarizeTraitFindings(findings, { firstPlay = false } = {}) {
  const summarize = rows => {
    const exercised = rows.filter(f => f.status !== 'unexercised');
    const status = !rows.length ? 'unmatched' : !exercised.length ? 'unexercised'
      : rows.some(f => f.status === 'insufficient') ? 'insufficient'
      : rows.some(f => f.status === 'unexercised') ? 'partial'
      : rows.every(f => f.status === 'pass') ? 'supported'
      : rows.every(f => f.status === 'fail') ? 'contradicted' : firstPlay ? 'partial' : 'inconclusive';
    return { status, expectedComparisons: rows.length, exercisedComparisons: exercised.length, findings: rows };
  };
  const behavioralEvidence = summarize(findings.filter(f => f.evidenceType !== 'authored-timing'));
  const authoredTiming = summarize(findings.filter(f => f.evidenceType === 'authored-timing'));
  return { status: behavioralEvidence.status, primaryEvidence: 'behavioralEvidence', behavioralEvidence,
    authoredTiming: { ...authoredTiming, note: '작성된 지연시간은 행동 근거의 부족을 보충하거나 성향 판정을 통과시키지 않는다.' }, findings };
}
function report({ runDirectory }) {
  const m = readManifest(runDirectory), TRAITS = getTraitKeys(catalogVersion(m)), measurements = read(path.join(m.runDirectory, 'measurements.json'));
  if (measurements.dataFingerprint !== inventory(m)) throw new Error('Measurements are stale; call measure_persona_validation again');
  const file = path.join(m.runDirectory, 'blind-review.json'), review = fs.existsSync(file) ? read(file) : null;
  if (review && review.dataFingerprint !== readBlind(m).dataFingerprint) throw new Error('Blind review does not match measurements');
  const traitResults = Object.fromEntries(TRAITS.map(key =>
    [key, summarizeTraitFindings(measurements.findings.filter(f => f.traitKey === key), {
      firstPlay: m.analysisVersion === 2 && ['initialCaution', 'operationLearning', 'routeReliance', 'textCueLoad'].includes(key),
    })]));
  const output = { schema: 'oneuldo.persona-trait-report', version: 1, runId: m.runId, validationMode: 'traits',
    ...movementReportFields(m, measurements.perTrace), ...taskDesignFields(m), fixtureOnly: measurements.fixtureOnly,
    completed: measurements.completed, required: m.slots.length, specHash: m.specHash, catalogHash: m.catalogHash, dataFingerprint: measurements.dataFingerprint,
    profiles: Object.values(m.profiles).map(p => ({ id: p.id, basePersonaId: p.basePersonaId, presetId: p.presetId, traits: p.traits, ...traitModeOf(p), contextHash: p.contextHash })),
    axes: {
      technical: { savedValidTraces: measurements.completed, missingSlots: measurements.missing,
        note: 'Missing slots include unattempted or failed requests; saved trace validity does not imply task success or actual app execution.' },
      taskOutcomes: measurements.perTrace.map(s => ({ personaId: s.personaId, condition: s.condition, seed: s.seed, tracePath: s.tracePath, ...s.outcome, terminationReview: s.terminationReview })),
      traitExpression: traitResults,
      coverage: measurements.perTrace.map(s => ({ personaId: s.personaId, condition: s.condition, seed: s.seed, ...s.coverage })),
    },
    annotationReviews: measurements.perTrace.map(s => ({ personaId: s.personaId, condition: s.condition, seed: s.seed,
      tracePath: s.tracePath, review: s.annotationReview ?? null })),
    groups: measurements.groups, flags: measurements.flags, blindReview: review?.scores ?? null,
    blindReviewer: { model: review?.reviewerModel ?? null, session: review?.reviewerSession ?? null, independenceVerified: false, keyIsolationVerified: false },
    limitations: [
      '성향 수준과 유형은 합성 설계값이며 심리검사 점수나 임상적 타당성을 의미하지 않는다.',
      `성향 비교는 인지·취향·경험 문맥과 나머지 ${TRAITS.length === 5 ? '네' : '여덟'} 성향이 같은 프로필 쌍만 사용한다. 유형별 집계는 설명적 결과다.`,
      ...(m.analysisVersion === 2 ? [
        '연구 근거로 설계한 첫 플레이 성향이 수준대로 행동에 나타나는지를 본 것이며, 실제 지적장애인과의 유사성을 입증하지 않는다.',
        '블라인드 패널은 원관측 상품 정보와 이동 선택지 메뉴를 포함하지 않으므로 동선 고수·글자 단서 부담을 unknown으로 남겨야 할 수 있다.',
        '기존 지표와 선언된 불확실성만으로 겹치는 새 기회는 점수로 환산하지 않고 제외한다. 관찰 필드 누락·제외 이유와 step ID는 coverage와 measurements.json에 남긴다.',
      ] : []),
      '같은 조건·seed는 실험 묶음이며 native 모델 출력의 결정적 재현을 보장하지 않는다. 유효 쌍 수는 생성 슬롯 수와 다르다.',
      '기회에 도달하지 못한 표본은 조건부 비교에서 제외되므로 도달 기회·중단·전체 목표 달성도 함께 읽어야 한다.',
      '관심·불확실성 의도는 일부 배우 선언을 사용한다. 대기시간은 계획한 값이며 사람의 반응시간이 아니다.',
      '성향 판정은 행동 근거만 사용한다. 작성된 시간은 별도로 보고하며 일부 비교에서 기회가 없으면 partial로 남긴다.',
      '주석 정합성 검토는 성향·과업 판정과 별도다. 검토가 없는 과거 표본은 null이며 clear로 해석하지 않는다.',
      '효과 크기는 두 집단의 Cliff’s delta이며 신뢰구간만 조건·seed 쌍을 함께 재표집한다. 수준 간 간격과 0.33 기준은 실측으로 보정하지 않은 설계값이다.',
      'A/B는 같은 표본이며 독립 반복이 아니다. 판별자 독립성과 정답 키 미열람은 자기 신고이고, unknown은 정답으로 세지 않는다.',
      '계획 검증은 실제 앱 재생이나 실제 사람의 행동 검증을 수행하지 않는다. 미발생·자료 부족은 통과가 아니다.',
    ] };
  if (fs.existsSync(path.join(m.runDirectory, 'blind-reviews.json'))) readBlind(m);
  const statePath = path.join(m.runDirectory, 'blind-state.json');
  if (baselineIds(m).length) Object.assign(output, { baselineProfileIds: baselineIds(m), baselineContrasts: baselineContrasts(m.profiles),
    excludedBaselineTraces: fs.existsSync(statePath) ? read(statePath).excludedBaselineTraces ?? 0 : null });
  Object.assign(output, analysis.reportFields(measurements), { referenceComparison: null },
    reviewers.summarizeReviews({ runDirectory: m.runDirectory, dataFingerprint: measurements.dataFingerprint,
      validationMode: 'traits', traitKeys: TRAITS }));
  const preserved = m.movementValidationVersion ? null : historicalReport(m, measurements);
  if (preserved) return { validationMode: 'traits', ...preserved };
  const reportPath = path.join(m.runDirectory, 'report.json'), markdownPath = path.join(m.runDirectory, 'report.ko.md');
  write(reportPath, output);
  const lines = ['# 공통 성향 검증 보고서', ...analysis.readinessMarkdown(output), '', `Run: ${m.runId}. 저장 trace ${output.completed}/${output.required}.`,
    ...(m.taskDesign ? [`과제 설계: low 목표 ${m.taskDesign.goalCounts.low}개 / high 목표 ${m.taskDesign.goalCounts.high}개 (${m.taskDesign.version}, hash ${m.taskDesignHash}). 관찰 기회 발생을 보장하지 않는다.`] : []),
    output.fixtureOnly ? '테스트 fixture 파이프라인 확인용이며 페르소나 검증 결과가 아님.' : 'whole-trace-v3 계획 표본.', '',
    ...movementMarkdown(output), '## 과업 결과와 종료', '', '| 인물 | 조건 | 목표 충족 | 시도 | 종료 | 종료 검토 |', '| --- | --- | ---: | ---: | --- | --- |',
    ...output.axes.taskOutcomes.map(s => `| ${s.personaId} | ${s.condition} | ${s.completedGoalCount}/${s.goalCount} | ${s.attemptedGoalCount}/${s.goalCount} | ${s.ending} | ${s.terminationReview?.status ?? 'unknown'} |`),
    '', '## 공통 성향', '', ...Object.entries(traitResults).map(([key, result]) => `- ${key}: ${result.status}; 행동 비교 관찰 ${result.behavioralEvidence.exercisedComparisons}/${result.behavioralEvidence.expectedComparisons}건; 작성 시간 ${result.authoredTiming.status} (성향 판정 제외)`),
    '', '| 성향 | 높은 프로필 / 낮은 프로필 | 지표 | 근거 | 조건 | 유효 쌍 | 미발생 | 누락 | 효과 크기 | 95% 구간 | 판정 |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...measurements.findings.map(f => `| ${f.traitKey} | ${f.higherProfileId} (${f.higherLevel}) / ${f.lowerProfileId} (${f.lowerLevel}) | ${f.kind} | ${f.evidenceType} | ${f.condition} | ${f.pairs} | ${f.unexercised} | ${f.missingPairs} | ${f.delta ?? '—'} | ${f.interval?.join(' ~ ') ?? '—'} | ${f.status} |`),
    ...(m.analysisVersion === 2 ? ['', '## 관찰 기회 커버리지', '',
      '| 인물 | 조건 | seed | 지표 | 기회 수 | 상태 | 관찰 불가 이유 |', '| --- | --- | --- | --- | ---: | --- | --- |',
      ...measurements.perTrace.flatMap(row => Object.entries(row.coverage).map(([kind, coverage]) =>
        `| ${row.personaId} | ${row.condition} | ${row.seed} | ${kind} | ${coverage.opportunityCount} | ${coverage.status} | ${coverage.reason ?? coverage.exclusionReason ?? '—'} |`))] : []),
    '', '## 과장 패턴과 진단 경고', '', ...Object.entries(output.flags).map(([id, f]) => `- ${id}: 금지 패턴 ${f.status}, 위반 ${f.violationTraces}/${f.traces}, 검토 신호 ${f.reviewSignals.length}건, 분포 진단 ${f.diagnosticWarnings.length}건. 도움·낮은 정확도·분산 0은 자동 실패가 아니다.`),
    ...(m.analysisVersion === 2 ? Object.entries(output.flags).flatMap(([id, f]) => f.diagnosticWarnings
      .filter(w => w.code === 'zero-first-play-trait-variance').map(w =>
        `- ${id} / ${w.condition} / ${w.traitKey}: 값 ${w.value} 동일(판정 제외). ${w.traces.map(t => `seed=${t.seed}, step=${t.stepIds.join(', ') || '없음'}`).join('; ')}`)) : []),
    '', '## 행동·focus 주석 정합성', '', ...output.annotationReviews.flatMap(row => [
      `- ${row.personaId} (${row.condition}, seed=${row.seed}): ${row.review?.status ?? 'not-recorded'}; 경고 ${row.review?.findings.length ?? '미기록'}건`,
      ...(row.review?.findings ?? []).map(f => `  - ${f.code}, 결정 ${f.decisionIndexes.join(', ')}: ${f.improvementTarget}. ${f.recommendation}`),
    ]),
    '', '## 블라인드 성향 추정', '', `개인 이름 대신 ${TRAITS.length === 5 ? '다섯' : '아홉'} 성향의 수준을 추정한다. unknown을 포함한 정확도와 판별 비율을 함께 보고한다.`,
    ...(output.baselineProfileIds ? ['', `기준 프로필(성향 지침 생략) ${output.baselineProfileIds.join(', ')}의 trace는 성향 수준이 없으므로 블라인드 묶음과 정답 키에서 제외했다: ${output.excludedBaselineTraces ?? '블라인드 미준비'}건.`] : []),
    '', '기존 단일 판별자 점수이며 명시 ID 판별자 점수는 다음 표에 표시한다.', '', '```json', JSON.stringify(output.blindReview, null, 2), '```', ...analysis.blindMarkdown(output), ...analysis.supplementaryMarkdown(output),
    ...require('./personaValidationPosition.cjs').positionMarkdown(output), ...require('./personaValidationBaseline.cjs').baselineMarkdown(output), '', '## 해석 범위', '', ...output.limitations.map(x => `- ${x}`),
    '', '분자·분모·관찰 기회·step ID·프로필별 설명적 집계는 measurements.json 및 report.json에 저장되어 있다.', ''];
  fs.writeFileSync(markdownPath, lines.join('\n'), { mode: 0o600 });
  return { validationMode: 'traits', ...taskDesignFields(m), readiness: output.readiness, readinessReasons: output.readinessReasons, reportPath, markdownPath, completed: output.completed, required: output.required, fixtureOnly: output.fixtureOnly };
}
module.exports = { prepare, refresh, readManifest, lookupValidationSlot, load, measure, prepareBlind, submitBlind, report, matchedContrasts, baselineContrasts, summarizeTraitFindings, summarizeFlags };
